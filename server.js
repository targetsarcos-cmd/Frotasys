const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabaseClient');

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
const DEFAULT_CONFIG_OPTIONS = {
  tipo: ['AGREGADO', 'CARRETEIRO', 'DEDICADO', 'FROTA'],
  produto: ['CPII-F', 'CPIII', 'CPV'],
  carroceria: ['GRADE BAIXA', 'BAU', 'SIDER', 'TANQUE', 'GRANELEIRO'],
  kanguru: ['TEM KANGURU', 'SEM KANGURU'],
  pamcard: ['PAMCARD OK', 'FECHAMENTO', 'SEM PAMCARD'],
  status: ['CRIANDO DT', 'CADASTRANDO', 'AGUARDANDO CARREGAMENTO', 'MANIFESTO', 'CONCLUIDO'],
  origem: DEFAULT_OPERACOES.map(op => op.origem),
  destino: ['OSASCO', 'AMERICANA', 'SJRP', 'SOROCABA']
};

const UNIQUE_VIAGEM_FIELDS = [
  { key: 'dt', label: 'DT' },
  { key: 'nota', label: 'NOTA' },
  { key: 'cte', label: 'CT-E' },
  { key: 'num_pedagio', label: 'Nº DO PEDÁGIO' }
];

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

function supabaseToFrontend(record) {
  const doc = { ...(record?.dados || {}) };
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
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return (data || []).map(supabaseToFrontend);
}

async function countDocs(table, predicate = () => true) {
  const docs = await selectDocs(table);
  return docs.filter(predicate).length;
}

async function findOneById(table, id) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
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
  const { data: inserted, error } = await supabase.from(table).insert(payload).select('*').single();
  if (error) throw error;
  return supabaseToFrontend(inserted);
}

async function insertDocs(table, docs) {
  const now = new Date().toISOString();
  const payload = docs.map(doc => legacyNedbToSupabase({
    ...doc,
    createdAt: doc.createdAt || now,
    updatedAt: doc.updatedAt || now
  }));
  const { data, error } = await supabase.from(table).insert(payload).select('*');
  if (error) throw error;
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
    .select('*')
    .single();
  if (error) throw error;
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
  const existingKeys = new Set(existing.map(doc => `${doc.field}:${doc.normalized || normalizeUniqueValue(doc.value)}`));

  const docs = [];
  for (const field of CONFIG_FIELDS) {
    const fieldCount = existing.filter(doc => doc.field === field).length;
    DEFAULT_CONFIG_OPTIONS[field].forEach((value, index) => {
      const normalized = normalizeUniqueValue(value);
      if (existingKeys.has(`${field}:${normalized}`)) return;
      docs.push({
        field,
        value,
        normalized,
        ordem: fieldCount + index + 1
      });
    });
  }
  if (docs.length) await insertDocs(TABLES.configOptions, docs);
}

async function configOptionsGrouped() {
  await ensureDefaultConfigOptions();
  const docs = sortDocs(await selectDocs(TABLES.configOptions), { field: 1, ordem: 1, value: 1 });
  return CONFIG_FIELDS.reduce((acc, field) => {
    acc[field] = docs.filter(doc => doc.field === field).map(doc => doc.value);
    return acc;
  }, {});
}

async function configColorsGrouped() {
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
}

function normalizeUniqueValue(value) {
  return String(value || '').trim().toUpperCase();
}

function isHexColor(color) {
  return /^#[0-9a-f]{6}$/i.test(String(color || ''));
}

