(function(root){
  'use strict';
  class CloudStore {
    constructor(client,validate,onStatus=()=>{}){this.client=client;this.validate=validate;this.onStatus=onStatus;this.epoch=0;this.revision=0;this.userId=null;this.pending=null;this.running=null;this.blocked=false;}
    detach(){this.epoch++;this.userId=null;this.pending=null;this.revision=0;this.blocked=false;}
    async load(userId){
      this.detach();this.userId=userId;const epoch=this.epoch;
      this.blocked=true;this.onStatus('loading');
      const {data,error}=await this.client.from('medipath_settings').select('settings,revision').eq('user_id',userId).maybeSingle();
      if(epoch!==this.epoch)return {cancelled:true};
      if(error){this.onStatus('load-error');throw error}
      try{if(data)this.validate(data.settings)}catch(e){this.onStatus('load-error');throw e}
      this.revision=data?.revision??0;this.blocked=false;
      return {settings:data?.settings??null};
    }
    save(settings){
      if(!this.userId)return Promise.resolve();
      this.validate(settings);this.pending=structuredClone(settings);
      if(this.blocked)return Promise.resolve();
      return this.drain();
    }
    async drain(){
      if(this.running)return this.running;
      const epoch=this.epoch;
      this.running=(async()=>{
        while(this.pending&&this.userId&&!this.blocked&&epoch===this.epoch){
          const payload=this.pending;this.pending=null;this.onStatus('saving');
          let result;
          try{result=await this.client.rpc('save_medipath_settings',{p_settings:payload,p_expected_revision:this.revision})}catch(error){result={error}}
          if(epoch!==this.epoch)return;
          if(result.error){
            this.pending=this.pending??payload;this.blocked=true;
            this.onStatus(result.error.code==='40001'?'conflict':'save-error');return;
          }
          const row=Array.isArray(result.data)?result.data[0]:result.data;
          if(!row||!Number.isInteger(row.revision)){this.pending=this.pending??payload;this.blocked=true;this.onStatus('save-error');return}
          this.revision=row.revision;
        }
        if(epoch===this.epoch&&!this.blocked)this.onStatus('saved');
      })().finally(()=>{this.running=null;if(this.pending&&this.userId&&!this.blocked)this.drain()});
      return this.running;
    }
    retry(){this.blocked=false;return this.drain()}
    async flush(){if(this.running)await this.running;if(this.pending&&!this.blocked)await this.drain();return !this.pending&&!this.blocked}
  }
  if(typeof module!=='undefined')module.exports={CloudStore};else root.MediCloud={CloudStore};
})(typeof window!=='undefined'?window:globalThis);
