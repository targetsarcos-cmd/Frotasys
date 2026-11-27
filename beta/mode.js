'use strict';
const billing=require('../public/js/workspace-trip-sections');

function betaMode(env) {
  return env.BETA_ENABLE_WRITES === 'true' ? 'editable' : 'readonly';
}

function validateEditableConfig(env) {
  const url = new URL(env.SUPABASE_URL);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password) {
    throw Error('Configure a URL oficial do Supabase para a beta.');
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.BETA_USER_ID || '')) {
    throw Error('Configure BETA_USER_ID.');
  }
  const publicKey = env.SUPABASE_ANON_KEY || '';
  const key = env.BETA_WRITE_SERVICE_ROLE || '';
  function claims(value) {
    try { return JSON.parse(Buffer.from(value.split('.')[1] || '', 'base64url').toString()); }
    catch { return {}; }
  }
  const publicClaims = claims(publicKey);
  if (!publicKey.startsWith('sb_publishable_') && publicClaims.role !== 'anon') {
    throw Error('Configure a chave publica do Supabase.');
  }
  const secretClaims = claims(key);
  if (!key || key === publicKey || (!key.startsWith('sb_secret_') && secretClaims.role !== 'service_role')) {
    throw Error('Configure BETA_WRITE_SERVICE_ROLE somente no ambiente privado do servidor beta.');
  }
  const project = url.hostname.split('.')[0];
  for (const claim of [publicClaims, secretClaims]) {
    if (claim.ref && claim.ref !== project) throw Error('Credencial de outro projeto Supabase.');
  }
  return { url: url.origin, key };
}

function createEditableClient(env) {
  const { url, key } = validateEditableConfig(env);
  const { createClient } = require('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } });
}

function persistedSection(trip) {
  return billing.isBilled(trip) ? 'arcos' : 'agenciando';
}

module.exports = { betaMode, validateEditableConfig, createEditableClient, persistedSection };
