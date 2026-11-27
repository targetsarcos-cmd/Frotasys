# Aviso de atualização após deploy

Configure `RENDER_API_KEY` exclusivamente como variável secreta do serviço de produção no Render, com a menor permissão disponível para consultar os deploys do serviço. Nunca registre a chave no GitHub ou no frontend. `RENDER_SERVICE_ID` e `RENDER_GIT_COMMIT` são fornecidas automaticamente pelo Render.

O endpoint `/api/version` só anuncia uma versão diferente após confirmar que o único deploy `live` do próprio serviço corresponde ao commit do processo em execução. Sem credencial, fora do Render, em piloto, com erro da API ou com estado não confirmado, o aviso não é emitido (HTTP 503 apenas no endpoint de versão). A aplicação permanece disponível. Consultas simultâneas são compartilhadas; cache de 30 segundos por processo. Navegadores atualizados não consultam a API Render.

Após configurar a credencial, valide um deploy real, com uma aba aberta da versão anterior. O modal deverá aparecer apenas depois do estado live. Se a versão anterior não tiver a nova lógica de confirmação, o endpoint novo ainda responde com erro até confirmar o deploy. Não há aviso em reinício/deploy do mesmo commit. Se for necessário revogar a chave, faça-o no Render; a aplicação não depende dela para operar.
