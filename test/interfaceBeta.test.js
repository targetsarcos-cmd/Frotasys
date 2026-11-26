const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settings, readTransport, canRead } = require('../beta/access');
const workspace = require('../beta/workspace');
const { fromTable, poolSettings } = require('../beta/pg-reader');

test('pooler exige TLS, host do Supabase e usuário dedicado', () => {
  const url = new URL('https://mockproject.supabase.co');
  const env = { BETA_POOLER_HOST: 'aws-0-test.pooler.supabase.com', BETA_READER_PASSWORD: 'fixture' };
  const config = poolSettings(env, url);
  assert.equal(config.user, 'frotasys_beta_reader.mockproject');
  assert.equal(config.port, 5432);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.throws(() => poolSettings({ ...env, BETA_POOLER_HOST: 'example.invalid' }, url));
  assert.throws(() => poolSettings({ ...env, BETA_READER_PASSWORD: '' }, url));
});

test('consultas da programação parametrizam valores e preservam projeção, ordem e limites', async () => {
  const calls = [];
  const pool = { query: async (sql, args) => { calls.push({sql,args}); return {rows:[]}; } };
  const table = fromTable(pool, 'viagens');
  assert.throws(() => fromTable(pool, 'pg_authid'));
  assert.throws(() => table.select('senha'));
  assert.equal(table.update, undefined);
  const q = table.select('data:dados->>data').eq('id','fixture').in('dados->>origem',['ARCOS'])
    .not('dados->>data','is',null).order('dados->>data',{ascending:false}).limit(25);
  assert.deepEqual((await q).data, []);
  assert.deepEqual(calls[0].args, ['fixture',['ARCOS'],25]);
  assert.match(calls[0].sql, /IS NOT NULL ORDER BY .* DESC LIMIT \$3$/);
  assert.equal((await table.select('id').maybeSingle()).data, null);
  assert.equal((await fromTable({ query: async () => ({rows:[{total:'7'}]}) },'viagens')
    .select('id',{count:'exact',head:true})).count, 7);
});

test('a composição da beta conserva os controles da interface original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  for (const [, id] of page.matchAll(/\bid="([^"]+)"/g)) assert.ok(result.includes('id="' + id + '"'), id);
  for (const [, target] of result.matchAll(/href="#(workspace-[^"]+|summary-arcos)"/g)) {
    assert.ok(result.includes('id="' + target + '"'), target);
  }
  assert.ok(result.includes('class="workspace-beta"'));
  const ids = [...result.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'cada controle deve ter um único id');
  for (const id of ['collapseNav', 'tableSearch', 'tabs', 'summaryMetrics', 'progressTrack', 'summaryBody', 'toggleCompleted', 'completedContent', 'table-concluidos', 'tbody-concluidos', 'countCompleted']) {
    assert.ok(ids.includes(id), id);
  }
  assert.doesNotMatch(result, /demoTargets|Modo demo|Dados demonstrativos/);
  assert.doesNotMatch(page, /workspace-reference\.css|workspace-beta\.js|beta-shell/);
});

test('a configuração exige identidade, chave pública e função específica de leitura', () => {
  const jwt = claims => 'a.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.b';
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: jwt({role:'anon'}),
    BETA_USER_ID: '11111111-1111-1111-1111-111111111111', BETA_READ_JWT: jwt({role:'frotasys_beta_reader', exp: Date.now()/1000 + 120}) };
  assert.ok(settings(env));
  for (const override of [{ BETA_USER_ID:'' }, { SUPABASE_SERVICE_ROLE:'admin' }, { BETA_READ_JWT: jwt({role:'service_role'}) }, { BETA_READ_JWT: jwt({role:'frotasys_beta_reader', exp:1}) }]) {
    assert.throws(() => settings({...env, ...override}));
  }
});

test('somente leituras das tabelas permitidas chegam ao transporte', async () => {
  const calls = [];
  const cfg = {origin:'https://example.invalid', key:'public', token:'read'};
  const send = readTransport(cfg, (url, opts) => calls.push({url,opts}));
  const url = cfg.origin + '/rest/v1/viagens';
  for (const method of ['POST','PUT','PATCH','DELETE']) {
    assert.equal(canRead(method), false);
    assert.throws(() => send(url, {method}));
  }
  for (const invalid of [url + '/extra', cfg.origin + '/rest/v1/rpc/run', cfg.origin + '/rest/v1/private', 'https://other.invalid/rest/v1/viagens']) {
    assert.throws(() => send(invalid));
  }
  await send(url + '?select=dados');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.headers.get('authorization'), 'Bearer read');
  assert.equal(calls[0].opts.redirect, 'error');
});

test('a beta classifica viagens pela nota e conclusão sem depender da seção legada', () => {
  const { classify, hasInvoice } = require('../public/js/workspace-trip-sections');
  const pending = { secao:'arcos', status:'AGUARDANDO CARREGAMENTO', nota:'  ' };
  assert.equal(classify(pending), 'agenciando');
  assert.equal(classify({ ...pending, secao:'agenciando', nota:'12345' }), 'arcos');
  assert.equal(classify({ ...pending, status:'CONCLUÍDO', nota:'12345' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'CONCLUIDO' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'PROGRAMAR', nota:'12345' }), 'arcos');
  assert.equal(classify({ ...pending, nota:null }), 'agenciando');
  assert.equal(classify({ ...pending, nota:12345 }), 'arcos');
  assert.equal(hasInvoice({ nota:'  ' }), false);
  assert.equal(hasInvoice({ nota:'00123' }), true);
});

test('a tabela de concluídos inicia recolhida e preserva a estrutura original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  assert.match(result, /id="toggleCompleted" aria-expanded="false" aria-controls="completedContent"/);
  assert.match(result, /id="completedContent" hidden/);
  assert.ok(result.indexOf('countBooked') < result.indexOf('countBilled'));
  assert.ok(result.indexOf('countBilled') < result.indexOf('countCompleted'));
  assert.ok(result.indexOf('/js/workspace-trip-sections.js') < result.indexOf('/js/workspace-beta.js'));
  assert.doesNotMatch(page, /table-concluidos/);
});
