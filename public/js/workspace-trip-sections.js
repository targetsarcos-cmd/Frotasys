/* Shared billing rule for the Dashboard and the server. */
(function(root) {
  'use strict';
  const invoiceFields=['nota',...Array.from({length:14},(_,i)=>'nota'+(i+2))];
  const timeFields=['hora_nf',...Array.from({length:14},(_,i)=>'hora_nf'+(i+2))];
  const text=value=>String(value??'').trim();
  const normalized=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const validTime=value=>/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(text(value));
  function hasInvoice(trip={}) {
    return invoiceFields.some(key=>text(trip[key])!=='');
  }
  function hasBillingDocuments(trip={}) {
    return hasInvoice(trip)&&!!text(trip.cte)&&!!text(trip.manifesto)&&
      (normalized(trip.tipo)==='FROTA'||!!text(trip.contrato));
  }
  function hasInvoiceHours(trip={}) {
    return hasInvoice(trip)&&invoiceFields.every((key,i)=>!text(trip[key])||validTime(trip[timeFields[i]]));
  }
  function isBillingReady(trip={}) {
    return hasBillingDocuments(trip)&&hasInvoiceHours(trip);
  }
  function isLegacyCompleted(trip={}) {
    return normalized(trip.status)==='CONCLUIDO'&&trip.billingRuleVersion!==2;
  }
  function isBilled(trip={}) {
    return isBillingReady(trip)||(isLegacyCompleted(trip)&&hasInvoice(trip));
  }
  function classify(trip={}) {
    if(normalized(trip.status)==='CONCLUIDO'&&(isBillingReady(trip)||isLegacyCompleted(trip)))return 'concluidos';
    return isBilled(trip)?'arcos':'agenciando';
  }
  const api={hasInvoice,hasBillingDocuments,hasInvoiceHours,isBillingReady,isLegacyCompleted,isBilled,classify};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysBetaTripSections=api;
})(typeof globalThis==='object'?globalThis:this);
