// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  viagens: [],
  metas: [],
  currentDate: todayStr(),
  originFilter: '',
  editingId: null,
  editingOperationId: null,
  ctxTargetId: null,
  agendamentoTargetId: null,
  productSummaryOpen: true,
  collapsedMetaProducts: {},
  collapsedTotalProducts: {},
  operacoes: [],
  configOptions: {},
  configColors: {},
  tableSort: { field: '', direction: 'asc' },
  ws: null
};

const DEFAULT_DESTINOS = ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA'];
const DEFAULT_OPERACOES = [
  { origem: 'ARCOS', metaTipo: 'arcos', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS },
  { origem: 'PEDRO LEOPOLDO', metaTipo: 'pedro_leopoldo', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS },
  { origem: 'BARROSO', metaTipo: 'barroso', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS }
];
const STATUS = ['CRIANDO DT', 'CADASTRANDO', 'AGUARDANDO CARREGAMENTO', 'MANIFESTO', 'CONCLUIDO'];
const DEFAULT_PRODUTOS = ['CPII-F', 'CPIII', 'CPV'];

const DEFAULT_CONFIG_OPTIONS = {
  tipo: ['AGREGADO', 'CARRETEIRO', 'DEDICADO', 'FROTA'],
  produto: DEFAULT_PRODUTOS,
  carroceria: ['GRADE BAIXA', 'BAU', 'SIDER', 'TANQUE', 'GRANELEIRO'],
  pamcard: ['PAMCARD OK', 'FECHAMENTO', 'SEM PAMCARD'],
  status: STATUS,
  origem: DEFAULT_OPERACOES.map(op => op.origem),
  destino: DEFAULT_DESTINOS
};

const CONFIG_FIELDS = [
  { key: 'tipo', label: 'TIPO' },
  { key: 'produto', label: 'PRODUTO' },
  { key: 'carroceria', label: 'CARROCERIA' },
  { key: 'pamcard', label: 'PAMCARD' },
  { key: 'status', label: 'STATUS' },
  { key: 'origem', label: 'ORIGEM' },
  { key: 'destino', label: 'DESTINO' }
];

const CONFIG_COLOR_KEY = 'frota-config-colors';
const CONFIG_COLOR_FIELDS = ['tipo', 'status'];
const DEFAULT_CONFIG_COLORS = {
  tipo: {
    AGREGADO: '#9a6500',
    CARRETEIRO: '#c93434',
    DEDICADO: '#0891b2',
    FROTA: '#16803f'
  },
  status: {
    'CRIANDO DT': '#4f46e5',
    CADASTRANDO: '#0f766e',
    'AGUARDANDO CARREGAMENTO': '#b7791f',
    MANIFESTO: '#2563eb',
    CONCLUIDO: '#16803f'
  }
};
const FALLBACK_CONFIG_COLORS = ['#2563eb', '#16803f', '#b7791f', '#c93434', '#0f766e', '#4f46e5', '#c05621', '#0891b2'];

const SEARCH_RESULT_FIELDS = [
  { key: 'placa', label: 'PLACA' },
  { key: 'nome', label: 'NOME' },
  { key: 'tipo', label: 'TIPO' },
  { key: 'produto', label: 'PRODUTO' },
  { key: 'secao', label: 'REGISTRO' },
  { key: 'carroceria', label: 'CARROCERIA' },
  { key: 'pamcard', label: 'PAMCARD' },
  { key: 'status', label: 'STATUS' },
  { key: 'usuario', label: 'USUÁRIO' },
  { key: 'agendamento', label: 'AGENDAMENTO' },
  { key: 'telefone', label: 'TELEFONE' },
  { key: 'frete', label: 'FRETE' },
  { key: 'origem', label: 'ORIGEM' },
  { key: 'destino', label: 'DESTINO' },
  { key: 'peso', label: 'PESO' },
  { key: 'dt', label: 'DT' },
  { key: 'cte', label: 'CT-E' },
  { key: 'manifesto', label: 'MANIFESTO' },
  { key: 'contrato', label: 'CONTRATO' },
  { key: 'nota', label: 'NOTA' },
  { key: 'num_pedagio', label: 'Nº PEDÁGIO' },
  { key: 'vlr_pedagio', label: 'VALOR PEDÁGIO' },
  { key: 'horas', label: 'HORAS' },
  { key: 'obs', label: 'OBSERVAÇÃO' },
  { key: 'data', label: 'DATA' },
  { key: 'createdAt', label: 'CRIADO EM' }
];

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('date-picker').value = state.currentDate;
  state.configColors = loadConfigColors();
  initWS();
  initUI();
  loadAll();
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function initWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${proto}://${location.host}`;
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    document.getElementById('ws-status').className = 'ws-status online';
    document.getElementById('ws-status').textContent = 'Conectado';
  };

  state.ws.onclose = () => {
    document.getElementById('ws-status').className = 'ws-status offline';
    document.getElementById('ws-status').textContent = 'Desconectado';
    setTimeout(initWS, 3000);
  };

  state.ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleWsMessage(msg);
  };
}

function handleWsMessage(msg) {
  const { type, payload } = msg;
  if (type === 'viagem_criada') {
    if (payload.data === state.currentDate) {
      state.viagens.push(payload);
      renderAll();
    }
  } else if (type === 'viagem_atualizada') {
    const idx = state.viagens.findIndex(v => v._id === payload._id);
    if (idx !== -1) {
      state.viagens[idx] = payload;
    } else if (payload.data === state.currentDate) {
      state.viagens.push(payload);
    }
    renderAll();
  } else if (type === 'viagem_removida') {
    state.viagens = state.viagens.filter(v => v._id !== payload._id);
    renderAll();
  } else if (type === 'meta_atualizada') {
    const idx = state.metas.findIndex(m => m._id === payload._id);
    if (idx !== -1) state.metas[idx] = payload;
    else state.metas.push(payload);
    renderSummary();
  } else if (type === 'operacao_criada') {
    state.operacoes.push(payload);
    renderAll();
  } else if (type === 'operacao_atualizada') {
    if (!payload) return loadAll();
    const idx = state.operacoes.findIndex(op => op._id === payload._id);
    if (idx !== -1) state.operacoes[idx] = payload;
    else state.operacoes.push(payload);
    renderAll();
  } else if (type === 'operacao_removida') {
    state.operacoes = state.operacoes.filter(op => op._id !== payload._id);
    renderAll();
  } else if (type === 'config_atualizada') {
    state.configOptions = normalizeConfigOptions(payload);
    loadAll();
  }
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [viagens, metas, operacoes, configOptions] = await Promise.all([
    apiFetch(`/api/viagens?data=${state.currentDate}`),
    apiFetch(`/api/metas?data=${state.currentDate}`),
    apiFetch('/api/operacoes'),
    apiFetch('/api/config-options')
  ]);
  state.viagens = viagens || [];
  state.metas = metas || [];
  state.configOptions = normalizeConfigOptions(configOptions);
  state.operacoes = normalizeOperacoes(operacoes);
  renderAll();
}

async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Não foi possível salvar.');
      return null;
    }
    return data;
  } catch (e) {
    console.error('API error:', e);
    return null;
  }
}

