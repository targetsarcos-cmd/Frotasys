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
test('paginação inclusiva do leitor beta não duplica registros e não perde pendências',async()=>{
  const all=Array.from({length:401},(_,i)=>({id:String(i).padStart(4,'0'),dados:{...trip,descargaVerde:i===400?false:true}}));
  let pages=0;
  const client={from(){let cursor=null,limit=200;const q={select:()=>q,lte:()=>q,not:()=>q,order:()=>q,limit:n=>{limit=n;return q;},gte:(_key,value)=>{cursor=value;return q;},then(resolve){pages++;resolve({data:all.filter(r=>cursor===null||r.id>=cursor).slice(0,limit)});}};return q;}};
  const result=await listDischargeNotifications(client,'viagens','2026-11-27');
  assert.equal(pages,3);
  assert.equal(result.length,1);
  assert.equal(result[0].id,'0400');
});
test('painel preserva o editor e apresenta notificações sem textos redundantes',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  assert.doesNotMatch(js,/Nota compartilhada da operação|Registre pendências, agendamentos/);
  assert.match(js,/id="beta-discharge-list"/);
  assert.match(js,/reminderPanel.querySelector\('\.beta-reminder-text-slot'\).append\(reminderText\)/);
  assert.match(js,/setInterval\(refreshDischargeNotifications,30000\)/);
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
  assert.match(js,/const total=items\.length\+advances\.length/);
  assert.match(js,/patch=\{descargaVerde:true\}/);
  assert.match(js,/parseDischargeDate\(input\.value\)/);
  assert.match(css,/#reminder-text \{height:175px;min-height:175px/);
});

test('programação pendente inclui viagem sem NF, exclui concluídas e programadas',()=>{
  const {programNotification}=require('../beta/discharge-notifications');
  const day='2026-11-27';
  const base={...trip,nota:'',programado:false,status:'CRIAR DT / PROGRAMAR'};
  assert.ok(programNotification(base,day));
  assert.equal(programNotification({...base,programado:true},day),null);
  assert.equal(programNotification({...base,status:'CONCLUIDO'},day),null);
  assert.equal(programNotification(base,'2026-11-26'),null);
  assert.equal(programNotification({...trip,programado:undefined},day),null);
  assert.ok(programNotification({...trip,programado:false},day));
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
  assert.match(js,/patch=\{programado:true\}/);
  assert.match(js,/id="beta-program-list"/);
});

test('data de carregamento no cabeçalho e validação sem aviso textual',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/makeElement\('time','beta-notice-loading-date',dischargeDate\(item\.data\)\)/);
  assert.match(js,/top\.append\(identity,loadingDate\)/);
  assert.match(css,/\.beta-notice-loading-date \{[^}]*margin-left:auto/);
  assert.doesNotMatch(js,/Informe uma data e hora válidas/);
  assert.match(js,/if\(!parsed\)/);
  assert.match(js,/input\.setAttribute\('aria-invalid','true'\)/);
});
