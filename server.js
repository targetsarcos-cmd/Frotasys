const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const ExcelJS = require('exceljs');
const supabase = require('./supabaseClient');
const { calculateTripStatus, hasAdvanceOk } = require('./tripStatus');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const TABLES = {
  viagens: 'viagens',
  metas: 'metas',
  operacoes: 'operacoes',
  configOptions: 'config_options'
};

const DEFAULT_OPERACOES = [
  { origem: 'ARCOS', metaTipo: 'arcos', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA'], ordem: 1 },
  { origem: 'PEDRO LEOPOLDO', metaTipo: 'pedro_leopoldo', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA'], ordem: 2 },
  { origem: 'BARROSO', metaTipo: 'barroso', produtos: ['CPII-F', 'CPIII', 'CPV'], resumoProdutos: ['CPII-F', 'CPIII', 'CPV'], resumoDestinos: ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA'], ordem: 3 }
];

const CONFIG_FIELDS = ['tipo', 'produto', 'carroceria', 'kanguru', 'pamcard', 'status', 'origem', 'destino'];
const CONFIG_COLOR_FIELDS = ['tipo', 'status', 'origem', 'destino'];
const CONFIG_SEED_MARKER_FIELD = '__system_seed';
const CONFIG_SEED_MARKERS = {
  defaults: 'CONFIG_DEFAULTS_V1',
  kanguru: 'CONFIG_KANGURU_V1',
  statusSemCadastro: 'CONFIG_STATUS_SEM_CADASTRO_V1',
  statusSemCadastroDtCriada: 'CONFIG_STATUS_SEM_CADASTRO_DT_CRIADA_V1'
};
const WAITLIST_FIELD = '__lista_espera';
const FRETE_CONSULT_FIELD = '__frete_consultas';
const LEMBRETE_FIELD = '__lembrete_diario';
const OPERATION_MESSAGES_FIELD = '__operation_messages';
const USER_PROFILE_SETTINGS_FIELD = '__user_profile_settings';
const WORK_TYPE_FIELD = '__work_type';
const WORK_SESSION_FIELD = '__trip_work_session';
const WORK_EVENT_FIELD = '__trip_work_session_event';
const AVATAR_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads', 'avatars');
const AVATAR_PUBLIC_PREFIX = '/uploads/avatars';
const FRETE_COLUMNS = ['ORIGEM', 'DESTINO', '5 EIXO', '6 EIXO', '7 EIXO', '9 EIXO'];
const DEFAULT_WORK_TYPES = [
  { name: 'DT', code: 'DT', color: '#f97316', icon: 'play', displayOrder: 1 },
  { name: 'CT-e', code: 'CTE', color: '#2563eb', icon: 'file', displayOrder: 2 },
  { name: 'Manifesto', code: 'MANIFESTO', color: '#7c3aed', icon: 'file-text', displayOrder: 3 },
  { name: 'Nota Fiscal', code: 'NOTA_FISCAL', color: '#16a34a', icon: 'receipt', displayOrder: 4 },
  { name: 'Pedágio', code: 'PEDAGIO', color: '#0f766e', icon: 'ticket', displayOrder: 5 },
  { name: 'Conferência', code: 'CONFERENCIA', color: '#0891b2', icon: 'check', displayOrder: 6 },
  { name: 'Cadastro', code: 'CADASTRO', color: '#4f46e5', icon: 'user', displayOrder: 7 },
  { name: 'Pendência', code: 'PENDENCIA', color: '#dc2626', icon: 'alert', displayOrder: 8 },
  { name: 'Agendamento', code: 'AGENDAMENTO', color: '#059669', icon: 'calendar', displayOrder: 9 },
  { name: 'Financeiro', code: 'FINANCEIRO', color: '#b7791f', icon: 'money', displayOrder: 10 },
  { name: 'Outro', code: 'OUTRO', color: '#64748b', icon: 'dot', displayOrder: 11 }
];
const DEFAULT_FRETE_CONSULTAS = {
  terceiros: {
    title: 'TERCEIROS',
    tone: 'terceiros',
    rows: [
      ['ARCOS', 'SOROCABA', 'R$ 4.650,00', 'R$ 5.082,00', 'R$ 6.250,00', 'R$ 6.400,00'],
      ['ARCOS', 'AMERICANA', 'R$ 3.650,00', 'R$ 4.000,00', 'R$ 4.600,00', 'R$ 5.800,00'],
      ['ARCOS', 'OSASCO', 'R$ 4.040,00', 'R$ 4.400,00', 'R$ 5.000,00', 'R$ 6.200,00'],
      ['ARCOS', 'RIBEIRÃƒO P.', 'R$ 2.696,00', 'R$ 3.200,00', 'R$ 3.600,00', 'R$ 4.200,00'],
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
      ['ARCOS', 'RIBEIRÃƒO P.', '--', '3.300,00', 'R$ 3.600,00', 'R$ 4.500,00'],
      ['ARCOS', 'SJRP', '--', '4.350,00', 'R$ 5.000,00', 'R$ 6.000,00'],
      ['BARROSO', 'PINDA', '--', '--', '--', '--'],
      ['BARROSO', 'SJRP', '--', '--', '--', '--'],
      ['BARROSO', 'AMERICANA', '--', '--', '--', '--'],
      ['BARROSO', 'SOROCABA', '--', 'R$ 4.719,00', 'R$ 5.064,00', 'R$ 6.291,00'],
      ['PEDRO L', 'AMERICANA', '--', '--', 'R$ 5.545,00', 'R$ 6.883,00'],
      ['PEDRO L', 'SJRP', '', '', 'R$ 5.721,00', 'R$ 6.347,00'],
      ['PEDRO L', 'SOROCABA', '', '', 'R$ 5.884,00', 'R$ 6.974,00'],
      ['PEDRO L', 'OSASCO', '', '', 'R$ 5.517,00', 'R$ 6.852,00'],
      ['PEDRO L', 'MAUÃ', '', '', 'R$ 5.515,00', 'R$ 6.850,00'],
      ['PEDRO L', 'SÃƒO J. DOS CAMPOS', '', '', 'R$ 5.541,00', 'R$ 6.879,00'],
      ['PEDRO L', 'MOGI DAS CRUZES', '', '', 'R$ 5.545,00', 'R$ 6.883,00'],
      ['PEDRO L', 'PINDA', '', '', 'R$ 5.333,00', 'R$ 6.619,00'],
      ['PEDRO L', 'SÃƒO JOSÃ‰ DO RIO PRETO', '', '', 'R$ 5.721,00', 'R$ 6.347,00'],
      ['PEDRO L', 'SANTO ANDRÃ‰', '', '', 'R$ 5.514,00', 'R$ 6.848,00']
    ]
  }
};
const DEFAULT_CONFIG_OPTIONS = {
  tipo: ['AGREGADO', 'CARRETEIRO', 'DEDICADO', 'FROTA'],
  produto: ['CPII-F', 'CPIII', 'CPV'],
  carroceria: ['GRADE BAIXA', 'BAU', 'SIDER', 'TANQUE', 'GRANELEIRO'],
  kanguru: ['TEM KANGURU', 'SEM KANGURU'],
  pamcard: ['PAMCARD OK', 'FECHAMENTO', 'SEM PAMCARD'],
  status: ['CRIAR DT / PROGRAMAR', 'CRIAR DT', 'PROGRAMAR', 'AGUARDANDO CARREGAMENTO', 'EMITIR CTE', 'ADIANTAMENTO / DESCARGA', 'ADIANTAMENTO', 'AGENDAR DESCARGA', 'CONCLUIDO', 'SEM CADASTRO', 'SEM CADASTRO / DT CRIADA', 'CONFERIR MOTORISTA'],
  origem: DEFAULT_OPERACOES.map(op => op.origem),
  destino: ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA']
};

const UNIQUE_VIAGEM_FIELDS = [
  { key: 'dt', label: 'DT' },
  { key: 'nota', label: 'NOTA' },
  { key: 'cte', label: 'CT-E' },
  { key: 'num_pedagio', label: 'NÂº DO PEDÃGIO' }
];
const DOCUMENT_NUMBER_FIELDS = ['nota', 'contrato', 'cte', 'manifesto'];
const CONTRATO_CONCLUSAO_OPTIONS = ['ADIANTAMENTO EFETUADO', 'NAO FAZ CONTRATO'];
const LOCKED_EDITABLE_FIELDS = ['descarga', 'marcadoAmarelo', 'trocaMotoristaConcluida'];
const VIAGEM_HISTORY_LIMIT = 500;
const VIAGEM_MAX_FUTURE_DAYS = 3;
const SUPABASE_DOC_SELECT = 'id,dados,created_at,updated_at';
const DEFAULT_RANGE_LIMIT = 200;
const VIAGENS_SEARCH_LIMIT = 200;
const APP_CACHE_TTL_MS = 45 * 1000;
const VIAGENS_EXPORT_COLUMNS = [
  { key: 'placa', header: 'PLACA', width: 12 },
  { key: 'nome', header: 'NOME', width: 20 },
  { key: 'tipo', header: 'Tipo', width: 12 },
  { key: 'carroceria', header: 'Carroceria', width: 16 },
  { key: 'pamcard', header: 'PANCARD', width: 14 },
  { key: 'status', header: 'STATUS', width: 14 },
  { key: 'usuario', header: 'USUÃRIO', width: 14 },
  { key: 'agendamento', header: 'AGENDAMENTO', width: 14 },
  { key: 'descarga', header: 'DESCARGA', width: 18 },
  { key: 'telefone', header: 'TELEFONE', width: 18 },
  { key: 'produto', header: 'PRODUTO', width: 14 },
  { key: 'origem', header: 'ORIGEM', width: 14 },
  { key: 'destino', header: 'DESTINO', width: 14 },
  { key: 'peso', header: 'PESO', width: 10 },
  { key: 'dt', header: 'DT', width: 12 },
  { key: 'cte', header: 'CT-E', width: 12 },
  { key: 'nota', header: 'NOTA', width: 12 },
  { key: 'num_pedagio', header: 'NUMERO PEDÃGIO', width: 16 },
  { key: 'vlr_pedagio', header: 'VALOR PEDÃGIO', width: 16 },
  { key: 'horas', header: 'HORAS', width: 10 }
];
const VIAGEM_FIELD_LABELS = {
  placa: 'PLACA',
  nome: 'NOME',
  tipo: 'TIPO',
  eixos: 'EIXOS',
  carroceria: 'CARROCERIA',
  kanguru: 'KANGURU',
  pamcard: 'PAMCARD',
  status: 'STATUS',
  usuario: 'USUARIO',
  agendamento: 'AGENDAMENTO',
  descarga: 'DESCARGA',
  telefone: 'TELEFONE',
  telefone2: 'TELEFONE 2',
  produto: 'PRODUTO',
  origem: 'ORIGEM',
  destino: 'DESTINO',
  peso: 'PESO',
  dt: 'DT',
  cte: 'CT-E',
  manifesto: 'MANIFESTO',
  contrato: 'CONTRATO',
  nota: 'NOTA',
  hora_nf: 'HORA NF',
  num_pedagio: 'N PED',
  valor_adiantamento: 'VALOR ADIANTAMENTO',
  vlr_pedagio: 'VLR PED',
  horas: 'HORAS',
  obs: 'OBSERVACAO',
  data: 'DATA',
  secao: 'SECAO',
  conclusaoContrato: 'CONCLUSAO CONTRATO',
  marcadoAmarelo: 'MARCAÃ‡ÃƒO AMARELA'
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/html2canvas', express.static(path.join(__dirname, 'node_modules', 'html2canvas', 'dist')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));

app.use('/api', (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - started;
    if (elapsed > 3000) {
      console.warn(`[slow-api] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsed}ms`);
    }
  });
  next();
});

const appCache = new Map();

async function cachedValue(key, loader, ttl = APP_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = appCache.get(key);
  if (cached && cached.expires > now) return cached.value;
  const value = await loader();
  appCache.set(key, { value, expires: now + ttl });
  return value;
}

function invalidateCache(prefix = '') {
  for (const key of appCache.keys()) {
    if (!prefix || key.startsWith(prefix)) appCache.delete(key);
  }
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

function supabaseToFrontend(record) {
  const doc = { ...(record?.dados || {}) };
  if (isViagemBloqueada(doc)) {
    doc.status = 'CONCLUIDO';
    doc.usuario = '';
  }
  doc._id = record.id;
  doc.id = record.id;
  if (!doc.createdAt && record.created_at) doc.createdAt = record.created_at;
  if (record.updated_at) doc.updatedAt = record.updated_at;
  return doc;
}

function frontendToSupabase(data = {}) {
  const doc = { ...data };
  delete doc._id;
  delete doc.id;
  delete doc.created_at;
  delete doc.updated_at;
  return { dados: doc };
}

function legacyNedbToSupabase(doc = {}) {
  return frontendToSupabase(doc);
}

async function selectDocs(table) {
  const { data, error } = await supabase.from(table).select(SUPABASE_DOC_SELECT);
  if (error) throw error;
  return (data || []).map(supabaseToFrontend);
}

function applyJsonFilters(query, filters = {}) {
  return Object.entries(filters || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null || value === '') return acc;
    return acc.eq(`dados->>${key}`, value);
  }, query);
}

async function selectDocsByJson(table, filters = {}, options = {}) {
  let query = supabase.from(table).select(SUPABASE_DOC_SELECT);
  query = applyJsonFilters(query, filters);

  if (options.gte) {
    Object.entries(options.gte).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query = query.gte(`dados->>${key}`, value);
    });
  }
  if (options.lte) {
    Object.entries(options.lte).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query = query.lte(`dados->>${key}`, value);
    });
  }
  if (options.ilike) {
    Object.entries(options.ilike).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query = query.ilike(`dados->>${key}`, `%${value}%`);
    });
  }
  if (options.order) {
    options.order.forEach(({ key, ascending = true, json = true }) => {
      query = query.order(json ? `dados->>${key}` : key, { ascending });
    });
  }
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(supabaseToFrontend);
}

