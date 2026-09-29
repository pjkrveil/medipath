begin;
create table if not exists public.medipath_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 262144),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.medipath_settings enable row level security;
revoke all on public.medipath_settings from anon;
revoke all on public.medipath_settings from authenticated;
grant select, insert, update on public.medipath_settings to authenticated;
drop policy if exists "read own settings" on public.medipath_settings;
create policy "read own settings" on public.medipath_settings for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "insert own settings" on public.medipath_settings;
create policy "insert own settings" on public.medipath_settings for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "update own settings" on public.medipath_settings;
create policy "update own settings" on public.medipath_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Optimistic concurrency: a stale device never silently overwrites a newer plan.
create or replace function public.save_medipath_settings(p_settings jsonb, p_expected_revision integer)
returns public.medipath_settings
language plpgsql security invoker set search_path = '' as $$
declare saved public.medipath_settings;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_expected_revision = 0 then
    insert into public.medipath_settings(user_id,settings,revision)
    values(auth.uid(),p_settings,1)
    on conflict(user_id) do nothing returning * into saved;
  else
    update public.medipath_settings set settings=p_settings, revision=revision+1, updated_at=now()
    where user_id=auth.uid() and revision=p_expected_revision returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'MEDIPATH_CONFLICT' using errcode='40001'; end if;
  return saved;
end;
$$;
revoke all on function public.save_medipath_settings(jsonb,integer) from public, anon;
grant execute on function public.save_medipath_settings(jsonb,integer) to authenticated;
commit;
