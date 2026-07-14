const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTripStatus } = require('../tripStatus');

const base = {
  pamcard: 'PAMCARD OK',
  tipo: 'CARRETEIRO'
};

test('DT e programacao avancam e regridem', () => {
  assert.equal(calculateTripStatus({ ...base }), 'CRIAR DT / PROGRAMAR');
  assert.equal(calculateTripStatus({ ...base, dt: '123' }), 'PROGRAMAR');
  assert.equal(calculateTripStatus({ ...base, dt: '123', programado: true }), 'AGUARDANDO CARREGAMENTO');
  assert.equal(calculateTripStatus({ ...base, programado: true }), 'CRIAR DT');
  assert.equal(calculateTripStatus({ ...base, programado: false }), 'CRIAR DT / PROGRAMAR');
});

test('nota fiscal e pedagio controlam emitir CTE com regressao', () => {
  const ready = { ...base, dt: '123', programado: true, nota: '390339', num_pedagio: '105974597' };
  assert.equal(calculateTripStatus(ready), 'EMITIR CTE');
  assert.equal(calculateTripStatus({ ...ready, num_pedagio: '' }), 'AGUARDANDO CARREGAMENTO');
  assert.equal(calculateTripStatus({ ...ready, num_pedagio: '105974597' }), 'EMITIR CTE');
});

test('documentos de transporte controlam adiantamento e regressao', () => {
  const ready = {
    ...base,
    dt: '123',
    programado: true,
    nota: '390339',
    num_pedagio: '105974597',
    cte: '25.889',
    manifesto: '24.954',
    contrato: '6.957'
  };
  assert.equal(calculateTripStatus(ready), 'ADIANTAMENTO / DESCARGA');
  assert.equal(calculateTripStatus({ ...ready, manifesto: '' }), 'EMITIR CTE');
  assert.equal(calculateTripStatus({ ...ready, manifesto: '24.954' }), 'ADIANTAMENTO / DESCARGA');
});

test('adiantamento e descarga avancam e regridem', () => {
  const docs = {
    ...base,
    cte: '25.889',
    manifesto: '24.954',
    contrato: '6.957'
  };
  assert.equal(calculateTripStatus(docs), 'ADIANTAMENTO / DESCARGA');
  assert.equal(calculateTripStatus({ ...docs, descarga: '2026-07-11T15:00' }), 'ADIANTAMENTO');
  assert.equal(calculateTripStatus({ ...docs, descarga: '2026-07-11T15:00', adiantamentoOk: true }), 'CONCLUIDO');
  assert.equal(calculateTripStatus({ ...docs, adiantamentoOk: true }), 'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus({ ...docs, adiantamentoOk: false }), 'ADIANTAMENTO / DESCARGA');
});

test('pendencia cadastral tem prioridade', () => {
  const trip = {
    tipo: 'CARRETEIRO',
    pamcard: '',
    status: 'SEM CADASTRO',
    dt: '123',
    programado: true,
    nota: '390339',
    num_pedagio: '105974597',
    cte: '25.889',
    manifesto: '24.954',
    contrato: '6.957',
    adiantamentoOk: true,
    descarga: '2026-07-11T15:00'
  };
  assert.equal(calculateTripStatus(trip), 'SEM CADASTRO');
});
