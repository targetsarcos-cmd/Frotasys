'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
function extract(file,end){
 const src=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 return src.slice(src.indexOf('function normalizeDescargaDateTime('),src.indexOf(end,src.indexOf('function normalizeDescargaDateTime(')));
}
const server=new Function(extract('server.js','function isIsoDate(')+'return {normalizeDescargaDateTime,validDescargaDateTime};')();
const browser=new Function(extract('public/js/app.js','function maskHourInput(')+'return {normalizeDescargaDateTime,validDescargaDateTime,descargaToInputValue,maskDescargaInput};')();
test('client and server agree on real calendar dates, clearing and malformed legacy values',()=>{
 for(const [raw,canonical,valid] of [
  ['', '', true],
  ['2026-11-28T15:00','15:00 28/11/2026',true],
  ['28/11/2026 15:00','15:00 28/11/2026',true],
  ['15:00 28/11/26','15:00 28/11/2026',true],
  ['20260-11-28T15:00','20260-11-28T15:00',false],
  ['31/02/2026 15:00','31/02/2026 15:00',false],
  ['29/02/2028 23:59','23:59 29/02/2028',true],
  ['29/02/2026 23:59','29/02/2026 23:59',false],
  ['28/11/2026 24:00','28/11/2026 24:00',false],
  ['2026-11-28T15:00oops','2026-11-28T15:00oops',false]
 ])for(const api of [server,browser]){
  assert.equal(api.normalizeDescargaDateTime(raw),canonical);
  assert.equal(api.validDescargaDateTime(raw),valid);
 }
 assert.equal(browser.descargaToInputValue('20260-11-28T15:00'),'20260-11-28T15:00');
 assert.equal(browser.descargaToInputValue('15:00 28/11/2026'),'28/11/2026 15:00');
});
test('numeric input builds the mask, preserves legacy corruption and allows clearing',()=>{
 const input={value:'281120261500',selectionStart:12,setSelectionRange(){}};
 browser.maskDescargaInput(input);
 assert.equal(input.value,'28/11/2026 15:00');
 input.value='20260-11-28T15:00';browser.maskDescargaInput(input);
 assert.equal(input.value,'20260-11-28T15:00');
 input.value='';browser.maskDescargaInput(input);
 assert.equal(input.value,'');
});
