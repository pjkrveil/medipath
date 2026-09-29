const test=require('node:test'),assert=require('node:assert/strict');
const {CloudStore}=require('../dist/cloud.js');
function client({row=null,rpc}={}){return {from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:row,error:null})}}}}}},rpc:rpc??(async()=>({data:{revision:1},error:null}))}}
test('existing settings load before any write; validation rejects malformed cloud data',async()=>{
  const c=client({row:{settings:{valid:true},revision:4}}),s=new CloudStore(c,x=>assert.equal(x.valid,true));
  assert.deepEqual((await s.load('user-a')).settings,{valid:true});assert.equal(s.revision,4);
  const bad=new CloudStore(client({row:{settings:{},revision:2}}),x=>assert.equal(x.valid,true));
  await assert.rejects(bad.load('user-a'));assert.equal(bad.blocked,true);
});
test('save queue serializes changes and uses returned revisions',async()=>{
  let release;const gate=new Promise(r=>release=r),calls=[];
  const s=new CloudStore(client({rpc:async(_,p)=>{calls.push(p);if(calls.length===1)await gate;return {data:{revision:calls.length},error:null}}}),()=>{});
  await s.load('a');const first=s.save({n:1});s.save({n:2});s.save({n:3});release();await first;await s.flush();
  assert.deepEqual(calls.map(p=>[p.p_settings.n,p.p_expected_revision]),[[1,0],[3,1]]);
  assert.equal(s.revision,2);
});
test('conflict blocks automatic overwrite and preserves pending changes',async()=>{
  const statuses=[],s=new CloudStore(client({rpc:async()=>({error:{code:'40001'}})}),()=>{},x=>statuses.push(x));
  await s.load('a');await s.save({n:1});assert.equal(s.blocked,true);assert.deepEqual(s.pending,{n:1});assert.equal(statuses.at(-1),'conflict');
});
test('network failure is not reported as saved; retry succeeds',async()=>{
  let calls=0;const statuses=[],s=new CloudStore(client({rpc:async()=>++calls===1?{error:{message:'offline'}}:{data:{revision:1}}}),()=>{},x=>statuses.push(x));
  await s.load('a');await s.save({n:1});assert.equal(statuses.at(-1),'save-error');await s.retry();assert.equal(statuses.at(-1),'saved');assert.equal(s.pending,null);
});
test('logout discards queued work and stale replies cannot change account state',async()=>{
  let release;const gate=new Promise(r=>release=r),statuses=[];
  const s=new CloudStore(client({rpc:async()=>{await gate;return {data:{revision:99}}}}),()=>{},x=>statuses.push(x));
  await s.load('a');const operation=s.save({secret:'a'});s.save({secret:'later'});s.detach();release();await operation;
  assert.equal(s.userId,null);assert.equal(s.pending,null);assert.equal(s.revision,0);assert.notEqual(statuses.at(-1),'saved');
});
