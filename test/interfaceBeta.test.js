const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { settings, readTransport, canRead } = require('../beta/access');
const workspace = require('../beta/workspace');
const { fromTable, poolSettings } = require('../beta/pg-reader');

test('pooler exige TLS, host do Supabase e usuário dedicado', () => {
  const url = new URL('https://mockproject.supabase.co');
  const env = { BETA_POOLER_HOST: 'aws-0-test.pooler.supabase.com', BETA_READER_PASSWORD: 'fixture' };
  const config = poolSettings(env, url);
  assert.equal(config.user, 'frotasys_beta_reader.mockproject');
  assert.equal(config.port, 5432);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.throws(() => poolSettings({ ...env, BETA_POOLER_HOST: 'example.invalid' }, url));
  assert.throws(() => poolSettings({ ...env, BETA_READER_PASSWORD: '' }, url));
});

test('consultas da programação parametrizam valores e preservam projeção, ordem e limites', async () => {
  const calls = [];
  const pool = { query: async (sql, args) => { calls.push({sql,args}); return {rows:[]}; } };
  const table = fromTable(pool, 'viagens');
  assert.throws(() => fromTable(pool, 'pg_authid'));
  assert.throws(() => table.select('senha'));
  assert.equal(table.update, undefined);
  const q = table.select('data:dados->>data').eq('id','fixture').in('dados->>origem',['ARCOS'])
    .not('dados->>data','is',null).order('dados->>data',{ascending:false}).limit(25);
  assert.deepEqual((await q).data, []);
  assert.deepEqual(calls[0].args, ['fixture',['ARCOS'],25]);
  assert.match(calls[0].sql, /IS NOT NULL ORDER BY .* DESC LIMIT \$3$/);
  assert.equal((await table.select('id').maybeSingle()).data, null);
  assert.equal((await fromTable({ query: async () => ({rows:[{total:'7'}]}) },'viagens')
    .select('id',{count:'exact',head:true})).count, 7);
});

test('a composição da beta conserva os controles da interface original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  for (const [, id] of page.matchAll(/\bid="([^"]+)"/g)) assert.ok(result.includes('id="' + id + '"'), id);
  for (const [, target] of result.matchAll(/href="#(workspace-[^"]+|summary-arcos)"/g)) {
    assert.ok(result.includes('id="' + target + '"'), target);
  }
  assert.ok(result.includes('class="workspace-beta"'));
  const ids = [...result.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'cada controle deve ter um único id');
  for (const id of ['collapseNav', 'tableSearch', 'tabs', 'summaryMetrics', 'progressTrack', 'summaryBody', 'toggleCompleted', 'completedContent', 'table-concluidos', 'tbody-concluidos', 'countCompleted']) {
    assert.ok(ids.includes(id), id);
  }
  assert.doesNotMatch(result, /demoTargets|Modo demo|Dados demonstrativos/);
  assert.doesNotMatch(page, /workspace-reference\.css|workspace-beta\.js|beta-shell/);
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

test('a beta classifica viagens pela nota e conclusão sem depender da seção legada', () => {
  const { classify, hasInvoice } = require('../public/js/workspace-trip-sections');
  const pending = { secao:'arcos', status:'AGUARDANDO CARREGAMENTO', nota:'  ' };
  assert.equal(classify(pending), 'agenciando');
  assert.equal(classify({ ...pending, secao:'agenciando', nota:'12345' }), 'arcos');
  assert.equal(classify({ ...pending, status:'CONCLUÍDO', nota:'12345' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'CONCLUIDO' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'PROGRAMAR', nota:'12345' }), 'arcos');
  assert.equal(classify({ ...pending, nota:null }), 'agenciando');
  assert.equal(classify({ ...pending, nota:12345 }), 'arcos');
  assert.equal(hasInvoice({ nota:'  ' }), false);
  assert.equal(hasInvoice({ nota:'00123' }), true);
});

test('a tabela de concluídos inicia recolhida e preserva a estrutura original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  assert.match(result, /id="toggleCompleted" aria-expanded="false" aria-controls="completedContent"/);
  assert.match(result, /id="completedContent" hidden/);
  assert.ok(result.indexOf('countBooked') < result.indexOf('countBilled'));
  assert.ok(result.indexOf('countBilled') < result.indexOf('countCompleted'));
  assert.ok(result.indexOf('/js/workspace-trip-sections.js') < result.indexOf('/js/workspace-beta.js'));
  assert.doesNotMatch(page, /table-concluidos/);
});

