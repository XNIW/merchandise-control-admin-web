-- Mini-only application identity. No Auth users/identities are manufactured.
create table app_private.wechat_mini_mappings (
  mapping_id uuid primary key default gen_random_uuid(),
  app_id text not null check (app_id ~ '^wx[0-9a-f]{16}$'),
  identity_hash text not null check (identity_hash ~ '^v1:[0-9a-f]{64}$'),
  profile_id uuid not null references public.profiles(profile_id),
  generation bigint not null default 1 check (generation > 0),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  unique (app_id, identity_hash)
);
create table app_private.wechat_mini_proofs (
  proof_id uuid primary key default gen_random_uuid(),
  app_id text not null check (app_id ~ '^wx[0-9a-f]{16}$'),
  verifier_hash text not null check (verifier_hash ~ '^[0-9a-f]{64}$'),
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('login','pair_claim','pair_confirm')),
  pairing_id uuid,
  transfer_hash text check (transfer_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '5 minutes',
  code_hash text unique check (code_hash ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz,
  identity_hash text check (identity_hash ~ '^v1:[0-9a-f]{64}$'),
  consumed_at timestamptz,
  check ((purpose='login' and pairing_id is null and transfer_hash is null)
    or (purpose='pair_claim' and pairing_id is null and transfer_hash is not null)
    or (purpose='pair_confirm' and pairing_id is not null and transfer_hash is null))
);
create index wechat_mini_proofs_device_idx on app_private.wechat_mini_proofs(device_hash,created_at);
create table app_private.wechat_mini_pairings (
  pairing_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id),
  admin_session_id uuid not null,
  app_id text not null check (app_id ~ '^wx[0-9a-f]{16}$'),
  transfer_hash text not null unique check (transfer_hash ~ '^[0-9a-f]{64}$'),
  admin_hash text not null check (admin_hash ~ '^[0-9a-f]{64}$'),
  mini_hash text check (mini_hash ~ '^[0-9a-f]{64}$'),
  comparison text not null check (comparison ~ '^[0-9]{8}$'),
  identity_hash text check (identity_hash ~ '^v1:[0-9a-f]{64}$'),
  device_hash text check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '5 minutes',
  approved_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz
);
create table app_private.wechat_mini_mapping_audit (
  event_id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references app_private.wechat_mini_mappings(mapping_id),
  pairing_id uuid references app_private.wechat_mini_pairings(pairing_id),
  profile_id uuid not null references public.profiles(profile_id),
  event text not null check (event in ('linked','unlinked','relinked','confirmed')),
  created_at timestamptz not null default clock_timestamp()
);
alter table app_private.wechat_mini_mappings enable row level security;
alter table app_private.wechat_mini_proofs enable row level security;
alter table app_private.wechat_mini_pairings enable row level security;
alter table app_private.wechat_mini_mapping_audit enable row level security;
revoke all on app_private.wechat_mini_mappings, app_private.wechat_mini_proofs,
  app_private.wechat_mini_pairings, app_private.wechat_mini_mapping_audit from public,anon,authenticated,service_role;

alter table app_private.wechat_mini_sessions
  add column protocol text not null default 'mini-id-token-nonce-v1',
  add column mapping_id uuid references app_private.wechat_mini_mappings(mapping_id),
  add column mapping_generation bigint,
  add constraint wechat_mini_session_protocol_check check (
    (protocol = 'mini-id-token-nonce-v1' and mapping_id is null and mapping_generation is null)
    or (protocol = 'wechat-mini-code2session-v1' and mapping_id is not null and mapping_generation > 0)
  );

-- A bounded pilot-wide transaction lock gives revoke, resolve, pairing and issue
-- a single ordering. Business authorization keeps the lock until commit.
create function app_private.wechat_mini_lock_v1() returns void
language sql security definer set search_path = pg_catalog,pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended('wechat-mini-direct-v1',0));
$$;
create function app_private.wechat_mini_profile_live_v1(p_profile uuid) returns boolean
language sql stable security definer set search_path = pg_catalog,pg_temp as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.profile_id
    where p.profile_id=p_profile and p.profile_status='active' and p.disabled_at is null
      and u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and (u.banned_until is null or u.banned_until <= clock_timestamp()));
