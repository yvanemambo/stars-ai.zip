-- STARS AI : historique des conversations
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Ajoute des tables et fonctions séparées : ne modifie pas les comptes ni la mémoire existante.

create schema if not exists stars_private;
revoke all on schema stars_private from public, anon, authenticated;

create table if not exists public.stars_conversations (
  id uuid primary key,
  email text not null check (char_length(email) between 3 and 254),
  title text not null default 'Nouvelle discussion' check (char_length(title) between 1 and 72),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stars_conversations_email_updated_idx
  on public.stars_conversations (email, updated_at desc);

create table if not exists public.stars_conversation_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.stars_conversations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  position integer not null check (position between 0 and 39),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 30000),
  created_at timestamptz not null default now(),
  unique (conversation_id, position)
);
create index if not exists stars_conversation_messages_lookup_idx
  on public.stars_conversation_messages (conversation_id, position);

alter table public.stars_conversations enable row level security;
alter table public.stars_conversation_messages enable row level security;
revoke all on public.stars_conversations from public, anon, authenticated;
revoke all on public.stars_conversation_messages from public, anon, authenticated;

create or replace function stars_private.conversations_list(p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'createdAt', c.created_at, 'updatedAt', c.updated_at)
                     order by c.updated_at desc)
    from public.stars_conversations c where c.email = v_email
  ), '[]'::jsonb));
end $fn$;

create or replace function stars_private.conversation_get(p_email text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_item jsonb;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'messages', coalesce((select jsonb_agg(jsonb_build_object('role', m.role, 'content', m.content) order by m.position)
                          from public.stars_conversation_messages m
                          where m.conversation_id = c.id and m.email = v_email), '[]'::jsonb)
  ) into v_item
  from public.stars_conversations c where c.id = p_id and c.email = v_email;
  return v_item;
end $fn$;

create or replace function stars_private.conversation_save(p_email text, p_id uuid, p_title text, p_messages jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_title text := left(btrim(regexp_replace(coalesce(p_title, 'Nouvelle discussion'), '[[:cntrl:]<>]+', ' ', 'g')), 72);
  v_id uuid;
  v_count integer;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) > 40 then raise exception 'bad_messages' using errcode = '22023'; end if;
  if v_title = '' then v_title := 'Nouvelle discussion'; end if;
  insert into public.stars_conversations (id, email, title, updated_at)
  values (p_id, v_email, v_title, now())
  on conflict (id) do update set title = excluded.title, updated_at = now()
  where public.stars_conversations.email = excluded.email
  returning id into v_id;
  if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from public.stars_conversation_messages m where m.conversation_id = p_id and m.email = v_email;
  insert into public.stars_conversation_messages (conversation_id, email, position, role, content)
  select p_id, v_email, (x.ordinality - 1)::integer, x.value->>'role', coalesce(x.value->>'content', '')
  from jsonb_array_elements(p_messages) with ordinality as x(value, ordinality);
  return stars_private.conversation_get(v_email, p_id);
end $fn$;

create or replace function stars_private.conversation_rename(p_email text, p_id uuid, p_title text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_n integer;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  update public.stars_conversations c set title = left(btrim(regexp_replace(coalesce(p_title, ''), '[[:cntrl:]<>]+', ' ', 'g')), 72), updated_at = now()
  where c.id = p_id and c.email = v_email;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $fn$;

create or replace function stars_private.conversation_delete(p_email text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare v_email text := lower(trim(coalesce(p_email, ''))); v_n integer;
begin
  if char_length(v_email) < 3 then raise exception 'bad_email' using errcode = '22023'; end if;
  delete from public.stars_conversations c where c.id = p_id and c.email = v_email;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $fn$;

-- Fonctions publiques appelées uniquement par le serveur après vérification du secret MEMBERS_SECRET.
create or replace function public.stars_conversations_list(p_secret text, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.conversations_list(p_email); end $fn$;
create or replace function public.stars_conversation_get(p_secret text, p_email text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.conversation_get(p_email, p_id); end $fn$;
create or replace function public.stars_conversation_save(p_secret text, p_email text, p_id uuid, p_title text, p_messages jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.conversation_save(p_email, p_id, p_title, p_messages); end $fn$;
create or replace function public.stars_conversation_rename(p_secret text, p_email text, p_id uuid, p_title text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.conversation_rename(p_email, p_id, p_title); end $fn$;
create or replace function public.stars_conversation_delete(p_secret text, p_email text, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $fn$
begin perform public.stars_check_secret(p_secret); return stars_private.conversation_delete(p_email, p_id); end $fn$;

revoke all on function stars_private.conversations_list(text) from public, anon, authenticated;
revoke all on function stars_private.conversation_get(text, uuid) from public, anon, authenticated;
revoke all on function stars_private.conversation_save(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function stars_private.conversation_rename(text, uuid, text) from public, anon, authenticated;
revoke all on function stars_private.conversation_delete(text, uuid) from public, anon, authenticated;
revoke all on function public.stars_conversations_list(text, text) from public, authenticated;
revoke all on function public.stars_conversation_get(text, text, uuid) from public, authenticated;
revoke all on function public.stars_conversation_save(text, text, uuid, text, jsonb) from public, authenticated;
revoke all on function public.stars_conversation_rename(text, text, uuid, text) from public, authenticated;
revoke all on function public.stars_conversation_delete(text, text, uuid) from public, authenticated;
grant execute on function public.stars_conversations_list(text, text) to anon, service_role;
grant execute on function public.stars_conversation_get(text, text, uuid) to anon, service_role;
grant execute on function public.stars_conversation_save(text, text, uuid, text, jsonb) to anon, service_role;
grant execute on function public.stars_conversation_rename(text, text, uuid, text) to anon, service_role;
grant execute on function public.stars_conversation_delete(text, text, uuid) to anon, service_role;