test('modo de escrita exige opt-in e credencial privada do projeto correto', () => {
  const { betaMode, validateEditableConfig, persistedSection } = require('../beta/mode');
  const jwt = claims => 'a.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.b';
  const env = { SUPABASE_URL:'https://mockproject.supabase.co', BETA_USER_ID:'11111111-1111-1111-1111-111111111111',
    SUPABASE_ANON_KEY:jwt({role:'anon',ref:'mockproject'}), BETA_WRITE_SERVICE_ROLE:jwt({role:'service_role',ref:'mockproject'}) };
  assert.equal(betaMode(env), 'readonly');
  assert.equal(betaMode({...env,BETA_ENABLE_WRITES:'true'}), 'editable');
  assert.equal(betaMode({...env,BETA_ENABLE_WRITES:'false'}), 'readonly');
  assert.ok(validateEditableConfig(env));
  for (const override of [{BETA_USER_ID:''},{BETA_WRITE_SERVICE_ROLE:''},{BETA_WRITE_SERVICE_ROLE:env.SUPABASE_ANON_KEY},
    {BETA_WRITE_SERVICE_ROLE:jwt({role:'service_role',ref:'wrong'})},{SUPABASE_URL:'https://example.invalid'}]) {
    assert.throws(() => validateEditableConfig({...env,...override}));
  }
  assert.equal(persistedSection({nota:'  '}), 'agenciando');
  assert.equal(persistedSection({nota:'123',status:'CONCLUIDO'}), 'arcos');
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(workspace(page), /data-beta-mode="readonly"/);
  assert.match(workspace(page,{editable:true}), /data-beta-mode="editable"/);
});

test('comentarios independentes registram autoria e resolver exclui apenas o comentario selecionado', () => {
  const { applyCommentAction } = require('../beta/trip-comments');
  let counter = 0;
  const opts = {uuid:()=>String(++counter),now:()=> '2026-11-26T12:00:00.000Z'};
  const a = {id:'a',name:'Operador A',role:'operador'};
  const b = {id:'b',name:'Operador B',role:'admin'};
  let items = applyCommentAction([], {action:'create',text:' Agendar ',authorName:'Falso'},a,opts);
  const threadId = items[0].id, messageId = items[0].messages[0].id;
  assert.equal(items[0].messages[0].text,'Agendar');
  assert.equal(items[0].messages[0].authorName,'Operador A');
  assert.throws(()=>applyCommentAction(items,{action:'edit',threadId,messageId,text:'alterado'},b,opts),{status:403});
  const edited = applyCommentAction(items,{action:'edit',threadId,messageId,text:'Agendar descarga'},a,opts);
  assert.equal(items[0].messages[0].text,'Agendar');
  assert.equal(edited[0].messages[0].text,'Agendar descarga');
  assert.throws(()=>applyCommentAction(edited,{action:'reply',threadId,text:'Agendado'},b,opts),{status:400});
  items = applyCommentAction(edited,{action:'create',text:'Outra pendencia'},b,opts);
  assert.equal(items.length,2);
  const resolved = applyCommentAction(items,{action:'resolve',threadId},b,opts);
  assert.equal(resolved.length,1);
  assert.equal(resolved[0].messages[0].text,'Outra pendencia');
  assert.equal(items.length,2);
  assert.throws(()=>applyCommentAction(resolved,{action:'edit',threadId,messageId,text:'x'},a,opts),{status:404});
  assert.throws(()=>applyCommentAction(items,{action:'create',text:' '},a,opts),{status:400});
  assert.throws(()=>applyCommentAction(items,{action:'create',text:'x'},{...a,role:'visualizador'},opts),{status:403});
  assert.equal(applyCommentAction(resolved,{action:'resolve',threadId:resolved[0].id},b,opts).length,0);
});

test('exclusao manual conserva permissoes e conversas legadas ja resolvidas', () => {
  const { applyCommentAction } = require('../beta/trip-comments');
  let n=0;
  const options={uuid:()=>String(++n),now:()=> '2026-11-26T12:00:00Z'};
  const a={id:'a',name:'A',role:'operador'}, b={id:'b',name:'B',role:'operador'}, admin={id:'admin',name:'Admin',role:'admin'};
  const items=applyCommentAction([],{action:'create',text:'Agendar'},a,options);
  const threadId=items[0].id, messageId=items[0].messages[0].id;
  items[0].messages.push({id:'legacy-reply',authorId:'b',authorName:'B',text:'Agendado',createdAt:options.now()});
  assert.throws(()=>applyCommentAction(items,{action:'delete',threadId,messageId},b,options),{status:403});
  assert.throws(()=>applyCommentAction(items,{action:'delete-thread',threadId},a,options),{status:403});
  assert.equal(applyCommentAction(items,{action:'delete',threadId,messageId},a,options)[0].messages.length,1);
  assert.equal(applyCommentAction(items,{action:'delete-thread',threadId},admin,options).length,0);
  assert.equal(applyCommentAction(items,{action:'resolve',threadId},b,options).length,0);
  const legacy=[{...items[0],resolvedAt:options.now()}];
  assert.throws(()=>applyCommentAction(legacy,{action:'delete-thread',threadId},admin,options),{status:409});
  const active=applyCommentAction(legacy,{action:'create',text:'Nova pendencia'},a,options);
  assert.equal(active.length,2);
  assert.equal(active[0].resolvedAt,options.now());
  assert.equal(items[0].messages.length,2);
});