async function selectJsonTextValues(table, key) {
  const { data, error } = await supabase
    .from(table)
    .select(`${key}:dados->>${key}`)
    .not(`dados->>${key}`, 'is', null);
  if (error) throw error;
  return (data || []).map(row => row[key]).filter(Boolean);
}

async function countDocs(table, predicate = null, filters = {}) {
  if (!predicate) {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    query = applyJsonFilters(query, filters);
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  }
  const docs = Object.keys(filters || {}).length ? await selectDocsByJson(table, filters) : await selectDocs(table);
  return docs.filter(predicate).length;
}

async function findOneById(table, id) {
  const { data, error } = await supabase.from(table).select(SUPABASE_DOC_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? supabaseToFrontend(data) : null;
}

async function findOne(table, predicate) {
  const docs = await selectDocs(table);
  return docs.find(predicate) || null;
}

async function insertDoc(table, data) {
  const now = new Date().toISOString();
  const payload = legacyNedbToSupabase({
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  });
  const { data: inserted, error } = await supabase.from(table).insert(payload).select(SUPABASE_DOC_SELECT).single();
  if (error) throw error;
  invalidateCache();
  return supabaseToFrontend(inserted);
}

async function insertDocs(table, docs) {
  const now = new Date().toISOString();
  const payload = docs.map(doc => legacyNedbToSupabase({
    ...doc,
    createdAt: doc.createdAt || now,
    updatedAt: doc.updatedAt || now
  }));
  const { data, error } = await supabase.from(table).insert(payload).select(SUPABASE_DOC_SELECT);
  if (error) throw error;
  invalidateCache();
  return (data || []).map(supabaseToFrontend);
}

async function updateDoc(table, id, patch) {
  const current = await findOneById(table, id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from(table)
    .update(frontendToSupabase(next))
    .eq('id', id)
    .select(SUPABASE_DOC_SELECT)
    .single();
  if (error) throw error;
  invalidateCache();
  return supabaseToFrontend(data);
}

async function updateWhere(table, predicate, patchFactory) {
  const docs = await selectDocs(table);
  const targets = docs.filter(predicate);
  return Promise.all(targets.map(doc => {
    const patch = typeof patchFactory === 'function' ? patchFactory(doc) : patchFactory;
    return updateDoc(table, doc._id, patch);
  }));
}

async function deleteDoc(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  invalidateCache();
}

async function deleteWhere(table, predicate) {
  const docs = await selectDocs(table);
  const targets = docs.filter(predicate);
  return Promise.all(targets.map(doc => deleteDoc(table, doc._id)));
}

function sortDocs(docs, sortSpec) {
  const entries = Object.entries(sortSpec || {});
  return [...docs].sort((a, b) => {
    for (const [key, direction] of entries) {
      const aValue = a[key] ?? '';
      const bValue = b[key] ?? '';
      const result = String(aValue).localeCompare(String(bValue), 'pt-BR', { numeric: true });
      if (result !== 0) return direction < 0 ? -result : result;
    }
    return 0;
  });
}

function matchesQuery(doc, query) {
  return Object.entries(query || {}).every(([key, value]) => doc[key] === value);
}

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `operacao_${Date.now()}`;
}

async function ensureDefaultOperacoes() {
  const total = await countDocs(TABLES.operacoes);
  if (total > 0) return;
  await insertDocs(TABLES.operacoes, DEFAULT_OPERACOES);
}

async function ensureDefaultConfigOptions() {
  const existing = await selectDocs(TABLES.configOptions);

  const docs = [];
  if (existing.length === 0) {
    for (const field of CONFIG_FIELDS) {
      DEFAULT_CONFIG_OPTIONS[field].forEach((value, index) => {
        docs.push({
          field,
          value,
          normalized: normalizeUniqueValue(value),
          ordem: index + 1
        });
      });
    }
    docs.push(seedMarkerDoc(CONFIG_SEED_MARKERS.defaults));
    docs.push(seedMarkerDoc(CONFIG_SEED_MARKERS.kanguru));
  } else {
    const markers = new Set(
      existing
        .filter(doc => doc.field === CONFIG_SEED_MARKER_FIELD)
        .map(doc => doc.normalized || normalizeUniqueValue(doc.value))
    );

    if (!markers.has(CONFIG_SEED_MARKERS.kanguru)) {
      const hasKanguruOptions = existing.some(doc => doc.field === 'kanguru');
      if (!hasKanguruOptions) {
        DEFAULT_CONFIG_OPTIONS.kanguru.forEach((value, index) => {
          docs.push({
            field: 'kanguru',
            value,
            normalized: normalizeUniqueValue(value),
            ordem: index + 1
          });
        });
      }
      docs.push(seedMarkerDoc(CONFIG_SEED_MARKERS.kanguru));
    }

    if (!markers.has(CONFIG_SEED_MARKERS.statusSemCadastro)) {
      const hasStatusSemCadastro = existing.some(doc => doc.field === 'status' && ['S/ CADASTRO', 'SEM CADASTRO'].includes(normalizeUniqueValue(doc.value)));
      if (!hasStatusSemCadastro) {
        const statusCount = existing.filter(doc => doc.field === 'status').length;
        docs.push({
          field: 'status',
          value: 'SEM CADASTRO',
          normalized: normalizeUniqueValue('SEM CADASTRO'),
          ordem: statusCount + 1
        });
      }
      docs.push(seedMarkerDoc(CONFIG_SEED_MARKERS.statusSemCadastro));
    }

    if (!markers.has(CONFIG_SEED_MARKERS.statusSemCadastroDtCriada)) {
      const hasStatusSemCadastroDtCriada = existing.some(doc => doc.field === 'status' && normalizeUniqueValue(doc.value) === 'SEM CADASTRO / DT CRIADA');
      if (!hasStatusSemCadastroDtCriada) {
        const statusCount = existing.filter(doc => doc.field === 'status').length + docs.filter(doc => doc.field === 'status').length;
        docs.push({
          field: 'status',
          value: 'SEM CADASTRO / DT CRIADA',
          normalized: normalizeUniqueValue('SEM CADASTRO / DT CRIADA'),
          ordem: statusCount + 1
        });
      }
      docs.push(seedMarkerDoc(CONFIG_SEED_MARKERS.statusSemCadastroDtCriada));
    }
  }

  if (docs.length) await insertDocs(TABLES.configOptions, docs);
}

function seedMarkerDoc(marker) {
  return {
    field: CONFIG_SEED_MARKER_FIELD,
    value: marker,
    normalized: marker,
    ordem: 0
  };
}

function normalizeTipo(value) {
  const raw = normalizeUniqueValue(value);
  if (raw === 'AGREG' || raw === 'AGREGADO') return 'AGREGADO';
  if (raw === 'CARRE' || raw === 'CARRETEIRO') return 'CARRETEIRO';
  if (raw === 'DEDICADO') return 'DEDICADO';
  if (raw === 'FROTA') return 'FROTA';
  return raw;
}

function applyFrotaContratoRule(data = {}) {
  if (normalizeTipo(data.tipo) === 'FROTA') {
    data.contrato = 'N\u00c3O FAZ CONTRATO';
  }
  return data;
}

function hasLoadedHistory(doc = {}) {
  return doc.secao === 'arcos' ||
    hasDocumentosCompletos(doc) ||
    ['dt', 'cte', 'manifesto', 'contrato', 'nota'].some(field => String(doc[field] || '').trim());
}

async function latestViagemByPlaca(placa) {
  const normalizedPlaca = normalizeUniqueValue(placa);
  if (!normalizedPlaca || normalizedPlaca.length < 5) return null;
  const docs = await selectDocsByJson(TABLES.viagens, { placa: normalizedPlaca }, { limit: DEFAULT_RANGE_LIMIT });
  return docs
    .filter(doc => normalizeUniqueValue(doc.placa) === normalizedPlaca)
    .filter(doc => isViagemBloqueada(doc) || normalizeUniqueValue(doc.status) === 'CONCLUIDO')
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}

async function latestAnyViagemByPlaca(placa, ignoreId = '') {
  const normalizedPlaca = normalizeUniqueValue(placa);
  if (!normalizedPlaca || normalizedPlaca.length < 5) return null;
  const docs = await selectDocsByJson(TABLES.viagens, { placa: normalizedPlaca }, { limit: DEFAULT_RANGE_LIMIT });
  return docs
    .filter(doc => doc._id !== ignoreId)
    .filter(doc => normalizeUniqueValue(doc.placa) === normalizedPlaca)
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}

function normalizeWaitlistItem(data = {}) {
  return {
    placa: normalizeUniqueValue(data.placa),
    nome: normalizeUniqueValue(data.nome),
    tipo: normalizeTipo(data.tipo),
    origem: normalizeUniqueValue(data.origem),
    data: String(data.data || '').trim(),
    hora: String(data.hora || '').trim(),
    obs: String(data.obs || '').trim(),
    ordem: Number(data.ordem) || 0
  };
}

function waitlistDocToFrontend(doc = {}) {
  return {
    _id: doc._id,
    id: doc._id,
    placa: doc.placa || '',
    nome: doc.nome || '',
    tipo: doc.tipo || '',
    origem: doc.origem || '',
    data: doc.data || '',
    hora: doc.hora || '',
    obs: doc.obs || '',
    ordem: Number(doc.ordem) || 0,
    createdAt: doc.createdAt || '',
    updatedAt: doc.updatedAt || ''
  };
}

async function waitlistDocs() {
  return cachedValue('waitlist', async () => {
  const docs = (await selectDocs(TABLES.configOptions)).filter(doc => doc.field === WAITLIST_FIELD);
  return docs.map(waitlistDocToFrontend).sort(compareWaitlistItems);
  });
}

function compareWaitlistItems(a, b) {
  const position = waitlistPositionValue(a).localeCompare(waitlistPositionValue(b), 'pt-BR', { numeric: true });
  if (position) return position;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function waitlistPositionValue(item = {}) {
  const date = String(item.data || '').trim() || '9999-12-31';
  const time = String(item.hora || '').trim() || '99:99';
  return `${date} ${time}`;
}

async function configOptionsGrouped() {
  return cachedValue('config-options-grouped', async () => {
  await ensureDefaultConfigOptions();
  const docs = sortDocs(await selectDocs(TABLES.configOptions), { field: 1, ordem: 1, value: 1 });
  return CONFIG_FIELDS.reduce((acc, field) => {
    acc[field] = docs.filter(doc => doc.field === field).map(doc => doc.value);
    return acc;
  }, {});
  });
}

async function configColorsGrouped() {
  return cachedValue('config-colors-grouped', async () => {
  await ensureDefaultConfigOptions();
  const docs = await selectDocs(TABLES.configOptions);
  return CONFIG_COLOR_FIELDS.reduce((acc, field) => {
    acc[field] = {};
    docs
      .filter(doc => doc.field === field && isHexColor(doc.color))
      .forEach(doc => {
        acc[field][normalizeUniqueValue(doc.value)] = doc.color;
      });
    return acc;
  }, {});
  });
}

function normalizeFreteConsultas(saved = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_FRETE_CONSULTAS).map(([key, table]) => {
    const savedTable = saved?.[key];
    const rows = Array.isArray(savedTable?.rows) && savedTable.rows.length
      ? savedTable.rows.map(row => FRETE_COLUMNS.map((_, index) => String(row?.[index] || '').trim()))
      : table.rows.map(row => [...row]);
    return [key, {
      title: table.title,
      tone: table.tone,
      rows
    }];
  }));
}