async function findDuplicateViagemFields(data, currentId = null) {
  const filledFields = UNIQUE_VIAGEM_FIELDS
    .map(field => ({ ...field, value: normalizeUniqueValue(data[field.key]) }))
    .filter(field => field.value);

  if (filledFields.length === 0) return null;

  const docs = await selectDocs(TABLES.viagens);
  for (const field of filledFields) {
    const duplicate = docs.find(doc => {
      if (currentId && doc._id === currentId) return false;
      return normalizeUniqueValue(doc[field.key]) === field.value;
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
    email: profile.email || '',
    role: profile.role || 'visualizador',
    ativo: profile.ativo !== false,
    created_at: profile.created_at
  };
}

async function profileForUser(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id,user_id,nome,email,role,ativo,created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? publicProfile(data) : null;
}

function requireAuth(req, res, next) {
  Promise.resolve().then(async () => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Login necessário.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Sessão inválida.' });

    const profile = await profileForUser(data.user.id);
    if (!profile || !profile.ativo) return res.status(403).json({ error: 'Usuário sem acesso ativo.' });

    req.authUser = data.user;
    req.userProfile = profile;
    next();
  }).catch(next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userProfile?.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente.' });
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
      return res.status(400).json({ error: 'Perfil inválido.' });
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
      return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    }
    res.status(500).json({ error: message || 'Não foi possível criar usuário.' });
  }
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    const patch = {};
    if (req.body.role !== undefined) {
      if (!['admin', 'operador', 'visualizador'].includes(req.body.role)) {
        return res.status(400).json({ error: 'Perfil inválido.' });
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

// ─── VIAGENS API ───────────────────────────────────────────────────────────────

app.get('/api/viagens', async (req, res) => {
  try {
    const { data, secao } = req.query;
    const query = {};
    if (data) query.data = data;
    if (secao) query.secao = secao;
    const docs = sortDocs((await selectDocs(TABLES.viagens)).filter(doc => matchesQuery(doc, query)), { createdAt: 1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/viagens/search', async (req, res) => {
  try {
    const term = normalizeUniqueValue(req.query.q);
    const notaTerm = normalizeUniqueValue(req.query.nota);
    const cteTerm = normalizeUniqueValue(req.query.cte);
    if (!term && !notaTerm && !cteTerm) return res.json([]);

    const docs = await selectDocs(TABLES.viagens);
    const matches = docs
      .filter(doc => {
        const nota = normalizeUniqueValue(doc.nota);
        const cte = normalizeUniqueValue(doc.cte);
        if (notaTerm && !nota.includes(notaTerm)) return false;
        if (cteTerm && !cte.includes(cteTerm)) return false;
        if (term) return nota.includes(term) || cte.includes(term);
        return true;
      })
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/viagens', requireViagemEditor, async (req, res) => {
  try {
    const duplicate = await findDuplicateViagemFields(req.body);
    if (duplicate) {
      return res.status(409).json({
        error: `${duplicate.label} já cadastrado: ${duplicate.value}`,
        field: duplicate.key
      });
    }

    const inserted = await insertDoc(TABLES.viagens, req.body);
    broadcast({ type: 'viagem_criada', payload: inserted });
    res.json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/viagens/:id', requireViagemEditor, async (req, res) => {
  try {
    const current = await findOneById(TABLES.viagens, req.params.id);
    if (!current) return res.status(404).json({ error: 'Viagem não encontrada' });

    const nextData = { ...current, ...req.body };
    const duplicate = await findDuplicateViagemFields(nextData, req.params.id);
    if (duplicate) {
      return res.status(409).json({
        error: `${duplicate.label} já cadastrado: ${duplicate.value}`,
        field: duplicate.key
      });
    }

    const updated = await updateDoc(TABLES.viagens, req.params.id, req.body);
    broadcast({ type: 'viagem_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/viagens/:id', async (req, res) => {
  try {
    await deleteDoc(TABLES.viagens, req.params.id);
    broadcast({ type: 'viagem_removida', payload: { _id: req.params.id, id: req.params.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── METAS API ─────────────────────────────────────────────────────────────────

app.get('/api/metas', async (req, res) => {
  try {
    const { data } = req.query;
    const query = data ? { data } : {};
    const docs = (await selectDocs(TABLES.metas)).filter(doc => matchesQuery(doc, query));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metas', requireAdmin, async (req, res) => {
  try {
    const { data, destino, valor, tipo, produto } = req.body;
    const existingDocs = (await selectDocs(TABLES.metas)).filter(doc => doc.data === data && doc.destino === destino && doc.tipo === tipo);
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

// ─── OPERACOES API ────────────────────────────────────────────────────────────

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
    if (!updated) return res.status(404).json({ error: 'Operação não encontrada' });
    broadcast({ type: 'operacao_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/operacoes/:id', requireAdmin, async (req, res) => {
  try {
    const current = await findOneById(TABLES.operacoes, req.params.id);
    if (!current) return res.status(404).json({ error: 'Operação não encontrada' });

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

// ─── CONFIGURAÇÕES API ───────────────────────────────────────────────────────

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
    if (!CONFIG_COLOR_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo sem cor configurável' });

    const color = String(req.body.color || '').trim();
    if (!isHexColor(color)) return res.status(400).json({ error: 'Cor inválida' });

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
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo inválido' });

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
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo inválido' });

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
    if (!CONFIG_FIELDS.includes(field)) return res.status(400).json({ error: 'Campo inválido' });

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

// ─── DATAS DISPONÍVEIS ─────────────────────────────────────────────────────────

app.get('/api/datas', async (req, res) => {
  try {
    const docs = await selectDocs(TABLES.viagens);
    const datas = [...new Set(docs.map(d => d.data))].filter(Boolean).sort();
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
  console.log(`\nOutros computadores na rede acessam pelo endereço "Rede" acima\n`);
});