// ─── UI INIT ──────────────────────────────────────────────────────────────────
function initUI() {
  document.getElementById('date-picker').addEventListener('change', e => {
    state.currentDate = e.target.value;
    loadAll();
  });
  document.getElementById('btn-prev-date').addEventListener('click', () => changeDate(-1));
  document.getElementById('btn-next-date').addEventListener('click', () => changeDate(1));

  document.getElementById('btn-search-load').addEventListener('click', openSearchModal);
  document.getElementById('search-modal-close').addEventListener('click', closeSearchModal);
  document.getElementById('search-btn-close').addEventListener('click', closeSearchModal);
  document.getElementById('search-btn').addEventListener('click', searchCarregamento);
  document.getElementById('search-cte').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchCarregamento();
  });
  document.getElementById('search-nota').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchCarregamento();
  });
  document.getElementById('search-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('search-modal-overlay')) closeSearchModal();
  });

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-btn-close').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-modal-overlay')) closeSettingsModal();
  });

  document.getElementById('btn-nova-viagem').addEventListener('click', () => openModal());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  document.getElementById('btn-save').addEventListener('click', saveViagem);
  document.getElementById('f-agendamento').addEventListener('input', e => {
    e.target.value = maskHourInput(e.target.value);
  });
  document.getElementById('f-telefone').addEventListener('input', e => {
    e.target.value = maskPhoneListInput(e.target.value);
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  document.getElementById('op-modal-close').addEventListener('click', closeOperationModal);
  document.getElementById('op-btn-cancel').addEventListener('click', closeOperationModal);
  document.getElementById('op-btn-save').addEventListener('click', saveOperation);
  document.getElementById('op-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('op-modal-overlay')) closeOperationModal();
  });

  document.getElementById('origin-filters').addEventListener('click', e => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    state.originFilter = btn.dataset.origin;
    document.querySelectorAll('.filter-chip').forEach(item => item.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.ctx-menu')) hideCtxMenu();
    if (!e.target.closest('#agendamento-menu')) hideAgendamentoMenu();
    if (e.target.matches('input, select, button')) return;
    const td = e.target.closest('td[data-field]:not(.cell-select)');
    if (td && td.classList.contains('quick-edit')) startInlineEdit(td);
  });

  document.addEventListener('contextmenu', e => {
    const td = e.target.closest('td[data-field="agendamento"]:not(.cell-select)');
    if (!td) return;
    e.stopPropagation();
    showAgendamentoMenu(e, td);
  }, true);

  document.getElementById('ctx-edit').addEventListener('click', () => {
    if (state.ctxTargetId) editViagem(state.ctxTargetId);
  });
  document.getElementById('ctx-delete').addEventListener('click', () => {
    if (state.ctxTargetId) deleteViagem(state.ctxTargetId);
  });
  document.getElementById('agendamento-mark').addEventListener('click', toggleAgendamentoVerde);
  document.getElementById('agendamento-edit').addEventListener('click', () => {
    const id = state.agendamentoTargetId;
    hideAgendamentoMenu();
    if (!id) return;
    const cell = document.querySelector(`td[data-field="agendamento"][data-id="${CSS.escape(id)}"]`);
    if (cell) startInlineEdit(cell);
  });

  document.addEventListener('dblclick', e => {
    const td = e.target.closest('td[data-field]:not(.cell-select)');
    if (td) startInlineEdit(td);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeSearchModal();
      closeSettingsModal();
      hideCtxMenu();
      hideAgendamentoMenu();
      cancelInlineEdit();
    }
  });
}

function openSearchModal() {
  document.getElementById('search-modal-overlay').classList.remove('hidden');
  document.getElementById('search-cte').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal-overlay').classList.add('hidden');
}

async function searchCarregamento() {
  const cteTerm = v('search-cte');
  const notaTerm = v('search-nota');
  const status = document.getElementById('search-status');
  const results = document.getElementById('search-results');
  if (!cteTerm && !notaTerm) {
    status.textContent = 'Informe um CT-E ou uma NOTA para buscar.';
    results.innerHTML = '';
    return;
  }

  const btn = document.getElementById('search-btn');
  btn.textContent = 'Buscando...';
  btn.disabled = true;
  status.textContent = '';
  results.innerHTML = '';

  const found = await fetchCarregamentosByNotaOrCte({ cte: cteTerm, nota: notaTerm });
  btn.textContent = 'Buscar';
  btn.disabled = false;

  if (!found || found.length === 0) {
    status.textContent = 'Nenhum carregamento encontrado para esse CT-E ou NOTA.';
    return;
  }

  status.textContent = `${found.length} ${found.length === 1 ? 'carregamento encontrado' : 'carregamentos encontrados'}.`;
  results.innerHTML = found.map(renderSearchResult).join('');
}

async function fetchCarregamentosByNotaOrCte({ cte, nota }) {
  const normalizedCte = normalizeSearchTerm(cte);
  const normalizedNota = normalizeSearchTerm(nota);
  const params = new URLSearchParams();
  if (cte) params.set('cte', cte);
  if (nota) params.set('nota', nota);
  const searchUrl = `/api/viagens/search?${params.toString()}`;

  try {
    const res = await fetch(searchUrl, { headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Busca dedicada indisponível, usando busca local.', e);
  }

  const allViagens = await apiFetch('/api/viagens');
  if (!Array.isArray(allViagens)) return [];
  return allViagens
    .filter(viagem => {
      const nota = normalizeSearchTerm(viagem.nota);
      const cte = normalizeSearchTerm(viagem.cte);
      if (normalizedCte && !cte.includes(normalizedCte)) return false;
      if (normalizedNota && !nota.includes(normalizedNota)) return false;
      return true;
    })
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function normalizeSearchTerm(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function renderSearchResult(viagem) {
  const title = viagem.nota || viagem.cte || viagem.nome || viagem.placa || 'Carregamento';
  const subtitle = [viagem.origem, viagem.destino].filter(Boolean).join(' → ');
  const fields = SEARCH_RESULT_FIELDS.map(field => `
    <div class="search-result-field">
      <span>${escapeHtml(field.label)}</span>
      <strong>${escapeHtml(formatSearchValue(field.key, viagem[field.key]))}</strong>
    </div>
  `).join('');

  return `<section class="search-result-card">
    <div class="search-result-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle || 'Sem origem/destino')}</span>
      </div>
      <em>${escapeHtml(formatSearchValue('data', viagem.data))}</em>
    </div>
    <div class="search-result-grid">${fields}</div>
  </section>`;
}

function formatSearchValue(field, value) {
  if (value === null || value === undefined || value === '') return '-';
  if (field === 'secao') return value === 'arcos' ? 'FATURADO' : value === 'agenciando' ? 'AGENCIADO' : value;
  if (field === 'data') return formatDateBR(value);
  if (field === 'createdAt') return formatDateTimeBR(value);
  return formatCellValue(field, value);
}

function initDragAndDrop() {
  document.querySelectorAll('.drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      const secao = zone.dataset.dropSecao;
      if (!id || !secao) return;

      const viagem = state.viagens.find(v => v._id === id);
      if (!viagem || viagem.secao === secao) return;
      await updateViagemField(id, 'secao', secao);
    });
  });
}

function handleRowDragStart(event, id) {
  event.dataTransfer.setData('text/plain', id);
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.classList.add('dragging');
}

function handleRowDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.drop-zone.drag-over').forEach(zone => zone.classList.remove('drag-over'));
}

