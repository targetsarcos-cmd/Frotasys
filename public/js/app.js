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
  contratoTargetId: null,
  contratoTargetField: '',
  productSummaryOpen: true,
  collapsedMetaProducts: {},
  collapsedTotalProducts: {},
  reportCollapsedMetaProducts: {},
  reportCollapsedTotalProducts: {},
  operacoes: [],
  configOptions: {},
  configColors: {},
  tableSort: { field: '', direction: 'asc' },
  freteSort: {},
  freteConsultas: {},
  listaEspera: [],
  lembrete: { data: '', texto: '' },
  lembreteOpen: false,
  lembreteSaveTimer: null,
  metaGoalAlertsShown: new Set(),
  metaGoalDismissed: new Set(),
  metaGoalQueue: [],
  metaGoalDialogOpen: false,
  metaGoalCurrent: null,
  reportCharts: {},
  reportData: null,
  reportSummaryCopyBlob: null,
  reportSummaryCopyDataUrl: '',
  reportSummaryCopyBlobAt: 0,
  reportSummaryCopyRenderPromise: null,
  summaryCopyBlob: null,
  summaryCopyDataUrl: '',
  summaryCopyBlobAt: 0,
  summaryCopyRenderPromise: null,
  userProfile: null,
  undoAction: null,
  ws: null
};

const DEFAULT_DESTINOS = ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA'];
const DEFAULT_OPERACOES = [
  { origem: 'ARCOS', metaTipo: 'arcos', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS },
  { origem: 'PEDRO LEOPOLDO', metaTipo: 'pedro_leopoldo', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS },
  { origem: 'BARROSO', metaTipo: 'barroso', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: DEFAULT_DESTINOS }
];
const STATUS = ['CRIANDO DT', 'CADASTRANDO', 'AGUARDANDO CARREGAMENTO', 'MANIFESTO', 'S/ CADASTRO', 'CONCLUIDO'];
const DEFAULT_PRODUTOS = ['CPII-F', 'CPIII', 'CPV'];

const DEFAULT_CONFIG_OPTIONS = {
  tipo: ['AGREGADO', 'CARRETEIRO', 'DEDICADO', 'FROTA'],
  produto: DEFAULT_PRODUTOS,
  carroceria: ['GRADE BAIXA', 'BAU', 'SIDER', 'TANQUE', 'GRANELEIRO'],
  kanguru: ['TEM KANGURU', 'SEM KANGURU'],
  pamcard: ['PAMCARD OK', 'FECHAMENTO', 'SEM PAMCARD'],
  status: STATUS,
  origem: DEFAULT_OPERACOES.map(op => op.origem),
  destino: DEFAULT_DESTINOS
};

const CONFIG_FIELDS = [
  { key: 'tipo', label: 'TIPO' },
  { key: 'produto', label: 'PRODUTO' },
  { key: 'carroceria', label: 'CARROCERIA' },
  { key: 'kanguru', label: 'KANGURU' },
  { key: 'pamcard', label: 'PAMCARD' },
  { key: 'status', label: 'STATUS' },
  { key: 'origem', label: 'ORIGEM' },
  { key: 'destino', label: 'DESTINO' }
];

const CONFIG_COLOR_FIELDS = ['tipo', 'status', 'origem', 'destino'];
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
  },
  origem: {},
  destino: {}
};
const FALLBACK_CONFIG_COLORS = ['#2563eb', '#16803f', '#b7791f', '#c93434', '#0f766e', '#4f46e5', '#c05621', '#0891b2'];
const FRETE_CONSULT_KEY = 'frotasys-consulta-frete';
const DESKTOP_MIN_WIDTH = 760;
const UNDO_FIELDS = ['dt', 'cte', 'manifesto', 'contrato'];
const DOCUMENT_NUMBER_FIELDS = ['nota', 'contrato', 'cte', 'manifesto'];
const TIME_FIELDS = ['agendamento', 'horas'];
const LOCKED_EDITABLE_FIELDS = ['descarga'];
const UNDO_FIELD_LABELS = {
  dt: 'DT',
  cte: 'CT-E',
  manifesto: 'MANIFESTO',
  contrato: 'CONTRATO'
};
const FRETE_COLUMNS = ['ORIGEM', 'DESTINO', '5 EIXO', '6 EIXO', '7 EIXO', '9 EIXO'];
const DEFAULT_FRETE_CONSULTAS = {
  terceiros: {
    title: 'TERCEIROS',
    tone: 'terceiros',
    rows: [
      ['ARCOS', 'SOROCABA', 'R$ 4.650,00', 'R$ 5.082,00', 'R$ 6.250,00', 'R$ 6.400,00'],
      ['ARCOS', 'AMERICANA', 'R$ 3.650,00', 'R$ 4.000,00', 'R$ 4.600,00', 'R$ 5.800,00'],
      ['ARCOS', 'OSASCO', 'R$ 4.040,00', 'R$ 4.400,00', 'R$ 5.000,00', 'R$ 6.200,00'],
      ['ARCOS', 'RIBEIRÃO P.', 'R$ 2.696,00', 'R$ 3.200,00', 'R$ 3.600,00', 'R$ 4.200,00'],
      ['ARCOS', 'SJRP', 'R$ 3.800,00', 'R$ 4.480,00', 'R$ 5.320,00', 'R$ 6.720,00'],
      ['BARROSO', 'PINDA', 'R$ 3.730,00', 'R$ 4.066,07', 'R$ 4.548,94', 'R$ 5.135,12'],
      ['BARROSO', 'SJRP', 'R$ 5.167,00', 'R$ 5.667,14', 'R$ 6.303,98', 'R$ 7.132,39'],
      ['BARROSO', 'AMERICANA', 'R$ 4.240,00', '', '', ''],
      ['BARROSO', 'SOROCABA', 'R$ 4.475,00', 'R$ 4.890,00', 'R$ 5.451,00', 'R$ 6.165,00'],
      ['PEDRO L', 'AMERICANA', '--', 'R$ 5.555,96', 'R$ 6.182,10', 'R$ 6.993,69'],
      ['PEDRO L', 'SJRP', 'R$ 5.380,00', 'R$ 5.890,00', 'R$ 6.548,00', 'R$ 7.410,00'],
      ['PEDRO L', 'SOROCABA', 'R$ 5.536,00', 'R$ 6.061,00', 'R$ 6.735,00', 'R$ 7.623,00']
    ]
  },
  agregados: {
    title: 'AGREGADOS',
    tone: 'agregados',
    rows: [
      ['ARCOS', 'SOROCABA', '--', '4.518,00', 'R$ 4.848,00', 'R$ 6.022,00'],
      ['ARCOS', 'AMERICANA', '--', '4.350,00', 'R$ 4.750,00', 'R$ 6.000,00'],
      ['ARCOS', 'OSASCO', '--', '4.350,00', 'R$ 4.750,00', 'R$ 6.000,00'],
      ['ARCOS', 'RIBEIRÃO P.', '--', '3.300,00', 'R$ 3.600,00', 'R$ 4.500,00'],
      ['ARCOS', 'SJRP', '--', '4.350,00', 'R$ 5.000,00', 'R$ 6.000,00'],
      ['BARROSO', 'PINDA', '--', '--', '--', '--'],
      ['BARROSO', 'SJRP', '--', '--', '--', '--'],
      ['BARROSO', 'AMERICANA', '--', '--', '--', '--'],
      ['BARROSO', 'SOROCABA', '--', 'R$ 4.719,00', 'R$ 5.064,00', 'R$ 6.291,00'],
      ['PEDRO L', 'AMERICANA', '--', '--', 'R$ 5.545,00', 'R$ 6.883,00'],
      ['PEDRO L', 'SJRP', '', '', 'R$ 5.721,00', 'R$ 6.347,00'],
      ['PEDRO L', 'SOROCABA', '', '', 'R$ 5.884,00', 'R$ 6.974,00'],
      ['PEDRO L', 'OSASCO', '', '', 'R$ 5.517,00', 'R$ 6.852,00'],
      ['PEDRO L', 'MAUÁ', '', '', 'R$ 5.515,00', 'R$ 6.850,00'],
      ['PEDRO L', 'SÃO J. DOS CAMPOS', '', '', 'R$ 5.541,00', 'R$ 6.879,00'],
      ['PEDRO L', 'MOGI DAS CRUZES', '', '', 'R$ 5.545,00', 'R$ 6.883,00'],
      ['PEDRO L', 'PINDA', '', '', 'R$ 5.333,00', 'R$ 6.619,00'],
      ['PEDRO L', 'SÃO JOSÉ DO RIO PRETO', '', '', 'R$ 5.721,00', 'R$ 6.347,00'],
      ['PEDRO L', 'SANTO ANDRÉ', '', '', 'R$ 5.514,00', 'R$ 6.848,00']
    ]
  }
};

const SEARCH_RESULT_FIELDS = [
  { key: 'placa', label: 'PLACA' },
  { key: 'nome', label: 'NOME' },
  { key: 'tipo', label: 'TIPO' },
  { key: 'produto', label: 'PRODUTO' },
  { key: 'secao', label: 'REGISTRO' },
  { key: 'carroceria', label: 'CARROCERIA' },
  { key: 'kanguru', label: 'KANGURU' },
  { key: 'pamcard', label: 'PAMCARD' },
  { key: 'status', label: 'STATUS' },
  { key: 'usuario', label: 'USUÁRIO' },
  { key: 'agendamento', label: 'AGENDAMENTO' },
  { key: 'descarga', label: 'DESCARGA' },
  { key: 'telefone', label: 'TELEFONE' },
  { key: 'frete', label: 'EVENTO' },
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
  return localDateStr();
}

function localDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekdayLabel(dateValue) {
  if (dateValue === localDateStr()) return 'Hoje';
  const [year, month, day] = String(dateValue || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day, 12);
  return date.toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace(/^\p{L}/u, char => char.toUpperCase());
}

function renderDateWeekday() {
  const label = document.getElementById('date-weekday');
  if (label) label.textContent = weekdayLabel(state.currentDate);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
let appStarted = false;

document.addEventListener('DOMContentLoaded', () => {
  installViewportGuard();
  if (isDesktopViewport()) startApp();
});

function installViewportGuard() {
  applyViewportGuard();
  window.addEventListener('resize', applyViewportGuard);
}

function isDesktopViewport() {
  return window.innerWidth >= DESKTOP_MIN_WIDTH;
}

function applyViewportGuard() {
  document.body.classList.toggle('is-unsupported-viewport', !isDesktopViewport());
  if (isDesktopViewport()) startApp();
  if (appStarted) requestAnimationFrame(updateAllTableScrollControls);
}

async function startApp() {
  if (appStarted || !isDesktopViewport()) return;
  appStarted = true;
  document.getElementById('date-picker').value = state.currentDate;
  renderDateWeekday();
  const auth = await FrotasysAuth.init({ requireAuth: true });
  if (!auth.profile) return;
  state.userProfile = auth.profile;
  state.metaGoalDismissed = loadMetaGoalDismissed();
  state.configColors = mergeConfigColors({});
  initWS();
  initUI();
  applyPermissions();
  loadAll();
}

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
    if (payload.data === state.currentDate && !state.viagens.some(v => v._id === payload._id)) {
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
  } else if (type === 'config_cores_atualizadas') {
    state.configColors = mergeConfigColors(payload);
    renderAll();
  } else if (type === 'lista_espera_atualizada') {
    state.listaEspera = normalizeListaEspera(payload);
    renderListaEspera();
  } else if (type === 'lembrete_atualizado') {
    state.lembrete = normalizeLembrete(payload);
    renderReminderNote();
  } else if (type === 'frete_consultas_atualizada') {
    state.freteConsultas = mergeFreteConsultas(payload);
    if (!document.getElementById('frete-consult-overlay')?.classList.contains('hidden')) renderFreteConsultas();
  }
}

// ─── DATA LOADING ─────────────────────────────────────────────────────────────
async function loadAll() {
  const [viagens, metas, operacoes, configOptions, configColors, listaEspera, lembrete] = await Promise.all([
    apiFetch(`/api/viagens?data=${state.currentDate}`),
    apiFetch(`/api/metas?data=${state.currentDate}`),
    apiFetch('/api/operacoes'),
    apiFetch('/api/config-options'),
    apiFetch('/api/config-colors'),
    apiFetch('/api/lista-espera'),
    apiFetch('/api/lembretes').catch(() => null)
  ]);
  state.viagens = viagens || [];
  state.metas = metas || [];
  state.configOptions = normalizeConfigOptions(configOptions);
  state.configColors = mergeConfigColors(configColors);
  state.operacoes = normalizeOperacoes(operacoes);
  state.listaEspera = normalizeListaEspera(listaEspera);
  state.lembrete = normalizeLembrete(lembrete);
  clearReminderStatus();
  renderAll();
}

async function apiFetch(url, opts = {}) {
  try {
    const token = await FrotasysAuth.getAccessToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    };
    const res = await fetch(url, { ...opts, headers });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        await FrotasysAuth.signOut();
        return null;
      }
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
  document.getElementById('btn-lembretes').addEventListener('click', event => toggleReminderNote(event));
  document.getElementById('reminder-note-close').addEventListener('click', closeReminderNote);
  document.getElementById('reminder-text').addEventListener('input', handleReminderInput);
  document.getElementById('reminder-text').addEventListener('keydown', handleReminderKeydown);
  document.getElementById('btn-undo-last')?.addEventListener('click', undoLastAction);
  document.getElementById('header-search-form').addEventListener('submit', submitHeaderSearch);
  document.getElementById('btn-advanced-search').addEventListener('click', openAdvancedSearchModal);

  document.getElementById('btn-logout').addEventListener('click', () => FrotasysAuth.signOut());
  document.getElementById('btn-users-admin').addEventListener('click', openUsersModal);
  document.getElementById('users-modal-close').addEventListener('click', closeUsersModal);
  document.getElementById('users-btn-close').addEventListener('click', closeUsersModal);
  document.getElementById('user-create-form').addEventListener('submit', createUserProfile);
  document.getElementById('users-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('users-modal-overlay')) closeUsersModal();
  });
  document.getElementById('btn-frete-consult').addEventListener('click', openFreteConsultModal);
  document.getElementById('frete-consult-close').addEventListener('click', closeFreteConsultModal);
  document.getElementById('frete-consult-btn-close').addEventListener('click', closeFreteConsultModal);
  document.getElementById('frete-consult-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('frete-consult-overlay')) closeFreteConsultModal();
  });
  document.getElementById('btn-relatorios').addEventListener('click', openReportsModal);
  document.getElementById('reports-close').addEventListener('click', closeReportsModal);
  document.getElementById('reports-btn-close').addEventListener('click', closeReportsModal);
  document.getElementById('reports-refresh').addEventListener('click', updateReports);
  document.getElementById('report-summary-copy')?.addEventListener('pointerdown', prepareReportSummaryCopyImage);
  document.getElementById('report-summary-copy')?.addEventListener('click', copyReportSummaryAsImage);
  ['report-start-date', 'report-end-date', 'report-operation'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (!document.getElementById('reports-overlay')?.classList.contains('hidden')) updateReports();
    });
  });
  document.getElementById('reports-overlay').addEventListener('click', e => {
    if (!document.body.classList.contains('reports-page-active') && e.target === document.getElementById('reports-overlay')) closeReportsModal();
  });
  document.getElementById('btn-lista-espera').addEventListener('click', openListaEsperaModal);
  document.getElementById('waitlist-close').addEventListener('click', closeListaEsperaModal);
  document.getElementById('waitlist-btn-close').addEventListener('click', closeListaEsperaModal);
  document.getElementById('waitlist-form').addEventListener('submit', addListaEsperaItem);
  document.getElementById('waitlist-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('waitlist-overlay')) closeListaEsperaModal();
  });
  document.getElementById('waitlist-body-rows').addEventListener('click', handleListaEsperaClick);
  document.getElementById('waitlist-body-rows').addEventListener('change', handleListaEsperaChange);
  document.getElementById('waitlist-body-rows').addEventListener('focusin', handleListaEsperaFocus);
  document.getElementById('waitlist-body-rows').addEventListener('focusout', handleListaEsperaBlur);
  document.getElementById('waitlist-body-rows').addEventListener('keydown', handleListaEsperaKeydown);
  document.getElementById('search-modal-close').addEventListener('click', closeSearchModal);
  document.getElementById('search-btn-close').addEventListener('click', closeSearchModal);
  document.getElementById('advanced-search-form').addEventListener('submit', submitAdvancedSearch);
  document.getElementById('search-clear').addEventListener('click', clearAdvancedSearch);
  document.getElementById('search-results').addEventListener('click', handleSearchResultToggle);
  document.getElementById('search-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('search-modal-overlay')) closeSearchModal();
  });
  document.getElementById('event-warning-ok').addEventListener('click', closeEventWarning);
  document.getElementById('event-warning-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('event-warning-overlay')) closeEventWarning();
  });
  document.getElementById('meta-goal-ok').addEventListener('click', closeMetaGoalDialog);
  document.getElementById('meta-goal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('meta-goal-overlay')) closeMetaGoalDialog();
  });
  const summaryCopyBtn = document.getElementById('summary-copy-btn');
  summaryCopyBtn?.addEventListener('pointerdown', prepareSummaryCopyImage);
  summaryCopyBtn?.addEventListener('click', copySummaryAsImage);

  document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
  document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-btn-close').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-export-btn').addEventListener('click', exportViagensExcel);
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
    if (state.lembreteOpen && !e.target.closest('.header-reminder')) closeReminderNote();
    if (!e.target.closest('.ctx-menu')) hideCtxMenu();
    if (!e.target.closest('#agendamento-menu')) hideAgendamentoMenu();
    if (!e.target.closest('#contrato-menu')) hideContratoMenu();
    if (e.target.matches('input, select, button')) return;
    const td = e.target.closest('td[data-field]:not(.cell-select)');
    if (td && td.classList.contains('quick-edit')) startInlineEdit(td);
  });

  document.addEventListener('contextmenu', e => {
    const placaCell = e.target.closest('td[data-field="placa"]');
    if (placaCell) {
      e.stopPropagation();
      showCtxMenu(e, placaCell.dataset.id, 'placa');
      return;
    }

    const documentCell = e.target.closest('td[data-field="dt"]:not(.cell-select), td[data-field="cte"]:not(.cell-select), td[data-field="manifesto"]:not(.cell-select), td[data-field="contrato"]:not(.cell-select), td[data-field="nota"]:not(.cell-select), td[data-field="num_pedagio"]:not(.cell-select)');
    if (documentCell) {
      e.stopPropagation();
      showContratoMenu(e, documentCell);
      return;
    }

    const td = e.target.closest('td[data-field="agendamento"]:not(.cell-select)');
    if (!td) return;
    e.stopPropagation();
    showAgendamentoMenu(e, td);
  }, true);

  document.getElementById('ctx-copy').addEventListener('click', event => {
    if (state.ctxTargetId) copyPlacaMenuValue(event, state.ctxTargetId);
  });
  document.getElementById('ctx-edit').addEventListener('click', () => {
    if (state.ctxTargetId) editViagem(state.ctxTargetId);
  });
  document.getElementById('agendamento-mark').addEventListener('click', toggleAgendamentoVerde);
  document.getElementById('agendamento-edit').addEventListener('click', () => {
    const id = state.agendamentoTargetId;
    hideAgendamentoMenu();
    if (!id) return;
    const cell = document.querySelector(`td[data-field="agendamento"][data-id="${CSS.escape(id)}"]`);
    if (cell) startInlineEdit(cell);
  });
  document.getElementById('contrato-copy').addEventListener('click', event => copyContratoMenuValue(event));
  document.getElementById('contrato-adiantamento').addEventListener('click', () => concluirContrato('ADIANTAMENTO EFETUADO'));
  document.getElementById('contrato-sem-contrato').addEventListener('click', () => concluirContrato('NAO FAZ CONTRATO'));
  document.getElementById('contrato-desfazer').addEventListener('click', desfazerConclusaoContrato);

  document.addEventListener('dblclick', e => {
    const td = e.target.closest('td[data-field]:not(.cell-select)');
    if (td) startInlineEdit(td);
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      if (shouldHandleUndoShortcut(e)) {
        e.preventDefault();
        undoLastAction();
      }
      return;
    }

    if (e.key === 'Escape') {
      closeModal();
      closeSearchModal();
      closeFreteConsultModal();
      closeReportsModal();
      closeListaEsperaModal();
      closeEventWarning();
      closeMetaGoalDialog();
      closeSettingsModal();
      closeUsersModal();
      closeReminderNote();
      hideCtxMenu();
      hideAgendamentoMenu();
      hideContratoMenu();
      cancelInlineEdit();
    }
  });
}

