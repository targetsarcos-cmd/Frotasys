'use strict';
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, 'workspace-shell.html'), 'utf8');

module.exports = function renderWorkspace(html) {
  return html.replace('</head>', '<link rel="stylesheet" href="/css/workspace-reference.css"><link rel="stylesheet" href="/css/workspace-beta.css"></head>')
    .replace('<body>', '<body class="workspace-beta"><div id="beta-shell">' + shell + '</div>')
    .replace('</body>', '<script src="/js/workspace-trip-sections.js"></script><script src="/js/workspace-beta.js"></script></body>');
};
