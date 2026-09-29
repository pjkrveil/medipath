(function(root){
  'use strict';
  function mount(hooks){
    const $=s=>document.querySelector(s),config=root.MEDIPATH_CONFIG??{};
    const configured=Boolean(config.supabaseUrl&&config.supabasePublishableKey);
    let client,store,user=null,active=configured,ready=false,guest=null,syncPromise=null,cooldown=0,sentTo='',busy=false,generation=0;
    const texts={loading:'계정 설정을 불러오는 중…',saving:'계정에 저장 중…',saved:'계정에 저장됨',
      conflict:'다른 기기에서 설정이 변경되었습니다. 계정 설정을 다시 불러온 뒤 수정해 주세요.',
      'save-error':'계정 저장에 실패했습니다. 현재 변경 사항은 아직 저장되지 않았습니다.',
      'load-error':'계정 설정을 불러오지 못했습니다. 다시 불러오거나 로그아웃해 주세요.'};
    function status(value){
      $('#save-status').textContent=texts[value]??value;
      const problem=['conflict','save-error','load-error'].includes(value);
      $('#sync-banner').hidden=!problem;$('#sync-message').textContent=texts[value]??value;
      $('#cloud-retry').hidden=value!=='save-error';$('#cloud-reload').hidden=!['conflict','load-error'].includes(value);
    }
    function render(){
      $('#account-open').hidden=Boolean(user);$('#account-email').hidden=!user;$('#account-logout').hidden=!active;
      $('#account-email').textContent=user?.email??'';$('#guest-save-label').hidden=active;
    }
    function anonymous(){
      generation++;store?.detach();user=null;active=false;ready=false;$('#main').inert=false;$('#sync-banner').hidden=true;
      render();if(guest){hooks.restore(guest);guest=null}else hooks.localStatus();
    }
    async function synchronize(force=false){
      if(syncPromise)return syncPromise;
      const currentGeneration=generation;
      syncPromise=(async()=>{
        active=true;ready=false;$('#main').inert=true;status('loading');render();
        try{
          const {data:sessionData,error:sessionError}=await client.auth.getSession();if(currentGeneration!==generation)return;if(sessionError)throw sessionError;
          if(!sessionData.session){anonymous();return}
          const {data,error}=await client.auth.getUser();if(currentGeneration!==generation)return;if(error||!data.user)throw error??Error('로그인이 필요합니다.');
          user=data.user;guest=guest??hooks.snapshot();render();
          const loaded=await store.load(user.id);if(loaded.cancelled||currentGeneration!==generation)return;
          if(loaded.settings)hooks.restore(loaded.settings);
          ready=true;$('#main').inert=false;
          if(!loaded.settings)await store.save(hooks.snapshot());else status('saved');
          $('#account-dialog').close();
        }catch{if(currentGeneration===generation){ready=false;status('load-error');$('#main').inert=true}}
      })().finally(()=>{syncPromise=null});
      return syncPromise;
    }
    function authError(error){
      if(error?.status===429||/rate|too many/i.test(error?.message??''))return '요청이 많습니다. 잠시 기다린 뒤 다시 시도해 주세요.';
      if(/expired|invalid|otp/i.test(error?.message??''))return '인증 코드가 올바르지 않거나 만료되었습니다. 새 코드를 받아 주세요.';
      return '인증 요청을 완료하지 못했습니다. 네트워크와 이메일 주소를 확인해 주세요. 계속 실패하면 운영자에게 문의해 주세요.';
    }
    $('#account-open').addEventListener('click',()=>{
      $('#account-error').textContent='';$('#account-dialog').showModal();
      $('#account-unavailable').hidden=configured&&Boolean(client);
      $('#account-form').hidden=!configured||!client;
    });
    $('#send-code').addEventListener('click',async()=>{
      const input=$('#login-email');if(!input.reportValidity()||busy||Date.now()<cooldown)return;
      busy=true;$('#send-code').disabled=true;$('#verify-code').disabled=true;$('#account-error').textContent='';
      try{
        const email=input.value.trim(),{error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true}});if(error)throw error;
        sentTo=email;$('#otp-section').hidden=false;$('#login-code').value='';$('#login-code').focus();
        $('#account-info').textContent=`${email}로 인증 코드를 요청했습니다. 메일의 숫자 코드를 입력해 주세요.`;
        cooldown=Date.now()+60000;
      }catch(e){$('#account-error').textContent=authError(e)}finally{
        busy=false;$('#verify-code').disabled=false;
        const tick=()=>{const left=Math.ceil((cooldown-Date.now())/1000);$('#send-code').disabled=left>0;$('#send-code').textContent=left>0?`${left}초 후 재전송`:'인증 코드 받기';if(left>0)setTimeout(tick,1000)};tick();
      }
    });
    $('#account-form').addEventListener('submit',async e=>{
      e.preventDefault();if(!sentTo||busy||!$('#login-code').reportValidity())return;
      if($('#login-email').value.trim()!==sentTo){$('#account-error').textContent='이메일을 변경했다면 인증 코드를 새로 받아 주세요.';return}
      busy=true;$('#verify-code').disabled=true;$('#account-error').textContent='';
      try{const {error}=await client.auth.verifyOtp({email:sentTo,token:$('#login-code').value.trim(),type:'email'});if(error)throw error;$('#login-code').value='';await synchronize()}
      catch(error){$('#account-error').textContent=authError(error)}finally{busy=false;$('#verify-code').disabled=false}
    });
    $('#account-logout').addEventListener('click',async()=>{
      $('#account-logout').disabled=true;
      try{
        if(store&&!(await store.flush())&&!confirm('저장되지 않은 변경 사항이 있습니다. 이 변경을 버리고 로그아웃할까요?'))return;
        const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;anonymous();
      }catch{status('로그아웃하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.')}
      finally{$('#account-logout').disabled=false}
    });
    $('#cloud-retry').addEventListener('click',()=>store.retry());
    $('#cloud-reload').addEventListener('click',async()=>{
      if(ready&&!confirm('현재 화면의 미저장 변경을 버리고 계정에 저장된 설정을 불러올까요?'))return;
      await synchronize(true);
    });
    window.addEventListener('beforeunload',e=>{if(store&&(store.pending||store.running)){e.preventDefault();e.returnValue=''}});
    const api={isActive:()=>active,save:settings=>{if(ready)store.save(settings).catch(()=>status('save-error'))}};
    render();
    if(configured){
      try{
        if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl))throw Error('Invalid Supabase URL');
        if(config.supabasePublishableKey.startsWith('sb_secret_'))throw Error('Secret keys are not allowed');
        if(config.supabasePublishableKey.startsWith('eyJ')){
          const role=JSON.parse(atob(config.supabasePublishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;
          if(role!=='anon')throw Error('Only anon keys are allowed');
        }else if(!config.supabasePublishableKey.startsWith('sb_publishable_'))throw Error('Publishable key required');
        client=root.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'medipath.auth.v2'}});
        store=new root.MediCloud.CloudStore(client,hooks.validate,status);
        client.auth.onAuthStateChange((event,session)=>{
          if(event==='SIGNED_OUT'){anonymous();return}
          if(event==='SIGNED_IN'&&session?.user.id!==user?.id){generation++;store.detach();active=true;ready=false;setTimeout(async()=>{if(syncPromise)await syncPromise;if(!ready&&active)await synchronize()},0)}
        });
        setTimeout(()=>synchronize(),0);
      }catch{active=false;render();$('#account-unavailable').textContent='이메일 로그인 연결을 확인할 수 없습니다. 운영자가 연결 설정을 확인해야 합니다.'}
    }
    return api;
  }
  root.MediAccount={mount};
})(window);
