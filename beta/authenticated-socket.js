'use strict';
const AUTH_TIMEOUT=10000;
const SESSION_LIMIT=5*60*1000;
function bindAuthenticatedSocket(ws,{authenticate,schedule=setTimeout,cancel=clearTimeout,now=Date.now}){
  ws.authenticated=false;
  let active=true,started=false,expiry;
  const deadline=schedule(()=>ws.close(4401,'Autenticação necessária'),AUTH_TIMEOUT);
  ws.on('close',()=>{active=false;ws.authenticated=false;cancel(deadline);if(expiry)cancel(expiry);});
  ws.on('error',()=>{active=false;ws.authenticated=false;ws.close();});
  ws.on('message',async raw=>{
    if(started)return;
    started=true;
    try{
      const message=JSON.parse(String(raw));
      if(message.type!=='authenticate'||typeof message.token!=='string'||!message.token||message.token.length>12000)throw Error('Credencial inválida');
      const identity=await authenticate(message.token);
      if(!active||ws.readyState!==1)return;
      if(!identity?.userId||!identity.profile?.ativo||!['admin','operador','visualizador'].includes(identity.profile.role))throw Error('Acesso negado');
      const remaining=Math.min(SESSION_LIMIT,Number(identity.expiresAt)-now());
      if(!Number.isFinite(remaining)||remaining<=0)throw Error('Sessão expirada');
      cancel(deadline);
      ws.userId=identity.userId;
      ws.authenticated=true;
      expiry=schedule(()=>{ws.authenticated=false;ws.close(4401,'Renovar sessão');},remaining);
      ws.send(JSON.stringify({type:'auth_ok',payload:identity.profile}));
    }catch(_error){ws.authenticated=false;if(active)ws.close(4403,'Acesso negado');}
  });
}
function broadcastAuthenticated(clients,data){
  const message=JSON.stringify(data);
  for(const client of clients){
    if(client.readyState!==1||client.authenticated!==true)continue;
    if(data.type==='perfil_atualizado'&&data.payload?.userId!==client.userId)continue;
    client.send(message);
  }
}
module.exports={bindAuthenticatedSocket,broadcastAuthenticated};