test('janela nao oferece respostas nem mostra comentarios resolvidos antigos', () => {
  const script=fs.readFileSync(path.join(__dirname,'../public/js/workspace-comments.js'),'utf8');
  assert.doesNotMatch(script,/form\('reply'|Responder\.\.\.|beta-comment-resolved/);
  assert.match(script,/comentariosBeta\.filter\(thread => !thread\.resolvedAt\)/);
  assert.match(script,/action:'resolve',threadId:thread\.id/);
});

test('cores da linha possuem lista fechada e compatibilidade com marca amarela antiga', () => {
  const {rowColorPatch,COLORS}=require('../beta/trip-row-color');
  assert.deepEqual(COLORS,['orange','yellow','blue','pink']);
  for(const color of COLORS) assert.deepEqual(rowColorPatch(color),{corLinhaBeta:color,marcadoAmarelo:color==='yellow'});
  assert.deepEqual(rowColorPatch(''),{corLinhaBeta:'',marcadoAmarelo:false});
  for(const color of ['red','#fff',null,undefined,{},'__proto__']) assert.throws(()=>rowColorPatch(color));
});

test('o menu da placa conserva as opcoes de escrita visiveis, sem contornar permissoes', () => {
  const script=fs.readFileSync(path.join(__dirname,'../public/js/workspace-comments.js'),'utf8');
  assert.match(script,/menu.classList.toggle\('beta-plate-context',visible\)/);
  assert.match(script,/\[detailsItem,obsItem,viewItem,addItem,colorItem\]/);
  assert.match(script,/function writeMenuAction\(action\) \{\s*if \(!canWrite\(\)\)/);
  assert.match(script,/item.setAttribute\('aria-disabled',String\(!writable\)\)/);
  assert.match(script,/menuLabel\(el\('div','ctx-item'\),'add','Adicionar comentário'\)/);
});

test('ate 15 notas fiscais, sem lacunas ou duplicidades internas, preservando nota principal',()=>{
  const {FIELDS,invoicePatch,invoiceEntries}=require('../beta/trip-invoices');
  assert.equal(FIELDS.length,15);
  assert.deepEqual(invoicePatch({nota:'123.456'},{nota2:'234567'}),{nota2:'234.567'});
  assert.deepEqual(invoicePatch({nota:'123.456',nota2:'234.567'},{nota:''}),{nota:'234.567',nota2:''});
  assert.throws(()=>invoicePatch({nota:'123.456'},{nota2:'123456'}),/repetida/);
  assert.throws(()=>invoicePatch({},{nota16:'123'}),/15/);
  assert.throws(()=>invoicePatch({},{nota2:{}}),/invalido/);
  assert.equal(invoiceEntries(Object.fromEntries(FIELDS.map((key,i)=>[key,String(i+1)]))).length,15);
});
test('cadastro efetuado libera o status sem alterar as demais regras',()=>{
  const {calculateTripStatus}=require('../tripStatus');
  const trip={status:'SEM CADASTRO',pamcard:'',dt:'123',programado:false};
  assert.equal(calculateTripStatus(trip),'SEM CADASTRO / DT CRIADA');
  assert.equal(calculateTripStatus({...trip,pamcard:'PAMCARD OK'}),'ENVIAR PEDIDO');
  assert.equal(calculateTripStatus({...trip,pamcard:'PAMCARD OK',programado:true}),'AGUARDANDO CARREGAMENTO');
  assert.equal(calculateTripStatus({...trip,pamcard:'PAMCARD OK',nota:'456',num_pedagio:'789'}),'EMITIR CTE');
});
test('agendamento verde tem estilo na tabela beta e palete usa uma unica gravacao',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  assert.match(css,/td\[data-field="agendamento"\]\.has-agendamento/);
  assert.match(js,/agendamento:isPalete\?'':'PALETE',agendamentoVerde:!isPalete/);
});

test('filtro tipo usa modalidade normalizada e combina com os demais filtros',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  assert.match(js,/tipo: 'Tipo', status: 'Status'/);
  assert.match(js,/if \(field === 'tipo'\) return normalizeTipo\(viagem.tipo\)/);
});

test('layout beta reserva largura de trabalho, acoes e tipo e ajusta largura minima',()=>{
  const {layout}=require('../public/js/workspace-table-layout');
  const normal=layout(['placa','nome','tipo','origem','destino','peso','agendamento','status','trabalho','actions']);
  assert.equal(normal.columns.length,10);
  assert.equal(normal.columns[8],'144px');
  assert.equal(normal.columns[9],'76px');
  assert.equal(normal.columns[2],'108px');
  assert.equal(normal.columns[7],'var(--beta-status-column)');
  assert.equal(normal.minWidth,'calc(945px + var(--beta-status-column))');
  const extra=layout(['placa','nome','tipo','origem','destino','peso','agendamento','nota','status','trabalho','actions']);
  assert.equal(extra.minWidth,'calc(1045px + var(--beta-status-column))');
  assert.equal(layout(['placa','actions']).minWidth,'calc(167px)');
});
test('acoes beta preservam controles e substituem apenas seu conteudo visual',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/control\.innerHTML=.*beta-action-icon/);
  assert.match(js,/decorateActions\(row\)/);
  assert.match(css,/\.work-cell \{[^}]*text-overflow:clip/);
});
