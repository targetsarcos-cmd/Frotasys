# Beta da interface Frotasys

Crie um serviço separado no Render a partir da branch `feature/interface-v2` do repositório corporativo e do Blueprint `render-beta.yaml`. Revise o plano e o custo antes de confirmar. O endereço atribuído ao novo serviço é o endereço de teste. O comando de início da beta é `node beta/start.js`.

Configure a URL padrão do projeto Supabase, sua chave pública e o UUID de Auth do participante em `BETA_USER_ID`. Em Connect → Session pooler, copie somente o hostname terminado em `.pooler.supabase.com` para `BETA_POOLER_HOST`. O serviço usa a porta 5432, TLS com validação de certificado e o usuário fixo `frotasys_beta_reader.<referência do projeto>`. Em `BETA_READER_PASSWORD`, coloque a senha exclusiva do perfil PostgreSQL `frotasys_beta_reader`. O administrador deve habilitar LOGIN para esse perfil e conferir seus privilégios efetivos de leitura nas cinco tabelas do piloto. A autenticação das pessoas continua pelo Supabase Auth. Para interromper novas conexões do piloto, suspenda o serviço e execute `ALTER ROLE frotasys_beta_reader NOLOGIN;`. O modo anterior por JWT continua disponível para instalações existentes.

Entre com a conta liberada, selecione o mesmo dia e operação nas duas interfaces e compare os totais faturado e agenciado, pesos, status, eventos históricos e o resumo. Confira colunas, filtros, busca e detalhes. A beta consulta os dados ao abrir ou mudar a data. Recarregue a página para conferir alterações recentes. Para homologar gravações, use uma cópia isolada em outro projeto e um serviço específico para testes de escrita.

Para encerrar o piloto, suspenda o serviço beta e revogue a credencial de leitura.
