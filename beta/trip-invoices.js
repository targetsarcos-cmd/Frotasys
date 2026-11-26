'use strict';
const FIELDS=Object.freeze(['nota',...Array.from({length:14},(_,i)=>'nota'+(i+2))]);
const TIME_FIELDS=Object.freeze(['hora_nf',...Array.from({length:14},(_,i)=>'hora_nf'+(i+2))]);
function digits(value){return String(value??'').replace(/\D/g,'');}
function format(value){return digits(value).replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
function normalizeTime(value){
  if(value==null||value==='')return '';
  if(typeof value!=='string')throw Error('Hora NF invalida.');
  const raw=value.trim();
  if(!raw)return '';
  const match=/^(\d{1,2}):(\d{2})$/.exec(raw);
  if(!match||Number(match[1])>23||Number(match[2])>59)throw Error('Hora NF invalida. Informe HH:MM.');
  return match[1].padStart(2,'0')+':'+match[2];
}
function invoiceEntries(trip={}){
  return FIELDS.map(key=>({key,value:format(trip[key])})).filter(item=>item.value);
}
function invoicePatch(current={},patch={}){
  const merged={...current,...patch};
  const result={};
  for(const key of Object.keys(patch)){
    if((/^nota\d+$/.test(key)&&!FIELDS.includes(key))||(/^hora_nf\d+$/.test(key)&&!TIME_FIELDS.includes(key)))throw Error('Limite de 15 notas fiscais por viagem.');
    if(FIELDS.includes(key)&&patch[key]!=null&&!['string','number'].includes(typeof patch[key]))throw Error('Numero de nota fiscal invalido.');
    if(TIME_FIELDS.includes(key)){
      const index=TIME_FIELDS.indexOf(key);
      const time=normalizeTime(patch[key]);
      if(index>0&&time&&!format(merged[FIELDS[index]]))throw Error('Preencha a nota fiscal antes de informar sua hora.');
      merged[key]=time;
      result[key]=time;
    }
  }
  if(!FIELDS.some(key=>Object.hasOwn(patch,key)))return result;
  const entries=FIELDS.map((key,index)=>({value:format(merged[key]),time:merged[TIME_FIELDS[index]]??''})).filter(item=>item.value),seen=new Set();
  for(const {value} of entries){
    if(seen.has(digits(value)))throw Error('Nota fiscal repetida na mesma viagem: '+value);
    seen.add(digits(value));
  }
  FIELDS.forEach((key,index)=>{
    const timeKey=TIME_FIELDS[index];
    const value=entries[index]?.value||'';
    // Compact invoice/time pairs together. Preserve the legacy primary prefilled
    // time only when there was no invoice and none was removed.
    const time=entries[index]?.time??(index===0&&!entries.length&&!format(current.nota)?(merged.hora_nf??''):'');
    if(Object.hasOwn(patch,key)||value!==format(current[key]))result[key]=value;
    if(Object.hasOwn(patch,timeKey)||time!==(current[timeKey]??''))result[timeKey]=time;
  });
  return result;
}
module.exports={FIELDS,TIME_FIELDS,digits,format,invoiceEntries,invoicePatch,normalizeTime};
