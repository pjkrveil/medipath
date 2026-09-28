(function(root){
  const H=typeof module!=='undefined'?require('./holidays.js'):root.KRHolidays;
  const date=s=>new Date(s+'T00:00:00Z');
  const iso=d=>d.toISOString().slice(0,10);
  const add=(s,n)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
  const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(date(s))&&iso(date(s))===s;
  const sum=a=>a.reduce((s,p)=>s+p,0);
  const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  function dayInfo(s,custom=[]){
    const official=H.data[s.slice(0,4)]?.[s.slice(5)];
    const user=custom.find(h=>s>=h.start&&s<=h.end);
    const weekend=[0,6].includes(date(s).getUTCDay());
    return {date:s,location:official||user||weekend?'home':'office',reason:[official,user?.name,weekend?'주말':null].filter(Boolean).join(' · ')||'업무일',official:!!official,custom:!!user};
  }
  function validate(state){
    if(!valid(state.visit))throw Error('유효한 병원 방문일을 입력해 주세요.');
    if(!['before','after'].includes(state.timing))throw Error('방문일 복용 여부를 선택해 주세요.');
    if(!integer(state.days,1,365))throw Error('처방 기간은 1~365일의 정수로 입력해 주세요.');
    if(!Array.isArray(state.holidays)||state.holidays.length>200)throw Error('추가 휴일은 최대 200개입니다.');
    for(const h of state.holidays)if(!valid(h.start)||!valid(h.end)||h.start>h.end||typeof h.name!=='string'||h.name.length>60)throw Error('추가 휴일의 이름과 날짜 범위를 확인해 주세요.');
    if(!Array.isArray(state.meds)||state.meds.length!==3)throw Error('세 가지 약의 정보를 확인해 주세요.');
    for(const m of state.meds){
      if(typeof m.name!=='string'||!m.name.trim()||m.name.length>40)throw Error('약 이름은 1~40자로 입력해 주세요.');
      if(!integer(m.dose,1,20)||!integer(m.pack,1,1000)||!integer(m.box,1,100))throw Error(m.name+': 복용량과 포장 수량은 양의 정수로 입력해 주세요.');
      if(!['알','봉'].includes(m.unit)||!['split','pack'].includes(m.policy))throw Error('약의 단위와 배분 방식을 확인해 주세요.');
      if(!integer(m.total,0,10000))throw Error(m.name+': 받은 수량은 0~10,000의 정수로 입력해 주세요.');
      if(m.home!==null&&!integer(m.home,0,m.total))throw Error(m.name+': 집 수량은 0부터 받은 수량 사이로 입력해 주세요.');
      if(m.home!==null&&m.policy==='pack'&&m.home%m.pack!==0&&(m.total-m.home)%m.pack!==0)throw Error(m.name+': 포장 유지 시 집 또는 회사 수량을 '+m.pack+'의 배수로 지정해 주세요.');
    }
    const start=state.timing==='before'?add(state.visit,1):state.visit;
    const end=add(start,state.days-1);
    if(start<H.min||end>H.max)throw Error('공휴일 데이터는 2026~2027년을 지원합니다. 계획 전체 기간을 이 범위 안으로 설정해 주세요.');
    return {start,end};
  }
  function chunks(n,size){const a=[];while(n>0){a.push(Math.min(n,size));n-=size}return a}
  function plan(state){
    const {start,end}=validate(state);
    const days=Array.from({length:state.days},(_,i)=>dayInfo(add(start,i),state.holidays));
    const homeDays=days.filter(d=>d.location==='home').length;
    const results=state.meds.map((m,index)=>{
      const needHome=homeDays*m.dose,needOffice=(state.days-homeDays)*m.dose;
      // Package-preserving initial split. The last incomplete package stays at the office.
      const initialHome=m.home??Math.min(m.total,m.policy==='pack'?Math.ceil(needHome/m.pack)*m.pack:needHome);
      const inventory={home:chunks(initialHome,m.policy==='pack'?m.pack:1),office:chunks(m.total-initialHome,m.policy==='pack'?m.pack:1)};
      const events=[],rows=[];
      function move(from,to,needed,s,phase){
        if(needed<=0)return;
        inventory[from].sort((a,b)=>a-b);
        const packs=[];
        while(sum(packs)<needed&&inventory[from].length){const p=inventory[from].shift();if(p>0){packs.push(p);inventory[to].push(p)}}
        if(packs.length)events.push({date:s,phase,from,to,quantity:sum(packs),packs,med:index,name:m.name,unit:m.unit,policy:m.policy});
      }
      function take(where,n){
        inventory[where].sort((a,b)=>a-b);let left=n;
        while(left>0&&inventory[where].length){const x=Math.min(left,inventory[where][0]);left-=x;inventory[where][0]-=x;if(!inventory[where][0])inventory[where].shift()}
        return n-left;
      }
      function nextHomeNeed(i){let n=0;for(let j=i;j<days.length&&days[j].location==='home';j++)n+=m.dose;return n}
      if(days[0].location==='home')move('office','home',nextHomeNeed(0)-sum(inventory.home),start,'setup');
      days.forEach((d,i)=>{
        if(d.location==='office')move('home','office',m.dose-sum(inventory.office),d.date,'before');
        const available=sum(inventory[d.location]);
        // Never schedule a partial daily dose. Insufficient units remain in inventory.
        const consumed=available>=m.dose?take(d.location,m.dose):0;
        const afterDose={home:sum(inventory.home),office:sum(inventory.office)};
        if(d.location==='office')move('office','home',nextHomeNeed(i+1)-sum(inventory.home),d.date,'after');
        rows.push({...d,consumed,missing:m.dose-consumed,afterDose,home:sum(inventory.home),office:sum(inventory.office)});
      });
      const shortage=m.dose*state.days>m.total?m.dose*state.days-m.total:0;
      return {...m,index,needHome,needOffice,initialHome,initialOffice:m.total-initialHome,events,rows,shortage,
        firstShortage:rows.find(r=>r.missing)?.date??null,last:{home:sum(inventory.home),office:sum(inventory.office)}};
    });
    const order={setup:0,before:1,after:2};
    const events=results.flatMap(r=>r.events).sort((a,b)=>a.date.localeCompare(b.date)||order[a.phase]-order[b.phase]||a.med-b.med);
    return {start,end,days,homeDays,officeDays:state.days-homeDays,results,events};
  }
  const api={date,iso,add,valid,dayInfo,validate,plan};
  if(typeof module!=='undefined')module.exports=api;else root.MediCore=api;
})(typeof window!=='undefined'?window:globalThis);
