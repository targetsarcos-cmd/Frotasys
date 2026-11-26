/* Bind the supplied report layout to live aggregates. */
(() => {
'use strict';
const $=id=>document.getElementById(id), q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
const int=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const decimal=n=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n});
const pct=(a,b)=>b>0?100*a/b:0, width=p=>Math.max(0,Math.min(100,p));
const date=value=>String(value).split('-').reverse().join('/');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let bridge, defaults, report=null, headers=[], rows=[], version=0,timer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function busy(message,detail){
  report=null;$('workspace').classList.add('is-empty');
  $('empty-title').textContent=message;q('.empty p').textContent=detail||'';
  ['export','copy','copy2','print'].forEach(id=>$(id).disabled=true);
  $('periodnote').textContent='Volumes em kg';
}
function metric(index,value,foot,progress){
  const card=qa('.kpi')[index];
  card.querySelector('.kpi-value').innerHTML=int.format(value)+'<span class="unit">kg</span>';
  card.querySelector('.kpi-foot').innerHTML=foot;
  if(progress!==undefined)card.querySelector('.progress span').style.width=width(progress)+'%';
}
function draw(data){
  report=data;
  const meta=Number(data.metaTotal)||0,fat=Number(data.fatTotal)||0,ag=Number(data.agencTotal)||0,total=fat+ag,falta=meta-total;
  const dest=data.destinos||[],period=date(data.filters.start)+' a '+date(data.filters.end);
  const p=pct(total,meta), fp=pct(fat,meta), ap=pct(ag,fat), mp=pct(falta,meta);
  $('workspace').classList.remove('is-empty');
  ['export','copy','copy2','print'].forEach(id=>$(id).disabled=false);
  metric(0,meta,'Definida para o período <span>'+ (meta?'100%':'—')+'</span>');
  metric(1,ag,'Volume a faturar <span>'+ (fat?decimal(2).format(ap)+'% do faturado':'—')+'</span>');
  metric(2,fat,'Volume faturado <strong class="blue">'+(meta?decimal(1).format(fp)+'% da meta':'Sem meta')+'</strong>',fp);
  metric(3,falta,'Saldo após agenciamento <strong class="red">'+(meta?decimal(1).format(mp)+'% da meta':'Sem meta')+'</strong>',mp);
  const context=q('.main-grid .panel-head .meta small');
  context.textContent=data.operationLabel+' · '+period;
  headers=['Indicador',...dest.map(d=>d.destino),'Total (kg)'];
  const series=[['Meta','', '',d=>d.meta,meta],['Faturado','blue','billed',d=>d.faturado,fat],['Agenciado','orange','booked',d=>d.agenciado,ag],['Total','total','total',d=>d.faturado+d.agenciado,total],['Falta','falta','missing',d=>d.meta-d.faturado-d.agenciado,falta]];
  rows=series.map(([label,,,fn,sum])=>[label,...dest.map(fn),sum]);
  $('summary').tHead.innerHTML='<tr><th>Indicador / destino</th>'+headers.slice(1).map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr>';
  $('summary').tBodies[0].innerHTML=rows.map((row,i)=>'<tr class="'+series[i][1]+'"><td><span class="legend-mark '+series[i][2]+'"></span>'+row[0]+'</td>'+row.slice(1).map(v=>'<td>'+int.format(v)+'</td>').join('')+'</tr>').join('');
  q('.table-footer strong').textContent=meta?decimal(1).format(p)+'%':'—';
  q('.table-footer .progress span').style.width=width(p)+'%';
  const palette=['#b5c8d8','#407b9f','#77a7b8','#155d94'];
  const types=data.typeCounts||[],sum=types.reduce((s,t)=>s+Number(t.value||0),0);
  let pos=0,stops=[];
  types.forEach((t,i)=>{if(!t.value||!sum)return;let end=pos+pct(t.value,sum),gap=Math.min(.42,(end-pos)/2);stops.push(palette[i%4]+' '+pos+'% '+(end-gap)+'%','white '+(end-gap)+'% '+end+'%');pos=end;});
  q('.donut').style.background=stops.length?'conic-gradient('+stops.join(',')+')':'#e4edf4';
  q('.donut-label strong').textContent=int.format(sum);
  q('.donut-wrap').setAttribute('aria-label','Distribuição de '+int.format(sum)+' registros por modalidade');
  q('.legend').innerHTML=types.map((t,i)=>'<div class="legend-row"><span class="swatch" style="background:'+palette[i%4]+'"></span><div><strong>'+esc(String(t.label).toLowerCase().replace(/^./,c=>c.toUpperCase()))+'</strong><small>'+int.format(t.value)+' registros</small></div><span class="pct">'+decimal(1).format(pct(t.value,sum))+'%</span></div>').join('');
  $('bars').innerHTML=dest.map(d=>{const p=pct(d.faturado,d.meta);return '<div class="baritem"><span class="barname">'+esc(d.destino)+'</span><div class="track" title="'+int.format(d.faturado)+' de '+int.format(d.meta)+' kg" role="progressbar" aria-label="'+esc(d.destino)+'" aria-valuenow="'+width(p).toFixed(1)+'" aria-valuemin="0" aria-valuemax="100"><div class="fill" style="width:'+width(p)+'%"></div><span class="target"></span></div><span class="num">'+(d.meta?decimal(1).format(p)+'%':'—')+'</span></div>';}).join('')+'<div class="bar-foot"><span>0%</span><span>100% da meta</span></div>';
  const fatPct=pct(fat,total),agPct=pct(ag,total);
  q('.operbody').innerHTML='<div class="opbar" role="img" aria-label="'+decimal(2).format(fatPct)+'% faturado, '+decimal(2).format(agPct)+'% agenciado"><div class="done" style="width:'+width(fatPct)+'%"></div><div class="pending" style="width:'+width(agPct)+'%;min-width:'+(ag>0?'3px':'0')+'"></div></div><div class="oprow"><strong><span class="legend-mark billed"></span>Faturado</strong><span class="value">'+int.format(fat)+' kg <small>'+decimal(2).format(fatPct)+'%</small></span></div><div class="oprow"><strong><span class="legend-mark booked"></span>Agenciado</strong><span class="value">'+int.format(ag)+' kg <small>'+decimal(2).format(agPct)+'%</small></span></div><div class="oprow"><strong>Total operacional</strong><strong>'+int.format(total)+' kg</strong></div>';
}
async function apply(){
  const id=++version;
  const filters={start:$('start').value,end:$('end').value,operation:$('operation').value};
  if(!filters.start||!filters.end||filters.start>filters.end){busy('Período inválido','Selecione as datas inicial e final.');return;}
  busy('Carregando dados do período…','Consultando viagens e metas.');
  try{const data=await bridge.load(filters);if(id!==version)return;draw(data);}
  catch(error){if(id===version)busy('Não foi possível carregar os relatórios',error.message);}
}
function reset(){if(!defaults)return;$('operation').value=defaults.operation;$('start').value=defaults.start;$('end').value=defaults.end;apply();}
function summaryText(){const d=report;return 'RESUMO CONSOLIDADO — '+d.operationLabel.toUpperCase()+'\n'+date(d.filters.start)+' a '+date(d.filters.end)+' · kg\n\n'+headers.join('\t')+'\n'+rows.map(row=>row.map((v,i)=>i?int.format(v):v).join('\t')).join('\n')+'\n\nRealização da meta: '+(d.metaTotal?decimal(1).format(pct(d.fatTotal+d.agencTotal,d.metaTotal))+'%':'—');}
async function copy(){if(!report)return;const text=summaryText();try{await navigator.clipboard.writeText(text);toast('Resumo copiado.');}catch{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();try{toast(document.execCommand('copy')?'Resumo copiado.':'Não foi possível copiar. Utilize Exportar.');}catch{toast('Não foi possível copiar. Utilize Exportar.');}t.remove();}}
function csvCell(v){const s=String(v);return '"'+(/^[=+@-]/.test(s)&&typeof v!=='number'?"'"+s:s).replace(/"/g,'""')+'"';}
function exportCsv(){if(!report)return;const csv='\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(';')).join('\r\n');const u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='Relatorio_'+report.operationLabel.replace(/[^\w-]/g,'_')+'_'+report.filters.start+'_a_'+report.filters.end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('Arquivo CSV exportado.');}
busy('Carregando dados do período…','Consultando viagens e metas.');
try{bridge=window.parent!==window?window.parent.FrotasysBetaReports:null;if(!bridge)throw Error('Abra Relatórios pelo menu do Frotasys.');defaults=bridge.config();}
catch(error){busy('Sessão indisponível',error.message);return;}
$('operation').replaceChildren(...[...defaults.operations,{value:'',label:'Todos'}].map(item=>new Option(item.label,item.value)));
q('.profile .details strong').textContent=defaults.name;q('.avatar').textContent=defaults.name.trim().charAt(0).toUpperCase()||'U';
$('live-mode').textContent=defaults.editable?'Edição ativa':'Somente leitura';
q('.footer span:last-child').textContent='Beta · '+(defaults.editable?'Edição ativa':'Somente leitura');
$('live-new').disabled=!defaults.editable;
$('live-new').onclick=()=>bridge.navigate('Nova viagem');
$('live-search-go').onclick=()=>bridge.navigate('Busca',$('live-search').value);
$('live-search').onkeydown=e=>{if(e.key==='Enter')$('live-search-go').click();};
qa('.navitem').forEach(item=>{const name=item.title;item.tabIndex=0;item.setAttribute('role','button');if(name==='Cadastros')item.title='Consulta Frete';if(name==='Registros')item.title='Lista de Espera';item.onclick=()=>bridge.navigate(name);item.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();item.click();}};if(name==='Usuários'&&!defaults.admin){item.hidden=true;}});
q('.profile').tabIndex=0;q('.profile').title='Sair';q('.profile').onclick=()=>bridge.navigate('Perfil');
document.addEventListener('keydown',e=>{if(e.key==='Escape')bridge.navigate('Operações');});
['start','end','operation'].forEach(id=>$(id).addEventListener('change',apply));$('reset').onclick=reset;$('empty-reset').onclick=reset;$('copy').onclick=copy;$('copy2').onclick=copy;$('export').onclick=exportCsv;$('print').onclick=()=>window.print();reset();
})();