function changeDate(delta) {
  const d = new Date(state.currentDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  state.currentDate = d.toISOString().split('T')[0];
  document.getElementById('date-picker').value = state.currentDate;
  loadAll();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderAll() {
  syncDynamicSelects();
  renderOriginFilters();
  renderTable('arcos');
  renderTable('agenciando');
  renderSummary();
}

function renderOriginFilters() {
  const filters = document.getElementById('origin-filters');
  if (!filters) return;

  const origins = originList();
  if (!origins.includes(state.originFilter)) {
    state.originFilter = origins[0] || '';
  }

  filters.innerHTML = origins
    .map(origem => `<button class="filter-chip ${originSlug(origem)} ${state.originFilter === origem ? 'active' : ''}" data-origin="${escapeAttr(origem)}">${escapeHtml(titleCase(origem))}</button>`)
    .join('');
}

const FIELDS = [
  { key: 'placa', label: 'PLACA', quick: true },
  { key: 'nome', label: 'NOME', quick: true },
  { key: 'tipo', label: 'TIPO', select: true },
  { key: 'produto', label: 'PRODUTO', select: true },
  { key: 'carroceria', label: 'CARROCERIA', select: true },
  { key: 'pamcard', label: 'PAMCARD', select: true },
  { key: 'status', label: 'STATUS', select: true },
  { key: 'usuario', label: 'USUÁRIO', quick: true },
  { key: 'agendamento', label: 'AGENDAMENTO', quick: true, time: true },
  { key: 'telefone', label: 'TELEFONE', quick: true },
  { key: 'frete', label: 'FRETE', quick: true },
  { key: 'origem', label: 'ORIGEM', select: true },
  { key: 'destino', label: 'DESTINO', select: true },
  { key: 'peso', label: 'PESO', quick: true, number: true },
  { key: 'dt', label: 'DT', quick: true },
  { key: 'cte', label: 'CT-E', quick: true },
  { key: 'manifesto', label: 'MANIFESTO', quick: true },
  { key: 'contrato', label: 'CONTRATO', quick: true },
  { key: 'nota', label: 'NOTA', quick: true },
  { key: 'num_pedagio', label: 'Nº PED', quick: true },
  { key: 'vlr_pedagio', label: 'VLR PED', quick: true, money: true },
  { key: 'horas', label: 'HORAS', quick: true, time: true },
  { key: 'obs', label: 'OBSERVAÇÃO', quick: true },
  { key: 'data', label: 'DATA', quick: true, date: true }
];

function renderTable(secao) {
  renderTableHeader(secao);
  const tbody = document.getElementById(`tbody-${secao}`);
  const rows = filteredRows(secao);
  const count = document.getElementById(`count-${secao}`);

  if (count) count.textContent = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${FIELDS.length + 1}" class="empty-state">Nenhum registro para ${formatDateBR(state.currentDate)}</td></tr>`;
    updateStickyColumnWidths(document.getElementById(`table-${secao}`));
    return;
  }

  tbody.innerHTML = rows.map(v => {
    const originClass = originSlug(v.origem);
    const completeClass = hasDocumentosCompletos(v) ? 'is-documentos-completos' : '';
    const semCadastroClass = secao === 'agenciando' && isStatusSemCadastro(v.status) ? 'is-sem-cadastro' : '';
    const cells = FIELDS.map(f => renderCell(v, f)).join('');

    return `<tr data-id="${escapeHtml(v._id)}" class="origin-row ${originClass} ${completeClass} ${semCadastroClass}" oncontextmenu="showCtxMenu(event,'${escapeAttr(v._id)}')">
      ${cells}
      <td>
        <div class="row-actions">
          <button class="btn-row" onclick="copyViagem(event,'${escapeAttr(v._id)}')" title="Copiar dados">COPIAR</button>
          <button class="btn-row" onclick="editViagem('${escapeAttr(v._id)}')" title="Editar">Editar</button>
          <button class="btn-row danger" onclick="deleteViagem('${escapeAttr(v._id)}')" title="Excluir">Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  updateStickyColumnWidths(document.getElementById(`table-${secao}`));
}

function updateStickyColumnWidths(table) {
  if (!table) return;

  const measureField = (field, minWidth) => {
    const cells = [...table.querySelectorAll(`th[data-field="${field}"], td[data-field="${field}"]`)];
    return cells.reduce((width, cell) => Math.max(width, Math.ceil(cell.scrollWidth)), minWidth);
  };

  table.style.setProperty('--sticky-placa-width', `${measureField('placa', 132)}px`);
  table.style.setProperty('--sticky-nome-width', `${measureField('nome', 142)}px`);
}

function renderTableHeader(secao) {
  const table = document.getElementById(`table-${secao}`);
  const headRow = table?.querySelector('thead tr');
  if (!headRow) return;

  headRow.innerHTML = `${FIELDS.map(field => {
    const active = state.tableSort.field === field.key ? 'is-sorted' : '';
    const arrow = active ? (state.tableSort.direction === 'asc' ? ' ↑' : ' ↓') : '';
    const label = `${field.label}${arrow}`;
    return `<th class="${active}" data-field="${escapeAttr(field.key)}" title="Clique para ordenar por ${escapeAttr(field.label)}">${escapeHtml(label)}</th>`;
  }).join('')}<th class="col-actions"></th>`;

  headRow.querySelectorAll('th[data-field]').forEach(th => {
    th.onclick = () => sortTableBy(th.dataset.field);
  });
}

function hasDocumentosCompletos(viagem) {
  return ['cte', 'nota', 'manifesto', 'contrato'].every(field => String(viagem[field] || '').trim() !== '');
}

function hasNotaPreenchida(viagem) {
  return String(viagem?.nota || '').trim() !== '';
}

function isStatusSemCadastro(status) {
  return normalizeOption(status) === 'SEM CADASTRO';
}

function renderCell(v, field) {
  const raw = field.key === 'tipo' ? normalizeTipo(v[field.key]) : (v[field.key] || '');
  const safeRaw = escapeAttr(raw);

  if (field.select) {
    const cls = field.key === 'origem' ? originSlug(raw) : field.key === 'status' ? statusSlug(raw) : field.key === 'tipo' ? tipoSlug(raw) : '';
    const style = selectColorStyle(field.key, raw);
    return `<td class="cell-select cell-${field.key}" data-field="${field.key}" data-id="${escapeAttr(v._id)}">
      <select class="table-select ${cls}" style="${escapeAttr(style)}" data-field="${field.key}" data-id="${escapeAttr(v._id)}" onchange="updateInlineSelect(this)">
        ${renderOptions(getSelectOptions(field.key), raw)}
      </select>
    </td>`;
  }

  let display = raw;
  if (field.money && raw !== '') display = formatMoney(raw);
  if (field.number && raw !== '') display = formatPeso(raw);
  if (field.time && raw !== '') display = normalizeHours(raw);
  if (field.date && raw !== '') display = formatDateBR(raw);
  if (field.key === 'telefone') display = firstPhone(raw);

  if (field.key === 'placa') {
    const canPromote = v.secao === 'agenciando';
    return `<td data-field="${field.key}" data-id="${escapeAttr(v._id)}" data-raw="${safeRaw}" class="quick-edit placa-cell">
      <span class="placa-content">
        <button class="promote-row-btn ${canPromote ? '' : 'is-disabled'}" onclick="promoteToFaturado(event,'${escapeAttr(v._id)}')" title="${canPromote ? 'Enviar para faturado' : 'Já está faturado'}">↑</button>
        <span>${escapeHtml(display)}</span>
      </span>
    </td>`;
  }

  let cls = field.quick ? 'quick-edit' : '';
  if (field.key === 'agendamento' && v.agendamentoVerde) cls += ' has-agendamento';
  if (field.key === 'frete') {
    const upper = String(raw).toUpperCase();
    if (upper.includes('TEM KAN-GURU') || upper.includes('TEM KANGURU')) cls += ' has-kanguru';
    if (upper.includes('SEM KANGURU')) cls += ' sem-kanguru';
  }

  const title = field.key === 'telefone' && phoneList(raw).length > 1 ? ` title="${escapeAttr(raw)}"` : '';
  return `<td data-field="${field.key}" data-id="${escapeAttr(v._id)}" data-raw="${safeRaw}" class="${cls.trim()}"${title}>${escapeHtml(display)}</td>`;
}

function renderOptions(options, selected) {
  const selectedNorm = normalizeOption(selected);
  return options.map(opt => {
    const label = opt || '-';
    const isSelected = normalizeOption(opt) === selectedNorm ? 'selected' : '';
    return `<option value="${escapeAttr(opt)}" ${isSelected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function getSelectOptions(field) {
  if (field === 'tipo') return ['', ...configOptionList('tipo')];
  if (field === 'produto') return ['', ...productList()];
  if (field === 'carroceria') return ['', ...configOptionList('carroceria')];
  if (field === 'pamcard') return ['', ...configOptionList('pamcard')];
  if (field === 'status') return ['', ...configOptionList('status')];
  if (field === 'origem') return ['', ...originList()];
  if (field === 'destino') return ['', ...destinationList()];
  return [''];
}

function normalizeOption(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function normalizeConfigOptions(options = {}) {
  return CONFIG_FIELDS.reduce((acc, field) => {
    const values = Array.isArray(options[field.key])
      ? options[field.key]
      : DEFAULT_CONFIG_OPTIONS[field.key];
    acc[field.key] = [...new Set(values.map(item => String(item || '').trim().toUpperCase()).filter(Boolean))];
    return acc;
  }, {});
}

function configOptionList(field) {
  const values = state.configOptions[field];
  return Array.isArray(values) ? values : DEFAULT_CONFIG_OPTIONS[field] || [];
}

function normalizeOperacoes(operacoes) {
  const list = Array.isArray(operacoes) ? operacoes : DEFAULT_OPERACOES;
  return list.map((op, index) => ({
    ...op,
    origem: String(op.origem || `OPERACAO ${index + 1}`).trim().toUpperCase(),
    metaTipo: op.metaTipo || metaTipo(op.origem),
    produtos: normalizeProducts(op.produtos),
    resumoProdutos: normalizeCardSelection(op.resumoProdutos, productList()),
    resumoDestinos: normalizeCardSelection(op.resumoDestinos, destinationList()),
    ordem: Number(op.ordem) || index + 1
  })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.origem.localeCompare(b.origem));
}

function operationsList() {
  return normalizeOperacoes(state.operacoes);
}

function originList() {
  const operationOrigins = operationsList().map(op => op.origem).filter(Boolean);
  return operationOrigins.length ? operationOrigins : configOptionList('origem');
}

function productList() {
  return configOptionList('produto');
}

function destinationList() {
  return configOptionList('destino');
}

function normalizeProducts(produtos) {
  const raw = Array.isArray(produtos) ? produtos : String(produtos || '').split(',');
  const cleaned = raw.map(item => String(item || '').trim().toUpperCase()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : productList();
}

function normalizeCardSelection(values, allowed) {
  const allowedList = Array.isArray(allowed) ? allowed : [];
  const allowedNorms = new Set(allowedList.map(normalizeOption));
  const raw = Array.isArray(values) ? values : String(values || '').split(',');
  const selectedNorms = raw
    .map(item => String(item || '').trim().toUpperCase())
    .filter(item => item && allowedNorms.has(normalizeOption(item)))
    .map(normalizeOption);
  const selected = new Set(selectedNorms);
  return selected.size ? allowedList.filter(item => selected.has(normalizeOption(item))) : [...allowedList];
}

function summaryProductsForOperation(operacao) {
  return normalizeCardSelection(operacao?.resumoProdutos, productList());
}

function summaryDestinationsForOperation(operacao) {
  return normalizeCardSelection(operacao?.resumoDestinos, destinationList());
}

function findOperation(id) {
  return operationsList().find(op => op._id === id || op.metaTipo === id || op.origem === id);
}

function syncDynamicSelects() {
  ['tipo', 'produto', 'carroceria', 'pamcard', 'status', 'origem', 'destino'].forEach(field => {
    setSelectOptions(document.getElementById(`f-${field}`), getSelectOptions(field));
  });
}

function setSelectOptions(select, options) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = options.map(opt => `<option value="${escapeAttr(opt)}">${escapeHtml(opt || '-')}</option>`).join('');
  if (options.includes(current)) select.value = current;
}

function openSettingsModal() {
  renderSettingsModal();
  document.getElementById('settings-modal-overlay').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settings-modal-overlay').classList.add('hidden');
}

function renderSettingsModal() {
  renderSettingsOperations();
  const grid = document.getElementById('settings-grid');
  grid.innerHTML = CONFIG_FIELDS.map(field => {
    const values = configOptionList(field.key);
    const hasColors = CONFIG_COLOR_FIELDS.includes(field.key);
    return `<section class="settings-section ${hasColors ? 'has-colors' : ''}" data-field="${field.key}">
      <div class="settings-section-head">
        <strong>${field.label}</strong>
        <span>${values.length} itens${hasColors ? ' - cores editáveis' : ''}</span>
      </div>
      <div class="settings-add-row">
        <input type="text" id="settings-input-${field.key}" placeholder="Adicionar ${field.label.toLowerCase()}">
        <button type="button" onclick="addConfigOption('${field.key}')">Adicionar</button>
      </div>
      <div class="settings-list">
        ${values.map((value, index) => `<div class="settings-item">
          <span>${escapeHtml(value)}</span>
          ${hasColors ? renderConfigColorPicker(field.key, value) : ''}
          <div class="settings-order-actions">
            <button type="button" class="settings-move-btn" onclick="moveConfigOption('${field.key}', ${index}, -1)" ${index === 0 ? 'disabled' : ''} title="Subir">↑</button>
            <button type="button" class="settings-move-btn" onclick="moveConfigOption('${field.key}', ${index}, 1)" ${index === values.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
          </div>
          <button type="button" onclick="deleteConfigOption('${field.key}','${escapeAttr(value)}')" title="Excluir">Excluir</button>
        </div>`).join('')}
      </div>
    </section>`;
  }).join('');
}

function renderSettingsOperations() {
  const container = document.getElementById('settings-operations');
  if (!container) return;
  const operations = operationsList();
  container.innerHTML = `<section class="settings-section settings-operations-section">
    <div class="settings-section-head">
      <strong>OPERAÇÕES</strong>
      <span>${operations.length} itens</span>
    </div>
    <div class="settings-operation-actions">
      <button type="button" class="btn-add-operation" onclick="openOperationModal()">Adicionar operação</button>
    </div>
    <div class="settings-operation-list">
      ${operations.map(op => {
        const id = escapeAttr(op._id || op.metaTipo || op.origem);
        const label = escapeHtml(titleCase(op.origem));
        return `<div class="settings-operation-chip">
          <button type="button" class="settings-operation-edit" onclick="openOperationModal('${id}')" title="Editar operação">${label}</button>
          <button type="button" class="settings-operation-delete" onclick="deleteOperation('${id}')" title="Excluir operação" aria-label="Excluir operação ${escapeAttr(titleCase(op.origem))}">×</button>
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function renderConfigColorPicker(field, value) {
  const color = configColor(field, value);
  return `<label class="settings-color-control" title="Cor de ${escapeAttr(value)}">
    <input type="color" value="${escapeAttr(color)}" data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}" onchange="setConfigColor(this.dataset.field, this.dataset.value, this.value)">
    <span style="${escapeAttr(colorPreviewStyle(color))}"></span>
  </label>`;
}

function setConfigColor(field, value, color) {
  if (!CONFIG_COLOR_FIELDS.includes(field) || !isHexColor(color)) return;
  const normalized = normalizeOption(value);
  state.configColors[field] = { ...(state.configColors[field] || {}), [normalized]: color };
  saveConfigColors();
  renderAll();
  renderSettingsModal();
}

async function addConfigOption(field) {
  const input = document.getElementById(`settings-input-${field}`);
  const value = String(input?.value || '').trim().toUpperCase();
  if (!value) return;
  const updated = await apiFetch(`/api/config-options/${field}`, {
    method: 'POST',
    body: JSON.stringify({ value })
  });
  if (!updated) return;
  state.configOptions = normalizeConfigOptions(updated);
  input.value = '';
  renderSettingsModal();
  await loadAll();
}

async function deleteConfigOption(field, value) {
  const updated = await apiFetch(`/api/config-options/${field}/${encodeURIComponent(value)}`, { method: 'DELETE' });
  if (!updated) return;
  state.configOptions = normalizeConfigOptions(updated);
  renderSettingsModal();
  await loadAll();
}

async function deleteOperation(operationId) {
  const op = findOperation(operationId);
  if (!op?._id) return;
  if (!confirm(`Excluir a operação "${titleCase(op.origem)}"?`)) return;

  const removed = await apiFetch(`/api/operacoes/${op._id}`, { method: 'DELETE' });
  if (!removed) return;
  state.operacoes = state.operacoes.filter(item => item._id !== op._id);
  renderSettingsModal();
  await loadAll();
}

async function moveConfigOption(field, index, direction) {
  const values = [...configOptionList(field)];
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= values.length) return;
  [values[index], values[targetIndex]] = [values[targetIndex], values[index]];

  const updated = await apiFetch(`/api/config-options/${field}/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ values })
  });
  if (!updated) return;
  state.configOptions = normalizeConfigOptions(updated);
  renderSettingsModal();
  await loadAll();
}

function filteredRows(secao) {
  return sortRows(state.viagens
    .filter(v => v.secao === secao)
    .filter(v => v.data === state.currentDate)
    .filter(v => !state.originFilter || v.origem === state.originFilter));
}

function sortTableBy(fieldKey) {
  const field = FIELDS.find(item => item.key === fieldKey);
  if (!field) return;
  const sameField = state.tableSort.field === fieldKey;

  state.tableSort = {
    field: fieldKey,
    direction: sameField && state.tableSort.direction === 'asc' ? 'desc' : 'asc'
  };
  renderTable('arcos');
  renderTable('agenciando');
}

function sortRows(rows) {
  const { field, direction } = state.tableSort;
  if (!field) return rows;

  const modifier = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const primary = sortValue(a, field).localeCompare(sortValue(b, field), 'pt-BR', {
      numeric: true,
      sensitivity: 'base'
    });
    if (primary) return primary * modifier;

    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function sortValue(viagem, field) {
  const value = viagem[field] || '';
  if (field === 'tipo') return normalizeTipo(value);
  if (field === 'status') return normalizeOption(value) === 'CONCLUIDO' ? 'CONCLUIDO' : value;
  return formatCellValue(field, value);
}

function renderSummary() {
  updateSummaryTable();
}

function updateSummaryTable() {
  const container = document.getElementById('summary-cards');
  if (!container) return;

  const visibleOperations = operationsList().filter(op => !state.originFilter || op.origem === state.originFilter);
  container.innerHTML = visibleOperations.map(op => renderOriginSummaryCard(op)).join('');

  container.querySelectorAll('.editable-meta').forEach(cell => {
    cell.onclick = () => startMetaEdit(cell);
  });
}

function renderOriginSummaryCard(operacao) {
  const origem = operacao.origem;
  const produtos = summaryProductsForOperation(operacao);
  const destinos = summaryDestinationsForOperation(operacao);
  const productSet = new Set(produtos.map(normalizeOption));
  const summaryRows = state.viagens.filter(v => v.data === state.currentDate && v.origem === origem && productSet.has(normalizeOption(v.produto)));
  const faturadoRows = summaryRows.filter(v => v.secao === 'arcos' && hasNotaPreenchida(v));
  const agenciadoRows = summaryRows.filter(v => v.secao === 'agenciando' || (v.secao === 'arcos' && !hasNotaPreenchida(v)));
  const totals = { meta: 0, fat: 0, agenc: 0, total: 0, falta: 0 };

  const metaCells = [];
  const fatCells = [];
  const agencCells = [];
  const totalCells = [];
  const faltaCells = [];

  destinos.forEach(dest => {
    const metaVal = getMetaValue(operacao, dest, produtos);
    const fatVal = sumPeso(faturadoRows.filter(v => v.destino === dest));
    const agencVal = sumPeso(agenciadoRows.filter(v => v.destino === dest));
    const totalVal = fatVal + agencVal;
    const faltaVal = metaVal - totalVal;

    totals.meta += metaVal;
    totals.fat += fatVal;
    totals.agenc += agencVal;
    totals.total += totalVal;
    totals.falta += faltaVal;

    metaCells.push(`<td>${formatKg(metaVal)}</td>`);
    fatCells.push(`<td>${formatKg(fatVal)}</td>`);
    agencCells.push(`<td>${formatKg(agencVal)}</td>`);
    totalCells.push(`<td>${formatKg(totalVal)}</td>`);
    faltaCells.push(`<td>${formatKg(faltaVal)}</td>`);
  });

  const operationKey = operacao._id || metaTipo(origem);
  const metaCollapsed = state.collapsedMetaProducts[operationKey] !== false;
  const totalCollapsed = state.collapsedTotalProducts[operationKey] !== false;
  const metaProductRows = produtos.map(produto => renderMetaProductRowsForCard(produto, operacao, metaCollapsed, destinos)).join('');
  const totalProductRows = produtos.map(produto => renderTotalProductRowsForCard(produto, faturadoRows, agenciadoRows, totalCollapsed, destinos)).join('');
  const percent = totals.meta > 0 ? Math.max(0, Math.min(100, Math.round((totals.total / totals.meta) * 100))) : 0;
  const accentClass = cardAccentClass(origem);
  const metaTitle = metaCollapsed ? 'Mostrar meta por tipo de cimento' : 'Ocultar meta por tipo de cimento';
  const totalTitle = totalCollapsed ? 'Mostrar carregado por produto' : 'Ocultar carregado por produto';

  return `<article class="summary-card ${accentClass} origin-card-${originSlug(origem)}" data-operation-id="${escapeAttr(operationKey)}">
    <div class="summary-card-table-wrap">
      <table class="summary-card-table">
        <thead>
          <tr><th>TIPO DE PRODUTO</th>${destinos.map(dest => `<th>${escapeHtml(dest)}</th>`).join('')}<th>TOTAL</th></tr>
        </thead>
        <tbody>
          <tr class="card-row-meta"><td><button type="button" class="card-row-toggle card-meta-toggle" onclick="toggleCardMetaProducts('${escapeAttr(operationKey)}')" title="${metaTitle}"><span class="card-product-arrow">${metaCollapsed ? '▶' : '▼'}</span><span>META</span></button></td>${metaCells.join('')}<td>${formatKg(totals.meta)}</td></tr>
          ${metaProductRows}
          <tr class="card-row-fat"><td><span class="row-icon">▣</span>FATURADO</td>${fatCells.join('')}<td>${formatKg(totals.fat)}</td></tr>
          <tr class="card-row-agenc"><td><span class="row-icon">●</span>AGENCIADO</td>${agencCells.join('')}<td>${formatKg(totals.agenc)}</td></tr>
          <tr class="card-row-total"><td><button type="button" class="card-row-toggle card-total-toggle" onclick="toggleCardTotalProducts('${escapeAttr(operationKey)}')" title="${totalTitle}"><span class="card-product-arrow">${totalCollapsed ? '▶' : '▼'}</span><span>TOTAL</span></button></td>${totalCells.join('')}<td>${formatKg(totals.total)}</td></tr>
          ${totalProductRows}
          <tr class="card-row-falta"><td><span class="row-icon">⊖</span>FALTA</td>${faltaCells.join('')}<td>${formatKg(totals.falta)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="summary-card-top">
      <div class="summary-operation">
        <div class="summary-icon">${summaryIcon(origem)}</div>
        <div>
          <span class="summary-card-kicker">Operação</span>
          <strong>${escapeHtml(origem)}</strong>
        </div>
      </div>
      <div class="summary-kpis">
        ${renderSummaryKpi('META', totals.meta, 'meta')}
        ${renderSummaryKpi('FATURADO', totals.fat, 'fat')}
        ${renderSummaryKpi('AGENCIADO', totals.agenc, 'agenc')}
        ${renderSummaryKpi('TOTAL', totals.total, 'total')}
        ${renderSummaryKpi('FALTA', totals.falta, 'falta')}
      </div>
      <div class="summary-card-actions">
        <button class="summary-config-btn" onclick="openOperationModal('${escapeAttr(operacao._id || '')}')" title="Configurar visualização do card">⚙</button>
        <div class="summary-percent" style="--percent:${percent}">
          <span>${percent}%</span>
        </div>
        <small>% da Meta</small>
      </div>
    </div>
  </article>`;
}

function renderSummaryKpi(label, value, kind) {
  return `<div class="summary-kpi ${kind}">
    <span>${label}</span>
    <strong>${formatKg(value)}</strong>
  </div>`;
}

function summaryIcon(origem) {
  const normalized = normalizeOption(origem);
  if (normalized === 'ARCOS') return '◔';
  if (normalized === 'PEDRO LEOPOLDO') return '▦';
  if (normalized === 'BARROSO') return '◇';
  return '□';
}

function cardAccentClass(origem) {
  const normalized = normalizeOption(origem);
  if (normalized === 'ARCOS') return 'card-blue';
  if (normalized === 'PEDRO LEOPOLDO') return 'card-purple';
  if (normalized === 'BARROSO') return 'card-green';
  return 'card-blue';
}

function renderMetaProductRowsForCard(produto, operacao, collapsed, destinos) {
  let total = 0;
  const cells = destinos.map(dest => {
    const meta = getProductMetaValue(operacao, dest, produto);
    total += meta;
    return `<td class="editable-meta" data-operation-id="${escapeAttr(operacao._id || '')}" data-origin="${escapeAttr(operacao.origem)}" data-dest="${escapeAttr(dest)}" data-product="${escapeAttr(produto)}">${formatKg(meta)}</td>`;
  }).join('');
  return `<tr class="card-product-row card-meta-product-row ${collapsed ? 'collapsed' : ''}"><td>${escapeHtml(produto)}</td>${cells}<td>${formatKg(total)}</td></tr>`;
}

function renderTotalProductRowsForCard(produto, faturadoRows, agenciadoRows, collapsed, destinos) {
  const rows = [...faturadoRows, ...agenciadoRows];
  let total = 0;
  const cells = destinos.map(dest => {
    const peso = sumPeso(rows.filter(v => normalizeOption(v.produto) === normalizeOption(produto) && v.destino === dest));
    total += peso;
    return `<td>${formatKg(peso)}</td>`;
  }).join('');
  return `<tr class="card-product-row card-total-product-row ${collapsed ? 'collapsed' : ''}"><td>${escapeHtml(produto)}</td>${cells}<td>${formatKg(total)}</td></tr>`;
}

function toggleCardMetaProducts(operationKey) {
  state.collapsedMetaProducts[operationKey] = state.collapsedMetaProducts[operationKey] !== false ? false : true;
  renderSummary();
}

function toggleCardTotalProducts(operationKey) {
  state.collapsedTotalProducts[operationKey] = state.collapsedTotalProducts[operationKey] !== false ? false : true;
  renderSummary();
}

function getMetaValue(operacao, dest, produtos = summaryProductsForOperation(operacao)) {
  return produtos
    .reduce((sum, produto) => sum + getProductMetaValue(operacao, dest, produto), 0);
}

function getProductMetaValue(operacao, dest, produto) {
  const tipo = operacao.metaTipo || metaTipo(operacao.origem);
  const metaDoc = state.metas.find(m =>
    m.destino === dest &&
    m.tipo === tipo &&
    m.data === state.currentDate &&
    normalizeOption(m.produto) === normalizeOption(produto)
  );
  return metaDoc ? parseNumber(metaDoc.valor) : 0;
}

function renderProductSummary(rows) {
  const productRows = document.querySelectorAll('.product-summary-row');
  const toggle = document.getElementById('btn-product-summary');
  const arrow = toggle?.querySelector('.product-summary-arrow');

  if (arrow) arrow.textContent = state.productSummaryOpen ? '▾' : '▸';
  productRows.forEach(row => row.classList.toggle('collapsed', !state.productSummaryOpen));

  productList().forEach(produto => {
    const row = document.querySelector(`.product-summary-row[data-product="${produto}"]`);
    if (!row) return;
    let total = 0;

    destinationList().forEach(dest => {
      const peso = sumPeso(rows.filter(v => v.produto === produto && v.destino === dest));
      total += peso;
      setSummaryCell(row, dest, formatKg(peso));
    });

    setTotalCell(row, formatKg(total));
  });
}

function toggleProductSummary() {
  state.productSummaryOpen = !state.productSummaryOpen;
  renderProductSummary([...filteredRows('arcos'), ...filteredRows('agenciando')]);
}

function setSummaryCell(row, dest, value) {
  const cell = row?.querySelector(`td[data-dest="${dest}"]`);
  if (cell) cell.textContent = value;
}

function setTotalCell(row, value) {
  const cells = row?.querySelectorAll('td');
  if (cells?.[5]) cells[5].textContent = value;
}

function startMetaEdit(cell) {
  if (cell.querySelector('input')) return;
  const cur = parseNumber(cell.textContent);
  const dest = cell.dataset.dest;
  const produto = cell.dataset.product || '';
  const origem = cell.dataset.origin || 'ARCOS';
  const operation = findOperation(cell.dataset.operationId) || operationsList().find(op => op.origem === origem);
  cell.innerHTML = `<input type="number" value="${escapeAttr(cur)}" step="1">`;
  const inp = cell.querySelector('input');
  inp.focus();
  inp.select();
  inp.onblur = async () => {
    const next = parseNumber(inp.value);
    cell.textContent = formatKg(next);
    await saveMeta(dest, next, operation, produto);
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') cell.textContent = formatKg(cur);
  };
}

async function saveMeta(dest, value, operacao = null, produto = '') {
  if (!dest) return;
  const metaKey = operacao ? (operacao.metaTipo || metaTipo(operacao.origem)) : 'arcos';
  const payload = { data: state.currentDate, destino: dest, tipo: metaKey, valor: value || 0 };
  if (produto) payload.produto = produto;
  const updated = await apiFetch('/api/metas', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!updated) return;
  const idx = state.metas.findIndex(m => m._id === updated._id);
  if (idx !== -1) state.metas[idx] = updated;
  else state.metas.push(updated);
  renderSummary();
}

function metaTipo(origem) {
  const normalized = normalizeOption(origem);
  if (normalized === 'ARCOS') return 'arcos';
  if (normalized === 'PEDRO LEOPOLDO') return 'pedro_leopoldo';
  if (normalized === 'BARROSO') return 'barroso';
  return normalized.toLowerCase().replace(/\s+/g, '_');
}

function renderMetasForm() {
  const form = document.getElementById('metas-form');
  form.innerHTML = destinationList().map(dest => {
    const metaDoc = state.metas.find(m => m.destino === dest && m.tipo === 'arcos' && m.data === state.currentDate);
    const val = metaDoc ? metaDoc.valor : '';
    return `<div class="meta-item">
      <label>${dest}</label>
      <input type="number" data-dest="${dest}" value="${escapeAttr(val)}" placeholder="0">
    </div>`;
  }).join('');
}

function renderMetaChart(faturadoRows, agenciadoRows) {
  const chart = document.getElementById('meta-chart');
  if (!chart) return;

  chart.innerHTML = destinationList().map(dest => {
    const metaDoc = state.metas.find(m => m.destino === dest && m.tipo === 'arcos' && m.data === state.currentDate);
    const metaVal = metaDoc ? parseFloat(metaDoc.valor) || 0 : 0;
    const faturado = sumPeso(faturadoRows.filter(v => v.destino === dest));
    const agenciado = sumPeso(agenciadoRows.filter(v => v.destino === dest));
    const realizado = faturado + agenciado;
    const percent = metaVal > 0 ? Math.min(100, Math.round((realizado / metaVal) * 100)) : 0;
    const falta = Math.max(metaVal - realizado, 0);

    return `<div class="meta-chart-item">
      <div class="meta-chart-head">
        <span>${dest}</span>
        <strong>${formatKg(realizado)} / ${formatKg(metaVal)}</strong>
      </div>
      <div class="meta-chart-track">
        <div class="meta-chart-fill" style="width:${percent}%"></div>
      </div>
      <div class="meta-chart-foot">
        <span>${percent}% da meta</span>
        <span>${metaVal === 0 ? 'sem meta' : falta > 0 ? `${formatKg(falta)} falta` : 'meta batida'}</span>
      </div>
    </div>`;
  }).join('');
}

function renderTransportChart(faturadoRows) {
  const chart = document.getElementById('transport-chart');
  if (!chart) return;

  const metaTotal = state.metas
    .filter(m => m.tipo === 'arcos' && m.data === state.currentDate)
    .reduce((sum, item) => sum + parseNumber(item.valor), 0);

  const types = [
    { key: 'AGREGADO', label: 'Agregado', className: 'tipo-agregado' },
    { key: 'CARRETEIRO', label: 'Carreteiro', className: 'tipo-carreteiro' },
    { key: 'DEDICADO', label: 'Dedicado', className: 'tipo-dedicado' },
    { key: 'FROTA', label: 'Frota', className: 'tipo-frota' }
  ];

  chart.innerHTML = types.map(type => {
    const peso = sumPeso(faturadoRows.filter(v => normalizeTipo(v.tipo) === type.key));
    const percent = metaTotal > 0 ? Math.min(100, Math.round((peso / metaTotal) * 100)) : 0;

    return `<div class="transport-chart-item">
      <div class="transport-chart-head">
        <span class="transport-dot ${type.className}"></span>
        <strong>${type.label}</strong>
        <em>${percent}%</em>
      </div>
      <div class="transport-chart-track">
        <div class="transport-chart-fill ${type.className}" style="width:${percent}%"></div>
      </div>
      <div class="transport-chart-value">${formatKg(peso)} carregado</div>
    </div>`;
  }).join('');
}

// ─── INLINE EDIT ──────────────────────────────────────────────────────────────
let activeInlineCell = null;

async function updateInlineSelect(select) {
  const id = select.dataset.id;
  const field = select.dataset.field;
  const value = normalizeFieldValue(field, select.value);
  select.disabled = true;
  const updated = await updateViagemField(id, field, value);
  select.disabled = false;
  if (!updated) renderAll();
}

async function promoteToFaturado(event, id) {
  event.stopPropagation();
  const viagem = state.viagens.find(v => v._id === id);
  if (!viagem || viagem.secao === 'arcos') return;
  await updateViagemField(id, 'secao', 'arcos');
}

function startInlineEdit(td) {
  if (activeInlineCell) cancelInlineEdit();
  const field = td.dataset.field;
  const id = td.dataset.id;
  const cur = td.dataset.raw ?? td.textContent.trim();
  activeInlineCell = td;

  const inputType = field === 'peso' || field === 'vlr_pedagio' ? 'number' : field === 'data' ? 'date' : 'text';
  const step = field === 'peso' ? '0.001' : field === 'vlr_pedagio' ? '0.01' : '';
  const placeholder = inputPlaceholder(field);
  td.innerHTML = `<input type="${inputType}" value="${escapeAttr(cur)}" ${step ? `step="${step}"` : ''} ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ''}>`;
  const inp = td.querySelector('input');
  inp.focus();
  inp.select();
  if (field === 'telefone') {
    inp.oninput = () => { inp.value = maskPhoneListInput(inp.value); };
  }
  if (field === 'horas' || field === 'agendamento') {
    inp.oninput = () => { inp.value = maskHourInput(inp.value); };
  }
  inp.onkeydown = e => {
    if (e.key === 'Enter') commitInlineEdit(td, id, field, inp.value);
    if (e.key === 'Escape') {
      td.textContent = formatCellValue(field, cur);
      activeInlineCell = null;
    }
  };
  inp.onblur = () => {
    if (activeInlineCell === td) commitInlineEdit(td, id, field, inp.value);
  };
}

async function commitInlineEdit(td, id, field, value) {
  activeInlineCell = null;
  const normalized = normalizeFieldValue(field, value);
  const viagem = state.viagens.find(item => item._id === id);
  const previous = viagem ? (viagem[field] || '') : (td.dataset.raw || '');
  const updated = await updateViagemField(id, field, normalized);
  if (!updated) {
    td.dataset.raw = previous;
    td.textContent = formatCellValue(field, previous);
  }
}

async function updateViagemField(id, field, value) {
  const updated = await apiFetch(`/api/viagens/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [field]: value })
  });
  if (updated) {
    const idx = state.viagens.findIndex(v => v._id === id);
    if (idx !== -1) state.viagens[idx] = updated;
    renderAll();
  }
  return updated;
}

function cancelInlineEdit() {
  if (!activeInlineCell) return;
  const v = state.viagens.find(item => item._id === activeInlineCell.dataset.id);
  if (v) activeInlineCell.textContent = formatCellValue(activeInlineCell.dataset.field, v[activeInlineCell.dataset.field] || '');
  activeInlineCell = null;
}

function normalizeFieldValue(field, value) {
  if (field === 'horas' || field === 'agendamento') return normalizeHours(value);
  if (field === 'telefone') return normalizePhoneList(value);
  if (field === 'status') return normalizeOption(value) === 'CONCLUIDO' ? 'CONCLUIDO' : value;
  if (field === 'tipo') return normalizeTipo(value);
  if (field === 'data') return String(value || '').trim();
  return String(value || '').trim();
}

function formatCellValue(field, value) {
  if (field === 'vlr_pedagio' && value !== '') return formatMoney(value);
  if (field === 'peso' && value !== '') return formatPeso(value);
  if ((field === 'horas' || field === 'agendamento') && value !== '') return normalizeHours(value);
  if (field === 'telefone' && value !== '') return firstPhone(value);
  if (field === 'data' && value !== '') return formatDateBR(value);
  return value || '';
}

function inputPlaceholder(field) {
  if (field === 'telefone') return '(00) 00000-0000 / (00) 00000-0000';
  if (field === 'horas' || field === 'agendamento') return '00:00';
  return '';
}

function loadConfigColors() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_COLOR_KEY) || '{}');
    return mergeConfigColors(saved);
  } catch (e) {
    return mergeConfigColors({});
  }
}

