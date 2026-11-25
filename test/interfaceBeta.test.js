const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settings, readTransport, canRead } = require('../beta/access');
const workspace = require('../beta/workspace');

test('a composição da beta conserva os controles da interface original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  for (const [, id] of page.matchAll(/\bid="([^"]+)"/g)) assert.ok(result.includes('id="' + id + '"'), id);
  for (const [, target] of result.matchAll(/href="#(workspace-[^"]+|summary-arcos)"/g)) {
    assert.ok(result.includes('id="' + target + '"'), target);
  }
  assert.ok(result.includes('class="workspace-beta"'));
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
