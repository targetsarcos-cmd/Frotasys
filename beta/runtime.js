'use strict';
// npm start serves the approved workspace. The separate beta launcher remains
// explicitly isolated by its own readonly/editable mode and credentials.
function resolveRuntime(env={}){
  const pilotReadOnly=env.FROTASYS_INTERFACE_BETA==='readonly';
  const pilotEditable=env.FROTASYS_INTERFACE_BETA==='editable';
  const pilot=pilotReadOnly||pilotEditable;
  const classic=env.FROTASYS_INTERFACE_BETA==='classic';
  return {pilot,pilotReadOnly,pilotEditable,classic,workspace:!classic,production:!pilot,editable:!pilotReadOnly&&!classic};
}
function canAccessUser(runtime,userId,env={}){
  return !!userId&&(!runtime.pilot||userId===env.BETA_USER_ID);
}
module.exports={resolveRuntime,canAccessUser};
