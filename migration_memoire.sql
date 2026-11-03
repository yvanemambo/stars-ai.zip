-- STARS AI : mémoire intelligente (nouvelles tables et fonctions uniquement, rien d'existant n'est modifié)

-- Schéma privé : la logique y vit, personne d'autre que le propriétaire de la base ne peut l'appeler.
create schema if not exists stars_private;
revoke all on schema stars_private from public, anon, authenticated;

-- ---------- Tables (verrouillées comme les autres : RLS + aucun droit pour anon / authenticated) ----------
create table if not exists public.stars_memories (
  id         bigint generated always as identity primary key,
  email      text not null check (char_length(email) between 3 and 254),
  content    text not null check (char_length(content) between 1 and 500),
  kind       text not null default 'info' check (kind in ('info', 'projet', 'preference')),
  source     text not null default 'auto' check (source in ('auto', 'demande', 'manuel')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stars_memories_email_idx on public.stars_memories (email, updated_at desc);
create unique index if not exists stars_memories_unique_idx on public.stars_memories (email, md5(lower(content)));

create table if not exists public.stars_memory_settings (
  email      text primary key check (char_length(email) between 3 and 254),
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.stars_memories enable row level security;
alter table public.stars_memory_settings enable row level security;
revoke all on public.stars_memories from public, anon, authenticated;
revoke all on public.stars_memory_settings from public, anon, authenticated;

-- ---------- Logique (schéma privé) : TOUTES les requêtes sont filtrées par l'e-mail ----------
create or replace function stars_private.mem_get(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_enabled boolean;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  select s.enabled into v_enabled from public.stars_memory_settings s where s.email = v_email;
  return jsonb_build_object(
    'enabled', coalesce(v_enabled, true),
    'max', 100,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'content', m.content, 'kind', m.kind, 'source', m.source,
                                          'created_at', m.created_at, 'updated_at', m.updated_at)
                       order by m.updated_at desc, m.id desc)
        from public.stars_memories m where m.email = v_email), '[]'::jsonb));
end $fn$;

create or replace function stars_private.mem_add(p_email text, p_content text, p_kind text, p_source text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_content text := btrim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g'));
  v_kind text := coalesce(nullif(p_kind, ''), 'info');
  v_source text := coalesce(nullif(p_source, ''), 'auto');
  v_enabled boolean;
  v_count integer;
  v_id bigint;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 500 then return jsonb_build_object('ok', false, 'reason', 'bad_content'); end if;
  if v_kind not in ('info', 'projet', 'preference') then v_kind := 'info'; end if;
  if v_source not in ('auto', 'demande', 'manuel') then v_source := 'auto'; end if;
  select s.enabled into v_enabled from public.stars_memory_settings s where s.email = v_email;
  if coalesce(v_enabled, true) = false and v_source <> 'manuel' then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stars_memories:' || v_email, 0)); -- évite de dépasser la limite avec des requêtes simultanées
  select count(*) into v_count from public.stars_memories m where m.email = v_email;
  if v_count >= 100 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  insert into public.stars_memories (email, content, kind, source) values (v_email, v_content, v_kind, v_source)
  on conflict (email, md5(lower(content))) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'duplicate'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

create or replace function stars_private.mem_update(p_email text, p_id bigint, p_content text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_content text := btrim(regexp_replace(coalesce(p_content, ''), '\s+', ' ', 'g'));
  v_id bigint;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  if char_length(v_content) < 1 or char_length(v_content) > 500 then return jsonb_build_object('ok', false, 'reason', 'bad_content'); end if;
  update public.stars_memories m
     set content = v_content,
         kind = case when p_kind in ('info', 'projet', 'preference') then p_kind else m.kind end,
         updated_at = now()
   where m.id = p_id and m.email = v_email
  returning m.id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'duplicate');
end $fn$;

create or replace function stars_private.mem_delete(p_email text, p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  delete from public.stars_memories m where m.id = p_id and m.email = v_email;
  return found;
end $fn$;

create or replace function stars_private.mem_clear(p_email text) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_n integer;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  delete from public.stars_memories m where m.email = v_email;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

create or replace function stars_private.mem_set_enabled(p_email text, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  insert into public.stars_memory_settings as s (email, enabled, updated_at) values (v_email, coalesce(p_enabled, true), now())
  on conflict (email) do update set enabled = excluded.enabled, updated_at = now();
  return coalesce(p_enabled, true);
end $fn$;

create or replace function stars_private.mem_purge(p_email text) returns integer
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_n integer;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  delete from public.stars_memories m where m.email = v_email;
  get diagnostics v_n = row_count;
  delete from public.stars_memory_settings s where s.email = v_email;
  return v_n;
end $fn$;

-- ---------- Fonctions appelées par le serveur : elles exigent le secret, comme toutes les fonctions stars_* ----------
create or replace function public.stars_memory_get(p_secret text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_get(p_email); end $fn$;

create or replace function public.stars_memory_add(p_secret text, p_email text, p_content text, p_kind text, p_source text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_add(p_email, p_content, p_kind, p_source); end $fn$;

create or replace function public.stars_memory_update(p_secret text, p_email text, p_id bigint, p_content text, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_update(p_email, p_id, p_content, p_kind); end $fn$;

create or replace function public.stars_memory_delete(p_secret text, p_email text, p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_delete(p_email, p_id); end $fn$;

create or replace function public.stars_memory_clear(p_secret text, p_email text) returns integer
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_clear(p_email); end $fn$;

create or replace function public.stars_memory_set_enabled(p_secret text, p_email text, p_enabled boolean) returns boolean
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_set_enabled(p_email, p_enabled); end $fn$;

create or replace function public.stars_memory_purge(p_secret text, p_email text) returns integer
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.mem_purge(p_email); end $fn$;

-- ---------- Droits d'exécution : mêmes règles que les fonctions stars_* existantes (anon + service_role) ----------
revoke all on function stars_private.mem_get(text) from public, anon, authenticated;
revoke all on function stars_private.mem_add(text, text, text, text) from public, anon, authenticated;
revoke all on function stars_private.mem_update(text, bigint, text, text) from public, anon, authenticated;
revoke all on function stars_private.mem_delete(text, bigint) from public, anon, authenticated;
revoke all on function stars_private.mem_clear(text) from public, anon, authenticated;
revoke all on function stars_private.mem_set_enabled(text, boolean) from public, anon, authenticated;
revoke all on function stars_private.mem_purge(text) from public, anon, authenticated;

revoke all on function public.stars_memory_get(text, text) from public, authenticated;
revoke all on function public.stars_memory_add(text, text, text, text, text) from public, authenticated;
revoke all on function public.stars_memory_update(text, text, bigint, text, text) from public, authenticated;
revoke all on function public.stars_memory_delete(text, text, bigint) from public, authenticated;
revoke all on function public.stars_memory_clear(text, text) from public, authenticated;
revoke all on function public.stars_memory_set_enabled(text, text, boolean) from public, authenticated;
revoke all on function public.stars_memory_purge(text, text) from public, authenticated;
grant execute on function public.stars_memory_get(text, text) to anon, service_role;
grant execute on function public.stars_memory_add(text, text, text, text, text) to anon, service_role;
grant execute on function public.stars_memory_update(text, text, bigint, text, text) to anon, service_role;
grant execute on function public.stars_memory_delete(text, text, bigint) to anon, service_role;
grant execute on function public.stars_memory_clear(text, text) to anon, service_role;
grant execute on function public.stars_memory_set_enabled(text, text, boolean) to anon, service_role;
grant execute on function public.stars_memory_purge(text, text) to anon, service_role;