async function freteConsultasConfig() {
  return cachedValue('frete-consultas', async () => {
  const doc = await findOne(TABLES.configOptions, item => item.field === FRETE_CONSULT_FIELD);
  return normalizeFreteConsultas(doc?.tables || doc?.freteConsultas || {});
  });
}

async function saveFreteConsultasConfig(tables) {
  const normalized = normalizeFreteConsultas(tables);
  const existing = await findOne(TABLES.configOptions, item => item.field === FRETE_CONSULT_FIELD);
  const payload = {
    field: FRETE_CONSULT_FIELD,
    value: 'Consulta frete',
    normalized: FRETE_CONSULT_FIELD,
    tables: normalized,
    ordem: existing?.ordem || 1
  };
  if (existing) return updateDoc(TABLES.configOptions, existing._id, payload);
  return insertDoc(TABLES.configOptions, payload);
}

function lembreteDocToFrontend(doc = {}) {
  const safeDoc = doc || {};
  return {
    data: '',
    texto: String(safeDoc.texto || '')
  };
}

async function lembreteGlobal() {
  return cachedValue('lembrete-global', async () => {
  const docs = (await selectDocs(TABLES.configOptions))
    .filter(item => item.field === LEMBRETE_FIELD)
    .sort((a, b) => {
      const aGlobal = a.normalized === LEMBRETE_FIELD ? 1 : 0;
      const bGlobal = b.normalized === LEMBRETE_FIELD ? 1 : 0;
      return bGlobal - aGlobal || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
  return lembreteDocToFrontend(docs[0]);
  });
}

async function saveLembrete(texto) {
  const normalizedText = String(texto || '').slice(0, 2000);
  const existing = await findOne(TABLES.configOptions, item => item.field === LEMBRETE_FIELD && item.normalized === LEMBRETE_FIELD);
  const payload = {
    field: LEMBRETE_FIELD,
    value: 'Lembrete',
    normalized: LEMBRETE_FIELD,
    data: '',
    texto: normalizedText,
    ordem: existing?.ordem || 1
  };
  const saved = existing
    ? await updateDoc(TABLES.configOptions, existing._id, payload)
    : await insertDoc(TABLES.configOptions, payload);
  return lembreteDocToFrontend(saved);
}

function normalizeOperationMessages(messages = {}) {
  return Object.entries(messages || {}).reduce((acc, [key, value]) => {
    const normalized = normalizeUniqueValue(key);
    if (normalized) acc[normalized] = String(value || '').slice(0, 4000);
    return acc;
  }, {});
}

async function operationMessagesConfig() {
  return cachedValue('operation-messages', async () => {
    const doc = await findOne(TABLES.configOptions, item => item.field === OPERATION_MESSAGES_FIELD);
    return { messages: normalizeOperationMessages(doc?.messages || {}) };
  });
}

async function saveOperationMessagesConfig(messages = {}) {
  const normalized = normalizeOperationMessages(messages);
  const existing = await findOne(TABLES.configOptions, item => item.field === OPERATION_MESSAGES_FIELD);
  const payload = {
    field: OPERATION_MESSAGES_FIELD,
    value: 'Mensagens por operacao',
    normalized: OPERATION_MESSAGES_FIELD,
    messages: normalized,
    ordem: existing?.ordem || 1
  };
  const saved = existing
    ? await updateDoc(TABLES.configOptions, existing._id, payload)
    : await insertDoc(TABLES.configOptions, payload);
  return { messages: normalizeOperationMessages(saved.messages || {}) };
}

function normalizeWorkCode(value) {
  return normalizeUniqueValue(value).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeWorkType(data = {}, existing = {}) {
  const name = String(data.name ?? data.nome ?? existing.name ?? '').trim();
  const code = normalizeWorkCode(data.code || data.codigo || existing.code || name);
  return {
    field: WORK_TYPE_FIELD,
    name,
    code,
    description: String(data.description ?? data.descricao ?? existing.description ?? '').trim(),
    color: isHexColor(data.color) ? data.color : (isHexColor(existing.color) ? existing.color : '#2563eb'),
    icon: String(data.icon ?? existing.icon ?? 'play').trim() || 'play',
    displayOrder: Number(data.displayOrder ?? data.ordem ?? existing.displayOrder ?? 999) || 999,
    isActive: data.isActive !== undefined ? data.isActive !== false : existing.isActive !== false,
    requiresNote: Boolean(data.requiresNote ?? existing.requiresNote ?? false),
    allowPause: data.allowPause !== undefined ? data.allowPause !== false : existing.allowPause !== false,
    allowMultipleUsers: Boolean(data.allowMultipleUsers ?? existing.allowMultipleUsers ?? false),
    suggestedMaxDurationMinutes: Number(data.suggestedMaxDurationMinutes ?? existing.suggestedMaxDurationMinutes ?? 0) || 0,
    branchId: String(data.branchId ?? existing.branchId ?? '').trim(),
    createdBy: existing.createdBy || String(data.createdBy || '').trim()
  };
}

function publicWorkType(type = {}, usageCount = 0) {
  return {
    _id: type._id,
    id: type._id,
    name: type.name || '',
    code: type.code || '',
    description: type.description || '',
    color: isHexColor(type.color) ? type.color : '#2563eb',
    icon: type.icon || 'play',
    displayOrder: Number(type.displayOrder || 999),
    isActive: type.isActive !== false,
    requiresNote: Boolean(type.requiresNote),
    allowPause: type.allowPause !== false,
    allowMultipleUsers: Boolean(type.allowMultipleUsers),
    suggestedMaxDurationMinutes: Number(type.suggestedMaxDurationMinutes || 0),
    branchId: type.branchId || '',
    usageCount,
    createdAt: type.createdAt || '',
    updatedAt: type.updatedAt || ''
  };
}

async function workTypeDocs({ includeDeleted = false } = {}) {
  const docs = await selectDocsByJson(TABLES.configOptions, { field: WORK_TYPE_FIELD });
  return docs
    .filter(doc => includeDeleted || !doc.deletedAt)
    .sort((a, b) => Number(a.displayOrder || 999) - Number(b.displayOrder || 999) || String(a.name || '').localeCompare(String(b.name || '')));
}

async function ensureDefaultWorkTypes() {
  const existing = await workTypeDocs({ includeDeleted: true });
  if (existing.length) return existing.filter(doc => !doc.deletedAt);
  const created = await insertDocs(TABLES.configOptions, DEFAULT_WORK_TYPES.map(item => ({
    ...normalizeWorkType(item),
    createdBy: 'sistema'
  })));
  return created;
}

async function workTypesWithUsage() {
  await ensureDefaultWorkTypes();
  const [types, sessions] = await Promise.all([
    workTypeDocs({ includeDeleted: false }),
    selectDocsByJson(TABLES.configOptions, { field: WORK_SESSION_FIELD })
  ]);
  const counts = sessions.reduce((acc, session) => {
    if (session.workTypeId) acc[session.workTypeId] = (acc[session.workTypeId] || 0) + 1;
    return acc;
  }, {});
  return types.map(type => publicWorkType(type, counts[type._id] || 0));
}

function normalizeWorkSession(data = {}, profile = {}, existing = {}) {
  const now = new Date().toISOString();
  return {
    field: WORK_SESSION_FIELD,
    tripId: String(data.tripId ?? existing.tripId ?? '').trim(),
    workTypeId: String(data.workTypeId ?? existing.workTypeId ?? '').trim(),
    userId: String(data.userId ?? existing.userId ?? profile.user_id ?? profile.id ?? '').trim(),
    userNameSnapshot: String(data.userNameSnapshot ?? existing.userNameSnapshot ?? profileDisplayName(profile)).trim(),
    userAvatarSnapshot: normalizeAvatarUrl(data.userAvatarSnapshot ?? existing.userAvatarSnapshot ?? profile.avatarUrl ?? ''),
    status: ['active', 'paused', 'completed', 'cancelled'].includes(String(data.status || existing.status || '').trim())
      ? String(data.status || existing.status).trim()
      : 'active',
    startedAt: String(data.startedAt ?? existing.startedAt ?? now),
    pausedAt: data.pausedAt !== undefined ? data.pausedAt : (existing.pausedAt || ''),
    resumedAt: data.resumedAt !== undefined ? data.resumedAt : (existing.resumedAt || ''),
    completedAt: data.completedAt !== undefined ? data.completedAt : (existing.completedAt || ''),
    cancelledAt: data.cancelledAt !== undefined ? data.cancelledAt : (existing.cancelledAt || ''),
    note: String(data.note ?? existing.note ?? '').trim(),
    transferredFromUserId: String(data.transferredFromUserId ?? existing.transferredFromUserId ?? '').trim()
  };
}

function isWorkSessionOpen(session = {}) {
  return ['active', 'paused'].includes(String(session.status || ''));
}

async function activeWorkSessions() {
  const docs = await selectDocsByJson(TABLES.configOptions, { field: WORK_SESSION_FIELD });
  return docs.filter(session => !session.deletedAt && isWorkSessionOpen(session));
}

async function publicWorkSessions() {
  const [sessions, types] = await Promise.all([activeWorkSessions(), workTypeDocs({ includeDeleted: true })]);
  const typeMap = Object.fromEntries(types.map(type => [type._id, publicWorkType(type)]));
  return sessions.map(session => ({
    ...session,
    workType: typeMap[session.workTypeId] || null
  }));
}

async function openSessionForTrip(tripId) {
  const sessions = await activeWorkSessions();
  return sessions.find(session => session.tripId === tripId) || null;
}

function canManageWorkSession(session = {}, profile = {}, authUser = {}) {
  const ownerId = String(session.userId || '');
  return profile?.role === 'admin' || ownerId === String(profile?.user_id || '') || ownerId === String(authUser?.id || '') || ownerId === String(profile?.id || '');
}

async function createWorkEvent(session, eventType, profile, metadata = {}) {
  return insertDoc(TABLES.configOptions, {
    field: WORK_EVENT_FIELD,
    workSessionId: session._id,
    tripId: session.tripId,
    workTypeId: session.workTypeId,
    eventType,
    userId: String(profile?.user_id || profile?.id || ''),
    userName: profileDisplayName(profile),
    previousValue: metadata.previousValue || '',
    newValue: metadata.newValue || '',
    metadata,
    createdAt: new Date().toISOString()
  });
}

function normalizeUniqueValue(value) {
  return String(value || '').trim().toUpperCase();
}

function isDocumentNumberField(field) {
  return DOCUMENT_NUMBER_FIELDS.includes(field);
}

function formatDocumentNumber(value, field = '') {
  const raw = String(value || '').trim();
  if (field === 'contrato' && raw === '-') return '-';
  if (field === 'contrato' && normalizeUniqueValue(raw) === 'NAO FAZ CONTRATO') return 'N\u00c3O FAZ CONTRATO';
  if (field === 'contrato' && normalizeUniqueValue(raw) === 'N\u00c3O FAZ CONTRATO') return 'N\u00c3O FAZ CONTRATO';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const num = typeof value === 'number' ? value : parseNumber(value);
  if (!num) return raw;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const num = parseNumber(value);
  if (!num) return raw;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateBR(date) {
  const value = String(date || '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatDateSheetName(date) {
  return formatDateBR(date).replace(/\//g, '-');
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

function isIsoDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function localDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function maxViagemDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + VIAGEM_MAX_FUTURE_DAYS);
  return localDateStr(date);
}

function viagemDateValidationError(value) {
  const data = String(value || '').trim();
  if (!data) return '';
  if (!isIsoDate(data)) return 'Informe uma data vÃ¡lida para a viagem.';
  const maxDate = maxViagemDate();
  if (data > maxDate) {
    return `NÃ£o Ã© permitido lanÃ§ar viagem com data superior a ${VIAGEM_MAX_FUTURE_DAYS} dias do dia atual. Data mÃ¡xima: ${formatDateBR(maxDate)}.`;
  }
  return '';
}

function datesBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function exportCellValue(viagem, key) {
  if (key === 'tipo') return normalizeTipo(viagem[key]);
  if (key === 'peso') return formatPeso(viagem[key]);
  if (key === 'vlr_pedagio') return formatMoney(viagem[key]);
  if (key === 'descarga') return normalizeDescargaDateTime(viagem[key]);
  if (['agendamento', 'horas'].includes(key)) return normalizeHours(viagem[key]);
  if (key === 'data') return formatDateBR(viagem[key]);
  if (key === 'usuario' && isViagemBloqueada(viagem)) return '';
  return String(viagem[key] ?? '').trim();
}

function argb(hex) {
  return `FF${String(hex || '#ffffff').replace('#', '').toUpperCase()}`;
}

function exportFillFor(columnKey, value) {
  const normalized = normalizeUniqueValue(value);
  if (columnKey === 'status' && normalized === 'CONCLUIDO') return '049135';
  if (columnKey === 'status' && normalized === 'SEM CADASTRO') return 'c93434';
  if (columnKey === 'status' && normalized === 'SEM CADASTRO / DT CRIADA') return 'be185d';
  if (columnKey === 'status' && normalized === 'CONFERIR MOTORISTA') return 'b91c1c';
  if (columnKey === 'status' && normalized === 'CRIAR DT / PROGRAMAR') return '6d28d9';
  if (columnKey === 'status' && normalized === 'CRIAR DT') return '7c3aed';
  if (columnKey === 'status' && normalized === 'PROGRAMAR') return 'aba110';
  if (columnKey === 'status' && normalized === 'AGUARDANDO CARREGAMENTO') return '0b2f5f';
  if (columnKey === 'status' && normalized === 'EMITIR CTE') return '2563eb';
  if (columnKey === 'status' && normalized === 'ADIANTAMENTO / DESCARGA') return 'c2410c';
  if (columnKey === 'status' && normalized === 'FALTA ADIANTAMENTO') return 'c2410c';
  if (columnKey === 'status' && normalized === 'ADIANTAMENTO') return '115927';
  if (columnKey === 'status' && normalized === 'AGENDAR DESCARGA') return '39107b';
  if (columnKey === 'status' && normalized) return '2563eb';
  if (columnKey === 'origem' && normalized) return '16803f';
  if (columnKey === 'destino' && normalized) return '8ab4f8';
  if (columnKey === 'tipo' && normalized === 'FROTA') return '16803f';
  if (columnKey === 'tipo' && normalized === 'CARRETEIRO') return 'c93434';
  if (columnKey === 'tipo' && normalized) return 'b7791f';
  if (columnKey === 'pamcard' && normalized) return 'f4b400';
  return '';
}

function styleExportWorksheet(worksheet) {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: VIAGENS_EXPORT_COLUMNS.length }
  };

  worksheet.columns = VIAGENS_EXPORT_COLUMNS.map(column => ({
    key: column.key,
    width: column.width,
    style: {
      font: { name: 'Arial', size: 9, bold: true },
      alignment: { vertical: 'middle', horizontal: 'center' }
    }
  }));

  const header = worksheet.getRow(1);
  header.height = 22;
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    cell.font = { name: 'Arial', size: 9, bold: true, italic: true, underline: true, color: { argb: 'FF000000' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.height = 18;
    row.eachCell((cell, colNumber) => {
      const column = VIAGENS_EXPORT_COLUMNS[colNumber - 1];
      const fill = exportFillFor(column.key, cell.value);
      cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: fill && ['status', 'origem'].includes(column.key) ? 'FFFFFFFF' : 'FF000000' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fill) } };
    });
  });
}

