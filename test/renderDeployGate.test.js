'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDeployGate}=require('../beta/render-deploy-gate');
const sha='a'.repeat(40),other='b'.repeat(40);
const env={RENDER:'true',RENDER_SERVICE_ID:'srv-example',RENDER_GIT_COMMIT:sha,RENDER_API_KEY:'test-only'};
const row=(status,id=sha)=>({deploy:{status,commit:{id}}});
const response=rows=>({ok:true,json:async()=>rows});
test('only live current commit qualifies',async()=>{
 for(const [rows,expected] of [
  [[row('live')],true],[[row('update_in_progress')],false],
  [[row('build_failed')],false],[[row('canceled')],false],
  [[row('live',other)],false],[[row('live'),row('live',other)],false],[[],false]
 ]){
  const gate=createDeployGate({env,fetchImpl:async()=>response(rows)});
  assert.equal(await gate.verify(sha),expected);
 }
});
test('missing credentials, local runtime and mismatched version never query API',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return response([row('live')]);};
 for(const configuration of [{},{...env,RENDER_API_KEY:''},{...env,RENDER_SERVICE_ID:''}]){
  assert.equal(await createDeployGate({env:configuration,fetchImpl}).verify(sha),false);
 }
 assert.equal(await createDeployGate({env,fetchImpl}).verify(other),false);
 assert.equal(calls,0);
});
test('concurrent requests share cache and failures never permit notices',async()=>{
 let now=0,calls=0;let live=false;
 const gate=createDeployGate({env,now:()=>now,fetchImpl:async(url,options)=>{
  calls++;assert.match(url,/srv-example\/deploys\?status=live/);assert.equal(options.headers.Authorization,'Bearer test-only');
  if(!live)throw Error('offline');
  return response([row('live')]);
 }});
 assert.deepEqual(await Promise.all([gate.verify(sha),gate.verify(sha)]),[false,false]);
 assert.equal(calls,1);live=true;
 assert.equal(await gate.verify(sha),false);assert.equal(calls,1);
 now=30001;assert.equal(await gate.verify(sha),true);assert.equal(calls,2);
});