function saveConfigColors() {
  localStorage.setItem(CONFIG_COLOR_KEY, JSON.stringify(state.configColors));
}

function mergeConfigColors(saved = {}) {
  return CONFIG_COLOR_FIELDS.reduce((acc, field) => {
    acc[field] = {};
    Object.entries(DEFAULT_CONFIG_COLORS[field] || {}).forEach(([value, color]) => {
      acc[field][normalizeOption(value)] = color;
    });
    Object.entries(saved[field] || {}).forEach(([value, color]) => {
      if (isHexColor(color)) acc[field][normalizeOption(value)] = color;
    });
    return acc;
  }, {});
}

function configColor(field, value) {
  const normalized = normalizeOption(value);
  if (!normalized) return '#64748b';
  const saved = state.configColors?.[field]?.[normalized];
  if (isHexColor(saved)) return saved;
  const paletteIndex = Math.abs(hashText(normalized)) % FALLBACK_CONFIG_COLORS.length;
  return FALLBACK_CONFIG_COLORS[paletteIndex];
}

function selectColorStyle(field, value) {
  if (!CONFIG_COLOR_FIELDS.includes(field) || !value) return '';
  const color = configColor(field, value);
  return colorPreviewStyle(color);
}

function colorPreviewStyle(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return '';
  return `color:${color};border-color:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .34);background:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .10);`;
}

