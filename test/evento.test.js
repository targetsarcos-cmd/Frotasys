const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');
const noop = () => {};

function setup() {
  const routes = new Map();
  const app = { use: noop };
  for (const method of ['get', 'post', 'put', 'delete']) {
    app[method] = (url, ...handlers) => routes.set(method + ' ' + url, handlers);
  }
  const express = Object.assign(() => app, { static: noop, json: noop });
  const records = new Map();
  let revision = 0;
  const messages = [];
  const db = {
    from(table) {
      let rows = table === 'viagens' ? [...records.values()] : [];
      let patch;
      const value = (row, key) => key.startsWith('dados->>') ? row.dados[key.slice(8)] : row[key];
      return {
        select() { return this; },
        in(key, values) { rows = rows.filter(row => values.includes(value(row, key))); return this; },
        limit(n) { rows = rows.slice(0, n); return this; },
        eq(key, v) { rows = rows.filter(row => value(row, key) === v); return this; },
        ilike(key, v) {
          rows = rows.filter(row => String(value(row, key) || '').toLowerCase().includes(v.slice(1, -1).toLowerCase()));
          return this;
        },
        insert(payload) {
          const id = 'trip-' + records.size;
          const row = { id, ...payload, updated_at: String(++revision) };
          records.set(id, row);
          rows = [row];
          return this;
        },
        update(payload) { patch = payload; return this; },
        maybeSingle() {
          const row = rows[0];
          if (row && patch) Object.assign(row, patch, { updated_at: String(++revision) });
          return { data: row ? structuredClone(row) : null };
        },
        single() { return this.maybeSingle(); },
        then(resolve) { resolve({ data: structuredClone(rows) }); }
      };
    }
  };
  class SocketServer {
    clients = [{ readyState: 1, send: msg => messages.push(JSON.parse(msg)) }];
    on() {}
  }
  class Workbook {
    addWorksheet() {
      this.rows = [];
      return { addRow: cells => this.rows.push(cells), getRow: () => ({ eachCell: noop }), eachRow: noop };
    }
  }
  const dependencies = {
    express, http: { createServer: () => ({ listen: noop }) }, ws: { Server: SocketServer, OPEN: 1 },
    cors: noop, path, 'fs/promises': {}, zlib: {}, exceljs: { Workbook },
    './supabaseClient': db, './tripStatus': require('../tripStatus')
  };
  const server = vm.createContext({
    __dirname: root, process: { env: {} }, require(name) {
      assert.ok(Object.hasOwn(dependencies, name), name);
      return dependencies[name];
    }
  });
  vm.runInContext(source('server.js'), server);
  async function request(method, url, body = {}, role = 'operador', id, query = {}) {
    const req = { body, userProfile: { role, nome: 'Teste' }, params: { id }, query };
    const res = {
      code: 200, headers: {}, status(code) { this.code = code; return this; },
      set(k, v) { this.headers[k] = v; }, json(data) { this.data = data; }
    };
    for (const handler of routes.get(method + ' ' + url)) {
      await handler(req, res, noop);
      if (res.data !== undefined) break;
    }
    return res;
  }
  return { server, records, messages, request };
}

const collection = '/api/viagens';
const item = collection + '/:id';
const trip = { produto: 'CPV', data: '2026-01-05', secao: 'arcos', origem: 'ARCOS', pamcard: 'OK' };
const eventText = '<em>Aguardar & conferir</em>';

