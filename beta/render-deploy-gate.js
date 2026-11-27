'use strict';
// The current instance's commit must be live on its own Render service.
// Fail closed for notices only: application traffic is never blocked here.
function createDeployGate({env=process.env,fetchImpl=globalThis.fetch,now=Date.now,ttl=30000}={}){
  const onRender=env.RENDER==='true'||Boolean(env.RENDER_SERVICE_ID);
  const id=String(env.RENDER_SERVICE_ID||'').trim();
  const key=String(env.RENDER_API_KEY||'').trim();
  const commit=String(env.RENDER_GIT_COMMIT||'').trim().toLowerCase();
  let cached=null,inFlight=null;
  async function verify(version){
    if(!onRender)return false;
    if(!key||!/^srv-[a-z0-9]+$/i.test(id)||!(/^[a-f0-9]{40,64}$/).test(commit)||version!==commit)return false;
    if(cached&&cached.expires>now())return cached.live;
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      let live=false;
      try{
        const response=await fetchImpl('https://api.render.com/v1/services/'+encodeURIComponent(id)+'/deploys?status=live&limit=20',{
          headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:AbortSignal.timeout(7000),redirect:'error'
        });
        if(response.ok){
          const rows=await response.json();
          // Only the currently live deployment for this service may qualify.
          // Reject ambiguous live results instead of advertising an older commit.
          const active=Array.isArray(rows)?rows.filter(row=>row?.deploy?.status==='live'):[];
          live=active.length===1&&String(active[0].deploy.commit?.id||'').toLowerCase()===commit;
        }
      }catch(_error){/* no credentials, response contents or token in logs */}
      cached={live,expires:now()+ttl};
      return live;
    })();
    try{return await inFlight;}finally{inFlight=null;}
  }
  return {verify};
}
module.exports={createDeployGate};