$$;
create function app_private.wechat_mini_admin_live_v1(p_profile uuid,p_session uuid) returns boolean
language sql stable security definer set search_path = pg_catalog,pg_temp as $$
  select app_private.wechat_mini_profile_live_v1(p_profile) and exists(
    select 1 from auth.sessions s where s.id=p_session and s.user_id=p_profile
      and (s.not_after is null or s.not_after > clock_timestamp()));
$$;

create function public.wechat_mini_proof_create_v1(p_app_id text,p_verifier_hash text,p_device_hash text,p_purpose text,p_pairing_id uuid default null,p_transfer_hash text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_proofs%rowtype;
begin
  perform app_private.wechat_require_service_role_v1();
  perform app_private.wechat_mini_lock_v1();
  -- Global and per-device admission bound an attacker rotating device identifiers.
  delete from app_private.wechat_mini_proofs where created_at < clock_timestamp()-interval '1 day';
  if (select count(*) from app_private.wechat_mini_proofs where created_at > clock_timestamp()-interval '1 minute') >= 120
    or (select count(*) from app_private.wechat_mini_proofs where device_hash=p_device_hash and created_at > clock_timestamp()-interval '5 minutes') >= 20 then
    return jsonb_build_object('ok',false,'code','rate_limited');
  end if;
  insert into app_private.wechat_mini_proofs(app_id,verifier_hash,device_hash,purpose,pairing_id,transfer_hash)
    values(p_app_id,p_verifier_hash,p_device_hash,p_purpose,p_pairing_id,p_transfer_hash) returning * into v;
  return jsonb_build_object('ok',true,'proof_id',v.proof_id,'expires_at',v.expires_at);
end;
$$;
create function public.wechat_mini_proof_claim_v1(p_proof_id uuid,p_app_id text,p_verifier_hash text,p_device_hash text,p_code_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
begin
  perform app_private.wechat_require_service_role_v1();
  perform app_private.wechat_mini_lock_v1();
  if exists(select 1 from app_private.wechat_mini_proofs where code_hash=p_code_hash) then return false; end if;
  update app_private.wechat_mini_proofs set claimed_at=clock_timestamp(),code_hash=p_code_hash
    where proof_id=p_proof_id and app_id=p_app_id and verifier_hash=p_verifier_hash
      and device_hash=p_device_hash and claimed_at is null and expires_at>clock_timestamp();
  return found;
end;
$$;
create function public.wechat_mini_proof_verify_v1(p_proof_id uuid,p_app_id text,p_code_hash text,p_identity_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
begin
  perform app_private.wechat_require_service_role_v1();
  update app_private.wechat_mini_proofs set identity_hash=p_identity_hash
    where proof_id=p_proof_id and app_id=p_app_id and code_hash=p_code_hash and claimed_at is not null
      and identity_hash is null and consumed_at is null and expires_at>clock_timestamp();
  return found;
end;
$$;

-- Authenticated entry derives identity from the real JWT. All caller-supplied
-- capabilities are hashes; the server also checks getUser and same-origin POST.
create function public.wechat_mini_pair_start_v1(p_app_id text,p_transfer_hash text,p_admin_hash text,p_comparison text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v_actor uuid := auth.uid(); v_session uuid := (auth.jwt()->>'session_id')::uuid; v app_private.wechat_mini_pairings%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.wechat_mini_admin_live_v1(v_actor,v_session) then
    raise exception 'wechat_personal_session_required' using errcode='42501';
  end if;
  perform app_private.wechat_mini_lock_v1();
  if (select count(*) from app_private.wechat_mini_pairings where profile_id=v_actor and created_at>clock_timestamp()-interval '15 minutes') >= 10 then
    return jsonb_build_object('ok',false,'code','rate_limited');
  end if;
  update app_private.wechat_mini_pairings set cancelled_at=clock_timestamp()
    where profile_id=v_actor and finished_at is null and cancelled_at is null;
  insert into app_private.wechat_mini_pairings(profile_id,admin_session_id,app_id,transfer_hash,admin_hash,comparison)
    values(v_actor,v_session,p_app_id,p_transfer_hash,p_admin_hash,p_comparison) returning * into v;
  return jsonb_build_object('ok',true,'pairing_id',v.pairing_id,'expires_at',v.expires_at);
end;
$$;
create function public.wechat_mini_pair_admin_v1(p_pairing_id uuid,p_admin_hash text,p_action text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_pairings%rowtype; v_actor uuid:=auth.uid(); v_session uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.wechat_mini_admin_live_v1(v_actor,v_session) then
    raise exception 'wechat_personal_session_required' using errcode='42501';
  end if;
  perform app_private.wechat_mini_lock_v1();
  select * into v from app_private.wechat_mini_pairings where pairing_id=p_pairing_id
    and profile_id=v_actor and admin_session_id=v_session and admin_hash=p_admin_hash for update;
  if not found or v.expires_at<=clock_timestamp() or v.cancelled_at is not null then return jsonb_build_object('ok',false,'code','pairing_expired'); end if;
  if p_action='approve' and v.identity_hash is not null and v.finished_at is null then
    update app_private.wechat_mini_pairings set approved_at=coalesce(approved_at,clock_timestamp()) where pairing_id=v.pairing_id;
    v.approved_at:=clock_timestamp();
  elsif p_action='cancel' and v.finished_at is null then
    update app_private.wechat_mini_pairings set cancelled_at=clock_timestamp() where pairing_id=v.pairing_id;
    return jsonb_build_object('ok',true,'state','cancelled');
  elsif p_action <> 'status' then return jsonb_build_object('ok',false,'code','pairing_invalid'); end if;
  return jsonb_build_object('ok',true,'comparison',v.comparison,'state',case
    when v.finished_at is not null then 'linked' when v.approved_at is not null then 'approved'
    when v.identity_hash is not null then 'claimed' else 'waiting' end);
end;
$$;

create function public.wechat_mini_pair_claim_v1(p_proof_id uuid,p_transfer_hash text,p_mini_hash text,p_allowed_profiles uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_pairings%rowtype; v_proof app_private.wechat_mini_proofs%rowtype; v_name text;
begin
  perform app_private.wechat_require_service_role_v1(); perform app_private.wechat_mini_lock_v1();
  select * into v_proof from app_private.wechat_mini_proofs where proof_id=p_proof_id for update;
  if not found or v_proof.purpose<>'pair_claim' or v_proof.transfer_hash is distinct from p_transfer_hash or v_proof.identity_hash is null or v_proof.consumed_at is not null or v_proof.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'code','proof_invalid'); end if;
  select * into v from app_private.wechat_mini_pairings where transfer_hash=p_transfer_hash for update;
  if not found or v.app_id<>v_proof.app_id or v.expires_at<=clock_timestamp() or v.cancelled_at is not null
    or v.finished_at is not null or v.identity_hash is not null or not coalesce(v.profile_id=any(p_allowed_profiles),false)
    or not app_private.wechat_mini_admin_live_v1(v.profile_id,v.admin_session_id) then
    return jsonb_build_object('ok',false,'code','pairing_invalid'); end if;
  update app_private.wechat_mini_proofs set consumed_at=clock_timestamp() where proof_id=p_proof_id;
  update app_private.wechat_mini_pairings set mini_hash=p_mini_hash,identity_hash=v_proof.identity_hash,device_hash=v_proof.device_hash where pairing_id=v.pairing_id;
  select display_name into v_name from public.profiles where profile_id=v.profile_id;
  return jsonb_build_object('ok',true,'pairing_id',v.pairing_id,'comparison',v.comparison,'account_name',coalesce(v_name,'Personal account'),'expires_at',v.expires_at);
end;
$$;
create function public.wechat_mini_pair_confirm_v1(p_proof_id uuid,p_pairing_id uuid,p_mini_hash text,p_allowed_profiles uuid[])
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_pairings%rowtype; v_proof app_private.wechat_mini_proofs%rowtype; v_map app_private.wechat_mini_mappings%rowtype; v_event text;
begin
  perform app_private.wechat_require_service_role_v1(); perform app_private.wechat_mini_lock_v1();
  select * into v_proof from app_private.wechat_mini_proofs where proof_id=p_proof_id for update;
  if not found or v_proof.purpose<>'pair_confirm' or v_proof.pairing_id is distinct from p_pairing_id or v_proof.identity_hash is null or v_proof.consumed_at is not null or v_proof.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'code','proof_invalid'); end if;
  select * into v from app_private.wechat_mini_pairings where pairing_id=p_pairing_id and mini_hash=p_mini_hash for update;
  if not found or v.app_id<>v_proof.app_id or v.identity_hash is distinct from v_proof.identity_hash
    or v.device_hash is distinct from v_proof.device_hash or v.expires_at<=clock_timestamp()
    or v.cancelled_at is not null or v.finished_at is not null or v.approved_at is null
    or not coalesce(v.profile_id=any(p_allowed_profiles),false)
    or not app_private.wechat_mini_admin_live_v1(v.profile_id,v.admin_session_id) then
    return jsonb_build_object('ok',false,'code','pairing_invalid'); end if;
  select * into v_map from app_private.wechat_mini_mappings where app_id=v.app_id and identity_hash=v.identity_hash for update;
  if found and v_map.profile_id<>v.profile_id then return jsonb_build_object('ok',false,'code','identity_conflict'); end if;
  if v_map.mapping_id is null then
    insert into app_private.wechat_mini_mappings(app_id,identity_hash,profile_id) values(v.app_id,v.identity_hash,v.profile_id) returning * into v_map;
    v_event:='linked';
  elsif v_map.revoked_at is not null then
    if v.created_at <= v_map.revoked_at or v.approved_at <= v_map.revoked_at then
      return jsonb_build_object('ok',false,'code','pairing_invalid'); end if;
    update app_private.wechat_mini_mappings set revoked_at=null,generation=generation+1 where mapping_id=v_map.mapping_id;
    v_event:='relinked';
  else v_event:='confirmed'; end if;
  update app_private.wechat_mini_proofs set consumed_at=clock_timestamp() where proof_id=p_proof_id;
  update app_private.wechat_mini_pairings set finished_at=clock_timestamp() where pairing_id=v.pairing_id;
  insert into app_private.wechat_mini_mapping_audit(mapping_id,pairing_id,profile_id,event) values(v_map.mapping_id,v.pairing_id,v.profile_id,v_event);
  return jsonb_build_object('ok',true,'state','linked');
end;
$$;

create function public.wechat_mini_mapping_unlink_v1(p_mapping_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v_actor uuid:=auth.uid(); v_session uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if auth.role() is distinct from 'authenticated' or not app_private.wechat_mini_admin_live_v1(v_actor,v_session) then
    raise exception 'wechat_personal_session_required' using errcode='42501'; end if;
  perform app_private.wechat_mini_lock_v1();
  update app_private.wechat_mini_mappings set revoked_at=clock_timestamp(),generation=generation+1
    where mapping_id=p_mapping_id and profile_id=v_actor and revoked_at is null;
  if not found then return false; end if;
  update app_private.wechat_mini_pairings p set cancelled_at=clock_timestamp()
    where p.profile_id=v_actor and p.finished_at is null and p.cancelled_at is null
      and p.app_id=(select app_id from app_private.wechat_mini_mappings where mapping_id=p_mapping_id);
  update app_private.wechat_mini_sessions set revoked_at=coalesce(revoked_at,clock_timestamp()) where mapping_id=p_mapping_id;
  insert into app_private.wechat_mini_mapping_audit(mapping_id,profile_id,event) values(p_mapping_id,v_actor,'unlinked');
  return true;
end;
$$;
create function public.wechat_mini_mappings_v1() returns jsonb
language plpgsql security definer set search_path = pg_catalog,pg_temp as $$
begin
  if auth.role() is distinct from 'authenticated' or not app_private.wechat_mini_admin_live_v1(auth.uid(),(auth.jwt()->>'session_id')::uuid) then
    raise exception 'wechat_personal_session_required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('mapping_id',mapping_id,'provider','wechat-mini','created_at',created_at)),'[]'::jsonb)
    from app_private.wechat_mini_mappings where profile_id=auth.uid() and revoked_at is null);
end;
$$;

create function public.wechat_mini_direct_issue_v1(p_proof_id uuid,p_token_hash text,p_allowed_profiles uuid[],p_fingerprint_salt text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='5s' as $$
declare v_proof app_private.wechat_mini_proofs%rowtype; v_map app_private.wechat_mini_mappings%rowtype; v_result jsonb;
begin
  perform app_private.wechat_require_service_role_v1(); perform app_private.wechat_mini_lock_v1();
  select * into v_proof from app_private.wechat_mini_proofs where proof_id=p_proof_id for update;
  if not found or v_proof.purpose<>'login' or v_proof.identity_hash is null or v_proof.consumed_at is not null or v_proof.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'code','proof_invalid'); end if;
  select * into v_map from app_private.wechat_mini_mappings where app_id=v_proof.app_id and identity_hash=v_proof.identity_hash and revoked_at is null for update;
  if not found or not coalesce(v_map.profile_id=any(p_allowed_profiles),false) or not app_private.wechat_mini_profile_live_v1(v_map.profile_id) then
    return jsonb_build_object('ok',false,'code','enrollment_required'); end if;
  if length(p_fingerprint_salt)<32 or length(p_fingerprint_salt)>256 then raise exception 'invalid_config'; end if;
  v_result:=public.wechat_mini_session_issue_v1(v_map.profile_id,p_token_hash,v_proof.device_hash,
    encode(extensions.digest(p_fingerprint_salt||':account:'||v_map.profile_id::text,'sha256'),'hex'),p_proof_id,900);
  update app_private.wechat_mini_sessions set protocol='wechat-mini-code2session-v1',mapping_id=v_map.mapping_id,mapping_generation=v_map.generation
    where session_id=(v_result->>'session_id')::uuid;
  update app_private.wechat_mini_proofs set consumed_at=clock_timestamp() where proof_id=p_proof_id;
  return v_result || jsonb_build_object('actor_profile_id',v_map.profile_id,'protocol','wechat-mini-code2session-v1');
end;
$$;

create or replace function public.wechat_mini_session_resolve_v1(p_token_hash text,p_device_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='3s' as $$
declare v app_private.wechat_mini_sessions%rowtype;
begin
  perform app_private.wechat_require_service_role_v1(); perform app_private.wechat_mini_lock_v1();
  select * into v from app_private.wechat_mini_sessions where token_hash=p_token_hash and device_hash=p_device_hash for update;
  if not found or v.revoked_at is not null or v.expires_at<=clock_timestamp()
    or not app_private.wechat_mini_profile_live_v1(v.actor_profile_id)
    or not exists(select 1 from app_private.wechat_mini_session_generations where actor_profile_id=v.actor_profile_id and generation=v.generation)
    or (v.protocol='wechat-mini-code2session-v1' and not exists(select 1 from app_private.wechat_mini_mappings m
      where m.mapping_id=v.mapping_id and m.profile_id=v.actor_profile_id and m.generation=v.mapping_generation and m.revoked_at is null)) then
    return jsonb_build_object('ok',false,'code','session_expired'); end if;
  return jsonb_build_object('ok',true,'actor_profile_id',v.actor_profile_id,'session_id',v.session_id,'generation',v.generation,
    'expires_at',v.expires_at,'account_fingerprint',v.account_fingerprint,'protocol',v.protocol);
end;
$$;

-- All new functions default-deny; only the named Admin functions accept a real
-- authenticated JWT. Service RPCs cannot be called with an ordinary user token.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname in ('wechat_mini_proof_create_v1','wechat_mini_proof_claim_v1','wechat_mini_proof_verify_v1',
      'wechat_mini_pair_start_v1','wechat_mini_pair_admin_v1','wechat_mini_pair_claim_v1','wechat_mini_pair_confirm_v1',
      'wechat_mini_mapping_unlink_v1','wechat_mini_mappings_v1','wechat_mini_direct_issue_v1'))
      or (n.nspname='app_private' and p.proname in ('wechat_mini_lock_v1','wechat_mini_profile_live_v1','wechat_mini_admin_live_v1'))
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
    if r.nspname='public' then
      execute format('grant execute on function %s to %I',r.signature,case when r.proname in
        ('wechat_mini_pair_start_v1','wechat_mini_pair_admin_v1','wechat_mini_mapping_unlink_v1','wechat_mini_mappings_v1') then 'authenticated' else 'service_role' end);
    end if;
  end loop;
end;
$$;

-- Enumerated business gateway: session proof, never a caller-selected actor.
create function public.wechat_mini_business_v1(p_token_hash text,p_device_hash text,p_allowed_profiles uuid[],p_allowed_shops uuid[],p_operation text,p_params jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog,pg_temp set statement_timeout='5s' as $$
declare v_session jsonb; v_actor uuid; v_shop uuid; v_result jsonb; v_row jsonb; v_claims text:=current_setting('request.jwt.claims',true); v_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  perform app_private.wechat_require_service_role_v1();
  v_session:=public.wechat_mini_session_resolve_v1(p_token_hash,p_device_hash);
  v_actor:=(v_session->>'actor_profile_id')::uuid;
  if v_session->>'ok' is distinct from 'true' or not coalesce(v_actor=any(p_allowed_profiles),false)
    or coalesce(cardinality(p_allowed_shops),0)=0 then raise exception 'wechat_mini_session_expired' using errcode='28000'; end if;
  if p_params is null or jsonb_typeof(p_params)<>'object' or octet_length(p_params::text)>65536
    or p_params ? 'p_actor_profile_id' or p_params ? 'p_actor_kind' then raise exception 'wechat_mini_business_invalid' using errcode='22023'; end if;
  v_shop:=case when p_operation='read' then (p_params->'p_params'->>'p_shop_id')::uuid else (p_params->>'p_shop_id')::uuid end;
  if not (p_operation='read' and p_params->>'p_rpc' in ('wechat_account_profile_v1','wechat_authorized_shops_v2'))
    and not coalesce(v_shop=any(p_allowed_shops),false) then raise exception 'wechat_shop_denied' using errcode='42501'; end if;
  case p_operation
    when 'read' then
      v_result:=public.wechat_mini_read_v1(v_actor,p_params->>'p_rpc',p_params->'p_params');
      if p_params->>'p_rpc'='wechat_authorized_shops_v2' then
        select coalesce(jsonb_agg(r),'[]'::jsonb) into v_result from jsonb_array_elements(v_result) r where (r->>'shop_id')::uuid=any(p_allowed_shops);
      elsif p_params->>'p_rpc'='wechat_account_profile_v1' and v_session->>'protocol'='wechat-mini-code2session-v1' then
        select coalesce(jsonb_agg(r || jsonb_build_object('mini_identity_provider','wechat-mini','mini_identity_linked',true)),'[]'::jsonb)
          into v_result from jsonb_array_elements(v_result) r;
      end if;
    when 'product_image_create_intent_wechat_v1' then v_result:=to_jsonb(public.product_image_create_intent_wechat_v1(v_actor,(p_params->>'p_shop_id')::uuid,(p_params->>'p_product_id')::uuid,(p_params->>'p_main_sha256')::text,(p_params->>'p_main_bytes')::integer,(p_params->>'p_main_width')::integer,(p_params->>'p_main_height')::integer,(p_params->>'p_thumb_sha256')::text,(p_params->>'p_thumb_bytes')::integer,(p_params->>'p_thumb_width')::integer,(p_params->>'p_thumb_height')::integer,(p_params->>'p_idempotency_key')::uuid,(p_params->>'p_correlation_id')::uuid));
    when 'product_image_fail_version' then v_result:=to_jsonb(public.product_image_fail_version(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->>'p_product_id')::uuid,(p_params->>'p_version_id')::uuid,(p_params->>'p_error_code')::text));
    when 'product_image_finalize' then v_result:=to_jsonb(public.product_image_finalize(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->>'p_product_id')::uuid,(p_params->>'p_version_id')::uuid,(p_params->>'p_main_sha256')::text,(p_params->>'p_main_bytes')::integer,(p_params->>'p_main_width')::integer,(p_params->>'p_main_height')::integer,(p_params->>'p_thumb_sha256')::text,(p_params->>'p_thumb_bytes')::integer,(p_params->>'p_thumb_width')::integer,(p_params->>'p_thumb_height')::integer));
    when 'product_image_record_cleanup' then v_result:=to_jsonb(public.product_image_record_cleanup(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->>'p_product_id')::uuid,(p_params->>'p_version_id')::uuid,(p_params->>'p_success')::boolean,(p_params->>'p_error_code')::text,(p_params->>'p_source')::text));
    when 'product_image_remove' then v_result:=to_jsonb(public.product_image_remove(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->>'p_product_id')::uuid,(p_params->>'p_expected_version_id')::uuid));
    when 'product_image_resolve_read_paths' then v_result:=to_jsonb(public.product_image_resolve_read_paths(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->'p_refs')::jsonb));
    when 'product_image_revalidate_access_v1' then v_result:=to_jsonb(public.product_image_revalidate_access_v1(v_actor,'personal_account',(p_params->>'p_shop_id')::uuid,(p_params->>'p_permission')::text));
    when 'wechat_catalog_mutate_v1' then v_result:=to_jsonb(public.wechat_catalog_mutate_v1(v_actor,(p_params->>'p_shop_id')::uuid,(p_params->>'p_operation')::text,(p_params->>'p_idempotency_key')::uuid,(p_params->>'p_correlation_id')::uuid,(p_params->>'p_expected_updated_at')::timestamp with time zone,(p_params->>'p_target_id')::uuid,(p_params->'p_payload')::jsonb));
    when 'wechat_mini_sync_checkpoint_v1' then v_result:=to_jsonb(public.wechat_mini_sync_checkpoint_v1(v_actor,(p_params->>'p_shop_id')::uuid,(p_params->>'p_device_identifier')::text,(p_params->>'p_after_id')::text,(p_params->>'p_expected_scope_key')::text,(p_params->>'p_last_reconciled_at')::timestamp with time zone));
    when 'wechat_mini_sync_delta_v1' then v_result:=to_jsonb(public.wechat_mini_sync_delta_v1(v_actor,(p_params->>'p_shop_id')::uuid,(p_params->>'p_device_identifier')::text,(p_params->>'p_after_id')::text,(p_params->>'p_limit')::integer,(p_params->>'p_expected_scope_key')::text,(p_params->>'p_expected_event_max_id')::text));
    else raise exception 'wechat_operation_denied' using errcode='42501';
  end case;
  -- Existing implementations establish transaction-local Auth claims. Restore
  -- the trusted caller context before returning to another in-transaction call.
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  return v_result;
end;
$$;
revoke all on function public.wechat_mini_business_v1(text,text,uuid[],uuid[],text,jsonb) from public,anon,authenticated;
grant execute on function public.wechat_mini_business_v1(text,text,uuid[],uuid[],text,jsonb) to service_role;

