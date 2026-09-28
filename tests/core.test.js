const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
function state(overrides={}){
  return {visit:'2026-09-23',timing:'after',days:90,holidays:[],meds:[
    {name:'약 A',dose:1,unit:'알',pack:10,box:3,total:90,home:null,policy:'pack'},
    {name:'약 B',dose:1,unit:'봉',pack:90,box:1,total:90,home:null,policy:'pack'},
    {name:'약 C',dose:2,unit:'알',pack:30,box:1,total:180,home:null,policy:'pack'}
  ],...overrides};
}
test('visit timing shifts both inclusive period boundaries by one day',()=>{
  const a=C.plan(state()),b=C.plan(state({timing:'before'}));
  assert.equal(a.start,'2026-09-23');assert.equal(a.end,'2026-12-21');
  assert.equal(b.start,'2026-09-24');assert.equal(b.end,'2026-12-22');
});
test('90-day holiday-heavy example: 30 home / 60 office',()=>{
  const p=C.plan(state());assert.equal(p.homeDays,30);assert.equal(p.officeDays,60);
  assert.deepEqual(p.results.map(m=>[m.needHome,m.needOffice]),[[30,60],[30,60],[60,120]]);
});
test('2026 amendments, election, substitutes and non-substituted Memorial Day',()=>{
  for(const d of ['2026-05-01','2026-06-03','2026-07-17','2026-08-17','2026-10-05','2027-05-03','2027-07-19'])assert.equal(C.dayInfo(d).location,'home',d);
  for(const d of ['2026-06-08','2026-09-28','2027-06-07'])assert.equal(C.dayInfo(d).location,'office',d);
});
test('full-year holiday and weekend totals agree with KASA 2027 announcement',()=>{
  for(const [year,expected] of [[2026,120],[2027,119]]){
    let count=0;for(let i=0;i<365;i++)if(C.dayInfo(C.add(`${year}-01-01`,i)).location==='home')count++;
    assert.equal(count,expected,year.toString());
  }
});
test('overlapping personal holidays count each calendar day once',()=>{
  const p=C.plan(state({holidays:[{start:'2026-09-28',end:'2026-09-29',name:'연차'},{start:'2026-09-29',end:'2026-09-29',name:'재택'}]}));
  assert.equal(p.homeDays,32);assert.equal(p.officeDays,58);
});
test('exact split allocation needs no transfers',()=>{
  const s=state();s.meds.forEach(m=>m.policy='split');const p=C.plan(s);
  assert.equal(p.events.length,0);p.results.forEach(m=>assert.deepEqual(m.last,{home:0,office:0}));
});
test('sealed 90-unit container moves whole, including opened remainder',()=>{
  const m=C.plan(state()).results[1];assert.equal(m.initialHome,90);
  assert.deepEqual(m.events.slice(0,3).map(e=>[e.date,e.phase,e.quantity]),[
    ['2026-09-23','before',90],['2026-09-23','after',89],['2026-09-28','before',85]
  ]);m.events.forEach(e=>assert.equal(e.packs.length,1));
});
test('manual allocation retrieves holiday stock on the preceding workday',()=>{
  const s=state();s.meds[0].home=0;s.meds[0].policy='split';
  const m=C.plan(s).results[0],e=m.events[0];
  assert.deepEqual([e.date,e.phase,e.from,e.to,e.quantity],['2026-09-23','after','office','home',4]);
});
test('holiday-only start with all stock at office requires explicit setup',()=>{
  const s=state({visit:'2026-09-24',days:3});s.meds.forEach(m=>{m.total=3*m.dose;m.home=0});
  const p=C.plan(s);assert.equal(p.officeDays,0);assert.ok(p.events.every(e=>e.phase==='setup'));
  p.results.forEach(m=>assert.equal(m.firstShortage,null));
});
test('shortage does not count a partial daily dose',()=>{
  const s=state({days:1});s.meds[2].total=1;
  const m=C.plan(s).results[2];assert.equal(m.rows[0].consumed,0);assert.equal(m.rows[0].missing,2);
  assert.equal(m.last.home+m.last.office,1);assert.equal(m.shortage,1);
});
test('surplus stays in final inventory and invalid inputs fail visibly',()=>{
  const s=state();s.meds[0].total=100;const m=C.plan(s).results[0];assert.equal(m.last.home+m.last.office,10);
  assert.throws(()=>C.plan(state({days:1.5})),/정수/);
  assert.throws(()=>C.plan(state({visit:'2026-02-30'})),/유효/);
  assert.throws(()=>C.plan(state({visit:'2027-12-31',days:2})),/2026~2027/);
  s.meds[0].home=11;assert.throws(()=>C.plan(s),/포장 유지/);
});
test('daily inventory conservation and valid commute dates across package sizes',()=>{
  for(const start of ['2026-01-01','2026-02-14','2026-09-23','2027-01-20'])
  for(const period of [1,7,31,90])for(const policy of ['split','pack'])for(const allocation of ['auto','home','office']){
    const s=state({visit:start,days:period});s.meds.forEach(m=>{m.total=period*m.dose;m.policy=policy;m.home=allocation==='auto'?null:allocation==='home'?m.total:0});
    const p=C.plan(s);
    assert.equal(p.homeDays+p.officeDays,period);
    for(const m of p.results){
      let consumed=0;
      for(const row of m.rows){consumed+=row.consumed;assert.equal(consumed+row.home+row.office,m.total);assert.ok(row.home>=0&&row.office>=0);assert.equal(row.missing,0)}
      for(const e of m.events){assert.ok(e.quantity>0);assert.equal(e.quantity,e.packs.reduce((a,b)=>a+b,0));if(e.phase!=='setup')assert.equal(C.dayInfo(e.date,s.holidays).location,'office')}
      assert.equal(m.last.home+m.last.office,0);
    }
  }
});