function isAdmin() {
  return state.userProfile?.role === 'admin';
}

function canEditViagens() {
  return ['admin', 'operador'].includes(state.userProfile?.role);
}

function isViagemConcluida(viagem) {
  return hasDocumentosCompletos(viagem) && Boolean(normalizeContratoConclusao(viagem?.conclusaoContrato));
}

function canEditViagem(viagem) {
  return canEditViagens() && !isViagemConcluida(viagem);
}

function canEditViagemField(viagem, field) {
  if (!canEditViagens()) return false;
  if (!isViagemConcluida(viagem)) return true;
  return LOCKED_EDITABLE_FIELDS.includes(field);
}

function canDeleteViagem(viagem) {
  return isAdmin() || !isViagemConcluida(viagem);
}

function applyPermissions() {
  document.body.dataset.role = state.userProfile?.role || 'visualizador';
  const loggedUser = document.getElementById('logged-user-name');
  if (loggedUser) loggedUser.textContent = loggedUserDisplayName();
  updateUndoButton();
  document.getElementById('btn-users-admin').classList.toggle('is-hidden', !isAdmin());
  document.getElementById('btn-settings').classList.toggle('is-hidden', !isAdmin());
  document.getElementById('btn-nova-viagem').classList.toggle('is-hidden', !canEditViagens());
}

function loggedUserDisplayName() {
  return String(state.userProfile?.nome || state.userProfile?.email || '').trim();
}

function normalizeLembrete(lembrete = {}) {
  const safeLembrete = lembrete || {};
  return {
    data: '',
    texto: cleanReminderText(safeLembrete.texto || '')
  };
}

function stripReminderNumber(line) {
  return String(line || '').replace(/^\s*\d+°\s*/, '');
}

function cleanReminderText(text) {
  return String(text || '').split('\n').map(stripReminderNumber).join('\n');
}

function reminderContent(text) {
  return cleanReminderText(text).trim();
}

function hasReminderContent(text) {
  return reminderContent(text).length > 0;
}

function toggleReminderNote(event) {
  event?.preventDefault();
  event?.stopPropagation();
  state.lembreteOpen = !state.lembreteOpen;
  renderReminderNote();
  if (state.lembreteOpen) {
    setTimeout(() => document.getElementById('reminder-text')?.focus(), 0);
  }
}

function closeReminderNote() {
  state.lembreteOpen = false;
  renderReminderNote();
}

function renderReminderNote() {
  const panel = document.getElementById('reminder-note');
  const button = document.getElementById('btn-lembretes');
  const textarea = document.getElementById('reminder-text');
  const status = document.getElementById('reminder-status');
  if (!panel || !button || !textarea || !status) return;

  panel.classList.toggle('hidden', !state.lembreteOpen);
  button.classList.toggle('is-open', state.lembreteOpen);
  button.classList.toggle('has-text', hasReminderContent(state.lembrete.texto));

  if (document.activeElement !== textarea) textarea.value = state.lembrete.texto || '';
  if (!status.dataset.state) status.textContent = hasReminderContent(state.lembrete.texto) ? 'Salvo' : 'Sem lembrete';
}

function handleReminderInput(event) {
  const textarea = event.target;
  const texto = cleanReminderText(textarea.value);
  if (textarea.value !== texto) textarea.value = texto;
  state.lembrete = { data: '', texto };
  document.getElementById('btn-lembretes')?.classList.toggle('has-text', hasReminderContent(texto));
  setReminderStatus('Salvando...');
  clearTimeout(state.lembreteSaveTimer);
  state.lembreteSaveTimer = setTimeout(() => saveReminder(texto), 450);
}

function handleReminderKeydown(event) {
  if (event.key === 'Escape') closeReminderNote();
}

function setReminderStatus(text) {
  const status = document.getElementById('reminder-status');
  if (!status) return;
  status.dataset.state = text;
  status.textContent = text;
}

function clearReminderStatus() {
  const status = document.getElementById('reminder-status');
  if (status) delete status.dataset.state;
}

async function saveReminder(texto) {
  const saved = await apiFetch('/api/lembretes', {
    method: 'PUT',
    body: JSON.stringify({ texto })
  });
  if (!saved) {
    setReminderStatus('Erro ao salvar');
    return;
  }
  state.lembrete = normalizeLembrete(saved);
  setReminderStatus(hasReminderContent(saved.texto) ? 'Salvo' : 'Sem lembrete');
  setTimeout(() => {
    const status = document.getElementById('reminder-status');
    if (status?.dataset.state === 'Salvo' || status?.dataset.state === 'Sem lembrete') {
      delete status.dataset.state;
    }
  }, 1000);
}

function shouldHandleUndoShortcut(event) {
  const modalOpen = [...document.querySelectorAll('.modal-overlay')]
    .some(overlay => !overlay.classList.contains('hidden'));
  if (modalOpen) return false;

  const target = event.target;
  const tagName = target?.tagName;
  return !target?.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName);
}

function isUndoField(field) {
  return UNDO_FIELDS.includes(field);
}

function setUndoAction(action) {
  state.undoAction = action;
  updateUndoButton();
}

function clearUndoAction() {
  state.undoAction = null;
  updateUndoButton();
}

function updateUndoButton() {
  const button = document.getElementById('btn-undo-last');
  if (!button) return;
  const action = state.undoAction;
  button.disabled = !action;
  button.title = action
    ? `Desfazer última alteração em ${UNDO_FIELD_LABELS[action.field] || action.field}`
    : 'Desfazer última alteração em DT, CT-E, MANIFESTO ou CONTRATO';
}

async function undoLastAction() {
  const action = state.undoAction;
  if (!action) return;

  clearUndoAction();
  const undone = await updateViagemField(action.id, action.field, action.previousValue, { skipUndo: true });
  if (!undone) setUndoAction(action);
}

async function openUsersModal() {
  if (!isAdmin()) return;
  document.getElementById('users-modal-overlay').classList.remove('hidden');
  await loadUsers();
}

function closeUsersModal() {
  document.getElementById('users-modal-overlay').classList.add('hidden');
}