function buildViagensWorkbook(viagens, dates) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FrotaSys';
  workbook.created = new Date();

  const grouped = viagens.reduce((acc, viagem) => {
    const data = String(viagem.data || '').trim();
    if (!acc[data]) acc[data] = [];
    acc[data].push(viagem);
    return acc;
  }, {});

  dates.forEach(date => {
    const worksheet = workbook.addWorksheet(formatDateSheetName(date), {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    worksheet.addRow(VIAGENS_EXPORT_COLUMNS.map(column => column.header));

    const rows = sortDocs(grouped[date] || [], { createdAt: 1, placa: 1, nome: 1 });
    rows.forEach(viagem => {
      worksheet.addRow(VIAGENS_EXPORT_COLUMNS.map(column => exportCellValue(viagem, column.key)));
    });

    styleExportWorksheet(worksheet);
  });

  return workbook;
}

function historyTextValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value) || (typeof value === 'object' && value)) return JSON.stringify(value);
  return String(value).trim();
}

function appendViagemHistory(current, entries) {
  const existing = Array.isArray(current?.historico) ? current.historico : [];
  return [...existing, ...entries].slice(-VIAGEM_HISTORY_LIMIT);
}

function buildViagemHistoryEntries(current, patch, profile, action = 'ALTERACAO') {
  const ignored = new Set(['_id', 'id', 'createdAt', 'updatedAt', 'historico']);
  const fields = Object.keys(patch || {}).filter(field => !ignored.has(field));
  const changed = fields.filter(field => historyTextValue(current?.[field]) !== historyTextValue(patch[field]));
  if (!changed.length && action !== 'CRIACAO') return [];

  const when = new Date().toISOString();
  const user = profileDisplayName(profile);
  return (action === 'CRIACAO' ? [{ field: '', before: '', after: '' }] : changed.map(field => ({
    field,
    before: historyTextValue(current?.[field]),
    after: historyTextValue(patch[field])
  }))).map((item, index) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${index}`,
    tipo: action,
    campo: item.field,
    label: item.field ? (VIAGEM_FIELD_LABELS[item.field] || item.field.toUpperCase()) : 'CADASTRO',
    anterior: item.before,
    atual: item.after,
    usuario: user,
    email: String(profile?.email || ''),
    role: String(profile?.role || ''),
    dataHora: when
  }));
}

function normalizeViagemDocumentNumbers(data = {}) {
  DOCUMENT_NUMBER_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      data[field] = formatDocumentNumber(data[field], field);
    }
  });
  return data;
}

function comparableUniqueValue(field, value) {
  return isDocumentNumberField(field) ? String(value || '').replace(/\D/g, '') : normalizeUniqueValue(value);
}

function comparableSearchValue(field, value) {
  if (isDocumentNumberField(field) || field === 'dt') return String(value || '').replace(/\D/g, '') || normalizeUniqueValue(value);
  return normalizeUniqueValue(value);
}

function isHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || ''));
}

async function findDuplicateViagemFields(data, currentId = null) {
  const filledFields = UNIQUE_VIAGEM_FIELDS
    .map(field => ({ ...field, value: comparableUniqueValue(field.key, data[field.key]) }))
    .filter(field => field.value);

  if (filledFields.length === 0) return null;

  for (const field of filledFields) {
    const docs = await selectDocsByJson(TABLES.viagens, { [field.key]: data[field.key] }, { limit: 2 });
    const duplicate = docs.find(doc => {
      if (currentId && doc._id === currentId) return false;
      return comparableUniqueValue(field.key, doc[field.key]) === field.value;
    });

    if (duplicate) return field;
  }

  return null;
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

function publicProfile(profile = {}) {
  return {
    id: profile.id,
    user_id: profile.user_id,
    nome: profile.nome || '',
    displayName: profile.displayName || profile.nome || '',
    avatarUrl: profile.avatarUrl || '',
    email: profile.email || '',
    role: profile.role || 'visualizador',
    ativo: profile.ativo !== false,
    created_at: profile.created_at
  };
}

function profileDisplayName(profile = {}) {
  return String(profile.displayName || profile.nome || profile.email || 'UsuÃ¡rio').trim();
}

function normalizeAvatarUrl(value = '') {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.length > 800000) return '';
  return /^(https?:|data:image\/)/i.test(url) || url.startsWith(`${AVATAR_PUBLIC_PREFIX}/`) ? url : '';
}

function safeAvatarUserId(userId = '') {
  return String(userId || 'user').replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) || 'user';
}

async function persistAvatarUrl(userId, value = '') {
  const url = normalizeAvatarUrl(value);
  if (!url || !url.startsWith('data:image/')) return url;

  const match = url.match(/^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return '';

  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > 250 * 1024) return '';

  await fs.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
  const filename = `${safeAvatarUserId(userId)}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(AVATAR_UPLOAD_DIR, filename), buffer);
  return `${AVATAR_PUBLIC_PREFIX}/${filename}`;
}

