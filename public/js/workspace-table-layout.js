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
  const api={layout};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FrotasysBetaTableLayout=api;
})(typeof globalThis==='object'?globalThis:this);
