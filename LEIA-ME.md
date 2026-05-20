# FROTASYS — Controle de Viagens

Sistema web local para controle de viagens, substituto da planilha MAIO ARCOS 2026.

---

## INSTALAÇÃO (Apenas uma vez, no PC servidor)

### 1. Instalar o Node.js
- Baixe em: https://nodejs.org  
- Instale a versão **LTS** (recomendado)
- Após instalar, reinicie o computador

### 2. Extrair o sistema
- Descompacte a pasta `frota-app` em qualquer lugar  
  Exemplo: `C:\FrotaSys\`

### 3. Instalar as dependências
- Abra o CMD dentro da pasta `frota-app`
- Digite: `npm install`
- Aguarde concluir

---

## COMO USAR

### No PC servidor (que vai rodar o sistema):
- Dê duplo clique em **`INICIAR.bat`**
- O terminal vai mostrar algo assim:
  ```
  ✅ Servidor rodando!
     Local:   http://localhost:3000
     Rede:    http://192.168.1.105:3000
  ```
- Abra o navegador e acesse: `http://localhost:3000`

### Nos outros computadores da rede:
- Abra qualquer navegador (Chrome, Edge, Firefox)
- Digite o endereço de **Rede** mostrado no servidor  
  Exemplo: `http://192.168.1.105:3000`
- **Todos veem e editam os mesmos dados em tempo real!**

> ⚡ O PC servidor precisa estar ligado para os outros acessarem.

---

## FUNCIONALIDADES

| Funcionalidade | Descrição |
|---|---|
| **Abas ARCOS / AGENCIANDO** | Separação dos registros por seção |
| **Filtro por data** | Navegue entre os dias com as setas ou o calendário |
| **Nova viagem** | Clique em "+ Nova Viagem" para adicionar |
| **Edição rápida** | Dê duplo clique em qualquer célula para editar inline |
| **Edição completa** | Clique no botão ✏ ou botão direito → Editar |
| **Excluir** | Botão ✕ ou botão direito → Excluir |
| **Painel de resumo** | Totais por destino (OSASCO, AMERICANA, SJRP, SOROCABA) |
| **Metas** | Configure as metas por destino na aba "METAS" |
| **Tempo real** | Alterações aparecem em todos os PCs conectados na hora |

---

## CAMPOS DISPONÍVEIS

PLACA · NOME · TIPO (AGREG/FROTA/CARRE) · CARROCERIA · PAMCARD · STATUS  
USUÁRIO · AGENDAMENTO · TELEFONE · FRETE · ORIGEM · DESTINO  
PESO · DT · CT-E · NOTA · Nº PEDÁGIO · VALOR PEDÁGIO · HORAS · OBS

---

## DADOS

- Os dados ficam salvos na pasta `data/` dentro de `frota-app`
- **Faça backup desta pasta regularmente!**
- Formato: `.db` (texto simples, pode abrir no Notepad)

---

## PROBLEMAS COMUNS

**"Outros PCs não conseguem acessar"**  
→ Verifique se o Firewall do Windows está bloqueando a porta 3000  
→ Vá em: Painel de Controle → Firewall → Permitir app → Adicionar porta 3000

**"A página não carrega"**  
→ Verifique se o servidor está rodando (INICIAR.bat aberto)  
→ Confirme que está usando o IP correto da rede (não localhost)

**"Perdi os dados"**  
→ Restaure o backup da pasta `data/`

---

## SUPORTE TÉCNICO

Para dúvidas ou melhorias, entre em contato com o responsável pelo sistema.

**Versão:** 1.0.0  
**Porta padrão:** 3000
