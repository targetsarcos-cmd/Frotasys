/* The operational section is derived from the invoice and completion status. */
(function(root) {
  'use strict';
  function hasInvoice(trip) {
    return String(trip?.nota ?? '').trim() !== '';
  }
  function classify(trip) {
    const status = String(trip?.status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    if (status === 'CONCLUIDO') return 'concluidos';
    return hasInvoice(trip) ? 'arcos' : 'agenciando';
  }
  const api = { hasInvoice, classify };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FrotasysBetaTripSections = api;
})(typeof globalThis === 'object' ? globalThis : this);
