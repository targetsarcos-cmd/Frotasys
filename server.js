const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Databases
const viagens = Datastore.create({ filename: path.join(dataDir, 'viagens.db'), autoload: true });
const metas = Datastore.create({ filename: path.join(dataDir, 'metas.db'), autoload: true });
const operacoes = Datastore.create({ filename: path.join(dataDir, 'operacoes.db'), autoload: true });
const configOptions = Datastore.create({ filename: path.join(dataDir, 'config-options.db'), autoload: true });
const operacoesInitFile = path.join(dataDir, 'operacoes.initialized');

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

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `operacao_${Date.now()}`;
}

async function ensureDefaultOperacoes() {
  const count = await operacoes.count({});
  if (count > 0) {
    if (!fs.existsSync(operacoesInitFile)) fs.writeFileSync(operacoesInitFile, new Date().toISOString());
    return;
  }
  if (!fs.existsSync(operacoesInitFile)) {
    await operacoes.insert(DEFAULT_OPERACOES);
    fs.writeFileSync(operacoesInitFile, new Date().toISOString());
  }
}

async function ensureDefaultConfigOptions() {
  const total = await configOptions.count({});
  if (total > 0) return;

  for (const field of CONFIG_FIELDS) {
    await Promise.all(DEFAULT_CONFIG_OPTIONS[field].map((value, index) => configOptions.insert({
      field,
      value,
      normalized: normalizeUniqueValue(value),
      ordem: index + 1,
      createdAt: new Date().toISOString()
    })));
  }
}

async function configOptionsGrouped() {
  await ensureDefaultConfigOptions();
  const docs = await configOptions.find({}).sort({ field: 1, ordem: 1, value: 1 });
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

  const docs = await viagens.find({});
  for (const field of filledFields) {
    const duplicate = docs.find(doc => {
      if (currentId && doc._id === currentId) return false;
      return normalizeUniqueValue(doc[field.key]) === field.value;
    });

    if (duplicate) return field;
  }

  return null;
}

