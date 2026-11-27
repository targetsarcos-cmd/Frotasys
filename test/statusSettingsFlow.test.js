const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/js/app.js');
const css=read('public/css/workspace-beta.css');
const order=['CONFERIR MOTORISTA','SEM CADASTRO','SEM CADASTRO / DT CRIADA','CADASTRANDO','CRIANDO DT','CRIAR DT / PROGRAMAR','CRIAR DT','PROGRAMAR','ENVIAR PEDIDO','AGUARDANDO CARREGAMENTO','EMITIR CTE','MANIFESTO','HORA NF','ADIANTAMENTO / DESCARGA','FALTA ADIANTAMENTO','ADIANTAMENTO','AGENDAR DESCARGA','CONCLUIDO'];
const source=app.slice(app.indexOf('function orderedBetaStatuses()'),app.indexOf('function renderBetaConfigEditButton'));
const render=new Function('STATUS','DEFAULT_CONFIG_COLORS','escapeHtml','escapeAttr','renderConfigColorPicker','configColor','colorPreviewStyle',source+'return {orderedBetaStatuses,renderBetaStatusSettings,renderBetaStatusFlow};');
const fixture=render(order.slice().reverse(),{status:{CADASTRANDO:'#abcdef'}},String,String,(_field,v)=>'<input data-value="'+v+'">',(_field,v)=>v==='PROGRAMAR'?'#123456':'#abcdef',v=>'background:'+v);
test('ordena os 18 status e preserva todos os seletores de cor',()=>{
 assert.deepEqual(fixture.orderedBetaStatuses(),order);
 const html=fixture.renderBetaStatusSettings();
 assert.equal((html.match(/class="beta-status-column"/g)||[]).length,2);
 assert.equal((html.match(/<input data-value=/g)||[]).length,18);
 assert.match(html,/beta-status-number">01\./);
 assert.match(html,/beta-status-number">18\./);
});
test('fluxograma respeita programar antes de enviar e mostra pendências alternativas',()=>{
 const html=fixture.renderBetaStatusFlow();
 assert.ok(html.indexOf('>PROGRAMAR</span>')<html.indexOf('>ENVIAR PEDIDO</span>'));
 assert.ok(html.indexOf('>ENVIAR PEDIDO</span>')<html.indexOf('>AGUARDANDO CARREGAMENTO</span>'));
 for(const status of order)assert.ok(html.includes('>'+status+'</span>'),status);
 assert.match(html,/class="beta-flow-branches"/);
 assert.match(html,/background:#123456">PROGRAMAR/);
 assert.match(html,/não são etapas obrigatórias/);
});
test('fluxograma aparece apenas nas configurações administrativas e é recriado sem duplicação',()=>{
 assert.match(app,/body\?\.querySelector\('\.beta-status-flow'\)\?\.remove\(\)/);
 assert.match(app,/body\?\.insertAdjacentHTML\('beforeend',renderBetaStatusFlow\(\)\)/);
 assert.match(app,/if \(!isAdmin\(\)\) \{\s*grid\.innerHTML = ''/);
 assert.match(css,/\.beta-status-flow \{grid-column:1\/-1\}/);
 assert.match(css,/\.beta-flow-branches \{display:grid/);
});