test('JSONB, pesquisa, historico, planilha e atualizacoes concorrentes', async () => {
  const { server, records, request } = setup();
  const created = await request('post', collection, { ...trip, frete: eventText });
  assert.equal(created.code, 200, created.data?.error);
  const id = created.data._id;
  assert.equal(records.get(id).dados.frete, eventText);
  assert.equal((await request('get', item, {}, 'visualizador', id)).data.frete, eventText);
  assert.equal((await request('put', item, { nome: 'MARIA' }, 'operador', id)).data.frete, eventText);
  const snapshot = await server.findOneById('viagens', id);
  const edit = await request('put', item, { frete: 'Conferir nota' }, 'admin', id);
  assert.equal(edit.data.historico.at(-1).label, 'EVENTO');
  assert.equal(edit.data.historico.at(-1).anterior, eventText);
  assert.equal(await server.updateDoc('viagens', id, { nome: 'ABC' }, snapshot), null);
  const found = await request('get', collection + '/search', {}, 'visualizador', null, { evento: 'nFeRiR' });
  assert.equal(found.data[0].frete, 'Conferir nota');
  const workbook = server.buildViagensWorkbook(found.data, [trip.data]);
  const column = workbook.rows[0].indexOf('EVENTO');
  assert.equal(workbook.rows[1][column], 'Conferir nota');
  assert.equal((await request('put', item, { frete: '' }, 'operador', id)).data.frete, '');
  assert.equal((await request('post', collection, trip)).data.frete, undefined);
});

test('CT-e avisa uma vez na resposta do autor e preserva o evento no WebSocket', async () => {
  const { messages, request } = setup();
  const created = await request('post', collection, { ...trip, cte: '1234', frete: eventText });
  const id = created.data._id;
  assert.equal(created.headers['X-Viagem-Evento'], '1');
  for (const [patch, expected] of [
    [{ nome: 'ANA' }, undefined], [{ cte: '1234' }, undefined], [{ cte: '5678' }, '1'],
    [{ cte: '' }, undefined], [{ cte: '9000' }, '1'], [{ frete: '' }, undefined], [{ cte: '5678' }, undefined]
  ]) {
    const priorCount = messages.length;
    const response = await request('put', item, patch, 'operador', id);
    assert.equal(response.code, 200, response.data?.error);
    assert.equal(response.headers['X-Viagem-Evento'], expected);
    assert.equal(messages.length, priorCount + 1);
    assert.equal(messages.at(-1).payload.frete, response.data.frete);
  }
});

test('autorizacao e bloqueio de viagens concluidas', async () => {
  const { records, request } = setup();
  assert.equal((await request('post', collection, trip, 'visualizador')).code, 403);
  const row = await request('post', collection, trip);
  const id = row.data._id;
  assert.equal((await request('put', item, { frete: 'X' }, 'visualizador', id)).code, 403);
  Object.assign(records.get(id).dados, { cte: '1', manifesto: '2', contrato: '3', adiantamentoOk: true, descarga: '2026-01-06T12:00', nome: 'ANA', placa: 'TST1234' });
  assert.equal((await request('put', item, { frete: 'X' }, 'operador', id)).code, 403);
  const admin = await request('put', item, { frete: 'X' }, 'admin', id);
  assert.equal(admin.code, 200, admin.data?.error);
  assert.equal(admin.data.status, 'CONCLUIDO');
});

function browser(fetch) {
  const elements = new Map();
  const document = {
    readyState: 'loading', addEventListener: noop, querySelectorAll: () => [],
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        value: '', defaultValue: '', dataset: {}, classList: { add: noop, remove: noop, toggle: noop },
        focus: noop, showModal() { this.open = true; this.shown = (this.shown || 0) + 1; }
      });
      return elements.get(id);
    }
  };
  const ui = vm.createContext({
    document, window: { addEventListener: noop }, console, fetch, URLSearchParams,
    FrotasysAuth: { getAccessToken: async () => null }
  });
  vm.runInContext(source('public/js/app.js'), ui);
  Object.assign(ui, { renderAll: noop, loadAll: noop, syncDynamicSelects: noop, updateUndoButton: noop });
  return { ui, state: vm.runInContext('state', ui), el: id => document.getElementById(id) };
}

