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