function hexToRgb(color) {
  const match = String(color || '').match(/^#([0-9a-f]{6})$/i);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function isHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || ''));
}

function hashText(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(viagem = null) {
  syncDynamicSelects();
  state.editingId = viagem ? viagem._id : null;
  document.getElementById('modal-title').textContent = viagem ? 'Editar Viagem' : 'Nova Viagem';
  const fields = ['placa','nome','tipo','produto','secao','carroceria','pamcard','status','usuario','agendamento','telefone','frete','origem','destino','peso','obs'];
  fields.forEach(f => {
    const el = document.getElementById(`f-${f.replace('_','-')}`);
    if (!el) return;
    el.value = viagem ? (f === 'tipo' ? normalizeTipo(viagem[f]) : (viagem[f] || '')) : (f === 'secao' ? 'agenciando' : '');
  });
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('f-placa').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingId = null;
}

function openOperationModal(operationId = null) {
  const op = operationId ? findOperation(operationId) : null;
  state.editingOperationId = op?._id || null;
  document.getElementById('op-modal-title').textContent = op ? 'Configurar Card de Resumo' : 'Adicionar Operação';
  document.getElementById('op-origem').value = op ? op.origem : '';
  const saveBtn = document.getElementById('op-btn-save');
  saveBtn.dataset.label = op ? 'Salvar Card' : 'Salvar Operação';
  saveBtn.textContent = saveBtn.dataset.label;
  renderOperationCardChoices(op);

  document.getElementById('op-modal-overlay').classList.remove('hidden');
  document.getElementById('op-origem').focus();
}

function renderOperationCardChoices(op = null) {
  const selectedProducts = new Set((op ? summaryProductsForOperation(op) : productList()).map(normalizeOption));
  const selectedDestinations = new Set((op ? summaryDestinationsForOperation(op) : destinationList()).map(normalizeOption));
  renderOperationChoiceGroup('op-produtos-grid', productList(), selectedProducts, 'produto');
  renderOperationChoiceGroup('op-destinos-grid', destinationList(), selectedDestinations, 'destino');
}

function renderOperationChoiceGroup(elementId, values, selected, name) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = values.map(value => {
    const checked = selected.has(normalizeOption(value)) ? 'checked' : '';
    return `<label class="operation-choice">
      <input type="checkbox" name="${name}" value="${escapeAttr(value)}" ${checked}>
      <span>${escapeHtml(value)}</span>
    </label>`;
  }).join('');
}

function checkedOperationValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
}

