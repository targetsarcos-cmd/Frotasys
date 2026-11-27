/* Freight uses the workspace navigation and the authenticated trip application. */
(() => {
  const shell = document.getElementById('beta-shell');
  const page = document.getElementById('beta-fretes');
  const home = document.getElementById('navHome');
  const nav = shell.querySelector('[data-nav="Consulta Frete"]');
  const queue = document.getElementById('beta-espera');
  const queueNav = shell.querySelector('[data-nav="Lista de Espera"]');
  const settings = document.getElementById('beta-settings');
  const settingsNav = shell.querySelector('[data-nav="Configurações"]');
  prepareBetaSettingsPage();
  const users = document.getElementById('beta-users');
  const usersNav = shell.querySelector('[data-nav="Usuários"]');
  prepareBetaUsersPage();
  const form = document.getElementById('waitlist-form');
  document.getElementById('espera-cadastro').append(form);
  for (const group of form.querySelectorAll('.form-group')) {
    group.querySelector('label').htmlFor = group.querySelector('input,select').id;
  }
  const queueTable = document.querySelector('#waitlist-overlay .waitlist-table-wrap');
  queueTable.querySelector('th:last-child').textContent = 'Ações';
  document.getElementById('espera-fila').append(queueTable);
  const title = shell.querySelector('.shell-location strong');
  const homeTitle = title.textContent;
  const grid = document.getElementById('frete-consult-grid');
  page.append(grid);
  page.addEventListener('contextmenu',openFreteActions);
  // Keep focus until a pending edit is saved when moving directly to another cell.
  page.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    const field=event.target.closest('td,th')?.querySelector('[data-frete-field]');
    const active=page.querySelector('[data-frete-field][contenteditable="true"]');
    if(field && active && field!==active && isAdmin()&&!isBetaReadOnly())event.preventDefault();
  });
  page.addEventListener('click',async event=>{
    const field=event.target.closest('td,th')?.querySelector('[data-frete-field]');
    if(!field || freteBoardSaving || !isAdmin() || isBetaReadOnly())return;
    const active=page.querySelector('[data-frete-field][contenteditable="true"]');
    if(active && active!==field){
      const {routeIndex,rateGroup,rowIndex,freteField}=field.dataset;
      const route=freteRoutes()[Number(routeIndex)];
      const axis=route?.[rateGroup]?.[Number(rowIndex)]?.eixos;
      const editingRoute=active.dataset.freteField==='rota'&&active.dataset.routeIndex===routeIndex;
      const name=editingRoute?normalizeFreteRouteName(active.textContent):route?.rota;
      await commitFreteBoardEdit(active);
      if(field.isConnected){startFreteBoardEdit(field);return;}
      const nextRoute=freteRoutes().findIndex(r=>r.rota===name);
      if(nextRoute<0)return;
      const nextRow=freteRoutes()[nextRoute]?.[rateGroup]?.findIndex(r=>r.eixos===axis);
      const next=[...page.querySelectorAll('[data-frete-field]')].find(el=>Number(el.dataset.routeIndex)===nextRoute&&el.dataset.freteField===freteField&&(freteField==='rota'||el.dataset.rateGroup===rateGroup&&Number(el.dataset.rowIndex)===nextRow));
      if(next)startFreteBoardEdit(next);
      return;
    }
    startFreteBoardEdit(field);
  });
  page.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!=='F2')return;
    const field=event.target.closest('[data-frete-field]');
    if(!field||field.isContentEditable)return;
    if(startFreteBoardEdit(field))event.preventDefault();
  });

  function navigate() {
    const active = location.hash === '#fretes';
    const queueActive = location.hash === '#lista-espera';
    const settingsActive = location.hash === '#configuracoes';
    const usersActive = location.hash === '#usuarios';
    if(usersActive && state.userProfile && !isAdmin()){location.hash='';return;}
    users.hidden = !usersActive;
    settings.hidden = !settingsActive;
    queue.hidden = !queueActive;
    page.hidden = !active;
    shell.querySelector('main.workspace').hidden = active || queueActive || settingsActive || usersActive;
    title.textContent = active ? 'Tabela de Fretes' : queueActive ? 'Lista de Espera' : settingsActive ? 'Configurações' : usersActive ? 'Usuários' : homeTitle;
    for (const [button,selected] of [[home,!active && !queueActive && !settingsActive && !usersActive],[nav,active],[queueNav,queueActive],[settingsNav,settingsActive],[usersNav,usersActive]]) {
      button.classList.toggle('nav-current',selected);
      if (selected) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if(usersActive){closeTravelDrawer();if(state.userProfile&&isAdmin())loadUsers();window.scrollTo(0,0);}
    if (settingsActive) {
      closeTravelDrawer();
      if(state.userProfile){resetExportViagensForm();renderSettingsModal();}
      window.scrollTo(0,0);
    }
    if (queueActive) {
      closeTravelDrawer();
      prepareWaitlistForm();
      renderListaEspera();
      if (state.userProfile) loadListaEspera();
    }
    if (active) {
      closeTravelDrawer();
      renderFreteConsultas();
      if (state.userProfile) refreshFreteConsultas();
    }
  }
  home.addEventListener('click',() => { if (!page.hidden || !queue.hidden || !settings.hidden || !users.hidden) location.hash = ''; });
  window.addEventListener('hashchange',navigate);
  navigate();
})();

