'use strict';
const {FIELDS,invoiceEntries}=require('./trip-invoices');
const {hasAdvanceOk,normalizeText}=require('../tripStatus');
const {hasBillingDocuments}=require('../public/js/workspace-trip-sections');

function localDay(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>parts.find(p=>p.type===type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}

function pendingTrip(trip,today){
  const date=String(trip.data||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=today)return null;
  // Historical completed trips predate the explicit green flag.
  if(trip.descargaVerde===undefined && normalizeText(trip.status)==='CONCLUIDO')return null;
  const notes=invoiceEntries(trip).map(item=>item.value);
  // A nota fiscal identifica uma viagem efetivamente carregada, em vez de
  // disparar alertas para programações antigas que nunca carregaram.
  if(!notes.length)return null;
  const plate=String(trip.placa||'').trim().toUpperCase().replace(/[\s-]/g,'');
  if(!plate)return null;
  const product=String(trip.produto||'').trim().toUpperCase().replace(/[\s-]/g,'');
  return {id:String(trip.id||trip._id||''),placa:plate,nome:String(trip.nome||'').trim(),
    produto:product,notas:notes,data:date,canAdvance:hasBillingDocuments(trip),agendamento:String(trip.agendamento||'').trim(),
    descarga:String(trip.descarga||'').trim(),copiar:notes.map(n=>[plate,product,'NF',n].filter(Boolean).join(' ')).join('\n')};
}

function dischargeNotification(trip,today){
  return trip.descargaVerde===true?null:pendingTrip(trip,today);
}
function advanceNotification(trip,today){
  return hasAdvanceOk(trip)?null:pendingTrip(trip,today);
}

// Only transfer the JSON keys consumed by the two notification rules.
const cardFields = ['data','placa','nome','produto','status','descargaVerde','descarga','agendamento',
  'tipo','adiantamentoOk','conclusaoContrato','cte','manifesto','contrato',...FIELDS];
const cardSelect = ['id',...cardFields.map(key => key + ':dados->' + key)].join(',');

async function listPendingNotifications(client,table,today=localDay()){
  const pageSize = 200;
  const result = [], advances = [];
  // A missing flag and an explicitly null flag have different legacy semantics.
  // PostgreSQL's JSON arrow keeps JSON null distinct from SQL NULL in the filter.
  for (const hasFlag of [false,true]) {
    let cursor = null;
    for (;;) {
      let query = client.from(table).select(cardSelect).lt('dados->>data',today);
      if (hasFlag) {
        query = query.not('dados->descargaVerde','is',null);
        for (const completed of [{adiantamentoOk:true},{tipo:'FROTA'},
          {conclusaoContrato:'ADIANTAMENTO EFETUADO'},{conclusaoContrato:'NAO FAZ CONTRATO'}]) {
          query = query.not('dados','cs',JSON.stringify({descargaVerde:true,...completed}));
        }
      } else {
        query = query.is('dados->descargaVerde',null).not('dados','cs','{"status":"CONCLUIDO"}');
      }
      if (cursor !== null) query = query.gt('id',cursor);
      const {data,error} = await query.order('id',{ascending:true}).limit(pageSize);
      if (error) throw error;
      for (const trip of data || []) {
        if (!hasFlag) delete trip.descargaVerde;
        const notification = pendingTrip(trip,today);
        if (!notification) continue;
        if (trip.descargaVerde !== true) result.push(notification);
        if (!hasAdvanceOk(trip)) advances.push(notification);
      }
      if (!data || data.length < pageSize) break;
      cursor = data[data.length - 1].id;
    }
  }
  const order=(a,b)=>a.data.localeCompare(b.data)||a.placa.localeCompare(b.placa)||a.id.localeCompare(b.id);
  return {items:result.sort(order),advances:advances.sort(order)};
}
// Recheck a small revision marker after the polling cache expires. A deletion
// changes the count even when the most recently updated trip survives.
function createPendingReader(client,table) {
  let cached;
  return async function read(day) {
    const trips = () => client.from(table);
    const [latest,total] = await Promise.all([
      trips().select('id,updated_at').lt('dados->>data',day).not('updated_at','is',null)
        .order('updated_at',{ascending:false}).order('id',{ascending:true}).limit(1),
      trips().select('id',{count:'exact',head:true}).lt('dados->>data',day)
    ]);
    if (latest.error || total.error) throw latest.error || total.error;
    const row = latest.data?.[0];
    const revision = JSON.stringify([day,total.count,row?.id,row?.updated_at]);
    if (cached?.revision === revision && cached.expires > Date.now()) return cached.value;
    const entry = { revision, expires: Date.now() + 600_000, value: listPendingNotifications(client,table,day) };
    cached = entry;
    try { return await entry.value; }
    catch (error) { if (cached === entry) cached = null; throw error; }
  };
}

async function listDischargeNotifications(client,table,today=localDay()){
  return (await listPendingNotifications(client,table,today)).items;
}
module.exports={createPendingReader,localDay,dischargeNotification,advanceNotification,listDischargeNotifications,listPendingNotifications};