function closeOperationModal() {
  document.getElementById('op-modal-overlay').classList.add('hidden');
  state.editingOperationId = null;
}

async function saveOperation() {
  const origem = v('op-origem').toUpperCase();
  const checkedProdutos = checkedOperationValues('produto');
  const checkedDestinos = checkedOperationValues('destino');
  const resumoProdutos = normalizeCardSelection(checkedProdutos, productList());
  const resumoDestinos = normalizeCardSelection(checkedDestinos, destinationList());
  if (!origem) {
    alert('Informe a origem da operação');
    return;
  }
  if (!checkedProdutos.length || !checkedDestinos.length) {
    alert('Selecione pelo menos um produto e um destino para o card');
    return;
  }

  const btn = document.getElementById('op-btn-save');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  const existing = state.editingOperationId ? findOperation(state.editingOperationId) : null;
  const payload = {
    origem,
    produtos: resumoProdutos,
    resumoProdutos,
    resumoDestinos,
    metaTipo: existing?.metaTipo || metaTipo(origem),
    ordem: existing?.ordem || operationsList().length + 1
  };

  const saved = existing?._id
    ? await apiFetch(`/api/operacoes/${existing._id}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await apiFetch('/api/operacoes', { method: 'POST', body: JSON.stringify(payload) });

  if (saved) {
    const idx = state.operacoes.findIndex(op => op._id === saved._id);
    if (idx !== -1) state.operacoes[idx] = saved;
    else state.operacoes.push(saved);

    await syncOperationOriginConfig(saved.origem, existing?.origem);

    if (existing && existing.origem !== saved.origem) {
      await Promise.all(state.viagens
        .filter(v => v.origem === existing.origem)
        .map(v => updateViagemField(v._id, 'origem', saved.origem)));
    }

    closeOperationModal();
    renderSettingsModal();
    await loadAll();
  }

  btn.textContent = btn.dataset.label || 'Salvar Operação';
  btn.disabled = false;
}

async function syncOperationOriginConfig(origem, previousOrigem = '') {
  if (!origem) return;
  const updated = await apiFetch('/api/config-options/origem', {
    method: 'POST',
    body: JSON.stringify({ value: origem })
  });
  if (updated) state.configOptions = normalizeConfigOptions(updated);

  if (previousOrigem && normalizeOption(previousOrigem) !== normalizeOption(origem)) {
    const cleaned = await apiFetch(`/api/config-options/origem/${encodeURIComponent(previousOrigem)}`, { method: 'DELETE' });
    if (cleaned) state.configOptions = normalizeConfigOptions(cleaned);
  }
}

async function saveViagem() {
  const data = {
    placa: v('f-placa').toUpperCase(),
    nome: v('f-nome').toUpperCase(),
    tipo: normalizeTipo(v('f-tipo')),
    produto: v('f-produto'),
    secao: state.editingId ? v('f-secao') : 'agenciando',
    carroceria: v('f-carroceria'),
    pamcard: v('f-pamcard'),
    status: v('f-status'),
    usuario: v('f-usuario'),
    agendamento: normalizeHours(v('f-agendamento')),
    telefone: normalizePhoneList(v('f-telefone')),
    frete: v('f-frete'),
    origem: v('f-origem'),
    destino: v('f-destino'),
    peso: v('f-peso'),
    obs: v('f-obs'),
    data: state.currentDate
  };

  if (!data.placa && !data.nome) {
    alert('Informe ao menos PLACA ou NOME');
    return;
  }

  if (!data.origem || !data.destino || !data.peso) {
    alert('Informe ORIGEM, DESTINO e PESO para salvar a viagem.');
    document.getElementById(!data.origem ? 'f-origem' : !data.destino ? 'f-destino' : 'f-peso')?.focus();
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  const saved = state.editingId
    ? await apiFetch(`/api/viagens/${state.editingId}`, { method: 'PUT', body: JSON.stringify(data) })
    : await apiFetch('/api/viagens', { method: 'POST', body: JSON.stringify(data) });

  btn.textContent = 'Salvar';
  btn.disabled = false;
  if (!saved) return;

  closeModal();
  loadAll();
}

function v(id) {
  return (document.getElementById(id)?.value || '').trim();
}

// ─── EDIT / DELETE ────────────────────────────────────────────────────────────
function editViagem(id) {
  const viagem = state.viagens.find(v => v._id === id);
  if (viagem) openModal(viagem);
}

async function copyViagem(event, id) {
  const viagem = state.viagens.find(v => v._id === id);
  if (!viagem) return;

  const text = [
    `NOME: ${viagem.nome || ''}`,
    `PLACA: ${viagem.placa || ''}`,
    `ORIGEM: ${viagem.origem || ''}`,
    `DESTINO: ${viagem.destino || ''}`,
    `PESO: ${formatPeso(viagem.peso || '')}`,
    `DT: ${viagem.dt || ''}`
  ].join('\n');

  showCopyBubble(event?.currentTarget);

  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    } catch (fallbackError) {
      console.error('Erro ao copiar viagem', fallbackError);
    }
  }
}

function showCopyBubble(button) {
  if (!button) return;

  button.querySelector('.copy-bubble')?.remove();
  const bubble = document.createElement('span');
  bubble.className = 'copy-bubble';
  bubble.textContent = 'Copiado';
  button.appendChild(bubble);

  setTimeout(() => bubble.classList.add('is-visible'), 10);
  setTimeout(() => {
    bubble.classList.remove('is-visible');
    setTimeout(() => bubble.remove(), 180);
  }, 1200);
}

async function deleteViagem(id) {
  if (!confirm('Excluir este registro?')) return;
  await apiFetch(`/api/viagens/${id}`, { method: 'DELETE' });
  state.viagens = state.viagens.filter(v => v._id !== id);
  renderAll();
}

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
function showCtxMenu(e, id) {
  e.preventDefault();
  state.ctxTargetId = id;
  const menu = document.getElementById('ctx-menu');
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 90)}px`;
  menu.classList.remove('hidden');
}

function hideCtxMenu() {
  document.getElementById('ctx-menu').classList.add('hidden');
}

function showAgendamentoMenu(e, cell) {
  e.preventDefault();
  state.agendamentoTargetId = cell.dataset.id;
  const viagem = state.viagens.find(item => item._id === state.agendamentoTargetId);
  const mark = document.getElementById('agendamento-mark');
  mark.textContent = viagem?.agendamentoVerde ? 'Remover agendamento' : 'Agendado';
  document.getElementById('agendamento-edit').textContent = 'Editar';

  const menu = document.getElementById('agendamento-menu');
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 170)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 95)}px`;
  menu.classList.remove('hidden');
}

function hideAgendamentoMenu() {
  document.getElementById('agendamento-menu').classList.add('hidden');
  state.agendamentoTargetId = null;
}

async function toggleAgendamentoVerde() {
  const id = state.agendamentoTargetId;
  if (!id) return;
  const viagem = state.viagens.find(item => item._id === id);
  hideAgendamentoMenu();
  await updateViagemField(id, 'agendamentoVerde', !viagem?.agendamentoVerde);
}

// ─── METAS SAVE ───────────────────────────────────────────────────────────────
async function saveMetas() {
  const inputs = document.querySelectorAll('#metas-form input[data-dest]');
  const btn = document.getElementById('btn-save-metas');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  await Promise.all([...inputs].map(inp => apiFetch('/api/metas', {
    method: 'POST',
    body: JSON.stringify({ data: state.currentDate, destino: inp.dataset.dest, tipo: 'arcos', valor: inp.value || 0 })
  })));

  const metas = await apiFetch(`/api/metas?data=${state.currentDate}`);
  state.metas = metas || [];
  renderSummary();
  btn.textContent = 'Salvo';
  btn.disabled = false;
  setTimeout(() => { btn.textContent = 'Salvar Metas'; }, 1500);
}

// ─── FORMATTERS ───────────────────────────────────────────────────────────────
function sumPeso(rows) {
  return rows.reduce((sum, item) => sum + parseNumber(item.peso), 0);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).toLowerCase().replace('kg', '').trim();
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : /^(\d{1,3}\.)+\d{3}$/.test(text)
      ? text.replace(/\./g, '')
    : text;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPeso(value) {
  const num = typeof value === 'number' ? value : parseNumber(value);
  if (!num) return '0';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatKg(value) {
  const num = typeof value === 'number' ? value : parseNumber(value);
  return num.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatMoney(value) {
  const num = parseNumber(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeHours(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const cleaned = raw.toLowerCase().replace(/[h.]/g, ':').replace(/\s/g, '');
  const parts = cleaned.split(':').filter(Boolean);

  if (parts.length >= 2) {
    const hh = parts[0].padStart(2, '0').slice(-2);
    const mm = parts[1].padStart(2, '0').slice(0, 2);
    return `${hh}:${mm}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return raw;
  if (digits.length <= 2) return `${digits.padStart(2, '0')}:00`;
  const hh = digits.slice(0, -2).padStart(2, '0').slice(-2);
  const mm = digits.slice(-2).padStart(2, '0');
  return `${hh}:${mm}`;
}

function maskHourInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function phoneList(value) {
  return String(value || '')
    .split(/\s*(?:\/|,|;|\|)\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function firstPhone(value) {
  return phoneList(value)[0] || String(value || '');
}

function normalizePhoneList(value) {
  return phoneList(value)
    .map(formatPhone)
    .join(' / ');
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskPhoneListInput(value) {
  const parts = String(value || '').split('/');
  return parts.map(part => formatPhone(part)).join(parts.length > 1 ? ' / ' : '');
}

function formatDateBR(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTimeBR(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/(^|\s)\S/g, chr => chr.toUpperCase());
}

function originSlug(value) {
  const normalized = normalizeOption(value);
  if (normalized === 'ARCOS') return 'origin-arcos';
  if (normalized === 'PEDRO LEOPOLDO') return 'origin-pedro-leopoldo';
  if (normalized === 'BARROSO') return 'origin-barroso';
  return 'origin-neutral';
}

function normalizeTipo(value) {
  const normalized = normalizeOption(value);
  if (normalized === 'AGREG') return 'AGREGADO';
  if (normalized === 'CARRE') return 'CARRETEIRO';
  if (normalized === 'AGREGADO') return 'AGREGADO';
  if (normalized === 'CARRETEIRO') return 'CARRETEIRO';
  if (normalized === 'DEDICADO') return 'DEDICADO';
  if (normalized === 'FROTA') return 'FROTA';
  return String(value || '').trim();
}

function tipoSlug(value) {
  const normalized = normalizeOption(value).replace(/\s+/g, '-').toLowerCase();
  return normalized ? `tipo-${normalized}` : '';
}

function statusSlug(value) {
  const normalized = normalizeOption(value).replace(/\s+/g, '-').toLowerCase();
  return normalized ? `status-${normalized}` : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