async function loadUsers() {
  const users = await apiFetch('/api/users');
  const tbody = document.getElementById('users-table-body');
  if (!users) {
    tbody.innerHTML = '<tr><td colspan="4">Não foi possível carregar usuários.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>${escapeHtml(user.nome || '-')}</td>
      <td>${escapeHtml(user.email || '-')}</td>
      <td>
        <select class="user-role-select" onchange="updateUserProfile('${escapeAttr(user.id)}', { role: this.value })">
          ${['admin', 'operador', 'visualizador'].map(role => `<option value="${role}" ${user.role === role ? 'selected' : ''}>${role}</option>`).join('')}
        </select>
      </td>
      <td>
        <label class="user-active-toggle">
          <input type="checkbox" ${user.ativo ? 'checked' : ''} onchange="updateUserProfile('${escapeAttr(user.id)}', { ativo: this.checked })">
          <span>${user.ativo ? 'Ativo' : 'Inativo'}</span>
        </label>
      </td>
    </tr>
  `).join('');
}

async function createUserProfile(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const form = document.getElementById('user-create-form');
  const button = document.getElementById('user-create-submit');
  const message = document.getElementById('user-create-message');
  const payload = {
    nome: document.getElementById('user-create-nome').value.trim(),
    email: document.getElementById('user-create-email').value.trim(),
    password: document.getElementById('user-create-password').value,
    role: document.getElementById('user-create-role').value,
    ativo: document.getElementById('user-create-ativo').checked
  };

  message.textContent = '';
  message.className = 'user-create-message';
  if (button) button.disabled = true;
  button.textContent = 'Criando...';

  const created = await apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  button.disabled = false;
  button.textContent = 'Criar usuário';

  if (!created) return;
  form.reset();
  document.getElementById('user-create-ativo').checked = true;
  message.textContent = 'Usuário criado com sucesso.';
  message.classList.add('success');
  await loadUsers();
}

async function updateUserProfile(id, patch) {
  if (!isAdmin()) return;
  const updated = await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  });
  if (updated) await loadUsers();
}

async function submitHeaderSearch(event) {
  event?.preventDefault();
  const input = document.getElementById('header-search-input');
  const term = v('header-search-input');
  if (!term) {
    input?.focus();
    return;
  }
  openSearchModal();
  await searchCarregamento(term);
  if (input) input.value = '';
}

function openAdvancedSearchModal() {
  openSearchModal();
  document.getElementById('search-dt')?.focus();
}

function openSearchModal() {
  document.getElementById('search-modal-overlay').classList.remove('hidden');
}

function closeSearchModal() {
  document.getElementById('search-modal-overlay').classList.add('hidden');
  clearAdvancedSearch({ focus: false });
}

async function submitAdvancedSearch(event) {
  event?.preventDefault();
  await searchCarregamento('', collectAdvancedSearchFilters());
}

function collectAdvancedSearchFilters() {
  return {
    dt: v('search-dt'),
    nota: v('search-nota'),
    contrato: v('search-contrato'),
    cte: v('search-cte'),
    nome: v('search-nome'),
    placa: v('search-placa'),
    dataInicio: v('search-data-inicio'),
    dataFim: v('search-data-fim')
  };
}

function hasSearchFilters(filters = {}) {
  return Object.values(filters).some(value => String(value || '').trim());
}

function clearAdvancedSearch({ focus = true } = {}) {
  ['search-dt', 'search-nota', 'search-contrato', 'search-cte', 'search-nome', 'search-placa', 'search-data-inicio', 'search-data-fim']
    .forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
  document.getElementById('search-status').textContent = '';
  document.getElementById('search-results').innerHTML = '';
  if (focus) document.getElementById('search-dt')?.focus();
}

async function openFreteConsultModal() {
  const saved = await apiFetch('/api/frete-consultas');
  state.freteConsultas = saved ? mergeFreteConsultas(saved) : loadFreteConsultas();
  renderFreteConsultas();
  document.getElementById('frete-consult-overlay').classList.remove('hidden');
}

function closeFreteConsultModal() {
  document.getElementById('frete-consult-overlay').classList.add('hidden');
}

function openReportsModal() {
  syncDynamicSelects();
  const start = document.getElementById('report-start-date');
  const end = document.getElementById('report-end-date');
  if (start && !start.value) start.value = monthStartStr(state.currentDate);
  if (end && !end.value) end.value = state.currentDate;
  setReportOperationOptions();
  document.body.classList.add('reports-page-active');
  document.getElementById('reports-overlay').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateReports();
}

function closeReportsModal() {
  document.body.classList.remove('reports-page-active');
  document.getElementById('reports-overlay').classList.add('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function updateReports() {
  const start = document.getElementById('report-start-date')?.value;
  const end = document.getElementById('report-end-date')?.value;
  const operation = document.getElementById('report-operation')?.value || '';
  const button = document.getElementById('reports-refresh');

  if (!isValidDateRange(start, end)) {
    setReportsStatus('Informe um período válido de até 366 dias.', true);
    return;
  }

  button.disabled = true;
  button.textContent = 'Atualizando...';
  setReportsStatus('Carregando dados do período...');

  try {
    const params = new URLSearchParams({ dataInicio: start, dataFim: end });
    const [viagens, metas] = await Promise.all([
      apiFetch(`/api/viagens/search?${params.toString()}`),
      apiFetch('/api/metas')
    ]);
    const report = buildReportsData(Array.isArray(viagens) ? viagens : [], Array.isArray(metas) ? metas : [], { start, end, operation });
    renderReports(report);
    setReportsStatus(report.rows.length ? '' : 'Nenhuma viagem encontrada para os filtros selecionados.');
  } catch (error) {
    console.error('Erro ao atualizar relatórios:', error);
    setReportsStatus('Não foi possível carregar os relatórios.', true);
  } finally {
    button.disabled = false;
    button.textContent = 'Atualizar';
  }
}

function buildReportsData(viagens, metas, filters) {
  const operations = reportOperations(filters.operation);
  const dates = dateRangeList(filters.start, filters.end);
  const rows = filterReportRows(viagens, operations);
  const fatRows = rows.filter(v => v.secao === 'arcos' && hasNotaPreenchida(v));
  const agencRows = rows.filter(v => v.secao === 'agenciando' || (v.secao === 'arcos' && !hasNotaPreenchida(v)));
  const loadedTotal = sumPeso(rows);

  const metaByDestination = {};
  const loadedByDestination = {};
  const metaByDate = Object.fromEntries(dates.map(date => [date, 0]));
  const loadedByDate = Object.fromEntries(dates.map(date => [date, 0]));

  rows.forEach(row => {
    const destino = row.destino || 'SEM DESTINO';
    loadedByDestination[destino] = (loadedByDestination[destino] || 0) + parseNumber(row.peso);
    if (loadedByDate[row.data] !== undefined) loadedByDate[row.data] += parseNumber(row.peso);
  });

  dates.forEach(date => {
    operations.forEach(op => {
      summaryDestinationsForOperation(op).forEach(destino => {
        const meta = reportMetaForDestination(metas, date, op, destino);
        metaByDestination[destino] = (metaByDestination[destino] || 0) + meta;
        metaByDate[date] += meta;
      });
    });
  });

  const metaTotal = Object.values(metaByDate).reduce((sum, value) => sum + value, 0);
  const typeCounts = ['AGREGADO', 'FROTA', 'DEDICADO', 'CARRETEIRO'].map(tipo => ({
    label: tipo,
    value: rows.filter(row => normalizeTipo(row.tipo) === tipo).length
  }));

  const registro = [
    { label: 'FATURADO', value: sumPeso(fatRows) },
    { label: 'AGENCIADO', value: sumPeso(agencRows) }
  ];

  const destinos = [...new Set([...Object.keys(metaByDestination), ...Object.keys(loadedByDestination)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  return {
    rows,
    operations,
    dates,
    metaTotal,
    loadedTotal,
    atendimento: metaTotal > 0 ? (loadedTotal / metaTotal) * 100 : 0,
    typeCounts,
    registro,
    destinos: destinos.map(destino => ({
      destino,
      meta: metaByDestination[destino] || 0,
      loaded: loadedByDestination[destino] || 0,
      percent: metaByDestination[destino] > 0 ? ((loadedByDestination[destino] || 0) / metaByDestination[destino]) * 100 : 0
    })),
    daily: dates.map(date => ({
      date,
      meta: metaByDate[date] || 0,
      loaded: loadedByDate[date] || 0
    })),
    summaryCards: buildReportSummaryCards(rows, metas, dates, operations),
    filters
  };
}

function buildReportSummaryCards(rows, metas, dates, operations) {
  return operations.map(operation => {
    const origem = operation.origem;
    const produtos = summaryProductsForOperation(operation);
    const destinos = summaryDestinationsForOperation(operation);
    const productSet = new Set(produtos.map(normalizeOption));
    const operationRows = rows.filter(row => row.origem === origem && productSet.has(normalizeOption(row.produto)));
    const faturadoRows = operationRows.filter(row => row.secao === 'arcos' && hasNotaPreenchida(row));
    const agenciadoRows = operationRows.filter(row => row.secao === 'agenciando' || (row.secao === 'arcos' && !hasNotaPreenchida(row)));
    const totals = { meta: 0, fat: 0, agenc: 0, total: 0, falta: 0 };

    const columns = destinos.map(destino => {
      const meta = dates.reduce((sum, date) => sum + reportMetaForDestination(metas, date, operation, destino), 0);
      const fat = sumPeso(faturadoRows.filter(row => row.destino === destino));
      const agenc = sumPeso(agenciadoRows.filter(row => row.destino === destino));
      const total = fat + agenc;
      const falta = meta - total;

      totals.meta += meta;
      totals.fat += fat;
      totals.agenc += agenc;
      totals.total += total;
      totals.falta += falta;

      return { destino, meta, fat, agenc, total, falta };
    });

    const metaProductRows = produtos.map(produto => {
      let total = 0;
      const values = destinos.map(destino => {
        const value = dates.reduce((sum, date) => sum + reportMetaForProductDestination(metas, date, operation, destino, produto), 0);
        total += value;
        return value;
      });
      return { produto, values, total };
    });

    const totalProductRows = produtos.map(produto => {
      let total = 0;
      const values = destinos.map(destino => {
        const value = sumPeso(operationRows.filter(row => normalizeOption(row.produto) === normalizeOption(produto) && row.destino === destino));
        total += value;
        return value;
      });
      return { produto, values, total };
    });

    return {
      operationKey: operation._id || operation.metaTipo || origem,
      origem,
      accentClass: cardAccentClass(origem),
      columns,
      metaProductRows,
      totalProductRows,
      totals,
      percent: totals.meta > 0 ? Math.round((totals.total / totals.meta) * 100) : 0
    };
  });
}

function reportMetaForProductDestination(metas, date, operation, destino, produto) {
  const tipo = operation.metaTipo || metaTipo(operation.origem);
  const metaDoc = metas.find(meta =>
    meta.data === date &&
    meta.destino === destino &&
    meta.tipo === tipo &&
    normalizeOption(meta.produto) === normalizeOption(produto)
  );
  return metaDoc ? parseNumber(metaDoc.valor) : 0;
}

function reportOperations(operation) {
  const ops = operationsList();
  if (!operation) return ops;
  return ops.filter(op => normalizeOption(op.origem) === normalizeOption(operation));
}

function filterReportRows(rows, operations) {
  const byOrigin = Object.fromEntries(operations.map(op => [
    normalizeOption(op.origem),
    new Set(summaryProductsForOperation(op).map(normalizeOption))
  ]));
  return rows.filter(row => {
    const products = byOrigin[normalizeOption(row.origem)];
    return products && products.has(normalizeOption(row.produto));
  });
}

function reportMetaForDestination(metas, date, operation, destino) {
  return summaryProductsForOperation(operation).reduce((sum, produto) => {
    return sum + reportMetaForProductDestination(metas, date, operation, destino, produto);
  }, 0);
}

function renderReports(report) {
  state.reportData = report;
  renderReportSummary(report);
  renderReportCharts(report);
}

function renderReportCharts(report) {
  destroyReportCharts();
  if (!window.Chart) {
    setReportsStatus('Biblioteca de gráficos indisponível neste navegador.', true);
    return;
  }

  const chartText = '#172033';
  const gridColor = 'rgba(148, 163, 184, .24)';
  const typeColors = ['#fbbf24', '#16803f', '#0891b2', '#c93434'];
  Chart.defaults.color = chartText;
  Chart.defaults.font.family = "'Inter', sans-serif";

  renderFleetTypeLegend(report.typeCounts, typeColors);
  state.reportCharts.tipo = new Chart(document.getElementById('chart-report-tipo'), {
    type: 'pie',
    data: {
      labels: report.typeCounts.map(item => item.label),
      datasets: [{ data: report.typeCounts.map(item => item.value), backgroundColor: typeColors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      ...pieChartOptions('registros'),
      plugins: {
        ...pieChartOptions('registros').plugins,
        legend: { display: false }
      }
    }
  });

  state.reportCharts.destino = new Chart(document.getElementById('chart-report-destino'), {
    type: 'bar',
    data: {
      labels: report.destinos.map(item => item.destino),
      datasets: [{ label: '% atendimento', data: report.destinos.map(item => Math.round(item.percent)), backgroundColor: '#2563eb', borderRadius: 7 }]
    },
    options: barChartOptions(gridColor, value => `${value}%`, report.destinos)
  });

  state.reportCharts.registro = new Chart(document.getElementById('chart-report-registro'), {
    type: 'doughnut',
    data: {
      labels: report.registro.map(item => item.label),
      datasets: [{ data: report.registro.map(item => item.value), backgroundColor: ['#16803f', '#2563eb'], borderWidth: 2, borderColor: '#fff' }]
    },
    options: pieChartOptions('t')
  });

  state.reportCharts.evolucao = new Chart(document.getElementById('chart-report-evolucao'), {
    data: {
      labels: report.daily.map(item => formatDateBR(item.date)),
      datasets: [
        { type: 'bar', label: 'Carregado', data: report.daily.map(item => item.loaded), backgroundColor: 'rgba(37, 99, 235, .74)', borderRadius: 7 },
        { type: 'line', label: 'Meta', data: report.daily.map(item => item.meta), borderColor: '#16a34a', backgroundColor: '#16a34a', tension: .28, pointRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 120,
      scales: {
        y: { beginAtZero: true, grid: { color: gridColor }, ticks: { callback: value => formatKg(value) } },
        x: { grid: { display: false } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatKg(ctx.raw)}` } }
      }
    }
  });
}

function renderReportSummary(report) {
  const container = document.getElementById('report-summary-compact');
  const period = document.getElementById('report-summary-period');
  if (!container) return;

  clearPreparedReportSummaryCopy();
  if (period) {
    const start = formatDateBR(report.filters?.start || state.currentDate);
    const end = formatDateBR(report.filters?.end || state.currentDate);
    const operation = report.filters?.operation ? titleCase(report.filters.operation) : 'Todas as operações';
    period.textContent = `${start} a ${end} · ${operation}`;
  }

  const cards = Array.isArray(report.summaryCards) ? report.summaryCards : [];
  container.innerHTML = cards.length
    ? cards.map(renderReportSummaryCard).join('')
    : '<div class="report-empty">Nenhum dado para o resumo.</div>';
}

function renderReportSummaryCard(card) {
  const headers = card.columns.map(column => `<th>${escapeHtml(column.destino)}</th>`).join('');
  const cell = (key) => card.columns.map(column => `<td>${formatKg(column[key])}</td>`).join('');
  const total = key => formatKg(card.totals[key]);
  const percentFill = Math.min(100, Math.max(0, card.percent));
  const operationKey = card.operationKey || card.origem;
  const metaCollapsed = state.reportCollapsedMetaProducts[operationKey] !== false;
  const totalCollapsed = state.reportCollapsedTotalProducts[operationKey] !== false;
  const metaTitle = metaCollapsed ? 'Mostrar meta por tipo de cimento' : 'Ocultar meta por tipo de cimento';
  const totalTitle = totalCollapsed ? 'Mostrar carregado por tipo de cimento' : 'Ocultar carregado por tipo de cimento';
  const metaProductRows = renderReportSummaryProductRows(card.metaProductRows, metaCollapsed, 'card-meta-product-row');
  const totalProductRows = renderReportSummaryProductRows(card.totalProductRows, totalCollapsed, 'card-total-product-row');

  return `<article class="report-summary-origin ${card.accentClass}">
    <div class="report-summary-table-wrap">
      <table class="report-summary-table">
        <thead>
          <tr><th>TIPO</th>${headers}<th>TOTAL</th></tr>
        </thead>
        <tbody>
          <tr class="card-row-meta"><td><button type="button" class="card-row-toggle report-summary-toggle" onclick="toggleReportSummaryMetaProducts('${escapeAttr(operationKey)}')" title="${metaTitle}"><span class="card-product-arrow">${metaCollapsed ? '▶' : '▼'}</span><span>META</span></button></td>${cell('meta')}<td>${total('meta')}</td></tr>
          ${metaProductRows}
          <tr class="card-row-fat"><td>FATURADO</td>${cell('fat')}<td>${total('fat')}</td></tr>
          <tr class="card-row-agenc"><td>AGENCIADO</td>${cell('agenc')}<td>${total('agenc')}</td></tr>
          <tr class="card-row-total"><td><button type="button" class="card-row-toggle report-summary-toggle" onclick="toggleReportSummaryTotalProducts('${escapeAttr(operationKey)}')" title="${totalTitle}"><span class="card-product-arrow">${totalCollapsed ? '▶' : '▼'}</span><span>TOTAL</span></button></td>${cell('total')}<td>${total('total')}</td></tr>
          ${totalProductRows}
          <tr class="card-row-falta"><td>FALTA</td>${cell('falta')}<td>${total('falta')}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="report-summary-bottom">
      <div class="report-summary-operation">
        <div class="summary-icon">${summaryIcon(card.origem)}</div>
        <div>
          <span>OPERAÇÃO</span>
          <strong>${escapeHtml(card.origem)}</strong>
        </div>
      </div>
      <div class="report-summary-kpis">
        ${renderReportSummaryKpi('META', card.totals.meta, 'meta')}
        ${renderReportSummaryKpi('FATURADO', card.totals.fat, 'fat')}
        ${renderReportSummaryKpi('AGENCIADO', card.totals.agenc, 'agenc')}
        ${renderReportSummaryKpi('TOTAL', card.totals.total, 'total')}
        ${renderReportSummaryKpi('FALTA', card.totals.falta, 'falta')}
      </div>
      <div class="report-summary-percent" style="--percent:${percentFill}">
        <strong>${card.percent}%</strong>
        <span>% da Meta</span>
      </div>
    </div>
  </article>`;
}

function renderReportSummaryProductRows(rows = [], collapsed, className) {
  return rows.map(row => `<tr class="card-product-row ${className} ${collapsed ? 'collapsed' : ''}">
    <td>${escapeHtml(row.produto)}</td>
    ${row.values.map(value => `<td>${formatKg(value)}</td>`).join('')}
    <td>${formatKg(row.total)}</td>
  </tr>`).join('');
}

function toggleReportSummaryMetaProducts(operationKey) {
  state.reportCollapsedMetaProducts[operationKey] = state.reportCollapsedMetaProducts[operationKey] !== false ? false : true;
  clearPreparedReportSummaryCopy();
  if (state.reportData) renderReportSummary(state.reportData);
}

function toggleReportSummaryTotalProducts(operationKey) {
  state.reportCollapsedTotalProducts[operationKey] = state.reportCollapsedTotalProducts[operationKey] !== false ? false : true;
  clearPreparedReportSummaryCopy();
  if (state.reportData) renderReportSummary(state.reportData);
}

function renderReportSummaryKpi(label, value, kind) {
  return `<div class="report-summary-kpi ${kind}">
    <span>${label}</span>
    <strong>${formatKg(value)}</strong>
  </div>`;
}

function renderFleetTypeLegend(items, colors) {
  const legend = document.getElementById('report-type-legend');
  if (!legend) return;
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  legend.innerHTML = items.map((item, index) => {
    const percent = total > 0 ? Math.round((Number(item.value || 0) / total) * 100) : 0;
    const valueLabel = `${Number(item.value || 0).toLocaleString('pt-BR')} registro${Number(item.value || 0) === 1 ? '' : 's'}`;
    return `<div class="report-type-legend-item" style="color:${escapeAttr(colors[index])}">
      <span class="report-type-legend-line"></span>
      <span class="report-type-legend-label">${escapeHtml(item.label)}</span>
      <strong class="report-type-legend-percent">${percent}%</strong>
      <span class="report-type-legend-value">${escapeHtml(valueLabel)}</span>
    </div>`;
  }).join('');
}

function pieChartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 120,
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        callbacks: {
          label: context => `${context.label}: ${formatKg(context.raw)} ${unit}`
        }
      }
    }
  };
}

function barChartOptions(gridColor, tickFormatter, detailRows = []) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 120,
    scales: {
      y: { beginAtZero: true, grid: { color: gridColor }, ticks: { callback: tickFormatter } },
      x: { grid: { display: false } }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: context => {
            const detail = detailRows[context.dataIndex];
            if (!detail) return `${context.raw}%`;
            return `${Math.round(detail.percent)}% - ${formatKg(detail.loaded)} de ${formatKg(detail.meta)}`;
          }
        }
      }
    }
  };
}

function destroyReportCharts() {
  Object.values(state.reportCharts).forEach(chart => chart?.destroy?.());
  state.reportCharts = {};
}

function setReportsStatus(message, isError = false) {
  const status = document.getElementById('reports-status');
  if (!status) return;
  status.textContent = message;
  status.className = `reports-status ${isError ? 'is-error' : ''}`.trim();
}

function monthStartStr(dateValue) {
  const [year, month] = String(dateValue || todayStr()).split('-');
  return `${year}-${month}-01`;
}

function isValidDateRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return false;
  if (start > end) return false;
  return dateRangeList(start, end).length <= 366;
}

function dateRangeList(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function openListaEsperaModal() {
  syncDynamicSelects();
  setSelectOptions(document.getElementById('waitlist-tipo'), ['', ...configOptionList('tipo')]);
  setSelectOptions(document.getElementById('waitlist-origem'), ['', ...originList()]);
  document.getElementById('waitlist-data').value = todayStr();
  document.getElementById('waitlist-overlay').classList.remove('hidden');
  await loadListaEspera();
  document.getElementById('waitlist-placa').focus();
}

function closeListaEsperaModal() {
  document.getElementById('waitlist-overlay').classList.add('hidden');
}

async function loadListaEspera() {
  const items = await apiFetch('/api/lista-espera');
  if (items) state.listaEspera = normalizeListaEspera(items);
  renderListaEspera();
}

function normalizeListaEspera(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    ...item,
    placa: String(item.placa || '').trim().toUpperCase(),
    nome: String(item.nome || '').trim().toUpperCase(),
    tipo: normalizeTipo(item.tipo),
    origem: String(item.origem || '').trim().toUpperCase(),
    data: String(item.data || '').trim(),
    hora: String(item.hora || '').trim(),
    ordem: Number(item.ordem) || index + 1
  })).sort(compareListaEsperaItems);
}

