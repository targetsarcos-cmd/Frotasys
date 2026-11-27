'use strict';
const AUTH_TIMEOUT=10000;
const SESSION_LIMIT=5*60*1000;
function bindAuthenticatedSocket(ws,{authenticate,resume,schedule=setTimeout,cancel=clearTimeout,now=Date.now}){
  ws.authenticated=false;
  let active=true,busy=false,renewAllowed=false,expiry,renew;
  const deadline=schedule(()=>ws.close(4401,'Autenticação necessária'),AUTH_TIMEOUT);
  function clearSessionTimers(){if(expiry)cancel(expiry);if(renew)cancel(renew);}
  ws.on('close',()=>{active=false;ws.authenticated=false;cancel(deadline);clearSessionTimers();});
  ws.on('error',()=>{active=false;ws.authenticated=false;clearSessionTimers();ws.close();});
  ws.on('message',async raw=>{
    if(busy||(ws.authenticated&&!renewAllowed))return;
    busy=true;renewAllowed=false;
    try{
      const message=JSON.parse(String(raw));
      if(message.type!=='authenticate'||typeof message.token!=='string'||!message.token||message.token.length>12000)throw Error('Credencial inválida');
      const identity=await authenticate(message.token);
      if(!active||ws.readyState!==1)return;
      if(!identity?.userId||!identity.profile?.ativo||!['admin','operador','visualizador'].includes(identity.profile.role))throw Error('Acesso negado');
      if(ws.userId&&ws.userId!==identity.userId)throw Error('Identidade alterada');
      const remaining=Math.min(SESSION_LIMIT,Number(identity.expiresAt)-now());
      if(!Number.isFinite(remaining)||remaining<=0)throw Error('Sessão expirada');
      cancel(deadline);clearSessionTimers();
      const renewed=ws.authenticated===true;
      ws.userId=identity.userId;ws.authenticated=true;
      expiry=schedule(()=>{ws.authenticated=false;active=false;ws.close(4401,'Renovar sessão');},remaining);
      // Old clients may ignore the renewal request: the hard expiration still applies.
      if(remaining>20000)renew=schedule(()=>{
        if(!active||!ws.authenticated||ws.readyState!==1)return;
        renewAllowed=true;ws.send(JSON.stringify({type:'auth_renew'}));
      },remaining-15000);
      const replay=!renewed&&resume?resume(message.cursor):undefined;
      ws.send(JSON.stringify({type:'auth_ok',renewed,payload:identity.profile,...(replay?{resume:replay}:{})}));
    }catch(_error){ws.authenticated=false;if(active)ws.close(4403,'Acesso negado');}
    finally{busy=false;}
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