function startFreteBoardEdit(field) {
  if(!field?.isConnected || !isAdmin() || isBetaReadOnly() || freteBoardSaving)return false;
  if(field.isContentEditable)return true;
  field.setAttribute('contenteditable','true');
  field.setAttribute('spellcheck','false');
  field.focus();
  const range=document.createRange();
  range.selectNodeContents(field);
  const selection=window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function openFreteActions(event) {
  const cell = event.target.closest('td,th');
  const body = cell?.closest('tbody[data-route-index]');
  if (!body || cell.classList.contains('rate-category-gap') || !isAdmin() || isBetaReadOnly() || freteBoardSaving) return;
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('frete-actions')?.remove();
  const menu = document.createElement('div');
  menu.id = 'frete-actions';
  const index = Number(body.dataset.routeIndex);
  const field = cell.querySelector('[data-frete-field]');
  const group = cell.dataset.group;
  const rowIndex = Number(cell.parentElement.dataset.rowIndex);
  function action(label,run) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = () => {
      menu.remove();
      if (body.isConnected && isAdmin() && !isBetaReadOnly()) run();
    };
    menu.append(button);
  }
  if (field) action('Editar '+({rota:'rota',eixos:'eixos',pj:'valor PJ',pf:'valor PF'}[field.dataset.freteField]),() => startFreteBoardEdit(field));
  for (const [key,label] of [['agregado','Agregado'],['rows','Terceiros']]) {
    if (!group || group === key) action('Adicionar eixos · '+label,() => addFreteEixo(index,key));
  }
  if (group && field) action('Excluir eixos · '+(group === 'rows' ? 'Terceiros' : 'Agregado'),() => deleteFreteEixo(index,rowIndex,group));
  if (!group) action('Excluir rota',() => deleteFreteRoute(index));
  body.closest('.rate-scroll').append(menu);
  menu.style.left = Math.max(4,Math.min(event.clientX,window.innerWidth-menu.offsetWidth-4))+'px';
  menu.style.top = Math.max(4,Math.min(event.clientY,window.innerHeight-menu.offsetHeight-4))+'px';
  menu.firstElementChild.focus();
}

document.addEventListener('pointerdown',event => {
  const menu = document.getElementById('frete-actions');
  if (menu && !menu.contains(event.target)) menu.remove();
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape') document.getElementById('frete-actions')?.remove();
});
window.addEventListener('hashchange',() => document.getElementById('frete-actions')?.remove());

