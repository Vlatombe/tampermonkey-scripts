// ==UserScript==
// @name         CloudBees Unify: Run previous/next
// @namespace    http://github.com/Vlatombe/tampermonkey-scripts
// @version      2026.11.19.1005
// @description  Adds previous/next run buttons to CloudBees Unify run details pages
// @author       vlatombe
// @match        https://cloudbees.io/*
// @downloadURL  https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-prev-next.user.js
// @updateURL    https://github.com/Vlatombe/tampermonkey-scripts/raw/main/unify-run-prev-next.user.js
// @run-at       document-idle
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const apiBase = () => (window.__env__ && window.__env__.NX_API_GATEWAY_URL) || 'https://api.cloudbees.io';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  // /<org-domain>[/<subOrgId>]/components/<componentId>/runs/<workflowId>/<runId>[/<attempt>][/<tab>...]
  // Newer UI URLs drop the organization from the path and pass it as ?organizationId= instead.
  const RUN_PATH = new RegExp(
    `^((?:/[^/]+)*?/(?:(${UUID})/)?components/(${UUID})/runs/(${UUID})/)(${UUID})(?:/(\\d+))?(/.*)?$`,
    'i',
  );
  const CONTAINER_ID = 'cb-run-prev-next';

  // runId -> Promise<{ current, prev, next }>
  const cache = new Map();

  function parseLocation() {
    const m = location.pathname.match(RUN_PATH);
    if (!m) return null;
    const orgId = m[2] || new URLSearchParams(location.search).get('organizationId');
    if (!orgId) return null;
    return {
      prefix: m[1],
      orgId,
      componentId: m[3],
      workflowId: m[4],
      runId: m[5],
      attempt: m[6] || '1',
      rest: m[7] || '',
    };
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

  async function loadNeighbours(loc) {
    const details = await api(
      `/v1/organizations/${loc.orgId}/services/${loc.componentId}/automations/${loc.workflowId}/runs/${loc.runId}`,
    );
    const current = Number(details.run.runNumber);
    const wanted = [current - 1, current + 1].filter((n) => n > 0).map(String);
    const search = await api('/v1/search/runs', {
      method: 'POST',
      body: JSON.stringify({
        resourceId: loc.orgId,
        query: {
          query: { query: '*' },
          filters: [
            { field: 'component_id', termList: { terms: [loc.componentId] } },
            { field: 'workflow_id', termList: { terms: [loc.workflowId] } },
            { field: 'run_number', termList: { terms: wanted } },
          ],
          pagination: { base: { pageLength: 10, sort: { fieldName: 'run_number', order: 'DESCENDING' } } },
        },
      }),
    });
    const byNumber = new Map((search.runs || []).map((r) => [Number(r.runNumber), r]));
    return { current, prev: byNumber.get(current - 1), next: byNumber.get(current + 1) };
  }

  function neighbours(loc) {
    if (!cache.has(loc.runId)) {
      const p = loadNeighbours(loc).catch((e) => {
        cache.delete(loc.runId);
        throw e;
      });
      cache.set(loc.runId, p);
    }
    return cache.get(loc.runId);
  }

  function runUrl(loc, run) {
    return `${loc.prefix}${run.id}/${run.runAttempt || 1}${loc.rest}${location.search}${location.hash}`;
  }

  function navigate(url) {
    // Let the SPA router handle it without a full reload.
    history.pushState(history.state, '', url);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }

  function button(loc, run, number, label) {
    const el = document.createElement(run ? 'a' : 'span');
    el.textContent = label;
    el.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'padding:2px 10px',
      'border:1px solid currentColor',
      'border-radius:14px',
      'font-size:12px',
      'line-height:20px',
      'text-decoration:none',
      'color:inherit',
      'white-space:nowrap',
      run ? 'cursor:pointer;opacity:1' : 'cursor:default;opacity:.35',
    ].join(';');
    if (!run) {
      el.title = `Run #${number} not found`;
      return el;
    }
    el.href = runUrl(loc, run);
    const msg = (run.commit?.message || '').split('\n')[0];
    el.title = `#${run.runNumber} · ${run.status}${msg ? ` · ${msg}` : ''}`;
    el.addEventListener('click', (ev) => {
      if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      navigate(el.href);
    });
    return el;
  }

  let rendering = null;

  async function render() {
    const loc = parseLocation();
    const existing = document.getElementById(CONTAINER_ID);
    if (!loc) {
      existing?.remove();
      return;
    }
    if (existing && existing.dataset.runId === loc.runId) return;

    const title = document.querySelector('h1');
    if (!title || !title.parentElement) return;
    if (rendering === loc.runId) return;
    rendering = loc.runId;

    try {
      const { current, prev, next } = await neighbours(loc);
      // Location may have changed while we were waiting.
      if (parseLocation()?.runId !== loc.runId) return;
      const anchor = document.querySelector('h1');
      if (!anchor) return;

      document.getElementById(CONTAINER_ID)?.remove();
      const container = document.createElement('div');
      container.id = CONTAINER_ID;
      container.dataset.runId = loc.runId;
      container.style.cssText = 'display:inline-flex;gap:6px;align-items:center;margin-left:8px';
      container.append(
        button(loc, prev, current - 1, `‹ #${current - 1}`),
        button(loc, next, current + 1, `#${current + 1} ›`),
      );
      if (current <= 1) container.firstChild.remove();
      anchor.insertAdjacentElement('afterend', container);
    } catch (e) {
      console.warn('[cb-run-prev-next]', e);
    } finally {
      if (rendering === loc.runId) rendering = null;
    }
  }

  // The app is a SPA that re-renders the header; keep the buttons in place.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }).observe(document.body, { childList: true, subtree: true });
  render();
})();
