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

test('layout beta inclui produto e reserva largura dos controles',()=>{
  const {layout}=require('../public/js/workspace-table-layout');
  const keys=['placa','nome','tipo','origem','destino','produto','peso','agendamento','status','trabalho','actions'];
  const normal=layout(keys);
  assert.equal(normal.columns.length,11);
  assert.equal(normal.columns[9],'132px');
  assert.equal(normal.columns[10],'72px');
  assert.equal(normal.columns[2],'104px');
  assert.equal(normal.columns[8],'var(--beta-status-column)');
  assert.equal(normal.minWidth,'calc(963px + var(--beta-status-column))');
  assert.equal(layout([...keys,'nota']).minWidth,'calc(1063px + var(--beta-status-column))');
  assert.equal(layout(['placa','actions']).minWidth,'calc(157px)');
});
test('produto e fixo apos destino somente na beta e nao duplica preferencias antigas',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');
  const base=js.slice(js.indexOf('const BASE_FIELDS ='),js.indexOf('const FIELDS = BASE_FIELDS;'));
  const helpers=js.slice(js.indexOf('function optionalTableFields()'),js.indexOf('function allSortableTableFields()'));
  const get=new Function('state','isBetaTripWorkspace',base+helpers+';return {visibleTableFields,optionalTableFields};');
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

test('secoes beta nao exibem contadores nos titulos e preservam totais do rodape',()=>{
  const js=fs.readFileSync(path.join(__dirname,'../public/js/workspace-beta.js'),'utf8');
  const shell=fs.readFileSync(path.join(__dirname,'../beta/workspace-shell.html'),'utf8');
  assert.doesNotMatch(shell,/id="count(?:Booked|Billed|Completed)"/);
  assert.doesNotMatch(js,/countBooked|countBilled|countCompleted|countId/);
  assert.match(js,/byId\('footCount'\)\.textContent/);
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
  const order=['CONFERIR MOTORISTA','SEM CADASTRO','SEM CADASTRO / DT CRIADA','CRIAR DT / PROGRAMAR','CRIAR DT','ENVIAR PEDIDO','PROGRAMAR','AGUARDANDO CARREGAMENTO','EMITIR CTE','ADIANTAMENTO / DESCARGA','ADIANTAMENTO','AGENDAR DESCARGA'];
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
  assert.match(app,/if \(isBetaTripWorkspace\(\) && typeof syncBetaReminderPanel === 'function'\) syncBetaReminderPanel\(\)/);
  let hidden=true,expanded,bodyOpen;
  const input={value:'ABC'};
  const count={textContent:''};
  const panel={classList:{contains:key=>key==='hidden'&&hidden}};
  const nav={setAttribute:(key,value)=>{assert.equal(key,'aria-expanded');expanded=value;}};
  const document={getElementById:id=>({'reminder-note':panel,'reminder-text':input,'beta-reminder-count':count}[id]),querySelector:()=>nav,body:{classList:{toggle:(key,value)=>{assert.equal(key,'beta-reminder-open');bodyOpen=value;}}}};
  const sync=new Function('document',js.slice(js.indexOf('function syncBetaReminderPanel()'))+'return syncBetaReminderPanel;')(document);
  sync();
  assert.equal(expanded,'false');
  assert.equal(bodyOpen,false);
  assert.equal(count.textContent,'3 / 2.000 caracteres');
  hidden=false; input.value='ABCD';
  sync();
  assert.equal(expanded,'true');
  assert.equal(bodyOpen,true);
  assert.equal(count.textContent,'4 / 2.000 caracteres');
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
