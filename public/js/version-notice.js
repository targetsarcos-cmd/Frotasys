'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysVersionNotice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function versionTracker(loaded){
    const valid=v=>typeof v==='string'&&/^[a-f0-9]{40,64}$/.test(v);
    let latest=loaded, acknowledged=loaded;
    return {
      observe(v){if(valid(v))latest=v;},
      pending(){return valid(loaded)&&latest!==loaded&&latest!==acknowledged?latest:'';},
      acknowledge(v){if(valid(v))acknowledged=v;}
    };
  }
  let started=false;
  function start(){
    if(started)return;
    const loaded=document.querySelector('meta[name="frotasys-version"]')?.content;
    if(!loaded)return;
    started=true;
    const tracker=versionTracker(loaded);
    let checking=false, displayed='';
    const dialog=document.createElement('dialog');
    dialog.id='frotasys-version-notice';
    dialog.setAttribute('aria-labelledby','frotasys-version-title');
    dialog.innerHTML='<div class="version-notice-head"><span class="version-notice-symbol" aria-hidden="true">↻</span><h2 id="frotasys-version-title">Atualização disponível</h2></div><div class="version-notice-body"><p>Uma nova versão do Frotasys está disponível.</p><p>Conclua ou salve suas alterações e pressione <kbd>F5</kbd> para atualizar o sistema.</p></div><div class="version-notice-footer"><button type="button" autofocus>Entendi</button></div>';
    document.body.append(dialog);
    dialog.querySelector('button').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{tracker.acknowledge(displayed);displayed='';});
    function showPending(){
      if(document.hidden||dialog.open||!tracker.pending())return;
      if(document.querySelector('dialog[open]'))return;
      const active=document.activeElement;
      if(active?.isContentEditable||active?.matches('textarea,input:not([type=button]):not([type=checkbox]):not([type=radio]),select'))return;
      if(document.querySelector('.modal-overlay:not(.hidden)'))return;
      if(typeof state!=='undefined'&&(state.drawerSaving||state.drawerActiveField))return;
      if(document.getElementById('reminder-status')?.dataset.state==='Salvando...')return;
      displayed=tracker.pending();
      dialog.showModal();
    }
    async function check(){
      if(document.hidden||checking)return;
      checking=true;
      try{
        const response=await fetch('/api/version',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
        if(response.ok){const data=await response.json();tracker.observe(data.version);}
      }catch(_error){/* A transient outage is not a new release. */}
      finally{checking=false;showPending();}
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
    window.addEventListener('focus',check);
    document.addEventListener('focusout',()=>setTimeout(showPending,300));
    setInterval(check,30000);
    setInterval(showPending,3000);
    void check();
  }
  return {versionTracker,start};
});
