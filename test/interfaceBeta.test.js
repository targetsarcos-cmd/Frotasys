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
  for (const id of ['collapseNav', 'tableSearch', 'tabs', 'summaryMetrics', 'progressTrack', 'summaryBody', 'toggleCompleted', 'completedContent', 'table-concluidos', 'tbody-concluidos']) {
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

test('a beta classifica viagens por documentos, horas e conclusão sem depender da seção legada', () => {
  const { classify, hasInvoice } = require('../public/js/workspace-trip-sections');
  const pending = { secao:'arcos', status:'AGUARDANDO CARREGAMENTO', nota:'  ' };
  assert.equal(classify(pending), 'agenciando');
  assert.equal(classify({ ...pending, secao:'agenciando', nota:'12345' }), 'agenciando');
  assert.equal(classify({ ...pending, status:'CONCLUÍDO', nota:'12345' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'CONCLUIDO' }), 'concluidos');
  assert.equal(classify({ ...pending, status:'PROGRAMAR', nota:'12345' }), 'agenciando');
  assert.equal(classify({ ...pending, nota:null }), 'agenciando');
  assert.equal(classify({ ...pending, nota:12345 }), 'agenciando');
  assert.equal(hasInvoice({ nota:'  ' }), false);
  assert.equal(hasInvoice({ nota:'00123' }), true);
});

test('a tabela de concluídos inicia recolhida e preserva a estrutura original', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const result = workspace(page);
  assert.match(result, /id="toggleCompleted" aria-expanded="false" aria-controls="completedContent"/);
  assert.match(result, /id="completedContent" hidden/);
  assert.ok(result.indexOf('booked-section') < result.indexOf('billed-section'));
  assert.ok(result.indexOf('billed-section') < result.indexOf('completed-section'));
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
  assert.equal(calculateTripStatus({...trip,pamcard:'PAMCARD OK'}),'PROGRAMAR');
  assert.equal(calculateTripStatus({...trip,pamcard:'PAMCARD OK',programado:true}),'ENVIAR PEDIDO');
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

test('layout beta inclui produto e reserva largura dos controles',()=>{
  const {layout}=require('../public/js/workspace-table-layout');
  const keys=['placa','nome','tipo','origem','destino','produto','peso','agendamento','status','trabalho','actions'];
  const normal=layout(keys);
  assert.equal(normal.columns.length,11);
  assert.equal(normal.columns[9],'132px');
  assert.equal(normal.columns[10],'72px');
  assert.equal(normal.columns[2],'104px');
  assert.equal(normal.columns[8],'var(--beta-status-column)');
  assert.equal(normal.minWidth,'calc(941px + var(--beta-status-column))');
  assert.equal(layout([...keys,'nota']).minWidth,'calc(1041px + var(--beta-status-column))');
  assert.equal(layout(['placa','actions']).minWidth,'calc(157px)');
});
test('produto e fixo apos destino somente na beta e nao duplica preferencias antigas',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const base=js.slice(js.indexOf('const BASE_FIELDS ='),js.indexOf('const FIELDS = BASE_FIELDS;'));
  const helpers=js.slice(js.indexOf('function optionalTableFields()'),js.indexOf('function allSortableTableFields()'));
  const get=(state,isBetaTripWorkspace)=>new Function('state','isBetaTripWorkspace','window',base+helpers+';return {visibleTableFields,optionalTableFields};')(state,isBetaTripWorkspace,{FrotasysBetaTableLayout:require('../public/js/workspace-table-layout')});
  const beta=get({additionalColumns:['produto','frete']},()=>true);
  const keys=beta.visibleTableFields().map(f=>f.key);
  assert.equal(keys.indexOf('produto'),keys.indexOf('destino')+1);
  assert.equal(keys.filter(key=>key==='produto').length,1);
  assert.ok(keys.includes('frete'));
  assert.ok(!beta.optionalTableFields().some(f=>f.key==='produto'));
  const classic=get({additionalColumns:[]},()=>false);
  assert.ok(!classic.visibleTableFields().some(f=>f.key==='produto'));
  assert.ok(classic.optionalTableFields().some(f=>f.key==='produto'));
});
test('acoes beta preservam controles e substituem apenas seu conteudo visual',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/control\.innerHTML=.*beta-action-icon/);
  assert.match(js,/decorateActions\(row\)/);
  assert.match(css,/\.work-cell \{[^}]*text-overflow:clip/);
});

test('cada nota tem hora individual e a compactacao preserva os pares',()=>{
  const {FIELDS,TIME_FIELDS,invoicePatch}=require('../beta/trip-invoices');
  assert.equal(TIME_FIELDS.length,15);
  assert.equal(TIME_FIELDS[14],'hora_nf15');
  assert.deepEqual(invoicePatch({nota:'100',nota2:'200'},{hora_nf2:'8:05'}),{hora_nf2:'08:05'});
  assert.deepEqual(invoicePatch({nota:'100',hora_nf:'12:00',nota2:'200',hora_nf2:'13:15'},{nota:''}),{nota:'200',hora_nf:'13:15',nota2:'',hora_nf2:''});
  assert.deepEqual(invoicePatch({nota:'100',hora_nf:'12:00',nota2:'200',hora_nf2:'13:15'},{nota2:''}),{nota2:'',hora_nf2:''});
  assert.deepEqual(invoicePatch({nota:'100',hora_nf:'12:00'},{nota:''}),{nota:'',hora_nf:''});
  assert.deepEqual(invoicePatch({},{hora_nf:'12:00'}),{hora_nf:'12:00'});
  assert.throws(()=>invoicePatch({nota:'100'},{hora_nf2:'12:00'}),/Preencha/);
  for(const value of ['25:00','10:60','abc',{}])assert.throws(()=>invoicePatch({nota:'100'},{hora_nf:value}),/invalida/);
  assert.throws(()=>invoicePatch({},{hora_nf16:'10:00'}),/15/);
});
test('drawer beta renderiza nota e hora juntas para as 15 posicoes',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const block=js.slice(js.indexOf('const BETA_INVOICE_FIELDS='),js.indexOf('function renderDrawerAgendamento()'));
  const get=new Function('state','selectedViagem','drawerField','canEditDrawerViagem','isBetaTripWorkspace',block+';return {renderBetaInvoiceRow,renderBetaExtraInvoices};');
  const api=get({drawerActiveField:'nota2'},()=>({nota:'100'}),(key,label,type)=>key+':'+label+':'+type+';',()=>true,()=>true);
  assert.match(api.renderBetaInvoiceRow(0),/nota:Nota Fiscal:undefined;hora_nf:Hora NF:time/);
  assert.match(api.renderBetaExtraInvoices().join(''),/nota2:Nota Fiscal 2:undefined;hora_nf2:Hora NF:time/);
  assert.match(api.renderBetaInvoiceRow(14),/nota15:Nota Fiscal 15:undefined;hora_nf15:Hora NF:time/);
});

test('secoes beta nao exibem contadores nos titulos nem rodape de contagem',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const shell=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  assert.doesNotMatch(shell,/id="count(?:Booked|Billed|Completed)"/);
  assert.doesNotMatch(js,/countBooked|countBilled|countCompleted|countId/);
  assert.doesNotMatch(js,/footCount|collapsedCompleted/);
  assert.doesNotMatch(shell,/id="footCount"|<div class="footer">/);
  assert.match(shell,/id="toggleCompleted"/);
});

