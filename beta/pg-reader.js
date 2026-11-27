'use strict';
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
// Public database roots shipped by the official Supabase CLI (2021 and 2025).
const poolerCa = readFileSync(join(__dirname, 'supabase-roots.pem'), 'utf8');

const tables = new Set(['viagens', 'metas', 'operacoes', 'config_options', 'user_profiles']);
const columns = new Set(['id', 'dados', 'created_at', 'updated_at', 'user_id', 'nome', 'email', 'role', 'ativo']);

function field(name) {
  if (columns.has(name)) return '"' + name + '"';
  const json = /^dados(->>?)([a-zA-Z_][a-zA-Z_0-9]*)$/.exec(name);
  if (json) return "(dados" + json[1] + "'" + json[2] + "')";
  throw Error('Campo de leitura inválido.');
}

function projection(name) {
  const alias = /^([a-zA-Z_][a-zA-Z_0-9]*):(dados->>?[a-zA-Z_][a-zA-Z_0-9]*)$/.exec(name);
  if (!alias) return field(name);
  return field(alias[2]) + ' AS "' + alias[1] + '"';
}

// API de consulta usada pelas rotas existentes. Somente SELECT é gerado.
function fromTable(pool, table) {
  if (!tables.has(table)) throw Error('Tabela indisponível na beta.');
  return { select(names, options = {}) {
    const count = options.head && options.count === 'exact';
    const fields = count ? 'count(*) AS total' : names.split(',').map(projection).join(', ');
    const where = [], order = [], values = [];
    let limit = 1000;
    function filter(name, operator, value) {
      const column = field(name);
      values.push(value);
      const arg = '$' + values.length;
      where.push(column + (operator === 'ANY' ? ' = ANY(' + arg + ')' : ' ' + operator + ' ' + arg));
      return query;
    }
    async function read(single) {
      let sql = 'SELECT ' + fields + ' FROM public."' + table + '"';
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      if (order.length && !count) sql += ' ORDER BY ' + order.join(', ');
      const args = [...values];
      if (!count) sql += ' LIMIT $' + args.push(single ? Math.min(2, limit) : limit);
      const { rows } = await pool.query(sql, args);
      if (count) return { count: Number(rows[0].total) };
      if (single && rows.length > 1) throw Error('Mais de um registro encontrado.');
      return { data: single ? rows[0] || null : rows };
    }
    const query = {
      eq: (name, value) => filter(name, '=', value),
      gt: (name, value) => filter(name, '>', value),
      lt: (name, value) => filter(name, '<', value),
      gte: (name, value) => filter(name, '>=', value),
      lte: (name, value) => filter(name, '<=', value),
      ilike: (name, value) => filter(name, 'ILIKE', value),
      in: (name, values) => filter(name, 'ANY', values),
      is(name, value) {
        if (value !== null) throw Error('Filtro inválido.');
        where.push(field(name) + ' IS NULL');
        return query;
      },
      not(name, op, value) {
        if (op === 'cs' && name === 'dados') {
          values.push(value);
          where.push('NOT ("dados" @> $' + values.length + '::jsonb)');
          return query;
        }
        if (op !== 'is' || value !== null) throw Error('Filtro inválido.');
        where.push(field(name) + ' IS NOT NULL');
        return query;
      },
      order(name, { ascending = true } = {}) {
        order.push(field(name) + (ascending ? ' ASC' : ' DESC'));
        return query;
      },
      limit(n) {
        if (!Number.isSafeInteger(n) || n < 0) throw Error('Limite inválido.');
        limit = Math.min(n, 1000);
        return query;
      },
      maybeSingle: () => read(true),
      then: (resolve, reject) => read(false).then(resolve, reject)
    };
    return query;
  }};
}

function poolSettings(env, url) {
  const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
  const host = (env.BETA_POOLER_HOST || '').trim();
  if (!ref || !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) || !env.BETA_READER_PASSWORD) {
    throw Error('Configure a URL do projeto, o host do Session pooler e a senha do leitor.');
  }
  return { host, port: 5432, database: 'postgres', user: 'frotasys_beta_reader.' + ref[1],
    password: env.BETA_READER_PASSWORD, ssl: { ca: poolerCa, rejectUnauthorized: true }, max: 3,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 };
}

module.exports = { fromTable, poolSettings };
