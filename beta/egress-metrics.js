'use strict';
// Approximate response payload volume; not the Supabase billing counter.
// Never log query values, URLs, tokens, request bodies or response content.
const allowedTables=new Set(['viagens','metas','operacoes','config_options','user_profiles']);
const groups=new Set(['__trip_work_session','__trip_work_session_event','__user_profile_settings','__work_type','__frete_consultas','__lista_espera','__lembrete_diario','__operation_messages','__beta_table_preferences']);
function category(input,init={}){
  try{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    const verb=['GET','HEAD','POST','PATCH','DELETE','PUT'].includes(method)?method:'OTHER';
    const parts=url.pathname.split('/').filter(Boolean);
    if(parts[0]==='auth')return 'auth:'+(['user','token'].includes(parts[2])?parts[2]:'other')+':'+verb;
    if(parts[0]!=='rest'||!allowedTables.has(parts[2]))return 'other:'+verb;
    const table=parts[2], select=url.searchParams.get('select')||'';
    const field=(url.searchParams.get('dados->>field')||'').replace(/^eq\./,'');
    const group=table==='config_options'&&groups.has(field)?':'+field:'';
    const shape=select.includes('descargaVerde:dados->')?'notification-cards':
      select==='id,updated_at'?'revision':select.split(',').includes('dados')||select==='*'?'full-doc':'projected';
    return table+group+':'+verb+':'+shape;
  }catch{return 'other';}
}
function createMeasuredFetch(fetchImpl,{report=entry=>console.info('[supabase-egress-estimate]',JSON.stringify(entry)),intervalMs=300000,schedule=setInterval}={}){
  let counters=new Map(),started=Date.now();
  function add(key,bytes,known){
    const item=counters.get(key)||{requests:0,bytes:0,unknown:0};
    item.requests++;item.bytes+=bytes;if(!known)item.unknown++;
    counters.set(key,item);
  }
  const timer=schedule(()=>{
    if(!counters.size){started=Date.now();return;}
    const rows=[...counters].map(([source,value])=>({source,...value})).sort((a,b)=>b.bytes-a.bytes);
    const summary={windowSeconds:Math.round((Date.now()-started)/1000),requests:rows.reduce((n,r)=>n+r.requests,0),estimatedBytes:rows.reduce((n,r)=>n+r.bytes,0),sources:rows};
    counters=new Map();started=Date.now();
    try{report(summary);}catch{}
  },intervalMs);
  timer?.unref?.();
  return async function measuredFetch(input,init){
    const key=category(input,init);
    const response=await fetchImpl(input,init);
    try{
      const raw=response.headers.get('content-length');
      const len=raw===null?NaN:Number(raw);
      if(String(init?.method||input?.method||'GET').toUpperCase()==='HEAD'||!response.body)add(key,0,true);
      else if(Number.isSafeInteger(len)&&len>=0)add(key,len,true);
      else{
        // Count without retaining or logging any data. For chunked bodies this
        // is decoded bytes, which can exceed billed compressed bytes.
        const reader=response.clone().body.getReader();
        void (async()=>{
          let n=0;
          try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;}add(key,n,true);}
          catch{add(key,0,false);}
          finally{reader.releaseLock();}
        })();
      }
    }catch{add(key,0,false);}
    return response;
  };
}
module.exports={category,createMeasuredFetch};
