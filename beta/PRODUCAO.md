# Publicação da interface homologada

Em produção, mantenha o serviço Render DashLog ligado à branch main, com comando node server.js (ou npm start), e as credenciais privadas existentes SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE. Não configure FROTASYS_INTERFACE_BETA, BETA_USER_ID ou BETA_WRITE_SERVICE_ROLE nesse serviço. A interface homologada é agora a padrão. O serviço separado da beta pode continuar com node beta/start.js; mantenha suas credenciais restritas.

O servidor de produção valida as contas ativas pelo Supabase Auth, conserva os papéis admin/operador/visualizador e autentica a conexão WebSocket antes de transmitir qualquer dado. Os clientes renovam a conexão autenticada periodicamente. A rotina de expiração de observações e comentários homologada passa a operar em produção. Não há alteração de schema exigida por este release.

Antes de publicar, faça backup do banco pelo Supabase. O backup do código anterior está na branch backup/main-pre-interface-v2-20261127 (02b3628). Para rollback de código, use o deploy anterior no Render; isso não desfaz gravações já realizadas no banco. Após publicar, valide login com administrador, operador e visualizador, conexão de dois operadores, edição de viagem, lembretes, filtros, relatórios e configuração de fretes. Suspenda o serviço de teste após validar produção se não for mais necessário.
