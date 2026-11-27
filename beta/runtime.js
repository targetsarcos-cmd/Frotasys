'use strict';
// npm start serves the approved workspace. The separate beta launcher remains
// explicitly isolated by its own readonly/editable mode and credentials.
function resolveRuntime(env={}){
  const pilotReadOnly=env.FROTASYS_INTERFACE_BETA==='readonly';
  const pilotEditable=env.FROTASYS_INTERFACE_BETA==='editable';
  const pilot=pilotReadOnly||pilotEditable;
  return {pilot,pilotReadOnly,pilotEditable,production:!pilot,editable:!pilotReadOnly};
}
function canAccessUser(runtime,userId,env={}){
  return !!userId&&(!runtime.pilot||userId===env.BETA_USER_ID);
}
module.exports={resolveRuntime,canAccessUser};
