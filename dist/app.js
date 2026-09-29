/* Static app with optional email authentication and account settings. */
(()=>{
  'use strict';
  const C=window.MediCore,H=window.KRHolidays,$=s=>document.querySelector(s);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateLabel=s=>`${+s.slice(5,7)}월 ${+s.slice(8,10)}일`;
  const fullDate=s=>s.replaceAll('-','.');
  const weekday=s=>'일월화수목금토'[C.date(s).getUTCDay()];
  const loc=x=>x==='home'?'집':'회사';
  const phase=x=>({rebalance:'직접 재배분 · 복용 전',setup:'복용 전 미리 준비',before:'출근 시 · 복용 전',after:'퇴근 시 · 복용 후'}[x]);
  const key='medipath.plan.v1';
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const defaultDate=today>=H.min&&today<='2027-10-01'?today:'2026-09-23';
  let state={version:1,visit:defaultDate,timing:'after',days:90,holidays:[],meds:[
    {name:'약 A',dose:1,unit:'알',pack:10,box:3,total:90,autoTotal:true,policy:'pack',home:null},
    {name:'약 B',dose:1,unit:'봉',pack:90,box:1,total:90,autoTotal:true,policy:'pack',home:null},
    {name:'약 C',dose:2,unit:'알',pack:30,box:1,total:180,autoTotal:true,policy:'pack',home:null}
  ]};
  let saving=false,plan,month,selected,editingMed=null,removingMed=null,toastTimer,dirty=false,account=null,balanceMoment='closing',allocationBase=null;
  function snapshot(){return {version:2,plan:structuredClone(state),preferences:{theme:document.documentElement.dataset.theme||'light',selectedDate:selected,balanceMoment}}}
  function validateSettings(x){
    if(!x||x.version!==2||!x.plan||!x.preferences)throw Error('저장된 설정 형식을 확인해 주세요.');
    C.plan(x.plan);
    if(!['light','dark'].includes(x.preferences.theme)||!['opening','beforeDose','closing'].includes(x.preferences.balanceMoment)||!C.valid(x.preferences.selectedDate))throw Error('저장된 화면 설정을 확인해 주세요.');
  }
  function restoreSettings(x){
    validateSettings(x);for(const id of ['med-dialog','remove-dialog','allocation-dialog'])if($('#'+id).open)$('#'+id).close();editingMed=null;removingMed=null;state=structuredClone(x.plan);selected=x.preferences.selectedDate;balanceMoment=x.preferences.balanceMoment;month=selected.slice(0,7);dirty=false;
    document.documentElement.dataset.theme=x.preferences.theme;$('#theme').setAttribute('aria-label',x.preferences.theme==='dark'?'밝은 테마로 변경':'어두운 테마로 변경');
    $('#balance-moment').value=balanceMoment;syncForm();compute();$('#sample-label').textContent=account?.isActive()?'내 계정의 계획':'내 기기의 계획';
  }
  try{const saved=localStorage.getItem(key);if(saved){const x=JSON.parse(saved);if(x.version===2&&x.plan){validateSettings(x);state=x.plan;selected=x.preferences.selectedDate;month=selected.slice(0,7);balanceMoment=x.preferences.balanceMoment;document.documentElement.dataset.theme=x.preferences.theme}else{C.validate(x);state=x}saving=true;$('#sample-label').textContent='저장된 내 계획'}}catch{ $('#save-status').textContent='저장된 계획을 불러오지 못했습니다'; }
  function persist(){
    if(account?.isActive()){account.save(snapshot());return}
    if(!saving){$('#save-status').textContent='기기에 저장하지 않음';return}
    try{localStorage.setItem(key,JSON.stringify(snapshot()));$('#save-status').textContent='이 기기에 저장됨'}catch{$('#save-status').textContent='저장 실패 · 브라우저 저장 공간 확인';toast('계산은 완료했지만 기기에 저장하지 못했습니다.')}
  }
  function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,3500)}
  function syncForm(){
    $('#visit').value=state.visit;$('#days').value=state.days;
    $(`input[name=timing][value=${state.timing}]`).checked=true;$('#save-local').checked=saving;
  }
  function packaging(q,m){
    if(q===0)return '없음';
    const noun=m.box>1?'팩':'통',n=Math.floor(q/m.pack),r=q%m.pack;
    return [n?`${n}${noun}`:'',r?`${r}${m.unit} ${m.policy==='pack'?'부분 포장':''}`:''].filter(Boolean).join(' + ');
  }
  function movePackaging(e,m){
    if(e.phase==='rebalance')return '선택일 복용 전에 직접 옮겨 둘 수량';
    if(m.policy==='split')return `${e.quantity}${m.unit} 나눠 이동`;
    const noun=m.box>1?'팩':'통',full=e.packs.filter(p=>p===m.pack).length,parts=e.packs.filter(p=>p<m.pack);
    return [full?`${m.pack}${m.unit} × ${full}${noun}`:'',...parts.map(p=>`남은 ${p}${m.unit} ${noun}째`)].filter(Boolean).join(' + ');
  }
  function compute({resetMonth=false}={}){
    try{
      plan=C.plan(state);$('#error').hidden=true;$('#results').hidden=false;
      if(resetMonth||!month||month<plan.start.slice(0,7)||month>plan.end.slice(0,7))month=plan.start.slice(0,7);
      if(!selected||selected<plan.start||selected>plan.end)selected=plan.start;
      $('#period-note').textContent=`새 처방 복용 ${fullDate(plan.start)} — ${fullDate(plan.end)} · ${state.timing==='before'?'방문일 복용분 제외':'방문일 포함'}`;
      renderSummary();renderMeds();renderCalendar();renderEvents();renderShortages();persist();return true;
    }catch(e){$('#error').textContent=e.message;$('#error').hidden=false;$('#results').hidden=true;return false}
  }
  function renderSummary(){
    const first=plan.events.find(e=>e.phase!=='setup')||plan.events[0];
    const dateGroups=new Set(plan.events.map(e=>e.date));
    $('#summary').innerHTML=`
      <article class="summary-card"><div class="summary-label">전체 복용 기간 <span>CALENDAR</span></div><div class="summary-value">${state.days}<span>일</span></div><p>${fullDate(plan.start)} — ${fullDate(plan.end)}</p></article>
      <article class="summary-card home"><div class="summary-label"><span class="home-key">집에서 먹는 날</span></div><div class="summary-value">${plan.homeDays}<span>일</span></div><p>주말 · 공휴일 · 나의 휴일</p></article>
      <article class="summary-card office"><div class="summary-label"><span class="office-key">회사에서 먹는 날</span></div><div class="summary-value">${plan.officeDays}<span>일</span></div><p>휴일을 제외한 평일</p></article>
      <article class="summary-card"><div class="summary-label">첫 이동일 <span>↔</span></div><div class="summary-value date">${first?dateLabel(first.date):'이동 없음'}</div><p>${first?`${phase(first.phase)} · 총 ${dateGroups.size}일에 이동`:'처음 나눈 수량으로 복용 가능'}</p></article>`;
  }
  function renderMeds(){
    $('#med-count').textContent=state.meds.length+'개';
    $('#med-add').disabled=state.meds.length>=100;
    $('#med-add').title=state.meds.length>=100?'약은 최대 100개까지 등록할 수 있습니다.':'';
    $('#export').disabled=!state.meds.length;
    $('#meds').innerHTML=plan.results.length?plan.results.map((m,i)=>{
      const percentage=m.total?m.initialHome/m.total*100:0,name=escape(m.name);
      return `<article class="med-row" aria-labelledby="med-title-${i}">
        <div class="med-identity"><span class="med-number">${String(i+1).padStart(2,'0')}</span><div><h3 id="med-title-${i}">${name}</h3><p>하루 ${m.dose}${m.unit} · ${m.pack}${m.unit} × ${m.box}${m.box>1?'팩':'통'}</p><span class="med-stock ${m.shortage?'stock-warning':''}">${m.shortage?`${m.shortage}${m.unit} 부족`:`종료 후 ${m.last.home+m.last.office}${m.unit}`}</span></div></div>
        <div class="med-quantity"><label for="total-${i}">받은 수량</label><span class="input-suffix"><input id="total-${i}" data-total="${i}" aria-label="${name} 받은 수량" type="number" min="0" max="10000" step="1" value="${m.total}" required><span>${m.unit}</span></span><div class="row-caption">${Math.floor(m.total/m.dose)}일분${m.total%m.dose?` + ${m.total%m.dose}${m.unit}`:''}</div><button class="text-btn" data-total-auto="${i}" aria-label="${name} 수량을 처방 일수에 맞춤">처방 일수에 맞춤</button></div>
        <div class="med-policy"><label for="policy-${i}">배분 방식</label><select id="policy-${i}" data-policy="${i}" aria-label="${name} 배분 방식"><option value="pack" ${m.policy==='pack'?'selected':''}>팩·통 유지</option><option value="split" ${m.policy==='split'?'selected':''}>알·봉 단위로 나누기</option></select><p class="row-caption">${m.events.length?`이동 ${m.events.length}회`:'추가 이동 없음'}</p></div>
        <div class="row-allocation"><div class="allocation-heading"><span>처음 둘 수량 <small>${m.home===null?'자동 추천':'직접 지정'}</small></span><button class="text-btn" data-auto="${i}" aria-label="${name} 배분 자동 추천">자동 추천</button></div><div class="row-amounts"><div><label class="home-key" for="home-${i}">집</label><span class="input-suffix"><input id="home-${i}" data-home="${i}" aria-label="${name} 집에 둘 수량" type="number" min="0" max="${m.total}" step="1" value="${m.initialHome}" required><span>${m.unit}</span></span><p>${packaging(m.initialHome,m)}</p></div><div><label class="office-key" for="office-${i}">회사</label><span class="input-suffix"><input id="office-${i}" data-office="${i}" aria-label="${name} 회사에 둘 수량" type="number" min="0" max="${m.total}" step="1" value="${m.initialOffice}" required><span>${m.unit}</span></span><p>${packaging(m.initialOffice,m)}</p></div></div><div class="split-bar" aria-hidden="true"><span style="width:${percentage}%"></span><span style="width:${100-percentage}%"></span></div><div class="need-caption"><span>집 필요 ${m.needHome}${m.unit}</span><span>회사 필요 ${m.needOffice}${m.unit}</span></div></div>
        <div class="med-actions"><button class="btn compact" data-edit="${i}" aria-label="${name} 설정">설정</button><button class="text-btn danger-text" data-remove="${i}" aria-label="${name} 삭제">삭제</button></div>
      </article>`;
    }).join(''):'<div class="med-empty"><h3>등록된 약이 없습니다</h3><p>위의 <b>＋ 약 추가</b>를 눌러 복용량과 포장을 입력해 주세요.</p></div>';
  }
  function renderShortages(){
    $('#shortages').innerHTML=plan.results.filter(m=>m.firstShortage).map(m=>`<div class="notice error"><b>${escape(m.name)}</b> · ${dateLabel(m.firstShortage)}부터 1일 복용분이 부족한 날이 있습니다. 처방 기간 전체에 필요한 ${state.days*m.dose}${m.unit} 중 ${m.total}${m.unit}을 입력했습니다. 받은 수량을 확인해 주세요.</div>`).join('');
  }
  function renderCalendar(){
    const [y,mo]=month.split('-').map(Number),offset=C.date(month+'-01').getUTCDay(),last=new Date(Date.UTC(y,mo,0)).getUTCDate();
    $('#month-title').textContent=`${y}년 ${mo}월`;
    $('#prev-month').disabled=month<=plan.start.slice(0,7);$('#next-month').disabled=month>=plan.end.slice(0,7);
    const blanks=Array.from({length:offset},()=>'<div class="calendar-day empty" aria-hidden="true"></div>');
    const cells=Array.from({length:last},(_,i)=>{
      const s=month+'-'+String(i+1).padStart(2,'0'),active=s>=plan.start&&s<=plan.end,info=C.dayInfo(s,state.holidays),moves=plan.events.filter(e=>e.date===s),short=plan.results.some(m=>m.rows.find(r=>r.date===s)?.missing);
      const title=`${dateLabel(s)} ${weekday(s)}요일 · ${active?loc(info.location)+' 복용':'계획 밖'} · ${info.reason}${moves.length?' · 약 이동 있음':''}`;
      return `<button class="calendar-day ${active?info.location:'outside'} ${s===selected?'selected':''}" data-day="${s}" aria-label="${escape(title)}" aria-pressed="${s===selected}" title="${escape(title)}"><span class="daynum">${i+1}</span>${moves.length?'<span class="move-marker" aria-hidden="true">↔</span>':''}<span class="location">${active?(info.official||info.custom?escape(info.reason.split(' · ')[0]):loc(info.location)):'—'}</span>${short?'<span class="short-marker">부족</span>':''}</button>`;
    });
    const trailing=(7-(offset+last)%7)%7;
    $('#calendar-grid').innerHTML=[...blanks,...cells,...Array.from({length:trailing},()=>'<div class="calendar-day empty" aria-hidden="true"></div>')].join('');
    renderDay();
  }
  function renderDay(){
    const info=C.dayInfo(selected,state.holidays),index=plan.days.findIndex(d=>d.date===selected);
    $('#allocation-open').disabled=index<0||!state.meds.length;
    $('#allocation-status').hidden=!state.allocation;
    if(state.allocation)$('#allocation-note').textContent=`${fullDate(state.allocation.date)} 복용 전 재배분 기준 적용 중`;
    if(index<0){$('#day-detail').innerHTML=`<h3>${dateLabel(selected)} (${weekday(selected)})</h3><p class="muted small">현재 처방 계획에 포함되지 않은 날입니다.</p>`;return}
    if(!state.meds.length){$('#day-detail').innerHTML='<p class="muted small">약을 추가하면 선택한 날짜의 집·회사 잔량을 확인할 수 있습니다.</p>';return}
    const timing={opening:'하루 시작 · 직접 재배분 후, 자동 이동과 복용 전',beforeDose:'복용 직전 · 복용 전 이동 완료, 아직 먹지 않은 수량',closing:'하루 종료 · 당일 복용과 모든 이동을 마친 수량'}[balanceMoment];
    const remaining=plan.days.slice(index),homeDays=remaining.filter(d=>d.location==='home').length;
    $('#day-detail').innerHTML=`<h3>${dateLabel(selected)} (${weekday(selected)}) · ${escape(info.reason)}</h3><p class="detail-caption">${timing}</p><div class="balance-cards">${plan.results.map(m=>{
      const r=m.rows[index],q=balanceMoment==='closing'?r:r[balanceMoment];
      const usedToday=balanceMoment==='closing'?r.consumed:0;
      return `<article class="balance-card"><h4>${escape(m.name)} <small>하루 ${m.dose}${m.unit}</small></h4><div class="balance-pair"><div class="home-balance"><span>집에 남은 약</span><strong>${q.home}<small>${m.unit}</small></strong></div><div class="office-balance"><span>회사에 남은 약</span><strong>${q.office}<small>${m.unit}</small></strong></div></div><p>남은 필요량 · 집 ${Math.max(0,homeDays*m.dose-(info.location==='home'?usedToday:0))}${m.unit} / 회사 ${Math.max(0,(remaining.length-homeDays)*m.dose-(info.location==='office'?usedToday:0))}${m.unit}</p>${r.missing?'<p class="field-error">이 날짜의 1일 복용분이 부족합니다.</p>':''}</article>`;
    }).join('')}</div><p class="detail-caption">계획된 복용과 이동을 실행했을 때의 예상 잔량입니다.</p>${plan.events.filter(e=>e.date===selected).map(e=>`<p class="small muted">↔ ${phase(e.phase)} · ${escape(e.name)} ${e.quantity}${e.unit} ${loc(e.from)} → ${loc(e.to)}</p>`).join('')}`;
  }
  function renderEvents(){
    const groups=new Map();plan.events.forEach(e=>{const key=e.date+e.phase;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)});
    $('#event-count').textContent=new Set(plan.events.map(e=>e.date)).size+'일';
    $('#events').innerHTML=!state.meds.length?'<div class="empty-events"><h3>약을 추가해 주세요</h3><p>배분에 따라 챙겨야 할 날짜를 계산합니다.</p></div>':groups.size?[...groups.values()].map(events=>{
      const first=events[0];return `<div class="event-group"><div class="event-title"><b>${dateLabel(first.date)} (${weekday(first.date)})</b><span class="phase">${phase(first.phase)}</span></div>${events.map(e=>`<div class="event-item"><div><b>${escape(e.name)} · ${e.quantity}${e.unit}</b><span class="direction">${loc(e.from)} → ${loc(e.to)}</span></div><p>${movePackaging(e,plan.results[e.med])}</p></div>`).join('')}</div>`;
    }).join(''):`<div class="empty-events"><span class="check">✓</span><h3>추가로 옮길 약이 없어요</h3><p>${plan.results.some(m=>m.shortage)?'단, 받은 수량이 부족합니다. 수량을 먼저 확인해 주세요.':'처음 배분한 수량을 각 장소에 준비하면 됩니다.'}</p></div>`;
  }
  function renderHolidays(){
    $('#holiday-list').innerHTML=state.holidays.length?[...state.holidays].map((h,i)=>`<div class="holiday-item"><div><b>${escape(h.name)}</b><small>${fullDate(h.start)}${h.start!==h.end?' — '+fullDate(h.end):''}</small></div><button class="text-btn" data-holiday-remove="${i}" aria-label="${escape(h.name)} 삭제">삭제</button></div>`).join(''):'<p class="muted small">추가한 휴일이 없습니다. 대한민국 공휴일과 주말은 자동으로 적용돼요.</p>';
  }
  function mutation(fn,{keepAllocation=false}={}){
    const previous=structuredClone(state);fn();
    if(!keepAllocation)state.allocation=null;
    if(!compute()){const msg=$('#error').textContent;state=previous;compute();toast(msg);return false}
    if(previous.allocation&&!keepAllocation)toast('계획이 변경되어 날짜별 재배분 기준을 초기화했습니다.');
    $('#sample-label').textContent='내 배분 계획';return true;
  }
  function applyPrescription(){
    if(!$('#prescription').reportValidity())return false;
    state.visit=$('#visit').value;state.days=Number($('#days').value);state.timing=$('input[name=timing]:checked').value;
    state.allocation=null;
    state.meds.forEach(m=>{if(m.autoTotal){m.total=state.days*m.dose;m.home=null}});
    if(compute({resetMonth:true})){dirty=false;$('#sample-label').textContent='내 배분 계획';return true}
    return false;
  }
  $('#prescription').addEventListener('submit',e=>{e.preventDefault();if(applyPrescription())toast('새 배분 계획을 계산했습니다.')});
  $('#prescription').addEventListener('input',()=>{dirty=true;$('#sample-label').textContent='변경됨 · 계획 계산을 눌러주세요';$('#results').hidden=true;$('#period-note').textContent='입력한 처방 정보로 다시 계산해 주세요.'});
  $('#save-local').addEventListener('change',e=>{
    saving=e.target.checked;
    if(!saving){try{localStorage.removeItem(key)}catch{toast('기기에 저장된 계획을 삭제하지 못했습니다. 브라우저 설정을 확인해 주세요.')}}
    persist();
  });
  $('#meds').addEventListener('change',e=>{
    const el=e.target;
    if(el.matches('input')&&!el.reportValidity())return;
    if(el.dataset.total!==undefined)mutation(()=>{const m=state.meds[+el.dataset.total];m.total=Number(el.value);m.autoTotal=false;m.home=null});
    if(el.dataset.policy!==undefined)mutation(()=>{const m=state.meds[+el.dataset.policy];m.policy=el.value;m.home=null});
    if(el.dataset.home!==undefined)mutation(()=>state.meds[+el.dataset.home].home=Number(el.value));
    if(el.dataset.office!==undefined)mutation(()=>{const m=state.meds[+el.dataset.office];m.home=m.total-Number(el.value)});
  });
  function openMed(index=null){
    editingMed=index;
    const m=index===null?{name:'',dose:1,unit:'알',pack:10,box:1}:state.meds[index];
    for(const key of ['name','dose','unit','pack','box'])$('#med-'+key).value=m[key];
    $('#med-dialog-title').textContent=index===null?'새 약 추가':'약과 포장 설정';
    $('#med-submit').textContent=index===null?'약 추가':'설정 적용';
    $('#med-error').textContent='';$('#med-dialog').showModal();$('#med-name').focus();
  }
  $('#med-add').addEventListener('click',()=>openMed());
  $('#meds').addEventListener('click',e=>{
    const el=e.target.closest('button');if(!el)return;
    if(el.dataset.auto!==undefined)mutation(()=>state.meds[+el.dataset.auto].home=null);
    if(el.dataset.totalAuto!==undefined)mutation(()=>{const m=state.meds[+el.dataset.totalAuto];m.autoTotal=true;m.total=state.days*m.dose;m.home=null});
    if(el.dataset.edit!==undefined)openMed(+el.dataset.edit);
    if(el.dataset.remove!==undefined){
      removingMed=+el.dataset.remove;
      $('#remove-description').textContent='“'+state.meds[removingMed].name+'”을(를) 목록에서 삭제할까요?';
      $('#remove-dialog').showModal();
    }
  });
  $('#med-remove-confirm').addEventListener('click',()=>{
    if(removingMed===null||!state.meds[removingMed])return;
    const i=removingMed;$('#remove-dialog').close();removingMed=null;
    if(mutation(()=>state.meds.splice(i,1)))($('#meds').querySelector('[data-edit="'+Math.min(i,state.meds.length-1)+'"]')||$('#med-add')).focus();
  });
  $('#med-form').addEventListener('submit',e=>{
    e.preventDefault();if(!$('#med-form').reportValidity())return;
    const candidate=structuredClone(state),adding=editingMed===null;
    const m=adding?{autoTotal:true,policy:'pack',home:null}:candidate.meds[editingMed];
    m.name=$('#med-name').value.trim();m.dose=Number($('#med-dose').value);m.unit=$('#med-unit').value;m.pack=Number($('#med-pack').value);m.box=Number($('#med-box').value);m.home=null;
    if(m.autoTotal)m.total=candidate.days*m.dose;
    if(adding)candidate.meds.push(m);
    candidate.allocation=null;
    try{
      C.plan(candidate);
      const index=adding?candidate.meds.length-1:editingMed;
      if(mutation(()=>state=candidate)){
        $('#med-dialog').close();$('#meds').querySelector('[data-edit="'+index+'"]').focus();
      }
    }catch(err){$('#med-error').textContent=err.message}
  });
  $('#holiday-open').addEventListener('click',()=>{if(dirty&&!applyPrescription())return;renderHolidays();$('#holiday-start').value=state.visit;$('#holiday-end').value=state.visit;$('#holiday-error').textContent='';$('#holiday-dialog').showModal()});
  $('#holiday-start').addEventListener('change',()=>{if($('#holiday-end').value<$('#holiday-start').value)$('#holiday-end').value=$('#holiday-start').value});
  $('#holiday-form').addEventListener('submit',e=>{
    e.preventDefault();const h={name:$('#holiday-name').value.trim(),start:$('#holiday-start').value,end:$('#holiday-end').value};
    if(!h.name||!C.valid(h.start)||!C.valid(h.end)||h.start>h.end){$('#holiday-error').textContent='휴일 이름과 날짜 순서를 확인해 주세요.';return}
    if(state.holidays.length>=200){$('#holiday-error').textContent='휴일은 최대 200개까지 추가할 수 있습니다.';return}
    if(mutation(()=>state.holidays.push(h))){$('#holiday-name').value='';$('#holiday-error').textContent='';renderHolidays();toast('휴일을 반영했습니다.')}
  });
  $('#holiday-list').addEventListener('click',e=>{const b=e.target.closest('[data-holiday-remove]');if(b){mutation(()=>state.holidays.splice(+b.dataset.holidayRemove,1));renderHolidays()}});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).close()));
  $('#calendar-grid').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){selected=b.dataset.day;renderCalendar();persist();$(`[data-day="${selected}"]`).focus({preventScroll:true})}});
  $('#balance-moment').value=balanceMoment;
  $('#balance-moment').addEventListener('change',e=>{balanceMoment=e.target.value;renderDay();persist()});
  $('#allocation-open').addEventListener('click',()=>{
    allocationBase=C.plan({...state,allocation:null});
    const index=allocationBase.days.findIndex(d=>d.date===selected);if(index<0)return;
    $('#allocation-description').textContent=`${fullDate(selected)} 복용 전 남은 약을 집과 회사에 다시 배분합니다. 총 잔량은 바뀌지 않습니다.`;
    $('#allocation-error').textContent='';
    $('#allocation-inputs').innerHTML=allocationBase.results.map((m,i)=>{
      const q=m.rows[index].rawOpening,total=q.home+q.office;
      return `<fieldset class="allocation-fieldset"><legend>${escape(m.name)} · 남은 총 ${total}${m.unit}</legend><div class="form-row"><label for="rehome-${i}">집 (${m.unit})<input id="rehome-${i}" data-rehome="${i}" type="number" min="0" max="${total}" step="1" value="${q.home}" required></label><label for="reoffice-${i}">회사 (${m.unit})<input id="reoffice-${i}" data-reoffice="${i}" type="number" min="0" max="${total}" step="1" value="${q.office}" required></label></div><button class="text-btn" type="button" data-recommend="${i}">남은 필요량에 맞춰 추천</button><p class="small muted">${m.policy==='pack'?'개봉한 팩·통의 남은 수량도 통째로 유지합니다.':'알·봉 단위로 배분합니다.'}</p></fieldset>`;
    }).join('');$('#allocation-dialog').showModal();
  });
  $('#allocation-inputs').addEventListener('input',e=>{
    const i=e.target.dataset.rehome??e.target.dataset.reoffice;if(i===undefined)return;
    const row=allocationBase.results[+i].rows.find(r=>r.date===selected),total=row.rawOpening.home+row.rawOpening.office;
    if(e.target.value!==''&&e.target.validity.valid)$('#'+(e.target.dataset.rehome!==undefined?'reoffice-':'rehome-')+i).value=total-Number(e.target.value);
  });
  $('#allocation-inputs').addEventListener('click',e=>{
    const b=e.target.closest('[data-recommend]');if(!b)return;const i=+b.dataset.recommend,m=allocationBase.results[i],row=m.rows.find(r=>r.date===selected);
    const need=allocationBase.days.filter(d=>d.date>=selected&&d.location==='home').length*m.dose;
    const n=C.recommendHome(row.rawOpening.packs,need,m.policy);$('#rehome-'+i).value=n;$('#reoffice-'+i).value=row.rawOpening.home+row.rawOpening.office-n;
  });
  $('#allocation-form').addEventListener('submit',e=>{
    e.preventDefault();const candidate=structuredClone(state);candidate.allocation={date:selected,home:state.meds.map((_,i)=>Number($('#rehome-'+i).value))};
    try{
      state.meds.forEach((m,i)=>{const r=allocationBase.results[i].rows.find(r=>r.date===selected).rawOpening;if(candidate.allocation.home[i]+Number($('#reoffice-'+i).value)!==r.home+r.office)throw Error(m.name+': 집과 회사 수량의 합계를 확인해 주세요.')});
      C.plan(candidate);mutation(()=>state=candidate,{keepAllocation:true});$('#allocation-dialog').close();toast('선택일부터 잔량과 이동 일정을 다시 계산했습니다.');
    }catch(err){$('#allocation-error').textContent=err.message}
  });
  $('#allocation-clear').addEventListener('click',()=>mutation(()=>state.allocation=null,{keepAllocation:true}));
  function changeMonth(n){const d=C.date(month+'-01');d.setUTCMonth(d.getUTCMonth()+n);month=C.iso(d).slice(0,7);renderCalendar()}
  $('#prev-month').addEventListener('click',()=>changeMonth(-1));$('#next-month').addEventListener('click',()=>changeMonth(1));$('#start-month').addEventListener('click',()=>{month=plan.start.slice(0,7);selected=plan.start;renderCalendar()});
  $('#theme').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme').setAttribute('aria-label',dark?'밝은 테마로 변경':'어두운 테마로 변경');persist()});
  $('#export').addEventListener('click',()=>{
    const rows=[['구분','날짜','시점','약','출발','도착','수량','단위','설명']];
    plan.results.forEach(m=>{rows.push(['초기 배분',plan.start,'복용 전',m.name,'처방','집',m.initialHome,m.unit,packaging(m.initialHome,m)]);rows.push(['초기 배분',plan.start,'복용 전',m.name,'처방','회사',m.initialOffice,m.unit,packaging(m.initialOffice,m)])});
    plan.events.forEach(e=>rows.push([e.phase==='rebalance'?'재배분':'이동',e.date,phase(e.phase),e.name,loc(e.from),loc(e.to),e.quantity,e.unit,movePackaging(e,plan.results[e.med])]));
    plan.results.filter(m=>m.firstShortage).forEach(m=>rows.push(['부족',m.firstShortage,'복용 전',m.name,'','',m.shortage,m.unit,'총 처방 기간 대비 부족량']));
    const cell=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`medipath-${plan.start}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('배분과 이동 일정을 CSV로 저장했습니다.');
  });
  $('#sources').innerHTML=H.sources.map(s=>`<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.label)} ↗</a>`).join('');
  syncForm();compute();
  account=window.MediAccount.mount({snapshot,validate:validateSettings,restore:restoreSettings,localStatus:persist});
})();
