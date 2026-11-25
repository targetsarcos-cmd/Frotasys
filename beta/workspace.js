'use strict';
module.exports = function renderWorkspace(html) {
  const rail = `<nav class="workspace-nav" aria-label="Programa&ccedil;&atilde;o de viagens">
    <img src="/img/frotasys-logo.png" alt="Frotasys">
    <a href="#workspace-faturado">Faturado</a>
    <a href="#workspace-agenciado">Agenciado</a>
    <a href="#summary-arcos">Resumo consolidado</a>
    <small>Beta &middot; Somente leitura</small>
  </nav>`;
  return html.replace('</head>', '<link rel="stylesheet" href="/css/workspace-beta.css"></head>')
    .replace('<body>', '<body class="workspace-beta">' + rail)
    .replace('<h2>Faturado</h2>', '<h2 id="workspace-faturado">Faturado</h2>')
    .replace('<h2>Agenciado</h2>', '<h2 id="workspace-agenciado">Agenciado</h2>');
};
