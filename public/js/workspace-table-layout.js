/* Minimum column widths keep controls readable when the trip drawer is open. */
(function(root){
  'use strict';
  const fixed={tipo:108,trabalho:144,actions:76};
  const flexible={placa:91,nome:130,origem:118,destino:104,peso:76,agendamento:98,frete:100};
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
  const api={layout};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysBetaTableLayout=api;
})(typeof globalThis==='object'?globalThis:this);
