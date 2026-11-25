'use strict';
const READ_TABLES = new Set(['viagens', 'metas', 'operacoes', 'config_options', 'user_profiles']);
const canRead = method => method === 'GET' || method === 'HEAD';

function settings(env) {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('URL Supabase inválida.');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.BETA_USER_ID || '')) throw Error('Configure BETA_USER_ID.');
  if (env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Remova a credencial administrativa da beta.');
  const token = env.BETA_READ_JWT || '';
  const claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString() || '{}');
  if (claims.role !== 'frotasys_beta_reader' || !(claims.exp > Date.now()/1000)) throw Error('Configure o JWT temporário da função de leitura.');
  const key = env.SUPABASE_ANON_KEY || '';
  if (!key.startsWith('sb_publishable_')) {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString() || '{}');
    if (payload.role !== 'anon') throw Error('Configure a chave pública do Supabase.');
  }
  return { origin: url.origin, key, token };
}

function readTransport(config, transport = fetch) {
  return (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const table = url.pathname.split('/')[3];
    if (!canRead(method) || url.origin !== config.origin || !READ_TABLES.has(table) ||
        url.pathname !== '/rest/v1/' + table) throw Error('Consulta indisponível na beta.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', 'Bearer ' + config.token);
    headers.set('apikey', config.key);
    return transport(url, { ...init, method, headers, redirect: 'error' });
  };
}

function createReadClient(env) {
  const config = settings(env);
  const { createClient } = require('@supabase/supabase-js');
  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const db = createClient(config.origin, config.key, { auth, global: { fetch: readTransport(config) } });
  const login = createClient(config.origin, config.key, { auth });
  return { from: db.from.bind(db), auth: { getUser: token => login.auth.getUser(token) } };
}

module.exports = { canRead, settings, readTransport, createReadClient };
