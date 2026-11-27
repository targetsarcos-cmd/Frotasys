'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {resolveVersion,stampVersion}=require('../beta/release-version');
const {versionTracker}=require('../public/js/version-notice');
const {localDay,expiredWorkPatch}=require('../beta/work-day-rollover');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const a='a'.repeat(40), b='b'.repeat(40), c='c'.repeat(40);
test('identificador acompanha commit publicado e fallback não muda em simples reinício',()=>{
  assert.equal(resolveVersion({RENDER_GIT_COMMIT:a}),a);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'frotasys-version-'));
  try{
    fs.writeFileSync(path.join(root,'server.js'),'a');
    const initial=resolveVersion({},root);
    assert.equal(resolveVersion({},root),initial);
    fs.writeFileSync(path.join(root,'server.js'),'b');
    assert.notEqual(resolveVersion({},root),initial);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('HTML inclui versão do documento e invalida cache dos scripts e estilos locais',()=>{
  const html=stampVersion('<head><link href="/css/style.css?v=old"></head><body><script src="js/app.js"></script><script src="https://example.com/lib.js"></script></body>',a);
  assert.ok(html.includes('name="frotasys-version" content="'+a+'"'));
  assert.ok(html.includes('/css/style.css?v='+a));
  assert.ok(html.includes('js/app.js?v='+a));
  assert.ok(html.includes('/js/version-notice.js?v='+a));
  assert.ok(html.includes('https://example.com/lib.js"'));
});
test('nova versão mantém bloqueio obrigatório até carregar novo documento',()=>{
  const tracker=versionTracker(a);
  tracker.observe(a);assert.equal(tracker.pending(),'');
  tracker.observe(null);assert.equal(tracker.pending(),'');
  tracker.observe(b);assert.equal(tracker.pending(),b);
  tracker.observe(b);assert.equal(tracker.pending(),b);
  tracker.observe(null);assert.equal(tracker.pending(),b);
  tracker.observe(a);assert.equal(tracker.pending(),b);
  tracker.observe(c);assert.equal(tracker.pending(),c);
  assert.equal(versionTracker(c).pending(),'');
});
test('trabalho ativo e pausado fecha na primeira meia-noite local, inclusive após dias offline',()=>{
  const base={startedAt:'2026-11-27T23:40:00Z',status:'active'};
  assert.equal(localDay('2026-11-28T02:59:59Z'),'2026-11-27');
  assert.equal(expiredWorkPatch(base,Date.parse('2026-11-28T02:59:59Z')),null);
  for(const status of ['active','paused']){
    const patch=expiredWorkPatch({...base,status},Date.parse('2026-12-01T15:00:00Z'));
    assert.deepEqual(patch,{status:'completed',completedAt:'2026-11-28T03:00:00.000Z',completionReason:'day_rollover'});
  }
  assert.equal(expiredWorkPatch({...base,status:'completed'},Date.parse('2026-12-01')),null);
  assert.equal(expiredWorkPatch({...base,startedAt:'invalid'},Date.parse('2026-12-01')),null);
});
test('menu nasce recolhido e a interface preserva ações e aviso manual F5',()=>{
  const workspace=read('beta/workspace.js'),shell=read('beta/workspace-shell.html'),app=read('public/js/app.js'),server=read('server.js'),notice=read('public/js/version-notice.js');
  assert.match(workspace,/id="beta-shell" class="nav-compact"/);
  assert.match(shell,/id="collapseNav"[^>]*aria-expanded="false"/);
  assert.match(app,/work-popover-close/);
  assert.match(app,/class="work-finish"/);
  assert.match(server,/auto_completed_by_day/);
  assert.match(server,/updateDoc\(TABLES.configOptions,session._id,patch,session\)/);
  assert.match(server,/expiredWorkPatch\(current\)/);
  assert.match(notice,/<kbd>F5<\/kbd>/);
  assert.doesNotMatch(notice,/location\.reload/);
});

test('aviso obrigatório bloqueia a interface, impede fechar e mantém F5 nativo',()=>{
  const notice=read('public/js/version-notice.js'),css=read('public/css/workspace-beta.css');
  assert.match(notice,/dialog\.showModal\(\)/);
  assert.match(notice,/dialog\.setAttribute\('closedby','none'\)/);
  assert.match(notice,/dialog\.addEventListener\('cancel',event=>event\.preventDefault\(\)\)/);
  assert.match(notice,/dialog\.addEventListener\('close',showPending\)/);
  assert.match(notice,/event\.stopImmediatePropagation\(\)/);
  assert.match(notice,/if\(event\.key==='Escape'\)event\.preventDefault\(\)/);
  assert.doesNotMatch(notice,/<button|Entendi|acknowledge\(|dialog\.close\(|location\.reload|activeElement|modal-overlay/);
  assert.match(css,/#frotasys-version-notice \{position:fixed;inset:0;margin:auto/);
});
