const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('renomear no editor preserva a origem da viagem e a chave de mensagens', async () => {
  const elements = new Map();
  const noop = () => {};
  function getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', dataset: {}, focus: noop, classList: { add: noop, remove: noop }
    });
    return elements.get(id);
  }
  const ui = vm.createContext({
    document: { readyState: 'loading', addEventListener: noop, getElementById },
    window: { addEventListener: noop }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), ui);
  const state = vm.runInContext('state', ui);
  const op = { _id: 'op1', origem: 'ARCOS', metaTipo: 'arcos', ordem: 1 };
  state.operacoes = [op];
  state.originFilter = 'ARCOS';
  state.userProfile = { role: 'admin' };
  state.configOptions = { produto: ['CPV'], destino: ['MAUA'] };
  state.viagens = [{ origem: 'ARCOS', secao: 'arcos', data: state.currentDate }];
  const writes = [];
  Object.assign(ui, {
    renderOperationCardChoices: noop, checkedOperationValues: kind => kind === 'produto' ? ['CPV'] : ['MAUA'],
    renderSettingsModal: noop, loadAll: noop,
    apiFetch: async (url, options) => {
      const patch = JSON.parse(options.body);
      writes.push({ url, method: options.method, patch });
      return { ...op, ...patch };
    }
  });
  ui.openOperationModal('op1');
  assert.equal(getElementById('op-origem').value, 'Arcos');
  getElementById('op-origem').value = ' Unidade <Centro> ';
  await ui.saveOperation();
  assert.deepEqual(writes, [{ url: '/api/operacoes/op1', method: 'PUT', patch: { nome: 'Unidade <Centro>' } }]);
  ui.renderOriginFilters();
  const select = getElementById('operation-filter');
  assert.match(select.innerHTML, /value="ARCOS">Unidade &lt;Centro&gt;/);
  assert.equal(select.value, 'ARCOS');
  assert.equal(ui.filteredRows('arcos').length, 1);
  assert.equal(ui.operationMessageKey(state.operacoes[0]), 'ARCOS');
  ui.openOperationModal('op1');
  assert.equal(getElementById('op-origem').value, 'Unidade <Centro>');
  state.operacoes.push({ _id: 'op2', origem: 'BARROSO' });
  state.viagens.push(
    { origem: 'BARROSO', secao: 'arcos', data: state.currentDate },
    { origem: 'BARROSO', secao: 'agenciando', data: state.currentDate },
    { origem: 'ARCOS', secao: 'arcos', data: '2000-01-01' }
  );
  state.originFilter = '';
  ui.renderOriginFilters();
  assert.match(select.innerHTML, /<option value="">Todos<\/option>/);
  assert.equal(select.value, '');
  assert.equal(ui.filteredRows('arcos').length, 2);
  assert.equal(ui.filteredRows('agenciando').length, 1);
  state.originFilter = 'BARROSO';
  ui.renderOriginFilters();
  assert.equal(select.value, 'BARROSO');
  assert.equal(ui.filteredRows('arcos').length, 1);
});