test('relatorios beta usam pagina isolada, referencia original e dados autenticados',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/beta-reports.html'),'utf8');
  const bridge=fs.readFileSync(path.join(__dirname,'../public/js/beta-reports-bridge.js'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/beta-reports-reference.js'),'utf8');
  assert.match(html,/beta-reports-reference\.css/);
  assert.match(html,/class="workspace is-empty"/);
  assert.doesNotMatch(html,/const destinations=|Nenhum dado disponível na demonstração/);
  assert.match(bridge,/buildReportsData\(viagens,metas/);
  assert.match(bridge,/apiFetch\('\/api\/viagens\/search/);
  assert.match(js,/bridge\.load\(filters\)/);
});


test('drawer beta compacto usa largura compartilhada e cards em coluna unica', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/workspace-beta.css'), 'utf8');
  assert.match(css, /--beta-drawer-width:min\(350px,100vw\)/);
  assert.match(css, /margin-right:var\(--beta-drawer-width\)/);
  assert.match(css, /#travel-drawer\.is-open\s*\{\s*width:var\(--beta-drawer-width\);min-width:0/);
  assert.match(css, /\.drawer-card-grid\.single\s*\{\s*display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.beta-invoice-row\s*\{\s*grid-template-columns:minmax\(0,1fr\) minmax\(0,105px\)/);
  assert.match(css, /\.drawer-footer-date \.drawer-field > strong\s*\{[^}]*white-space:nowrap/);
});


test('resumo operacional destaca meta e total sem rotulo de volume',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/key==='total'\?'total-row':key==='meta'\?'meta-row'/);
  assert.match(js,/<th scope="col" aria-label="Indicador"><\/th>/);
  assert.doesNotMatch(js,/<th>Volume \(kg\)<\/th>/);
  assert.match(css,/tr:is\(\.meta-row,\.total-row\) > td\s*\{\s*background:var\(--beta-navy\);color:#fff/);
});


test('pagina de relatorios beta e servida como HTML inline antes dos arquivos estaticos', async () => {
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const bridge=fs.readFileSync(path.join(__dirname,'../public/js/beta-reports-bridge.js'),'utf8');
  const start=server.indexOf("  app.get(['/beta/relatorios', '/beta-reports.html']");
  assert.ok(start>=0 && start<server.indexOf('app.use(staticGzipMiddleware('));
  assert.match(server,/res\.type\(ext\);/);
  assert.doesNotMatch(server,/res\.type\(filePath\);/);
  assert.match(bridge,/frame\.src='\/beta\/relatorios'/);
  const block=server.slice(start,server.indexOf('\n  });',start)+6);
  let handler,routes;
  const app={get:(paths,fn)=>{routes=paths;handler=fn;}};
  const html='<!DOCTYPE html><html><body>Relatorios</body></html>';
  new Function('app','fs','path','__dirname',block)(app,{readFile:async()=>html},path,path.join(__dirname,'..'));
  const headers={};
  const res={type(v){headers.type=v;return this;},set(k,v){headers[k]=v;return this;},send(v){headers.body=v;return this;}};
  await handler({},res);
  assert.deepEqual(routes,['/beta/relatorios','/beta-reports.html']);
  assert.equal(headers.type,'html');
  assert.equal(headers['Content-Disposition'],'inline');
  assert.equal(headers['Cache-Control'],'no-store');
  assert.equal(headers.body,html);
});

test('beta ordena abas pelo fluxo operacional sem filtro de concluidos', () => {
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const start=js.indexOf('  const statusTabOrder = [');
  const end=js.indexOf('  function paintRows()',start);
  assert.ok(start>=0 && end>start);
  const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const build=new Function('normalizeOption','viagemStatusDisplay',js.slice(start,end)+'return buildStatusTabCounts;')(normalize,trip=>trip.status);
  const trips=statuses=>statuses.map(status=>({status}));
  assert.deepEqual([...build(trips(['CONCLUIDO','ADIANTAMENTO / DESCARGA',...Array(5).fill('AGUARDANDO CARREGAMENTO')]))],
    [['all',7],['AGUARDANDO CARREGAMENTO',5],['ADIANTAMENTO / DESCARGA',1]]);
  const order=['CONFERIR MOTORISTA','SEM CADASTRO','SEM CADASTRO / DT CRIADA','CRIAR DT / PROGRAMAR','CRIAR DT','PROGRAMAR','ENVIAR PEDIDO','AGUARDANDO CARREGAMENTO','EMITIR CTE','HORA NF','ADIANTAMENTO / DESCARGA','ADIANTAMENTO','AGENDAR DESCARGA'];
  assert.deepEqual([...build(trips(['CUSTOM','CONCLUÍDO',...order.slice().reverse()])).keys()],['all',...order,'CUSTOM']);
  assert.deepEqual([...build(trips(['CONCLUÍDO']))],[['all',1]]);
  assert.deepEqual([...build([])],[['all',0]]);
  assert.match(js,/if \(!counts\.has\(tab\)\) tab = 'all';/);
  assert.match(js,/tabs\.insertBefore\(button, tabs\.children\[tabPosition\] \|\| null\)/);
  assert.match(js,/setCompletedExpanded\(!completedExpanded\)/);
});

test('chevron de expandir concluidos usa viewBox e gira ao recolher',()=>{
  const shell=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const button=shell.match(/<button\b[^>]*id="toggleCompleted"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button,/<svg\b[^>]*viewBox="0 0 24 24"/);
  assert.match(button,/<path d="m6 9 6 6 6-6"\/>/);
  assert.match(css,/\.completed-toggle svg\s*\{[^}]*width:15px;height:15px/);
  assert.match(css,/\.completed-toggle\[aria-expanded=true\] svg\s*\{transform:rotate\(180deg\)/);
});

test('consulta frete beta separa rotas sem desagrupar categorias e eixos',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-fretes.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const routes=[{rota:'ARCOS X AMERICANA',agregado:[{eixos:5,pj:1,pf:2}],rows:[{eixos:5,pj:3,pf:4},{eixos:6,pj:5,pf:6}]},{rota:'ARCOS X OSASCO',rows:[{eixos:7,pj:7,pf:8}]}];
  const render=new Function('freteRoutes','formatFreteAccounting','escapeAttr','escapeHtml',js.slice(js.indexOf('function renderBetaFreteBoard'))+'return renderBetaFreteBoard;')(()=>routes,String,String,String);
  const html=render(routes);
  assert.equal((html.match(/class="rate-route"/g)||[]).length,2);
  assert.equal((html.match(/class="rate-gap"/g)||[]).length,1);
  assert.match(html,/rowspan="2"/);
  assert.match(html,/data-rate-group="agregado"/);
  assert.match(html,/data-rate-group="rows"/);
  assert.doesNotMatch(render([]),/class="rate-gap"/);
  assert.doesNotMatch(render([routes[0]]),/class="rate-gap"/);
  assert.match(css,/\.rate-gap td\s*\{height:12px;padding:0;border:0;background:transparent/);
  assert.match(css,/\.rate-table\s*\{[^}]*border-collapse:separate;border-spacing:0/);
  assert.equal((html.match(/<td class="rate-category-gap" aria-hidden="true">/g)||[]).length,6);
  assert.equal((html.match(/<th class="rate-category-gap" rowspan="2" aria-hidden="true">/g)||[]).length,2);
  assert.equal((html.match(/<col(?: |>)/g)||[]).length,9);
  assert.match(html,/rate-agregado-title" scope="colgroup" colspan="3">Agregado/);
  assert.match(html,/rate-terceiros-title" scope="colgroup" colspan="3">Terceiros/);
  assert.match(html,/class="rate-gap" aria-hidden="true"><tr><td colspan="9">/);
  assert.match(render([]),/colspan="9">Nenhuma rota/);
  assert.match(js,/cell\.classList\.contains\('rate-category-gap'\)/);
  assert.match(css,/\.rate-gap-col\s*\{width:14px\}/);
  assert.match(css,/\.rate-category-gap\s*\{width:14px;min-width:14px;max-width:14px;padding:0;border:0/);
  assert.match(css,/\.rate-agregado-title\s*\{background:#f8e8b0;color:#6b4c08/);
  assert.match(css,/\.rate-terceiros-title\s*\{background:#f6d3d4;color:#842d36/);
  assert.match(css,/\.rate-route-title button\s*\{color:#fff;font-size:14px/);
  assert.match(css,/\.rate-route th\[scope=rowgroup\]\s*\{[^}]*background:#e4edf4;[^}]*border-radius:7px;color:#173950;font-size:14px/);
  assert.match(css,/\.rate-agregado-title\s*\{[^}]*border-top-left-radius:7px/);
  assert.match(css,/\.rate-field-first\s*\{[^}]*border-bottom-left-radius:7px/);
  assert.match(css,/\.rate-route-title\s*\{background:var\(--beta-navy\);color:#fff/);
  assert.match(css,/tr:first-child \.rate-category-gap \+ td\s*\{border-top-left-radius:7px/);
  assert.match(css,/tr:last-child \.rate-category-gap \+ td\s*\{border-bottom-left-radius:7px/);
});

test('consulta rapida beta compara PF e PJ de agregado e terceiros sem inventar valores',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-fretes.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const extract=(source,start,end)=>source.slice(source.indexOf('function '+start+'('),source.indexOf('function '+end+'('));
  const accounting=extract(app,'formatFreteAccounting','freteOriginTone');
  const render=new Function('escapeHtml',accounting+extract(js,'renderBetaFreteQueryResult','renderBetaFreteBoard')+'return renderBetaFreteQueryResult;')(String);
  const route={agregado:[{eixos:7,pf:0,pj:null},{eixos:9,pf:5500,pj:5400}],rows:[{eixos:7,pf:5166,pj:5026},{eixos:5,pf:4000,pj:3900}]};
  const h=render(route,7);
  assert.equal((h.match(/Pessoa Física/g)||[]).length,2);
  assert.equal((h.match(/Pessoa Jurídica/g)||[]).length,2);
  assert.match(h,/beta-rate-result-agregado/);
  assert.match(h,/beta-rate-result-rows/);
  assert.match(h,/R\$\s*0,00/);
  assert.match(h,/R\$\s*5\.166,00/);
  assert.match(h,/R\$\s*5\.026,00/);
  assert.equal((h.match(/Não cadastrado/g)||[]).length,1);
  assert.equal((render(route,9).match(/Não cadastrado/g)||[]).length,2);
  assert.equal((render(route,6).match(/Não cadastrado/g)||[]).length,4);
  assert.match(render(undefined,7),/Nenhuma rota/);
  const axes=new Function('isBetaTripWorkspace','freteRoutes','freteQueryGroup',extract(app,'freteEixosOptions','updateFreteQueryDestinations')+'return freteEixosOptions();');
  assert.deepEqual(axes(()=>true,()=>[route],()=>'rows'),[5,7,9]);
  assert.deepEqual(axes(()=>false,()=>[route],()=>'rows'),[5,7]);
  const panel=new Function('isBetaTripWorkspace','renderOptions','freteOriginOptions','freteEixosOptions',extract(app,'renderFreteQueryPanel','renderFreteRouteBoard')+'return renderFreteQueryPanel();');
  assert.doesNotMatch(panel(()=>true,()=>'',()=>[],()=>[]),/frete-query-group/);
  const result={innerHTML:''};
  const document={getElementById:id=>({'frete-query-origem':{value:'ARCOS'},'frete-query-destino':{value:'OSASCO'},'frete-query-eixo':{value:'7 Eixos'},'frete-query-result':result}[id])};
  const query=new Function('document','normalizeOption','freteRoutes','isBetaTripWorkspace','renderBetaFreteQueryResult',extract(app,'consultarFreteValor','scheduleMetaGoalAlert')+'consultarFreteValor();');
  query(document,String,()=>[{...route,origem:'ARCOS',destino:'OSASCO'}],()=>true,render);
  assert.equal(result.innerHTML,h);
  assert.match(css,/\.beta-rate-result-agregado h4\s*\{background:#f8e8b0/);
  assert.match(css,/\.beta-rate-result-rows h4\s*\{background:#f6d3d4/);
  assert.match(css,/\.frete-query-form\s*\{display:grid;grid-template-columns:repeat\(3,/);
});

test('lembrete beta mantem editor original, salvamento e painel nao modal',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  for(const [id,variable,slot] of [['reminder-text','reminderText','text'],['reminder-status','reminderStatus','status'],['reminder-note-close','reminderClose','close']]){
    assert.ok(js.includes("const "+variable+" = byId('"+id+"');"));
    assert.ok(js.includes("reminderPanel.querySelector('.beta-reminder-"+slot+"-slot').append("+variable+");"));
  }
  assert.match(app,/if \(state\.lembreteOpen && !isBetaTripWorkspace\(\) && !e\.target\.closest\('\.header-reminder'\)\)/);
  assert.match(app,/setTimeout\(\(\) => saveReminder\(texto\), 450\)/);
  assert.match(app,/if \(isBetaTripWorkspace\(\) && typeof syncBetaReminderPanel === 'function'\) syncBetaReminderPanel\(hasReminderContent\(state\.lembrete\.texto\)\)/);
  let hidden=true,expanded,bodyOpen;
  const input={value:'ABC'};
  const count={textContent:''};
  const panel={classList:{contains:key=>key==='hidden'&&hidden}};
  const attrs={};
  const nav={setAttribute:(key,value)=>{attrs[key]=value;if(key==='aria-expanded')expanded=value;}};
  const document={getElementById:id=>({'reminder-note':panel,'reminder-text':input,'beta-reminder-count':count}[id]),querySelector:()=>nav,body:{classList:{toggle:(key,value)=>{assert.equal(key,'beta-reminder-open');bodyOpen=value;}}}};
  const sync=new Function('document',js.slice(js.indexOf('function syncBetaReminderPanel(hasContent)'))+'return syncBetaReminderPanel;')(document);
  sync();
  assert.equal(expanded,'false');
  assert.equal(bodyOpen,false);
  assert.equal(count.textContent,'3 / 2.000 caracteres');
  hidden=false; input.value='ABCD';
  sync();
  assert.equal(expanded,'true');
  assert.equal(bodyOpen,true);
  assert.equal(count.textContent,'4 / 2.000 caracteres');
  assert.equal(attrs['data-has-reminder'],'true');
  assert.match(attrs['aria-label'],/há um recado/);
  hidden=true;input.value=' \n ';
  sync();
  assert.equal(attrs['data-has-reminder'],'false');
  assert.equal(attrs.title,'Lembretes');
  sync(true);
  assert.equal(attrs['data-has-reminder'],'true');
  input.value='Texto local';
  sync(false);
  assert.equal(attrs['data-has-reminder'],'false');
  assert.match(app,/syncBetaReminderPanel\(hasReminderContent\(texto\)\)/);
  assert.match(css,/\[data-has-reminder=true\] svg \.beta-reminder-bell-dot \{opacity:1\}/);
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  assert.match(html,/<circle class="beta-reminder-bell-dot"/);
  assert.match(css,/#reminder-note\.hidden\s*\{display:none\}/);
  assert.match(css,/#reminder-note\s*\{position:fixed;inset:var\(--shell,64px\) 0 0 auto;transform:none;[^}]*width:min\(420px,100vw\)/);
  assert.match(css,/beta-reminder-open #beta-shell \.workspace\s*\{margin-right:420px\}/);
});

test('menu beta agrupa atalhos operacionais entre dashboard e relatorios',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const nav=html.slice(html.indexOf('<nav class="nav"'),html.indexOf('</nav>'));
  assert.match(nav,/<button id="navHome" title="Dashboard"[^>]*>[\s\S]*?<span>Dashboard<\/span>/);
  const group=nav.match(/<div class="nav-operation-group"[^>]*>[\s\S]*?<div class="nav-operation-submenu">([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(group);
  assert.match(group[0],/aria-label="Controle operacional"/);
  assert.deepEqual([...group[1].matchAll(/data-nav="([^"]+)"/g)].map(m=>m[1]),['Lista de Espera','Lembretes','Consulta Frete']);
  assert.ok(nav.indexOf('id="navHome"')<nav.indexOf('class="nav-operation-group"'));
  assert.ok(nav.indexOf(group[0])+group[0].length<nav.indexOf('data-nav="Relatórios"'));
  assert.ok(nav.indexOf('data-nav="Relatórios"')<nav.indexOf('class="nav-group admin-group"'));
  for(const name of ['Lista de Espera','Lembretes','Consulta Frete','Relatórios','Usuários','Configurações']){
    assert.equal([...nav.matchAll(/data-nav="([^"]+)"/g)].filter(m=>m[1]===name).length,1);
    assert.ok(js.includes("'"+name+"':"));
  }
  assert.match(css,/\.nav-operation-submenu button\s*\{[^}]*min-height:32px;[^}]*font-size:11px/);
  assert.match(css,/\.nav-compact \.app-sidebar \.nav-operation-heading\s*\{display:none\}/);
});

test('Escape fecha drawer beta sem descartar edicao ativa ou salvar em andamento',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const start=app.indexOf('function shouldCloseBetaDrawerOnEscape(');
  const end=app.indexOf('function closeTravelDrawer()',start);
  assert.ok(start>=0 && end>start);
  let beta=true,open=true,modal=false;
  const state={drawerSaving:false,drawerActiveField:'',lembreteOpen:false};
  const document={getElementById:id=>id==='travel-drawer'?{classList:{contains:key=>key==='is-open'&&open}}:null,querySelectorAll:()=>[{classList:{contains:key=>key==='hidden'&&!modal}}]};
  const shouldClose=new Function('isBetaTripWorkspace','state','document',app.slice(start,end)+'return shouldCloseBetaDrawerOnEscape;')(()=>beta,state,document);
  assert.equal(shouldClose({}),true);
  assert.equal(shouldClose({defaultPrevented:true}),false);
  assert.equal(shouldClose({repeat:true}),false);
  open=false; assert.equal(shouldClose({}),false); open=true;
  modal=true; assert.equal(shouldClose({}),false); modal=false;
  state.drawerSaving=true; assert.equal(shouldClose({}),false); state.drawerSaving=false;
  state.drawerActiveField='nota'; assert.equal(shouldClose({}),false); state.drawerActiveField='';
  state.lembreteOpen=true; assert.equal(shouldClose({}),false); state.lembreteOpen=false;
  beta=false; assert.equal(shouldClose({}),false); beta=true;
  assert.equal(shouldClose({}),true);
  assert.match(app,/const closeBetaDrawer = shouldCloseBetaDrawerOnEscape\(e\);/);
  assert.match(app,/if \(closeBetaDrawer\) \{\s*e\.preventDefault\(\);\s*closeTravelDrawer\(\);/);
  assert.match(app,/if \(isBetaTripWorkspace\(\)\) e\.stopPropagation\(\);\s*state\.drawerActiveField = '';/);
});

test('titulo da pagina inicial beta e Dashboard sem renomear submenu',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  assert.match(html,/<h1>Dashboard<\/h1>/);
  assert.match(html,/<div class="shell-location" hidden>[\s\S]*?<strong>Dashboard<\/strong>/);
  assert.match(html,/class="nav-operation-group" role="group" aria-label="Controle operacional"/);
});

test('data beta mostra dia da semana e Hoje somente na data atual',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const start=app.indexOf('function weekdayLabel(');
  const end=app.indexOf('// ─── INIT',start);
  const label={textContent:''},state={currentDate:'2026-11-26'};
  const helpers=new Function('localDateStr','state','document',app.slice(start,end)+'return {weekdayLabel,renderDateWeekday};')(()=> '2026-11-26',state,{getElementById:id=>id==='date-weekday'?label:null});
  const week=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Hoje','Sexta-feira','Sábado'];
  for(let i=0;i<week.length;i++){
    state.currentDate='2026-11-'+(22+i);
    helpers.renderDateWeekday();
    assert.equal(label.textContent,week[i]);
  }
  assert.equal(helpers.weekdayLabel('2026-12-01'),'Terça-feira');
  assert.equal(helpers.weekdayLabel(''),'');
  assert.match(html,/<span class="today" id="today" aria-live="polite">Hoje<\/span>/);
  assert.doesNotMatch(html,/<button[^>]*id="today"/);
  assert.match(js,/adopt\('today','date-weekday',true\)/);
  assert.doesNotMatch(js,/byId\('today'\)\.onclick/);
  assert.match(app,/state\.currentDate = e\.target\.value;\s*if \(isBetaTripWorkspace\(\)\) renderDateWeekday\(\);/);
  assert.match(app,/document\.getElementById\('date-picker'\)\.value = state\.currentDate;\s*if \(isBetaTripWorkspace\(\)\) renderDateWeekday\(\);/);
  assert.match(css,/#date-weekday\s*\{[^}]*cursor:default/);
});

test('busca global beta consulta campos especificos, combina filtros e deduplica',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf('function betaGlobalSearchSpec(');
  const end=server.indexOf("app.get('/api/viagens/search'",start);
  const calls=[];
  const docs=[{_id:'1',data:'2026-11-25',nome:'ROBSON',placa:'DOR3797',nota:'451.168',dt:'104888079',cte:'3.170',contrato:'2.012',frete:'Agendar descarga'},{_id:'2',nome:'JOSE',placa:'AAA1234',nota:'123',frete:'ROBSON'}];
  const digits=v=>String(v||'').replace(/\D/g,'');
  const invoiceEntries=doc=>[{value:doc.nota},{value:doc.nota2}].filter(x=>x.value);
  const select=async(table,query,opts)=>{calls.push({table,query,opts});return docs.filter(d=>Object.entries(opts.in||{}).every(([key,values])=>values.includes(d[key]))&&Object.entries(opts.ilike||{}).every(([key,value])=>String(d[key]||'').toUpperCase().includes(value.toUpperCase())))};
  const helper=new Function('VIAGENS_SEARCH_LIMIT','TABLES','formatDocumentNumber','searchBetaInvoices','selectDocsByJson','betaInvoices','comparableSearchValue',server.slice(start,end)+'return {betaGlobalSearchSpec,searchBetaGlobalTrips,betaGlobalTripMatches};')(200,{viagens:'viagens'},v=>v.replace(/\B(?=(\d{3})+(?!\d))/g,'.'),async v=>docs.filter(d=>digits(d.nota)===digits(v)),select,{invoiceEntries,digits},(k,v)=>digits(v));
  const {betaGlobalSearchSpec:spec,searchBetaGlobalTrips:search,betaGlobalTripMatches:matches}=helper;
  assert.equal(spec('DOR3797').numeric,false);
  assert.equal(spec('DOR-3797').plate,'DOR3797');
  assert.equal(spec('451.168').digits,'451168');
  assert.equal(spec('a'.repeat(200)).text.length,120);
  for(const value of ['451168','3.170','104888079','2012','DOR3797','ROBSON','Agendar descarga']) assert.equal(matches(docs[0],spec(value)),true);
  assert.equal(matches(docs[0],spec('JOSE')),false);
  assert.deepEqual((await search(spec('DOR-3797'),{},{})).map(d=>d._id),['1']);
  assert.deepEqual((await search(spec('451.168'),{},{})).map(d=>d._id),['1']);
  assert.deepEqual((await search(spec('ROBSON'),{},{gte:{data:'2026-11-01'}})).map(d=>d._id),['1','2']);
  assert.ok(calls.some(c=>c.opts.gte?.data==='2026-11-01'));
  assert.ok(calls.every(c=>c.opts.limit===200 && c.opts.order[0].key==='data'));
  assert.match(server,/betaWorkspace \? betaGlobalSearchSpec\(req\.query\.global\) : null/);
  assert.match(server,/globalSearch\?\.text && !betaGlobalTripMatches\(doc,globalSearch\)/);
});
test('interface beta abre busca pelo Enter, preserva termo e exibe tabela com detalhes seguros',async()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const start=app.indexOf('function renderBetaSearchResults('),end=app.indexOf('async function searchCarregamento(',start);
  const escapeHtml=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const render=new Function('escapeHtml','formatSearchValue','SEARCH_RESULT_FIELDS',app.slice(start,end)+'return renderBetaSearchResults;')(escapeHtml,(key,value)=>value??'-',[{key:'frete',label:'EVENTO'},{key:'obs',label:'OBSERVAÇÃO'}]);
  const html=render([{placa:'DOR3797',nome:'<script>',origem:'ARCOS',destino:'SJRP',frete:'evento',obs:'observação'},{placa:'AAA1234'}]);
  assert.match(html,/class="beta-search-table"/);
  assert.match(html,/ARCOS → SJRP/);
  assert.match(html,/&lt;script&gt;/);
  assert.doesNotMatch(html,/<script>/);
  assert.equal((html.match(/data-beta-search-detail aria-expanded="false"/g)||[]).length,2);
  assert.equal((html.match(/class="beta-search-detail-row" id="beta-search-detail-\d+" hidden/g)||[]).length,2);
  assert.match(html,/EVENTO/);
  assert.match(html,/OBSERVAÇÃO/);
  assert.match(js,/byId\('header-search-form'\)\.requestSubmit\(\)/);
  assert.match(app,/searchInput\.value = term;\s*searchInput\.focus\(\);\s*if \(term\) await searchBetaCarregamentos\(\)/);
  assert.match(app,/fetchCarregamentosSearch\(\{\.\.\.filters,global,reportFailure:true\}\)/);
  assert.match(app,/if\(request!==betaSearchRequest\) return/);
  assert.match(app,/if \(isBetaTripWorkspace\(\) && filters\.global\) params\.set\('global', filters\.global\)/);
  assert.match(css,/\.beta-search-table th \{position:sticky;top:0/);
  assert.match(css,/\.beta-search-detail-row\[hidden\] \{display:none!important\}/);
});

test('configuracoes beta reutiliza controles reais em pagina e preserva navegacao',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const nav=fs.readFileSync(path.join(__dirname,'../public/js/workspace-fretes.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(html,/<main class="workspace" id="beta-settings"[^>]*hidden>/);
  assert.match(html,/id="beta-settings-search"/);
  assert.deepEqual([...html.matchAll(/data-settings-tab="([^"]+)"/g)].map(m=>m[1]),['all','catalog','messages','operational']);
  assert.match(nav,/const settingsActive = location.hash === '#configuracoes'/);
  assert.match(nav,/settings.hidden = !settingsActive/);
  assert.match(nav,/active \|\| queueActive \|\| settingsActive/);
  assert.match(nav,/\[settingsNav,settingsActive\]/);
  assert.match(app,/target.append\(body\)/);
  assert.match(app,/primary.append\(profile,body.querySelector\('\.settings-export-section'\),document.getElementById\('settings-operations'\),extra\)/);
  assert.match(app,/if \(document.getElementById\('beta-settings'\)\?\.hidden === false\) renderSettingsModal\(\)/);
  assert.match(app,/if \(location.hash !== '#configuracoes'\) location.hash = 'configuracoes'/);
  assert.match(app,/if\(!isAdmin\(\)\|\|isBetaReadOnly\(\)\)return/);
  assert.match(app,/if\(isBetaReadOnly\(\)\)\{/);
  assert.match(app,/renderBetaStatusSettings\(\)/);
  assert.match(app,/if \(isBetaTripWorkspace\(\)\) return configColor\('status',status \|\| 'STATUS'\)/);
  assert.match(css,/\.beta-settings-overview \{display:grid;grid-template-columns:repeat\(4,/);
  assert.match(css,/\.beta-settings-body \{display:grid;grid-template-columns:repeat\(2,/);
  assert.match(css,/\.settings-list \{max-height:none;overflow:visible/);
  assert.match(app,/data-settings-delete/);
});
test('beta renomeia somente cadastros livres, mantendo id e cor e bloqueando vinculos',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf("app.put('/api/config-options/:field/rename'");
  const end=server.indexOf("app.delete('/api/config-options/:field/:value'",start);
  assert.ok(start>=0&&end>start);
  let handler,editable=true,used=false,linked=false,duplicate=false,conflict=false,missing=false,patch=null;
  const current={_id:'cfg',field:'produto',value:'ANTIGO',normalized:'ANTIGO',ordem:2,color:'#123456',updatedAt:'t'};
  const app={put:(route,guard,fn)=>{assert.equal(route,'/api/config-options/:field/rename');assert.equal(guard,'admin');handler=fn;}};
  const normalize=v=>String(v||'').trim().toUpperCase();
  const run=new Function('app','requireAdmin','TABLES','normalizeUniqueValue','DEFAULT_CONFIG_OPTIONS','findOneByJson','countDocs','selectDocs','updateDoc','configOptionsGrouped','configColorsGrouped','broadcast','editable','return (async function(){const betaEditable=editable();'+server.slice(start,end)+'})()');
  await run(app,'admin',{configOptions:'options',viagens:'trips',operacoes:'ops'},normalize,{tipo:['FROTA'],pamcard:['PAMCARD OK']},async(t,q)=>q.normalized==='ANTIGO'&&!missing?current:q.normalized==='NOVO'&&duplicate?{_id:'other'}:null,async()=>used?1:0,async()=>linked?[{produtos:['ANTIGO']}]:[],async(t,id,value,snapshot)=>{patch={t,id,value,snapshot};return conflict?null:{...current,...value};},async()=>({produto:['NOVO']}),async()=>({produto:{}}),()=>{},()=>editable);
  async function request(field='produto',previous='ANTIGO',value='NOVO'){
    let status=200,data;const res={status(n){status=n;return this},json(v){data=v;return this}};
    await handler({params:{field},body:{previous,value}},res);
    return {status,data};
  }
  assert.equal((await request('status')).status,400);
  assert.equal((await request('origem')).status,400);
  assert.equal((await request('tipo','FROTA')).status,409);
  assert.equal((await request('produto','ANTIGO','')).status,400);
  duplicate=true;assert.equal((await request()).status,409);duplicate=false;
  used=true;assert.equal((await request()).status,409);used=false;
  linked=true;assert.equal((await request()).status,409);linked=false;
  missing=true;assert.equal((await request()).status,404);missing=false;
  conflict=true;assert.equal((await request()).status,409);conflict=false;
  assert.equal((await request()).status,200);
  assert.deepEqual(patch.value,{value:'NOVO',normalized:'NOVO'});
  assert.equal(patch.id,'cfg');
  assert.equal(patch.snapshot.color,'#123456');
  assert.equal(patch.snapshot.ordem,2);
});

test('exclusao de origem busca somente o cadastro e confirma remocao persistida',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf('async function deleteConfigOptionRecords(');
  const end=server.indexOf("app.delete('/api/config-options/:field/:value'",start);
  assert.ok(start>=0&&end>start);
  const docs=[...Array.from({length:1200},(_,i)=>({_id:'log'+i,field:'__work_event'})),{_id:'spot',field:'origem',value:'SPOT',normalized:'SPOT'},{_id:'legacy',field:'origem',value:'SPOT'},{_id:'arcos',field:'origem',value:'ARCOS',normalized:'ARCOS'},{_id:'other',field:'destino',value:'SPOT',normalized:'SPOT'}];
  const select=async(table,filter)=>{assert.equal(table,'config');assert.equal(filter.field,'origem');return docs.filter(d=>Object.entries(filter).every(([k,v])=>d[k]===v)).slice(0,1000);};
  let blocked=false,invalidated=0;
  const del=async(table,id)=>{assert.equal(table,'config');if(!blocked){const i=docs.findIndex(d=>d._id===id);if(i>=0)docs.splice(i,1);}};
  const count=async(table,predicate,filter)=>(await select(table,filter)).length;
  const remove=new Function('TABLES','normalizeUniqueValue','selectDocsByJson','deleteDoc','countDocs','invalidateCache','sortDocs',server.slice(start,end)+'return deleteConfigOptionRecords;')({configOptions:'config'},v=>String(v||'').trim().toUpperCase(),select,del,count,()=>invalidated++,v=>v);
  const remaining=await remove('origem','SPOT');
  assert.deepEqual(remaining.map(d=>d._id),['arcos']);
  assert.equal(docs.length,1202);
  assert.ok(docs.some(d=>d._id==='other'));
  assert.equal(invalidated,1);
  assert.deepEqual((await remove('origem','SPOT')).map(d=>d._id),['arcos']);
  docs.push({_id:'spot2',field:'origem',value:'SPOT',normalized:'SPOT'});
  blocked=true;
  await assert.rejects(()=>remove('origem','SPOT'),/ainda consta no banco/);
});
test('beta nao informa sucesso quando exclusao falha ou cadastro permanece',async()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const start=app.indexOf('async function deleteConfigOption('),end=app.indexOf('async function deleteOperation(',start);
  let response=null,confirmed=true,renders=0;const messages=[],calls=[];
  const state={configOptions:{origem:['ARCOS','SPOT']},operacoes:[{origem:'ARCOS'},{origem:'SPOT'}]};
  const remove=new Function('isBetaTripWorkspace','isAdmin','isBetaReadOnly','operationsList','normalizeOption','confirm','apiFetch','showSummaryToast','state','normalizeConfigOptions','normalizeOperacoes','renderSettingsModal','renderAll',app.slice(start,end)+'return deleteConfigOption;')(()=>true,()=>true,()=>false,()=>state.operacoes,String,()=>confirmed,async(url,opts)=>{calls.push(url);return url==='/api/operacoes'?[{origem:'ARCOS'}]:response;},(msg,type)=>messages.push({msg,type}),state,x=>x,x=>x,()=>renders++,()=>renders++);
  await remove('origem','SPOT');
  assert.equal(messages.at(-1).type,'error');assert.equal(renders,0);
  response={origem:['ARCOS','SPOT']};await remove('origem','SPOT');assert.equal(messages.at(-1).type,'error');assert.equal(renders,0);
  confirmed=false;const before=calls.length;await remove('origem','SPOT');assert.equal(calls.length,before);
  confirmed=true;response={origem:['ARCOS']};await remove('origem','SPOT');
  assert.deepEqual(state.configOptions.origem,['ARCOS']);assert.deepEqual(state.operacoes,[{origem:'ARCOS'}]);assert.equal(renders,2);assert.match(messages.at(-1).msg,/Opção excluída: SPOT/);
});

test('gestao beta de usuarios protege conta administrativa e usa Supabase Auth',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf('const USER_ADMIN_COLUMNS'),end=server.indexOf("app.put('/api/users/:id', requireAdmin",start);
  assert.ok(start>=0&&end>start);
  const profiles=[{id:'me',user_id:'auth-me',nome:'Admin',email:'me@example.test',role:'admin',ativo:true},{id:'op',user_id:'auth-op',nome:'Operador',email:'op@example.test',role:'operador',ativo:true}];
  const calls=[],routes={};let authError=false,profileError=false,actorActive=true;
  const app={put:(route,guard,handler)=>{assert.equal(guard,'admin');routes['PUT '+route]=handler;},delete:(route,guard,handler)=>{assert.equal(guard,'admin');routes['DELETE '+route]=handler;}};
  const supabase={auth:{admin:{updateUserById:async(id,patch)=>{calls.push(['updateAuth',id,patch]);return {error:authError?{}:null};},deleteUser:async(id,soft)=>{calls.push(['deleteAuth',id,soft]);return {error:authError?{}:null};}}},from:()=>{
    let mode='select',patch={},filters={};const rows=()=>profiles.filter(p=>Object.entries(filters).every(([k,v])=>p[k]===v));
    const q={select(){return q},eq(k,v){filters[k]=v;return q},maybeSingle:async()=>({data:rows()[0]||null,error:null}),single:async()=>{if(profileError)return {error:{}};const row=rows()[0];if(row)Object.assign(row,patch);return {data:row,error:null};},update(v){mode='update';patch=v;return q},delete(){mode='delete';return q},then(resolve){if(mode==='delete'){calls.push(['deleteProfile',filters.user_id]);if(profileError)return resolve({error:{}});for(const row of rows())profiles.splice(profiles.indexOf(row),1);}return resolve({count:rows().length,error:null});}};return q;
  }};
  const update=new Function('app','requireAdmin','supabase','profileForUser','publicProfile','betaEditable','process',server.slice(start,end)+'return updateBetaUser;')(app,'admin',supabase,async()=>({role:'admin',ativo:actorActive}),x=>x,true,{env:{BETA_USER_ID:'auth-me'}});
  async function req(handler,id,body){let status=200,data;const res={status(n){status=n;return this},json(v){data=v;return this}};await handler({authUser:{id:'auth-me'},params:{id},body},res);return {status,data};}
  const password=routes['PUT /api/users/:id/password'],remove=routes['DELETE /api/users/:id'];
  assert.equal((await req(update,'me',{role:'operador'})).status,409);
  assert.equal((await req(update,'me',{ativo:false})).status,409);
  assert.equal((await req(remove,'me',{confirmEmail:'me@example.test'})).status,409);
  assert.equal((await req(remove,'op',{confirmEmail:'wrong'})).status,400);
  assert.equal((await req(password,'op',{password:'short'})).status,400);
  assert.equal(calls.length,0);
  assert.equal((await req(update,'op',{role:'invalid'})).status,400);
  assert.equal((await req(update,'op',{nome:'Novo',email:'new@example.test',ativo:false})).status,200);
  assert.deepEqual(calls[0],['updateAuth','auth-op',{email:'new@example.test',email_confirm:true}]);
  assert.equal(profiles[1].nome,'Novo');
  assert.equal((await req(password,'op',{password:'Example123!'})).status,200);
  assert.deepEqual(calls[1],['updateAuth','auth-op',{password:'Example123!'}]);
  actorActive=false;assert.equal((await req(remove,'op',{confirmEmail:'new@example.test'})).status,403);actorActive=true;
  authError=true;assert.equal((await req(remove,'op',{confirmEmail:'new@example.test'})).status,409);authError=false;
  assert.equal(profiles.length,2);
  assert.equal((await req(remove,'op',{confirmEmail:'new@example.test'})).status,200);
  assert.deepEqual(calls.slice(-2),[['deleteAuth','auth-op',false],['deleteProfile','auth-op']]);
  assert.equal(profiles.length,1);
  assert.equal((await req(remove,'op',{confirmEmail:'new@example.test'})).status,404);
});
test('pagina beta usuarios tem filtros, editor e confirmacao de exclusao',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const nav=fs.readFileSync(path.join(__dirname,'../public/js/workspace-fretes.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(html,/<main class="workspace" id="beta-users"[^>]*hidden>/);
  assert.match(nav,/const usersActive = location.hash === '#usuarios'/);
  assert.match(nav,/\[usersNav,usersActive\]/);
  assert.match(app,/el\('beta-users-create'\)\.append\(create\)/);
  assert.match(app,/autocomplete='new-password'/);
  assert.match(html,/id="beta-user-password-confirm" type="password" autocomplete="new-password"/);
  assert.match(app,/if\(confirmEmail!==user.email\)/);
  assert.match(app,/if\(!user\|\|betaUserProtected\(user\)\)return/);
  assert.match(app,/if\(betaUsersBusy\|\|!isAdmin\(\)\|\|isBetaReadOnly\(\)\)return/);
  assert.match(app,/escapeHtml\(user.email/);
  assert.match(css,/\.beta-users-overview \{display:grid;grid-template-columns:repeat\(4,/);
});

test('preferencias de colunas beta validam chaves, alinhamento e ordem',()=>{
  const api=require('../public/js/workspace-table-layout');
  const pref=api.normalizePreference({order:['nome','placa','nome','actions','invalid'],alignment:{nome:'center',placa:'right',tipo:'invalid',invalid:'left'},extra:['nota','nota','produto','invalid']});
  assert.deepEqual(pref,{order:['nome','placa'],alignment:{placa:'right',nome:'center'},extra:['nota']});
  const fields=['placa','nome','tipo','status'].map(key=>({key}));
  assert.deepEqual(api.orderFields(fields,pref).map(f=>f.key),['nome','placa','tipo','status']);
  assert.deepEqual(api.orderFields(fields,{}).map(f=>f.key),['placa','nome','tipo','status']);
  assert.deepEqual(api.moveField(['a','b','c'],'a','c'),['b','c','a']);
  assert.deepEqual(api.moveField(['a','b','c'],'c','a'),['c','a','b']);
  assert.deepEqual(api.moveField(['a','b'],'x','a'),['a','b']);
  assert.deepEqual(api.normalizePreference(null),{order:[],alignment:{},extra:null});
});
test('preferencias beta sao persistidas exclusivamente para a conta autenticada',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf('const betaColumnPreferenceField'),end=server.indexOf("app.put('/api/auth/profile'",start);
  const records=[],routes={};
  const app={get:(url,fn)=>routes['GET '+url]=fn,put:(url,fn)=>routes['PUT '+url]=fn};
  const api=require('../public/js/workspace-table-layout');
  new Function('app','require','betaWorkspace','betaEditable','TABLES','findOneByJson','insertDoc','updateDoc',server.slice(start,end))(app,()=>api,true,true,{configOptions:'config'},async(t,filter)=>records.find(r=>r.field===filter.field&&r.userId===filter.userId),async(t,p)=>{const r={...p,_id:String(records.length+1)};records.push(r);return r;},async(t,id,p)=>Object.assign(records.find(r=>r._id===id),p));
  async function request(method,id,body){let status=200,data;const res={status(n){status=n;return this},json(v){data=v;return this}};await routes[method+' /api/auth/table-preferences']({authUser:{id},body},res);return {status,data};}
  assert.deepEqual((await request('GET','a')).data,{preference:null});
  assert.equal((await request('PUT','a',{userId:'b',order:['nome','placa'],alignment:{nome:'right'}})).status,200);
  assert.equal(records[0].userId,'a');
  assert.deepEqual((await request('GET','b')).data,{preference:null});
  assert.equal((await request('PUT','b',{order:['tipo'],alignment:{tipo:'center'}})).status,200);
  assert.deepEqual((await request('GET','a')).data.preference.order,['nome','placa']);
  assert.deepEqual((await request('GET','b')).data.preference.order,['tipo']);
  await request('PUT','a',{order:[],alignment:{},extra:['nota']});
  assert.equal(records.length,2);
  assert.deepEqual((await request('GET','a')).data.preference,{order:[],alignment:{},extra:['nota']});
});
test('icone de layout fica entre pesquisa e filtros e aplica alinhamento nas tabelas',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.ok(html.indexOf('id="tableSearch"')<html.indexOf('id="beta-column-layout-btn"'));
  assert.ok(html.indexOf('id="beta-column-layout-btn"')<html.indexOf('id="filterBtn"'));
  assert.match(app,/if\(isBetaTripWorkspace\(\)\) await loadBetaColumnPreference\(\)/);
  assert.match(app,/orderFields\(fields,state.betaColumnPreference\)/);
  assert.match(app,/applyBetaColumnAlignment\(headRow\)/);
  assert.match(app,/applyBetaColumnAlignment\(tbody\)/);
  assert.match(app,/th\.draggable = true/);
  assert.match(app,/prefers-reduced-motion: reduce/);
  assert.match(app,/duration:220/);
  assert.match(css,/\[data-beta-align=left\] \{text-align:left\}/);
  assert.match(css,/\[data-beta-align=center\] \{text-align:center\}/);
  assert.match(css,/\[data-beta-align=right\] \{text-align:right\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  const start=app.indexOf('function applyBetaColumnAlignment('),end=app.indexOf('function betaAlignIcon(',start);
  const cells=[{dataset:{field:'nome'}},{dataset:{field:'placa',betaAlign:'left'}},{dataset:{}}];
  let pref={alignment:{nome:'center',trabalho:'right'}};
  const apply=new Function('betaColumnPref',app.slice(start,end)+'return applyBetaColumnAlignment;')(()=>pref);
  apply({querySelectorAll:()=>cells});
  assert.deepEqual(cells.map(c=>c.dataset.betaAlign),['center',undefined,'right']);
});

test('icone beta alterna alinhamento geral sem abrir painel e preserva a ordem',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  const start=app.indexOf('function betaGlobalAlignment()'),end=app.indexOf('function clearBetaColumnDrag()',start);
  const state={betaColumnPreference:{order:['nome','placa'],alignment:{nome:'center'},extra:['obs']}};
  const fields=['placa','nome','obs','trabalho'].map(key=>({key}));
  const button={dataset:{},setAttribute(){}},icon={animate(){}};
  let saved=0,applied=0;
  const document={getElementById:()=>button,querySelectorAll:()=>[{}],querySelector:()=>icon};
  const api=new Function('state','betaColumnPref','allSortableTableFields','document','betaAlignIcon','applyBetaColumnAlignment','saveBetaColumnPreference','window','betaColumnSaveMessage',app.slice(start,end)+'return {betaGlobalAlignment,cycleBetaColumnAlignment};')(state,()=>JSON.parse(JSON.stringify(state.betaColumnPreference)),()=>fields,document,x=>x,()=>applied++,()=>saved++,{matchMedia:()=>({matches:true})},'');
  assert.equal(api.betaGlobalAlignment(),'mixed');
  for(const mode of ['left','center','right','default']){
    api.cycleBetaColumnAlignment();
    assert.equal(api.betaGlobalAlignment(),mode);
    assert.equal(button.dataset.alignment,mode);
    assert.deepEqual(state.betaColumnPreference.alignment,mode==='default'?{}:Object.fromEntries(fields.map(f=>[f.key,mode])));
    assert.deepEqual(state.betaColumnPreference.order,['nome','placa']);
    assert.deepEqual(state.betaColumnPreference.extra,['obs']);
  }
  assert.equal(saved,4);assert.equal(applied,4);
  assert.doesNotMatch(html,/id="beta-column-layout"/);
  assert.doesNotMatch(app,/function renderBetaColumnLayout\(/);
  assert.match(app,/button.addEventListener\('click',cycleBetaColumnAlignment\)/);
});
test('reordenacao beta ocorre diretamente no cabecalho e nao dispara ordenacao de registros',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const start=app.indexOf('function initBetaColumnLayout()'),end=app.indexOf('function renderColumnPicker()',start);
  const events={},docEvents={},moves=[];
  const classList=()=>({add(){},remove(){}});
  const th1={dataset:{field:'placa'},classList:classList()},th2={dataset:{field:'nome'},classList:classList()};
  const shell={addEventListener:(key,fn)=>events[key]=fn,querySelectorAll:()=>[]};
  const button={addEventListener:(key,fn)=>events['button-'+key]=fn};
  const document={getElementById:id=>id==='beta-shell'?shell:button,addEventListener:(key,fn)=>docEvents[key]=fn};
  const init=new Function('document','changeBetaColumnOrder','activeInlineEdit','updateBetaAlignmentButton','cycleBetaColumnAlignment','let betaColumnDragKey="",betaColumnSuppressSortUntil=0;function clearBetaColumnDrag(){betaColumnDragKey="";}'+app.slice(start,end)+'initBetaColumnLayout();return ()=>betaColumnSuppressSortUntil;');
  const suppressed=init(document,(a,b)=>moves.push([a,b]),null,()=>{},()=>{});
  let prevented=0;
  const event=th=>({target:{closest:()=>th},preventDefault:()=>prevented++,dataTransfer:{setData(){}}});
  events.dragstart(event(th1));events.dragover(event(th2));events.drop(event(th2));
  assert.deepEqual(moves,[['placa','nome']]);
  assert.equal(prevented,2);assert.ok(suppressed()>Date.now());
  assert.match(app,/Date.now\(\)>=betaColumnSuppressSortUntil/);
  assert.match(app,/event.altKey&&\['ArrowLeft','ArrowRight'\]/);
  events.dragstart(event(th1));docEvents.dragend();events.drop(event(th2));
  assert.equal(moves.length,1);
});
test('balao beta mostra placa e motorista sem titulos redundantes',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-comments.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(js,/heading\.append\(el\('strong', '', trip\.placa/);
  assert.match(js,/el\('small', 'beta-comment-driver', String\(trip\.nome/);
  assert.doesNotMatch(js,/'Observacoes e comentarios'|'Observacao da viagem'/);
  assert.match(js,/section\.append\(el\('p', '', obs\)\)/);
  assert.match(js,/section\.replaceChildren\(editor\);\s*actions\.replaceWith\(controls\)/);
  assert.match(js,/group\.append\(section\)/);
  assert.match(js,/group\.append\(actions\)/);
  assert.match(js,/content\.append\(group\)/);
  assert.doesNotMatch(js,/section\.append\(actions\)/);
  assert.match(js,/button\('Editar observação'/);
  assert.match(js,/button\('Excluir observação'/);
  assert.match(css,/\.beta-comment-observation-group \{display:grid;gap:12px;min-width:0\}/);
  assert.match(css,/\.beta-comment-observation-group > \.beta-comment-actions \{margin:0;padding:0 2px;gap:15px\}/);
});

test('descarga beta sempre segue agendamento, inclusive com preferencias antigas e arraste',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const api=require('../public/js/workspace-table-layout');
  const base=app.slice(app.indexOf('const BASE_FIELDS ='),app.indexOf('const FIELDS = BASE_FIELDS;'));
  const helpers=app.slice(app.indexOf('function optionalTableFields()'),app.indexOf('function allSortableTableFields()'));
  const get=(state,beta)=>new Function('state','isBetaTripWorkspace','window',base+helpers+';return {visibleTableFields,optionalTableFields};')(state,()=>beta,{FrotasysBetaTableLayout:api});
  const keysOf=(state,beta)=>get(state,beta).visibleTableFields().map(f=>f.key);
  const state={additionalColumns:['descarga','frete'],betaColumnPreference:{order:['descarga','nome','agendamento','placa']}};
  for(const input of [{additionalColumns:[]},state]){
    const keys=keysOf(input,true);
    assert.equal(keys.indexOf('descarga'),keys.indexOf('agendamento')+1);
    assert.equal(keys.filter(k=>k==='descarga').length,1);
    assert.ok(!get(input,true).optionalTableFields().some(f=>f.key==='descarga'));
  }
  assert.ok(!keysOf({additionalColumns:[]},false).includes('descarga'));
  assert.ok(keysOf({additionalColumns:['descarga']},false).includes('descarga'));
  assert.deepEqual(api.normalizePreference({extra:['descarga','nota']}).extra,['nota']);
  const order=['placa','agendamento','descarga','status','trabalho'];
  assert.deepEqual(api.moveField(order,'descarga','placa'),order);
  assert.deepEqual(api.moveField(order,'agendamento','trabalho'),['placa','status','trabalho','agendamento','descarga']);
  assert.deepEqual(api.moveField(order,'placa','descarga'),['agendamento','descarga','placa','status','trabalho']);
  assert.deepEqual(api.moveField(order,'status','descarga'),['placa','status','agendamento','descarga','trabalho']);
  assert.match(app,/th\.dataset\.field==='descarga'\)\{\s*th\.draggable = false/);
  assert.match(app,/visibleTableFields\(\)\.filter\(f=>f\.key!=='descarga'\)/);
  assert.ok(api.layout(order).minWidth.includes('465px'));
});
test('descarga tem menu proprio sem palete e confirmacao independente de carga',async()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  const beta=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const extract=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
  const trip={_id:'1',agendamento:'12:00',descarga:'09:00 28/11/2026',agendamentoVerde:true,descargaVerde:false};
  const state={viagens:[trip],agendamentoTargetId:null};
  const elements={};for(const id of ['agendamento-mark','agendamento-palete','agendamento-edit','agendamento-menu'])elements[id]={style:{},classList:{add(){},remove(){}}};
  const calls=[];
  const api=new Function('state','document','window','isBetaTripWorkspace','normalizeOption','updateViagemField',extract('function showAgendamentoMenu(','function showContratoMenu(')+extract('async function toggleAgendamentoVerde()','async function marcarAgendamentoPalete()')+'return {showAgendamentoMenu,toggleAgendamentoVerde};')(state,{getElementById:id=>elements[id]},{innerWidth:1000,innerHeight:800},()=>true,String,async(id,field,value)=>{calls.push([id,field,value]);trip[field]=value;});
  const open=field=>api.showAgendamentoMenu({preventDefault(){},clientX:10,clientY:10},{dataset:{id:'1',field}});
  open('descarga');assert.equal(elements['agendamento-palete'].hidden,true);
  assert.equal(elements['agendamento-mark'].textContent,'Agendado');
  await api.toggleAgendamentoVerde();
  assert.deepEqual(calls[0],['1','descargaVerde',true]);assert.equal(trip.agendamentoVerde,true);
  open('descarga');assert.equal(elements['agendamento-mark'].textContent,'Remover agendamento');
  await api.toggleAgendamentoVerde();
  assert.deepEqual(calls[1],['1','descargaVerde',false]);
  open('agendamento');assert.equal(elements['agendamento-palete'].hidden,false);
  assert.equal(elements['agendamento-mark'].textContent,'Remover agendamento');
  await api.toggleAgendamentoVerde();assert.deepEqual(calls[2],['1','agendamentoVerde',false]);
  const render=new Function('isBetaTripWorkspace','escapeAttr','escapeHtml','formatDescargaDateTime','formatAgendamentoDisplay',extract('function renderTableCell(','function renderStatusButton(')+'return renderTableCell;')(()=>true,String,String,String,String);
  const field={key:'descarga',quick:true};
  assert.match(render({...trip,descargaVerde:true},field),/class="quick-edit has-agendamento"/);
  assert.match(render(trip,field),/09:00 28\/11\/2026/);
  assert.doesNotMatch(render({...trip,agendamentoVerde:true},field),/has-agendamento/);
  assert.match(app,/if \(state\.agendamentoTargetField === 'descarga'\) return;/);
  assert.match(app,/field === 'agendamentoVerde' \|\| field === 'descargaVerde'/);
  assert.match(app,/isBetaTripWorkspace\(\) && field === 'descargaVerde'/);
  assert.match(server,/betaEditable && patch\.descargaVerde !== undefined/);
  assert.match(server,/betaEditable && field === 'descargaVerde'/);
  assert.match(beta,/querySelectorAll\('\.schedule-chip'\)/);
  assert.match(css,/td\[data-field="descarga"\]\.has-agendamento \.sched/);
  assert.match(css,/#agendamento-palete\[hidden\] \{display:none!important\}/);
});

test('beta exige data de descarga e confirmacao verde para concluir, preservando historico antigo',()=>{
  const {calculateTripStatus}=require('../tripStatus');
  const trip={tipo:'CARRETEIRO',pamcard:'PAMCARD OK',cte:'123',manifesto:'456',contrato:'789',descarga:'09:00 28/11/2026',adiantamentoOk:true};
  const options={requireDischargeConfirmation:true,preserveLegacyCompleted:true};
  assert.equal(calculateTripStatus(trip,options),'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus({...trip,descargaVerde:false},options),'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus({...trip,descargaVerde:true},options),'CONCLUIDO');
  assert.equal(calculateTripStatus({...trip,descargaVerde:true,descarga:''},options),'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus({...trip,descargaVerde:true,adiantamentoOk:false},options),'ADIANTAMENTO');
  assert.equal(calculateTripStatus({...trip,descargaVerde:false,adiantamentoOk:false},options),'ADIANTAMENTO / DESCARGA');
  assert.equal(calculateTripStatus({...trip,status:'CONCLUIDO'},options),'CONCLUIDO');
  assert.equal(calculateTripStatus({...trip,status:'CONCLUIDO',descargaVerde:false},options),'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus(trip),'CONCLUIDO');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  assert.match(server,/requireDischargeConfirmation:betaWorkspace/);
  assert.match(server,/if\(payload\.descargaVerde===undefined\)payload\.descargaVerde=false/);
});
test('aviso de evento por viagem usa observacoes e confirma permanentemente no servidor',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const start=server.indexOf('function betaEventWarningText('),end=server.indexOf("app.post('/api/viagens',",start);
  let handler,writes=0,broadcasts=0,fail=false;
  const trip={_id:'1',cte:'123',obs:'Verificar canhoto'};
  const app={post:(url,guard,fn)=>{assert.equal(url,'/api/viagens/:id/evento-cte-confirmacao');assert.equal(guard,'editor');handler=fn;}};
  const api=new Function('app','requireViagemEditor','betaEditable','formatDocumentNumber','TABLES','findOneById','updateDoc','broadcast','buildViagemHistoryEntries','appendViagemHistory',server.slice(start,end)+'return {shouldWarnBetaEvent,betaEventWarningText};')(app,'editor',true,v=>String(v||''),{viagens:'viagens'},async()=>({...trip}),async(t,id,p)=>{writes++;if(fail)return null;Object.assign(trip,p);return trip;},()=>broadcasts++,()=>[],()=>[]);
  assert.equal(api.shouldWarnBetaEvent({}, {cte:'123'},trip),true);
  assert.equal(api.shouldWarnBetaEvent({cte:'123'}, {cte:'123'},trip),false);
  assert.equal(api.shouldWarnBetaEvent({}, {cte:'123'},{cte:'123',obs:' ',frete:''}),false);
  assert.equal(api.shouldWarnBetaEvent({}, {cte:'123'},{cte:'123',frete:'Evento'}),true);
  assert.equal(api.betaEventWarningText({frete:'Igual',obs:'Igual'}),'Igual');
  assert.equal(api.betaEventWarningText({frete:'Evento',obs:'Observação'}),'Evento\n\nObservação');
  async function request(){let status=200,data;const res={status(n){status=n;return this},json(v){data=v;return this}};await handler({params:{id:'1'},authUser:{id:'u1'},userProfile:{}},res);return {status,data};}
  fail=true;assert.equal((await request()).status,409);assert.equal(writes,3);assert.equal(trip.eventoCteConfirmadoEm,undefined);
  fail=false;assert.deepEqual((await request()).data,{ok:true});assert.equal(writes,4);assert.equal(broadcasts,1);assert.equal(trip.eventoCteConfirmadoPor,'u1');
  assert.equal(api.shouldWarnBetaEvent({cte:'123'},{cte:'456'},{...trip,cte:'456'}),false);
  assert.deepEqual((await request()).data,{ok:true});assert.equal(writes,4);
});
test('dialogo beta de evento nao duplica avisos e fecha apos confirmar no banco',async()=>{
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const start=app.indexOf('const pendingEventWarnings ='),end=app.indexOf("  document.getElementById('date-picker').addEventListener",start);
  const events={},formEvents={},button={disabled:false},error={textContent:''},content={textContent:''};
  const dialog={open:false,addEventListener:(name,fn)=>events[name]=fn,querySelector:key=>key==='form'?{addEventListener:(name,fn)=>formEvents[name]=fn}:button,showModal(){this.open=true},close(){this.open=false;events.close();}};
  const document={getElementById:id=>({'event-warning':dialog,'event-warning-text':content,'event-warning-error':error}[id])};
  let success=false,calls=[];
  const show=new Function('document','apiFetch',app.slice(start,end)+'} initUI();return showEventWarning;')(document,async(url,opts)=>{calls.push([url,opts.method]);return success?{ok:true}:null});
  show('Recado','1','ABC1234');show('Recado','1','ABC1234');
  assert.equal(dialog.open,true);assert.equal(content.textContent,'ABC1234\n\nRecado');
  let prevented=0;const e={preventDefault(){prevented++;}};
  events.cancel(e);assert.equal(prevented,1);
  await formEvents.submit(e);assert.equal(dialog.open,true);assert.ok(error.textContent.includes('Clique em OK'));
  success=true;await formEvents.submit(e);assert.equal(dialog.open,false);
  show('Outro','1');assert.equal(dialog.open,false);
  assert.deepEqual(calls,[['/api/viagens/1/evento-cte-confirmacao','POST'],['/api/viagens/1/evento-cte-confirmacao','POST']]);
  show('Outro','2');assert.equal(dialog.open,true);
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(css,/body\.workspace-beta #event-warning h2 \{[^}]*background:var\(--beta-navy/);
});

test('faturamento beta exige documentos completos e horas de todas as notas',()=>{
  const {hasBillingDocuments,hasInvoiceHours,isBillingReady,isBilled,classify}=require('../public/js/workspace-trip-sections');
  const {persistedSection}=require('../beta/mode');
  const {calculateTripStatus}=require('../tripStatus');
  const options={requireBillingCompletion:true,requireDischargeConfirmation:true,preserveLegacyCompleted:true};
  const ready={billingRuleVersion:2,tipo:'CARRETEIRO',pamcard:'PAMCARD OK',dt:'123',programado:true,num_pedagio:'456',nota:'1.234',cte:'234',manifesto:'345',contrato:'456',hora_nf:'08:45',descarga:'09:00 28/11/2026',descargaVerde:false,adiantamentoOk:true};
  for(const key of ['nota','cte','manifesto','contrato']){
    const incomplete={...ready,[key]:''};
    assert.equal(hasBillingDocuments(incomplete),false);
    assert.equal(isBillingReady(incomplete),false);
    assert.equal(classify(incomplete),'agenciando');
    assert.equal(persistedSection(incomplete),'agenciando');
    assert.notEqual(calculateTripStatus(incomplete,options),'HORA NF');
    assert.notEqual(calculateTripStatus(incomplete,options),'CONCLUIDO');
  }
  const pending={...ready,hora_nf:''};
  assert.equal(hasBillingDocuments(pending),true);
  assert.equal(hasInvoiceHours(pending),false);
  assert.equal(calculateTripStatus(pending,options),'HORA NF');
  assert.equal(classify(pending),'agenciando');
  assert.equal(persistedSection(pending),'agenciando');
  assert.equal(isBilled(pending),false);
  assert.equal(isBillingReady(ready),true);
  assert.equal(classify(ready),'arcos');
  assert.equal(persistedSection(ready),'arcos');
  assert.equal(calculateTripStatus(ready,options),'AGENDAR DESCARGA');
  assert.equal(calculateTripStatus({...ready,adiantamentoOk:false},options),'ADIANTAMENTO / DESCARGA');
  assert.equal(calculateTripStatus({...ready,descargaVerde:true},options),'CONCLUIDO');
  assert.equal(classify({...ready,descargaVerde:true,status:'CONCLUIDO'}),'concluidos');
  assert.equal(calculateTripStatus({...pending,descargaVerde:true,status:'CONCLUIDO'},options),'HORA NF');
  assert.equal(classify({...pending,status:'CONCLUIDO'}),'agenciando');
  const fleet={...pending,tipo:'FROTA',contrato:''};
  assert.equal(hasBillingDocuments(fleet),true);
  assert.equal(calculateTripStatus(fleet,options),'HORA NF');
  assert.equal(persistedSection({...fleet,hora_nf:'00:00'}),'arcos');
  assert.equal(calculateTripStatus({...fleet,hora_nf:'00:00'},options),'AGENDAR DESCARGA');
  for(const time of ['', ' ', '24:00','10:60','x']){
    assert.equal(hasInvoiceHours({...ready,nota2:'2',hora_nf2:time}),false);
    assert.equal(calculateTripStatus({...ready,nota2:'2',hora_nf2:time},options),'HORA NF');
  }
  assert.equal(hasInvoiceHours({...ready,nota2:'2',hora_nf2:'17:30'}),true);
  assert.equal(hasInvoiceHours({...ready,nota15:'15',hora_nf15:'23:59'}),true);
  assert.equal(hasInvoiceHours({...ready,nota15:'15'}),false);
  assert.equal(hasInvoiceHours({...ready,hora_nf2:''}),true);
  const legacy={...ready,billingRuleVersion:undefined,status:'CONCLUIDO',hora_nf:'',descargaVerde:undefined};
  assert.equal(calculateTripStatus(legacy,options),'CONCLUIDO');
  assert.equal(classify(legacy),'concluidos');
  assert.equal(isBilled(legacy),true);
  assert.equal(calculateTripStatus({...legacy,billingRuleVersion:2},options),'HORA NF');
  assert.equal(calculateTripStatus({...ready,hora_nf:''}),'CONCLUIDO');
});
test('servidor, resumo e filtro beta compartilham regra de faturamento',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const beta=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  assert.match(server,/requireBillingCompletion:betaWorkspace/);
  assert.match(server,/doc\.secao = betaBilling\.isBilled\(doc\)/);
  assert.match(server,/payload\.billingRuleVersion=2/);
  assert.match(server,/if\(!betaBilling\.isLegacyCompleted\(current\)\|\|fiscalChanged\)/);
  assert.match(server,/nextData\.status = patch\.status;\s*if\(betaEditable\)\{patch\.secao=betaMode\.persistedSection\(nextData\)/);
  assert.match(app,/FrotasysBetaTripSections\.isBilled\(viagem\)/);
  assert.match(app,/!window\.FrotasysBetaTripSections\.isBilled\(viagem\)/);
  assert.match(app,/'HORA NF':'#0E7490'/);
  assert.match(beta,/'EMITIR CTE', 'HORA NF', 'ADIANTAMENTO \/ DESCARGA'/);
});

test('produto e peso compactos aproximam agendamento e descarga sem reduzir legibilidade',()=>{
  const {layout}=require('../public/js/workspace-table-layout');
  const keys=['placa','nome','tipo','origem','destino','produto','peso','agendamento','descarga','status','trabalho','actions'];
  const result=layout(keys);
  assert.equal(result.columns[5],'64px');
  assert.equal(result.columns[6],'60px');
  assert.equal(result.minWidth,'calc(1095px + var(--beta-status-column))');
  assert.equal(result.columns[9],'var(--beta-status-column)');
  const oldFlexible={placa:85,nome:120,origem:112,destino:98,produto:78,peso:68,agendamento:94,descarga:154};
  const oldFlexTotal=Object.values(oldFlexible).reduce((sum,n)=>sum+n,0);
  const fixedOld=104+132+72, status=180;
  const width=(column,total)=>column.endsWith('px')&&!column.startsWith('calc')?parseFloat(column):column==='var(--beta-status-column)'?status:(total-432-status)*Number(column.match(/\* ([\d.]+)\)$/)[1]);
  for(const total of [1297,1440,1600,1920]){
    const previousStart=key=>keys.slice(0,keys.indexOf(key)).reduce((sum,k)=>sum+(k==='tipo'?104:(oldFlexible[k]||0)*(total-fixedOld-status)/oldFlexTotal),0);
    const nextStart=key=>result.columns.slice(0,keys.indexOf(key)).reduce((sum,col)=>sum+width(col,total),0);
    assert.ok(nextStart('agendamento')<previousStart('agendamento'));
    assert.ok(nextStart('descarga')<previousStart('descarga'));
    assert.ok(width(result.columns[7],total)>=94);
    assert.ok(width(result.columns[8],total)>=154);
  }
  const css=fs.readFileSync(path.join(__dirname,'../public/css/workspace-beta.css'),'utf8');
  assert.match(css,/\[data-field=produto\],\[data-field=peso\]\) \{padding-inline:4px\}/);
});

test('recados beta expiram individualmente em 72 horas sem renovar ao editar',()=>{
  const {RETENTION_MS,observationWritePatch,expiredTripContentPatch}=require('../beta/trip-comments');
  const now=Date.parse('2026-11-27T12:00:00Z'),old=new Date(now-RETENTION_MS).toISOString(),recent=new Date(now-RETENTION_MS+1).toISOString();
  assert.equal(RETENTION_MS,259200000);
  const trip={obs:'Antiga',obsCriadaEm:old,cte:'123',frete:'Evento',historico:[{campo:'cte'}],comentariosBeta:[
    {id:'a',messages:[{id:'old',text:'Expirado',createdAt:old,editedAt:recent},{id:'new',text:'Atual',createdAt:recent}]},
    {id:'b',messages:[{id:'old2',createdAt:old}]}
  ]};
  const patch=expiredTripContentPatch(trip,now);
  assert.deepEqual(patch,{obs:'',obsCriadaEm:null,comentariosBeta:[{id:'a',messages:[trip.comentariosBeta[0].messages[1]]}]});
  assert.equal(trip.obs,'Antiga');
  assert.deepEqual(expiredTripContentPatch({...trip,...patch},now),{});
  assert.deepEqual(expiredTripContentPatch({obs:'Nova',obsCriadaEm:recent},now),{});
  assert.deepEqual(observationWritePatch({obs:'Antiga',obsCriadaEm:old},{obs:'Editada'},now),{obsCriadaEm:old});
  assert.deepEqual(observationWritePatch({obs:''},{obs:'Nova'},now),{obsCriadaEm:new Date(now).toISOString()});
  assert.deepEqual(observationWritePatch(trip,{obs:''},now),{obsCriadaEm:null});
  assert.deepEqual(observationWritePatch(trip,{cte:'456'},now),{});
  assert.deepEqual(expiredTripContentPatch({obs:'Legada',createdAt:old},now),{obs:'',obsCriadaEm:null});
  assert.deepEqual(expiredTripContentPatch({obs:'Legada',createdAt:old,historico:[{campo:'obs',atual:'Legada',dataHora:recent}]},now),{obsCriadaEm:recent});
  assert.deepEqual(expiredTripContentPatch({obs:'Sem data'},now),{obsCriadaEm:new Date(now).toISOString()});
  assert.deepEqual(expiredTripContentPatch({createdAt:old,comentariosBeta:[{id:'x',messages:[{id:'legacy'}]}]},now),{comentariosBeta:[]});
});
test('rotina de expiracao beta grava apenas recados, pagina e publica as alteracoes',async()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const betaRetention=require('../beta/trip-comments');
  const now=Date.parse('2026-11-27T12:00:00Z'),old='2026-11-24T12:00:00Z',recent='2026-11-27T11:00:00Z';
  const records=Array.from({length:201},(_,i)=>({id:String(i).padStart(4,'0'),created_at:old,updated_at:recent,dados:{obs:i===200?'Apagar':'Manter',obsCriadaEm:i===200?old:recent,cte:'123',status:'PROGRAMAR'}}));
  const writes=[],events=[],pages=[];
  let details=0;
  const supabase={from:()=>{let field='',cursor=null,limit=200;const q={select(columns){assert.ok(['*','id,updated_at'].includes(columns));return q},
    in(key,ids){assert.equal(key,'id');details+=ids.length;return {data:records.filter(r=>ids.includes(r.id))};},not(key){field=key.split('->>')[1];return q},neq(){return q},order(){return q},limit(n){limit=n;return q},gt(key,value){cursor=value;return q},then(resolve){pages.push([field,cursor]);return resolve({data:records.filter(r=>(cursor===null||r.id>cursor)&&r.dados[field]&&r.dados[field].length).slice(0,limit).map(({id,updated_at})=>({id,updated_at})),error:null});}};return q;}};
  const start=server.indexOf('let betaRetentionRunning=false;'),end=server.indexOf('const PORT =',start);
  const sweep=new Function('betaEditable','supabase','TABLES','SUPABASE_DOC_SELECT','betaRetention','updateDoc','broadcast',server.slice(start,end)+'return sweepBetaTripContent;')(true,supabase,{viagens:'viagens'},'*',betaRetention,async(table,id,patch,snapshot)=>{writes.push({id,patch,snapshot});Object.assign(records.find(r=>r.id===id).dados,patch);return {...snapshot,...patch};},msg=>events.push(msg));
  await sweep(now);
  assert.equal(writes.length,1);
  assert.equal(writes[0].id,'0200');
  assert.deepEqual(writes[0].patch,{obs:'',obsCriadaEm:null});
  assert.equal(writes[0].snapshot.status,'PROGRAMAR');
  assert.equal(writes[0].snapshot.updatedAt,recent);
  assert.equal(events[0].payload.cte,'123');
  assert.deepEqual(pages,[['obs',null],['obs','0199'],['comentariosBeta',null]]);
  assert.equal(details,201);
  await sweep(now+60_000);
  assert.equal(details,201);
  records[0].updated_at=new Date(now).toISOString();
  await sweep(now+120_000);
  assert.equal(details,202);
  await sweep(Date.parse(recent)+betaRetention.RETENTION_MS);
  assert.equal(writes.length,201);
  assert.match(server,/setInterval\(\(\)=>void sweepBetaTripContent\(\),60_000\)\.unref\(\)/);
  assert.match(server,/retentionPatch\.comentariosBeta \?\? current\.comentariosBeta/);
  const app=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  assert.match(app,/state\.selectedViagemDetails\.obs=payload\.obs/);
  assert.match(app,/FrotasysBetaComments\?\.refreshTrip\(payload\._id\)/);
});
