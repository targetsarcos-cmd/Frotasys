'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {localDay,dischargeNotification,listDischargeNotifications}=require('../beta/discharge-notifications');
const trip={id:'fixture',data:'2026-11-26',placa:'AYB5I98',nome:'Motorista teste',produto:'CPII-F',nota:'450823',agendamento:'10:00',descarga:'27/11/2026 08:00',descargaVerde:false};
test('descarga pendente somente depois da virada do dia em São Paulo e com NF',()=>{
  assert.equal(localDay(new Date('2026-11-27T02:59:59Z')),'2026-11-26');
  assert.equal(localDay(new Date('2026-11-27T03:00:00Z')),'2026-11-27');
  assert.equal(dischargeNotification(trip,'2026-11-26'),null);
  assert.equal(dischargeNotification({...trip,data:'2026-11-28'},'2026-11-27'),null);
  assert.equal(dischargeNotification({...trip,nota:''},'2026-11-27'),null);
  const result=dischargeNotification(trip,'2026-11-27');
  assert.equal(result.copiar,'AYB5I98 CPIIF NF 450.823');
  assert.equal(result.agendamento,'10:00');
  assert.equal(result.data,'2026-11-26');
});
test('só a confirmação verde elimina o alerta; múltiplas notas são copiadas em linhas',()=>{
  assert.equal(dischargeNotification({...trip,descargaVerde:true},'2026-11-27'),null);
  assert.ok(dischargeNotification({...trip,descargaVerde:false,descarga:'27/11/2026 09:00'},'2026-11-27'));
  assert.ok(dischargeNotification({...trip,descargaVerde:undefined,agendamentoVerde:true},'2026-11-27'));
  const result=dischargeNotification({...trip,nota2:'450824'},'2026-11-27');
  assert.equal(result.copiar,'AYB5I98 CPIIF NF 450.823\nAYB5I98 CPIIF NF 450.824');
});
test('consultas de cartões filtram no banco, paginam e preservam tipos JSON',async()=>{
  const {listPendingNotifications}=require('../beta/discharge-notifications');
  const day='2026-11-27';
  const all=Array.from({length:401},(_,i)=>({...trip,id:String(i).padStart(4,'0'),nota:'',nota15:123,
    historico:'x'.repeat(5000),descargaVerde:false}));
  all.push({...trip,id:'legacy',status:'CONCLUIDO',descargaVerde:undefined},
    {...trip,id:'explicit-null',status:'CONCLUIDO',descargaVerde:null},
    {...trip,id:'today',data:day},{...trip,id:'paid',descargaVerde:true,adiantamentoOk:true},
    {...trip,id:'advance-only',descargaVerde:true},{...trip,id:'closed',descargaVerde:true,tipo:'FROTA'});
  let pages=0;
  const client={from(){let rows=all, keys;const q={
    select(columns){assert.ok(!columns.split(',').includes('dados'));keys=columns.split(',').map(x=>x.split(':')[0]);return q;},
    lt(_,value){rows=rows.filter(r=>r.data<value);return q;},
    gt(_,id){rows=rows.filter(r=>r.id>id);return q;},
    is(){rows=rows.filter(r=>r.descargaVerde===undefined);return q;},
    not(_,op,value){
      if(op==='is')rows=rows.filter(r=>r.descargaVerde!==undefined);
      else{const pairs=Object.entries(JSON.parse(value));rows=rows.filter(r=>!pairs.every(([k,v])=>r[k]===v));}
      return q;
    },
    order(){rows=[...rows].sort((a,b)=>a.id<b.id?-1:1);return q;},
    limit(n){pages++;return {data:rows.slice(0,n).map(r=>Object.fromEntries(keys.map(k=>[k,r[k]??null])))};}
  };return q;}};
  const result=await listPendingNotifications(client,'viagens',day);
  const sorted=cards=>cards.sort((a,b)=>a.data.localeCompare(b.data)||a.placa.localeCompare(b.placa)||a.id.localeCompare(b.id));
  assert.deepEqual(result.items,sorted(all.map(t=>dischargeNotification(t,day)).filter(Boolean)));
  const {advanceNotification}=require('../beta/discharge-notifications');
  assert.deepEqual(result.advances,sorted(all.map(t=>advanceNotification(t,day)).filter(Boolean)));
  assert.equal(pages,4);
});
test('painel preserva o editor e apresenta notificações sem textos redundantes',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  assert.doesNotMatch(js,/Nota compartilhada da operação|Registre pendências, agendamentos/);
  assert.match(js,/id="beta-discharge-list"/);
  assert.match(js,/reminderPanel.querySelector\('\.beta-reminder-text-slot'\).append\(reminderText\)/);
  assert.match(js,/setInterval\(refreshDischargeNotifications,120000\)/);
});

