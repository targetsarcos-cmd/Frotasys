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
  const config = [];
  const traffic = { bytes: 0, reads: 0 };
  let revision = 0;
  const messages = [];
  const db = {
    from(table) {
      let rows = table === 'viagens' ? [...records.values()] : table === 'config_options' ? [...config] : [];
      let columns, head, limit = Infinity;
      let patch;
      const value = (row, key) => key.startsWith('dados->>') ? row.dados[key.slice(8)] : row[key];
      return {
        select(fields, options = {}) { columns = fields.split(','); head = options.head; return this; },
        gt(key, v) { rows = rows.filter(row => value(row, key) > v); return this; },
        order(key) { rows.sort((a,b) => String(value(a,key)).localeCompare(String(value(b,key)))); return this; },
        in(key, values) { rows = rows.filter(row => values.includes(value(row, key))); return this; },
        limit(n) { limit = n; return this; },
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
          const selected=row&&columns?Object.fromEntries(columns.map(col=>{const [alias,key]=col.split(':dados->');return [alias,key?row.dados[key]??null:row[alias]];})):row;
          return { data: selected ? structuredClone(selected) : null };
        },
        single() { return this.maybeSingle(); },
        then(resolve) {
          traffic.reads++;
          if (head) return resolve({ count: rows.length });
          const data = rows.slice(0,limit).map(row => Object.fromEntries((columns || Object.keys(row)).map(col => {
            const [alias,key] = col.split(':dados->');
            return [alias,key ? row.dados[key] ?? null : row[alias]];
          })));
          traffic.bytes += Buffer.byteLength(JSON.stringify(data));
          resolve({ data: structuredClone(data) });
        }
      };
    }
  };
  class SocketServer {
    clients = [{ readyState: 1, authenticated:true, send: msg => messages.push(JSON.parse(msg)) }];
    on() {}
  }
  class Workbook {
    addWorksheet() {
      this.rows = [];
      return { addRow: cells => this.rows.push(cells), getRow: () => ({ eachCell: noop }), eachRow: noop };
    }
  }
  const dependencies = {
    express, http: { createServer: () => ({ listen: noop, on: noop }) }, ws: { Server: SocketServer, OPEN: 1 },
    cors: noop, path, 'fs/promises': {}, zlib: {}, exceljs: { Workbook },
    './public/js/workspace-table-layout': require('../public/js/workspace-table-layout'),
    './supabaseClient': db, './tripStatus': require('../tripStatus'),
    dotenv:{config:noop}, './beta/runtime':require('../beta/runtime'), './beta/authenticated-socket':require('../beta/authenticated-socket'), './beta/work-day-rollover':require('../beta/work-day-rollover')
  };
  const server = vm.createContext({
    __dirname: root, process: { env: { FROTASYS_INTERFACE_BETA:'classic' } }, require(name) {
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
  return { server, records, messages, request, config, traffic };
}

const collection = '/api/viagens';
const item = collection + '/:id';
const trip = { produto: 'CPV', data: '2026-01-05', secao: 'arcos', origem: 'ARCOS', pamcard: 'OK' };
const eventText = '<em>Aguardar & conferir</em>';

test('gerar viagem da fila distingue cadastro conhecido, troca de motorista e primeiro registro', async () => {
  const { request, server, records } = setup();
  records.set('known', { id:'known', dados:{placa:'ABC-1234',nome:'JOSÉ SILVA',pamcard:'PAMCARD OK', telefone:'37999999999',dt:'antiga'} });
  const item = {field:vm.runInContext('WAITLIST_FIELD', server), placa:'ABC1234', nome:'Jose Silva'};
  server.findOneById = async () => item;
  server.waitlistDocs = async () => [];
  const db = vm.runInContext('supabase',server);
  const from = db.from.bind(db);
  db.from = table => table === 'config_options' ? {
    delete(){return this}, eq(){return this}, select(){return {data:[{}]}}
  } : from(table);
  const generate = () => request('post','/api/lista-espera/:id/gerar-viagem',{data:trip.data},'operador','queued');
  const known = await generate();
  assert.equal(known.code,200,known.data?.error);
  assert.equal(known.data.viagem.status,'CRIAR DT / PROGRAMAR');
  assert.equal(known.data.viagem.telefone,'37999999999');
  assert.equal(known.data.viagem.dt,undefined);
  item.nome='OUTRO';
  assert.equal((await generate()).data.viagem.status,'CONFERIR MOTORISTA');
  item.placa='XYZ9999';
  assert.equal((await generate()).data.viagem.status,'SEM CADASTRO');
});

test('as tarifas de Agregado e Terceiros são independentes por rota e eixo', () => {
  const { server } = setup();
  const { ui, state } = browser();
  ui.document.body = {classList:{contains:()=>true},dataset:{betaMode:'readonly'}};
  const route = {rota:'ARCOS X OSASCO',rows:[{eixos:5,pj:3744,pf:3848}]};
  const legacy = server.normalizeFreteConsultas({routes:[route]});
  assert.equal(legacy.routes[0].agregado.length,0);
  state.freteConsultas = ui.mergeFreteConsultas(legacy);
  const trip = {origem:'ARCOS',destino:'OSASCO',eixos:5,tipo:'AGREGADO'};
  assert.equal(ui.freteValuesForViagem(trip).pj,'-');
  route.agregado = [{eixos:6,pj:2999,pf:3050}];
  const normalized = server.normalizeFreteConsultas({routes:[route]});
  state.freteConsultas = ui.mergeFreteConsultas(normalized);
  assert.equal(ui.freteValuesForViagem(trip).pf,'-');
  assert.match(ui.freteValuesForViagem({...trip,eixos:6}).pj,/2\.999,00/);
  assert.match(ui.freteValuesForViagem({...trip,tipo:'CARRETEIRO'}).pf,/3\.848,00/);
});

test('programação antecede o pedido pelo WhatsApp e mantém a viagem em Agenciado', async () => {
  const { request } = setup();
  const created = await request('post', collection, { ...trip, secao:'agenciando', dt:'123' });
  assert.equal(created.data.status, 'PROGRAMAR');
  const id = created.data._id;
  const edit = (body, role = 'operador') => request('put', item, body, role, id);
  assert.equal((await edit({ pedidoEnviadoDt:'123' })).code, 409);
  assert.equal((await edit({ programado:true })).data.status, 'ENVIAR PEDIDO');
  assert.equal((await edit({ pedidoEnviadoDt:'124' })).code, 409);
  assert.equal((await edit({ pedidoEnviadoDt:'123' }, 'visualizador')).code, 403);
  const sent = await edit({ pedidoEnviadoDt:'123' });
  assert.equal(sent.data.status, 'AGUARDANDO CARREGAMENTO');
  assert.equal(sent.data.secao, 'agenciando');
  assert.equal((await request('get', item, {}, 'visualizador', id)).data.status, 'AGUARDANDO CARREGAMENTO');
  assert.equal((await edit({ dt:'124' })).data.status, 'ENVIAR PEDIDO');
});

test('editar Evento em viagem com DT historica repetida preserva os documentos', async () => {
  const { records, request } = setup();
  for (const id of ['a', 'b']) {
    records.set(id, { id, updated_at: '1', dados: { ...trip, dt: '123', programado: true } });
  }
  const saved = await request('put', item, { frete: 'Conferir descarga' }, 'operador', 'a');
  assert.equal(saved.code, 200, saved.data?.error);
  assert.equal(records.get('a').dados.frete, 'Conferir descarga');
  assert.equal(records.get('a').dados.dt, '123');
  assert.equal(records.get('b').dados.frete, undefined);
  const unchanged = await request('put', item, { frete: 'Outro', dt: '123' }, 'operador', 'a');
  assert.equal(unchanged.code, 200);
  records.get('b').dados.dt='456';
  const conflict = await request('put', item, { dt: '456' }, 'operador', 'a');
  assert.equal(conflict.code, 409);
});

test('JSONB, pesquisa, planilha e atualizacoes concorrentes', async () => {
  const { server, records, request } = setup();
  const created = await request('post', collection, { ...trip, frete: eventText });
  assert.equal(created.code, 200, created.data?.error);
  const id = created.data._id;
  assert.equal(records.get(id).dados.frete, eventText);
  assert.equal((await request('get', item, {}, 'visualizador', id)).data.frete, eventText);
  assert.equal((await request('put', item, { nome: 'MARIA' }, 'operador', id)).data.frete, eventText);
  const snapshot = await server.findOneById('viagens', id);
  const edit = await request('put', item, { frete: 'Conferir nota' }, 'admin', id);
  assert.equal(edit.data.historico, undefined);
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
  Object.assign(ui, { renderAll: noop, loadAll: noop, syncDynamicSelects: noop, updateUndoButton: noop, showSummaryToast: noop });
  return { ui, state: vm.runInContext('state', ui), el: id => document.getElementById(id) };
}

test('funil combina os campos com data e operacao nas duas tabelas', () => {
  const { ui, state } = browser();
  state.currentDate = trip.data;
  const base = { ...trip, placa: 'ABC-1234', nome: 'José', destino: 'São Paulo', status: 'PROGRAMAR', frete: '0' };
  state.viagens = [base, { ...base, frete: '' }, { ...base, secao: 'agenciando' },
    { ...base, origem: 'BARROSO' }, { ...base, data: '2000-01-01' }];
  state.originFilter = 'ARCOS';
  const options = ui.renderTripFilterFields();
  assert.doesNotMatch(options, /type="search"/);
  assert.match(options, /data-all>Selecionar todos/);
  assert.match(options, /name="origem" value="ARCOS"/);
  assert.doesNotMatch(options, /name="origem" value="BARROSO"/);
  assert.equal((options.match(/name="placa" value="ABC-1234"/g) || []).length, 1);
  state.tripFilters = { placa: [base.placa], nome: [base.nome], destino: [base.destino], status: ['PROGRAMAR'], evento: ['Com evento'] };
  assert.equal(ui.filteredRows('arcos').length, 1);
  assert.equal(ui.filteredRows('agenciando').length, 1);
  state.tripFilters.evento = ['Sem evento'];
  assert.equal(ui.filteredRows('arcos')[0].frete, '');
  assert.equal(ui.filteredRows('agenciando').length, 0);
  state.tripFilters = {};
  assert.equal(ui.filteredRows('arcos').length, 2);
  state.originFilter = '';
  state.viagens.push({ ...base, placa: 'ONT-9999', data: '2000-01-01' });
  assert.doesNotMatch(ui.renderTripFilterFields(), /ONT-9999/);
  state.tripFilters = { origem: ['ARCOS', 'BARROSO'], frete: ['0,00'] };
  assert.equal(ui.filteredRows('arcos').length, 2);
  state.tripFilters = { frete: [''] };
  assert.equal(ui.filteredRows('arcos').length, 1);
  state.tripFilters = { placa: [] };
  assert.equal(ui.filteredRows('arcos').length, 0);
});

test('coluna Evento exibe duas casas para numeros e conserva o valor de edicao', () => {
  const { ui } = browser();
  const field = { key: 'frete', quick: true };
  for (const [raw, display] of [
    ['320', '320,00'], ['320,00', '320,00'], ['320,5', '320,50'], ['320.5', '320,50'],
    ['1.250,75', '1.250,75'], ['1.250', '1.250,00'], ['-3,456', '-3,46'],
    [0, '0,00'], ['', '-'], ['Evento 320', 'Evento 320'], ['01/12', '01/12']
  ]) {
    const cell = ui.renderTableCell({ _id: 'teste', frete: raw }, field);
    assert.ok(cell.includes('<strong>' + display + '</strong>'), cell);
    assert.ok(cell.includes('data-raw="' + raw + '"'), cell);
  }
});

test('sair da celula Evento confirma o texto uma vez mesmo com blur apos change', async () => {
  const { records, request } = setup();
  const id = (await request('post', collection, trip)).data._id;
  let writes = 0;
  const { ui, state } = browser(async (url, opts) => {
    assert.equal(url, collection + '/' + id);
    writes++;
    const response = await request('put', item, JSON.parse(opts.body), 'operador', id);
    return { ok: true, headers: { get: () => null }, json: async () => response.data };
  });
  const notices = [];
  ui.showSummaryToast = message => notices.push(message);
  state.userProfile = { role: 'operador' };
  state.viagens = [(await request('get', item, {}, 'operador', id)).data];
  const handlers = {};
  const input = {
    focus: noop, select: noop, isConnected: true, value: '',
    addEventListener(name, fn) { handlers[name] = fn; }
  };
  const td = { dataset: { id, field: 'frete', raw: '' }, style: {},
    getBoundingClientRect: () => ({ width: 120 }), querySelector: () => input };
  ui.startInlineEdit(td);
  input.value = 'Aguardar descarga';
  handlers.input();
  handlers.change();
  input.onblur({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 1);
  assert.equal(records.get(id).dados.frete, input.value);
  assert.deepEqual(notices, ['Evento salvo.']);
});

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
  assert.ok(!ui.visibleTableFields().some(f => f.key === 'frete'));
  state.additionalColumns = ['cte', 'frete'];
  const original = await reload();
  const fields = ui.visibleTableFields();
  assert.equal(fields[fields.findIndex(f => f.key === 'agendamento') + 1].key, 'frete');
  assert.ok(fields.findIndex(f => f.key === 'frete') < fields.findIndex(f => f.key === 'status'));
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

test('painel compartilha o catálogo paginado, preserva cores e conta sessões sem baixar o histórico', async () => {
  const { server, request, config, traffic } = setup();
  const add = dados => config.push({id:String(config.length + 1).padStart(5,'0'),dados});
  const markers = vm.runInContext('Object.values(CONFIG_SEED_MARKERS)',server);
  for (const marker of markers) add({field:'__system_seed',value:marker,normalized:marker});
  for (let i=1;i<=260;i++) add({field:'origem',value:'LOCAL '+i,ordem:i,color:'#123456'});
  const typeField = vm.runInContext('WORK_TYPE_FIELD',server);
  const sessionField = vm.runInContext('WORK_SESSION_FIELD',server);
  add({field:typeField,name:'Conferência',displayOrder:1});
  const typeId=config.at(-1).id;
  for(let i=0;i<500;i++) add({field:sessionField,workTypeId:typeId,note:'x'.repeat(1024)});
  const [options,colors]=await Promise.all([request('get','/api/config-options'),request('get','/api/config-colors')]);
  assert.equal(options.data.origem.length,260);
  assert.equal(options.data.origem.at(-1),'LOCAL 260');
  assert.equal(colors.data.origem['LOCAL 260'],'#123456');
  assert.equal(traffic.reads,2);
  const types=await request('get','/api/work-types');
  assert.equal(types.data[0].usageCount,500);
  const before=traffic.reads;
  vm.runInContext('invalidateAfterWrite(TABLES.viagens)',server);
  await request('get','/api/config-options');
  await request('get','/api/work-types');
  assert.equal(traffic.reads,before);
  assert.ok(traffic.bytes<60000);
  vm.runInContext('invalidateAfterWrite(TABLES.configOptions)',server);
  config.find(row=>row.dados.value==='LOCAL 260').dados.color='#abcdef';
  assert.equal((await request('get','/api/config-colors')).data.origem['LOCAL 260'],'#abcdef');
});

test('listagem não transfere histórico legado e gravação preserva os dados antigos',async()=>{
  const {records,request,traffic}=setup();
  const historico=Array.from({length:500},()=>({campo:'obs',atual:'x'.repeat(200)}));
  records.set('old',{id:'old',updated_at:'1',dados:{...trip,placa:'ABC1234',nome:'ANA',historico}});
  const before=traffic.bytes;
  const listed=await request('get',collection,{},'visualizador',null,{data:trip.data});
  assert.equal(listed.code,200);
  assert.equal(listed.data[0].historico,undefined);
  assert.equal(listed.data[0].nome,'ANA');
  assert.ok(traffic.bytes-before<5000);
  const saved=await request('put',item,{nome:'MARIA'},'operador','old');
  assert.equal(saved.code,200);
  assert.equal(saved.data.historico,undefined);
  assert.equal(records.get('old').dados.historico.length,500);
});
