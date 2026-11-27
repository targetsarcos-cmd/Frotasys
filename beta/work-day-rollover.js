'use strict';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
function localDay(value){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '';
  const parts=dayFormat.formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
function expiredWorkPatch(session,now=Date.now()){
  if(!['active','paused'].includes(session.status)||!session.startedAt)return null;
  const start=Date.parse(session.startedAt),end=Number(new Date(now));
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||localDay(start)===localDay(end))return null;
  // Find the exact first midnight after the session began, including timezone changes.
  const day=localDay(start);
  let low=start,high=Math.min(end,start+36*3600000);
  if(localDay(high)===day)return null;
  while(high-low>1){const mid=Math.floor((high+low)/2);if(localDay(mid)===day)low=mid;else high=mid;}
  return {status:'completed',completedAt:new Date(high).toISOString(),completionReason:'day_rollover'};
}
module.exports={localDay,expiredWorkPatch};