test('adiantamento usa regra existente e exclui frota, liberados e concluídos legados',()=>{
  const {advanceNotification}=require('../beta/discharge-notifications');
  const day='2026-11-27';
  assert.ok(advanceNotification({...trip,tipo:'AGREGADO'},day));
  assert.equal(advanceNotification({...trip,tipo:'FROTA'},day),null);
  assert.equal(advanceNotification({...trip,adiantamentoOk:true},day),null);
  assert.equal(advanceNotification({...trip,conclusaoContrato:'ADIANTAMENTO EFETUADO'},day),null);
  assert.equal(advanceNotification({...trip,conclusaoContrato:'NAO FAZ CONTRATO'},day),null);
  assert.equal(advanceNotification(trip,'2026-11-26'),null);
  const legacy={...trip,status:'CONCLUIDO',descargaVerde:undefined};
  assert.equal(advanceNotification(legacy,day),null);
  assert.equal(dischargeNotification(legacy,day),null);
  assert.ok(dischargeNotification({...legacy,descargaVerde:false},day));
  assert.ok(advanceNotification({...trip,descargaVerde:true},day));
});
test('grupos recolhíveis, sino no topo e ação agendado mantêm a edição autorizada',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/shell\.querySelector\('\.top \.search'\)\.before\(reminderNav\)/);
  assert.match(js,/id="beta-advance-list"/);
  assert.match(js,/id="beta-discharge-list"/);
  assert.match(js,/const total=items\.length\+advances\.length;/);
  assert.match(js,/confirm\?\{descarga:parsed,descargaVerde:true\}:\{descarga:parsed\}/);
  assert.match(js,/dischargeEditPatch\(input\.value,confirm\)/);
  assert.match(css,/#reminder-text \{height:175px;min-height:175px/);
});

test('máscara contínua limita ano a quatro dígitos e valida datas e horas',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const start=js.indexOf('  function maskDischargeDate('),end=js.indexOf('  function attachDischargeMask(',start);
  const {maskDischargeDate:mask,parseDischargeDate:parse}=new Function(js.slice(start,end)+'return {maskDischargeDate,parseDischargeDate};')();
  assert.equal(mask('271120260830'),'27/11/2026 08:30');
  assert.equal(mask('27112026083099'),'27/11/2026 08:30');
  assert.equal(mask(''),'');
  assert.equal(mask('27112026'),'27/11/2026');
  assert.equal(parse('27/11/2026 08:30'),'08:30 27/11/2026');
  assert.equal(parse('31/02/2026 08:30'),null);
  assert.equal(parse('27/11/2026 24:30'),null);
  assert.equal(parse('29/02/2028 23:59'),'23:59 29/02/2028');
  assert.equal(parse('27/11/202666 08:30'),null);
  assert.match(js,/input\.maxLength=16/);
  assert.match(js,/event\.key!=='Backspace'&&event\.key!=='Delete'/);
  assert.doesNotMatch(js,/Agendamento: '\+schedule/);
  assert.match(js,/patch=\{adiantamentoOk:true\}/);
  assert.doesNotMatch(js,/patch=\{programado:true\}/);
  assert.doesNotMatch(js,/beta-program-list|beta-program-count|payload\.programs/);
});

test('data de carregamento no cabeçalho e validação sem aviso textual',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/makeElement\('time','beta-notice-loading-date','Data carregamento: '\+dischargeDate\(item\.data\)\)/);
  assert.match(js,/top\.append\(identity,loadingDate\)/);
  assert.match(css,/\.beta-notice-loading-date \{[^}]*margin-left:auto/);
  assert.doesNotMatch(js,/Informe uma data e hora válidas/);
  assert.match(js,/if\(!parsed\)/);
  assert.match(js,/input\.setAttribute\('aria-invalid','true'\)/);
});

