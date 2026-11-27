'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const server=read('server.js'),client=read('public/js/app.js'),html=read('public/index.html');
function extract(src,first,last){return src.slice(src.indexOf(first),src.indexOf(last,src.indexOf(first)));}
const limit=src=>src.match(/const VIAGEM_MAX_FUTURE_DAYS = \d+;/)[0];
const maxServer=new Function(limit(server)+extract(server,'function maxViagemDate(','function viagemDateValidationError(')+'return maxViagemDate;')();
const maxClient=new Function(limit(client)+extract(client,'function maxAllowedViagemDate(','function viagemDateValidationMessage(')+'return maxAllowedViagemDate;')();
test('loading date limit is five calendar days in Brazil, including across month/year boundaries',()=>{
 for(const fn of [maxServer,maxClient]){
  assert.equal(fn(new Date('2026-11-27T17:00:00Z')),'2026-12-02');
  assert.equal(fn(new Date('2026-11-28T02:59:59Z')),'2026-12-02');
  assert.equal(fn(new Date('2026-11-28T03:00:00Z')),'2026-12-03');
  assert.equal(fn(new Date('2026-12-31T15:00:00Z')),'2027-01-05');
 }
});
test('both validators reject missing, invalid and dates beyond the fifth day',()=>{
 const validateServer=new Function('maxViagemDate','formatDateBR',limit(server)+extract(server,'function isIsoDate(','function localDateStr(')+extract(server,'function viagemDateValidationError(','function datesBetween(')+'return viagemDateValidationError;')(()=> '2026-12-02',String);
 const validateClient=new Function('maxAllowedViagemDate','formatDateBR',limit(client)+extract(client,'function viagemDateValidationMessage(','function canSaveViagemDate(')+'return viagemDateValidationMessage;')(()=> '2026-12-02',String);
 for(const validate of [validateServer,validateClient]){
  assert.equal(validate('2026-12-02'),'');
  assert.equal(validate('2026-11-27'),'');
  assert.ok(validate('2026-12-03'));
  assert.ok(validate(''));
  assert.ok(validate('2026-02-30'));
 }
});
test('form persists selected date for single and bulk trips and switches dashboard after saving',()=>{
 assert.match(html,/<input type="date" id="f-data" required/);
 assert.match(client,/dateInput\.value=viagem\?\.data\|\|defaults\.data\|\|state\.currentDate/);
 const save=extract(client,'async function saveViagem()','function v(id)');
 assert.match(save,/data: v\('f-data'\)/);
 assert.match(save,/Array\.from\(\{ length: quantidade \}, \(\) => \(\{ \.\.\.data,/);
 assert.match(save,/state\.currentDate=data\.data/);
 assert.match(server,/viagemDateValidationError\(payload\.data\)/);
});
