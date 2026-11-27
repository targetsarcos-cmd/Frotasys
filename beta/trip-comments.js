'use strict';
const { randomUUID } = require('node:crypto');

class CommentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Apply a single operation, never accept author, timestamps or resolution state from the client.
function applyCommentAction(existing, input, actor, options = {}) {
  const threads = Array.isArray(existing) ? JSON.parse(JSON.stringify(existing)) : [];
  const { id, name, role } = actor || {};
  if (!id || !['admin', 'operador'].includes(role)) throw new CommentError('Sem permissao para comentar.', 403);
  const now = options.now || (() => new Date().toISOString());
  const uuid = options.uuid || randomUUID;
  const action = input?.action;
  const body = () => {
    const value = typeof input?.text === 'string' ? input.text.trim() : '';
    if (!value || value.length > 2000) throw new CommentError('Informe um comentario de 1 a 2000 caracteres.');
    return value;
  };
  const message = () => ({ id: uuid(), authorId:id, authorName:String(name || 'Usuario'), text:body(), createdAt:now() });
  if (action === 'create') {
    if (threads.filter(item => !item.resolvedAt).length >= 50) throw new CommentError('Limite de 50 comentarios ativos por viagem atingido.');
    threads.push({ id:uuid(), messages:[message()], resolvedAt:null });
    return threads;
  }
  if (!['edit','resolve','delete','delete-thread'].includes(action)) throw new CommentError('Acao de comentario invalida.');
  const thread = threads.find(item => item.id === input.threadId);
  if (!thread) throw new CommentError('Comentario nao encontrado.', 404);
  if (thread.resolvedAt) throw new CommentError('Comentario resolvido. O historico esta bloqueado.', 409);
  if (action === 'resolve') {
    return threads.filter(item => item.id !== thread.id);
  }
  if (action === 'delete-thread') {
    if (role !== 'admin' && !thread.messages.every(item => item.authorId === id)) throw new CommentError('Somente o administrador pode excluir a conversa com outros autores.', 403);
    return threads.filter(item => item.id !== thread.id);
  }
  const target = thread.messages.find(item => item.id === input.messageId);
  if (!target) throw new CommentError('Mensagem nao encontrada.', 404);
  if (action === 'delete') {
    if (target.authorId !== id && role !== 'admin') throw new CommentError('Sem permissao para excluir a mensagem.', 403);
    thread.messages = thread.messages.filter(item => item.id !== target.id);
    return thread.messages.length ? threads : threads.filter(item => item.id !== thread.id);
  }
  if (target.authorId !== id) throw new CommentError('Somente o autor pode editar a mensagem.', 403);
  target.text = body();
  target.editedAt = now();
  return threads;
}
const RETENTION_MS=72*60*60*1000;
const nonempty=value=>String(value??'').trim()!=='';
function timestamp(value){
  if(typeof value!=='string'||!value.trim())return null;
  const result=Date.parse(value);
  return Number.isFinite(result)?result:null;
}
function observationStart(trip,now){
  const explicit=timestamp(trip.obsCriadaEm);
  if(explicit!==null)return explicit;
  const history=Array.isArray(trip.historico)?trip.historico:[];
  const changes=history.filter(item=>item?.campo==='obs'&&nonempty(item.atual))
    .map(item=>timestamp(item.dataHora)).filter(value=>value!==null);
  return changes.length?Math.max(...changes):timestamp(trip.createdAt)??now;
}
function observationWritePatch(current,patch,now=Date.now()){
  if(!Object.hasOwn(patch,'obs'))return {};
  if(!nonempty(patch.obs))return {obsCriadaEm:null};
  const start=nonempty(current.obs)?observationStart(current,now):now;
  return {obsCriadaEm:new Date(start).toISOString()};
}
function expiredTripContentPatch(trip,now=Date.now()){
  const patch={};
  if(nonempty(trip.obs)){
    const start=observationStart(trip,now);
    if(now-start>=RETENTION_MS){patch.obs='';patch.obsCriadaEm=null;}
    else if(timestamp(trip.obsCriadaEm)===null)patch.obsCriadaEm=new Date(start).toISOString();
  }
  if(Array.isArray(trip.comentariosBeta)){
    const next=trip.comentariosBeta.flatMap(thread=>{
      if(!thread||!Array.isArray(thread.messages))return [];
      const messages=thread.messages.filter(msg=>{
        const start=timestamp(msg?.createdAt);
        return msg&&(start===null||now-start<RETENTION_MS);
      });
      return messages.length?[{...thread,messages}]:[];
    });
    if(JSON.stringify(next)!==JSON.stringify(trip.comentariosBeta))patch.comentariosBeta=next;
  }
  return patch;
}
module.exports = { CommentError, applyCommentAction, RETENTION_MS, observationWritePatch, expiredTripContentPatch };
