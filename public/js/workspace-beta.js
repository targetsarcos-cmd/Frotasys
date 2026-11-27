/* The beta uses the existing Frotasys controls and trip rows inside the reference layout. */
(() => {
  const shell = document.getElementById('beta-shell');
  const byId = id => document.getElementById(id);
  const sections = [['agenciando','theadBooked'], ['arcos','thead'], ['concluidos',null]];
  const actionIcons = {
    eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    more:'<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    history:'<path d="M3 12a9 9 0 1 1 3 6.7M3 7v5h5M12 7v5l3 2"/>',
    send:'<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    chat:'<path d="M20 11.5a8 8 0 0 1-8 8H5l1.8-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8c.5 3 2 4.5 5 5l1-1.5M9 8l1.5-1"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v6M14 10v6"/>'
  };
  function decorateActions(row){
    const selectors=[
      ['.row-action-wrap > button','eye'],
      ['.row-action-menu summary','more'],
      ['.row-action-popover button:has(.table-history-icon)','history'],
      ['.row-action-popover .request-arrow-action','send'],
      ['.row-action-popover .conversation-action','chat'],
      ['.row-action-popover button:has(.table-copy-icon)','copy'],
      ['.row-action-popover button:has(.table-delete-icon)','trash']
    ];
    for(const [selector,name] of selectors){
      const control=row.querySelector(selector);
      if(!control||control.dataset.betaIcon)continue;
      control.dataset.betaIcon=name;
      control.innerHTML='<svg class="beta-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+actionIcons[name]+'</svg>';
      if(name==='more')control.title='Abrir ações';
    }
  }
  const typeStyles = {CARRETEIRO:'car','CARRETEIRO J':'carj',AGREGADO:'ag',FROTA:'frota',DEDICADO:'ded'};
  const statusGauge = document.createElement('div');
  statusGauge.className = 'beta-status-gauge';
  statusGauge.setAttribute('aria-hidden','true');
  shell.append(statusGauge);
  function syncStatusWidth() {
    const width = statusGauge.childElementCount ? statusGauge.offsetWidth : 48;
    if (width) shell.style.setProperty('--beta-status-width',width+'px');
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncStatusWidth).observe(statusGauge);
  let tab = 'all';
  let completedExpanded = false;
  function setCompletedExpanded(expanded) {
    completedExpanded = expanded;
    byId('completedContent').hidden = !expanded;
    byId('toggleCompleted').setAttribute('aria-expanded', String(expanded));
    byId('completedToggleLabel').textContent = expanded ? 'Recolher' : 'Expandir';
  }
  byId('toggleCompleted').onclick = () => {
    setCompletedExpanded(!completedExpanded);
    paintRows();
  };

  function adopt(targetId, sourceId, useMarkup = false) {
    const target = byId(targetId), source = byId(sourceId);
    if (useMarkup) {
      source.innerHTML = target.innerHTML;
      source.className = target.className;
    }
    target.replaceWith(source);
    return source;
  }

  const nav = { 'Lembretes':'btn-lembretes', 'Relatórios':'btn-relatorios', 'Consulta Frete':'btn-frete-consult',
    'Lista de Espera':'btn-lista-espera', 'Usuários':'btn-users-admin', 'Configurações':'btn-settings' };
  shell.querySelectorAll('[data-nav]').forEach(button => {
    button.onclick = event => {
      event.stopPropagation();
      byId(nav[button.dataset.nav]).click();
    };
  });
  byId('navHome').onclick = () => { if (document.body.classList.contains('reports-page-active')) closeReportsModal(); window.scrollTo(0,0); };
  byId('collapseNav').onclick = event => {
    const compact = shell.classList.toggle('nav-compact');
    const label = compact ? 'Expandir menu' : 'Recolher menu';
    event.currentTarget.setAttribute('aria-expanded', String(!compact));
    event.currentTarget.setAttribute('aria-label', label);
    event.currentTarget.querySelector('span').textContent = label;
  };
  byId('logout').onclick = () => byId('btn-logout').click();
  byId('newTrip').onclick = () => { if (canEditViagens()) byId('btn-nova-viagem').click(); };
  const reminder = document.createElement('div');
  reminder.className = 'header-reminder';
  const reminderPanel = byId('reminder-note');
  const reminderText = byId('reminder-text');
  const reminderStatus = byId('reminder-status');
  const reminderClose = byId('reminder-note-close');
  const reminderNav = shell.querySelector('[data-nav="Lembretes"]');
  reminderNav.setAttribute('aria-controls','reminder-note');
  reminderNav.setAttribute('aria-expanded','false');
  reminderPanel.setAttribute('role','region');
  reminderPanel.setAttribute('aria-labelledby','beta-reminder-title');
  reminderPanel.innerHTML = `
    <header class="beta-reminder-head">
      <svg class="beta-reminder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5h12v16H4V5h4m0 0V3h8v4H8zM8 11h8m-8 4h8"/></svg>
      <div><h2 id="beta-reminder-title">Lembretes</h2><p>Anotações operacionais</p></div>
      <div class="beta-reminder-close-slot"></div>
    </header>
    <div class="beta-reminder-body">
      <div class="beta-reminder-info"><span class="beta-reminder-indicator"></span><span>Nota compartilhada da operação</span></div>
      <div class="beta-reminder-editor"><label for="reminder-text">Anotações</label><div class="beta-reminder-text-slot"></div><div id="beta-reminder-count" class="beta-reminder-count">0 / 2.000 caracteres</div></div>
      <p class="beta-reminder-hint">Registre pendências, agendamentos e informações importantes para a equipe. As alterações são salvas automaticamente.</p>
    </div>
    <footer class="beta-reminder-footer"><div class="beta-reminder-status-slot"></div><span>Esc para fechar</span></footer>`;
  reminderClose.textContent = '×';
  reminderClose.title = 'Fechar lembretes';
  reminderText.placeholder = 'Escreva aqui as pendências e os lembretes da operação...';
  reminderStatus.setAttribute('role','status');
  reminderStatus.setAttribute('aria-live','polite');
  reminderPanel.querySelector('.beta-reminder-close-slot').append(reminderClose);
  reminderPanel.querySelector('.beta-reminder-text-slot').append(reminderText);
  reminderPanel.querySelector('.beta-reminder-status-slot').append(reminderStatus);
  reminderText.addEventListener('input',syncBetaReminderPanel);
  reminder.append(reminderPanel);
  shell.append(reminder, byId('travel-drawer'));
  syncBetaReminderPanel();
  const globalSearch = adopt('globalSearch','header-search-input');
  globalSearch.setAttribute('form', 'header-search-form');
  const advanced = byId('btn-advanced-search');
  advanced.setAttribute('aria-label','Busca avançada');
  advanced.replaceChildren(globalSearch.parentElement.querySelector('svg'));
  globalSearch.before(advanced);
  const op = adopt('operation','operation-filter');
  shell.querySelector('label[for=operation]').htmlFor = op.id;
  const date = adopt('date','date-picker');
  adopt('prev','btn-prev-date',true);
  adopt('next','btn-next-date',true);
  const weekday = adopt('today','date-weekday',true);
  weekday.setAttribute('aria-live','polite');
  renderDateWeekday();
  window.addEventListener('focus',renderDateWeekday);
  const filter = adopt('filterBtn','btn-trip-filters',true);
  filter.parentElement.classList.add('trip-filter-wrap');
  filter.after(byId('trip-filters'));
  const columns = adopt('colsBtn','btn-column-picker',true);
  columns.parentElement.classList.add('column-picker-wrap');
  columns.after(byId('column-picker-menu'));
  byId('export').onclick = () => { if (isAdmin()) exportCurrentDateExcel(); };
  byId('beta-breakdown').append(byId('summary-arcos'));

  function group(status) {
    const s = normalizeOption(status);
    if (s.includes('DESCARGA')) return 'dis';
    if (s.includes('ADIANTAMENTO')) return 'adv';
    if (s.includes('PROGRAMAR')) return 'planned';
    if (s.includes('AGUARDANDO CARREGAMENTO')) return 'wait';
    return '';
  }
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function decorate(row, trip) {
    row.classList.remove('is-sem-cadastro', 'is-conferir-motorista');
    window.FrotasysBetaComments.decorate(row, trip);
    decorateActions(row);
    const driver = row.querySelector('.driver-cell strong');
    if (driver) driver.className = 'driver';
    const type = row.querySelector('.type-chip');
    if (type) {
      type.removeAttribute('style');
      type.className = 'pill type-' + (typeStyles[type.textContent.trim()] || 'other');
    }
    const status = row.querySelector('.status-chip');
    if (status) {
      const value = normalizeOption(status.textContent);
      const style = value === 'AGENDAR DESCARGA' ? 'sched' : group(value);
      if (style) {
        status.removeAttribute('style');
        status.className = 'pill st-' + style;
      }
      status.classList.add('beta-status-bar');
    }
    const sched = row.querySelector('.schedule-chip');
    if (sched) sched.className = 'sched';
  }
  // Match the operational progression in tripStatus.js; completed trips keep their own section.
  const statusTabOrder = [
    'CONFERIR MOTORISTA', 'SEM CADASTRO', 'SEM CADASTRO / DT CRIADA',
    'CRIAR DT / PROGRAMAR', 'CRIAR DT', 'ENVIAR PEDIDO', 'PROGRAMAR',
    'AGUARDANDO CARREGAMENTO', 'EMITIR CTE', 'ADIANTAMENTO / DESCARGA',
    'ADIANTAMENTO', 'AGENDAR DESCARGA'
  ];
  function buildStatusTabCounts(scope) {
    const counts = new Map();
    for (const trip of scope) {
      const key = viagemStatusDisplay(trip);
      if (key && normalizeOption(key) !== 'CONCLUIDO') counts.set(key, (counts.get(key) || 0) + 1);
    }
    const rank = key => {
      const i = statusTabOrder.indexOf(normalizeOption(key));
      return i === -1 ? statusTabOrder.length : i;
    };
    return new Map([['all', scope.length], ...[...counts].sort((a,b) => rank(a[0]) - rank(b[0]))]);
  }
  function paintRows() {
    const scope = state.viagens.filter(tripInFilterScope);
    const index = new Map(scope.map(trip => [String(trip._id),trip]));
    const counts = buildStatusTabCounts(scope);
    if (!counts.has(tab)) tab = 'all';
    const term = normalize(byId('tableSearch').value.trim());
    const labels = new Set();
    let visible = 0, collapsedCompleted = 0;
    for (const [sec] of sections) {
      const table = byId('table-'+sec), body = byId('tbody-'+sec);
      let n = 0;
      for (const row of body.querySelectorAll('tr[data-id]')) {
        const trip = index.get(row.dataset.id);
        decorate(row, trip);
        const show = trip && (tab === 'all' || viagemStatusDisplay(trip) === tab) &&
          (!term || normalize(row.textContent + ' ' + (trip.frete || '') + ' ' + (trip.cte || '') + ' ' + BETA_INVOICE_FIELDS.map(key=>trip[key]||'').join(' ')).includes(term));
        row.hidden = !show;
        if (show) {
          n++;
          const badge = row.querySelector('.beta-status-bar');
          if (badge) labels.add(badge.textContent.trim());
        }
      }
      const separator = body.querySelector('.table-completion-separator');
      if (separator) separator.hidden = tab !== 'all' || !!term;
      const empty = table.parentElement.querySelector('.beta-empty');
      empty.hidden = n > 0 || !body.querySelector('tr[data-id]');
      if (sec === 'concluidos' && !completedExpanded) collapsedCompleted = n;
      else visible += n;
      const cols = visibleTableFields();
      const fields = [...cols,{key:'actions'}];
      const layout = window.FrotasysBetaTableLayout.layout(fields.map(f=>f.key));
      table.querySelector('colgroup').innerHTML = layout.columns.map(width=>'<col style="width:'+width+'">').join('');
      table.style.minWidth = layout.minWidth;
    }
    statusGauge.replaceChildren(...[...labels].map(label => {
      const sample = document.createElement('span');
      sample.textContent = label;
      return sample;
    }));
    syncStatusWidth();
    byId('footCount').textContent = 'Exibindo '+visible+' de '+scope.length+' viagens'+(collapsedCompleted ? ' · '+collapsedCompleted+' concluído(s) recolhido(s)' : '');
    const tabs = byId('tabs');
    const buttons = new Map([...tabs.children].map(button => [button.dataset.tab,button]));
    for (const [key,button] of buttons) if (!counts.has(key)) button.remove();
    let tabPosition = 0;
    for (const [key,count] of counts) {
      let button = buttons.get(key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab';
        button.dataset.tab = key;
        button.textContent = key === 'all' ? 'Todas' : key;
        button.append(document.createElement('small'));
      }
      if (tabs.children[tabPosition] !== button) tabs.insertBefore(button, tabs.children[tabPosition] || null);
      tabPosition++;
      const active = tab === key;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
      button.querySelector('small').textContent = count;
    }
    byId('filterCount').textContent = Object.keys(state.tripFilters).length || '';
    const active = byId('activeFilters');
    active.replaceChildren();
    for (const [field, values] of Object.entries(state.tripFilters)) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = (TRIP_FILTER_FIELDS[field] || field) + ' · ' + values.length + ' ×';
      chip.onclick = () => {
        delete state.tripFilters[field];
        const count = Object.keys(state.tripFilters).length;
        if (count) filter.dataset.count = String(count);
        else delete filter.dataset.count;
        filter.setAttribute('aria-label',count ? 'Filtrar viagens ('+count+' filtros ativos)' : 'Filtrar viagens');
        renderTable('arcos');
        renderTable('agenciando');
      };
      active.append(chip);
    }
    const name = loggedUserDisplayName();
    shell.querySelector('.username').textContent = name;
    shell.querySelector('.avatar').textContent = initialsFromName(name);
    byId('export').hidden = !isAdmin();
    shell.querySelector('[data-nav="Usuários"]').hidden = !isAdmin();
  }

  const openProductGroups = new Set();
  const matrixBody = byId('summaryBody');
  matrixBody.addEventListener('click', event => {
    const button = event.target.closest('button[data-product-group]');
    if (!button) return;
    const group = button.dataset.productGroup;
    const expanded = !openProductGroups.has(group);
    if (expanded) openProductGroups.add(group);
    else openProductGroups.delete(group);
    button.setAttribute('aria-expanded', String(expanded));
    for (const row of matrixBody.querySelectorAll('[data-product-detail="'+group+'"]')) row.hidden = !expanded;
  });

  function productBreakdown(cards, destinations, group) {
    const products = new Map();
    const orderedDestinations = [...destinations];
    for (const card of cards) {
      const rows = group === 'meta' ? card.metaProductRows : card.totalProductRows;
      for (const row of rows) {
        const key = normalizeOption(row.produto);
        if (!products.has(key)) products.set(key, {label:row.produto, values:new Map(), total:0});
        const product = products.get(key);
        product.total += row.total;
        card.columns.forEach(({destino}, index) => {
          product.values.set(destino,(product.values.get(destino) || 0) + row.values[index]);
        });
      }
    }
    return [...products.values()].map(product => {
      const cells = orderedDestinations.map(dest => '<td>'+formatKg(product.values.get(dest) || 0)+'</td>').join('');
      return '<tr class="product-detail" data-product-detail="'+group+'"'+(openProductGroups.has(group) ? '' : ' hidden')+'><td>'+escapeHtml(product.label)+'</td>'+cells+'<td>'+formatKg(product.total)+'</td></tr>';
    }).join('');
  }

  function paintSummary() {
    const cards = buildReportSummaryCards(state.viagens.filter(v => v.data === state.currentDate),
      state.metas,[state.currentDate],reportOperations(state.originFilter));
    const series = [['meta','Meta operacional'],['fat','Faturado'],['agenc','Agenciado'],['total','Total programado'],['falta','Falta para meta']];
    const totals = {meta:0,fat:0,agenc:0,total:0,falta:0};
    const dests = new Map();
    for (const card of cards) for (const col of card.columns) {
      if (!dests.has(col.destino)) dests.set(col.destino,{meta:0,fat:0,agenc:0,total:0,falta:0});
      for (const [key] of series) {
        totals[key] += col[key];
        dests.get(col.destino)[key] += col[key];
      }
    }
    const pct = value => totals.meta ? (100*value/totals.meta).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%' : '—';
    byId('reportContext').textContent = (state.originFilter ? operationName(state.originFilter) : 'Todos')+' · '+formatDateBR(state.currentDate);
    byId('summaryMetrics').innerHTML = series.map(([key,label]) => {
      const desc = key==='meta' ? 'Volume de referência' : key==='falta' ? 'Saldo da meta' : totals.meta ? pct(totals[key])+' da meta' : 'Sem meta no período';
      const style = key==='total' ? 'total' : key==='falta' && totals.falta>0 ? 'short' : '';
      return '<div class="metric '+style+'"><span class="metric-label">'+label+'</span><strong class="metric-value">'+formatKg(totals[key])+'</strong><span class="metric-desc">'+desc+'</span></div>';
    }).join('');
    const actual = totals.meta>0 ? Math.min(100,100*totals.fat/totals.meta) : 0;
    const booked = totals.meta>0 ? Math.min(100-actual,100*totals.agenc/totals.meta) : 0;
    byId('coverage').textContent = pct(totals.total);
    byId('progressActual').style.width = actual+'%';
    byId('progressBooked').style.width = booked+'%';
    byId('summaryHead').innerHTML = '<tr><th scope="col" aria-label="Indicador"></th>'+[...dests.keys()].map(d=>'<th>'+escapeHtml(d)+'</th>').join('')+'<th>Total</th></tr>';
    matrixBody.innerHTML = series.map(([key,label]) => {
      const details = key === 'meta' || key === 'total' ? productBreakdown(cards,dests.keys(),key) : '';
      const heading = details ? '<button type="button" class="product-toggle" data-product-group="'+key+'" aria-expanded="'+openProductGroups.has(key)+'" aria-label="'+label+' por produto">'+label+'</button>' : label;
      const values = [...dests.values(),totals].map(d=>'<td>'+formatKg(d[key])+'</td>').join('');
      return '<tr class="'+(key==='total'?'total-row':key==='meta'?'meta-row':'')+'"><td>'+heading+'</td>'+values+'</tr>'+details;
    }).join('');
  }
  for (const [sec,head] of sections) {
    const table = byId('table-'+sec);
    table.classList.remove('data-table');
    table.prepend(document.createElement('colgroup'));
    if (head) byId(head).closest('table').replaceWith(table);
    const empty = document.createElement('p');
    empty.className = 'beta-empty empty'; empty.hidden=true;
    empty.textContent = 'Nenhuma viagem para os critérios selecionados.';
    table.after(empty);
    const body = byId('tbody-'+sec);
    new MutationObserver(records => {
      if (records.some(record => record.target === body)) paintRows();
    }).observe(body,{childList:true});
  }
  byId('tableSearch').oninput = paintRows;
  byId('tabs').onclick = event => {
    const btn = event.target.closest('[data-tab]');
    if (btn) {
      tab = btn.dataset.tab;
      paintRows();
    }
  };
  new MutationObserver(paintSummary).observe(byId('summary-cards'),{childList:true});
  paintRows();
  paintSummary();
})();

function syncBetaReminderPanel() {
  const panel = document.getElementById('reminder-note');
  const input = document.getElementById('reminder-text');
  const count = document.getElementById('beta-reminder-count');
  const nav = document.querySelector('#beta-shell [data-nav="Lembretes"]');
  if (!panel || !input || !count || !nav) return;
  count.textContent = input.value.length.toLocaleString('pt-BR')+' / 2.000 caracteres';
  const open = !panel.classList.contains('hidden');
  nav.setAttribute('aria-expanded',String(open));
  document.body.classList.toggle('beta-reminder-open',open);
}