async function userProfileSettings(userId) {
  const key = String(userId || '').trim();
  if (!key) return {};
  const doc = await findOne(TABLES.configOptions, item =>
    item.field === USER_PROFILE_SETTINGS_FIELD && item.userId === key
  );
  let avatarUrl = normalizeAvatarUrl(doc?.avatarUrl || '');
  if (doc?._id && avatarUrl.startsWith('data:image/')) {
    avatarUrl = await persistAvatarUrl(key, avatarUrl);
    if (avatarUrl) await updateDoc(TABLES.configOptions, doc._id, { avatarUrl });
  }
  return {
    displayName: String(doc?.displayName || '').trim(),
    avatarUrl
  };
}

async function saveUserProfileSettings(userId, data = {}) {
  const key = String(userId || '').trim();
  const existing = await findOne(TABLES.configOptions, item =>
    item.field === USER_PROFILE_SETTINGS_FIELD && item.userId === key
  );
  const avatarUrl = await persistAvatarUrl(key, data.avatarUrl || '');
  const payload = {
    field: USER_PROFILE_SETTINGS_FIELD,
    userId: key,
    displayName: String(data.displayName || '').trim().slice(0, 80),
    avatarUrl
  };
  const saved = existing
    ? await updateDoc(TABLES.configOptions, existing._id, payload)
    : await insertDoc(TABLES.configOptions, payload);
  return {
    displayName: saved.displayName || '',
    avatarUrl: saved.avatarUrl || ''
  };
}

function normalizeContratoConclusao(value) {
  const normalized = normalizeUniqueValue(value);
  return CONTRATO_CONCLUSAO_OPTIONS.includes(normalized) ? normalized : '';
}

function isFrota(data = {}) {
  return normalizeTipo(data.tipo) === 'FROTA';
}

function hasAdiantamentoLiberado(data = {}) {
  return hasAdvanceOk(data);
}

function isViagemBloqueada(data = {}) {
  return calculateTripStatus(data) === 'CONCLUIDO';
}

function hasDocumentosCompletos(data = {}) {
  return ['cte', 'manifesto', 'contrato', 'nota'].every(field => String(data[field] || '').trim() !== '');
}

function statusOperacional(data = {}) {
  return calculateTripStatus(data);
}

async function profileForUser(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,user_id,nome,email,role,ativo,created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const settings = await userProfileSettings(data.user_id);
  return publicProfile({ ...data, ...settings });
}

function requireAuth(req, res, next) {
  Promise.resolve().then(async () => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Login necessÃ¡rio.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'SessÃ£o invÃ¡lida.' });

    const profile = await profileForUser(data.user.id);
    if (!profile || !profile.ativo) return res.status(403).json({ error: 'UsuÃ¡rio sem acesso ativo.' });

    req.authUser = data.user;
    req.userProfile = profile;
    next();
  }).catch(next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userProfile?.role)) {
      return res.status(403).json({ error: 'PermissÃ£o insuficiente.' });
    }
    next();
  };
}

const requireAdmin = requireRole('admin');
const requireViagemEditor = requireRole('admin', 'operador');

