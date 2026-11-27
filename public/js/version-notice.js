'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysVersionNotice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function versionTracker(loaded){
    const valid=v=>typeof v==='string'&&/^[a-f0-9]{40,64}$/.test(v);
    let required='';
    return {
      observe(v){if(valid(loaded)&&valid(v)&&v!==loaded)required=v;},
      pending(){return required;}
    };
  }
  let started=false;
  function start(){
    if(started)return;
    const loaded=document.querySelector('meta[name="frotasys-version"]')?.content;
    if(!loaded)return;
    started=true;
    const tracker=versionTracker(loaded);
    let checking=false;
    const dialog=document.createElement('dialog');
    dialog.id='frotasys-version-notice';
    dialog.setAttribute('aria-labelledby','frotasys-version-title');
    dialog.setAttribute('aria-describedby','frotasys-version-description');
    dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('closedby','none');
    dialog.innerHTML='<div class="version-notice-head"><span class="version-notice-symbol" aria-hidden="true">↻</span><h2 id="frotasys-version-title">Atualização obrigatória</h2></div><div class="version-notice-body" id="frotasys-version-description"><p>Uma nova versão do Frotasys está disponível.</p><p>Pressione <kbd>F5</kbd> para atualizar o sistema e continuar trabalhando.</p><p class="version-notice-blocked">O sistema permanecerá bloqueado até a atualização.</p></div>';
    document.body.append(dialog);
    // No dismissal or acknowledgement. The browser must load the new document.
    dialog.addEventListener('cancel',event=>event.preventDefault());
    dialog.addEventListener('close',showPending);
    document.addEventListener('keydown',event=>{
      if(!tracker.pending())return;
      event.stopImmediatePropagation();
      if(event.key==='Escape')event.preventDefault();
      // Do not prevent the native F5 / browser reload shortcuts.
    },true);
    function showPending(){
      if(document.hidden||dialog.open||!tracker.pending())return;
      dialog.showModal();
    }
    async function check(){
      if(document.hidden||checking)return;
      if(tracker.pending()){showPending();return;}
      checking=true;
      try{
        const response=await fetch('/api/version?loaded='+encodeURIComponent(loaded),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
        if(response.ok){const data=await response.json();if(data.confirmed===true)tracker.observe(data.version);}
      }catch(_error){/* A transient outage is not a new release. */}
      finally{checking=false;showPending();}
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check();});
    window.addEventListener('focus',check);
    setInterval(check,30000);
    setInterval(showPending,3000);
    void check();
  }
  return {versionTracker,start};
});