-- Preserve the legacy OIDC issuer/revoker contract, with the same lock order
-- as direct resolve and unlink. Canonical account lifecycle is checked too.
create or replace function public.wechat_mini_session_issue_v1(
  p_actor_profile_id uuid,
  p_token_hash text,
  p_device_hash text,
  p_account_fingerprint text,
  p_correlation_id uuid,
  p_ttl_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
set statement_timeout = '5s'
as $$
declare
  v_generation bigint;
  v_session_id uuid;
  v_expires_at timestamptz;
begin
  perform app_private.wechat_require_service_role_v1();
  perform app_private.wechat_mini_lock_v1();
  if p_actor_profile_id is null
    or coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_device_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_account_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_correlation_id is null
    or p_ttl_seconds is null
    or p_ttl_seconds < 60
    or p_ttl_seconds > 1800 then
    raise exception 'wechat_mini_session_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wechat-mini-session:' || p_actor_profile_id::text, 0)
  );

  if not app_private.wechat_mini_profile_live_v1(p_actor_profile_id) or not exists (
    select 1
    from public.profiles profile
    where profile.profile_id = p_actor_profile_id
      and profile.profile_status = 'active'
      and profile.disabled_at is null
    for update
  ) then
    raise exception 'wechat_mini_session_expired' using errcode = '28000';
  end if;

  insert into app_private.wechat_mini_session_generations(actor_profile_id)
  values (p_actor_profile_id)
  on conflict (actor_profile_id) do nothing;

  select generation
  into strict v_generation
  from app_private.wechat_mini_session_generations
  where actor_profile_id = p_actor_profile_id
  for update;

  if (
    select count(*)
    from app_private.wechat_mini_sessions session
    where session.actor_profile_id = p_actor_profile_id
      and session.issued_at >= clock_timestamp() - interval '15 minutes'
  ) >= 20 then
    raise exception 'wechat_rate_limited' using errcode = 'P0001';
  end if;

  update app_private.wechat_mini_sessions session
  set revoked_at = coalesce(session.revoked_at, clock_timestamp())
  where session.actor_profile_id = p_actor_profile_id
    and session.revoked_at is null
    and (
      session.expires_at <= clock_timestamp()
      or session.session_id in (
        select active.session_id
        from app_private.wechat_mini_sessions active
        where active.actor_profile_id = p_actor_profile_id
          and active.revoked_at is null
          and active.expires_at > clock_timestamp()
        order by active.issued_at desc
        offset 4
      )
    );

  v_expires_at := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into app_private.wechat_mini_sessions(
    actor_profile_id,
    generation,
    token_hash,
    device_hash,
    account_fingerprint,
    correlation_id,
    expires_at
  ) values (
    p_actor_profile_id,
    v_generation,
    p_token_hash,
    p_device_hash,
    p_account_fingerprint,
    p_correlation_id,
    v_expires_at
  )
  returning session_id into v_session_id;

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'generation', v_generation,
    'expires_at', v_expires_at,
    'account_fingerprint', p_account_fingerprint
  );
