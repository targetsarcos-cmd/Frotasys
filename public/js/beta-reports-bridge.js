/* Same-origin report page uses the authenticated application's existing data model. */
(() => {
  'use strict';
  let frame=null, previousFocus=null, previousInert=false;
  const nav={'Operações':'navHome','Lembretes':'btn-lembretes','Cadastros':'btn-frete-consult','Registros':'btn-lista-espera','Usuários':'btn-users-admin','Configurações':'btn-settings','Menu':'collapseNav','Nova viagem':'btn-nova-viagem','Perfil':'btn-logout'};
  function open(){
    if(frame)return;
    previousFocus=document.activeElement;
    closeTravelDrawer();
    frame=document.createElement('iframe');
    frame.id='beta-reports-page';
    frame.title='Relatórios operacionais';
    frame.src='/beta/relatorios';
    document.body.classList.add('beta-report-reference-active');
    document.body.append(frame);
    const shell=document.getElementById('beta-shell');
    previousInert=!!shell?.inert;
    if(shell)shell.inert=true;
    frame.focus();
  }
  function close(){
    if(!frame)return;
    frame.remove();frame=null;
    document.body.classList.remove('beta-report-reference-active');
    const shell=document.getElementById('beta-shell');
    if(shell)shell.inert=previousInert;
    previousFocus?.focus?.();previousFocus=null;
  }
  function authorized(){return !!frame&&isBetaTripWorkspace()&&!!state.userProfile;}
  function config(){
    if(!authorized())throw Error('Sessão indisponível.');
    const origins=originList();
    const operation=origins.find(o=>normalizeOption(o)===normalizeOption(state.originFilter))||origins[0]||'';
    const today=state.currentDate||todayStr();
    const name=document.querySelector('#beta-shell .username')?.textContent||'Usuário';
    return {operations:origins.map(value=>({value,label:operationName(value)})),operation,start:monthStartStr(today),end:today,name,editable:canEditViagens(),admin:isAdmin()};
  }
  async function load(filters){
    if(!authorized())throw Error('Sessão indisponível.');
    const {start,end,operation}=filters;
    if(!isValidDateRange(start,end))throw Error('Informe um período válido de até 366 dias.');
    if(operation&&!originList().includes(operation))throw Error('Operação inválida.');
    const params=new URLSearchParams({dataInicio:start,dataFim:end});
    const metaParams=new URLSearchParams(params);
    if(operation){params.set('origem',operation);metaParams.set('tipo',metaTipo(operation));}
    const [viagens,metas]=await Promise.all([apiFetch('/api/viagens/search?'+params),apiFetch('/api/metas?'+metaParams)]);
    if(!Array.isArray(viagens)||!Array.isArray(metas))throw Error('Não foi possível carregar os relatórios.');
    const report=buildReportsData(viagens,metas,{start,end,operation});
    // Only expose aggregates to the report frame, not individual trip data.
    return {metaTotal:report.metaTotal,fatTotal:report.fatTotal,agencTotal:report.agencTotal,
      destinos:report.destinos,typeCounts:report.typeCounts,rowCount:report.rows.length,
      operationLabel:operation?operationName(operation):'Todos',filters:{start,end,operation}};
  }
  function navigate(action,value){
    if(!authorized())return;
    if(action==='Relatórios')return;
    if(action==='Nova viagem'&&!canEditViagens())return;
    if(action==='Usuários'&&!isAdmin())return;
    close();
    if(action==='Busca'){
      const input=document.getElementById('header-search-input');
      if(input){input.value=String(value||'');document.getElementById('header-search-form')?.requestSubmit();}
      return;
    }
    if(nav[action])document.getElementById(nav[action])?.click();
  }
  window.FrotasysBetaReports={open,close,config,load,navigate};
})();