test('tabela, painel, formulario, recarga e WebSocket com evento historico', async () => {
  const { records, messages, request } = setup();
  const id = 'historico';
  records.set(id, { id, dados: { ...trip, frete: eventText }, updated_at: 'original' });
  const writes = [];
  const fetch = async (url, opts) => {
    const payload = JSON.parse(opts.body);
    writes.push(payload);
    const response = await request(opts.method.toLowerCase(), url === collection ? collection : item, payload, 'operador', id);
    assert.equal(response.code, 200, response.data?.error);
    return { ok: true, headers: { get: key => response.headers[key] }, json: async () => response.data };
  };
  const { ui, state, el } = browser(fetch);
  const reload = async () => {
    const saved = await request('get', item, {}, 'visualizador', id);
    state.viagens = [saved.data];
    state.selectedViagemId = id;
    state.selectedViagemDetails = saved.data;
    return saved.data;
  };
  state.currentDate = trip.data;
  state.userProfile = { role: 'operador' };
  state.additionalColumns = ['cte'];
  const original = await reload();
  const fields = ui.visibleTableFields();
  const eventField = fields.find(f => f.key === 'frete');
  assert.equal(eventField.quick, true);
  assert.ok(fields.some(f => f.key === 'cte'));
  assert.match(ui.renderTableCell(original, eventField), /has-event/);
  assert.match(ui.renderDrawerObservacoes(), /&lt;em&gt;/);
  assert.doesNotMatch(ui.renderSearchResult(original), /<em>Aguardar/);
  assert.equal(ui.filteredRows('arcos').length, 1);
  assert.equal(ui.filteredRows('agenciando').length, 0);
  state.viagens.push({ ...original, _id: 'agenciada', secao: 'agenciando' });
  assert.match(ui.renderTableCell(ui.filteredRows('agenciando')[0], eventField), /has-event/);
  const eventCell = { dataset: { id, field: 'frete' } };
  const startEdit = ui.startInlineEdit;
  let clicked;
  ui.startInlineEdit = cell => { clicked = cell; };
  ui.handleMasterCellDrawerShortcut({
    preventDefault: noop, stopPropagation: noop,
    target: { closest: selector => selector.startsWith('tr.') ? eventCell : null }
  });
  assert.equal(clicked, eventCell);
  ui.startInlineEdit = startEdit;
  const cell = { dataset: {}, style: { removeProperty: noop }, classList: { remove: noop } };
  await ui.commitInlineEdit(cell, id, 'cte', '1200');
  const dialog = el('event-warning');
  assert.equal(dialog.shown, 1);
  assert.equal(el('event-warning-text').textContent, eventText);
  dialog.open = false;
  ui.handleWsMessage(messages.at(-1));
  assert.equal(dialog.shown, 1);
  state.drawerActiveField = 'cte';
  state.drawerDraft = { ...state.viagens[0], cte: '1300' };
  await ui.commitActiveDrawerField();
  assert.equal(dialog.shown, 2);
  dialog.open = false;
  state.drawerActiveField = 'frete';
  state.drawerDraft = { ...state.viagens[0] };
  ui.handleDrawerInput({ target: { dataset: { drawerField: 'frete' }, value: 'Liberado' } });
  await ui.commitActiveDrawerField();
  assert.equal((await reload()).frete, 'Liberado');
  assert.equal(dialog.shown, 2);
  ui.openModal(state.viagens[0]);
  assert.equal(el('f-frete').value, 'Liberado');
  await request('put', item, { frete: 'Evento atualizado por outro operador' }, 'operador', id);
  el('f-nome').value = 'ANA';
  await ui.saveViagem();
  assert.equal(Object.hasOwn(writes.at(-1), 'frete'), false);
  assert.equal((await reload()).frete, 'Evento atualizado por outro operador');
  ui.openModal(null, { frete: 'de outra viagem' });
  assert.equal(el('f-frete').value, '');
  const api = ui.apiFetch;
  ui.apiFetch = async () => ({ nome: 'ANA', frete: 'Evento anterior' });
  el('f-placa').value = 'TST1234';
  el('f-pamcard').options = [{ value: 'PAMCARD OK' }];
  await ui.autofillViagemByPlaca('TST1234', state.plateAutofillToken);
  ui.apiFetch = api;
  assert.equal(el('f-nome').value, 'ANA');
  assert.equal(el('f-frete').value, '');
  el('f-produto').value = 'CPV';
  el('f-origem').value = 'ARCOS';
  el('f-frete').value = 'Nova viagem';
  await ui.saveViagem();
  assert.equal(writes.at(-1).frete, 'Nova viagem');
  assert.match(source('public/index.html'), /<form method="dialog"><button[^>]*>OK<\/button>/);
});
