const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
fs.mkdirSync(path.join(root,'dist/vendor'),{recursive:true});
fs.copyFileSync(path.join(root,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),path.join(root,'dist/vendor/supabase.js'));
fs.copyFileSync(path.join(root,'node_modules/@supabase/supabase-js/LICENSE'),path.join(root,'dist/vendor/SUPABASE-LICENSE'));
const notices=[];
for(const name of ['@supabase/supabase-js','@supabase/auth-js','@supabase/functions-js','@supabase/postgrest-js','@supabase/realtime-js','@supabase/phoenix','@supabase/storage-js','iceberg-js','tslib']){
  const dir=path.join(root,'node_modules',name);
  for(const file of fs.readdirSync(dir).filter(f=>/^(LICENSE|NOTICE|COPYING)/i.test(f))){
    if(fs.statSync(path.join(dir,file)).isFile())notices.push(name+' — '+file+'\n'+fs.readFileSync(path.join(dir,file),'utf8'));
  }
}
fs.writeFileSync(path.join(root,'dist/vendor/THIRD-PARTY-NOTICES.txt'),notices.join('\n\n-----\n\n'));
console.log('Supabase browser SDK bundled locally.');
