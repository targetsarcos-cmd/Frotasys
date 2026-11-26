/* The beta uses the existing Frotasys controls and trip rows inside the reference layout. */
(() => {
  const shell = document.getElementById('beta-shell');
  const byId = id => document.getElementById(id);
  const sections = [['agenciando','theadBooked','countBooked'], ['arcos','thead','countBilled'], ['concluidos',null,'countCompleted']];
  const widths = {placa:8,nome:13,tipo:10,origem:8,destino:9,peso:7,agendamento:9,frete:6,status:17,trabalho:10};
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
  const reminder = document.createElement('div');
  reminder.className = 'header-reminder';
  reminder.append(byId('reminder-note'));
  shell.append(reminder, byId('travel-drawer'));
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
  byId('today').onclick = () => { date.value = todayStr(); date.dispatchEvent(new Event('change')); };
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
  function decorate(row) {
    const plate = row.querySelector('.master-plate');
    if (plate) plate.className = 'plate';
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
  function paintRows() {
    const scope = state.viagens.filter(tripInFilterScope);
    const index = new Map(scope.map(trip => [String(trip._id),trip]));
    const counts = new Map([['all',scope.length]]);
    for (const trip of scope) {
      const key = viagemStatusDisplay(trip);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    if (!counts.has(tab)) tab = 'all';
    const term = normalize(byId('tableSearch').value.trim());
    const labels = new Set();
    let visible = 0, collapsedCompleted = 0;
    for (const [sec,,countId] of sections) {
      const table = byId('table-'+sec), body = byId('tbody-'+sec);
      let n = 0;
      for (const row of body.querySelectorAll('tr[data-id]')) {
        const trip = index.get(row.dataset.id);
        decorate(row);
        const show = trip && (tab === 'all' || viagemStatusDisplay(trip) === tab) &&
          (!term || normalize(row.textContent + ' ' + (trip.frete || '') + ' ' + (trip.cte || '') + ' ' + (trip.nota || '')).includes(term));
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
      byId(countId).textContent = n + (n === 1 ? ' registro' : ' registros');
      if (sec === 'concluidos' && !completedExpanded) collapsedCompleted = n;
      else visible += n;
      const cols = visibleTableFields();
      const fields = [...cols,{key:'actions'}];
      const weight = fields.reduce((sum,f)=>sum+(f.key==='status' ? 0 : widths[f.key] || 7),0);
      table.querySelector('colgroup').innerHTML = fields.map(f => {
        const width = f.key === 'status' ? 'var(--beta-status-column)' :
          'calc((100% - var(--beta-status-column)) * '+((widths[f.key] || 7)/weight)+')';
        return '<col style="width:'+width+'">';
      }).join('');
      table.style.minWidth = Math.max(1000,cols.length*105)+'px';
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
    for (const [key,count] of counts) {
      let button = buttons.get(key);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tab';
        button.dataset.tab = key;
        button.textContent = key === 'all' ? 'Todas' : key;
        button.append(document.createElement('small'));
        tabs.append(button);
      }
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
    byId('summaryHead').innerHTML = '<tr><th>Volume (kg)</th>'+[...dests.keys()].map(d=>'<th>'+escapeHtml(d)+'</th>').join('')+'<th>Total</th></tr>';
    matrixBody.innerHTML = series.map(([key,label]) => {
      const details = key === 'meta' || key === 'total' ? productBreakdown(cards,dests.keys(),key) : '';
      const heading = details ? '<button type="button" class="product-toggle" data-product-group="'+key+'" aria-expanded="'+openProductGroups.has(key)+'" aria-label="'+label+' por produto">'+label+'</button>' : label;
      const values = [...dests.values(),totals].map(d=>'<td>'+formatKg(d[key])+'</td>').join('');
      return '<tr class="'+(key==='total'?'total-row':'')+'"><td>'+heading+'</td>'+values+'</tr>'+details;
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
      if (normalizeOption(tab) === 'CONCLUIDO') setCompletedExpanded(true);
      paintRows();
    }
  };
  new MutationObserver(paintSummary).observe(byId('summary-cards'),{childList:true});
  paintRows();
  paintSummary();
})();
