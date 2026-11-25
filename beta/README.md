# Beta da interface Frotasys

Crie um serviço separado no Render a partir da branch `feature/interface-v2` do repositório corporativo e do Blueprint `render-beta.yaml`. Revise o plano e o custo antes de confirmar. O endereço atribuído ao novo serviço é o endereço de teste. O comando de início da beta é `node beta/start.js`.

Configure os valores no painel de segredos do serviço. Use a URL e a chave pública do projeto Supabase, o UUID de Auth do participante em `BETA_USER_ID` e um JWT temporário reconhecido pelo PostgREST em `BETA_READ_JWT`. O JWT precisa da role `frotasys_beta_reader`, com acesso SELECT efetivo às linhas necessárias de viagens, metas, operacoes, config_options e user_profiles, respeitando as políticas do projeto. O administrador deve confirmar os privilégios efetivos e a data de expiração antes da ativação. O serviço dispensa chaves de assinatura e credenciais administrativas. Caso essa credencial ainda não exista, use um projeto de homologação com uma cópia autorizada dos dados até dispor de acesso restrito. Não reutilize o grupo de variáveis do serviço atual.

Entre com a conta liberada, selecione o mesmo dia e operação nas duas interfaces e compare os totais faturado e agenciado, pesos, status, eventos históricos e o resumo. Confira colunas, filtros, busca e detalhes. A beta consulta os dados ao abrir ou mudar a data. Recarregue a página para conferir alterações recentes. Para homologar gravações, use uma cópia isolada em outro projeto e um serviço específico para testes de escrita.

Para encerrar o piloto, suspenda o serviço beta e revogue a credencial de leitura.
