/* Minimum column widths keep controls readable when the trip drawer is open. */
(function(root){
  'use strict';
  const fixed={tipo:104,trabalho:132,actions:72};
  const flexible={placa:85,nome:120,origem:112,destino:98,produto:78,peso:68,agendamento:94,frete:100};
  function layout(keys){
    const hasStatus=keys.includes('status');
    const fixedWidth=keys.reduce((sum,key)=>sum+(fixed[key]||0),0);
    const flexWidth=keys.reduce((sum,key)=>sum+(key==='status'||fixed[key]?0:flexible[key]||100),0);
    const status=hasStatus?' + var(--beta-status-column)':'';
    const minimum=fixedWidth+flexWidth;
    const surplus='(100% - '+fixedWidth+'px'+(hasStatus?' - var(--beta-status-column)':'')+')';
    return {
      minWidth:'calc('+minimum+'px'+status+')',
      columns:keys.map(key=>key==='status'?'var(--beta-status-column)':fixed[key]?fixed[key]+'px':
        'calc('+surplus+' * '+((flexible[key]||100)/flexWidth)+')')
    };
  }

  const keys=['placa','nome','tipo','origem','destino','produto','peso','agendamento','frete','eixos','carroceria','pamcard','telefone','telefone2','descarga','dt','cte','manifesto','contrato','nota','hora_nf','num_pedagio','vlr_pedagio','valor_adiantamento','horas','usuario','data','obs','status','trabalho'];
  const extraKeys=keys.filter(k=>!['placa','nome','tipo','origem','destino','produto','peso','agendamento','status','trabalho'].includes(k));
  function normalizePreference(value){
    const input=value&&typeof value==='object'?value:{};
    const order=[...new Set(Array.isArray(input.order)?input.order.filter(k=>keys.includes(k)):[])];
    const alignment={};
    for(const key of keys){
      const align=input.alignment?.[key];
      if(['left','center','right'].includes(align))alignment[key]=align;
    }
    const extra=Array.isArray(input.extra)?[...new Set(input.extra.filter(k=>extraKeys.includes(k)))]:null;
    return {order,alignment,extra};
  }
  function orderFields(fields,preference){
    const rank=new Map(normalizePreference(preference).order.map((key,i)=>[key,i]));
    return fields.slice().sort((a,b)=>(rank.get(a.key)??Infinity)-(rank.get(b.key)??Infinity));
  }
  function moveField(order,key,target){
    if(key===target||!order.includes(key)||!order.includes(target))return order.slice();
    const next=order.filter(k=>k!==key);
    next.splice(order.indexOf(target),0,key);
    return next;
  }
  const api={layout,normalizePreference,orderFields,moveField};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysBetaTableLayout=api;
})(typeof globalThis==='object'?globalThis:this);