end;
$$;


-- Preserve the legacy OIDC issuer/revoker contract, with the same lock order
-- as direct resolve and unlink. Canonical account lifecycle is checked too.
create or replace function public.wechat_mini_session_revoke_v1(
  p_token_hash text,
  p_device_hash text
)
returns boolean
language plpgsql
security definer
set search_path = app_private, auth, pg_temp
set statement_timeout = '3s'
as $$
begin
  perform app_private.wechat_require_service_role_v1();
  perform app_private.wechat_mini_lock_v1();
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_device_hash, '') !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update app_private.wechat_mini_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where token_hash = p_token_hash
    and device_hash = p_device_hash;
  return found;
end;
$$;

-- Modern PostgREST JWT claims do not include the legacy per-claim GUCs.
create or replace function app_private.wechat_mini_assume_shop_sync_actor_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, auth, pg_temp
as $$
declare
  v_sync_actor_id uuid;
  v_claims text := current_setting('request.jwt.claims',true);
  v_sub text := current_setting('request.jwt.claim.sub',true);
begin
  perform app_private.wechat_mini_require_shop_reader_v1(
    p_actor_profile_id, p_shop_id
  );
  select member.profile_id
  into v_sync_actor_id
  from public.shop_members member
  join public.profiles profile on profile.profile_id = member.profile_id
  where member.shop_id = p_shop_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
    and profile.profile_status = 'active'
    and profile.disabled_at is null
    and app_private.wechat_mini_profile_live_v1(member.profile_id)
  order by case member.role_key when 'shop_owner' then 0 else 1 end,
    member.created_at,
    member.profile_id
  limit 1
  for share of member, profile;
  if v_sync_actor_id is null then
    raise exception 'wechat_mini_membership_missing' using errcode = '42501';
  end if;
  -- Reader authorization is complete. Restore the verified service context
  -- before the second internal actor transition; never depend on legacy GUCs.
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
  perform app_private.wechat_mini_assume_actor_v1(v_sync_actor_id);
  return v_sync_actor_id;
end;
$$;
