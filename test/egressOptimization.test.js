'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {dayStartISO}=require('../beta/work-day-rollover');
const {category,createMeasuredFetch}=require('../beta/egress-metrics');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('meia-noite de Brasília delimita apenas sessões vencidas',()=>{
  assert.equal(dayStartISO('2026-11-28T02:59:59Z'),'2026-11-27T03:00:00.000Z');
  assert.equal(dayStartISO('2026-11-28T03:00:00Z'),'2026-11-28T03:00:00.000Z');
  assert.equal(dayStartISO('2026-11-28T17:00:00Z'),'2026-11-28T03:00:00.000Z');
});
test('cache seletivo conserva catálogos em alterações de trabalho e viagem do dia',()=>{
  const server=read('server.js');
  const source=server.slice(server.indexOf('function invalidateAfterWrite('),server.indexOf('function invalidateCache('));
  const invalidated=[],events=[];
  const fields=['TABLES','betaWorkspace','require','invalidateCache','broadcast','WORK_EVENT_FIELD','WORK_SESSION_FIELD','WORK_TYPE_FIELD','USER_PROFILE_SETTINGS_FIELD','WAITLIST_FIELD','FRETE_CONSULT_FIELD','LEMBRETE_FIELD','OPERATION_MESSAGES_FIELD','CONFIG_FIELDS','CONFIG_SEED_MARKER_FIELD'];
  const rules={localDay:()=> '2026-11-27',dischargeNotification:(d,t)=>d.data<t&&!d.descargaVerde&&d.nota?{id:d.id,descarga:d.descarga}:null,advanceNotification:()=>null};
  const invalidate=new Function(...fields,source+'return invalidateAfterWrite;')({viagens:'viagens',metas:'metas',operacoes:'operacoes',configOptions:'config'},true,()=>rules,k=>invalidated.push(k),e=>events.push(e),'event','session','type','profile','wait','frete','note','messages',['tipo'],'seed');
  invalidate('config',{field:'event'});assert.deepEqual(invalidated,[]);
  invalidate('config',{field:'session',workTypeId:'A'},{field:'session',workTypeId:'A'});
  assert.deepEqual(invalidated,['public-work-sessions']);invalidated.length=0;
  invalidate('config',{field:'profile',userId:'u'});assert.deepEqual(invalidated,['profile-settings-u','public-work-sessions']);invalidated.length=0;
  invalidate('viagens',{data:'2026-11-27',nota:'123'},{data:'2026-11-27',nota:''});assert.deepEqual(invalidated,['dashboard-trips-']);assert.equal(events.length,0);invalidated.length=0;
  invalidate('viagens',{data:'2026-11-26',id:'a',nota:'123',descargaVerde:true},{data:'2026-11-26',id:'a',nota:'123'});
  assert.deepEqual(invalidated,['dashboard-trips-','pending-trips-']);assert.equal(events[0].type,'pending_notifications_changed');
});
test('métricas agregadas não registram parâmetros, identificadores ou credenciais',async()=>{
  const url='https://example.supabase.co/rest/v1/viagens?select=id%2Cdados%2Cupdated_at&dados-%3E%3Eplaca=eq.SECRET';
  assert.equal(category(url),'viagens:GET:full-doc');
  let report,tick;
  const measured=createMeasuredFetch(async()=>({headers:{get:()=> '300'},body:{}}),{report:r=>{report=r;},schedule:fn=>{tick=fn;return {};}});
  await measured(url);await measured(url);tick();
  assert.equal(report.requests,2);assert.equal(report.estimatedBytes,600);
  assert.equal(report.sources[0].source,'viagens:GET:full-doc');
  assert.ok(!JSON.stringify(report).includes('SECRET'));
});
test('frontend não recarrega ao renovar autenticação e usa evento de notificação',()=>{
  const app=read('public/js/app.js'),server=read('server.js'),workspace=read('public/js/workspace-beta.js');
  assert.match(app,/firstAuthentication&&wsWasAuthenticated&&!wsRefreshPending/);
  assert.match(app,/msg.type==='auth_renew'/);
  assert.match(app,/type === 'pending_notifications_changed'/);
  assert.match(workspace,/setInterval\(refreshDischargeNotifications,120000\)/);
  assert.match(server,/\.lt\('dados->>startedAt',require\('\.\/beta\/work-day-rollover'\).dayStartISO\(now\)\)/);
  assert.match(server,/countDocs\(TABLES.configOptions,null,\{field:WAITLIST_FIELD\}\)/);
});
