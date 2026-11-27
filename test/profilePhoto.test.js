const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('server.js'),app=read('public/js/app.js');
const source=server.slice(server.indexOf('function normalizeAvatarUrl('),server.indexOf('function normalizeContratoConclusao('));
const photo='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AP//Z';
function fixture(){
  const records=[];
  const api=new Function('TABLES','USER_PROFILE_SETTINGS_FIELD','findOneByJson','updateDoc','insertDoc',source+'return {normalizeAvatarUrl,userProfileSettings,saveUserProfileSettings};')({configOptions:'config'},'__user_profile_settings',async(t,f)=>records.find(r=>r.userId===f.userId&&r.field===f.field),async(t,id,p)=>Object.assign(records.find(r=>r._id===id),p),async(t,p)=>{const r={...p,_id:String(records.length+1)};records.push(r);return r;});
  return {api,records};
}
test('aceita miniatura JPEG limitada e rejeita URLs externas, SVG e dados inválidos',()=>{
  const {api}=fixture();
  assert.equal(api.normalizeAvatarUrl(photo),photo);
  assert.equal(api.normalizeAvatarUrl('https://example.com/image.jpg'),'');
  assert.equal(api.normalizeAvatarUrl('data:image/svg+xml;base64,PHN2Zz4='),'');
  assert.equal(api.normalizeAvatarUrl('data:image/jpeg;base64,AAAA'),'');
  assert.equal(api.normalizeAvatarUrl('data:image/jpeg;base64,'+'A'.repeat(50000)),'');
  const bytes=Buffer.from(photo.split(',')[1],'base64');
  const frame=bytes.indexOf(Buffer.from([0xff,0xc0]));
  bytes.writeUInt16BE(129,frame+7);
  assert.equal(api.normalizeAvatarUrl('data:image/jpeg;base64,'+bytes.toString('base64')),'');
});
test('foto persiste por usuário, edição do nome preserva a foto e remoção é explícita',async()=>{
  const {api}=fixture();
  await api.saveUserProfileSettings('a',{displayName:'Ana',avatarUrl:photo});
  await api.saveUserProfileSettings('b',{displayName:'Bia'});
  assert.equal((await api.userProfileSettings('a')).avatarUrl,photo);
  assert.equal((await api.userProfileSettings('b')).avatarUrl,'');
  await api.saveUserProfileSettings('a',{displayName:'Ana Maria'});
  assert.equal((await api.userProfileSettings('a')).avatarUrl,photo);
  await api.saveUserProfileSettings('a',{avatarUrl:''});
  assert.equal((await api.userProfileSettings('a')).avatarUrl,'');
  assert.equal((await api.userProfileSettings('a')).displayName,'Ana Maria');
});
test('miniaturas aparecem no perfil e nas sessões individuais e múltiplas',()=>{
  const start=app.indexOf('function safeProfilePhoto('),end=app.indexOf('function loggedUserBadgeHtml()',start);
  const ui=new Function('escapeHtml','escapeAttr','initialsFromName',app.slice(start,end)+'return {safeProfilePhoto,profileAvatarContent};')(String,String,()=> 'AM');
  assert.equal(ui.profileAvatarContent('Ana Maria',''),'AM');
  assert.match(ui.profileAvatarContent('Ana Maria',photo),/<img class="profile-avatar-image"/);
  assert.equal(ui.profileAvatarContent('Ana Maria','https://example.com/a'),'AM');
  assert.equal((app.match(/profileAvatarContent\(session.userNameSnapshot,session.userAvatarSnapshot\)/g)||[]).length,2);
  assert.match(server,/userAvatarSnapshot: avatars.get\(session.userId\)/);
  assert.match(server,/userAvatarSnapshot: settings.avatarUrl/);
  assert.match(server,/saveUserProfileSettings\(req.authUser.id/);
  assert.match(app,/canvas.width=128;canvas.height=128/);
});
