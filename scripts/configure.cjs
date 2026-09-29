const fs=require('node:fs');
const path=require('node:path');
const url=(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
const key=(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
if(!url||!key)throw Error('Set repository variables SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY before deploying email login.');
if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))throw Error('SUPABASE_URL must be the HTTPS Supabase project URL.');
if(key.startsWith('eyJ')){
  let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString())}catch{throw Error('Invalid anon key')}
  if(payload.role!=='anon')throw Error('Only a publishable or anon key may be exposed to the browser.');
}else if(!key.startsWith('sb_publishable_'))throw Error('Use a publishable key. Secret/service_role keys must never be deployed.');
fs.writeFileSync(path.join(__dirname,'../dist/config.js'),'window.MEDIPATH_CONFIG = '+JSON.stringify({supabaseUrl:url,supabasePublishableKey:key})+';\n');
console.log('Public authentication configuration generated.');
