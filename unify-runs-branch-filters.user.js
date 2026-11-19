// ==UserScript==
// @name         CloudBees Unify: Runs branch filters
// @namespace    http://github.com/Vlatombe/tampermonkey-scripts
// @version      2026.11.19.1014
// @description  Adds quick branch filter chips (default, pinned and recent branches) to CloudBees Unify component runs pages
// @author       vlatombe
// @match        https://cloudbees.io/*
// @downloadURL  https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-runs-branch-filters.user.js
// @updateURL    https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-runs-branch-filters.user.js
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const apiBase = () => (window.__env__ && window.__env__.NX_API_GATEWAY_URL) || 'https://api.cloudbees.io';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  // /<org-domain>[/<subOrgId>]/components/<componentId>/runs
  // Newer UI URLs drop the organization from the path and pass it as ?organizationId= instead.
  const RUNS_PATH = new RegExp(`^(?:/[^/]+)*?/(?:(${UUID})/)?components/(${UUID})/runs/?$`, 'i');
  const CONTAINER_ID = 'cb-runs-branch-filters';
  const PARAM = 'branch';
  const RECENT_RUNS = 100;
  const MAX_RECENT = 8;
  const pinsKey = (componentId) => `cb-runs-branch-filters:pins:${componentId}`;

  // componentId -> Promise<{ defaultBranch, recent }>
  const cache = new Map();

  function parseLocation() {
    const m = location.pathname.match(RUNS_PATH);
    if (!m) return null;
    const orgId = m[1] || new URLSearchParams(location.search).get('organizationId');
    if (!orgId) return null;
    return { orgId, componentId: m[2] };
  }

  function accessToken() {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key.startsWith('oidc.user:')) {
        try {
          return JSON.parse(sessionStorage.getItem(key)).access_token;
        } catch (e) {
          // ignore and keep looking
        }
      }
    }
    return null;
  }

  async function api(path, init = {}) {
    const token = accessToken();
    if (!token) throw new Error('no access token');
    const res = await fetch(apiBase() + path, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  async function loadBranches(loc) {
    const [component, search] = await Promise.all([
      api(`/v1/organizations/${loc.orgId}/services/${loc.componentId}`),
      api('/v1/search/runs', {
        method: 'POST',
        body: JSON.stringify({
          resourceId: loc.orgId,
          query: {
            query: { query: '*' },
            filters: [{ field: 'component_id', termList: { terms: [loc.componentId] } }],
            pagination: { base: { pageLength: RECENT_RUNS, sort: { fieldName: 'updated_at', order: 'DESCENDING' } } },
          },
        }),
      }),
    ]);
    const service = component.service || component;
    const recent = [];
    for (const run of search.runs || []) {
      const target = run.automation?.target;
      if (!target || target.type !== 'RESOURCE_TYPE_BRANCH' || run.targetBranchDeleted) continue;
      if (target.name && !recent.includes(target.name)) recent.push(target.name);
    }
    return { defaultBranch: service.defaultBranch || '', recent };
  }

  function branches(loc) {
    if (!cache.has(loc.componentId)) {
      const p = loadBranches(loc).catch((e) => {
        cache.delete(loc.componentId);
        throw e;
      });
      cache.set(loc.componentId, p);
    }
    return cache.get(loc.componentId);
  }

  function readPins(componentId) {
    try {
      const pins = JSON.parse(localStorage.getItem(pinsKey(componentId)) || '[]');
      return Array.isArray(pins) ? pins : [];
    } catch (e) {
      return [];
    }
  }

  function writePins(componentId, pins) {
    localStorage.setItem(pinsKey(componentId), JSON.stringify(pins));
  }

  function filterUrl(branch) {
    const url = new URL(location.href);
    if (branch) url.searchParams.set(PARAM, branch);
    else url.searchParams.delete(PARAM);
    return url.pathname + url.search + url.hash;
  }

  function navigate(url) {
    // Let the SPA router handle it without a full reload.
    history.pushState(history.state, '', url);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }

  const CHIP_CSS = [
    'display:inline-flex',
    'align-items:center',
    'gap:4px',
    'padding:2px 10px',
    'border:1px solid currentColor',
    'border-radius:14px',
    'font-size:12px',
    'line-height:20px',
    'text-decoration:none',
    'color:inherit',
    'white-space:nowrap',
    'cursor:pointer',
    'background:transparent',
    'font-family:inherit',
  ].join(';');

  function chip(label, branch, active, title) {
    const el = document.createElement('a');
    el.href = filterUrl(branch);
    el.textContent = label;
    el.title = title || (branch ? `Show runs of ${branch}` : 'Show runs of all refs');
    el.dataset.branch = branch || '';
    el.style.cssText = CHIP_CSS + (active ? ';background:rgba(127,127,127,.3);font-weight:600' : ';opacity:.8');
    el.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      navigate(el.getAttribute('href'));
    });
    return el;
  }

  function iconButton(label, title, onClick) {
    const el = document.createElement('span');
    el.textContent = label;
    el.title = title;
    el.setAttribute('role', 'button');
    el.style.cssText = 'cursor:pointer;opacity:.6;margin-left:2px';
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return el;
  }

  function separator() {
    const el = document.createElement('span');
    el.style.cssText = 'width:1px;align-self:stretch;background:currentColor;opacity:.3;margin:0 2px';
    return el;
  }

  function build(loc, data) {
    const current = new URLSearchParams(location.search).getAll(PARAM);
    const active = current.length === 1 ? current[0] : null;
    const pins = readPins(loc.componentId);
    const rerender = () => {
      document.getElementById(CONTAINER_ID)?.remove();
      render();
    };

    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.dataset.key = loc.componentId + location.search;
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0';

    const label = document.createElement('span');
    label.textContent = 'Branches:';
    label.style.cssText = 'font-size:12px;opacity:.7;margin-right:2px';
    container.append(label, chip('All', null, current.length === 0));

    const shown = new Set();
    if (data.defaultBranch) {
      container.append(chip(`★ ${data.defaultBranch}`, data.defaultBranch, active === data.defaultBranch, `Default branch ${data.defaultBranch}`));
      shown.add(data.defaultBranch);
    }

    const pinned = pins.filter((b) => !shown.has(b));
    if (pinned.length) container.append(separator());
    for (const b of pinned) {
      const el = chip(`📌 ${b}`, b, active === b, `Pinned branch ${b}`);
      el.append(
        iconButton('×', `Unpin ${b}`, () => {
          writePins(loc.componentId, readPins(loc.componentId).filter((p) => p !== b));
          rerender();
        }),
      );
      container.append(el);
      shown.add(b);
    }

    const recent = data.recent.filter((b) => !shown.has(b)).slice(0, MAX_RECENT);
    // Keep the currently filtered branch visible even if it is neither pinned nor recent.
    if (active && !shown.has(active) && !recent.includes(active)) recent.unshift(active);
    if (recent.length) container.append(separator());
    for (const b of recent) {
      const el = chip(b, b, active === b, `Recently built branch ${b}`);
      el.append(
        iconButton('+', `Pin ${b}`, () => {
          writePins(loc.componentId, [...readPins(loc.componentId).filter((p) => p !== b), b]);
          rerender();
        }),
      );
      container.append(el);
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = '+ Pin branch…';
    add.title = 'Pin a branch by name';
    add.style.cssText = CHIP_CSS + ';border-style:dashed;opacity:.7';
    add.addEventListener('click', () => {
      const name = (prompt('Branch name to pin', active || '') || '').trim();
      if (!name) return;
      writePins(loc.componentId, [...readPins(loc.componentId).filter((p) => p !== name), name]);
      navigate(filterUrl(name));
      rerender();
    });
    container.append(add);
    return container;
  }

  // The toolbar holding the "Filter" button and the search box.
  function toolbar() {
    const filter = document.querySelector('[data-testid="filter-button"]');
    let el = filter;
    while (el && el.parentElement && !el.querySelector('input[type="search"], [role="searchbox"]')) el = el.parentElement;
    return el && el !== document.body ? el : null;
  }

  let rendering = null;

  async function render() {
    const loc = parseLocation();
    const existing = document.getElementById(CONTAINER_ID);
    if (!loc) {
      existing?.remove();
      return;
    }
    const key = loc.componentId + location.search;
    if (existing && existing.dataset.key === key && existing.isConnected) return;
    if (!toolbar()) return;
    if (rendering === key) return;
    rendering = key;

    try {
      const data = await branches(loc);
      // Location may have changed while we were waiting.
      if (parseLocation()?.componentId !== loc.componentId || loc.componentId + location.search !== key) return;
      const anchor = toolbar();
      if (!anchor) return;
      document.getElementById(CONTAINER_ID)?.remove();
      anchor.insertAdjacentElement('afterend', build(loc, data));
    } catch (e) {
      console.warn('[cb-runs-branch-filters]', e);
    } finally {
      if (rendering === key) rendering = null;
    }
  }

  // The app is a SPA that re-renders the page; keep the chips in place.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }).observe(document.body, { childList: true, subtree: true });
  addEventListener('popstate', () => render());
  render();
})();
