const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function payload(name='내 약'){
  return {version:2,plan:{version:1,visit:'2026-09-23',timing:'after',days:90,holidays:[],meds:[
    {name,dose:1,unit:'알',pack:10,box:3,total:90,autoTotal:true,policy:'split',home:null},
    {name:'B',dose:1,unit:'봉',pack:90,box:1,total:90,autoTotal:true,policy:'pack',home:null},
    {name:'C',dose:2,unit:'알',pack:30,box:1,total:180,autoTotal:true,policy:'pack',home:null}
  ]},preferences:{theme:'light',selectedDate:'2026-09-23',balanceMoment:'closing'}};
}
function mockSdk(existing=null){
  let session=null,listener=()=>{},revision=existing?1:0,settings=existing,calls=[];
  const client={auth:{
    getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null}),
    onAuthStateChange:f=>{listener=f;return {data:{subscription:{unsubscribe(){}}}}},
    signInWithOtp:async args=>{calls.push(['send',args]);return {error:null}},
    verifyOtp:async args=>{
      calls.push(['verify',args]);if(args.token!=='123456')return {error:{message:'Invalid OTP',status:400}};
      session={user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:args.email}};listener('SIGNED_IN',session);return {data:{session},error:null};
    },signOut:async()=>{session=null;listener('SIGNED_OUT',null);return {error:null}}
  },
  from(){
    return {select:()=>({eq:()=>({maybeSingle:async()=>({data:settings?{settings:structuredClone(settings),revision}:null,error:null})})})};
  },
  rpc:async(_,p)=>{calls.push(['save',p]);if(p.p_expected_revision!==revision)return {error:{code:'40001'}};settings=structuredClone(p.p_settings);return {data:{revision:++revision},error:null}}
  };
  return {client,calls,get settings(){return settings}};
}
function boot(sdk){
  const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://example.github.io/medipath/',runScripts:'outside-only'}),w=dom.window;
  w.structuredClone=structuredClone;w.confirm=()=>true;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.localStorage.setItem('medipath.plan.v1',JSON.stringify(payload('게스트 약')));
  w.MEDIPATH_CONFIG=sdk?{supabaseUrl:'https://test.supabase.co',supabasePublishableKey:'sb_publishable_test'}:{};
  if(sdk)w.supabase={createClient:()=>sdk.client};
  for(const file of ['holidays','core','cloud','account','app'])w.eval(fs.readFileSync('dist/'+file+'.js','utf8'));
  return {dom,w,$:s=>w.document.querySelector(s),change:(s,value)=>{const e=w.document.querySelector(s);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}))},submit:s=>w.document.querySelector(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))};
}
test('UI: selected-day cards, before-dose stock, manual reallocation and guest save',async()=>{
  const b=boot();try{
    assert.equal(b.$('#error').hidden,true);assert.equal(b.w.document.querySelectorAll('.balance-card').length,3);
    b.change('#balance-moment','beforeDose');const card=b.w.document.querySelectorAll('.balance-card')[1];
    assert.match(card.querySelector('.office-balance').textContent,/90/);assert.match(card.querySelector('.home-balance').textContent,/0/);
    b.$('[data-day="2026-09-28"]').click();b.$('#allocation-open').click();assert.equal(b.$('#allocation-dialog').open,true);
    b.$('#rehome-0').value='10';b.$('#reoffice-0').value='75';
    b.submit('#allocation-form');assert.equal(b.$('#allocation-dialog').open,false);assert.equal(b.$('#allocation-status').hidden,false);
    const saved=JSON.parse(b.w.localStorage.getItem('medipath.plan.v1'));assert.equal(saved.plan.allocation.home[0],10);assert.equal(saved.plan.allocation.date,'2026-09-28');
    b.$('#allocation-clear').click();assert.equal(b.$('#allocation-status').hidden,true);
    b.$('#account-open').click();assert.equal(b.$('#account-unavailable').hidden,false);
  }finally{b.dom.window.close()}
});
test('UI: email code errors, cloud restore, theme saving, and guest isolation on logout',async()=>{
  const cloud=payload('계정 A의 약');cloud.preferences.theme='dark';const sdk=mockSdk(cloud),b=boot(sdk);
  try{
    await sleep(30);b.$('#account-open').click();b.$('#login-email').value='a@example.com';b.$('#send-code').click();await sleep(10);
    assert.equal(sdk.calls.filter(c=>c[0]==='send').length,1);assert.equal(b.$('#otp-section').hidden,false);
    b.$('#login-code').value='000000';b.submit('#account-form');await sleep(10);assert.match(b.$('#account-error').textContent,/올바르지/);assert.equal(b.$('#account-email').hidden,true);
    b.$('#login-code').value='123456';b.submit('#account-form');await sleep(70);
    assert.equal(b.$('#account-email').textContent,'a@example.com');assert.match(b.$('#meds').textContent,/계정 A의 약/);assert.equal(b.w.document.documentElement.dataset.theme,'dark');
    assert.equal(sdk.calls.filter(c=>c[0]==='save').length,0,'existing settings must not be overwritten at login');
    b.$('#theme').click();await sleep(20);assert.equal(sdk.settings.preferences.theme,'light');
    assert.equal(JSON.parse(b.w.localStorage.getItem('medipath.plan.v1')).plan.meds[0].name,'게스트 약');
    b.$('#account-logout').click();await sleep(30);assert.equal(b.$('#account-email').textContent,'');assert.match(b.$('#meds').textContent,/게스트 약/);assert.doesNotMatch(b.$('#meds').textContent,/계정 A의 약/);
  }finally{b.dom.window.close()}
});
test('UI: first email login stores the current plan, without a fake local-only success',async()=>{
  const sdk=mockSdk(),b=boot(sdk);try{
    await sleep(30);b.$('#account-open').click();b.$('#login-email').value='new@example.com';b.$('#send-code').click();await sleep(10);b.$('#login-code').value='123456';b.submit('#account-form');await sleep(70);
    assert.equal(sdk.calls.filter(c=>c[0]==='save').length,1);assert.equal(sdk.settings.plan.meds[0].name,'게스트 약');assert.equal(b.$('#save-status').textContent,'계정에 저장됨');
  }finally{b.dom.window.close()}
});
