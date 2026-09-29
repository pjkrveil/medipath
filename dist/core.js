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
    if(state.allocation){
      const a=state.allocation;
      if(!valid(a.date)||a.date<start||a.date>end||!Array.isArray(a.home)||a.home.length!==3||!a.home.every(n=>integer(n,0,10000)))throw Error('날짜별 재배분 정보를 확인해 주세요.');
    }
    return {start,end};
  }
  function chunks(n,size){const a=[];while(n>0){a.push(Math.min(n,size));n-=size}return a}
  // Preserve individual opened packages when moving stock on a selected date.
  function partition(packs,target){
    if(target===0)return {home:[],office:[...packs]};
    if(target===sum(packs))return {home:[...packs],office:[]};
    const reachable=new Map([[0,null]]);
    for(let i=0;i<packs.length;i++){
      for(const [n,path] of [...reachable]){
        const next=n+packs[i];
        if(next<=target&&!reachable.has(next))reachable.set(next,{index:i,previous:path});
      }
      if(reachable.has(target))break;
    }
    if(!reachable.has(target))throw Error('열린 팩·통의 잔량을 유지할 수 없는 수량입니다. 추천 배분을 사용하거나 알·봉 단위로 나누기를 선택해 주세요.');
    const chosen=new Set();for(let p=reachable.get(target);p;p=p.previous)chosen.add(p.index);
    return {home:packs.filter((_,i)=>chosen.has(i)),office:packs.filter((_,i)=>!chosen.has(i))};
  }
  function recommendHome(packs,need,policy){
    const total=sum(packs);if(policy==='split')return Math.min(total,need);
    const possible=new Set([0]);
    for(const p of packs)for(const n of [...possible])possible.add(n+p);
    return [...possible].sort((a,b)=>a-b).find(n=>n>=need)??total;
  }
  function plan(state){
    const {start,end}=validate(state);
    const days=Array.from({length:state.days},(_,i)=>dayInfo(add(start,i),state.holidays));
    const homeDays=days.filter(d=>d.location==='home').length;
    const results=state.meds.map((m,index)=>{
      const needHome=homeDays*m.dose,needOffice=(state.days-homeDays)*m.dose;
      // Package-preserving initial split. The last incomplete package stays at the office.
      const initialHome=m.home??Math.min(m.total,m.policy==='pack'?Math.ceil(needHome/m.pack)*m.pack:needHome);
      let inventory={home:chunks(initialHome,m.policy==='pack'?m.pack:1),office:chunks(m.total-initialHome,m.policy==='pack'?m.pack:1)};
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
      days.forEach((d,i)=>{
        const rawOpening={home:sum(inventory.home),office:sum(inventory.office),packs:m.policy==='split'?[sum(inventory.home)+sum(inventory.office)]:[...inventory.home,...inventory.office]};
        if(state.allocation?.date===d.date){
          const target=state.allocation.home[index],total=sum(rawOpening.packs);
          if(target>total)throw Error(m.name+': 선택일의 남은 총량을 초과했습니다.');
          const priorHome=sum(inventory.home);
          inventory=m.policy==='split'?{home:chunks(target,1),office:chunks(total-target,1)}:partition(rawOpening.packs,target);
          const delta=target-priorHome;
          if(delta)events.push({date:d.date,phase:'rebalance',from:delta>0?'office':'home',to:delta>0?'home':'office',quantity:Math.abs(delta),packs:[],med:index,name:m.name,unit:m.unit,policy:m.policy});
        }
        const opening={home:sum(inventory.home),office:sum(inventory.office)};
        if((i===0||state.allocation?.date===d.date)&&d.location==='home')move('office','home',nextHomeNeed(i)-sum(inventory.home),d.date,'setup');
        if(d.location==='office')move('home','office',m.dose-sum(inventory.office),d.date,'before');
        const beforeDose={home:sum(inventory.home),office:sum(inventory.office)};
        const available=sum(inventory[d.location]);
        // Never schedule a partial daily dose. Insufficient units remain in inventory.
        const consumed=available>=m.dose?take(d.location,m.dose):0;
        const afterDose={home:sum(inventory.home),office:sum(inventory.office)};
        if(d.location==='office')move('office','home',nextHomeNeed(i+1)-sum(inventory.home),d.date,'after');
        rows.push({...d,consumed,missing:m.dose-consumed,rawOpening,opening,beforeDose,afterDose,home:sum(inventory.home),office:sum(inventory.office)});
      });
      const shortage=m.dose*state.days>m.total?m.dose*state.days-m.total:0;
      return {...m,index,needHome,needOffice,initialHome,initialOffice:m.total-initialHome,events,rows,shortage,
        firstShortage:rows.find(r=>r.missing)?.date??null,last:{home:sum(inventory.home),office:sum(inventory.office)}};
    });
    const order={rebalance:-1,setup:0,before:1,after:2};
    const events=results.flatMap(r=>r.events).sort((a,b)=>a.date.localeCompare(b.date)||order[a.phase]-order[b.phase]||a.med-b.med);
    return {start,end,days,homeDays,officeDays:state.days-homeDays,results,events};
  }
  const api={date,iso,add,valid,dayInfo,validate,plan,partition,recommendHome};
  if(typeof module!=='undefined')module.exports=api;else root.MediCore=api;
})(typeof window!=='undefined'?window:globalThis);
