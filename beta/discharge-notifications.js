'use strict';
const {invoiceEntries}=require('./trip-invoices');
const {hasAdvanceOk,normalizeText}=require('../tripStatus');

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
    produto:product,notas:notes,data:date,agendamento:String(trip.agendamento||'').trim(),
    descarga:String(trip.descarga||'').trim(),copiar:notes.map(n=>[plate,product,'NF',n].filter(Boolean).join(' ')).join('\n')};
}

function dischargeNotification(trip,today){
  return trip.descargaVerde===true?null:pendingTrip(trip,today);
}
function advanceNotification(trip,today){
  return hasAdvanceOk(trip)?null:pendingTrip(trip,today);
}

async function listPendingNotifications(client,table,today=localDay()){
  const pageSize=200, result=[], advances=[];
  let cursor=null;
  for(;;){
    let query=client.from(table).select('id,dados')
      .lte('dados->>data',today).not('dados->>data','is',null)
      .order('id',{ascending:true}).limit(pageSize);
    if(cursor!==null)query=typeof query.gt==='function'?query.gt('id',cursor):query.gte('id',cursor);
    const {data,error}=await query;
    if(error)throw error;
    const page=data||[];
    for(const record of page){
      if(record.id===cursor)continue;
      const trip={...record.dados,id:record.id};
      const notification=dischargeNotification(trip,today);
      const advance=advanceNotification(trip,today);
      if(notification)result.push(notification);
      if(advance)advances.push(advance);
    }
    if(page.length<pageSize)break;
    const next=page[page.length-1].id;
    if(next===cursor)throw Error('Falha na paginação de notificações.');
    cursor=next;
  }
  const order=(a,b)=>a.data.localeCompare(b.data)||a.placa.localeCompare(b.placa)||a.id.localeCompare(b.id);
  return {items:result.sort(order),advances:advances.sort(order)};
}
async function listDischargeNotifications(client,table,today=localDay()){
  return (await listPendingNotifications(client,table,today)).items;
}
module.exports={localDay,dischargeNotification,advanceNotification,listDischargeNotifications,listPendingNotifications};
