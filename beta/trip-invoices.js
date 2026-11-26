'use strict';
const FIELDS=Object.freeze(['nota',...Array.from({length:14},(_,i)=>'nota'+(i+2))]);
function digits(value){return String(value??'').replace(/\D/g,'');}
function format(value){return digits(value).replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
function invoiceEntries(trip={}){return FIELDS.map(key=>({key,value:format(trip[key])})).filter(item=>item.value);}
function invoicePatch(current={},patch={}){
  for(const key of Object.keys(patch)){
    if(/^nota\d+$/.test(key)&&!FIELDS.includes(key))throw Error('Limite de 15 notas fiscais por viagem.');
    if(FIELDS.includes(key)&&patch[key]!=null&&!['string','number'].includes(typeof patch[key]))throw Error('Numero de nota fiscal invalido.');
  }
  if(!FIELDS.some(key=>Object.hasOwn(patch,key)))return {};
  const entries=invoiceEntries({...current,...patch}),seen=new Set();
  for(const {value} of entries){
    if(seen.has(digits(value)))throw Error('Nota fiscal repetida na mesma viagem: '+value);
    seen.add(digits(value));
  }
  const result={};
  FIELDS.forEach((key,index)=>{
    const value=entries[index]?.value||'';
    if(Object.hasOwn(patch,key)||value!==format(current[key]))result[key]=value;
  });
  return result;
}
module.exports={FIELDS,digits,format,invoiceEntries,invoicePatch};
