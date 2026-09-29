const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('database isolates two users, denies anonymous access, and rejects stale revisions',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth, public to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');`);
    await db.exec(fs.readFileSync('supabase/migrations/202609280001_medipath_settings.sql','utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`);
    const a=await db.query(`select (public.save_medipath_settings(' {"plan":"A"} '::jsonb,0)).revision`);assert.equal(a.rows[0].revision,1);
    await db.exec(`set request.jwt.claim.sub='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';`);
    assert.equal((await db.query('select * from public.medipath_settings')).rows.length,0);
    await assert.rejects(db.query(`insert into public.medipath_settings(user_id,settings) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}')`),e=>e.code==='42501');
    assert.equal((await db.query(`update public.medipath_settings set settings='{}' where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning *`)).rows.length,0);
    await db.query(`select public.save_medipath_settings('{"plan":"B"}',0)`);
    await db.exec(`set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';`);
    assert.equal((await db.query('select * from public.medipath_settings')).rows[0].settings.plan,'A');
    await db.query(`select public.save_medipath_settings('{"plan":"A2"}',1)`);
    await assert.rejects(db.query(`select public.save_medipath_settings('{"plan":"stale"}',1)`),e=>e.code==='40001');
    assert.equal((await db.query('select * from public.medipath_settings')).rows[0].settings.plan,'A2');
    await db.exec(`reset role; set role anon; set request.jwt.claim.sub='';`);
    await assert.rejects(db.query('select * from public.medipath_settings'),e=>e.code==='42501');
    await assert.rejects(db.query(`select public.save_medipath_settings('{}',0)`),e=>e.code==='42501');
  }finally{await db.close()}
});
