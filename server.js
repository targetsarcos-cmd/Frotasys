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

const CONFIG_FIELDS = ['tipo', 'produto', 'carroceria', 'pamcard', 'status', 'origem', 'destino'];
const DEFAULT_CONFIG_OPTIONS = {
  tipo: ['AGREGADO', 'CARRETEIRO', 'DEDICADO', 'FROTA'],
  produto: ['CPII-F', 'CPIII', 'CPV'],
  carroceria: ['GRADE BAIXA', 'BAU', 'SIDER', 'TANQUE', 'GRANELEIRO'],
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
  const total = await countDocs(TABLES.configOptions);
  if (total > 0) return;

  const docs = [];
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
  await insertDocs(TABLES.configOptions, docs);
}

async function configOptionsGrouped() {
  await ensureDefaultConfigOptions();
  const docs = sortDocs(await selectDocs(TABLES.configOptions), { field: 1, ordem: 1, value: 1 });
  return CONFIG_FIELDS.reduce((acc, field) => {
    acc[field] = docs.filter(doc => doc.field === field).map(doc => doc.value);
    return acc;
  }, {});
}

function normalizeUniqueValue(value) {
  return String(value || '').trim().toUpperCase();
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

app.post('/api/viagens', async (req, res) => {
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

app.put('/api/viagens/:id', async (req, res) => {
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

app.post('/api/metas', async (req, res) => {
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

app.post('/api/operacoes', async (req, res) => {
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

app.put('/api/operacoes/:id', async (req, res) => {
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

app.delete('/api/operacoes/:id', async (req, res) => {
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

app.post('/api/config-options/:field', async (req, res) => {
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

app.put('/api/config-options/:field/reorder', async (req, res) => {
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

app.delete('/api/config-options/:field/:value', async (req, res) => {
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
