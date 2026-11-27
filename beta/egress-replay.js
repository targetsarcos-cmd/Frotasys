'use strict';
const {randomUUID}=require('node:crypto');
const REPLAYABLE=new Set(['viagem_criada','viagem_atualizada','viagem_removida']);
function createReplayJournal({epoch=randomUUID(),capacity=128,maxBytes=128*1024}={}){
  let sequence=0,bytes=0;
  const entries=[];
  const cursor=()=>({epoch,sequence});
  function record(message){
    const tagged={...message,cursor:{epoch,sequence:++sequence}};
    // Never store profile, configuration, or other potentially private payloads.
    const event=REPLAYABLE.has(message.type)?JSON.parse(JSON.stringify(tagged)):null;
    const size=event?Buffer.byteLength(JSON.stringify(event)):0;
    entries.push({sequence,event,size});
    bytes+=size;
    while(entries.length>capacity||bytes>maxBytes){
      bytes-=entries.shift().size;
    }
    return tagged;
  }
  function resume(previous){
    const current=cursor();
    if(!previous||previous.epoch!==epoch||!Number.isSafeInteger(previous.sequence)||previous.sequence<0||previous.sequence>sequence)return {cursor:current,replay:null};
    const missing=entries.filter(item=>item.sequence>previous.sequence);
    if(missing.length!==sequence-previous.sequence||missing.some(item=>!item.event))return {cursor:current,replay:null};
    return {cursor:current,replay:missing.map(item=>item.event)};
  }
  return {record,resume,cursor};
}
module.exports={createReplayJournal};