// Configure SUPABASE_URL and SUPABASE_ANON_KEY in Render environment variables.
// Never expose SUPABASE_SERVICE_ROLE to frontend code.
app.get('/api/auth/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

app.use('/api', requireAuth);

app.get('/api/auth/me', (req, res) => {
  res.json({
    user: {
      id: req.authUser.id,
      email: req.authUser.email
    },
    profile: req.userProfile
  });
});

app.put('/api/auth/profile', async (req, res) => {
  try {
    const saved = await saveUserProfileSettings(req.authUser.id, {
      displayName: req.body?.displayName,
      avatarUrl: req.body?.avatarUrl
    });
    const profile = {
      ...req.userProfile,
      ...saved
    };
    await updateWhere(TABLES.configOptions, item =>
      item.field === WORK_SESSION_FIELD &&
      item.userId === req.authUser.id &&
      isWorkSessionOpen(item),
      {
        userNameSnapshot: profileDisplayName(profile),
        userAvatarSnapshot: profile.avatarUrl || ''
      }
    );
    const sessions = await publicWorkSessions();
    broadcast({ type: 'perfil_atualizado', payload: { userId: req.authUser.id, profile } });
    broadcast({ type: 'work_sessions_atualizadas', payload: sessions });
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/app-state', async (req, res) => {
  try {
    const data = String(req.query.data || '').trim();
    const viagemFilters = data ? { data } : {};
    const metaFilters = data ? { data } : {};

    const viagens = sortDocs(
      await selectDocsByJson(TABLES.viagens, viagemFilters, data ? {} : { limit: DEFAULT_RANGE_LIMIT }),
      { createdAt: 1 }
    );
    const metas = await selectDocsByJson(TABLES.metas, metaFilters);
    const operacoes = await cachedValue('operacoes-list', async () => {
      await ensureDefaultOperacoes();
      return sortDocs(await selectDocs(TABLES.operacoes), { ordem: 1, origem: 1 });
    });
    const configOptions = await configOptionsGrouped();
    const configColors = await configColorsGrouped();
    const listaEspera = await waitlistDocs();
    const lembrete = await lembreteGlobal();
    const operationMessages = await operationMessagesConfig();
    const workTypes = await workTypesWithUsage();
    const workSessions = await publicWorkSessions();
    const freteConsultas = await freteConsultasConfig();

    res.json({ viagens, metas, operacoes, configOptions, configColors, listaEspera, lembrete, operationMessages, workTypes, workSessions, freteConsultas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ LEMBRETES API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/lembretes', async (req, res) => {
  try {
    res.json(await lembreteGlobal());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/lembretes', async (req, res) => {
  try {
    const body = req.body || {};
    const saved = await saveLembrete(body.texto);
    broadcast({ type: 'lembrete_atualizado', payload: saved });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/operation-messages', requireAdmin, async (req, res) => {
  try {
    const saved = await saveOperationMessagesConfig(req.body?.messages || {});
    invalidateCache('operation-messages');
    broadcast({ type: 'operation_messages_atualizadas', payload: saved });
    res.json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/work-types', async (req, res) => {
  try {
    res.json(await workTypesWithUsage());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/work-types', requireAdmin, async (req, res) => {
  try {
    const payload = normalizeWorkType(req.body || {});
    if (!payload.name) return res.status(400).json({ error: 'Informe o nome do tipo de trabalho.' });
    payload.createdBy = profileDisplayName(req.userProfile);
    const inserted = await insertDoc(TABLES.configOptions, payload);
    const workTypes = await workTypesWithUsage();
    broadcast({ type: 'work_types_atualizados', payload: workTypes });
    res.json(publicWorkType(inserted));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/work-types/:id', requireAdmin, async (req, res) => {
  try {
    const current = await findOneById(TABLES.configOptions, req.params.id);
    if (!current || current.field !== WORK_TYPE_FIELD) return res.status(404).json({ error: 'Tipo de trabalho nÃ£o encontrado.' });
    const patch = normalizeWorkType(req.body || {}, current);
    const updated = await updateDoc(TABLES.configOptions, req.params.id, patch);
    const workTypes = await workTypesWithUsage();
    broadcast({ type: 'work_types_atualizados', payload: workTypes });
    res.json(publicWorkType(updated));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/work-types/:id', requireAdmin, async (req, res) => {
  try {
    const current = await findOneById(TABLES.configOptions, req.params.id);
    if (!current || current.field !== WORK_TYPE_FIELD) return res.status(404).json({ error: 'Tipo de trabalho nÃ£o encontrado.' });
    await updateDoc(TABLES.configOptions, req.params.id, { deletedAt: new Date().toISOString(), isActive: false });
    const workTypes = await workTypesWithUsage();
    broadcast({ type: 'work_types_atualizados', payload: workTypes });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/work-sessions', async (req, res) => {
  try {
    res.json(await publicWorkSessions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/:id/work-history', async (req, res) => {
  try {
    const sessions = await selectDocsByJson(TABLES.configOptions, { field: WORK_SESSION_FIELD, tripId: req.params.id });
    const events = await selectDocsByJson(TABLES.configOptions, { field: WORK_EVENT_FIELD, tripId: req.params.id });
    res.json({ sessions, events });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/viagens/:id/work-sessions', requireViagemEditor, async (req, res) => {
  try {
    const viagem = await findOneById(TABLES.viagens, req.params.id);
    if (!viagem) return res.status(404).json({ error: 'Viagem nÃ£o encontrada.' });
    const workType = await findOneById(TABLES.configOptions, req.body?.workTypeId);
    if (!workType || workType.field !== WORK_TYPE_FIELD || workType.deletedAt || workType.isActive === false) {
      return res.status(400).json({ error: 'Selecione um tipo de trabalho ativo.' });
    }
    const inserted = await insertDoc(TABLES.configOptions, normalizeWorkSession({
      tripId: req.params.id,
      workTypeId: workType._id,
      status: 'active'
    }, req.userProfile));
    await createWorkEvent(inserted, 'started', req.userProfile, { newValue: workType.name });
    const sessions = await publicWorkSessions();
    broadcast({ type: 'work_sessions_atualizadas', payload: sessions });
    res.json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/work-sessions/:id', requireViagemEditor, async (req, res) => {
  try {
    const current = await findOneById(TABLES.configOptions, req.params.id);
    if (!current || current.field !== WORK_SESSION_FIELD) return res.status(404).json({ error: 'Trabalho nÃ£o encontrado.' });
    if (!canManageWorkSession(current, req.userProfile, req.authUser)) {
      return res.status(403).json({ error: 'VocÃª nÃ£o pode alterar o trabalho de outro usuÃ¡rio.' });
    }

    const action = String(req.body?.action || '').trim();
    const now = new Date().toISOString();
    const patch = {};
    let eventType = action;
    if (action === 'pause') {
      patch.status = 'paused';
      patch.pausedAt = now;
    } else if (action === 'resume') {
      patch.status = 'active';
      patch.resumedAt = now;
    } else if (action === 'complete') {
      patch.status = 'completed';
      patch.completedAt = now;
    } else if (action === 'cancel') {
      patch.status = 'cancelled';
      patch.cancelledAt = now;
    } else if (action === 'change-type') {
      const workType = await findOneById(TABLES.configOptions, req.body?.workTypeId);
      if (!workType || workType.field !== WORK_TYPE_FIELD || workType.deletedAt || workType.isActive === false) {
        return res.status(400).json({ error: 'Selecione um tipo de trabalho ativo.' });
      }
      patch.workTypeId = workType._id;
      patch.status = 'active';
      patch.resumedAt = now;
      eventType = 'changed_type';
    } else {
      return res.status(400).json({ error: 'AÃ§Ã£o invÃ¡lida.' });
    }

    const updated = await updateDoc(TABLES.configOptions, req.params.id, patch);
    await createWorkEvent(updated, eventType, req.userProfile, { previousValue: current.status, newValue: updated.status });
    const sessions = await publicWorkSessions();
    broadcast({ type: 'work_sessions_atualizadas', payload: sessions });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ LISTA DE ESPERA API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/lista-espera', async (req, res) => {
  try {
    res.json(await waitlistDocs());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lista-espera', requireViagemEditor, async (req, res) => {
  try {
    const item = normalizeWaitlistItem(req.body);
    if (!item.data) item.data = new Date().toISOString().slice(0, 10);
    if (!item.placa && !item.nome) {
      return res.status(400).json({ error: 'Informe ao menos PLACA ou NOME.' });
    }

    const ordem = item.ordem || (await countDocs(TABLES.configOptions, doc => doc.field === WAITLIST_FIELD)) + 1;
    const inserted = await insertDoc(TABLES.configOptions, {
      field: WAITLIST_FIELD,
      value: `${item.placa} ${item.nome}`.trim(),
      normalized: normalizeUniqueValue(`${item.placa} ${item.nome}`),
      ...item,
      ordem
    });
    const payload = waitlistDocToFrontend(inserted);
    broadcast({ type: 'lista_espera_atualizada', payload: await waitlistDocs() });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/lista-espera/:id', requireViagemEditor, async (req, res) => {
  try {
    const current = await findOneById(TABLES.configOptions, req.params.id);
    if (!current || current.field !== WAITLIST_FIELD) return res.status(404).json({ error: 'Item nÃ£o encontrado.' });

    const item = normalizeWaitlistItem({ ...current, ...req.body });
    if (!item.placa && !item.nome) {
      return res.status(400).json({ error: 'Informe ao menos PLACA ou NOME.' });
    }

    const updated = await updateDoc(TABLES.configOptions, req.params.id, {
      value: `${item.placa} ${item.nome}`.trim(),
      normalized: normalizeUniqueValue(`${item.placa} ${item.nome}`),
      ...item
    });
    const payload = waitlistDocToFrontend(updated);
    broadcast({ type: 'lista_espera_atualizada', payload: await waitlistDocs() });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/lista-espera/:id', requireViagemEditor, async (req, res) => {
  try {
    const current = await findOneById(TABLES.configOptions, req.params.id);
    if (!current || current.field !== WAITLIST_FIELD) return res.status(404).json({ error: 'Item nÃ£o encontrado.' });
    await deleteDoc(TABLES.configOptions, req.params.id);
    broadcast({ type: 'lista_espera_atualizada', payload: await waitlistDocs() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/lista-espera/:id/gerar-viagem', requireViagemEditor, async (req, res) => {
  try {
    const item = await findOneById(TABLES.configOptions, req.params.id);
    if (!item || item.field !== WAITLIST_FIELD) return res.status(404).json({ error: 'Item nÃ£o encontrado.' });

    const viagemData = String(req.body?.data || '').trim() || localDateStr();
    const dateError = viagemDateValidationError(viagemData);
    if (dateError) return res.status(400).json({ error: dateError });

    const { data: removedRows, error: removeError } = await supabase
      .from(TABLES.configOptions)
      .delete()
      .eq('id', req.params.id)
      .select(SUPABASE_DOC_SELECT);
    if (removeError) throw removeError;
    if (!removedRows?.length) return res.status(409).json({ error: 'Este item jÃ¡ foi gerado ou removido.' });
    invalidateCache();

    const viagem = await insertDoc(TABLES.viagens, {
      placa: item.placa || '',
      nome: item.nome || '',
      tipo: normalizeTipo(item.tipo),
      origem: item.origem || '',
      obs: item.obs || '',
      secao: 'agenciando',
      data: viagemData
    });

    const lista = await waitlistDocs();
    broadcast({ type: 'viagem_criada', payload: viagem });
    broadcast({ type: 'lista_espera_atualizada', payload: lista });
    res.json({ viagem, lista });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id,user_id,nome,email,role,ativo,created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).map(publicProfile));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    const nome = String(req.body.nome || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'operador').trim();
    const ativo = req.body.ativo !== false;

    if (!nome || !email || !password) {
      return res.status(400).json({ error: 'Informe nome, e-mail e senha.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    if (!['admin', 'operador', 'visualizador'].includes(role)) {
      return res.status(400).json({ error: 'Perfil invÃ¡lido.' });
    }

    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome }
    });
    if (created.error) throw created.error;

    const userId = created.data.user.id;
    const { data, error } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId, nome, email, role, ativo })
      .select('id,user_id,nome,email,role,ativo,created_at')
      .single();

    if (error) {
      await supabase.auth.admin.deleteUser(userId);
      throw error;
    }

    res.status(201).json(publicProfile(data));
  } catch (e) {
    const message = String(e.message || '');
    if (message.toLowerCase().includes('already')) {
      return res.status(409).json({ error: 'JÃ¡ existe um usuÃ¡rio com este e-mail.' });
    }
    res.status(500).json({ error: message || 'NÃ£o foi possÃ­vel criar usuÃ¡rio.' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const patch = {};
    if (req.body.role !== undefined) {
      if (!['admin', 'operador', 'visualizador'].includes(req.body.role)) {
        return res.status(400).json({ error: 'Perfil invÃ¡lido.' });
      }
      patch.role = req.body.role;
    }
    if (req.body.ativo !== undefined) patch.ativo = Boolean(req.body.ativo);
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar.' });

    const { data, error } = await supabase
      .from('user_profiles')
      .update(patch)
      .eq('id', req.params.id)
      .select('id,user_id,nome,email,role,ativo,created_at')
      .single();
    if (error) throw error;
    res.json(publicProfile(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

wss.on('connection', (ws) => {
  console.log('Cliente conectado');
  ws.on('close', () => console.log('Cliente desconectado'));
});

// â”€â”€â”€ VIAGENS API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/viagens', async (req, res) => {
  try {
    const { data, secao } = req.query;
    const query = {};
    if (data) query.data = data;
    if (secao) query.secao = secao;
    const hasFilters = Object.keys(query).length > 0;
    const docs = sortDocs(
      await selectDocsByJson(TABLES.viagens, query, hasFilters ? {} : { limit: DEFAULT_RANGE_LIMIT }),
      { createdAt: 1 }
    );
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.get('/api/viagens/search', async (req, res) => {
  try {
    const term = comparableSearchValue('cte', req.query.q);
    const dtTerm = comparableSearchValue('dt', req.query.dt);
    const notaTerm = comparableSearchValue('nota', req.query.nota);
    const contratoTerm = comparableSearchValue('contrato', req.query.contrato);
    const cteTerm = comparableSearchValue('cte', req.query.cte);
    const nomeTerm = comparableSearchValue('nome', req.query.nome);
    const placaTerm = comparableSearchValue('placa', req.query.placa);
    const dataInicio = String(req.query.dataInicio || '').trim();
    const dataFim = String(req.query.dataFim || '').trim();
    if (!term && !dtTerm && !notaTerm && !contratoTerm && !cteTerm && !nomeTerm && !placaTerm && !dataInicio && !dataFim) return res.json([]);
    if ((dataInicio && !isIsoDate(dataInicio)) || (dataFim && !isIsoDate(dataFim))) {
      return res.status(400).json({ error: 'Informe datas vÃ¡lidas para a busca.' });
    }
    if (dataInicio && dataFim) {
      if (dataInicio > dataFim) return res.status(400).json({ error: 'A data inicial nÃ£o pode ser maior que a data final.' });
      if (datesBetween(dataInicio, dataFim).length > 366) {
        return res.status(400).json({ error: 'Selecione um perÃ­odo de atÃ© 366 dias.' });
      }
    }

    const query = {};
    const options = {};
    if (dataInicio) options.gte = { data: dataInicio };
    if (dataFim) options.lte = { data: dataFim };
    if (nomeTerm) options.ilike = { ...(options.ilike || {}), nome: req.query.nome };
    if (placaTerm) options.ilike = { ...(options.ilike || {}), placa: req.query.placa };

    if (!dataInicio && !dataFim && !nomeTerm && !placaTerm) {
      if (dtTerm && req.query.dt) options.ilike = { ...(options.ilike || {}), dt: req.query.dt };
      if (notaTerm && req.query.nota) query.nota = formatDocumentNumber(req.query.nota, 'nota');
      if (contratoTerm && req.query.contrato) query.contrato = formatDocumentNumber(req.query.contrato, 'contrato');
      if (cteTerm && req.query.cte) query.cte = formatDocumentNumber(req.query.cte, 'cte');
    }

    let docs;
    if (!dataInicio && !dataFim && term && !dtTerm && !notaTerm && !contratoTerm && !cteTerm && !nomeTerm && !placaTerm) {
      const notaValue = formatDocumentNumber(term, 'nota');
      const cteValue = formatDocumentNumber(term, 'cte');
      const [notaDocs, cteDocs] = await Promise.all([
        selectDocsByJson(TABLES.viagens, { nota: notaValue }, { limit: VIAGENS_SEARCH_LIMIT }),
        selectDocsByJson(TABLES.viagens, { cte: cteValue }, { limit: VIAGENS_SEARCH_LIMIT })
      ]);
      docs = [...new Map([...notaDocs, ...cteDocs].map(doc => [doc._id, doc])).values()];
    } else {
      const hasBoundedRange = Boolean(dataInicio && dataFim);
      docs = await selectDocsByJson(TABLES.viagens, query, {
        ...options,
        limit: hasBoundedRange ? undefined : VIAGENS_SEARCH_LIMIT
      });
    }

    const matches = docs
      .filter(doc => {
        const data = String(doc.data || '').trim();
        if (dataInicio && data < dataInicio) return false;
        if (dataFim && data > dataFim) return false;

        const dt = comparableSearchValue('dt', doc.dt);
        const nota = comparableSearchValue('nota', doc.nota);
        const contrato = comparableSearchValue('contrato', doc.contrato);
        const cte = comparableSearchValue('cte', doc.cte);
        const nome = comparableSearchValue('nome', doc.nome);
        const placa = comparableSearchValue('placa', doc.placa);
        if (dtTerm && dt !== dtTerm) return false;
        if (notaTerm && nota !== notaTerm) return false;
        if (contratoTerm && contrato !== contratoTerm) return false;
        if (cteTerm && cte !== cteTerm) return false;
        if (nomeTerm && !nome.includes(nomeTerm)) return false;
        if (placaTerm && !placa.includes(placaTerm)) return false;
        if (term) return nota === term || cte === term;
        return true;
      })
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/placa/:placa/latest', requireViagemEditor, async (req, res) => {
  try {
    const placa = normalizeUniqueValue(req.params.placa);
    if (!placa || placa.length < 5) return res.json(null);
    const latest = await latestViagemByPlaca(placa);
    if (!latest) return res.json(null);
    res.json({
      placa: latest.placa || placa,
      nome: latest.nome || '',
      tipo: normalizeTipo(latest.tipo),
      carroceria: latest.carroceria || '',
      telefone: latest.telefone || '',
      cadastroOk: hasLoadedHistory(latest)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/:id/whatsapp-extra-message', async (req, res) => {
  try {
    const viagem = await findOneById(TABLES.viagens, req.params.id);
    if (!viagem) return res.status(404).json({ error: 'Viagem n\u00e3o encontrada' });

    const tipo = normalizeTipo(viagem.tipo);
    if (tipo === 'FROTA' || tipo === 'AGREGADO') {
      return res.json({ message: '', reason: 'tipo_ignorado' });
    }

    const operationKey = normalizeUniqueValue(viagem.origem);
    const operationMessages = await operationMessagesConfig();
    const message = String(operationMessages.messages?.[operationKey] || '').trim();
    if (!message) return res.json({ message: '', reason: 'sem_mensagem' });

    const latest = await latestAnyViagemByPlaca(viagem.placa, viagem._id);
    if (!latest) return res.json({ message, reason: 'sem_registro' });

    const latestDate = String(latest.data || latest.createdAt || '').slice(0, 10);
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const cutoff = threeMonthsAgo.toISOString().slice(0, 10);
    const isOlderThanThreeMonths = latestDate && latestDate < cutoff;

    return res.json({
      message: isOlderThanThreeMonths ? message : '',
      reason: isOlderThanThreeMonths ? 'registro_antigo' : 'registro_recente',
      latestDate
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/export', requireAdmin, async (req, res) => {
  try {
    const inicio = String(req.query.inicio || req.query.start || '').trim();
    const fim = String(req.query.fim || req.query.end || '').trim();

    if (!isIsoDate(inicio) || !isIsoDate(fim)) {
      return res.status(400).json({ error: 'Informe data inicial e data final vÃ¡lidas.' });
    }
    if (inicio > fim) {
      return res.status(400).json({ error: 'A data inicial nÃ£o pode ser maior que a data final.' });
    }

    const dates = datesBetween(inicio, fim);
    if (dates.length > 366) {
      return res.status(400).json({ error: 'Selecione um perÃ­odo de atÃ© 366 dias.' });
    }

    const docs = await selectDocsByJson(TABLES.viagens, {}, {
      gte: { data: inicio },
      lte: { data: fim }
    });
    const workbook = buildViagensWorkbook(docs, dates);
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `viagens_${formatDateSheetName(inicio)}_${formatDateSheetName(fim)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/:id', async (req, res) => {
  try {
    const viagem = await findOneById(TABLES.viagens, req.params.id);
    if (!viagem) return res.status(404).json({ error: 'Viagem nÃ£o encontrada' });
    res.json(viagem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/viagens', requireViagemEditor, async (req, res) => {
  try {
    const payload = { ...req.body };
    normalizeViagemDocumentNumbers(payload);
    applyFrotaContratoRule(payload);
    const previousByPlaca = await latestViagemByPlaca(payload.placa);
    const nomeAlteradoDoHistorico = previousByPlaca &&
      normalizeUniqueValue(previousByPlaca.nome) &&
      normalizeUniqueValue(previousByPlaca.nome) !== normalizeUniqueValue(payload.nome);
    if (nomeAlteradoDoHistorico) {
      payload.status = 'CONFERIR MOTORISTA';
      payload.trocaMotoristaConcluida = false;
    }
    const dateError = viagemDateValidationError(payload.data);
    if (dateError) return res.status(400).json({ error: dateError });
    if (!normalizeUniqueValue(payload.produto)) {
      return res.status(400).json({ error: 'Selecione PRODUTO para salvar a viagem.', field: 'produto' });
    }
    delete payload.usuario;
    const rawCadastroStatus = normalizeUniqueValue(payload.status);
    const cadastroStatus = ['SEM CADASTRO', 'CONFERIR CADASTRO'].includes(rawCadastroStatus) ? 'SEM CADASTRO' : '';
    payload.status = cadastroStatus;
    if (payload.marcadoAmarelo !== undefined) payload.marcadoAmarelo = Boolean(payload.marcadoAmarelo);
    if (payload.agendamentoVerde !== undefined) payload.agendamentoVerde = Boolean(payload.agendamentoVerde);
    if (payload.programado !== undefined) payload.programado = Boolean(payload.programado);
    if (payload.adiantamentoOk !== undefined) payload.adiantamentoOk = Boolean(payload.adiantamentoOk);
    if (payload.conclusaoContrato !== undefined) {
      payload.conclusaoContrato = normalizeContratoConclusao(payload.conclusaoContrato);
    }
    if (nomeAlteradoDoHistorico) payload.status = 'CONFERIR MOTORISTA';
    payload.status = calculateTripStatus(payload);
    if (payload.status) payload.usuario = profileDisplayName(req.userProfile);
    if (payload.status === 'CONCLUIDO') {
      payload.usuario = '';
      payload.marcadoAmarelo = false;
    }

    const duplicate = await findDuplicateViagemFields(payload);
    if (duplicate) {
      return res.status(409).json({
        error: `${duplicate.label} jÃ¡ cadastrado: ${duplicate.value}`,
        field: duplicate.key
      });
    }

    payload.historico = buildViagemHistoryEntries({}, payload, req.userProfile, 'CRIACAO');
    const inserted = await insertDoc(TABLES.viagens, payload);
    broadcast({ type: 'viagem_criada', payload: inserted });
    res.json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/viagens/:id', requireViagemEditor, async (req, res) => {
  try {
    const current = await findOneById(TABLES.viagens, req.params.id);
    if (!current) return res.status(404).json({ error: 'Viagem nÃ£o encontrada' });

    const patch = { ...req.body };
    delete patch.__manualStatus;
    delete patch.status;
    normalizeViagemDocumentNumbers(patch);
    applyFrotaContratoRule(patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'data')) {
      const dateError = viagemDateValidationError(patch.data);
      if (dateError) return res.status(400).json({ error: dateError });
    }
    delete patch.usuario;
    delete patch.historico;
    if (patch.marcadoAmarelo !== undefined) patch.marcadoAmarelo = Boolean(patch.marcadoAmarelo);
    if (patch.agendamentoVerde !== undefined) patch.agendamentoVerde = Boolean(patch.agendamentoVerde);
    if (patch.trocaMotoristaConcluida !== undefined) patch.trocaMotoristaConcluida = Boolean(patch.trocaMotoristaConcluida);
    if (patch.programado !== undefined) patch.programado = Boolean(patch.programado);
    if (patch.adiantamentoOk !== undefined) patch.adiantamentoOk = Boolean(patch.adiantamentoOk);
    if (patch.descarga !== undefined) patch.descarga = normalizeDescargaDateTime(patch.descarga);
    if (isViagemBloqueada(current)) {
      const isAdminUser = req.userProfile?.role === 'admin';
      const isAdminUndoContrato = req.userProfile?.role === 'admin' &&
        Object.prototype.hasOwnProperty.call(patch, 'conclusaoContrato') &&
        !normalizeContratoConclusao(patch.conclusaoContrato);
      if (isAdminUndoContrato) {
        patch.conclusaoContrato = '';
        patch.status = '';
        patch.usuario = '';
      }
      if (!isAdminUser) {
        const invalidFields = Object.keys(patch).filter(field => !LOCKED_EDITABLE_FIELDS.includes(field));
        const blockedFields = isAdminUndoContrato
          ? invalidFields.filter(field => !['conclusaoContrato', 'status', 'usuario'].includes(field))
          : invalidFields;
        if (blockedFields.length) {
          return res.status(403).json({ error: 'Viagem concluÃ­da. Somente DESCARGA e marcaÃ§Ã£o amarela podem ser editadas.' });
        }
        const historyEntries = buildViagemHistoryEntries(current, patch, req.userProfile);
        if (historyEntries.length) patch.historico = appendViagemHistory(current, historyEntries);
        const lockedNextData = applyFrotaContratoRule({ ...current, ...patch });
        patch.status = calculateTripStatus(lockedNextData);
        const updated = await updateDoc(TABLES.viagens, req.params.id, patch);
        broadcast({ type: 'viagem_atualizada', payload: updated });
        return res.json(updated);
      }
    }

    if (patch.conclusaoContrato !== undefined) {
      patch.conclusaoContrato = normalizeContratoConclusao(patch.conclusaoContrato);
    }

    const nextData = applyFrotaContratoRule({ ...current, ...patch });
    if (normalizeTipo(nextData.tipo) === 'FROTA') patch.contrato = nextData.contrato;
    patch.status = calculateTripStatus(nextData);
    nextData.status = patch.status;
    if (patch.status === 'CONCLUIDO') {
      patch.usuario = '';
      if (!isViagemBloqueada(current)) {
        patch.marcadoAmarelo = false;
        nextData.marcadoAmarelo = false;
      }
      nextData.usuario = '';
    } else if (normalizeUniqueValue(current.status) !== normalizeUniqueValue(patch.status)) {
      patch.usuario = profileDisplayName(req.userProfile);
      nextData.usuario = patch.usuario;
    }

    const duplicate = await findDuplicateViagemFields(nextData, req.params.id);
    if (duplicate) {
      return res.status(409).json({
        error: `${duplicate.label} jÃ¡ cadastrado: ${duplicate.value}`,
        field: duplicate.key
      });
    }

    const historyEntries = buildViagemHistoryEntries(current, patch, req.userProfile);
    if (historyEntries.length) patch.historico = appendViagemHistory(current, historyEntries);
    const updated = await updateDoc(TABLES.viagens, req.params.id, patch);
    broadcast({ type: 'viagem_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/viagens/:id', async (req, res) => {
  try {
    const current = await findOneById(TABLES.viagens, req.params.id);
    if (!current) return res.status(404).json({ error: 'Viagem nÃ£o encontrada' });
    if (isViagemBloqueada(current) && req.userProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Viagem concluÃ­da. Somente administrador pode excluir.' });
    }
    await deleteDoc(TABLES.viagens, req.params.id);
    broadcast({ type: 'viagem_removida', payload: { _id: req.params.id, id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ METAS API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/metas', async (req, res) => {
  try {
    const { data, dataInicio, dataFim } = req.query;
    const query = data ? { data } : {};
    const options = {};
    if (!data && dataInicio) options.gte = { data: dataInicio };
    if (!data && dataFim) options.lte = { data: dataFim };
    const docs = await selectDocsByJson(TABLES.metas, query, options);
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metas', requireAdmin, async (req, res) => {
  try {
    const { data, destino, valor, tipo, produto } = req.body;
    const existingDocs = await selectDocsByJson(TABLES.metas, { data, destino, tipo });
    const productKey = String(produto || '').trim().toUpperCase();
    const existing = existingDocs.find(doc => String(doc.produto || '').trim().toUpperCase() === productKey);
    let result;
    if (existing) {
      result = await updateDoc(TABLES.metas, existing._id, { valor, produto: produto || undefined });
    } else {
      const payload = { data, destino, valor, tipo };
      if (produto) payload.produto = produto;
      result = await insertDoc(TABLES.metas, payload);
    }
    broadcast({ type: 'meta_atualizada', payload: result });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ OPERACOES API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/operacoes', async (req, res) => {
  try {
    await ensureDefaultOperacoes();
    const docs = sortDocs(await selectDocs(TABLES.operacoes), { ordem: 1, origem: 1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/operacoes', requireAdmin, async (req, res) => {
  try {
    const docs = await selectDocs(TABLES.operacoes);
    const grouped = await configOptionsGrouped();
    const produtos = Array.isArray(req.body.produtos) ? req.body.produtos : grouped.produto;
    const doc = {
      origem: String(req.body.origem || 'NOVA OPERACAO').trim().toUpperCase(),
      metaTipo: req.body.metaTipo || slug(req.body.origem || 'NOVA OPERACAO'),
      produtos,
      resumoProdutos: Array.isArray(req.body.resumoProdutos) ? req.body.resumoProdutos : produtos,
      resumoDestinos: Array.isArray(req.body.resumoDestinos) ? req.body.resumoDestinos : grouped.destino,
      ordem: Number(req.body.ordem) || docs.length + 1
    };
    const inserted = await insertDoc(TABLES.operacoes, doc);
    broadcast({ type: 'operacao_criada', payload: inserted });
    res.json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/operacoes/:id', requireAdmin, async (req, res) => {
  try {
    const patch = {};
    if (req.body.origem !== undefined) patch.origem = String(req.body.origem || '').trim().toUpperCase();
    if (req.body.metaTipo !== undefined) patch.metaTipo = req.body.metaTipo || slug(req.body.origem);
    if (req.body.produtos !== undefined) patch.produtos = Array.isArray(req.body.produtos) ? req.body.produtos : [];
    if (req.body.resumoProdutos !== undefined) patch.resumoProdutos = Array.isArray(req.body.resumoProdutos) ? req.body.resumoProdutos : [];
    if (req.body.resumoDestinos !== undefined) patch.resumoDestinos = Array.isArray(req.body.resumoDestinos) ? req.body.resumoDestinos : [];
    if (req.body.ordem !== undefined) patch.ordem = Number(req.body.ordem) || 0;
    const updated = await updateDoc(TABLES.operacoes, req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'OperaÃ§Ã£o nÃ£o encontrada' });
    broadcast({ type: 'operacao_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/operacoes/:id', requireAdmin, async (req, res) => {
  try {
    const current = await findOneById(TABLES.operacoes, req.params.id);
    if (!current) return res.status(404).json({ error: 'OperaÃ§Ã£o nÃ£o encontrada' });

    await deleteDoc(TABLES.operacoes, req.params.id);

    const normalizedOrigem = normalizeUniqueValue(current.origem);
    const sameOriginOps = await selectDocs(TABLES.operacoes);
    if (!sameOriginOps.some(op => normalizeUniqueValue(op.origem) === normalizedOrigem)) {
      await deleteWhere(TABLES.configOptions, doc => doc.field === 'origem' && doc.normalized === normalizedOrigem);
      const remainingOrigins = sortDocs((await selectDocs(TABLES.configOptions)).filter(doc => doc.field === 'origem'), { ordem: 1, value: 1 });
      await Promise.all(remainingOrigins.map((doc, index) => updateDoc(TABLES.configOptions, doc._id, { ordem: index + 1 })));
    }

    const allOps = sortDocs(await selectDocs(TABLES.operacoes), { ordem: 1, origem: 1 });
    await Promise.all(allOps.map((op, index) => updateDoc(TABLES.operacoes, op._id, { ordem: index + 1 })));

    broadcast({ type: 'operacao_removida', payload: { _id: req.params.id, id: req.params.id } });
    broadcast({ type: 'config_atualizada', payload: await configOptionsGrouped() });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ CONSULTA FRETE API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/frete-consultas', async (req, res) => {
  try {
    res.json(await freteConsultasConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/frete-consultas', requireAdmin, async (req, res) => {
  try {
    const saved = await saveFreteConsultasConfig(req.body?.tables || req.body || {});
    const payload = saved.tables || await freteConsultasConfig();
    broadcast({ type: 'frete_consultas_atualizada', payload });
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ CONFIGURAÃ‡Ã•ES API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/config-options', async (req, res) => {
  try {
    res.json(await configOptionsGrouped());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/config-colors', async (req, res) => {
  try {
    res.json(await configColorsGrouped());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config-colors/:field/:value', requireAdmin, async (req, res) => {
  try {
    const field = req.params.field;
    if (!CONFIG_COLOR_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo sem cor configurÃ¡vel' });

    const color = String(req.body.color || '').trim();
    if (!isHexColor(color)) return res.status(400).json({ error: 'Cor invÃ¡lida' });

    const value = String(decodeURIComponent(req.params.value) || '').trim().toUpperCase();
    const normalized = normalizeUniqueValue(value);
    if (!normalized) return res.status(400).json({ error: 'Informe um valor' });

    const existing = await findOne(TABLES.configOptions, doc => doc.field === field && doc.normalized === normalized);
    if (existing) {
      await updateDoc(TABLES.configOptions, existing._id, { color });
    } else {
      const count = await countDocs(TABLES.configOptions, doc => doc.field === field);
      await insertDoc(TABLES.configOptions, { field, value, normalized, color, ordem: count + 1 });
    }

    const colors = await configColorsGrouped();
    broadcast({ type: 'config_cores_atualizadas', payload: colors });
    res.json(colors);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/config-options/:field', requireAdmin, async (req, res) => {
  try {
    const field = req.params.field;
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo invÃ¡lido' });

    const value = String(req.body.value || '').trim().toUpperCase();
    if (!value) return res.status(400).json({ error: 'Informe um valor' });

    const normalized = normalizeUniqueValue(value);
    const existing = await findOne(TABLES.configOptions, doc => doc.field === field && doc.normalized === normalized);
    if (!existing) {
      const count = await countDocs(TABLES.configOptions, doc => doc.field === field);
      await insertDoc(TABLES.configOptions, { field, value, normalized, ordem: count + 1 });
    }

    if (field === 'origem') {
      await ensureDefaultOperacoes();
      const op = await findOne(TABLES.operacoes, doc => doc.origem === value);
      if (!op) {
        const count = await countDocs(TABLES.operacoes);
        const grouped = await configOptionsGrouped();
        await insertDoc(TABLES.operacoes, {
          origem: value,
          metaTipo: slug(value),
          produtos: grouped.produto.length ? grouped.produto : DEFAULT_CONFIG_OPTIONS.produto,
          resumoProdutos: grouped.produto.length ? grouped.produto : DEFAULT_CONFIG_OPTIONS.produto,
          resumoDestinos: grouped.destino.length ? grouped.destino : DEFAULT_CONFIG_OPTIONS.destino,
          ordem: count + 1
        });
      }
    }

    const grouped = await configOptionsGrouped();
    broadcast({ type: 'config_atualizada', payload: grouped });
    if (field === 'origem') broadcast({ type: 'operacao_atualizada', payload: await findOne(TABLES.operacoes, doc => doc.origem === value) });
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/config-options/:field/reorder', requireAdmin, async (req, res) => {
  try {
    const field = req.params.field;
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo invÃ¡lido' });

    const requested = Array.isArray(req.body.values) ? req.body.values : [];
    const docs = (await selectDocs(TABLES.configOptions)).filter(doc => doc.field === field);
    const docsByNormalized = new Map(docs.map(doc => [doc.normalized, doc]));
    const orderedNormalized = [];

    requested.forEach(value => {
      const normalized = normalizeUniqueValue(value);
      if (docsByNormalized.has(normalized) && !orderedNormalized.includes(normalized)) {
        orderedNormalized.push(normalized);
      }
    });

    sortDocs(docs, { ordem: 1, value: 1 }).forEach(doc => {
      if (!orderedNormalized.includes(doc.normalized)) orderedNormalized.push(doc.normalized);
    });

    await Promise.all(orderedNormalized.map((normalized, index) =>
      updateWhere(TABLES.configOptions, doc => doc.field === field && doc.normalized === normalized, { ordem: index + 1 })
    ));

    if (field === 'origem') {
      await Promise.all(orderedNormalized.map((normalized, index) =>
        updateWhere(
          TABLES.operacoes,
          doc => normalizeUniqueValue(doc.origem) === normalized,
          { ordem: index + 1 }
        )
      ));
    }

    const grouped = await configOptionsGrouped();
    broadcast({ type: 'config_atualizada', payload: grouped });
    if (field === 'origem') broadcast({ type: 'operacao_atualizada', payload: null });
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/config-options/:field/:value', requireAdmin, async (req, res) => {
  try {
    const field = req.params.field;
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo invÃ¡lido' });

    const normalized = normalizeUniqueValue(decodeURIComponent(req.params.value));
    await deleteWhere(TABLES.configOptions, doc => doc.field === field && doc.normalized === normalized);
    const remaining = sortDocs((await selectDocs(TABLES.configOptions)).filter(doc => doc.field === field), { ordem: 1, value: 1 });
    await Promise.all(remaining.map((doc, index) => updateDoc(TABLES.configOptions, doc._id, { ordem: index + 1 })));

    if (field === 'origem') {
      await deleteWhere(TABLES.operacoes, op => normalizeUniqueValue(op.origem) === normalized);
    }

    const grouped = await configOptionsGrouped();
    broadcast({ type: 'config_atualizada', payload: grouped });
    res.json(grouped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ DATAS DISPONÃVEIS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/api/datas', async (req, res) => {
  try {
    const datas = [...new Set(await selectJsonTextValues(TABLES.viagens, 'data'))].sort();
    res.json(datas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  console.log(`\nServidor rodando!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).forEach(n => {
    console.log(`   Rede:    http://${n.address}:${PORT}`);
  });
  console.log(`\nOutros computadores na rede acessam pelo endereÃ§o "Rede" acima\n`);
});


