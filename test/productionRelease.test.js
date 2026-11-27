'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resolveRuntime,canAccessUser}=require('../beta/runtime');
const {bindAuthenticatedSocket,broadcastAuthenticated}=require('../beta/authenticated-socket');
const workspace=require('../beta/workspace');
test('produção é padrão e piloto permanece restrito ao participante',()=>{
  const prod=resolveRuntime({});
  assert.equal(prod.production,true);assert.equal(prod.workspace,true);assert.equal(prod.editable,true);
  assert.equal(canAccessUser(prod,'operator',{BETA_USER_ID:'admin'}),true);
  assert.equal(canAccessUser(prod,'',{}),false);
  for(const mode of ['readonly','editable']){
    const pilot=resolveRuntime({FROTASYS_INTERFACE_BETA:mode});
    assert.equal(pilot.production,false);assert.equal(pilot.editable,mode==='editable');
    assert.equal(canAccessUser(pilot,'operator',{BETA_USER_ID:'admin'}),false);
    assert.equal(canAccessUser(pilot,'admin',{BETA_USER_ID:'admin'}),true);
  }
  assert.equal(resolveRuntime({FROTASYS_INTERFACE_BETA:'classic'}).workspace,false);
});
test('produção entrega a interface aprovada sem credencial beta',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const page=workspace(read('public/index.html'),{editable:true,production:true});
  assert.match(page,/data-beta-mode="editable" data-workspace-runtime="production"/);
  assert.match(page,/workspace-beta\.js/);
  const server=read('server.js'), app=read('public/js/app.js');
  assert.match(server,/runtime\.pilotEditable \? betaMode\.createEditableClient\(process\.env\) : require\('\.\/supabaseClient'\)/);
  assert.match(server,/!canAccessUser\(runtime,data\.user\.id,process\.env\)/);
  assert.match(server,/if\(runtime\.pilot \|\| req\.url !== '\/'\) return socket\.destroy\(\)/);
  assert.match(app,/socket\.send\(JSON\.stringify\(\{type:'authenticate',token\}\)\)/);
  assert.match(app,/if\(authenticated\)handleWsMessage\(msg\)/);
});
function fixture(authenticate){
  const handlers={},sent=[],timers=new Map();
  const ws={readyState:1,on:(event,fn)=>{handlers[event]=fn;},send:msg=>sent.push(JSON.parse(msg)),
    close(code){this.code=code;this.readyState=3;handlers.close?.();}};
  let seq=0;
  bindAuthenticatedSocket(ws,{authenticate,now:()=>1000,schedule:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},cancel:id=>timers.delete(id)});
  return {ws,sent,timers,receive:message=>handlers.message(JSON.stringify(message))};
}
test('socket só recebe dados após autenticação e usuário ativo; expiração revoga acesso',async()=>{
  const identity={userId:'op',profile:{ativo:true,role:'operador'},expiresAt:1000+600000};
  const a=fixture(async token=>token==='valid'?identity:null);
  broadcastAuthenticated([a.ws],{type:'viagem_atualizada',payload:{id:1}});
  assert.equal(a.sent.length,0);
  await a.receive({type:'authenticate',token:'valid'});
  assert.equal(a.sent[0].type,'auth_ok');assert.equal(a.ws.authenticated,true);
  broadcastAuthenticated([a.ws],{type:'viagem_atualizada',payload:{id:1}});
  broadcastAuthenticated([a.ws],{type:'perfil_atualizado',payload:{userId:'other'}});
  assert.equal(a.sent.length,2);
  const timer=[...a.timers.values()][0];
  assert.equal(timer.ms,300000);timer.fn();
  assert.equal(a.ws.authenticated,false);
  broadcastAuthenticated([a.ws],{type:'viagem_atualizada',payload:{id:2}});
  assert.equal(a.sent.length,2);
  for(const invalid of [null,{...identity,profile:{ativo:false,role:'operador'}},{...identity,expiresAt:999}]){
    const b=fixture(async()=>invalid);
    await b.receive({type:'authenticate',token:'invalid'});
    assert.equal(b.ws.authenticated,false);assert.equal(b.ws.code,4403);assert.equal(b.sent.length,0);
  }
});
test('socket não autenticado expira e não pode receber mensagens',()=>{
  const a=fixture(async()=>null);
  const timer=[...a.timers.values()][0];assert.equal(timer.ms,10000);timer.fn();
  assert.equal(a.ws.authenticated,false);assert.equal(a.ws.code,4401);
});

test('renovação do socket mantém a conexão autenticada e não aceita trocar de usuário',async()=>{
  let id='op',checks=0;
  const a=fixture(async()=>{checks++;return {userId:id,profile:{ativo:true,role:'operador'},expiresAt:601000};});
  await a.receive({type:'authenticate',token:'valid'});
  await a.receive({type:'authenticate',token:'unsolicited'});
  assert.equal(checks,1);
  [...a.timers.values()].find(t=>t.ms===285000).fn();
  assert.equal(a.sent.at(-1).type,'auth_renew');
  await a.receive({type:'authenticate',token:'valid'});
  assert.equal(a.sent.at(-1).type,'auth_ok');
  assert.equal(a.sent.at(-1).renewed,true);
  assert.equal(a.ws.readyState,1);
  assert.equal(a.ws.authenticated,true);
  broadcastAuthenticated([a.ws],{type:'viagem_atualizada',payload:{id:2}});
  assert.equal(a.sent.at(-1).type,'viagem_atualizada');
  id='other';
  [...a.timers.values()].find(t=>t.ms===285000).fn();
  await a.receive({type:'authenticate',token:'other'});
  assert.equal(a.ws.code,4403);
  assert.equal(a.ws.authenticated,false);
});
