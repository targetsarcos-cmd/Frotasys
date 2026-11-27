'use strict';
const fs = require('node:fs');
const path = require('node:path');
const shell = fs.readFileSync(path.join(__dirname, 'workspace-shell.html'), 'utf8');

module.exports = function renderWorkspace(html, { editable = false, production = false } = {}) {
  return html.replace('</head>', '<link rel="stylesheet" href="/css/workspace-reference.css"><link rel="stylesheet" href="/css/workspace-beta.css"></head>')
    .replace('<body>', '<body class="workspace-beta" data-beta-mode="' + (editable ? 'editable' : 'readonly') + '" data-workspace-runtime="' + (production ? 'production' : 'pilot') + '"><div id="beta-shell">' + shell + '</div>')
    .replace('</body>', '<script src="/js/workspace-trip-sections.js"></script><script src="/js/workspace-comments.js"></script><script src="/js/workspace-table-layout.js"></script><script src="/js/workspace-beta.js"></script><script src="/js/workspace-fretes.js"></script><script src="/js/beta-reports-bridge.js"></script></body>');
};