test('editor carrega a data existente, salva sem confirmar e confirma com os valores novos',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const normalizer=app.slice(app.indexOf('function normalizeDescargaDateTime('),app.indexOf('function descargaToInputValue('));
  const helpers=js.slice(js.indexOf('  function dischargeEditorValue('),js.indexOf('  function attachDischargeMask('));
  const {dischargeEditorValue,dischargeEditPatch}=new Function(normalizer+helpers+'return {dischargeEditorValue,dischargeEditPatch};')();
  assert.equal(dischargeEditorValue('08:30 27/11/2026'),'27/11/2026 08:30');
  assert.equal(dischargeEditorValue('2026-11-27T08:30'),'27/11/2026 08:30');
  assert.equal(dischargeEditorValue('27/11/2026 08:30'),'27/11/2026 08:30');
  assert.equal(dischargeEditorValue(''),'');
  assert.deepEqual(dischargeEditPatch('28/11/2026 09:45',false),{descarga:'09:45 28/11/2026'});
  assert.deepEqual(dischargeEditPatch('28/11/2026 09:45',true),{descarga:'09:45 28/11/2026',descargaVerde:true});
  assert.equal(dischargeEditPatch('31/02/2026 09:45',true),null);
  assert.equal(dischargeEditPatch('',false),null);
  assert.match(js,/dateRow\.append\(input\)/);
  assert.doesNotMatch(js,/beta-discharge-edit','Editar|function openEditor\(/);
  assert.match(js,/editor\.hidden=!changed/);
  assert.match(js,/input\.addEventListener\('input',syncEditorActions\)/);
  assert.match(js,/save.addEventListener\('click',\(\)=>persistDischarge\(false\)\)/);
  assert.match(js,/cancel.addEventListener\('click',closeEditor\)/);
  assert.match(js,/if\(confirm\)card.remove\(\)/);
  assert.match(js,/if\(dischargeWrites\|\|document.activeElement\?\.matches\('\.beta-discharge-schedule'\)\)return/);
});

test('cartão de descarga oculta texto de cópia, conserva ação e amplia data',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.doesNotMatch(js,/beta-discharge-copy-value/);
  assert.match(js,/await copyDischarge\(item\.copiar\)/);
  assert.match(js,/copyRow\.append\(copy\)/);
  assert.match(js,/dateRow\.append\(input\)/);
  assert.match(css,/\.beta-discharge-card-schedule \{min-height:116px/);
  assert.match(css,/\.beta-discharge-card-schedule \.beta-discharge-date \{font-size:15px/);
  assert.match(css,/\.beta-discharge-card-schedule \.beta-discharge-date-row \.beta-discharge-schedule \{font-size:15px/);
});

test('sondagens sem mudanças só consultam a revisão; exclusão, edição e virada recalculam',async()=>{
  const {createPendingReader}=require('../beta/discharge-notifications');
  let count=3,version='v1',scans=0,fail=false;
  const client={from(){let mode;const q={
    select(cols,opt){mode=opt?.head?'count':cols==='id,updated_at'?'latest':'cards';return q;},
    lt(){return q;},not(){return q;},is(){return q;},order(){return q;},limit(){return q;},
    then(ok){if(mode==='count')return ok({count});
      if(mode==='latest')return ok({data:[{id:'last',updated_at:version}]});
      scans++;return ok(fail?{error:new Error('indisponível')}:{data:[]});
    }
  };return q;}};
  const read=createPendingReader(client,'viagens');
  const day='2026-11-27';
  await Promise.all([read(day),read(day),read(day)]);
  await read(day);
  assert.equal(scans,2);
  count--;await read(day);assert.equal(scans,4);
  version='v2';await read(day);assert.equal(scans,6);
  fail=true;await assert.rejects(read('2026-11-28'),/indisponível/);
  fail=false;await read('2026-11-28');assert.equal(scans,9);
});

test('o leitor SQL da beta preserva os predicados e os tipos do PostgREST',async()=>{
  const {fromTable}=require('../beta/pg-reader');
  const queries=[];
  const pool={async query(sql,args){queries.push({sql,args});return {rows:[]};}};
  await require('../beta/discharge-notifications').listPendingNotifications({from:t=>fromTable(pool,t)},'viagens','2026-11-27');
  assert.equal(queries.length,2);
  assert.ok(queries[0].sql.includes("(dados->'descargaVerde') IS NULL"));
  assert.ok(queries[1].sql.includes("(dados->'descargaVerde') IS NOT NULL"));
  assert.ok(queries[1].sql.includes("(dados->'nota15') AS \"nota15\""));
  assert.ok(queries[1].sql.includes('NOT ("dados" @> $'));
  assert.ok(queries[0].args.includes('{"status":"CONCLUIDO"}'));
});