// WebSocket broadcast
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
    const docs = await viagens.find(query).sort({ createdAt: 1 });
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

    const docs = await viagens.find({});
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

    const doc = { ...req.body, createdAt: new Date().toISOString() };
    const inserted = await viagens.insert(doc);
    broadcast({ type: 'viagem_criada', payload: inserted });
    res.json(inserted);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/viagens/:id', async (req, res) => {
  try {
    const current = await viagens.findOne({ _id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Viagem não encontrada' });

    const nextData = { ...current, ...req.body };
    const duplicate = await findDuplicateViagemFields(nextData, req.params.id);
    if (duplicate) {
      return res.status(409).json({
        error: `${duplicate.label} já cadastrado: ${duplicate.value}`,
        field: duplicate.key
      });
    }

    await viagens.update({ _id: req.params.id }, { $set: req.body });
    const updated = await viagens.findOne({ _id: req.params.id });
    broadcast({ type: 'viagem_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/viagens/:id', async (req, res) => {
  try {
    await viagens.remove({ _id: req.params.id });
    broadcast({ type: 'viagem_removida', payload: { _id: req.params.id } });
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
    const docs = await metas.find(query);
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metas', async (req, res) => {
  try {
    // Upsert by date, destination, operation type and optional product.
    const { data, destino, valor, tipo, produto } = req.body;
    const existingDocs = await metas.find({ data, destino, tipo });
    const productKey = String(produto || '').trim().toUpperCase();
    const existing = existingDocs.find(doc => String(doc.produto || '').trim().toUpperCase() === productKey);
    let result;
    if (existing) {
      await metas.update({ _id: existing._id }, { $set: { valor, produto: produto || undefined } });
      result = await metas.findOne({ _id: existing._id });
    } else {
      const payload = { data, destino, valor, tipo };
      if (produto) payload.produto = produto;
      result = await metas.insert(payload);
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
    const docs = await operacoes.find({}).sort({ ordem: 1, origem: 1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/operacoes', async (req, res) => {
  try {
    const docs = await operacoes.find({});
    const grouped = await configOptionsGrouped();
    const produtos = Array.isArray(req.body.produtos) ? req.body.produtos : grouped.produto;
    const doc = {
      origem: String(req.body.origem || 'NOVA OPERACAO').trim().toUpperCase(),
      metaTipo: req.body.metaTipo || slug(req.body.origem || 'NOVA OPERACAO'),
      produtos,
      resumoProdutos: Array.isArray(req.body.resumoProdutos) ? req.body.resumoProdutos : produtos,
      resumoDestinos: Array.isArray(req.body.resumoDestinos) ? req.body.resumoDestinos : grouped.destino,
      ordem: Number(req.body.ordem) || docs.length + 1,
      createdAt: new Date().toISOString()
    };
    const inserted = await operacoes.insert(doc);
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
    await operacoes.update({ _id: req.params.id }, { $set: patch });
    const updated = await operacoes.findOne({ _id: req.params.id });
    broadcast({ type: 'operacao_atualizada', payload: updated });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/operacoes/:id', async (req, res) => {
  try {
    const current = await operacoes.findOne({ _id: req.params.id });
    if (!current) return res.status(404).json({ error: 'Operação não encontrada' });

    await operacoes.remove({ _id: req.params.id });

    const normalizedOrigem = normalizeUniqueValue(current.origem);
    const sameOriginOps = await operacoes.find({});
    if (!sameOriginOps.some(op => normalizeUniqueValue(op.origem) === normalizedOrigem)) {
      await configOptions.remove({ field: 'origem', normalized: normalizedOrigem }, { multi: true });
      const remainingOrigins = await configOptions.find({ field: 'origem' }).sort({ ordem: 1, value: 1 });
      await Promise.all(remainingOrigins.map((doc, index) =>
        configOptions.update({ _id: doc._id }, { $set: { ordem: index + 1 } })
      ));
    }

    const allOps = await operacoes.find({}).sort({ ordem: 1, origem: 1 });
    await Promise.all(allOps.map((op, index) =>
      operacoes.update({ _id: op._id }, { $set: { ordem: index + 1 } })
    ));

    broadcast({ type: 'operacao_removida', payload: { _id: req.params.id } });
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
    const existing = await configOptions.findOne({ field, normalized });
    if (!existing) {
      const count = await configOptions.count({ field });
      await configOptions.insert({ field, value, normalized, ordem: count + 1, createdAt: new Date().toISOString() });
    }

    if (field === 'origem') {
      await ensureDefaultOperacoes();
      const op = await operacoes.findOne({ origem: value });
      if (!op) {
        const count = await operacoes.count({});
        const grouped = await configOptionsGrouped();
        await operacoes.insert({
          origem: value,
          metaTipo: slug(value),
          produtos: grouped.produto.length ? grouped.produto : DEFAULT_CONFIG_OPTIONS.produto,
          resumoProdutos: grouped.produto.length ? grouped.produto : DEFAULT_CONFIG_OPTIONS.produto,
          resumoDestinos: grouped.destino.length ? grouped.destino : DEFAULT_CONFIG_OPTIONS.destino,
          ordem: count + 1,
          createdAt: new Date().toISOString()
        });
      }
    }

    const grouped = await configOptionsGrouped();
    broadcast({ type: 'config_atualizada', payload: grouped });
    if (field === 'origem') broadcast({ type: 'operacao_atualizada', payload: await operacoes.findOne({ origem: value }) });
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
    const docs = await configOptions.find({ field });
    const docsByNormalized = new Map(docs.map(doc => [doc.normalized, doc]));
    const orderedNormalized = [];

    requested.forEach(value => {
      const normalized = normalizeUniqueValue(value);
      if (docsByNormalized.has(normalized) && !orderedNormalized.includes(normalized)) {
        orderedNormalized.push(normalized);
      }
    });

    docs
      .sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || String(a.value).localeCompare(String(b.value)))
      .forEach(doc => {
        if (!orderedNormalized.includes(doc.normalized)) orderedNormalized.push(doc.normalized);
      });

    await Promise.all(orderedNormalized.map((normalized, index) =>
      configOptions.update({ field, normalized }, { $set: { ordem: index + 1 } }, { multi: true })
    ));

    if (field === 'origem') {
      await Promise.all(orderedNormalized.map((normalized, index) =>
        operacoes.update({ origem: docsByNormalized.get(normalized)?.value }, { $set: { ordem: index + 1 } }, { multi: true })
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
    await configOptions.remove({ field, normalized }, { multi: true });
    const remaining = await configOptions.find({ field }).sort({ ordem: 1, value: 1 });
    await Promise.all(remaining.map((doc, index) =>
      configOptions.update({ _id: doc._id }, { $set: { ordem: index + 1 } })
    ));

    if (field === 'origem') {
      const ops = await operacoes.find({});
      await Promise.all(ops
        .filter(op => normalizeUniqueValue(op.origem) === normalized)
        .map(op => operacoes.remove({ _id: op._id })));
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
    const docs = await viagens.find({}, { data: 1 });
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
  console.log(`\n✅ Servidor rodando!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  Object.values(nets).flat().filter(n => n.family === 'IPv4' && !n.internal).forEach(n => {
    console.log(`   Rede:    http://${n.address}:${PORT}`);
  });
  console.log(`\n⚡ Outros computadores na rede acessam pelo endereço "Rede" acima\n`);
});
