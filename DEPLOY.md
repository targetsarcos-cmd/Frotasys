# Deploy FrotaSys com Supabase e Render

## Rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie ou confira o arquivo `.env` na raiz do projeto:

```env
SUPABASE_URL=https://ljsxrtgoyzvatuhwirxo.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE=sua_service_role_key
PORT=3000
```

3. Inicie o servidor:

```bash
npm start
```

4. Acesse:

```text
http://localhost:3000
```

## Criar tabelas no Supabase

1. Abra o painel do Supabase.
2. Entre em SQL Editor.
3. Cole e execute o conteúdo do arquivo `database.sql`.
4. Confirme que as tabelas foram criadas:

```text
viagens
metas
operacoes
config_options
```

O backend usa `SUPABASE_SERVICE_ROLE`, então mantenha essa chave somente em variáveis de ambiente do servidor. Nunca exponha essa chave no frontend.

## Configurar Render

No Render, mantenha as variáveis de ambiente:

```env
SUPABASE_URL=https://ljsxrtgoyzvatuhwirxo.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE=sua_service_role_key
PORT=10000
```

Configurações esperadas:

```text
Build Command: npm install
Start Command: npm start
```

O servidor usa `process.env.PORT || 3000`, então o Render injeta `PORT=10000` e o ambiente local usa `3000` quando não houver porta definida.

## Publicar no GitHub

```bash
git add .
git commit -m "Migra banco para Supabase e corrige deploy Render"
git push
```

Após o `git push`, o Render detecta o novo commit no repositório conectado e faz o deploy automaticamente.

## Verificação

Depois do deploy, acesse:

```text
https://frotasys.onrender.com
```

A raiz `/` deve servir `public/index.html` e as rotas `/api/...` devem continuar respondendo pelo Express.