function compareListaEsperaItems(a, b) {
  const position = listaEsperaPositionValue(a).localeCompare(listaEsperaPositionValue(b), 'pt-BR', { numeric: true });
  if (position) return position;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function listaEsperaPositionValue(item = {}) {
  const date = String(item.data || '').trim() || '9999-12-31';
  const time = String(item.hora || '').trim() || '99:99';
  return `${date} ${time}`;
}

function renderListaEspera() {
  const tbody = document.getElementById('waitlist-body-rows');
  if (!tbody) return;

  if (!state.listaEspera.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="waitlist-empty">Nenhum motorista na lista de espera.</td></tr>';
    return;
  }

  tbody.innerHTML = state.listaEspera.map((item, index) => `
    <tr data-id="${escapeAttr(item._id)}">
      <td>${index + 1}º</td>
      <td contenteditable="true" spellcheck="false" data-field="placa" data-value="${escapeAttr(item.placa)}">${escapeHtml(item.placa)}</td>
      <td contenteditable="true" spellcheck="false" data-field="nome" data-value="${escapeAttr(item.nome)}">${escapeHtml(item.nome)}</td>
      <td>
        <select data-field="tipo">
          ${renderOptions(['', ...configOptionList('tipo')], item.tipo)}
        </select>
      </td>
      <td>
        <select data-field="origem">
          ${renderOptions(['', ...originList()], item.origem)}
        </select>
      </td>
      <td><input type="date" data-field="data" value="${escapeAttr(item.data)}"></td>
      <td><input type="time" data-field="hora" value="${escapeAttr(item.hora)}"></td>
      <td>
        <div class="waitlist-actions">
          <button type="button" class="btn-row waitlist-generate" data-action="generate">Gerar Viagem</button>
          <button type="button" class="btn-row danger" data-action="delete">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function addListaEsperaItem(event) {
  event.preventDefault();
  if (!canEditViagens()) return;

  const payload = {
    placa: v('waitlist-placa').toUpperCase(),
    nome: v('waitlist-nome').toUpperCase(),
    tipo: normalizeTipo(v('waitlist-tipo')),
    origem: v('waitlist-origem').toUpperCase(),
    data: v('waitlist-data'),
    hora: v('waitlist-hora')
  };

  if (!payload.placa && !payload.nome) {
    alert('Informe ao menos PLACA ou NOME.');
    return;
  }

  const button = document.getElementById('waitlist-add');
  button.disabled = true;
  button.textContent = 'Adicionando...';
  const created = await apiFetch('/api/lista-espera', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  button.disabled = false;
  button.textContent = 'Adicionar';
  if (!created) return;

  document.getElementById('waitlist-form').reset();
  document.getElementById('waitlist-data').value = todayStr();
  setSelectOptions(document.getElementById('waitlist-tipo'), ['', ...configOptionList('tipo')]);
  setSelectOptions(document.getElementById('waitlist-origem'), ['', ...originList()]);
  await loadListaEspera();
  document.getElementById('waitlist-placa').focus();
}

async function handleListaEsperaClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr[data-id]');
  if (!row) return;

  if (button.dataset.action === 'generate') {
    await gerarViagemListaEspera(row.dataset.id, button);
  } else if (button.dataset.action === 'delete') {
    await deleteListaEsperaItem(row.dataset.id);
  }
}

async function handleListaEsperaChange(event) {
  const field = event.target.dataset.field;
  if (!field) return;
  const row = event.target.closest('tr[data-id]');
  if (!row) return;
  await updateListaEsperaItem(row.dataset.id, { [field]: normalizeListaEsperaField(field, event.target.value) });
}

function handleListaEsperaFocus(event) {
  const cell = event.target.closest?.('.waitlist-table td[contenteditable="true"]');
  if (!cell) return;
  cell.dataset.value = cell.textContent.trim();
}

function handleListaEsperaBlur(event) {
  const cell = event.target.closest?.('.waitlist-table td[contenteditable="true"]');
  if (!cell) return;
  runBlurCommit(event, cell, () => commitListaEsperaCell(cell));
}

function handleListaEsperaKeydown(event) {
  const cell = event.target.closest?.('.waitlist-table td[contenteditable="true"]');
  if (!cell) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    cell.blur();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cell.textContent = cell.dataset.value || '';
    cell.blur();
  }
}

async function commitListaEsperaCell(cell) {
  const previous = cell.dataset.value || '';
  const field = cell.dataset.field;
  const next = normalizeListaEsperaField(field, cell.textContent);
  if (next === previous) return;

  const row = cell.closest('tr[data-id]');
  if (!row) return;
  const updated = await updateListaEsperaItem(row.dataset.id, { [field]: next });
  if (!updated) cell.textContent = previous;
}

function normalizeListaEsperaField(field, value) {
  if (field === 'tipo') return normalizeTipo(value);
  if (field === 'placa' || field === 'nome' || field === 'origem') return String(value || '').trim().toUpperCase();
  return String(value || '').trim();
}

async function updateListaEsperaItem(id, patch) {
  if (!canEditViagens()) return null;
  const updated = await apiFetch(`/api/lista-espera/${id}`, {
    method: 'PUT',
    body: JSON.stringify(patch)
  });
  if (!updated) return null;
  const idx = state.listaEspera.findIndex(item => item._id === updated._id);
  if (idx !== -1) state.listaEspera[idx] = updated;
  else state.listaEspera.push(updated);
  state.listaEspera = normalizeListaEspera(state.listaEspera);
  renderListaEspera();
  return updated;
}

async function deleteListaEsperaItem(id) {
  if (!canEditViagens()) return;
  if (!confirm('Excluir este item da lista de espera?')) return;
  const removed = await apiFetch(`/api/lista-espera/${id}`, { method: 'DELETE' });
  if (!removed) return;
  state.listaEspera = state.listaEspera.filter(item => item._id !== id);
  renderListaEspera();
}

async function gerarViagemListaEspera(id, button) {
  if (!canEditViagens()) return;
  button.disabled = true;
  button.textContent = 'Gerando...';
  const result = await apiFetch(`/api/lista-espera/${id}/gerar-viagem`, {
    method: 'POST',
    body: JSON.stringify({ data: state.currentDate })
  });
  button.disabled = false;
  button.textContent = 'Gerar Viagem';
  if (!result) return;
  state.listaEspera = normalizeListaEspera(result.lista);
  if (result.viagem && !state.viagens.some(v => v._id === result.viagem._id)) {
    state.viagens.push(result.viagem);
  }
  renderListaEspera();
  renderAll();
}

function loadFreteConsultas() {
  try {
    const saved = JSON.parse(localStorage.getItem(FRETE_CONSULT_KEY) || '{}');
    return mergeFreteConsultas(saved);
  } catch (e) {
    return mergeFreteConsultas({});
  }
}

function mergeFreteConsultas(saved = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_FRETE_CONSULTAS).map(([key, table]) => {
    const savedTable = saved[key];
    const rows = Array.isArray(savedTable?.rows) && savedTable.rows.length
      ? savedTable.rows.map(row => FRETE_COLUMNS.map((_, index) => String(row?.[index] || '')))
      : table.rows.map(row => [...row]);
    return [key, { ...table, rows }];
  }));
}

async function saveFreteConsultas() {
  localStorage.setItem(FRETE_CONSULT_KEY, JSON.stringify(state.freteConsultas));
  const saved = await apiFetch('/api/frete-consultas', {
    method: 'PUT',
    body: JSON.stringify({ tables: state.freteConsultas })
  });
  if (saved) state.freteConsultas = mergeFreteConsultas(saved);
}

function renderFreteConsultas() {
  const grid = document.getElementById('frete-consult-grid');
  grid.innerHTML = `
    ${renderFreteQueryPanel()}
    ${isAdmin() ? `<div class="frete-admin-grid">${Object.entries(state.freteConsultas)
      .map(([key, table]) => renderFreteConsultTable(key, table))
      .join('')}</div>` : ''}
  `;
  updateFreteQueryDestinations();
}

function renderFreteQueryPanel() {
  return `<section class="frete-query-card">
    <div class="frete-query-head">
      <div>
        <strong>Consulta rápida</strong>
        <span>Selecione origem, destino e eixo para localizar o valor cadastrado.</span>
      </div>
    </div>
    <div class="frete-query-form">
      <label>
        <span>ORIGEM</span>
        <select id="frete-query-origem" onchange="updateFreteQueryDestinations()">
          ${renderOptions(['', ...freteOriginOptions()], '')}
        </select>
      </label>
      <label>
        <span>DESTINO</span>
        <select id="frete-query-destino"></select>
      </label>
      <label>
        <span>EIXOS</span>
        <select id="frete-query-eixo">
          ${renderOptions(['', ...FRETE_COLUMNS.slice(2)], '')}
        </select>
      </label>
      <button type="button" class="btn-primary" onclick="consultarFreteValor()">Consultar</button>
    </div>
    <div class="frete-query-result" id="frete-query-result"></div>
  </section>`;
}

function renderFreteConsultTable(key, table) {
  const header = `${FRETE_COLUMNS.map((col, colIndex) => renderFreteConsultHeader(key, col, colIndex)).join('')}<th>AÇÕES</th>`;
  const rows = table.rows.map((row, rowIndex) => {
    const rowTone = freteOriginTone(row[0]);
    const cells = row.map((value, colIndex) => `
      <td contenteditable="true" spellcheck="false" class="frete-cell-${freteColumnType(colIndex)}" data-table="${escapeAttr(key)}" data-row="${rowIndex}" data-col="${colIndex}" data-type="${freteColumnType(colIndex)}" data-value="${escapeAttr(formatFreteCellValue(value, colIndex))}">${escapeHtml(formatFreteCellValue(value, colIndex))}</td>
    `).join('');
    return `<tr class="${rowTone}" data-table="${escapeAttr(key)}" data-row="${rowIndex}" ondragover="handleFreteRowDragOver(event)" ondragleave="handleFreteRowDragLeave(event)" ondrop="dropFreteRow(event,'${escapeAttr(key)}',${rowIndex})">${cells}<td class="frete-row-actions">
      <button type="button" class="frete-drag-handle" draggable="true" ondragstart="startFreteRowDrag(event,'${escapeAttr(key)}',${rowIndex})" ondragend="endFreteRowDrag(event)" title="Arrastar linha">↕</button>
      <button type="button" class="frete-row-delete" onclick="deleteFreteConsultRow('${escapeAttr(key)}', ${rowIndex})" title="Excluir linha">Excluir</button>
    </td></tr>`;
  }).join('');

  return `<section class="frete-consult-card frete-consult-${escapeAttr(table.tone)}">
    <div class="frete-consult-title">
      <span>${escapeHtml(table.title)}</span>
      <button type="button" onclick="addFreteConsultRow('${escapeAttr(key)}')">Adicionar linha</button>
    </div>
    <div class="frete-consult-table-wrap">
      <table class="frete-consult-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderFreteConsultHeader(tableKey, label, colIndex) {
  if (colIndex > 1) return `<th>${escapeHtml(label)}</th>`;
  const sort = state.freteSort?.[tableKey];
  const isActive = sort?.col === colIndex;
  const nextDirection = isActive && sort.direction === 'asc' ? 'desc' : 'asc';
  const indicator = isActive ? (sort.direction === 'asc' ? 'A-Z' : 'Z-A') : '↕';
  const title = `${label}: ordenar ${nextDirection === 'asc' ? 'A a Z' : 'Z a A'}`;
  return `<th>
    <button type="button" class="frete-sort-btn ${isActive ? 'is-active' : ''}" onclick="sortFreteConsultTable('${escapeAttr(tableKey)}', ${colIndex})" title="${escapeAttr(title)}">
      <span>${escapeHtml(label)}</span>
      <em>${indicator}</em>
    </button>
  </th>`;
}

async function sortFreteConsultTable(tableKey, colIndex) {
  if (!isAdmin()) return;
  const table = state.freteConsultas[tableKey];
  if (!table?.rows) return;
  const current = state.freteSort[tableKey];
  const direction = current?.col === colIndex && current.direction === 'asc' ? 'desc' : 'asc';
  state.freteSort[tableKey] = { col: colIndex, direction };
  table.rows.sort((a, b) => {
    const textA = normalizeOption(a[colIndex]);
    const textB = normalizeOption(b[colIndex]);
    const result = textA.localeCompare(textB, 'pt-BR', { sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
  });
  renderFreteConsultas();
  await saveFreteConsultas();
}

function freteColumnType(colIndex) {
  return colIndex < 2 ? 'text' : 'accounting';
}

function formatFreteCellValue(value, colIndex) {
  const raw = String(value || '').trim();
  if (freteColumnType(colIndex) === 'text') return raw;
  return formatFreteAccounting(raw);
}

function formatFreteAccounting(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '--') return raw;
  const amount = parseFreteCurrency(raw);
  if (!Number.isFinite(amount)) return raw;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseFreteCurrency(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '--') return NaN;
  const cleaned = raw.replace(/[^\d,.-]/g, '');
  if (!cleaned) return NaN;
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : /^-?(\d{1,3}\.)+\d{3}$/.test(cleaned)
      ? cleaned.replace(/\./g, '')
      : cleaned;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function freteOriginTone(origin) {
  const normalized = normalizeOption(origin);
  if (normalized.includes('ARCOS')) return 'frete-origin-arcos';
  if (normalized.includes('BARROSO')) return 'frete-origin-barroso';
  if (normalized.includes('PEDRO')) return 'frete-origin-pedro';
  return '';
}

function freteOriginOptions() {
  return uniqueFreteValues(0);
}

function freteDestinationOptions(origin = '') {
  const normalizedOrigin = normalizeOption(origin);
  const rows = freteAllRows().filter(row => !normalizedOrigin || normalizeOption(row[0]) === normalizedOrigin);
  return [...new Set(rows.map(row => String(row[1] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function uniqueFreteValues(index) {
  return [...new Set(freteAllRows().map(row => String(row[index] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function freteAllRows() {
  return Object.values(state.freteConsultas || {}).flatMap(table => table.rows || []);
}

function updateFreteQueryDestinations() {
  const origin = document.getElementById('frete-query-origem')?.value || '';
  const destino = document.getElementById('frete-query-destino');
  if (!destino) return;
  const current = destino.value;
  const options = ['', ...freteDestinationOptions(origin)];
  setSelectOptions(destino, options);
  if (options.includes(current)) destino.value = current;
}

function consultarFreteValor() {
  const origem = document.getElementById('frete-query-origem')?.value || '';
  const destino = document.getElementById('frete-query-destino')?.value || '';
  const eixo = document.getElementById('frete-query-eixo')?.value || '';
  const result = document.getElementById('frete-query-result');
  if (!result) return;

  if (!origem || !destino || !eixo) {
    result.innerHTML = '<span class="is-error">Informe origem, destino e eixos.</span>';
    return;
  }

  const colIndex = FRETE_COLUMNS.indexOf(eixo);
  const matches = Object.values(state.freteConsultas || {}).map(table => {
    const row = (table.rows || []).find(item =>
      normalizeOption(item[0]) === normalizeOption(origem) &&
      normalizeOption(item[1]) === normalizeOption(destino)
    );
    return {
      title: table.title,
      tone: table.tone,
      value: row ? String(row[colIndex] || '').trim() : ''
    };
  }).filter(item => item.value && item.value !== '--');

  if (!matches.length) {
    result.innerHTML = '<span class="is-error">Nenhum valor cadastrado para essa combinação.</span>';
    return;
  }

  result.innerHTML = matches.map(item => `<div class="frete-result-pill frete-result-${escapeAttr(item.tone)}">
    <span>${escapeHtml(item.title)}</span>
    <strong>${escapeHtml(formatFreteCellValue(item.value, colIndex))}</strong>
  </div>`).join('');
}

async function addFreteConsultRow(tableKey) {
  if (!isAdmin()) return;
  const table = state.freteConsultas[tableKey];
  if (!table) return;
  table.rows.push(['', '', '', '', '', '']);
  renderFreteConsultas();
  await saveFreteConsultas();
}

async function deleteFreteConsultRow(tableKey, rowIndex) {
  if (!isAdmin()) return;
  const table = state.freteConsultas[tableKey];
  if (!table?.rows?.[rowIndex]) return;
  if (!confirm('Excluir esta linha da tabela de frete?')) return;
  table.rows.splice(rowIndex, 1);
  renderFreteConsultas();
  await saveFreteConsultas();
}

let freteDragState = null;

function startFreteRowDrag(event, tableKey, rowIndex) {
  if (!isAdmin()) return;
  freteDragState = { tableKey, rowIndex };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', `${tableKey}:${rowIndex}`);
  event.target.closest('tr')?.classList.add('frete-row-dragging');
}

function handleFreteRowDragOver(event) {
  if (!freteDragState) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('frete-row-drop-target');
}

function handleFreteRowDragLeave(event) {
  event.currentTarget.classList.remove('frete-row-drop-target');
}

async function dropFreteRow(event, tableKey, targetIndex) {
  if (!freteDragState || freteDragState.tableKey !== tableKey) return;
  event.preventDefault();
  document.querySelectorAll('.frete-row-drop-target').forEach(row => row.classList.remove('frete-row-drop-target'));

  const table = state.freteConsultas[tableKey];
  const sourceIndex = freteDragState.rowIndex;
  freteDragState = null;
  if (!table?.rows?.[sourceIndex] || sourceIndex === targetIndex) {
    renderFreteConsultas();
    return;
  }

  const [row] = table.rows.splice(sourceIndex, 1);
  table.rows.splice(targetIndex, 0, row);
  renderFreteConsultas();
  await saveFreteConsultas();
}

function endFreteRowDrag(event) {
  freteDragState = null;
  event.target.closest('tr')?.classList.remove('frete-row-dragging');
  document.querySelectorAll('.frete-row-drop-target').forEach(row => row.classList.remove('frete-row-drop-target'));
}

document.addEventListener('focusin', e => {
  const cell = e.target.closest?.('.frete-consult-table td[contenteditable="true"]');
  if (!cell) return;
  cell.dataset.value = cell.textContent.trim();
});

document.addEventListener('keydown', e => {
  const cell = e.target.closest?.('.frete-consult-table td[contenteditable="true"]');
  if (!cell) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    cell.blur();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    cell.textContent = cell.dataset.value || '';
    cell.blur();
  }
});

document.addEventListener('focusout', e => {
  const cell = e.target.closest?.('.frete-consult-table td[contenteditable="true"]');
  if (!cell) return;
  runBlurCommit(e, cell, () => commitFreteConsultEdit(cell));
});

async function commitFreteConsultEdit(cell) {
  if (!isAdmin()) return;
  const previous = cell.dataset.value || '';
  const col = Number(cell.dataset.col);
  const next = formatFreteCellValue(cell.textContent, col);
  cell.textContent = next;
  if (next === previous) return;

  const table = cell.dataset.table;
  const row = Number(cell.dataset.row);
  if (!state.freteConsultas[table]?.rows?.[row]) return;

  state.freteConsultas[table].rows[row][col] = next;
  await saveFreteConsultas();
  cell.dataset.value = next;
  cell.closest('tr').className = freteOriginTone(state.freteConsultas[table].rows[row][0]);
  updateFreteQueryDestinations();
}

function showEventWarning(eventText = '') {
  const overlay = document.getElementById('event-warning-overlay');
  document.getElementById('event-warning-text').textContent = eventText || 'Evento informado.';
  overlay.classList.remove('hidden');
  document.getElementById('event-warning-ok').focus();
}

function closeEventWarning() {
  document.getElementById('event-warning-overlay').classList.add('hidden');
}

function scheduleMetaGoalAlert({ origem, destino, meta, realizado }) {
  if (meta <= 0 || realizado < meta) return;
  const key = metaGoalAlertKey(origem, destino);
  if (state.metaGoalDismissed.has(key) || state.metaGoalAlertsShown.has(key)) return;
  state.metaGoalAlertsShown.add(key);
  state.metaGoalQueue.push({ key, origem, destino, meta, realizado });
  setTimeout(showNextMetaGoalDialog, 0);
}

function metaGoalAlertKey(origem, destino) {
  return `${state.currentDate}|${normalizeOption(origem)}|${normalizeOption(destino)}`;
}

function metaGoalStorageKey() {
  const userKey = state.userProfile?.user_id || state.userProfile?.id || state.userProfile?.email || 'anonimo';
  return `frotasys-meta-goal-ok:${userKey}`;
}

function loadMetaGoalDismissed() {
  try {
    const values = JSON.parse(localStorage.getItem(metaGoalStorageKey()) || '[]');
    return new Set(Array.isArray(values) ? values : []);
  } catch (e) {
    return new Set();
  }
}

function saveMetaGoalDismissed() {
  localStorage.setItem(metaGoalStorageKey(), JSON.stringify([...state.metaGoalDismissed]));
}

function showNextMetaGoalDialog() {
  if (state.metaGoalDialogOpen || state.metaGoalQueue.length === 0) return;
  const item = state.metaGoalQueue.shift();
  if (state.metaGoalDismissed.has(item.key)) return showNextMetaGoalDialog();
  state.metaGoalCurrent = item;
  state.metaGoalDialogOpen = true;
  document.getElementById('meta-goal-detail').textContent =
    `${item.origem} - ${item.destino}: ${formatKg(item.realizado)} de ${formatKg(item.meta)}`;
  document.getElementById('meta-goal-overlay').classList.remove('hidden');
  document.getElementById('meta-goal-ok').focus();
}

function closeMetaGoalDialog() {
  const overlay = document.getElementById('meta-goal-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  if (state.metaGoalCurrent?.key) {
    state.metaGoalDismissed.add(state.metaGoalCurrent.key);
    saveMetaGoalDismissed();
  }
  state.metaGoalCurrent = null;
  state.metaGoalDialogOpen = false;
  showNextMetaGoalDialog();
}

async function searchCarregamento(termOverride = '', filters = {}) {
  const term = String(termOverride || v('header-search-input')).trim();
  const status = document.getElementById('search-status');
  const results = document.getElementById('search-results');
  if (!term && !hasSearchFilters(filters)) {
    status.textContent = 'Informe ao menos um filtro para buscar.';
    results.innerHTML = '';
    return;
  }

  const btn = document.getElementById('search-btn');
  if (btn) {
    btn.textContent = 'Buscando...';
    btn.disabled = true;
  }
  status.textContent = '';
  results.innerHTML = '';

  const found = await fetchCarregamentosSearch({ term, ...filters });
  if (btn) {
    btn.textContent = 'Buscar';
    btn.disabled = false;
  }

  if (!found || found.length === 0) {
    status.textContent = 'Nenhum carregamento encontrado para essa busca.';
    return;
  }

  status.textContent = `${found.length} ${found.length === 1 ? 'carregamento encontrado' : 'carregamentos encontrados'}.`;
  results.innerHTML = found.map((viagem, index) => renderSearchResult(viagem, index, found.length)).join('');
}

async function fetchCarregamentosSearch(filters = {}) {
  const {
    term = '',
    dt = '',
    nota = '',
    contrato = '',
    cte = '',
    nome = '',
    placa = '',
    dataInicio = '',
    dataFim = ''
  } = filters;
  const normalizedTerm = normalizeSearchTerm(term);
  const normalizedDt = normalizeSearchTerm(dt);
  const normalizedCte = normalizeSearchTerm(cte);
  const normalizedNota = normalizeSearchTerm(nota);
  const normalizedContrato = normalizeSearchTerm(contrato);
  const normalizedNome = normalizeNameSearchTerm(nome);
  const normalizedPlaca = normalizeNameSearchTerm(placa);
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (dt) params.set('dt', dt);
  if (cte) params.set('cte', cte);
  if (nota) params.set('nota', nota);
  if (contrato) params.set('contrato', contrato);
  if (nome) params.set('nome', nome);
  if (placa) params.set('placa', placa);
  if (dataInicio) params.set('dataInicio', dataInicio);
  if (dataFim) params.set('dataFim', dataFim);
  const searchUrl = `/api/viagens/search?${params.toString()}`;

  try {
    const data = await apiFetch(searchUrl);
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.warn('Busca dedicada indisponível, usando busca local.', e);
  }

  const allViagens = await apiFetch('/api/viagens');
  if (!Array.isArray(allViagens)) return [];
  return allViagens
    .filter(viagem => {
      if (dataInicio && String(viagem.data || '') < dataInicio) return false;
      if (dataFim && String(viagem.data || '') > dataFim) return false;
      const dtValue = normalizeSearchTerm(viagem.dt);
      const nota = normalizeSearchTerm(viagem.nota);
      const contratoValue = normalizeSearchTerm(viagem.contrato);
      const cte = normalizeSearchTerm(viagem.cte);
      const nomeValue = normalizeNameSearchTerm(viagem.nome);
      const placaValue = normalizeNameSearchTerm(viagem.placa);
      if (normalizedTerm && nota !== normalizedTerm && cte !== normalizedTerm) return false;
      if (normalizedDt && dtValue !== normalizedDt) return false;
      if (normalizedCte && cte !== normalizedCte) return false;
      if (normalizedNota && nota !== normalizedNota) return false;
      if (normalizedContrato && contratoValue !== normalizedContrato) return false;
      if (normalizedNome && !nomeValue.includes(normalizedNome)) return false;
      if (normalizedPlaca && !placaValue.includes(normalizedPlaca)) return false;
      return true;
    })
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function normalizeSearchTerm(value) {
  const text = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const digits = text.replace(/\D/g, '');
  return digits || text;
}

function normalizeNameSearchTerm(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function renderSearchResult(viagem, index = 0, total = 1) {
  const title = viagem.nota || viagem.cte || viagem.nome || viagem.placa || 'Carregamento';
  const subtitle = [viagem.origem, viagem.destino].filter(Boolean).join(' → ');
  const collapsible = total > 1;
  const collapsed = collapsible && index > 0;
  const cardId = `search-result-${index}`;
  const fields = SEARCH_RESULT_FIELDS.map(field => `
    <div class="search-result-field">
      <span>${escapeHtml(field.label)}</span>
      <strong>${escapeHtml(formatSearchValue(field.key, viagem[field.key]))}</strong>
    </div>
  `).join('');

  return `<section class="search-result-card ${collapsed ? 'is-collapsed' : ''}" data-search-result-card>
    <div class="search-result-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle || 'Sem origem/destino')}</span>
      </div>
      <div class="search-result-head-actions">
        <em>${escapeHtml(formatSearchValue('data', viagem.data))}</em>
        ${collapsible ? `<button type="button" class="search-result-toggle" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="${escapeAttr(cardId)}" title="${collapsed ? 'Exibir resultado' : 'Recolher resultado'}">
          <span aria-hidden="true">${collapsed ? '▾' : '▴'}</span>
        </button>` : ''}
      </div>
    </div>
    <div class="search-result-grid" id="${escapeAttr(cardId)}">${fields}</div>
  </section>`;
}

function handleSearchResultToggle(event) {
  const button = event.target.closest('.search-result-toggle');
  if (!button) return;
  const card = button.closest('[data-search-result-card]');
  if (!card) return;

  const collapsed = card.classList.toggle('is-collapsed');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.title = collapsed ? 'Exibir resultado' : 'Recolher resultado';
  const icon = button.querySelector('span');
  if (icon) icon.textContent = collapsed ? '▾' : '▴';
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
  renderDateWeekday();
  renderReminderNote();
  renderTable('arcos');
  renderTable('agenciando');
  renderSummary();
  updateUndoButton();
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
  { key: 'carroceria', label: 'CARROCERIA', select: true },
  { key: 'kanguru', label: 'KANGURU', select: true },
  { key: 'pamcard', label: 'PAMCARD', select: true },
  { key: 'status', label: 'STATUS', select: true },
  { key: 'usuario', label: 'USUÁRIO' },
  { key: 'agendamento', label: 'AGENDAMENTO', quick: true, time: true },
  { key: 'descarga', label: 'DESCARGA', quick: true, dateTime: true },
  { key: 'telefone', label: 'TELEFONE', quick: true },
  { key: 'frete', label: 'EVENTO', quick: true },
  { key: 'produto', label: 'PRODUTO', select: true },
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
    updateTableScrollControls(secao);
    return;
  }

  const completedRows = rows.filter(isViagemConcluida);
  const pendingRows = rows.filter(v => !isViagemConcluida(v));
  const separator = completedRows.length && pendingRows.length
    ? `<tr class="table-completion-separator" aria-hidden="true"><td colspan="${FIELDS.length + 1}"></td></tr>`
    : '';

  tbody.innerHTML = [
    ...completedRows.map(renderTableRow),
    separator,
    ...pendingRows.map(renderTableRow)
  ].join('');
  updateStickyColumnWidths(document.getElementById(`table-${secao}`));
  updateTableScrollControls(secao);
}

function renderTableRow(v) {
    const originClass = originSlug(v.origem);
    const completeClass = isViagemConcluida(v) ? 'is-documentos-completos' : '';
    const semCadastroClass = isStatusSemCadastro(v.status) ? 'is-sem-cadastro' : '';
    const cells = FIELDS.map(f => renderCell(v, f)).join('');

    return `<tr data-id="${escapeHtml(v._id)}" class="origin-row ${originClass} ${completeClass} ${semCadastroClass}" oncontextmenu="showCtxMenu(event,'${escapeAttr(v._id)}')">
      ${cells}
      <td>
        <div class="row-actions">
          <button class="btn-row table-action-icon" onclick="copyViagem(event,'${escapeAttr(v._id)}')" title="Copiar dados" aria-label="Copiar dados"><span class="table-copy-icon" aria-hidden="true"></span></button>
          ${canEditViagem(v) ? `<button class="btn-row table-action-icon" onclick="editViagem('${escapeAttr(v._id)}')" title="Editar" aria-label="Editar"><span class="table-edit-icon" aria-hidden="true"></span></button>` : ''}
          ${canDeleteViagem(v) ? `<button class="btn-row table-action-icon danger" onclick="deleteViagem('${escapeAttr(v._id)}')" title="Excluir" aria-label="Excluir"><span class="table-delete-icon" aria-hidden="true"></span></button>` : ''}
        </div>
      </td>
    </tr>`;
}

const tableScrollSyncing = {};

function updateTableScrollControls(secao) {
  const table = document.getElementById(`table-${secao}`);
  const wrapper = table?.closest('.table-wrapper');
  const scrollArea = table?.closest('.table-scroll-area');
  const topScroll = document.querySelector(`[data-table-scroll-top="${secao}"]`);
  if (!wrapper) return;
  const contentWidth = Math.max(table?.scrollWidth || 0, scrollArea?.scrollWidth || 0);
  const hasHorizontalScroll = contentWidth > (scrollArea?.clientWidth || wrapper.clientWidth);
  wrapper.classList.toggle('has-horizontal-scroll', hasHorizontalScroll);
  if (topScroll) {
    const spacer = topScroll.firstElementChild;
    if (spacer) spacer.style.width = `${contentWidth}px`;
    const areaMax = getMaxScrollLeft(scrollArea);
    const topMax = getMaxScrollLeft(topScroll);
    const ratio = areaMax > 0 ? (scrollArea?.scrollLeft || 0) / areaMax : 0;
    topScroll.scrollLeft = topMax > 0 ? ratio * topMax : (scrollArea?.scrollLeft || 0);
  }
  if (scrollArea && !scrollArea.dataset.scrollSyncReady) {
    scrollArea.dataset.scrollSyncReady = 'true';
    scrollArea.addEventListener('scroll', () => syncTableScrollFromBottom(secao));
  }
}

function updateAllTableScrollControls() {
  updateTableScrollControls('arcos');
  updateTableScrollControls('agenciando');
}

function scrollTableToEdge(secao, direction) {
  const table = document.getElementById(`table-${secao}`);
  const wrapper = table?.closest('.table-wrapper');
  const scrollArea = table?.closest('.table-scroll-area');
  const scrollMain = table?.closest('.table-scroll-main');
  const topScroll = document.querySelector(`[data-table-scroll-top="${secao}"]`);
  if (!table || !wrapper) return;

  updateTableScrollControls(secao);

  const maxLeft = Math.max(
    getMaxScrollLeft(scrollArea),
    getMaxScrollLeft(scrollMain),
    getMaxScrollLeft(wrapper),
    getMaxScrollLeft(topScroll),
    getMaxScrollLeft(document.scrollingElement),
    Math.max(0, table.scrollWidth - (scrollArea?.clientWidth || wrapper.clientWidth))
  );
  const left = direction === 'right' ? maxLeft : 0;
  setTableScrollLeft(secao, left);
}

function getMaxScrollLeft(element) {
  if (!element) return 0;
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function setTableScrollLeft(secao, left) {
  const table = document.getElementById(`table-${secao}`);
  const scrollArea = table?.closest('.table-scroll-area');
  const scrollMain = table?.closest('.table-scroll-main');
  const wrapper = table?.closest('.table-wrapper');
  const topScroll = document.querySelector(`[data-table-scroll-top="${secao}"]`);
  const areaMax = getMaxScrollLeft(scrollArea);
  const topMax = getMaxScrollLeft(topScroll);
  const topLeft = areaMax > 0 && topMax > 0 ? (left / areaMax) * topMax : left;
  tableScrollSyncing[secao] = true;
  if (scrollArea) scrollArea.scrollLeft = left;
  if (scrollMain) scrollMain.scrollLeft = left;
  if (wrapper) wrapper.scrollLeft = left;
  if (topScroll) topScroll.scrollLeft = topLeft;
  if (document.scrollingElement) document.scrollingElement.scrollLeft = left;
  tableScrollSyncing[secao] = false;
}

function syncTableScrollFromTop(secao) {
  if (tableScrollSyncing[secao]) return;
  const topScroll = document.querySelector(`[data-table-scroll-top="${secao}"]`);
  const scrollArea = document.getElementById(`table-${secao}`)?.closest('.table-scroll-area');
  if (!topScroll || !scrollArea) return;
  const table = document.getElementById(`table-${secao}`);
  const spacer = topScroll.firstElementChild;
  const contentWidth = Math.max(table?.scrollWidth || 0, scrollArea.scrollWidth || 0);
  if (spacer) spacer.style.width = `${contentWidth}px`;
  const topMax = getMaxScrollLeft(topScroll);
  const areaMax = getMaxScrollLeft(scrollArea);
  const left = topMax > 0 ? (topScroll.scrollLeft / topMax) * areaMax : topScroll.scrollLeft;
  setTableScrollLeft(secao, left);
}

function syncTableScrollFromBottom(secao) {
  if (tableScrollSyncing[secao]) return;
  const topScroll = document.querySelector(`[data-table-scroll-top="${secao}"]`);
  const scrollArea = document.getElementById(`table-${secao}`)?.closest('.table-scroll-area');
  if (!topScroll || !scrollArea) return;
  updateTableScrollControls(secao);
  setTableScrollLeft(secao, scrollArea.scrollLeft);
}

function updateStickyColumnWidths(table) {
  if (!table) return;

  const measureField = (field, minWidth) => {
    const cells = [...table.querySelectorAll(`th[data-field="${field}"], td[data-field="${field}"]`)];
    return cells.reduce((width, cell) => Math.max(width, Math.ceil(cell.scrollWidth)), minWidth);
  };

  table.style.setProperty('--sticky-placa-width', `${measureField('placa', 132)}px`);
  table.style.setProperty('--sticky-nome-width', `${measureField('nome', 142)}px`);
  table.style.setProperty('--sticky-tipo-width', `${measureField('tipo', 136)}px`);
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

function normalizeContratoConclusao(value) {
  const normalized = normalizeOption(value);
  return ['ADIANTAMENTO EFETUADO', 'NAO FAZ CONTRATO'].includes(normalized) ? normalized : '';
}

function hasNotaPreenchida(viagem) {
  return String(viagem?.nota || '').trim() !== '';
}

function isStatusSemCadastro(status) {
  return ['SEM CADASTRO', 'S/ CADASTRO'].includes(normalizeOption(status));
}

function renderCell(v, field) {
  let raw = field.key === 'tipo' ? normalizeTipo(v[field.key]) : (v[field.key] || '');
  if (field.key === 'usuario' && isViagemConcluida(v)) raw = '';
  const safeRaw = escapeAttr(raw);

  if (field.select) {
    const cls = field.key === 'origem' ? originSlug(raw) : field.key === 'status' ? statusSlug(raw) : field.key === 'tipo' ? tipoSlug(raw) : '';
    const style = selectColorStyle(field.key, raw);
    return `<td class="cell-select cell-${field.key}" data-field="${field.key}" data-id="${escapeAttr(v._id)}">
      <select class="table-select ${cls}" style="${escapeAttr(style)}" data-field="${field.key}" data-id="${escapeAttr(v._id)}" onchange="updateInlineSelect(this)" ${canEditViagemField(v, field.key) ? '' : 'disabled'}>
        ${renderOptions(getSelectOptions(field.key), raw)}
      </select>
    </td>`;
  }

  let display = raw;
  if (field.money && raw !== '') display = formatMoney(raw);
  if (field.number && raw !== '') display = formatPeso(raw);
  if (field.time && raw !== '') display = normalizeHours(raw);
  if (field.dateTime && raw !== '') display = formatDescargaDateTime(raw);
  if (field.date && raw !== '') display = formatDateBR(raw);
  if (field.key === 'telefone') display = firstPhone(raw);

  if (field.key === 'placa') {
    const canPromote = v.secao === 'agenciando' && canEditViagem(v);
    return `<td data-field="${field.key}" data-id="${escapeAttr(v._id)}" data-raw="${safeRaw}" class="quick-edit placa-cell">
      <span class="placa-content">
        <button class="promote-row-btn ${canPromote ? '' : 'is-disabled'}" onclick="promoteToFaturado(event,'${escapeAttr(v._id)}')" title="${canPromote ? 'Enviar para faturado' : 'Já está faturado'}">↑</button>
        <span>${escapeHtml(display)}</span>
      </span>
    </td>`;
  }

  let cls = field.quick && canEditViagemField(v, field.key) ? 'quick-edit' : '';
  if (field.key === 'agendamento' && v.agendamentoVerde) cls += ' has-agendamento';
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
  if (field === 'kanguru') return ['', ...configOptionList('kanguru')];
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
  ['tipo', 'produto', 'carroceria', 'kanguru', 'pamcard', 'status', 'origem', 'destino'].forEach(field => {
    setSelectOptions(document.getElementById(`f-${field}`), getSelectOptions(field));
  });
  setSelectOptions(document.getElementById('waitlist-tipo'), ['', ...configOptionList('tipo')]);
  setSelectOptions(document.getElementById('waitlist-origem'), ['', ...originList()]);
  setReportOperationOptions();
}

function setSelectOptions(select, options) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = options.map(opt => `<option value="${escapeAttr(opt)}">${escapeHtml(opt || '-')}</option>`).join('');
  if (options.includes(current)) select.value = current;
}

function setReportOperationOptions() {
  const select = document.getElementById('report-operation');
  if (!select) return;
  const current = select.value;
  const options = originList();
  select.innerHTML = `<option value="">Todas as operações</option>${options.map(opt => `<option value="${escapeAttr(opt)}">${escapeHtml(titleCase(opt))}</option>`).join('')}`;
  if (options.includes(current) || current === '') select.value = current;
}

function openSettingsModal() {
  if (!isAdmin()) return;
  resetExportViagensForm();
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
        <span>${values.length} itens${hasColors ? ' - cor de fundo' : ''}</span>
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

function resetExportViagensForm() {
  const start = document.getElementById('export-start-date');
  const end = document.getElementById('export-end-date');
  const status = document.getElementById('settings-export-status');
  if (start && !start.value) start.value = state.currentDate;
  if (end && !end.value) end.value = state.currentDate;
  if (status) {
    status.textContent = '';
    status.className = 'settings-export-status';
  }
}

async function exportViagensExcel() {
  const start = document.getElementById('export-start-date')?.value;
  const end = document.getElementById('export-end-date')?.value;
  const btn = document.getElementById('settings-export-btn');

  if (!start || !end) {
    setExportStatus('Selecione a data inicial e a data final.', true);
    return;
  }
  if (start > end) {
    setExportStatus('A data inicial não pode ser maior que a data final.', true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Exportando...';
  setExportStatus('Gerando arquivo Excel...', false);

  try {
    const token = await FrotasysAuth.getAccessToken();
    const params = new URLSearchParams({ inicio: start, fim: end });
    const res = await fetch(`/api/viagens/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!res.ok) {
      const message = await responseErrorMessage(res);
      setExportStatus(message || 'Não foi possível exportar as viagens.', true);
      return;
    }

    const blob = await res.blob();
    const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) || `viagens_${formatDateForFilename(start)}_${formatDateForFilename(end)}.xlsx`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setExportStatus('Arquivo Excel gerado.', false, true);
  } catch (e) {
    console.error('Erro ao exportar viagens:', e);
    setExportStatus('Erro ao exportar as viagens.', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Exportar Excel';
  }
}

async function responseErrorMessage(res) {
  const text = await res.text();
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    return data.error || text;
  } catch (e) {
    return text;
  }
}

function setExportStatus(message, isError = false, isSuccess = false) {
  const status = document.getElementById('settings-export-status');
  if (!status) return;
  status.textContent = message;
  status.className = `settings-export-status ${isError ? 'is-error' : ''} ${isSuccess ? 'is-success' : ''}`.trim();
}

function filenameFromDisposition(disposition) {
  const match = String(disposition || '').match(/filename="?([^"]+)"?/i);
  return match ? match[1] : '';
}

function formatDateForFilename(date) {
  return formatDateBR(date).replace(/\//g, '-');
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
  return `<label class="settings-color-control" title="Cor de fundo de ${escapeAttr(value)}">
    <input type="color" value="${escapeAttr(color)}" data-field="${escapeAttr(field)}" data-value="${escapeAttr(value)}" onchange="setConfigColor(this.dataset.field, this.dataset.value, this.value)">
    <span style="${escapeAttr(colorPreviewStyle(color))}"></span>
  </label>`;
}

async function setConfigColor(field, value, color) {
  if (!CONFIG_COLOR_FIELDS.includes(field) || !isHexColor(color)) return;
  const normalized = normalizeOption(value);
  state.configColors[field] = { ...(state.configColors[field] || {}), [normalized]: color };
  renderAll();
  renderSettingsModal();
  const saved = await apiFetch(`/api/config-colors/${encodeURIComponent(field)}/${encodeURIComponent(value)}`, {
    method: 'PUT',
    body: JSON.stringify({ color })
  });
  if (saved) {
    state.configColors = mergeConfigColors(saved);
    renderAll();
    renderSettingsModal();
  }
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
    .filter(v => !state.originFilter || v.origem === state.originFilter || (secao === 'agenciando' && !v.origem)));
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
  clearPreparedSummaryCopy();

  const visibleOperations = operationsList().filter(op => !state.originFilter || op.origem === state.originFilter);
  container.innerHTML = visibleOperations.map(op => renderOriginSummaryCard(op)).join('');

  container.querySelectorAll('.editable-meta').forEach(cell => {
    cell.onclick = () => startMetaEdit(cell);
  });
}

async function copySummaryAsImage() {
  const panel = document.getElementById('summary-arcos');
  const button = document.getElementById('summary-copy-btn');
  if (!panel || !document.querySelector('#summary-cards .summary-card')) return;

  if (!hasFreshSummaryCopyBlob()) {
    if (!window.html2canvas) {
      showSummaryToast('Não foi possível gerar a imagem do resumo. Atualize a página e tente novamente.', 'error');
      return;
    }

    showSummaryToast('Preparando imagem do resumo...');
    if (!state.summaryCopyRenderPromise) prepareSummaryCopyImage();
    state.summaryCopyRenderPromise
      ?.then(() => showSummaryToast('Imagem pronta. Clique novamente para copiar.'))
      .catch(error => {
        console.error('Erro ao preparar imagem do resumo:', error);
        showSummaryToast('Não foi possível gerar a imagem do resumo.', 'error');
      });
    return;
  }

  if (button) button.disabled = true;

  try {
    await copyPreparedSummaryImage(state.summaryCopyBlob);
    clearPreparedSummaryCopy();
    showSummaryToast('Resumo copiado para a área de transferência');
  } catch (error) {
    console.error('Erro ao copiar resumo como imagem:', error);
    showSummaryToast(summaryClipboardErrorMessage(error), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function prepareSummaryCopyImage() {
  const panel = document.getElementById('summary-arcos');
  if (!panel || !document.querySelector('#summary-cards .summary-card')) return;
  if (hasFreshSummaryCopyBlob() || state.summaryCopyRenderPromise || !window.html2canvas) return;
  state.summaryCopyRenderPromise = renderSummaryPanelBlob(panel)
    .then(async blob => {
      state.summaryCopyBlob = blob;
      state.summaryCopyDataUrl = await blobToDataUrl(blob).catch(() => '');
      state.summaryCopyBlobAt = Date.now();
      return blob;
    })
    .catch(error => {
      clearPreparedSummaryCopy();
      throw error;
    })
    .finally(() => {
      state.summaryCopyRenderPromise = null;
    });
}

async function getPreparedSummaryCopyBlob(panel) {
  if (!window.html2canvas) {
    throw new Error('Não foi possível gerar a imagem do resumo.');
  }

  if (hasFreshSummaryCopyBlob()) return state.summaryCopyBlob;

  if (!state.summaryCopyRenderPromise) {
    showSummaryToast('Preparando imagem do resumo...');
    prepareSummaryCopyImage();
  }

  if (state.summaryCopyRenderPromise) {
    return state.summaryCopyRenderPromise;
  }

  return renderSummaryPanelBlob(panel);
}

function hasFreshSummaryCopyBlob() {
  return Boolean(state.summaryCopyBlob && Date.now() - state.summaryCopyBlobAt < 120000);
}

async function renderSummaryPanelBlob(panel) {
  const stage = createSummaryCaptureStage(panel);
  try {
    return await renderSummaryCaptureBlob(stage);
  } catch (error) {
    console.warn('html2canvas falhou. Gerando resumo por canvas:', error);
    return renderSummaryCanvasBlob(panel);
  } finally {
    stage.remove();
  }
}

function canWriteClipboardImage() {
  const supportsPng = typeof window.ClipboardItem === 'undefined' ||
    !window.ClipboardItem.supports ||
    window.ClipboardItem.supports('image/png');
  return Boolean(
    window.isSecureContext &&
    window.html2canvas &&
    navigator.clipboard?.write &&
    typeof window.ClipboardItem !== 'undefined' &&
    supportsPng
  );
}

async function writeSummaryImageToClipboard(blobOrPromise) {
  if (!canWriteClipboardImage()) {
    throw new Error('Área de transferência de imagem indisponível neste navegador.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOrPromise })]);
}

async function copyPreparedSummaryImage(blob) {
  try {
    await writeSummaryImageToClipboard(blob);
    return;
  } catch (clipboardError) {
    const dataUrl = state.summaryCopyDataUrl || await blobToDataUrl(blob);
    state.summaryCopyDataUrl = dataUrl;
    if (!copyDataUrlImageToClipboard(dataUrl)) {
      throw clipboardError;
    }
  }
}

function prepareReportSummaryCopyImage() {
  const panel = document.getElementById('report-summary-card');
  if (!panel || !document.querySelector('#report-summary-compact .report-summary-origin')) return;
  if (hasFreshReportSummaryCopyBlob() || state.reportSummaryCopyRenderPromise || !window.html2canvas) return;
  state.reportSummaryCopyRenderPromise = renderReportSummaryPanelBlob(panel)
    .then(async blob => {
      state.reportSummaryCopyBlob = blob;
      state.reportSummaryCopyDataUrl = await blobToDataUrl(blob).catch(() => '');
      state.reportSummaryCopyBlobAt = Date.now();
      return blob;
    })
    .catch(error => {
      clearPreparedReportSummaryCopy();
      throw error;
    })
    .finally(() => {
      state.reportSummaryCopyRenderPromise = null;
    });
}

async function copyReportSummaryAsImage() {
  const panel = document.getElementById('report-summary-card');
  const button = document.getElementById('report-summary-copy');
  if (!panel || !document.querySelector('#report-summary-compact .report-summary-origin')) return;

  if (!hasFreshReportSummaryCopyBlob()) {
    if (!window.html2canvas) {
      showSummaryToast('Não foi possível gerar a imagem do resumo. Atualize a página e tente novamente.', 'error');
      return;
    }

    showSummaryToast('Preparando imagem do resumo...');
    if (!state.reportSummaryCopyRenderPromise) prepareReportSummaryCopyImage();
    state.reportSummaryCopyRenderPromise
      ?.then(() => showSummaryToast('Imagem pronta. Clique novamente para copiar.'))
      .catch(error => {
        console.error('Erro ao preparar imagem do resumo do relatório:', error);
        showSummaryToast('Não foi possível gerar a imagem do resumo.', 'error');
      });
    return;
  }

  if (button) button.disabled = true;
  try {
    await copyPreparedSummaryImage(state.reportSummaryCopyBlob);
    clearPreparedReportSummaryCopy();
    showSummaryToast('Resumo copiado para a área de transferência');
  } catch (error) {
    console.error('Erro ao copiar resumo do relatório como imagem:', error);
    showSummaryToast(summaryClipboardErrorMessage(error), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function hasFreshReportSummaryCopyBlob() {
  return Boolean(state.reportSummaryCopyBlob && Date.now() - state.reportSummaryCopyBlobAt < 120000);
}

async function renderReportSummaryPanelBlob(panel) {
  const stage = document.createElement('div');
  stage.className = 'summary-copy-stage';
  stage.style.width = `${Math.ceil(panel.getBoundingClientRect().width || panel.scrollWidth)}px`;

  const clone = panel.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('report-summary-copy-capture');
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  clone.querySelectorAll('.report-summary-copy').forEach(el => el.remove());
  clone.querySelectorAll('.card-row-toggle').forEach(button => {
    const label = document.createElement('span');
    label.textContent = button.textContent.replace(/[▶▼]/g, '').trim();
    button.replaceWith(label);
  });
  sanitizeSummaryCaptureClone(clone);
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    return await renderSummaryCaptureBlob(stage);
  } finally {
    stage.remove();
  }
}

async function writePreparedSummaryCopy(button) {
  if (button) button.disabled = true;
  try {
    await copyPreparedSummaryImage(state.summaryCopyBlob);
    clearPreparedSummaryCopy();
    showSummaryToast('Resumo copiado como imagem');
  } catch (error) {
    console.error('Erro ao copiar resumo preparado:', error);
    showSummaryToast(summaryClipboardErrorMessage(error), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function copyDataUrlImageToClipboard(dataUrl) {
  if (copyImageViaCopyEvent(dataUrl)) return true;

  const wrapper = document.createElement('div');
  const img = document.createElement('img');
  const selection = window.getSelection();
  const range = document.createRange();

  wrapper.contentEditable = 'true';
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  wrapper.style.width = '1px';
  wrapper.style.height = '1px';
  wrapper.style.overflow = 'hidden';
  img.src = dataUrl;
  img.alt = 'Resumo Consolidado';
  wrapper.appendChild(img);
  document.body.appendChild(wrapper);

  try {
    if (!selection) return false;
    selection.removeAllRanges();
    range.selectNode(img);
    selection.addRange(range);
    return document.execCommand('copy');
  } catch (error) {
    console.warn('Fallback de cópia por seleção falhou:', error);
    return false;
  } finally {
    selection?.removeAllRanges();
    wrapper.remove();
  }
}

function copyImageViaCopyEvent(dataUrl) {
  let handled = false;
  const html = `<img src="${dataUrl}" alt="Resumo Consolidado">`;
  const onCopy = event => {
    event.clipboardData?.setData('text/html', html);
    event.clipboardData?.setData('text/uri-list', dataUrl);
    event.clipboardData?.setData('text/plain', 'Resumo Consolidado');
    event.preventDefault();
    handled = true;
  };

  document.addEventListener('copy', onCopy, { once: true });
  try {
    const copied = document.execCommand('copy');
    return copied && handled;
  } catch (error) {
    console.warn('Fallback de cópia por evento falhou:', error);
    return false;
  } finally {
    document.removeEventListener('copy', onCopy);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao preparar imagem.'));
    reader.readAsDataURL(blob);
  });
}

async function renderSummaryCaptureBlob(stage) {
  if (document.fonts?.ready) await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvas = await window.html2canvas(stage.firstElementChild, {
    backgroundColor: '#ffffff',
    scale: Math.min(2, window.devicePixelRatio || 1.5),
    useCORS: true,
    logging: false
  });
  const blob = await canvasToPngBlob(canvas);
  if (!blob) throw new Error('Falha ao gerar imagem do resumo.');
  return blob;
}

async function renderSummaryCanvasBlob(panel) {
  if (document.fonts?.ready) await document.fonts.ready;

  const cards = [...panel.querySelectorAll('.summary-card')];
  if (!cards.length) throw new Error('Resumo vazio para gerar imagem.');

  const data = cards.map(readSummaryCardData);
  const width = 1280;
  const margin = 24;
  const gap = 14;
  const cardWidth = width - margin * 2;
  const heights = data.map(card => 96 + (card.rows.length + 1) * 30 + 92);
  const height = margin + 34 + 16 + heights.reduce((sum, value) => sum + value, 0) + gap * (data.length - 1) + margin;
  const ratio = Math.min(2, window.devicePixelRatio || 1.5);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível criar a imagem do resumo.');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#172033';
  ctx.font = '800 24px Inter, Arial, sans-serif';
  ctx.fillText('Resumo Consolidado', margin, margin + 24);

  let y = margin + 50;
  data.forEach((card, index) => {
    drawSummaryCanvasCard(ctx, card, margin, y, cardWidth, heights[index]);
    y += heights[index] + gap;
  });

  const blob = await canvasToPngBlob(canvas);
  if (!blob) throw new Error('Falha ao gerar imagem do resumo.');
  return blob;
}

function readSummaryCardData(card) {
  return {
    title: cleanCanvasText(card.querySelector('.summary-operation strong')?.textContent || 'Operação'),
    accent: summaryCaptureAccent(card),
    percent: cleanCanvasText(card.querySelector('.summary-percent span')?.textContent || ''),
    headers: [...card.querySelectorAll('thead th')].map(cell => cleanCanvasText(cell.textContent)),
    rows: [...card.querySelectorAll('tbody tr')]
      .filter(row => !row.classList.contains('collapsed'))
      .map(row => ({
        className: row.className || '',
        cells: [...row.cells].map(cell => cleanCanvasText(cell.textContent))
      })),
    kpis: [...card.querySelectorAll('.summary-kpi')].map(kpi => ({
      label: cleanCanvasText(kpi.querySelector('span')?.textContent || ''),
      value: cleanCanvasText(kpi.querySelector('strong')?.textContent || ''),
      className: kpi.className || ''
    }))
  };
}

function cleanCanvasText(value) {
  return String(value || '')
    .replace(/[▶▼⊖]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function drawSummaryCanvasCard(ctx, card, x, y, width, height) {
  const tableTop = y + 18;
  const tableLeft = x + 14;
  const tableWidth = width - 28;
  const rowHeight = 30;
  const columns = Math.max(card.headers.length, ...card.rows.map(row => row.cells.length));
  const firstCol = 170;
  const otherCol = columns > 1 ? (tableWidth - firstCol) / (columns - 1) : tableWidth;

  drawRoundRect(ctx, x, y, width, height, 8, '#ffffff', '#d8e0ec');
  ctx.fillStyle = card.accent;
  ctx.fillRect(x, y, 5, height);

  drawTableRow(ctx, card.headers, tableLeft, tableTop, firstCol, otherCol, rowHeight, '#f8fafc', '#34465e', true);
  card.rows.forEach((row, index) => {
    const tone = row.className.includes('meta') ? '#f0fdf4'
      : row.className.includes('total') ? '#f8fbff'
        : row.className.includes('falta') ? '#fff1f2'
          : '#ffffff';
    const color = row.className.includes('falta') ? '#9f1239'
      : row.className.includes('meta') ? '#0f8a4a'
        : row.className.includes('total') ? '#0f3f95'
          : '#172033';
    drawTableRow(ctx, row.cells, tableLeft, tableTop + rowHeight * (index + 1), firstCol, otherCol, rowHeight, tone, color, false);
  });

  const footerY = tableTop + rowHeight * (card.rows.length + 1) + 16;
  ctx.strokeStyle = '#d8e0ec';
  ctx.beginPath();
  ctx.moveTo(x, footerY - 8);
  ctx.lineTo(x + width, footerY - 8);
  ctx.stroke();

  drawRoundRect(ctx, tableLeft, footerY, 44, 44, 7, card.accent, card.accent);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.title.charAt(0) || 'R', tableLeft + 22, footerY + 23);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = card.accent;
  ctx.font = '800 11px Inter, Arial, sans-serif';
  ctx.fillText('OPERAÇÃO', tableLeft + 56, footerY + 16);
  ctx.fillStyle = '#172033';
  ctx.font = '900 17px Inter, Arial, sans-serif';
  ctx.fillText(card.title, tableLeft + 56, footerY + 39);

  const kpiX = tableLeft + 260;
  const kpiW = 136;
  card.kpis.slice(0, 5).forEach((kpi, index) => {
    const bx = kpiX + index * kpiW;
    drawRoundRect(ctx, bx, footerY, kpiW - 8, 48, 6, '#ffffff', '#d8e0ec');
    ctx.fillStyle = '#34465e';
    ctx.font = '800 10px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(kpi.label, bx + (kpiW - 8) / 2, footerY + 17);
    ctx.fillStyle = kpi.className.includes('falta') ? '#e11d48' : kpi.className.includes('agenc') ? '#8b5cf6' : card.accent;
    ctx.font = '900 16px IBM Plex Mono, Consolas, monospace';
    ctx.fillText(kpi.value, bx + (kpiW - 8) / 2, footerY + 38);
  });

  ctx.textAlign = 'center';
  drawRoundRect(ctx, x + width - 92, footerY, 62, 62, 31, '#ffffff', card.accent, 5);
  ctx.fillStyle = '#172033';
  ctx.font = '900 17px IBM Plex Mono, Consolas, monospace';
  ctx.fillText(card.percent || '0%', x + width - 61, footerY + 38);
  ctx.fillStyle = '#5c6b7f';
  ctx.font = '800 11px Inter, Arial, sans-serif';
  ctx.fillText('% da Meta', x + width - 61, footerY + 78);
  ctx.textAlign = 'left';
}

function drawTableRow(ctx, cells, x, y, firstCol, otherCol, height, background, color, header) {
  ctx.fillStyle = background;
  ctx.fillRect(x, y, firstCol + otherCol * Math.max(0, cells.length - 1), height);
  ctx.strokeStyle = '#d8e0ec';
  ctx.font = header ? '900 11px Inter, Arial, sans-serif' : '800 12px IBM Plex Mono, Consolas, monospace';
  ctx.textBaseline = 'middle';

  cells.forEach((cell, index) => {
    const cellX = x + (index === 0 ? 0 : firstCol + otherCol * (index - 1));
    const cellW = index === 0 ? firstCol : otherCol;
    ctx.strokeRect(cellX, y, cellW, height);
    ctx.fillStyle = color;
    ctx.textAlign = index === 0 ? 'left' : 'right';
    const textX = index === 0 ? cellX + 10 : cellX + cellW - 10;
    ctx.fillText(cell, textX, y + height / 2);
  });
}

function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke, strokeWidth = 1) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

function summaryClipboardErrorMessage(error) {
  if (!window.isSecureContext) {
    return 'Não foi possível copiar a imagem. Abra o Dashlog em HTTPS ou localhost para liberar a área de transferência.';
  }
  if (isClipboardNotAllowed(error)) {
    return 'Não foi possível copiar. Permita acesso à área de transferência nas configurações do navegador.';
  }
  return 'Não foi possível copiar. O navegador não permitiu acesso à área de transferência.';
}

function isClipboardNotAllowed(error) {
  return String(error?.name || '') === 'NotAllowedError';
}

function clearPreparedSummaryCopy() {
  state.summaryCopyBlob = null;
  state.summaryCopyDataUrl = '';
  state.summaryCopyBlobAt = 0;
  state.summaryCopyRenderPromise = null;
}

function clearPreparedReportSummaryCopy() {
  state.reportSummaryCopyBlob = null;
  state.reportSummaryCopyDataUrl = '';
  state.reportSummaryCopyBlobAt = 0;
  state.reportSummaryCopyRenderPromise = null;
}

function createSummaryCaptureStage(panel) {
  const width = Math.min(Math.max(Math.ceil(panel.getBoundingClientRect().width || panel.scrollWidth), 860), 1280);
  const stage = document.createElement('div');
  stage.className = 'summary-copy-stage';
  stage.style.width = `${width}px`;

  const clone = panel.cloneNode(true);
  clone.removeAttribute('id');
  clone.classList.add('summary-copy-capture');
  clone.style.width = `${width}px`;
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  clone.querySelectorAll('.summary-copy-btn, .summary-config-btn').forEach(el => el.remove());
  clone.querySelectorAll('.card-row-toggle').forEach(button => {
    const label = document.createElement('span');
    label.textContent = button.textContent.replace(/[▶▼]/g, '').trim();
    button.replaceWith(label);
  });
  sanitizeSummaryCaptureClone(clone);

  stage.appendChild(clone);
  document.body.appendChild(stage);
  return stage;
}

function sanitizeSummaryCaptureClone(clone) {
  clone.querySelectorAll('.summary-card, .report-summary-origin').forEach(card => {
    const accent = summaryCaptureAccent(card);
    card.style.setProperty('--card-accent', accent);
    card.style.borderLeftColor = accent;
    card.style.boxShadow = 'none';
  });

  clone.querySelectorAll('.summary-icon').forEach(icon => {
    const accent = summaryCaptureAccent(icon.closest('.summary-card, .report-summary-origin'));
    icon.style.background = accent;
    icon.style.boxShadow = 'none';
  });

  clone.querySelectorAll('.summary-percent').forEach(percent => {
    const value = parseFloat(percent.style.getPropertyValue('--percent')) || 0;
    const accent = summaryCaptureAccent(percent.closest('.summary-card, .report-summary-origin'));
    percent.style.background = '#ffffff';
    percent.style.border = `5px solid ${accent}`;
    percent.style.boxShadow = `inset 0 0 0 ${Math.max(0, Math.round((100 - value) / 10))}px rgba(244, 161, 184, .28)`;
  });

  clone.querySelectorAll('*').forEach(el => {
    el.style.transition = 'none';
    el.style.animation = 'none';
  });
}

function summaryCaptureAccent(card) {
  if (card?.classList?.contains('card-purple')) return '#8b5cf6';
  if (card?.classList?.contains('card-green')) return '#16a34a';
  return '#2563eb';
}

function canvasToPngBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function showSummaryToast(message, type = 'success') {
  let toast = document.querySelector('.summary-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'summary-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `summary-toast ${type === 'error' ? 'is-error' : ''}`.trim();
  clearTimeout(showSummaryToast.timer);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  showSummaryToast.timer = setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 3200);
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
    scheduleMetaGoalAlert({ origem, destino: dest, meta: metaVal, realizado: totalVal });

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
  const percent = totals.meta > 0 ? Math.max(0, Math.round((totals.total / totals.meta) * 100)) : 0;
  const percentFill = Math.min(100, percent);
  const accentClass = cardAccentClass(origem);
  const metaTitle = metaCollapsed ? 'Mostrar meta por tipo de cimento' : 'Ocultar meta por tipo de cimento';
  const totalTitle = totalCollapsed ? 'Mostrar carregado por produto' : 'Ocultar carregado por produto';
  const configButton = isAdmin()
    ? `<button class="summary-config-btn" onclick="openOperationModal('${escapeAttr(operacao._id || '')}')" title="Configurar visualização do card">⚙</button>`
    : '';

  return `<article class="summary-card ${accentClass} origin-card-${originSlug(origem)}" data-operation-id="${escapeAttr(operationKey)}">
    <div class="summary-card-table-wrap">
      <table class="summary-card-table">
        <thead>
          <tr><th>TIPO DE PRODUTO</th>${destinos.map(dest => `<th>${escapeHtml(dest)}</th>`).join('')}<th>TOTAL</th></tr>
        </thead>
        <tbody>
          <tr class="card-row-meta"><td><button type="button" class="card-row-toggle card-meta-toggle" onclick="toggleCardMetaProducts('${escapeAttr(operationKey)}')" title="${metaTitle}"><span class="card-product-arrow">${metaCollapsed ? '▶' : '▼'}</span><span>META</span></button></td>${metaCells.join('')}<td>${formatKg(totals.meta)}</td></tr>
          ${metaProductRows}
          <tr class="card-row-fat"><td>FATURADO</td>${fatCells.join('')}<td>${formatKg(totals.fat)}</td></tr>
          <tr class="card-row-agenc"><td>AGENCIADO</td>${agencCells.join('')}<td>${formatKg(totals.agenc)}</td></tr>
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
      <div class="summary-card-actions ${isAdmin() ? '' : 'no-config'}">
        ${configButton}
        <div class="summary-percent" style="--percent:${percentFill}">
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
  if (!isAdmin()) return;
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
    const percent = metaVal > 0 ? Math.round((realizado / metaVal) * 100) : 0;
    const percentFill = Math.min(100, Math.max(0, percent));
    const falta = Math.max(metaVal - realizado, 0);

    return `<div class="meta-chart-item">
      <div class="meta-chart-head">
        <span>${dest}</span>
        <strong>${formatKg(realizado)} / ${formatKg(metaVal)}</strong>
      </div>
      <div class="meta-chart-track">
        <div class="meta-chart-fill" style="width:${percentFill}%"></div>
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
    const percent = metaTotal > 0 ? Math.round((peso / metaTotal) * 100) : 0;
    const percentFill = Math.min(100, Math.max(0, percent));

    return `<div class="transport-chart-item">
      <div class="transport-chart-head">
        <span class="transport-dot ${type.className}"></span>
        <strong>${type.label}</strong>
        <em>${percent}%</em>
      </div>
      <div class="transport-chart-track">
        <div class="transport-chart-fill ${type.className}" style="width:${percentFill}%"></div>
      </div>
      <div class="transport-chart-value">${formatKg(peso)} carregado</div>
    </div>`;
  }).join('');
}

// ─── INLINE EDIT ──────────────────────────────────────────────────────────────
let activeInlineCell = null;
let activeInlineEdit = null;
let windowLostFocus = false;
let deferredFocusElement = null;

window.addEventListener('blur', () => {
  windowLostFocus = true;
});

window.addEventListener('focus', () => {
  windowLostFocus = false;
  restoreDeferredEditingFocus();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) restoreDeferredEditingFocus();
});

function shouldDeferBlurCommit(event, element) {
  const nextTarget = event?.relatedTarget;
  if (nextTarget && document.contains(nextTarget)) return false;
  if (!windowLostFocus && document.visibilityState !== 'hidden' && document.hasFocus()) return false;
  deferredFocusElement = element;
  if (activeInlineEdit?.input === element) {
    updateActiveInlineEditSnapshot(element);
    activeInlineEdit.shouldRefocus = true;
  }
  return true;
}

function runBlurCommit(event, element, commit) {
  if (shouldDeferBlurCommit(event, element)) return;
  if (!event?.relatedTarget) {
    setTimeout(() => {
      if (shouldDeferBlurCommit(null, element)) return;
      commit();
    }, 0);
    return;
  }
  commit();
}

function restoreDeferredEditingFocus() {
  setTimeout(() => {
    if (activeInlineEdit?.shouldRefocus) {
      restoreActiveInlineEditFocus();
      return;
    }
    if (deferredFocusElement?.isConnected) {
      deferredFocusElement.focus();
      if (deferredFocusElement.isContentEditable) placeCaretAtEnd(deferredFocusElement);
    }
    deferredFocusElement = null;
  }, 0);
}

function updateActiveInlineEditSnapshot(input) {
  if (!activeInlineEdit || activeInlineEdit.input !== input) return;
  activeInlineEdit.value = input.value;
  try {
    activeInlineEdit.selectionStart = input.selectionStart;
    activeInlineEdit.selectionEnd = input.selectionEnd;
  } catch (e) {
    activeInlineEdit.selectionStart = null;
    activeInlineEdit.selectionEnd = null;
  }
}

function restoreActiveInlineEditFocus() {
  const edit = activeInlineEdit;
  if (!edit?.input?.isConnected) return;
  edit.shouldRefocus = false;
  edit.input.focus();
  try {
    if (edit.selectionStart !== null && edit.selectionEnd !== null) {
      edit.input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    }
  } catch (e) {
    edit.input.select();
  }
  deferredFocusElement = null;
}

function placeCaretAtEnd(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function updateInlineSelect(select) {
  if (!canEditViagens()) return;
  const id = select.dataset.id;
  const viagem = state.viagens.find(v => v._id === id);
  const field = select.dataset.field;
  if (!canEditViagemField(viagem, field)) return renderAll();
  const value = normalizeFieldValue(field, select.value);
  select.disabled = true;
  const updated = await updateViagemField(id, field, value);
  select.disabled = false;
  if (!updated) renderAll();
}

async function promoteToFaturado(event, id) {
  event.stopPropagation();
  if (!canEditViagens()) return;
  const viagem = state.viagens.find(v => v._id === id);
  if (!canEditViagem(viagem)) return;
  if (!viagem || viagem.secao === 'arcos') return;
  await updateViagemField(id, 'secao', 'arcos');
}

function startInlineEdit(td) {
  if (!canEditViagens()) return;
  if (activeInlineCell === td && activeInlineEdit?.input?.isConnected) {
    activeInlineEdit.input.focus();
    return;
  }
  if (activeInlineCell) cancelInlineEdit();
  const field = td.dataset.field;
  if (field === 'usuario') return;
  const id = td.dataset.id;
  const viagem = state.viagens.find(v => v._id === id);
  if (!canEditViagemField(viagem, field)) return;
  const cur = normalizeFieldValue(field, td.dataset.raw ?? td.textContent.trim());
  activeInlineCell = td;

  const inputType = field === 'peso' || field === 'vlr_pedagio' ? 'number' : field === 'data' ? 'date' : field === 'descarga' ? 'datetime-local' : 'text';
  const inputValue = field === 'descarga' ? descargaToInputValue(cur) : cur;
  const step = field === 'peso' ? '0.001' : field === 'vlr_pedagio' ? '0.01' : '';
  const placeholder = inputPlaceholder(field);
  td.innerHTML = `<input type="${inputType}" value="${escapeAttr(inputValue)}" ${step ? `step="${step}"` : ''} ${placeholder ? `placeholder="${escapeAttr(placeholder)}"` : ''}>`;
  const inp = td.querySelector('input');
  activeInlineEdit = {
    td,
    input: inp,
    id,
    field,
    value: inputValue,
    selectionStart: null,
    selectionEnd: null,
    shouldRefocus: false
  };
  inp.focus();
  inp.select();
  if (field === 'telefone') {
    inp.oninput = () => { inp.value = maskPhoneListInput(inp.value); };
  }
  if (TIME_FIELDS.includes(field)) {
    inp.oninput = () => { inp.value = maskHourInput(inp.value); };
  }
  if (isDocumentNumberField(field)) {
    inp.oninput = () => { inp.value = formatDocumentNumber(inp.value, field); };
  }
  inp.addEventListener('input', () => updateActiveInlineEditSnapshot(inp));
  inp.addEventListener('keyup', () => updateActiveInlineEditSnapshot(inp));
  inp.addEventListener('click', () => updateActiveInlineEditSnapshot(inp));
  inp.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitInlineEdit(td, id, field, inp.value);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      td.textContent = formatCellValue(field, cur);
      activeInlineCell = null;
      activeInlineEdit = null;
    }
  };
  inp.onblur = event => {
    updateActiveInlineEditSnapshot(inp);
    runBlurCommit(event, inp, () => {
      if (activeInlineCell === td) commitInlineEdit(td, id, field, inp.value);
    });
  };
}

async function commitInlineEdit(td, id, field, value) {
  activeInlineCell = null;
  activeInlineEdit = null;
  const normalized = normalizeFieldValue(field, value);
  const viagem = state.viagens.find(item => item._id === id);
  const previous = viagem ? (viagem[field] || '') : (td.dataset.raw || '');
  const updated = await updateViagemField(id, field, normalized);
  if (!updated) {
    td.dataset.raw = previous;
    td.textContent = formatCellValue(field, previous);
  }
}

async function updateViagemField(id, field, value, options = {}) {
  const viagem = state.viagens.find(v => v._id === id);
  if (!canEditViagemField(viagem, field)) {
    renderAll();
    return null;
  }
  const previousValue = normalizeFieldValue(field, viagem?.[field] || '');
  const nextValue = normalizeFieldValue(field, value);
  const updated = await apiFetch(`/api/viagens/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ [field]: nextValue })
  });
  if (updated) {
    const eventText = String(updated.frete || '').trim();
    const shouldWarnEvent = field === 'cte' && String(nextValue || '').trim() && eventText;
    const idx = state.viagens.findIndex(v => v._id === id);
    if (idx !== -1) state.viagens[idx] = updated;
    if (!options.skipUndo && isUndoField(field) && previousValue !== nextValue) {
      setUndoAction({
        id,
        field,
        previousValue,
        nextValue,
        at: Date.now()
      });
    }
    renderAll();
    if (shouldWarnEvent) setTimeout(() => showEventWarning(eventText), 0);
  }
  return updated;
}

function cancelInlineEdit() {
  if (!activeInlineCell) return;
  const v = state.viagens.find(item => item._id === activeInlineCell.dataset.id);
  if (v) activeInlineCell.textContent = formatCellValue(activeInlineCell.dataset.field, v[activeInlineCell.dataset.field] || '');
  activeInlineCell = null;
  activeInlineEdit = null;
}

function normalizeFieldValue(field, value) {
  if (field === 'descarga') return normalizeDescargaDateTime(value);
  if (TIME_FIELDS.includes(field)) return normalizeHours(value);
  if (field === 'telefone') return normalizePhoneList(value);
  if (field === 'status') return normalizeOption(value) === 'CONCLUIDO' ? 'CONCLUIDO' : value;
  if (field === 'tipo') return normalizeTipo(value);
  if (isDocumentNumberField(field)) return formatDocumentNumber(value, field);
  if (field === 'data') return String(value || '').trim();
  return String(value || '').trim();
}

function formatCellValue(field, value) {
  if (isDocumentNumberField(field) && value !== '') return formatDocumentNumber(value, field);
  if (field === 'vlr_pedagio' && value !== '') return formatMoney(value);
  if (field === 'peso' && value !== '') return formatPeso(value);
  if (field === 'descarga' && value !== '') return formatDescargaDateTime(value);
  if (TIME_FIELDS.includes(field) && value !== '') return normalizeHours(value);
  if (field === 'telefone' && value !== '') return firstPhone(value);
  if (field === 'data' && value !== '') return formatDateBR(value);
  return value || '';
}

function inputPlaceholder(field) {
  if (field === 'telefone') return '(00) 00000-0000 / (00) 00000-0000';
  if (field === 'descarga') return '00:00 00/00/0000';
  if (TIME_FIELDS.includes(field)) return '00:00';
  if (isDocumentNumberField(field)) return field === 'contrato' ? '000.000 ou -' : '000.000';
  return '';
}

function isDocumentNumberField(field) {
  return DOCUMENT_NUMBER_FIELDS.includes(field);
}

function formatDocumentNumber(value, field = '') {
  const raw = String(value || '').trim();
  if (field === 'contrato' && raw === '-') return '-';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function copyDocumentValue(value) {
  return String(value || '').replace(/\./g, '');
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
  if (!normalized) return '#ffffff';
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
  return `color:#000;border-color:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .78);background:rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, .38);`;
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
  document.querySelectorAll('#modal-overlay .hidden-on-new').forEach(el => el.classList.toggle('is-hidden', !viagem));
  document.querySelectorAll('#modal-overlay .bulk-only').forEach(el => el.classList.toggle('is-hidden', !!viagem));
  const fields = ['placa','nome','tipo','produto','secao','carroceria','kanguru','pamcard','status','usuario','agendamento','descarga','telefone','frete','origem','destino','peso','obs'];
  fields.forEach(f => {
    const el = document.getElementById(`f-${f.replace('_','-')}`);
    if (!el) return;
    el.value = viagem
      ? (f === 'tipo' ? normalizeTipo(viagem[f]) : f === 'descarga' ? descargaToInputValue(viagem[f]) : (viagem[f] || ''))
      : (f === 'secao' ? 'agenciando' : '');
  });
  const usuarioInput = document.getElementById('f-usuario');
  if (usuarioInput && !viagem) usuarioInput.value = '';
  const quantidadeInput = document.getElementById('f-quantidade');
  if (quantidadeInput) quantidadeInput.value = '1';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('f-placa').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  state.editingId = null;
}

function openOperationModal(operationId = null) {
  if (!isAdmin()) return;
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
  if (!canEditViagens()) return;
  if (state.editingId) {
    const viagem = state.viagens.find(item => item._id === state.editingId);
    if (!canEditViagem(viagem)) return closeModal();
  }
  const data = {
    placa: v('f-placa').toUpperCase(),
    nome: v('f-nome').toUpperCase(),
    tipo: normalizeTipo(v('f-tipo')),
    produto: v('f-produto'),
    secao: state.editingId ? v('f-secao') : 'agenciando',
    carroceria: v('f-carroceria'),
    kanguru: v('f-kanguru'),
    pamcard: v('f-pamcard'),
    status: v('f-status'),
    descarga: normalizeDescargaDateTime(v('f-descarga')),
    agendamento: normalizeHours(v('f-agendamento')),
    telefone: normalizePhoneList(v('f-telefone')),
    frete: v('f-frete'),
    origem: v('f-origem'),
    destino: v('f-destino'),
    peso: v('f-peso'),
    obs: v('f-obs'),
    data: state.currentDate
  };
  const quantidade = state.editingId ? 1 : Math.max(1, Math.min(20, Number(v('f-quantidade')) || 1));

  if (!data.origem) {
    alert('Informe ORIGEM para salvar a viagem.');
    document.getElementById('f-origem')?.focus();
    return;
  }

  const btn = document.getElementById('btn-save');
  btn.textContent = 'Salvando...';
  btn.disabled = true;

  let saved;
  if (state.editingId) {
    saved = await apiFetch(`/api/viagens/${state.editingId}`, { method: 'PUT', body: JSON.stringify(data) });
  } else if (quantidade === 1) {
    saved = await apiFetch('/api/viagens', { method: 'POST', body: JSON.stringify(data) });
  } else {
    const payloads = Array.from({ length: quantidade }, () => ({ ...data, placa: '', nome: '' }));
    const results = [];
    for (const payload of payloads) {
      const created = await apiFetch('/api/viagens', { method: 'POST', body: JSON.stringify(payload) });
      if (!created) break;
      results.push(created);
    }
    saved = results.length === quantidade ? results : null;
  }

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
  if (!canEditViagem(viagem)) return;
  if (viagem) openModal(viagem);
}

async function copyViagem(event, id) {
  const viagem = state.viagens.find(v => v._id === id);
  if (!viagem) return;

  const rows = [
    ['NOME', viagem.nome || ''],
    ['PLACA', viagem.placa || ''],
    ['ORIGEM', viagem.origem || ''],
    ['DESTINO', viagem.destino || ''],
    ['PESO', formatPeso(viagem.peso || '')],
    ['PRODUTO', viagem.produto || ''],
    ['DT', viagem.dt || '']
  ];
  const text = rows.map(([label, value]) => `*${label}:* ${value}`).join('\n');
  const html = rows
    .map(([label, value]) => `<div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`)
    .join('');

  showCopyBubble(event?.currentTarget);

  try {
    await writeFormattedClipboard(text, html);
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

async function writeFormattedClipboard(text, html) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      'text/html': new Blob([html], { type: 'text/html' })
    })]);
    return;
  }
  await navigator.clipboard.writeText(text);
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

function showFloatingCopyBubble(x, y) {
  const bubble = document.createElement('span');
  bubble.className = 'copy-bubble copy-bubble-floating';
  bubble.textContent = 'Copiado';
  bubble.style.left = `${x || window.innerWidth / 2}px`;
  bubble.style.top = `${y || window.innerHeight / 2}px`;
  document.body.appendChild(bubble);

  setTimeout(() => bubble.classList.add('is-visible'), 10);
  setTimeout(() => {
    bubble.classList.remove('is-visible');
    setTimeout(() => bubble.remove(), 180);
  }, 1200);
}

async function deleteViagem(id) {
  const viagem = state.viagens.find(v => v._id === id);
  if (!canDeleteViagem(viagem)) return;
  if (!confirm('Excluir este registro?')) return;
  await apiFetch(`/api/viagens/${id}`, { method: 'DELETE' });
  state.viagens = state.viagens.filter(v => v._id !== id);
  renderAll();
}

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
function showCtxMenu(e, id, mode = 'row') {
  e.preventDefault();
  state.ctxTargetId = id;
  const viagem = state.viagens.find(v => v._id === id);
  const copyItem = document.getElementById('ctx-copy');
  const editItem = document.getElementById('ctx-edit');
  copyItem.style.display = mode === 'placa' ? '' : 'none';
  editItem.style.display = mode === 'placa' ? 'none' : canEditViagem(viagem) ? '' : 'none';
  if (copyItem.style.display === 'none' && editItem.style.display === 'none') return;
  const menu = document.getElementById('ctx-menu');
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 160)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 90)}px`;
  menu.classList.remove('hidden');
}

function hideCtxMenu() {
  document.getElementById('ctx-menu').classList.add('hidden');
}

async function copyPlacaMenuValue(event, id) {
  const viagem = state.viagens.find(v => v._id === id);
  hideCtxMenu();
  if (!viagem) return;
  const text = String(viagem.placa || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showFloatingCopyBubble(event?.clientX, event?.clientY);
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

function showContratoMenu(e, cell) {
  e.preventDefault();
  const viagem = state.viagens.find(item => item._id === cell.dataset.id);
  if (!viagem) return;
  const field = cell.dataset.field;
  const isContratoField = field === 'contrato';
  const concluida = isViagemConcluida(viagem);

  hideCtxMenu();
  hideAgendamentoMenu();
  state.contratoTargetId = cell.dataset.id;
  state.contratoTargetField = field;

  document.getElementById('contrato-adiantamento').style.display = isContratoField && !concluida && canEditViagem(viagem) ? '' : 'none';
  document.getElementById('contrato-sem-contrato').style.display = isContratoField && !concluida && canEditViagem(viagem) ? '' : 'none';
  document.getElementById('contrato-desfazer').style.display = 'none';

  const menu = document.getElementById('contrato-menu');
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 240)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 95)}px`;
  menu.classList.remove('hidden');
}

function hideContratoMenu() {
  document.getElementById('contrato-menu').classList.add('hidden');
  state.contratoTargetId = null;
  state.contratoTargetField = '';
}

async function copyContratoMenuValue(event) {
  const id = state.contratoTargetId;
  const field = state.contratoTargetField;
  const x = event?.clientX;
  const y = event?.clientY;
  hideContratoMenu();
  if (!id || !field) return;
  const viagem = state.viagens.find(item => item._id === id);
  const text = copyDocumentValue(viagem?.[field] || '');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showFloatingCopyBubble(x, y);
}

async function concluirContrato(tipo) {
  const id = state.contratoTargetId;
  hideContratoMenu();
  if (!id) return;
  const viagem = state.viagens.find(item => item._id === id);
  if (!hasDocumentosCompletos(viagem)) {
    alert('Preencha CT-E, MANIFESTO, CONTRATO e NOTA antes de concluir.');
    return;
  }
  await updateViagemField(id, 'conclusaoContrato', tipo);
}

async function desfazerConclusaoContrato() {
  const id = state.contratoTargetId;
  hideContratoMenu();
  if (!id || !isAdmin()) return;
  await updateViagemField(id, 'conclusaoContrato', '');
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
  if (!isAdmin()) return;
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

function normalizeDescargaDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[4]}:${isoMatch[5]} ${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const brMatch = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (brMatch) {
    const hour = brMatch[1].padStart(2, '0').slice(-2);
    const minute = brMatch[2].padStart(2, '0').slice(0, 2);
    const day = brMatch[3].padStart(2, '0').slice(-2);
    const month = brMatch[4].padStart(2, '0').slice(-2);
    const year = brMatch[5].length === 2 ? `20${brMatch[5]}` : brMatch[5];
    return `${hour}:${minute} ${day}/${month}/${year}`;
  }

  return raw;
}

function formatDescargaDateTime(value) {
  return normalizeDescargaDateTime(value);
}

function descargaToInputValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}`;

  const brMatch = normalizeDescargaDateTime(raw).match(/^(\d{2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brMatch) return '';
  return `${brMatch[5]}-${brMatch[4]}-${brMatch[3]}T${brMatch[1]}:${brMatch[2]}`;
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