function renderBetaFreteQueryResult(route, eixo) {
  if (!route) return '<span class="is-error">Nenhuma rota cadastrada para essa combinação.</span>';
  const groups = [['agregado','Agregado'],['rows','Terceiros']];
  const fields = [['pf','Pessoa Física'],['pj','Pessoa Jurídica']];
  return groups.map(([key,label]) => {
    const row = route[key]?.find(item => Number(item.eixos) === eixo);
    const values = fields.map(([field,person]) => {
      const value = row?.[field];
      const available = Number.isFinite(parseFreteCurrency(value));
      return '<div class="beta-rate-value"><span>'+person+'</span><strong'+(available?'':' class="beta-rate-unavailable"')+'>'+(available?escapeHtml(formatFreteAccounting(value)):'Não cadastrado')+'</strong></div>';
    }).join('');
    return '<section class="beta-rate-result beta-rate-result-'+key+'" aria-label="'+label+'"><h4>'+label+'</h4><div class="beta-rate-values">'+values+'</div></section>';
  }).join('');
}

function renderBetaFreteBoard(routes) {
  const categoryGap = '<td class="rate-category-gap" aria-hidden="true"></td>';
  const sections = routes.map(route => {
    const index = freteRoutes().indexOf(route);
    function cells(key,i) {
      const row = route[key]?.[i];
      if (!row) return '<td colspan="3" data-group="'+key+'" class="rate-empty">&mdash;</td>';
      return ['eixos','pj','pf'].map(field => {
        const value = field === 'eixos' ? row.eixos : formatFreteAccounting(row[field]);
        return '<td data-group="'+key+'"><span tabindex="0" data-frete-field="'+field+'" data-rate-group="'+key+'" data-route-index="'+index+'" data-row-index="'+i+'" data-value="'+escapeAttr(value)+'">'+escapeHtml(value)+'</span></td>';
      }).join('');
    }
    const count = Math.max(route.agregado?.length || 0,route.rows.length,1);
    const name = '<th scope="rowgroup" rowspan="'+count+'"><span tabindex="0" data-frete-field="rota" data-route-index="'+index+'" data-value="'+escapeAttr(route.rota)+'">'+escapeHtml(route.rota)+'</span></th>';
    const rows = Array.from({length:count},(_,i) => '<tr data-row-index="'+i+'">'+(i===0?name:'')+categoryGap+cells('agregado',i)+categoryGap+cells('rows',i)+'</tr>').join('');
    return '<tbody class="rate-route" data-route-index="'+index+'">'+rows+'</tbody>';
  }).join('<tbody class="rate-gap" aria-hidden="true"><tr><td colspan="9"></td></tr></tbody>');
  const headers = '<th class="rate-category-gap" rowspan="2" aria-hidden="true"></th><th class="rate-category-title rate-agregado-title" scope="colgroup" colspan="3">Agregado</th><th class="rate-category-gap" rowspan="2" aria-hidden="true"></th><th class="rate-category-title rate-terceiros-title" scope="colgroup" colspan="3">Terceiros</th>';
  const columns = '<colgroup><col class="rate-route-col"></colgroup><colgroup><col class="rate-gap-col"></colgroup><colgroup><col class="rate-axis-col"><col><col></colgroup><colgroup><col class="rate-gap-col"></colgroup><colgroup><col class="rate-axis-col"><col><col></colgroup>';
  const fields = '<th class="rate-field-first" scope="col">Eixos</th><th scope="col">Valor PJ</th><th class="rate-field-last" scope="col">Valor PF</th>';
  return '<div class="rate-scroll"><table class="rate-table">'+columns+'<thead><tr><th class="rate-route-title" rowspan="2" scope="col"><button onclick="toggleFreteAlphabeticSort()">Rota ↕</button></th>'+headers+'</tr><tr>'+fields+fields+'</tr></thead>'+ (sections || '<tbody><tr><td colspan="9">Nenhuma rota encontrada.</td></tr></tbody>')+'</table></div>';
}
