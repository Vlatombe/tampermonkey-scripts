"use strict";

// ==UserScript==
// @name         GitHub/Jira Links
// @namespace    http://github.com/Vlatombe/tampermonkey-scripts
// @version      0.1
// @description  Generates link to Jira issues from Github
// @author       vlatombe
// @match        https://github.com/**
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.11.2/jquery.min.js
// @require      https://gist.github.com/raw/2625891/waitForKeyElements.js
// run-at       document-end
// @grant        none
// @license      MIT
// ==/UserScript==

function getJiraUrl(issueKey) {
    if (issueKey.startsWith("JENKINS-")) {
        return "https://issues.jenkins.io"
    } else {
        return "https://cloudbees.atlassian.net"
    }
}

function doIt(node) {
    var regex = new RegExp('([A-Z][A-Z0-9]*\-[0-9]+)', 'g');
    var regexNot = new RegExp('([A-Z][A-Z0-9]*\-[0-9]+)"', 'g');
    $(".full-commit>.commit-title, .markdown-title, pre, h1, .comment-body").each(function(k,v) {
        var text = $(this).html()
        var issueKeys = []
        var match = regex.exec(text)
        var matchNot = regexNot.exec(text)
        var currentText = text
        while (match && !matchNot) {
            //console.log(v)
            //console.log(text)
            issueKeys[issueKeys.length] = match[1]
            currentText = currentText.substring(match.lastIndex)
            match = regex.exec(text)
            matchNot = regexNot.exec(text)
        }
        issueKeys.forEach(function(issueKey) {
            text = text.replace(issueKey, '<a href="' + getJiraUrl(issueKey) + '/browse/' + issueKey + '">' + issueKey + "</a>");
        })
        $(this).html(text);
    });
}
waitForKeyElements ("#commits_bucket, .commit-title, .commit-desc, #discussion_bucket, #files_bucket, .subnav", doIt);
