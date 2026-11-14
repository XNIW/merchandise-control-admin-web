-- ASUS019: qualified input reuse and Master-only technical management.
-- Existing evidence, ledger, device baseline and bounded work budgets are retained.
alter table public.payment_history_evidence
 add column qualification_version text check(qualification_version is null or qualification_version='getnet-qualified-input-v1'),
 add column qualified_by text check(qualified_by is null or qualified_by in('platform_master','explicit_shop_delegate')),
 add column qualification_request_digest text check(qualification_request_digest is null or qualification_request_digest ~ '^[0-9a-f]{64}$'),
 add constraint payment_history_qualified_document_required check(
  (qualification_version is null and qualified_by is null) or
  (qualification_version is not null and qualified_by is not null and document_sha256 is not null and document_upload_id is not null and qualification_request_digest is not null));

create function app_private.payment_history_qualified_evidence_immutable_v1() returns trigger
language plpgsql set search_path='' as $$begin
 if old.qualification_version is null and new.qualification_version is not null then
  raise exception using errcode='55000',message='payment_history_old_attestation_not_qualification';end if;
 if old.qualification_version is not null and new.status is distinct from old.status then
  perform 1 from public.payment_history_runtime where shop_id=old.shop_id for update;
  perform app_private.payment_history_local_mutation_fence_v2(old.shop_id);
  if exists(select 1 from public.payment_history_local_publications p where p.shop_id=old.shop_id and p.qualification is not null
   and p.grant_id is not null and p.state not in('committed','aborted')) then raise exception using errcode='40001',message='payment_history_local_publications_not_drained';end if;
 end if;
 if old.qualification_version is not null and
  (row(new.evidence_id,new.shop_id,new.kind,new.verification_level,new.policy_version,new.reference,new.document_sha256,new.document_upload_id,
    new.scope,new.actor_kind,new.actor_id,new.created_at,new.verified_at,new.qualification_version,new.qualified_by,new.qualification_request_digest)
   is distinct from row(old.evidence_id,old.shop_id,old.kind,old.verification_level,old.policy_version,old.reference,old.document_sha256,old.document_upload_id,
    old.scope,old.actor_kind,old.actor_id,old.created_at,old.verified_at,old.qualification_version,old.qualified_by,old.qualification_request_digest)
   or old.status='revoked' and new.status<>'revoked' or new.status not in('verified','revoked')) then
  raise exception using errcode='55000',message='payment_history_qualified_evidence_immutable';end if;
 return new;
end;$$;

create function app_private.payment_history_bind_qualified_alias_v1(p_shop uuid,p_evidence public.payment_history_evidence,p_mapping jsonb) returns void
language plpgsql volatile set search_path='' as $$
declare merchant uuid;alias text;begin
 if p_evidence.shop_id<>p_shop or p_evidence.kind<>'merchant_mapping' or p_evidence.qualification_version is distinct from 'getnet-qualified-input-v1'
  or p_evidence.status<>'verified' or jsonb_typeof(p_mapping) is distinct from 'object'
  or not app_private.payment_history_local_keys_v2(p_mapping,array['label','source_identity'])
  or jsonb_typeof(p_mapping->'label') is distinct from 'string' or length(btrim(p_mapping->>'label')) not between 1 and 256
  or not app_private.payment_history_local_keys_v2(p_mapping->'source_identity',array['local','seller','sellerId','localNumber','rut','hasEvidence']) then
  raise exception using errcode='22023',message='payment_history_qualification_mapping_invalid';end if;
 merchant:=(p_evidence.scope->>'merchant_id')::uuid;
 alias:=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',p_mapping#>>'{source_identity,local}',p_mapping#>>'{source_identity,seller}',p_mapping#>>'{source_identity,sellerId}',p_mapping#>>'{source_identity,localNumber}',p_mapping#>>'{source_identity,rut}']);
 if alias is distinct from p_evidence.scope->>'alias_key' or exists(select 1 from jsonb_each(p_mapping->'source_identity') x
  where x.key<>'hasEvidence' and (jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>256))
  or p_mapping#>'{source_identity,hasEvidence}' is distinct from 'true'::jsonb then
  raise exception using errcode='22023',message='payment_history_qualification_mapping_invalid';end if;
 if exists(select 1 from public.payment_history_merchant_aliases where shop_id=p_shop and alias_key=alias and active and merchant_id<>merchant) then
  raise exception using errcode='23505',message='payment_history_alias_collision';end if;
 if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop and merchant_id=merchant) then
  insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(merchant,p_shop,p_mapping->>'label',p_evidence.evidence_id);
 end if;
 update public.payment_history_merchant_aliases set active=false where shop_id=p_shop and alias_key=alias and active and merchant_id=merchant and evidence_id<>p_evidence.evidence_id;
 insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id)
  values(p_shop,merchant,alias,p_mapping->'source_identity',p_evidence.evidence_id)
  on conflict(shop_id,alias_version,alias_key) where active do update set evidence_id=excluded.evidence_id;
end;$$;
revoke all on function app_private.payment_history_bind_qualified_alias_v1(uuid,public.payment_history_evidence,jsonb) from public,anon,authenticated,service_role;
revoke all on function app_private.payment_history_qualified_evidence_immutable_v1() from public,anon,authenticated,service_role;
create trigger payment_history_qualified_evidence_immutable before update on public.payment_history_evidence
 for each row execute function app_private.payment_history_qualified_evidence_immutable_v1();

-- Genuine platform access is re-read from authoritative rows and the live Auth session.
-- Neither user_metadata, the POS staff code nor a client-supplied role can qualify it.
create function app_private.payment_history_master_actor_v1(p_shop uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare ses uuid;deadline timestamptz;begin
 if coalesce(auth.role(),'')<>'authenticated' or auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
  or coalesce(auth.jwt()->>'exp','') !~ '^[0-9]{1,12}$' then return null;end if;
 perform 1 from public.shops where shop_id=p_shop and shop_status='active' for share;
 if not found then return null;end if;
 perform 1 from public.platform_admins a join public.profiles p on p.profile_id=a.profile_id
  where a.profile_id=auth.uid() and a.status='active' and a.revoked_at is null and p.profile_status='active' and p.disabled_at is null for share of a,p;
 if not found then return null;end if;
 select s.id,least(coalesce(s.not_after,'infinity'),to_timestamp((auth.jwt()->>'exp')::bigint)) into ses,deadline
  from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() for share;
 if not found or deadline<=clock_timestamp() then return null;end if;
 perform set_config('app.payment_history_publish_deadline',deadline::text,true);
 return jsonb_build_object('kind','personal_account','id',auth.uid(),'session_id',ses,'credential_version',null);
end;$$;
revoke all on function app_private.payment_history_master_actor_v1(uuid) from public,anon,authenticated,service_role;

create function app_private.payment_history_qualified_config_v1(p_shop uuid,p_device uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare entries jsonb;r public.payment_history_runtime;runtime jsonb;bindings jsonb:='[]';ambiguous boolean;begin
 -- All qualification mutation routes acquire this runtime row exclusively.
 -- Take it before reading evidence, so a just-committed revocation cannot be
 -- published from an earlier statement snapshot after waiting for this lock.
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 runtime:=case when found then jsonb_build_object('dataset_id',r.dataset_id,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority) else null end;
 if (select count(*) from public.payment_history_evidence where shop_id=p_shop and qualification_version='getnet-qualified-input-v1')>200 then
  raise exception using errcode='54000',message='payment_history_qualification_capacity';end if;
 -- The read callers acquire their own current actor first; this helper is not executable directly.
 perform 1 from public.payment_history_evidence where shop_id=p_shop and qualification_version='getnet-qualified-input-v1' order by evidence_id for share;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.evidence_id,'shop_id',e.shop_id,
  'kind',case e.kind when 'merchant_mapping' then 'MerchantMapping' when 'legacy_currency' then 'LegacyCurrency' when 'modern_time' then 'ModernTime' when 'native_start' then 'NativeStart' end,
  'state',case e.status when 'verified' then 'Verified' when 'revoked' then 'Revoked' else 'Draft' end,
  'issuer',case e.qualified_by when 'platform_master' then 'PlatformMaster' else 'ExplicitShopDelegate' end,
  'qualification_version',e.qualification_version,'merchant_id',e.scope->>'merchant_id','alias_key',coalesce(e.scope->>'alias_key',''),
  'profile',e.scope->>'profile','parser_version',e.scope->>'parser_version','files',e.scope->'file_sha256',
  'from_ticks',e.scope->>'from_ticks','to_ticks',e.scope->>'to_ticks','policy_version',e.policy_version,'reference',e.reference,
  'interpretation',coalesce(e.scope->>'interpretation','Unresolved'),'native_start_ticks',e.scope->>'native_start_ticks',
  'provider_verified',e.verification_level='provider_verified','document_sha256',e.document_sha256,'document_upload_id',e.document_upload_id
 ) order by e.evidence_id),'[]') into entries from public.payment_history_evidence e
 where e.shop_id=p_shop and e.qualification_version='getnet-qualified-input-v1' and e.kind in('merchant_mapping','legacy_currency','modern_time','native_start');
 if p_device is not null then
  perform 1 from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
  -- This is an actual applied source-to-canonical link. Alias similarity and
  -- current alias evidence pointers are deliberately absent from the relation.
  with candidates as(
   select o.original_object->>'merchant_scope_id' local_scope_id,v.merchant_id,j.run_id,o.source_object_id witness_id
   from public.payment_history_local_writer_contexts c
   join public.payment_history_source_snapshots snap on snap.shop_id=c.shop_id and snap.shop_device_id=c.shop_device_id and snap.snapshot_id=c.source_snapshot_id
    and snap.local_dataset_id=c.local_dataset_id and snap.restore_epoch=c.restore_epoch
   join public.payment_history_migration_runs j on j.shop_id=snap.shop_id and j.run_id=snap.run_id and j.source_mode='local_baseline_v2' and j.state='applied'
    and j.source_context->>'device_id'=p_device::text and j.source_context->>'restore_lineage_id'=c.restore_lineage_id::text
   join public.payment_history_source_objects o on o.shop_id=snap.shop_id and o.source_snapshot_id=snap.snapshot_id and o.table_name='movements'
   join public.payment_history_local_movement_map lm on lm.shop_id=snap.shop_id and lm.shop_device_id=snap.shop_device_id and lm.local_dataset_id=snap.local_dataset_id and lm.local_movement_id=o.local_id
   join public.payment_history_movement_versions v on v.shop_id=lm.shop_id and v.movement_version_id=lm.movement_version_id
   where c.shop_id=p_shop and c.shop_device_id=p_device),
  grouped as(select local_scope_id,min(merchant_id::text) merchant_id,min(run_id::text) run_id,min(witness_id::text) witness_id,count(distinct merchant_id) merchants
   from candidates group by local_scope_id)
  select coalesce(jsonb_agg(jsonb_build_object('local_scope_id',local_scope_id,'merchant_id',merchant_id,'source_run_id',run_id,'witness_id',witness_id) order by local_scope_id),'[]'),coalesce(bool_or(merchants<>1),false)
   into bindings,ambiguous from grouped;
  if ambiguous or jsonb_array_length(bindings)>200 or exists(select 1 from jsonb_array_elements(bindings) b where length(coalesce(b->>'local_scope_id','')) not between 1 and 256) then
   raise exception using errcode='54000',message='payment_history_scope_binding_ambiguous';end if;
 end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('schema_version','getnet-qualified-input-v1','shop_id',p_shop,
  'config_digest',encode(extensions.digest(convert_to(jsonb_build_object('shop_id',p_shop,'runtime',runtime,'evidence',entries,'local_scope_bindings',bindings)::text,'UTF8'),'sha256'),'hex'),
  'runtime',runtime,'evidence',entries,'local_scope_bindings',bindings);
end;$$;
revoke all on function app_private.payment_history_qualified_config_v1(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.payment_history_profile_can_v1(p_shop_id uuid,p_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select p_capability in('read','import','cancel','export','migrate') and auth.uid() is not null
 and coalesce(auth.jwt()->>'is_anonymous','false')<>'true'
 and exists(select 1 from auth.sessions ses where ses.id::text=auth.jwt()->>'session_id' and ses.user_id=auth.uid()
  and (ses.not_after is null or ses.not_after>clock_timestamp()))
 and exists(select 1 from public.shops sh where sh.shop_id=p_shop_id and sh.shop_status='active')
 and exists(select 1 from public.profiles p where p.profile_id=auth.uid() and p.profile_status='active' and p.disabled_at is null)
 and (exists(select 1 from public.platform_admins pa where pa.profile_id=auth.uid() and pa.status='active' and pa.revoked_at is null)
  or exists(select 1 from public.shop_members m where m.shop_id=p_shop_id and m.profile_id=auth.uid() and m.membership_status='active'
   and (m.role_key='shop_owner' or m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g
    where g.shop_id=p_shop_id and g.role_key=m.role_key and g.capability=p_capability and g.enabled))));
$$;

create function public.payment_history_technical_access_v1(p_shop_id uuid,p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;master jsonb;begin
 actor:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 master:=case when p_staff_id is null then app_private.payment_history_master_actor_v1(p_shop_id) else null end;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',actor,'result',jsonb_build_object('can_manage',true,
  'issuer',case when master is not null then 'PlatformMaster' else 'ExplicitShopDelegate' end));
end;$$;
revoke all on function public.payment_history_technical_access_v1(uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_technical_access_v1(uuid,uuid,uuid,text,integer) to authenticated,service_role;

-- Existing Web checks retained; technical migrate now needs Master or its explicit role grant.
create or replace function app_private.payment_history_demand_actor_v1(p_shop_id uuid,p_capability text,p_staff_id uuid,
 p_staff_web_session_id uuid,p_session_token_hash text,p_credential_version integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_session uuid;v_deadline timestamptz;v_role text;v_enabled boolean;v_master jsonb;
begin
 if p_capability is null or p_capability not in ('read','import','cancel','export','migrate') then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.shops where shop_id=p_shop_id and shop_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if p_staff_id is null and p_staff_web_session_id is null and p_session_token_hash is null and p_credential_version is null then
  v_master:=app_private.payment_history_master_actor_v1(p_shop_id);
  if v_master is not null then return v_master;end if;
 end if;
 if p_staff_id is not null then
  if coalesce(auth.role(),'')<>'service_role' or p_session_token_hash is null or p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
   or p_staff_web_session_id is null or coalesce(p_credential_version,0)<1
   or not app_private.staff_web_runtime_lease_is_valid_v1(p_shop_id,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version,null)
   or not app_private.payment_history_staff_can_v1(p_shop_id,p_staff_id,p_capability) then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  select role_key into v_role from public.staff_accounts where staff_id=p_staff_id and shop_id=p_shop_id;
  perform pg_advisory_xact_lock_shared(hashtextextended('payment-history-role:'||p_shop_id::text||':'||v_role,0));
  select enabled into v_enabled from public.payment_history_role_permissions
   where shop_id=p_shop_id and role_key=v_role and capability=p_capability for share;
  if found then
   if not v_enabled then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  else
   if p_capability='migrate' then raise exception using errcode='42501',message='payment_history_explicit_technical_grant_required';end if;
   perform 1 from public.staff_role_permissions where shop_id=p_shop_id and role_key=v_role and permission_key='shop_admin.full_access' and enabled for share;
   if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
  end if;
  perform set_config('app.payment_history_publish_deadline',current_setting('app.staff_web_publish_deadline'),true);
  return jsonb_build_object('kind','pos_staff_manager','id',p_staff_id,'session_id',p_staff_web_session_id,'credential_version',p_credential_version);
 end if;
 if p_staff_web_session_id is not null or p_session_token_hash is not null or p_credential_version is not null
  or coalesce(auth.role(),'')<>'authenticated' or not app_private.payment_history_profile_can_v1(p_shop_id,p_capability)
  or coalesce(auth.jwt()->>'exp','') !~ '^[0-9]{1,12}$' then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 select m.role_key into v_role from public.shop_members m where m.shop_id=p_shop_id and m.profile_id=auth.uid() and m.membership_status='active' for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform 1 from public.profiles where profile_id=auth.uid() and profile_status='active' and disabled_at is null for share;
 if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 if p_capability='migrate' and v_role<>'shop_manager' then raise exception using errcode='42501',message='payment_history_master_required';end if;
 if v_role='shop_manager' then perform 1 from public.payment_history_role_permissions where shop_id=p_shop_id and role_key='shop_manager' and capability=p_capability and enabled for share;
  if not found then raise exception using errcode='42501',message='payment_history_permission_denied';end if;end if;
 select ses.id,least(coalesce(ses.not_after,'infinity'),to_timestamp((auth.jwt()->>'exp')::bigint)) into v_session,v_deadline
  from auth.sessions ses where ses.id::text=auth.jwt()->>'session_id' and ses.user_id=auth.uid() for share;
 if not found or v_deadline<=clock_timestamp() then raise exception using errcode='42501',message='payment_history_permission_denied';end if;
 perform set_config('app.payment_history_publish_deadline',v_deadline::text,true);
 return jsonb_build_object('kind','personal_account','id',auth.uid(),'session_id',v_session,'credential_version',null);
end;$$;

create function public.payment_history_qualification_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;current_actor jsonb;master jsonb;issuer text;e public.payment_history_evidence;existing public.payment_history_evidence;
 doc public.payment_history_uploads;s jsonb;result jsonb;id uuid;k text;changed boolean:=false;begin
 if p_operation not in('read','qualify','revoke') or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then
  raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
 actor:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 if p_operation='read' then
  if p_payload<>'{}'::jsonb then raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
  result:=app_private.payment_history_qualified_config_v1(p_shop_id);
 elsif p_operation='revoke' then
  if not app_private.payment_history_local_keys_v2(p_payload,array['evidence_id']) then raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
  select * into e from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid
   and qualification_version='getnet-qualified-input-v1' for update;
  if not found then raise exception using errcode='22023',message='payment_history_qualification_not_found';end if;
  if e.status<>'revoked' then
   update public.payment_history_evidence set status='revoked',revoked_at=clock_timestamp() where evidence_id=e.evidence_id returning * into e;changed:=true;
  end if;
  result:=jsonb_build_object('evidence_id',e.evidence_id,'status',e.status);
 else
  if not app_private.payment_history_local_keys_v2(p_payload,array['request_key','kind','level','version','reference','document_upload_id','document_sha256','scope','mapping'])
   or coalesce(p_payload->>'kind','') not in('merchant_mapping','legacy_currency','modern_time','native_start')
   or coalesce(p_payload->>'level','') not in('operator_attested','provider_verified')
   or jsonb_typeof(p_payload->'request_key') is distinct from 'string' or jsonb_typeof(p_payload->'document_upload_id') is distinct from 'string'
   or jsonb_typeof(p_payload->'version') is distinct from 'string' or length(btrim(p_payload->>'version')) not between 1 and 160
   or jsonb_typeof(p_payload->'reference') is distinct from 'string' or length(btrim(p_payload->>'reference')) not between 1 and 2048
   or (p_payload->>'reference') ~ '[[:cntrl:]]' or (p_payload->>'version') ~ '[[:cntrl:]]'
   or coalesce(p_payload->>'document_sha256','') !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
  id:=(p_payload->>'request_key')::uuid;if id='00000000-0000-0000-0000-000000000000' then raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
  s:=p_payload->'scope';
  if not app_private.payment_history_local_keys_v2(s,array['merchant_id','alias_key','profile','parser_version','file_sha256','from_ticks','to_ticks','interpretation','native_start_ticks'])
   or coalesce(s->>'profile','') not in('GetnetLegacy','GetnetModern') or coalesce(s->>'parser_version','') not in('getnet-ooxml-v1','getnet-ooxml-web-v1')
   or jsonb_typeof(s->'merchant_id') is distinct from 'string' or jsonb_typeof(s->'alias_key') is distinct from 'string'
   or coalesce(s->>'alias_key','')<>'' and s->>'alias_key' !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(s->'file_sha256') is distinct from 'array' or jsonb_array_length(s->'file_sha256') not between 1 and 10
   or exists(select 1 from jsonb_array_elements(s->'file_sha256') h where jsonb_typeof(h)<>'string' or h#>>'{}' !~ '^[0-9a-f]{64}$')
   or (select count(*) from jsonb_array_elements(s->'file_sha256'))<>(select count(distinct h) from jsonb_array_elements(s->'file_sha256') h)
   or jsonb_typeof(s->'from_ticks') is distinct from 'string' or jsonb_typeof(s->'to_ticks') is distinct from 'string'
   or coalesce(s->>'from_ticks','') !~ '^(0|[1-9][0-9]{0,18})$' or coalesce(s->>'to_ticks','') !~ '^[1-9][0-9]{0,18}$'
   or (s->>'from_ticks')::numeric>=(s->>'to_ticks')::numeric or (s->>'to_ticks')::numeric>3155378976000000000
   or coalesce(s->>'interpretation','') not in('Unresolved','IsoUtc','ExportedLocal') then
   raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  if (s->>'merchant_id')::uuid='00000000-0000-0000-0000-000000000000' then raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  if p_payload->>'kind'='modern_time' then
   if p_payload->>'level'<>'provider_verified' or s->>'profile'<>'GetnetModern' or s->>'interpretation'='Unresolved' then
    raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
  elsif s->>'interpretation'<>'Unresolved' then raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  if p_payload->>'kind'='legacy_currency' and s->>'profile'<>'GetnetLegacy' then raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  if p_payload->>'kind'='native_start' then
   if jsonb_typeof(s->'native_start_ticks') is distinct from 'string' or coalesce(s->>'native_start_ticks','') !~ '^[1-9][0-9]{0,18}$'
    or (s->>'native_start_ticks')::numeric>3155378975999999999 then raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  elsif s->'native_start_ticks'<>'null'::jsonb then raise exception using errcode='22023',message='payment_history_qualification_scope_invalid';end if;
  if exists(select 1 from jsonb_array_elements_text(s->'file_sha256') h where not exists(select 1 from public.payment_history_uploads u
   where u.shop_id=p_shop_id and u.file_sha256=h and u.state='verified' and u.file_name ~* '\.xlsx$')) then
   raise exception using errcode='22023',message='payment_history_qualified_source_required';end if;
  select * into doc from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'document_upload_id')::uuid
   and state='verified' and file_name ~* '\.(pdf|png|jpg|jpeg)$' for share;
  if not found or doc.file_sha256 is distinct from p_payload->>'document_sha256' then raise exception using errcode='22023',message='payment_history_qualified_document_required';end if;
  master:=case when p_staff_id is null then app_private.payment_history_master_actor_v1(p_shop_id) else null end;
  issuer:=case when master is not null then 'platform_master' else 'explicit_shop_delegate' end;
  select * into existing from public.payment_history_evidence where evidence_id=id for update;
  if found then
   if existing.shop_id<>p_shop_id or existing.qualification_version is distinct from 'getnet-qualified-input-v1' or existing.qualified_by is distinct from issuer
    or existing.status<>'verified' or existing.kind is distinct from p_payload->>'kind' or existing.verification_level is distinct from p_payload->>'level'
    or existing.policy_version is distinct from p_payload->>'version' or existing.reference is distinct from p_payload->>'reference'
    or existing.document_upload_id is distinct from doc.upload_id or existing.document_sha256 is distinct from doc.file_sha256 or existing.scope is distinct from s
    or existing.actor_kind is distinct from actor->>'kind' or existing.actor_id is distinct from (actor->>'id')::uuid
    or existing.qualification_request_digest is distinct from encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex') then
    raise exception using errcode='23505',message='payment_history_qualification_idempotency_conflict';end if;
   e:=existing;
  else
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   perform 1 from public.payment_history_runtime where shop_id=p_shop_id for update;
   perform app_private.payment_history_local_mutation_fence_v2(p_shop_id);
   if exists(select 1 from public.payment_history_local_publications pending where pending.shop_id=p_shop_id and pending.qualification is not null
    and pending.grant_id is not null and pending.state not in('committed','aborted')) then raise exception using errcode='40001',message='payment_history_local_publications_not_drained';end if;
   insert into public.payment_history_evidence(evidence_id,shop_id,kind,verification_level,status,policy_version,reference,document_sha256,document_upload_id,scope,
    actor_kind,actor_id,verified_at,qualification_version,qualified_by,qualification_request_digest)
   values(id,p_shop_id,p_payload->>'kind',p_payload->>'level','verified',p_payload->>'version',p_payload->>'reference',doc.file_sha256,doc.upload_id,s,
    actor->>'kind',(actor->>'id')::uuid,clock_timestamp(),'getnet-qualified-input-v1',issuer,encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex')) returning * into e;
   changed:=true;
  end if;
  if e.kind='merchant_mapping' and changed then perform app_private.payment_history_bind_qualified_alias_v1(p_shop_id,e,p_payload->'mapping');
  elsif e.kind='merchant_mapping' then null;
  elsif p_payload->'mapping'<>'null'::jsonb or not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=(s->>'merchant_id')::uuid) then
   raise exception using errcode='22023',message='payment_history_qualified_merchant_required';end if;
  result:=jsonb_build_object('evidence_id',e.evidence_id,'status',e.status);
 end if;
 current_actor:=app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 if current_actor is distinct from actor or not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if changed then insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id)
  values(p_shop_id,actor->>'kind',(actor->>'id')::uuid,case when p_operation='qualify' then 'qualify_evidence' else 'revoke_qualification' end,e.evidence_id);end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',actor,'result',result);
end;$$;
revoke all on function public.payment_history_qualification_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) from public,anon;
grant execute on function public.payment_history_qualification_request_v1(uuid,text,jsonb,uuid,uuid,text,integer) to authenticated,service_role;

create function public.payment_history_device_qualified_config_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,
 p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor jsonb;fresh jsonb;result jsonb;begin
 if p_operation is distinct from 'qualified_config' or p_payload is distinct from '{}'::jsonb then raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
 actor:=app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
  p_device_token_hash,p_session_token_hash,p_credential_version,'import');
 result:=app_private.payment_history_qualified_config_v1(p_shop_id,p_shop_device_id);
 fresh:=app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,
  p_device_token_hash,p_session_token_hash,p_credential_version,'import');
 if actor is distinct from fresh or not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'device_id',p_shop_device_id,'session_id',p_pos_session_id,'result',result);
end;$$;
revoke all on function public.payment_history_device_qualified_config_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_qualified_config_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;


-- One canonical draft/review/commit engine serves Web and authenticated POS.
-- Only the admission adapters differ. No GUC is accepted as actor authority.
alter table public.payment_history_jobs add column origin_device_id uuid,
 add column requires_qualified_input boolean not null default false;
-- Only already persisted jobs retain their original admission context.
alter table public.payment_history_jobs alter column requires_qualified_input set default true;
-- The globally unique device ID also carries an explicit shop pair for this FK.
alter table public.shop_devices add constraint payment_history_job_origin_device_scope_key unique(shop_id,shop_device_id);
alter table public.payment_history_jobs add constraint payment_history_job_origin_device
 foreign key(shop_id,origin_device_id) references public.shop_devices(shop_id,shop_device_id);
-- Retire only fresh unqualified v1 Apply grants. Grandfathered rows remain
-- byte-for-byte decisions; new Undo grants cannot be relabeled as Apply.
alter table public.payment_history_local_write_grants add column admission_kind text check(admission_kind='Undo');
create function app_private.payment_history_legacy_grant_kind_immutable_v1() returns trigger language plpgsql set search_path='' as $$begin
 if old.admission_kind is not null and new.admission_kind is distinct from old.admission_kind then raise exception using errcode='55000',message='payment_history_local_publication_immutable';end if;return new;
end;$$;
revoke all on function app_private.payment_history_legacy_grant_kind_immutable_v1() from public,anon,authenticated,service_role;
create trigger payment_history_legacy_grant_kind_immutable before update on public.payment_history_local_write_grants for each row execute function app_private.payment_history_legacy_grant_kind_immutable_v1();
create function app_private.payment_history_master_session_current_v1(p_shop uuid,p_actor uuid,p_session uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join public.profiles p on p.profile_id=s.user_id
 join public.platform_admins a on a.profile_id=p.profile_id join public.shops sh on sh.shop_id=p_shop
 where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after>clock_timestamp())
 and p.profile_status='active' and p.disabled_at is null and a.status='active' and a.revoked_at is null and sh.shop_status='active' for share of s,p,a,sh);
$$;
revoke all on function app_private.payment_history_master_session_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
-- ASUS019 review fixes: current personal actor and bounded temporary replica retention.
create or replace function app_private.payment_history_job_actor_current_v1(j public.payment_history_jobs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.origin_device_id is not null then app_private.pos_runtime_lease_is_valid_v1(j.shop_id,j.origin_device_id,j.actor_id,j.actor_session_id)
 and exists(select 1 from public.pos_sessions s where s.pos_session_id=j.actor_session_id and s.staff_credential_version=j.actor_credential_version)
 and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'import')
 when j.actor_kind='pos_staff_manager' then exists(
 select 1 from public.staff_web_sessions s join public.staff_accounts a on a.shop_id=s.shop_id and a.staff_id=s.staff_id
 join public.shops sh on sh.shop_id=s.shop_id where sh.shop_status='active' and s.shop_id=j.shop_id and s.staff_id=j.actor_id
 and s.staff_web_session_id=j.actor_session_id and s.status='active' and s.revoked_at is null and s.expires_at>clock_timestamp()
 and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
 and s.staff_credential_version=j.actor_credential_version and a.credential_version=j.actor_credential_version
 and a.status='active' and a.credential_status='active' and not a.must_change_credential and (a.credential_expires_at is null or a.credential_expires_at>clock_timestamp())
 and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'import')) else (app_private.payment_history_master_session_current_v1(j.shop_id,j.actor_id,j.actor_session_id) or exists(
 select 1 from auth.sessions s join public.profiles pr on pr.profile_id=s.user_id join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id
 join public.shops sh on sh.shop_id=m.shop_id where sh.shop_status='active' and s.id=j.actor_session_id and s.user_id=j.actor_id
 and (s.not_after is null or s.not_after>clock_timestamp()) and m.membership_status='active' and pr.profile_status='active' and pr.disabled_at is null
 and (m.role_key='shop_owner' or (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g
 where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='import' and g.enabled))) for share of s,m,sh,pr)) end;
$$;
create function app_private.payment_history_request_engine_v2(p_shop_id uuid,p_operation text,p_payload jsonb,a jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare cap text;result jsonb;r public.payment_history_runtime;j public.payment_history_jobs;b public.payment_history_batches;
 receipt public.payment_history_receipts;u public.payment_history_uploads;e public.payment_history_evidence;
 v_request uuid;v_digest text;v_id uuid;v_batch uuid;v_operation uuid;v_review jsonb;v_ids uuid[];v_revision bigint;v_count integer;
begin
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 if p_operation='merchant' or p_operation='evidence' and p_payload->>'action' is distinct from 'revoke' then raise exception using errcode='22023',message='payment_history_qualified_evidence_required';end if;
 cap:=case when p_operation in ('capabilities','read','status','receipt','upload_status','metadata') then 'read' when p_operation in ('upload_create','upload_ready','start','configure','review','commit','evidence','merchant','qualified_config') then 'import'
  when p_operation in ('cancel_job','resume_job') then 'import' when p_operation='cancel_batch' then 'cancel' when p_operation='export' then 'export' when p_operation='permissions' then 'migrate' end;

 -- Same actor/request-key is serialized across both jobs and receipts.
 if p_operation in ('start','commit','cancel_batch') then
  v_request:=(p_payload->>'request_key')::uuid;
  if v_request is null then raise exception using errcode='22023',message='payment_history_request_key_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('payment-history-request:'||p_shop_id::text||':'||(a->>'kind')||':'||(a->>'id')||':'||v_request::text,0));
  v_digest:=encode(extensions.digest(convert_to(p_operation||':'||p_payload::text,'UTF8'),'sha256'),'hex');
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if receipt.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
   return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',receipt.receipt);
  end if;
 end if;
 if p_operation='capabilities' then
  result:=jsonb_build_object('capabilities',(select jsonb_object_agg(c,case when a->>'kind'='pos_staff_manager' then app_private.payment_history_staff_can_v1(p_shop_id,(a->>'id')::uuid,c) else app_private.payment_history_profile_can_v1(p_shop_id,c) end) from unnest(array['read','import','cancel','export','migrate']) c),
   'runtime',(select jsonb_build_object('dataset_id',dataset_id,'revision',revision::text,'writer_epoch',writer_epoch::text,'writer_authority',writer_authority,'inventory_verified',inventory_verified) from public.payment_history_runtime where shop_id=p_shop_id));
 elsif p_operation='qualified_config' then
  if p_payload<>'{}'::jsonb then raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
  result:=app_private.payment_history_qualified_config_v1(p_shop_id);
 elsif p_operation='metadata' then
  result:=jsonb_build_object('merchants',(select coalesce(jsonb_agg(x),'[]') from(select merchant_id,label,evidence_id from public.payment_history_merchants where shop_id=p_shop_id order by merchant_id limit 201)x),
   'aliases',(select coalesce(jsonb_agg(x),'[]') from(select alias_key,merchant_id,evidence_id from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_key limit 201)x),
   'evidence',(select coalesce(jsonb_agg(x),'[]') from(select evidence_id,kind,verification_level,policy_version,reference,scope from public.payment_history_evidence where shop_id=p_shop_id and status='verified' and kind in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction') order by evidence_id limit 201)x));
 elsif p_operation='upload_create' then
  if coalesce(p_payload->>'sha256','') !~ '^[0-9a-f]{64}$' or length(coalesce(p_payload->>'file_name','')) not between 1 and 256 or (p_payload->>'byte_length')::bigint not between 1 and 20971520
   or coalesce(p_payload->>'file_name','') !~* '\.(xlsx|pdf|png|jpg|jpeg)$' then raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
  if (select count(*) from public.payment_history_uploads where shop_id=p_shop_id and actor_id=(a->>'id')::uuid and state='pending' and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception using errcode='54000',message='payment_history_upload_backpressure';end if;
  v_id:=gen_random_uuid();
  insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length)
   values(v_id,p_shop_id,a->>'kind',(a->>'id')::uuid,'history/'||p_shop_id::text||'/'||v_id::text,p_payload->>'file_name',p_payload->>'sha256',(p_payload->>'byte_length')::bigint) returning * into u;
  result:=jsonb_build_object('upload_id',u.upload_id,'object_key',u.object_key);
 elsif p_operation in ('upload_ready','upload_status') then
  select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'upload_id')::uuid and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid for update;
  if not found then raise exception using errcode='42501',message='payment_history_upload_actor_mismatch';end if;
  if p_operation='upload_ready' and u.state='pending' then update public.payment_history_uploads set state='uploaded' where upload_id=u.upload_id;u.state:='uploaded';end if;
  result:=jsonb_build_object('upload_id',u.upload_id,'state',u.state,'file_name',u.file_name,'sha256',u.file_sha256,'byte_length',u.byte_length::text);
 elsif p_operation='start' then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=v_request;
  if found then
   if j.request_digest<>v_digest then raise exception using errcode='23505',message='payment_history_idempotency_conflict';end if;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if jsonb_typeof(p_payload->'upload_ids') is distinct from 'array' or jsonb_array_length(p_payload->'upload_ids') not between 1 and 10 or jsonb_typeof(p_payload->'configuration') is distinct from 'object'
    or octet_length((p_payload->'configuration')::text)>32768 then raise exception using errcode='22023',message='payment_history_job_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'upload_ids')::uuid);
   if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids) x) or cardinality(v_ids)<>(select count(*) from public.payment_history_uploads where shop_id=p_shop_id and upload_id=any(v_ids) and state='verified' and file_name ~* '\.xlsx$' and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid)
    or (select sum(byte_length) from public.payment_history_uploads where upload_id=any(v_ids))>104857600 then raise exception using errcode='22023',message='payment_history_sources_unverified';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-queue:'||p_shop_id::text,0));
   if (select count(*) from public.payment_history_jobs where shop_id=p_shop_id and state in ('queued','analysing','review_ready'))>=5 then raise exception using errcode='54000',message='payment_history_job_backpressure';end if;
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   insert into public.payment_history_jobs(shop_id,actor_kind,actor_id,actor_session_id,actor_credential_version,request_key,request_digest,parser_version,configuration,source_upload_ids)
    values(p_shop_id,a->>'kind',(a->>'id')::uuid,(a->>'session_id')::uuid,(a->>'credential_version')::integer,v_request,v_digest,'getnet-ooxml-web-v1',p_payload->'configuration',v_ids) returning * into j;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  end if;
 elsif p_operation in ('status','configure','review','commit','cancel_job','resume_job') then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and job_id=(p_payload->>'job_id')::uuid for update;
  if not found or j.actor_kind<>a->>'kind' or j.actor_id<>(a->>'id')::uuid or (p_operation<>'resume_job' and (j.actor_session_id<>(a->>'session_id')::uuid
   or j.actor_credential_version is distinct from (a->>'credential_version')::integer)) then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  if p_operation='status' then
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state,'processed_rows',j.processed_rows,'summary',j.analysis_summary,'diagnostics',j.diagnostics,'error_code',j.error_code,
    'merchants',j.analysis_merchants);
  elsif p_operation='resume_job' then
   if j.state not in ('queued','analysing','review_ready') then raise exception using errcode='55000',message='payment_history_job_not_resumable';end if;
   update public.payment_history_jobs set actor_session_id=(a->>'session_id')::uuid,actor_credential_version=(a->>'credential_version')::integer,
    state=case when state='analysing' then 'queued' else state end,lease_token=null,lease_expires_at=null,lease_fence=lease_fence+1,review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',case when j.state='analysing' then 'queued' else j.state end);
  elsif p_operation='cancel_job' then
   if j.state in ('committing','committed') then raise exception using errcode='55000',message='payment_history_commit_already_started';end if;
   update public.payment_history_jobs set state='cancelled',lease_token=null,lease_expires_at=null,review_digest=null,updated_at=clock_timestamp() where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state','cancelled');
  elsif p_operation='configure' then
   if j.state<>'review_ready' or jsonb_typeof(p_payload->'evidence_ids') is distinct from 'array' or jsonb_array_length(p_payload->'evidence_ids')>200
    or jsonb_typeof(coalesce(p_payload->'corrections','[]'))<>'array' or jsonb_array_length(coalesce(p_payload->'corrections','[]'))>200 then raise exception using errcode='22023',message='payment_history_review_configuration_invalid';end if;
   v_ids:=array(select jsonb_array_elements_text(p_payload->'evidence_ids')::uuid);
   if cardinality(v_ids)<>(select count(*) from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=any(v_ids) and status='verified' and (not j.requires_qualified_input or qualification_version='getnet-qualified-input-v1' and scope->>'parser_version'=j.parser_version)) then raise exception using errcode='22023',message='payment_history_evidence_invalid';end if;
   update public.payment_history_jobs set configuration=configuration||jsonb_build_object('evidence_ids',p_payload->'evidence_ids','corrections',coalesce(p_payload->'corrections','[]')),review_digest=null,reviewed_at=null where job_id=j.job_id;
   result:=jsonb_build_object('job_id',j.job_id,'state',j.state);
  else
   if j.state<>'review_ready' then raise exception using errcode='55000',message='payment_history_review_not_ready';end if;
   select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
   -- Freeze evidence and aliases while the content-bound decision is published.
   perform 1 from public.payment_history_evidence where shop_id=p_shop_id order by evidence_id for share;
   perform 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and active order by alias_id for share;
   -- demand_actor holds this shop FOR SHARE. Native pos_sales_sync_apply_v1
   -- takes the same shop FOR UPDATE before inserting sales: overlap checking
   -- is serialized per shop, without a global lock on the POS sales table.
   v_review:=app_private.payment_history_review_v1(j.job_id);
   if p_operation='review' then
    update public.payment_history_jobs set reviewed_revision=r.revision,reviewed_writer_epoch=r.writer_epoch,review_digest=v_review->>'review_digest',reviewed_at=clock_timestamp() where job_id=j.job_id;
    result:=v_review;
   else
    if coalesce(v_review->>'can_commit','false')<>'true' or j.review_digest is null or j.review_digest is distinct from p_payload->>'review_digest'
     or j.review_digest is distinct from v_review->>'review_digest' or j.reviewed_revision is distinct from r.revision or j.reviewed_writer_epoch is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_review_stale_or_blocked';end if;
    v_batch:=gen_random_uuid();v_operation:=gen_random_uuid();v_revision:=r.revision+1;
    insert into public.payment_history_batches(batch_id,shop_id,job_id,origin,apply_operation_id,created_revision) values(v_batch,p_shop_id,j.job_id,'web_import',v_operation,v_revision);
    -- One canonical version per identity. Duplicates retain their existing owner.
    insert into public.payment_history_movement_versions(shop_id,merchant_id,external_namespace,external_id,identity_key,economic_digest,business_ticks,business_date,
      gross_clp,commission_clp,commission_vat_clp,net_clp,movement_kind,transaction_state,transaction,owner_batch_id,source_upload_id,source_row,source_sheet,supersedes_version_id,created_revision)
     select p_shop_id,d.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId',d.identity_key,s.economic_digest,(s.economics->>'businessTicks')::bigint,(s.transaction#>>'{timestamp,businessDateTime}')::date,
      (s.economics->>'grossClp')::bigint,(s.economics->>'commissionClp')::bigint,(s.economics->>'commissionVatClp')::bigint,(s.economics->>'netClp')::bigint,s.economics->>'movementKind',s.economics->>'transactionState',s.transaction,v_batch,s.source_upload_id,s.source_row,s.source_sheet,d.previous_version_id,v_revision
     from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal where d.decision='new';
    insert into public.payment_history_duplicate_observations(shop_id,batch_id,movement_version_id,source_upload_id,source_sheet,source_row)
     select p_shop_id,v_batch,v.movement_version_id,s.source_upload_id,s.source_sheet,s.source_row
      from app_private.payment_history_review_rows_v1(j.job_id) d join public.payment_history_staged_movements s on s.job_id=j.job_id and s.ordinal=d.ordinal
      join public.payment_history_movement_versions v on v.shop_id=p_shop_id and v.identity_key=d.identity_key and v.active
      where d.decision='duplicate' and not (v.owner_batch_id=v_batch and v.source_upload_id=s.source_upload_id and v.source_sheet=s.source_sheet and v.source_row=s.source_row);
    result:=jsonb_build_object('operation_id',v_operation,'batch_id',v_batch,'kind','apply','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'summary',v_review->'summary');
    insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,v_batch,'apply',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
    insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
     select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'upsert' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=v_batch;
    update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
    update public.payment_history_jobs set state='committed',lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where job_id=j.job_id;
   end if;
  end if;
 elsif p_operation='cancel_batch' then
  select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
  if not found or r.writer_authority<>'web' or not r.inventory_verified or (p_payload->>'revision')::bigint is distinct from r.revision or (p_payload->>'writer_epoch')::bigint is distinct from r.writer_epoch then raise exception using errcode='40001',message='payment_history_writer_not_ready';end if;
  select * into b from public.payment_history_batches where shop_id=p_shop_id and batch_id=(p_payload->>'batch_id')::uuid for update;
  if not found or b.state<>'active' then raise exception using errcode='55000',message='payment_history_batch_not_active';end if;
  v_operation:=gen_random_uuid();v_revision:=r.revision+1;
  select count(*) into v_count from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  result:=jsonb_build_object('operation_id',v_operation,'batch_id',b.batch_id,'kind','cancel','dataset_id',r.dataset_id,'revision',v_revision::text,'writer_epoch',r.writer_epoch::text,'deactivated',v_count);
  insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt) values(v_operation,p_shop_id,b.batch_id,'cancel',a->>'kind',(a->>'id')::uuid,v_request,v_digest,result);
  insert into public.payment_history_revisions(shop_id,revision,ordinal,movement_version_id,operation_id,change_kind)
   select p_shop_id,v_revision,row_number() over(order by movement_version_id)::integer,movement_version_id,v_operation,'tombstone' from public.payment_history_movement_versions where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_movement_versions set active=false where shop_id=p_shop_id and owner_batch_id=b.batch_id and active;
  update public.payment_history_batches set state='cancelled',cancelled_revision=v_revision,cancelled_at=clock_timestamp() where batch_id=b.batch_id;
  update public.payment_history_runtime set revision=v_revision,updated_at=clock_timestamp() where shop_id=p_shop_id;
 elsif p_operation in ('read','export') then
  v_count:=coalesce((p_payload->>'limit')::integer,50);
  if v_count not between 1 and 200 then raise exception using errcode='22023',message='payment_history_page_limit';end if;
  select * into r from public.payment_history_runtime where shop_id=p_shop_id;
  if p_payload ? 'revision' and (p_payload->>'revision')::bigint is distinct from r.revision then raise exception using errcode='40001',message='payment_history_revision_changed';end if;
  result:=jsonb_build_object('configured',found,'coverage','observed_records_only','dataset_id',r.dataset_id,'revision',r.revision::text,'writer_epoch',r.writer_epoch::text,'writer_authority',r.writer_authority,
   'rows',(select coalesce(jsonb_agg(x order by x.movement_version_id),'[]') from(select movement_version_id,merchant_id,owner_batch_id,active,business_ticks::text,gross_clp::text,commission_clp::text,commission_vat_clp::text,net_clp::text,movement_kind,transaction_state,created_revision::text from public.payment_history_movement_versions
    where shop_id=p_shop_id and movement_version_id>coalesce((p_payload->>'after')::uuid,'00000000-0000-0000-0000-000000000000') order by movement_version_id limit v_count)x),
   'batches',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select batch_id,origin,state,created_revision::text,cancelled_revision::text,created_at from public.payment_history_batches where shop_id=p_shop_id order by created_at desc limit 50)x));
 elsif p_operation='receipt' then
  select * into receipt from public.payment_history_receipts where shop_id=p_shop_id and actor_kind=a->>'kind' and actor_id=(a->>'id')::uuid and request_key=(p_payload->>'request_key')::uuid;
  result:=jsonb_build_object('receipt',case when found then receipt.receipt else null end);
 else
  -- Legal role-grant management remains owner-only. Provider qualification and
  -- transfer/cutover are operational actions guarded by the separate migrate
  -- capability, never by a displayed badge or staff code.
  if p_operation='permissions' and (a->>'kind'<>'personal_account' or not exists(select 1 from public.shop_members where shop_id=p_shop_id and profile_id=(a->>'id')::uuid and role_key='shop_owner' and membership_status='active')) then raise exception using errcode='42501',message='payment_history_owner_required';end if;
  if p_operation='evidence' and (p_payload->>'kind'='modern_time' or p_payload->>'level'='provider_verified' or p_payload->>'action'='revoke') then
   -- Technical authority is acquired by the public Web admission adapter.
   if p_payload->>'action' is distinct from 'revoke' and (p_payload->>'document_upload_id' is null or p_payload->>'document_sha256' is null) then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
  end if;
  if p_operation in ('evidence','merchant') then
   insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
   select * into r from public.payment_history_runtime where shop_id=p_shop_id for update;
  end if;
  if p_operation='permissions' then
   if coalesce(p_payload->>'role','') not in ('shop_manager','manager','pos_admin') or coalesce(p_payload->>'capability','') not in ('read','import','cancel','export','migrate') or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception using errcode='22023',message='payment_history_permission_invalid';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-history-role:'||p_shop_id::text||':'||(p_payload->>'role'),0));
   insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values(p_shop_id,p_payload->>'role',p_payload->>'capability',(p_payload->>'enabled')::boolean)
    on conflict(shop_id,role_key,capability) do update set enabled=excluded.enabled,updated_at=clock_timestamp();result:=jsonb_build_object('saved',true);
  elsif p_operation='evidence' then
   if p_payload->>'action'='revoke' then
    update public.payment_history_evidence set status='revoked',revoked_at=clock_timestamp() where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and status<>'revoked' returning * into e;
    if not found then raise exception using errcode='22023',message='payment_history_evidence_not_found';end if;
   else
    if coalesce(p_payload->>'kind','') not in ('merchant_mapping','legacy_currency','native_start','modern_time','economic_correction')
     or jsonb_typeof(p_payload->'scope') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_payload->'scope') k where k not in ('merchant_id','alias_key','file_sha256','from_ticks','to_ticks','native_start_ticks','interpretation'))
     or jsonb_typeof(p_payload#>'{scope,file_sha256}') is distinct from 'array' or jsonb_array_length(p_payload#>'{scope,file_sha256}') not between 1 and 10
     or exists(select 1 from jsonb_array_elements_text(p_payload#>'{scope,file_sha256}') h where h !~ '^[0-9a-f]{64}$')
     or coalesce(p_payload#>>'{scope,from_ticks}','') !~ '^[0-9]{1,19}$' or coalesce(p_payload#>>'{scope,to_ticks}','') !~ '^[0-9]{1,19}$'
     or (p_payload#>>'{scope,from_ticks}')::bigint>=(p_payload#>>'{scope,to_ticks}')::bigint then raise exception using errcode='22023',message='payment_history_evidence_scope_invalid';end if;
    if p_payload->>'level'='provider_verified' then
     select * into u from public.payment_history_uploads where shop_id=p_shop_id and upload_id=(p_payload->>'document_upload_id')::uuid and state='verified' and file_name ~* '\.(pdf|png|jpg|jpeg)$' for share;
     if not found or u.file_sha256 is distinct from p_payload->>'document_sha256' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    end if;
    if p_payload->>'kind'='modern_time' and p_payload->>'level' is distinct from 'provider_verified' then raise exception using errcode='22023',message='payment_history_provider_document_required';end if;
    insert into public.payment_history_evidence(shop_id,kind,verification_level,status,policy_version,reference,document_sha256,document_upload_id,scope,actor_kind,actor_id,verified_at)
     values(p_shop_id,p_payload->>'kind',p_payload->>'level','verified',p_payload->>'version',p_payload->>'reference',p_payload->>'document_sha256',(p_payload->>'document_upload_id')::uuid,p_payload->'scope',a->>'kind',(a->>'id')::uuid,clock_timestamp()) returning * into e;
   end if;
   v_id:=e.evidence_id;result:=jsonb_build_object('evidence_id',e.evidence_id,'status',e.status);
  elsif p_operation='merchant' then
   select * into e from public.payment_history_evidence where shop_id=p_shop_id and evidence_id=(p_payload->>'evidence_id')::uuid and kind='merchant_mapping' and status='verified' and verification_level<>'unverified' for share;
   if not found then raise exception using errcode='22023',message='payment_history_merchant_evidence_required';end if;
   v_id:=coalesce((p_payload->>'merchant_id')::uuid,gen_random_uuid());
   if not exists(select 1 from public.payment_history_merchants where shop_id=p_shop_id and merchant_id=v_id) then
    insert into public.payment_history_merchants(merchant_id,shop_id,label,evidence_id) values(v_id,p_shop_id,p_payload->>'label',e.evidence_id);
   end if;
   if e.scope->>'merchant_id' is distinct from v_id::text then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   v_digest:=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',p_payload#>>'{source_identity,local}',p_payload#>>'{source_identity,seller}',p_payload#>>'{source_identity,sellerId}',p_payload#>>'{source_identity,localNumber}',p_payload#>>'{source_identity,rut}']);
   if e.scope->>'alias_key' is distinct from v_digest then raise exception using errcode='22023',message='payment_history_merchant_evidence_scope';end if;
   if exists(select 1 from public.payment_history_merchant_aliases where shop_id=p_shop_id and alias_key=v_digest and active and merchant_id<>v_id) then raise exception using errcode='23505',message='payment_history_alias_collision';end if;
   update public.payment_history_merchant_aliases set active=false where shop_id=p_shop_id and alias_key=v_digest and active and merchant_id=v_id and evidence_id<>e.evidence_id;
   insert into public.payment_history_merchant_aliases(shop_id,merchant_id,alias_key,source_identity,evidence_id) values(p_shop_id,v_id,v_digest,p_payload->'source_identity',e.evidence_id)
    on conflict(shop_id,alias_version,alias_key) where active do nothing;
   result:=jsonb_build_object('merchant_id',v_id,'alias_key',v_digest);
  else raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 end if;
 if v_revision is not null then perform app_private.payment_history_seal_revision_v1(p_shop_id,v_revision);end if;
 if p_operation not in ('read','export','capabilities','status','receipt','metadata','upload_status') then
  insert into public.payment_history_events(shop_id,actor_kind,actor_id,operation,subject_id) values(p_shop_id,a->>'kind',(a->>'id')::uuid,p_operation,coalesce(v_id,j.job_id,b.batch_id));
 end if;
 if not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 if octet_length(result::text)>4194304 then raise exception using errcode='54000',message='payment_history_response_limit';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'actor',a,'result',result);
end;$$;
revoke all on function app_private.payment_history_request_engine_v2(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create or replace function public.payment_history_request_v1(p_shop_id uuid,p_operation text,p_payload jsonb default '{}',p_staff_id uuid default null,
 p_staff_web_session_id uuid default null,p_session_token_hash text default null,p_credential_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;cap text;begin
 cap:=case when p_operation in('capabilities','read','status','receipt','upload_status','metadata') then 'read'
 when p_operation in('upload_create','upload_ready','start','configure','review','commit','evidence','merchant','cancel_job','resume_job','qualified_config') then 'import'
 when p_operation='cancel_batch' then 'cancel' when p_operation='export' then 'export' when p_operation='permissions' then 'migrate' end;
 a:=app_private.payment_history_demand_actor_v1(p_shop_id,cap,p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 if p_operation='evidence' and (p_payload->>'kind'='modern_time' or p_payload->>'level'='provider_verified' or p_payload->>'action'='revoke') then
  perform app_private.payment_history_demand_actor_v1(p_shop_id,'migrate',p_staff_id,p_staff_web_session_id,p_session_token_hash,p_credential_version);
 end if;
 return app_private.payment_history_request_engine_v2(p_shop_id,p_operation,p_payload,a);
end;$$;

create function public.payment_history_device_web_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,
 p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a jsonb;fresh jsonb;response jsonb;op text;j public.payment_history_jobs;begin
 if p_operation is null or p_operation not in('web_upload_create','web_upload_ready','web_upload_status','web_start','web_status','web_configure','web_review','web_commit','web_receipt','web_cancel_job','web_resume_job') then
  raise exception using errcode='22023',message='payment_history_operation_invalid';end if;
 op:=substr(p_operation,5);
 a:=app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,'import');
 if op='upload_create' and coalesce(p_payload->>'file_name','') !~* '\.xlsx$' then raise exception using errcode='22023',message='payment_history_upload_invalid';end if;
 if op='start' and (not app_private.payment_history_local_keys_v2(p_payload,array['request_key','upload_ids','configuration'])
  or not app_private.payment_history_local_keys_v2(p_payload->'configuration',array['legacyAmountsAreClp','modernTimeInterpretation','temporalPolicyVersion','temporalEvidenceReference'])) then
  raise exception using errcode='22023',message='payment_history_payload_invalid';end if;
 if op='receipt' then
  select origin.* into j from public.payment_history_receipts receipt
   join public.payment_history_batches batch on batch.shop_id=receipt.shop_id and batch.batch_id=receipt.batch_id
   join public.payment_history_jobs origin on origin.shop_id=batch.shop_id and origin.job_id=batch.job_id
   where receipt.shop_id=p_shop_id and receipt.actor_kind=a->>'kind' and receipt.actor_id=p_staff_id and receipt.request_key=(p_payload->>'request_key')::uuid;
  if exists(select 1 from public.payment_history_receipts receipt where receipt.shop_id=p_shop_id and receipt.actor_kind=a->>'kind' and receipt.actor_id=p_staff_id and receipt.request_key=(p_payload->>'request_key')::uuid)
   and (j.job_id is null or j.origin_device_id is distinct from p_shop_device_id or j.actor_id is distinct from p_staff_id or j.actor_credential_version is distinct from p_credential_version) then
   raise exception using errcode='42501',message='payment_history_receipt_actor_mismatch';end if;
 end if;
 if op in('status','configure','review','commit','cancel_job','resume_job') then
  select * into j from public.payment_history_jobs where shop_id=p_shop_id and job_id=(p_payload->>'job_id')::uuid for update;
  if not found or j.origin_device_id is distinct from p_shop_device_id or j.actor_id is distinct from p_staff_id
   or op<>'resume_job' and (j.actor_session_id is distinct from p_pos_session_id or j.actor_credential_version is distinct from p_credential_version) then
   raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
  if op='configure' and (not app_private.payment_history_local_keys_v2(p_payload,array['job_id','evidence_ids','corrections']) or p_payload->'corrections'<>'[]'::jsonb
   or exists(select 1 from jsonb_array_elements_text(p_payload->'evidence_ids') id where not exists(select 1 from public.payment_history_evidence e
    where e.evidence_id=id::uuid and e.shop_id=p_shop_id and e.status='verified' and e.qualification_version='getnet-qualified-input-v1' and e.scope->>'parser_version'=j.parser_version))) then
   raise exception using errcode='22023',message='payment_history_qualified_evidence_required';end if;
 end if;
 response:=app_private.payment_history_request_engine_v2(p_shop_id,op,p_payload,a);
 if op='start' then
  update public.payment_history_jobs set origin_device_id=p_shop_device_id where job_id=(response#>>'{result,job_id}')::uuid
   and (origin_device_id is null or origin_device_id=p_shop_device_id) and actor_session_id=p_pos_session_id;
  if not found then raise exception using errcode='42501',message='payment_history_job_actor_mismatch';end if;
 end if;
 fresh:=app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,'import');
 if a is distinct from fresh or not app_private.payment_history_publishable_v1() then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 return jsonb_build_object('ok',true,'shop_id',p_shop_id,'device_id',p_shop_device_id,'session_id',p_pos_session_id,'result',response->'result');
end;$$;
revoke all on function public.payment_history_device_web_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.payment_history_device_web_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb) to service_role;

-- Qualified evidence adds exact parser/profile/raw scope; legacy evidence keeps its level.
create or replace function app_private.payment_history_proof_covers_v1(p_shop uuid,p_ids uuid[],p_kind text,p_merchant uuid,p_hash text,p_transaction jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=any(p_ids)
 and e.kind=p_kind and e.status='verified' and e.verification_level<>'unverified'
 and e.scope->>'merchant_id'=p_merchant::text and e.scope->'file_sha256' ? p_hash
 and coalesce(e.scope->>'from_ticks','') ~ '^[0-9]{1,19}$' and coalesce(e.scope->>'to_ticks','') ~ '^[0-9]{1,19}$'
 and (case when p_kind='modern_time' or e.qualification_version='getnet-qualified-input-v1' and p_transaction->>'profile'='GetnetModern' then app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,rawTimestamp}')
   else app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}') end) >= (e.scope->>'from_ticks')::bigint
 and (case when p_kind='modern_time' or e.qualification_version='getnet-qualified-input-v1' and p_transaction->>'profile'='GetnetModern' then app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,rawTimestamp}')
   else app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}') end) < (e.scope->>'to_ticks')::bigint
 and (e.qualification_version is null or (
 e.qualified_by in('platform_master','explicit_shop_delegate') and e.scope->>'profile'=p_transaction->>'profile'
 and e.scope->>'parser_version'=p_transaction->>'parserVersion'
 and (coalesce(e.scope->>'alias_key','')='' or e.scope->>'alias_key'=app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',p_transaction#>>'{merchant,local}',p_transaction#>>'{merchant,seller}',p_transaction#>>'{merchant,sellerId}',p_transaction#>>'{merchant,localNumber}',p_transaction#>>'{merchant,rut}']))
 and exists(select 1 from public.payment_history_uploads d where d.shop_id=e.shop_id and d.upload_id=e.document_upload_id and d.state='verified' and d.file_sha256=e.document_sha256)))
 and (p_kind<>'modern_time' or (e.verification_level='provider_verified' and e.document_sha256 is not null
   and e.policy_version=p_transaction#>>'{timestamp,policyVersion}' and e.scope->>'interpretation'=p_transaction#>>'{timestamp,interpretation}'
   and exists(select 1 from public.payment_history_uploads u where u.shop_id=p_shop and u.upload_id=e.document_upload_id and u.state='verified' and u.file_sha256=e.document_sha256)))
 and (p_kind<>'native_start' or (coalesce(e.scope->>'native_start_ticks','') ~ '^[0-9]{1,19}$'
   and app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')<(e.scope->>'native_start_ticks')::bigint)));
$$;

create or replace function app_private.payment_history_migration_actor_current_v1(j public.payment_history_migration_runs) returns boolean
language sql volatile security definer set search_path='' as $$
 select case when j.source_mode='local_baseline_v2' then
  app_private.pos_runtime_lease_is_valid_v1(j.shop_id,(j.source_context->>'device_id')::uuid,j.actor_id,j.actor_session_id)
  and exists(select 1 from public.pos_sessions s where s.pos_session_id=j.actor_session_id and s.staff_credential_version=j.actor_credential_version)
  and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'migrate')
 when j.actor_kind='pos_staff_manager'  then exists(select 1 from public.staff_web_sessions s where s.shop_id=j.shop_id and s.staff_id=j.actor_id and s.staff_web_session_id=j.actor_session_id
  and app_private.staff_web_runtime_lease_is_valid_v1(j.shop_id,j.actor_id,j.actor_session_id,s.session_token_hash,j.actor_credential_version,null)
  and app_private.payment_history_staff_can_v1(j.shop_id,j.actor_id,'migrate')
 and exists(select 1 from public.staff_accounts a join public.payment_history_role_permissions g on g.shop_id=a.shop_id and g.role_key=a.role_key and g.capability='migrate' and g.enabled where a.shop_id=j.shop_id and a.staff_id=j.actor_id)) else (app_private.payment_history_master_session_current_v1(j.shop_id,j.actor_id,j.actor_session_id) or exists(
 select 1 from auth.sessions s join public.shop_members m on m.profile_id=s.user_id and m.shop_id=j.shop_id join public.profiles p on p.profile_id=m.profile_id
 join public.shops sh on sh.shop_id=m.shop_id where s.id=j.actor_session_id and s.user_id=j.actor_id and (s.not_after is null or s.not_after>clock_timestamp())
 and m.membership_status='active' and p.profile_status='active' and p.disabled_at is null and sh.shop_status='active'
 and (m.role_key='shop_manager' and exists(select 1 from public.payment_history_role_permissions g where g.shop_id=j.shop_id and g.role_key=m.role_key and g.capability='migrate' and g.enabled)))) end;
$$;

-- A qualification snapshot is part of the existing immutable publication, not
-- an offline grant. Every review page and the actual authorizer revalidate it.
alter table public.payment_history_local_publications add column qualification jsonb,add column qualification_scope_bindings jsonb;
create function app_private.payment_history_local_qualification_shape_v1(q jsonb) returns boolean
language plpgsql immutable set search_path='' as $$begin
 if not app_private.payment_history_local_keys_v2(q,array['config_digest','resolver_fingerprint','evidence_ids'])
  or jsonb_typeof(q->'config_digest') is distinct from 'string' or jsonb_typeof(q->'resolver_fingerprint') is distinct from 'string'
  or coalesce(q->>'config_digest','') !~ '^[0-9a-f]{64}$' or coalesce(q->>'resolver_fingerprint','') !~ '^[0-9a-f]{64}$'
  or jsonb_typeof(q->'evidence_ids') is distinct from 'array' then return false;end if;
 if jsonb_array_length(q->'evidence_ids') not between 1 and 200 or exists(select 1 from jsonb_array_elements(q->'evidence_ids') v
  where jsonb_typeof(v)<>'string' or coalesce(v#>>'{}','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or v#>>'{}'='00000000-0000-0000-0000-000000000000') then return false;end if;
 return q->'evidence_ids'=(select jsonb_agg(id order by id collate "C") from(select distinct value id from jsonb_array_elements_text(q->'evidence_ids')) x);
end;$$;
revoke all on function app_private.payment_history_local_qualification_shape_v1(jsonb) from public,anon,authenticated,service_role;
alter table public.payment_history_local_publications add constraint payment_history_local_qualification_shape check(
 (qualification is null and qualification_scope_bindings is null) or (operation_kind='Apply' and app_private.payment_history_local_qualification_shape_v1(qualification)
  and jsonb_typeof(qualification_scope_bindings)='array'));
create function app_private.payment_history_local_qualification_immutable_v1() returns trigger language plpgsql set search_path='' as $$begin
 if old.qualification is not null and row(new.qualification,new.qualification_scope_bindings) is distinct from row(old.qualification,old.qualification_scope_bindings)
  or old.qualification is null and new.qualification is not null and (old.state<>'preparing' or old.staged_pages<>0 or old.grant_id is not null) then
  raise exception using errcode='55000',message='payment_history_local_qualification_immutable';end if;return new;
end;$$;
revoke all on function app_private.payment_history_local_qualification_immutable_v1() from public,anon,authenticated,service_role;
create trigger payment_history_local_qualification_immutable before update on public.payment_history_local_publications for each row execute function app_private.payment_history_local_qualification_immutable_v1();
create function app_private.payment_history_local_qualification_current_v1(p_shop uuid,p_device uuid,p_operation uuid) returns void
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;config jsonb;begin
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for share;
 if not found or p.qualification is null then return;end if;
 config:=app_private.payment_history_qualified_config_v1(p_shop,p_device);
 if p.qualification->>'config_digest' is distinct from config->>'config_digest' then raise exception using errcode='40001',message='payment_history_qualified_configuration_changed';end if;
 perform 1 from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id in(select value::uuid from jsonb_array_elements_text(p.qualification->'evidence_ids')) order by e.evidence_id for share;
 if (select count(*) from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id in(select value::uuid from jsonb_array_elements_text(p.qualification->'evidence_ids'))
   and e.qualification_version='getnet-qualified-input-v1' and e.status='verified' and exists(select 1 from public.payment_history_uploads d where d.shop_id=e.shop_id and d.upload_id=e.document_upload_id and d.file_sha256=e.document_sha256 and d.state='verified'))<>jsonb_array_length(p.qualification->'evidence_ids') then
  raise exception using errcode='40001',message='payment_history_qualified_configuration_changed';end if;
end;$$;
revoke all on function app_private.payment_history_local_qualification_current_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function app_private.payment_history_local_prepare_intent_v2(p_shop uuid,p_device uuid,payload jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;n public.payment_history_local_intents;result jsonb;operation uuid;nonce uuid;q jsonb;config jsonb;prior public.payment_history_local_publications;begin
 if jsonb_typeof(payload->'local_nonce') is distinct from 'string'
  or coalesce(payload->>'local_nonce','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 operation:=(payload->>'operation_id')::uuid;nonce:=(payload->>'local_nonce')::uuid;
 if operation is null or nonce='00000000-0000-0000-0000-000000000000' then
  raise exception using errcode='22023',message='payment_history_local_witness_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 if not found then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 q:=payload->'qualification';
 if payload ? 'qualification' and (payload->>'kind'<>'Apply' or not app_private.payment_history_local_qualification_shape_v1(q)) then raise exception using errcode='22023',message='payment_history_qualification_input_invalid';end if;
 select * into prior from public.payment_history_local_publications where operation_id=operation for share;
 if not found and payload->>'kind'='Apply' and q is null then raise exception using errcode='22023',message='payment_history_qualified_configuration_required';end if;
 if found and prior.qualification is distinct from q then raise exception using errcode='23505',message='payment_history_qualification_idempotency_conflict';end if;
 if q is not null then
  config:=app_private.payment_history_qualified_config_v1(p_shop,p_device);
  if q->>'config_digest' is distinct from config->>'config_digest' then raise exception using errcode='40001',message='payment_history_qualified_configuration_changed';end if;
 end if;
 select * into n from public.payment_history_local_intents where operation_id=operation for update;
 if found and (n.aborted or row(n.shop_id,n.shop_device_id,n.local_nonce,n.content_digest,n.request_fingerprint)
  is distinct from row(p_shop,p_device,nonce,payload->>'content_digest',payload->>'request_fingerprint')) then
  raise exception using errcode='40001',message='payment_history_local_intent_conflict';end if;
 result:=app_private.payment_history_local_prepare_v2(p_shop,p_device,payload-'local_nonce'-'qualification');
 if n.operation_id is null then
  insert into public.payment_history_local_intents(operation_id,shop_id,shop_device_id,local_nonce,content_digest,request_fingerprint)
   values(operation,p_shop,p_device,nonce,payload->>'content_digest',payload->>'request_fingerprint');
 end if;
 if q is not null and prior.operation_id is null then
  update public.payment_history_local_publications set qualification=q,qualification_scope_bindings=config->'local_scope_bindings' where operation_id=operation;
 end if;
 perform app_private.payment_history_local_qualification_current_v1(p_shop,p_device,operation);
 return result;
end;$$;


create or replace function app_private.payment_history_local_page_v2(p_raw text) returns integer
language plpgsql immutable set search_path='' as $$
declare records jsonb;item json;v jsonb;f jsonb;keys text[];q jsonb;n integer:=0;begin
 if p_raw is null or octet_length(p_raw) not between 2 and 262144 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 records:=p_raw::jsonb;
 if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records) not between 1 and 200 then raise exception using errcode='22023',message='payment_history_local_page_invalid';end if;
 for item in select value from json_array_elements(p_raw::json) loop
  v:=item::jsonb;f:=v->'fields';
  if octet_length(item::text)>16384 or not app_private.payment_history_local_keys_v2(v,array['kind','fields']) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  keys:=case v->>'kind'
   when 'operation' then array['protocol_version','operation_id','operation_kind','shop_id','device_id','local_dataset_id','restore_epoch','restore_lineage_id','base_revision','request_fingerprint']
   when 'overlap' then array['native_start_ticks','evidence_reference']
   when 'file' then array['id','sha256','profile','source_rows']
   when 'binding' then array['alias_key','local_scope_id','local_binding_id','evidence_reference']
   when 'movement' then array['source_file_id','source_sheet','source_row','external_namespace','external_id','business_ticks','profile','alias_key','merchant_local','merchant_seller','merchant_seller_id','merchant_local_number','merchant_rut','movement_kind','transaction_state','settlement_state','gross_clp','fee_clp','fee_vat_clp','net_clp','timestamp_raw','offset_raw','offset_minutes','occurred_at_utc_ms','time_interpretation','time_policy_version','time_evidence_reference','card_subtype','payment_id','authorization_code','original_card_type','original_prepaid','terminal','settlement_date_raw']
   when 'rejected' then array['source_file_id','source_sheet','source_row','transaction_state','requested_clp']
   when 'correction' then array['source_file_id','source_sheet','source_row','previous_transaction_id','previous_local_batch_id','previous_apply_operation_id','previous_economic_digest','proposed_economic_digest','context_fingerprint','evidence_reference','approval_fingerprint']
   when 'undo' then array['batch_id','batch_revision','apply_operation_id']
   else null end;
  if v->>'kind'='operation' and f ?| array['qualification_config_digest','qualification_resolver_fingerprint','qualification_evidence_ids'] then
   keys:=keys||array['qualification_config_digest','qualification_resolver_fingerprint','qualification_evidence_ids'];
   q:=jsonb_build_object('config_digest',f->>'qualification_config_digest','resolver_fingerprint',f->>'qualification_resolver_fingerprint','evidence_ids',(f->>'qualification_evidence_ids')::jsonb);
   if f->>'operation_kind'<>'Apply' or not app_private.payment_history_local_qualification_shape_v1(q)
    or f->>'qualification_evidence_ids' is distinct from (select '['||string_agg(to_jsonb(value)::text,',' order by ordinality)||']' from jsonb_array_elements_text(q->'evidence_ids') with ordinality) then
    raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
  end if;
  if v->>'kind'='movement' and f ? 'parser_version' then
   keys:=keys||'parser_version'::text;
   if jsonb_typeof(f->'parser_version') is distinct from 'string' or f->>'parser_version'<>'getnet-ooxml-v1' then raise exception using errcode='22023',message='payment_history_local_source_parser_invalid';end if;
  end if;
  if keys is null or not app_private.payment_history_local_keys_v2(f,keys) or exists(
   select 1 from jsonb_each(f) e where jsonb_typeof(e.value) not in('string','null') or length(e.value#>>'{}')>case when v->>'kind'='operation' and e.key='qualification_evidence_ids' then 8192 else 2048 end) then raise exception using errcode='22023',message='payment_history_local_record_invalid';end if;
  if v->>'kind'='correction' and (
   exists(select 1 from unnest(array['previous_transaction_id','previous_local_batch_id','previous_apply_operation_id']) k where jsonb_typeof(f->k) is distinct from 'string')
   or coalesce(f->>'previous_transaction_id','') !~ '^[1-9][0-9]{0,18}$'
   or (f->>'previous_transaction_id')::numeric>9223372036854775807
   or length(btrim(coalesce(f->>'previous_local_batch_id',''))) not between 1 and 256
   or f->>'previous_local_batch_id' ~ '[[:cntrl:]]'
   or coalesce(f->>'previous_apply_operation_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or f->>'previous_apply_operation_id'='00000000-0000-0000-0000-000000000000') then
   raise exception using errcode='22023',message='payment_history_local_correction_owner_invalid';end if;
  n:=n+1;
 end loop;
 return n;
end;$$;


create or replace function app_private.payment_history_local_stage_pages_v2(p_shop uuid,p_device uuid,p jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;prior public.payment_history_local_publications;
 page public.payment_history_local_publication_pages;raw text;sha text;v_ordinal integer;header jsonb;begin
 if not app_private.payment_history_local_keys_v2(p,array['operation_id','content_digest','ordinal','page_json','page_sha256'])
  or jsonb_typeof(p->'ordinal') is distinct from 'number' or coalesce(p->>'ordinal','') !~ '^[1-9][0-9]{0,4}$' or (p->>'ordinal')::integer>20000
  or jsonb_typeof(p->'page_json') is distinct from 'string' or coalesce(p->>'content_digest','') !~ '^[0-9a-f]{64}$' or coalesce(p->>'page_sha256','') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found or r.writer_authority<>'local' then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into prior from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=(p->>'operation_id')::uuid for update;
 if not found or prior.server_dataset_id<>r.dataset_id or prior.writer_epoch<>r.writer_epoch or prior.content_digest is distinct from p->>'content_digest'
  or prior.state<>'preparing' then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 raw:=p->>'page_json';v_ordinal:=(p->>'ordinal')::integer;sha:=encode(extensions.digest(convert_to(raw,'UTF8'),'sha256'),'hex');
 if sha is distinct from p->>'page_sha256' then raise exception using errcode='22023',message='payment_history_local_page_digest_invalid';end if;
 perform app_private.payment_history_local_page_v2(raw);
 if v_ordinal=1 then
  header:=raw::jsonb->0;
  if header->>'kind' is distinct from 'operation' or row(header#>>'{fields,protocol_version}',(header#>>'{fields,operation_id}')::uuid,header#>>'{fields,operation_kind}',(header#>>'{fields,shop_id}')::uuid,(header#>>'{fields,device_id}')::uuid,header#>>'{fields,local_dataset_id}',header#>>'{fields,restore_epoch}',(header#>>'{fields,restore_lineage_id}')::uuid,header#>>'{fields,base_revision}',header#>>'{fields,request_fingerprint}')
   is distinct from row('2',prior.operation_id,prior.operation_kind,p_shop,p_device,prior.local_dataset_id,prior.restore_epoch::text,prior.restore_lineage_id,prior.base_revision::text,prior.request_fingerprint) then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
  if prior.qualification is not null then
   if jsonb_build_object('config_digest',header#>>'{fields,qualification_config_digest}','resolver_fingerprint',header#>>'{fields,qualification_resolver_fingerprint}',
    'evidence_ids',(header#>>'{fields,qualification_evidence_ids}')::jsonb) is distinct from prior.qualification then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
  elsif (header->'fields') ?| array['qualification_config_digest','qualification_resolver_fingerprint','qualification_evidence_ids'] then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(raw::jsonb) with ordinality x(v,n) where v->>'kind'='operation' and (v_ordinal<>1 or n<>1)) then raise exception using errcode='22023',message='payment_history_local_header_mismatch';end if;
 select * into page from public.payment_history_local_publication_pages where operation_id=prior.operation_id and ordinal=v_ordinal;
 if found then
  if page.page_json is distinct from raw or page.page_sha256 is distinct from sha then raise exception using errcode='23505',message='payment_history_local_page_conflict';end if;
 else
  if v_ordinal<>prior.staged_pages+1 or v_ordinal>prior.page_count then raise exception using errcode='40001',message='payment_history_local_page_out_of_order';end if;
  if prior.staged_bytes+octet_length(raw)>268435456 then raise exception using errcode='54000',message='payment_history_local_preparation_capacity';end if;
  insert into public.payment_history_local_publication_pages values(p_shop,prior.operation_id,v_ordinal,raw,sha);
  update public.payment_history_local_publications set staged_pages=staged_pages+1,staged_bytes=staged_bytes+octet_length(raw) where operation_id=prior.operation_id returning * into prior;
 end if;
 if prior.staged_pages=prior.page_count and prior.content_digest is distinct from (
  select encode(extensions.digest(convert_to(string_agg(page_sha256||chr(10),'' order by ordinal),'UTF8'),'sha256'),'hex') from public.payment_history_local_publication_pages where operation_id=prior.operation_id) then
  raise exception using errcode='22023',message='payment_history_local_content_digest_invalid';end if;
 return jsonb_build_object('state','preparing','operation_id',prior.operation_id,'content_digest',prior.content_digest,'next_ordinal',prior.staged_pages+1);
end;$$;


create or replace function app_private.payment_history_local_review_movement_v2(p_operation uuid,p_page integer,p_record integer) returns void
language plpgsql volatile set search_path='' as $$
declare p public.payment_history_local_publications;r public.payment_history_runtime;review public.payment_history_local_reviews;
 item record;file_row record;binding record;overlap_row record;correction_row record;mapping record;
 f jsonb;t jsonb;semantic jsonb;economics jsonb;local_previous jsonb;pending jsonb;approval jsonb;
 local_key text;source_key text;native_policy uuid;other_policy uuid;policy_kind text;dependency jsonb;proof_id uuid;
 local_new boolean;is_correction boolean:=false;canonical_new boolean;version_id uuid;supersedes uuid;existing_digest text;
 begin
 select * into p from public.payment_history_local_publications where operation_id=p_operation;
 if not found then raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into r from public.payment_history_runtime where shop_id=p.shop_id for share;
 select * into p from public.payment_history_local_publications where operation_id=p_operation for update;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for update;
 if not found or p.state<>'preparing' or p.operation_kind<>'Apply' or p.grant_id is not null or r.writer_authority<>'local'
  or row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or row(p.server_dataset_id,p.writer_epoch) is distinct from row(r.dataset_id,r.writer_epoch) then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 select * into item from app_private.payment_history_local_review_records_v2(p.shop_id,p.shop_device_id,p_operation,p_page) where record_ordinal=p_record and kind='movement';
 if not found then raise exception using errcode='22023',message='payment_history_local_review_movement_invalid';end if;
 if exists(select 1 from public.payment_history_local_review_movements where operation_id=p_operation and source_ordinal=item.movement_ordinal) then return;end if;
 f:=item.fields;dependency:=review.dependency_hashes;
 select * into file_row from app_private.payment_history_local_auxiliary_v2(p_operation,'file',app_private.payment_history_field_hash_v1(array[f->>'source_file_id']));
 select * into binding from app_private.payment_history_local_auxiliary_v2(p_operation,'binding',app_private.payment_history_field_hash_v1(array[f->>'alias_key']));
 select * into overlap_row from app_private.payment_history_local_auxiliary_v2(p_operation,'overlap',app_private.payment_history_field_hash_v1(array['single']));
 if file_row.fields is null or file_row.fields->>'profile' is distinct from f->>'profile' or binding.fields is null or overlap_row.fields is null
  or length(coalesce(binding.fields->>'local_scope_id','')) not between 1 and 256 then
  raise exception using errcode='22023',message='payment_history_local_review_source_invalid';end if;
 t:=app_private.payment_history_local_transaction_v2(f,file_row.fields->>'sha256');
 if p.qualification is not null and f->>'parser_version' is distinct from 'getnet-ooxml-v1' then raise exception using errcode='22023',message='payment_history_local_source_parser_invalid';end if;
 select a.alias_id,a.merchant_id,e.evidence_id into mapping from public.payment_history_merchant_aliases a
  join public.payment_history_evidence e on e.shop_id=a.shop_id and ((p.qualification is null and e.evidence_id=a.evidence_id) or (p.qualification is not null and p.qualification->'evidence_ids' ? e.evidence_id::text))
  join public.payment_history_merchants m on m.shop_id=a.shop_id and m.merchant_id=a.merchant_id
  where a.shop_id=p.shop_id and a.alias_key=f->>'alias_key' and a.active and a.alias_version='getnet-merchant-alias-v1'
   and (p.qualification is null or e.qualification_version='getnet-qualified-input-v1' and p.qualification->'evidence_ids' ? e.evidence_id::text)
   and m.provider='getnet' and e.kind='merchant_mapping' and e.status='verified' and e.verification_level<>'unverified'
   and e.scope->>'merchant_id'=a.merchant_id::text and e.scope->>'alias_key'=a.alias_key
   and (p.qualification is null or app_private.payment_history_proof_covers_v1(p.shop_id,array[e.evidence_id],'merchant_mapping',a.merchant_id,file_row.fields->>'sha256',t)) order by e.evidence_id limit 1 for share of a,e,m;
 if not found then raise exception using errcode='22023',message='payment_history_local_merchant_unverified';end if;
 if p.qualification is not null and (not app_private.payment_history_proof_covers_v1(p.shop_id,array[mapping.evidence_id],'merchant_mapping',mapping.merchant_id,file_row.fields->>'sha256',t)
  or (not ((binding.fields->>'local_scope_id' ~* '^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') and lower(replace(binding.fields->>'local_scope_id','-',''))=replace(mapping.merchant_id::text,'-','')) and not exists(select 1 from jsonb_array_elements(p.qualification_scope_bindings) b
    where b->>'local_scope_id'=binding.fields->>'local_scope_id' and b->>'merchant_id'=mapping.merchant_id::text))) then raise exception using errcode='22023',message='payment_history_qualified_scope_binding_required';end if;
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'a',mapping.alias_id);
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'m',mapping.merchant_id);
 dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'e',mapping.evidence_id);
 select e.evidence_id into native_policy from public.payment_history_evidence e where e.shop_id=p.shop_id and e.kind='native_start'
  and (p.qualification is null or e.qualification_version='getnet-qualified-input-v1' and p.qualification->'evidence_ids' ? e.evidence_id::text)
  and e.scope->>'native_start_ticks'=overlap_row.fields->>'native_start_ticks'
  and app_private.payment_history_proof_covers_v1(p.shop_id,array[e.evidence_id],'native_start',mapping.merchant_id,file_row.fields->>'sha256',t)
  order by e.evidence_id limit 1 for share;
 policy_kind:=case when f->>'profile'='GetnetModern' then 'modern_time' else 'legacy_currency' end;
 select e.evidence_id into other_policy from public.payment_history_evidence e where e.shop_id=p.shop_id and e.kind=policy_kind
  and (p.qualification is null or e.qualification_version='getnet-qualified-input-v1' and p.qualification->'evidence_ids' ? e.evidence_id::text)
  and app_private.payment_history_proof_covers_v1(p.shop_id,array[e.evidence_id],policy_kind,mapping.merchant_id,file_row.fields->>'sha256',t)
  order by e.evidence_id limit 1 for share;
 if native_policy is null or other_policy is null then raise exception using errcode='22023',message='payment_history_local_policy_unverified';end if;
 semantic:=app_private.payment_history_local_review_transaction_v2(p.shop_id,f,file_row.fields->>'sha256',overlap_row.fields->>'native_start_ticks',array[native_policy,other_policy]);
 economics:=semantic->'economics';
 for proof_id in select value::uuid from jsonb_array_elements_text(semantic->'evidence_ids') loop
  dependency:=app_private.payment_history_local_review_dependency_v2(p.shop_id,dependency,'e',proof_id);
 end loop;
 local_key:=app_private.payment_history_field_hash_v1(array[p.shop_id::text,binding.fields->>'local_scope_id',f->>'external_namespace',f->>'external_id']);
 select m.economics into pending from public.payment_history_local_review_movements m where m.operation_id=p_operation and m.local_identity=local_key and m.local_inserted order by m.source_ordinal limit 1;
 if found then local_previous:=jsonb_build_object('active',true,'economics',pending);
 else local_previous:=app_private.payment_history_local_projection_v2(p_operation,binding.fields->>'local_scope_id',f->>'external_namespace',f->>'external_id');end if;
 local_new:=not coalesce((local_previous->>'active')::boolean,false);
 source_key:=app_private.payment_history_field_hash_v1(array[f->>'source_file_id',f->>'source_sheet',f->>'source_row']);
 select * into correction_row from app_private.payment_history_local_auxiliary_v2(p_operation,'correction',source_key);
 approval:=correction_row.fields;
 if not local_new and app_private.payment_history_local_economic_conflict_v2(local_previous->'economics',economics) then
  raise exception using errcode='40001',message='payment_history_local_economic_conflict';end if;
 if local_new and local_previous is not null and app_private.payment_history_local_economic_conflict_v2(local_previous->'economics',economics) then
  if approval is null or coalesce(local_previous->>'source_kind','') not in('baseline','publication')
   or (local_previous->>'source_kind'='baseline' and approval->>'previous_transaction_id' is distinct from local_previous->>'local_transaction_id')
   or approval->>'previous_local_batch_id' is distinct from local_previous->>'local_batch_id'
   or (approval->>'previous_apply_operation_id')::uuid is distinct from (local_previous->>'apply_operation_id')::uuid
   or approval->>'previous_economic_digest' is distinct from local_previous->>'economic_digest'
   or approval->>'proposed_economic_digest' is distinct from semantic->>'economic_digest'
   or approval->>'context_fingerprint' is distinct from app_private.payment_history_field_hash_v1(array['correction-review-context-v1',p.shop_id::text,p.local_dataset_id,p.base_revision::text,p.restore_epoch::text])
   or length(btrim(coalesce(approval->>'evidence_reference',''))) not between 1 and 2048
   or approval->>'approval_fingerprint' is distinct from app_private.payment_history_field_hash_v1(array[approval->>'previous_transaction_id',approval->>'previous_economic_digest',approval->>'proposed_economic_digest',approval->>'source_file_id',approval->>'source_sheet',approval->>'source_row',approval->>'context_fingerprint',approval->>'evidence_reference']) then
   raise exception using errcode='40001',message='payment_history_local_correction_unverified';end if;
  is_correction:=true;
 elsif approval is not null then raise exception using errcode='40001',message='payment_history_local_correction_stale';end if;
 select movement_version_id,economic_digest into version_id,existing_digest from public.payment_history_movement_versions
  where shop_id=p.shop_id and identity_key=semantic->>'identity_key' and active for share;
 if found then
  if existing_digest is distinct from semantic->>'economic_digest' then raise exception using errcode='40001',message='payment_history_canonical_economic_conflict';end if;
  canonical_new:=false;
 else
  select canonical_version,economic_digest into version_id,existing_digest from public.payment_history_local_review_movements
   where operation_id=p_operation and canonical_identity=semantic->>'identity_key' order by source_ordinal limit 1;
  if found then
   if existing_digest is distinct from semantic->>'economic_digest' then raise exception using errcode='40001',message='payment_history_canonical_economic_conflict';end if;
   canonical_new:=false;
  else
   if exists(select 1 from public.payment_history_movement_versions where shop_id=p.shop_id and identity_key=semantic->>'identity_key') then
    if local_previous is null or not local_new then raise exception using errcode='40001',message='payment_history_local_correction_owner_unverified';end if;
    supersedes:=app_private.payment_history_local_inactive_owner_v2(p_operation,local_previous->>'local_transaction_id',local_previous->>'local_batch_id',
     (local_previous->>'apply_operation_id')::uuid,semantic->>'identity_key',local_previous->>'economic_digest');
   elsif local_previous is not null then raise exception using errcode='40001',message='payment_history_local_projection_unverified';end if;
   version_id:=gen_random_uuid();canonical_new:=true;
  end if;
 end if;
 insert into public.payment_history_local_review_movements values(p.shop_id,p_operation,item.movement_ordinal,p_page,p_record,binding.source_page,binding.source_record,
  binding.fields->>'local_scope_id',local_key,semantic->>'identity_key',mapping.merchant_id,semantic->'transaction',economics,semantic->>'economic_digest',
  local_new,is_correction,canonical_new,version_id,supersedes);
 update public.payment_history_local_reviews set dependency_hashes=dependency,
  local_inserted=local_inserted+local_new::integer,local_duplicates=local_duplicates+(not local_new)::integer,
  local_corrections=local_corrections+is_correction::integer,local_gross=local_gross+case when local_new then (economics->>'grossClp')::bigint else 0 end,
  canonical_inserted=canonical_inserted+canonical_new::integer,canonical_duplicates=canonical_duplicates+(not canonical_new)::integer,
  canonical_gross=canonical_gross+case when canonical_new then (economics->>'grossClp')::bigint else 0 end where operation_id=p_operation;
end;$$;


create or replace function app_private.payment_history_local_review_apply_page_v2(p_shop uuid,p_device uuid,p_operation uuid,p_root text,p_page integer,p_token uuid default null) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 review public.payment_history_local_reviews;item record;counts record;begin
 if p_operation is null or p_page is null or p_page not between 1 and 20000 or coalesce(p_root,'') !~ '^[0-9a-f]{64}$' then
  raise exception using errcode='22023',message='payment_history_local_review_page_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for update;
 if not found or p.state<>'preparing' or p.operation_kind<>'Apply' or p.grant_id is not null or p.content_digest<>p_root or r.writer_authority<>'local'
  or row(p.server_dataset_id,p.writer_epoch) is distinct from row(r.dataset_id,r.writer_epoch) then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 perform app_private.payment_history_local_qualification_current_v1(p_shop,p_device,p_operation);
 -- Even an empty Apply must have a complete immutable index and real baseline.
 perform 1 from app_private.payment_history_local_review_records_v2(p_shop,p_device,p_operation,p_page);
 perform app_private.payment_history_local_projection_v2(p_operation,'review-context-probe','getnet.legacy.transaction','review-context-probe');
 if exists(select 1 from public.payment_history_local_preparation_records where operation_id=p_operation and kind='undo') then
  raise exception using errcode='22023',message='payment_history_local_review_source_invalid';end if;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for update;
 if not found then
  if p_page<>1 or p_token is not null then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
  insert into public.payment_history_local_reviews(shop_id,operation_id,server_dataset_id,server_revision,writer_epoch)
   values(p_shop,p_operation,r.dataset_id,r.revision,r.writer_epoch) returning * into review;
 end if;
 if row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or (p_token is not null and p_token<>review.review_token) or (p_token is null and p_page<>1) or p_page>review.next_page then
  raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 perform app_private.payment_history_local_review_dependencies_current_v2(p_shop,review.dependency_hashes);
 if p_page=review.next_page then
  for item in select * from app_private.payment_history_local_review_records_v2(p_shop,p_device,p_operation,p_page) loop
   if item.kind='movement' then perform app_private.payment_history_local_review_movement_v2(p_operation,p_page,item.record_ordinal);
   elsif item.kind='rejected' then update public.payment_history_local_reviews set local_rejected=local_rejected+1 where operation_id=p_operation;end if;
  end loop;
  update public.payment_history_local_reviews set next_page=next_page+1 where operation_id=p_operation returning * into review;
 end if;
 if review.next_page>p.page_count then
  select count(*) filter(where kind='movement') movements,count(*) filter(where kind='correction') corrections into counts
   from public.payment_history_local_preparation_records where operation_id=p_operation;
  if counts.movements<>review.local_inserted+review.local_duplicates or counts.corrections<>review.local_corrections then
   raise exception using errcode='40001',message='payment_history_local_review_incomplete';end if;
 end if;
 return jsonb_build_object('state',case when review.next_page>p.page_count then 'reviewed' else 'reviewing' end,'operation_id',p.operation_id,
  'content_digest',p.content_digest,'review_token',review.review_token,'next_ordinal',review.next_page);
end;$$;


create or replace function app_private.payment_history_local_authorize_v2(p_shop uuid,p_device uuid,p_staff uuid,p_session uuid,
 p_device_hash text,p_session_hash text,p_version integer,p_operation uuid,p_root text,p_review_token uuid) returns jsonb
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;c public.payment_history_local_writer_contexts;
 review public.payment_history_local_reviews;cap text;grant_key uuid;issued timestamptz;deadline timestamptz;proof jsonb;history_end date;credential uuid;begin
 select case operation_kind when 'Undo' then 'cancel' else 'import' end into cap
  from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation;
 -- Unknown operations are authenticated before returning any scope information.
 perform app_private.payment_history_local_device_actor_v2(p_shop,p_device,p_staff,p_session,p_device_hash,p_session_hash,p_version,coalesce(cap,'import'));
 if p_operation is null or coalesce(p_root,'') !~ '^[0-9a-f]{64}$' or p_review_token is null then
  raise exception using errcode='22023',message='payment_history_local_request_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for update;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for update;
 if not found or p.content_digest<>p_root or p.server_dataset_id is distinct from r.dataset_id then
  raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 select * into c from public.payment_history_local_writer_contexts where shop_id=p_shop and shop_device_id=p_device for share;
 if not found or c.source_snapshot_id is null or row(c.local_dataset_id,c.restore_lineage_id,c.restore_epoch) is distinct from row(p.local_dataset_id,p.restore_lineage_id,p.restore_epoch)
  or c.local_revision>p.base_revision then raise exception using errcode='40001',message='payment_history_local_context_unverified';end if;
 select * into review from public.payment_history_local_reviews where operation_id=p_operation for share;
 if not found or review.review_token<>p_review_token then raise exception using errcode='40001',message='payment_history_local_review_stale';end if;
 perform app_private.payment_history_local_qualification_current_v1(p_shop,p_device,p_operation);
 if p.grant_id is not null then
  if p.state not in('authorized','reconcile_required') or p.authorized_proof is null or p.authorization_staff_id<>p_staff or p.authorization_credential_version<>p_version then
   raise exception using errcode='40001',message='payment_history_local_decision_exists';end if;
  -- Lost-ACK replay returns the original decision and deadline, never a renewal.
  return jsonb_build_object('state','authorized','operation_id',p.operation_id,'content_digest',p.content_digest,'grant_id',p.grant_id,'writer_epoch',p.writer_epoch::text,
   'remaining_milliseconds',case when r.writer_authority='local' and r.writer_epoch=p.writer_epoch then greatest(0,least(60000,floor(extract(epoch from p.expires_at-clock_timestamp())*1000)))::integer else 0 end,'proof',p.authorized_proof);
 end if;
 if p.state<>'preparing' or r.writer_authority<>'local' or p.writer_epoch<>r.writer_epoch
  or row(review.server_dataset_id,review.server_revision,review.writer_epoch) is distinct from row(r.dataset_id,r.revision,r.writer_epoch)
  or p.staged_pages<>p.page_count or (p.operation_kind='Apply' and review.next_page<=p.page_count) or (p.operation_kind='Undo' and not review.undo_complete) then
  raise exception using errcode='40001',message='payment_history_local_review_incomplete';end if;
 perform app_private.payment_history_local_projection_v2(p_operation,'review-context-probe','getnet.legacy.transaction','review-context-probe');
 perform app_private.payment_history_local_review_dependencies_current_v2(p_shop,review.dependency_hashes);
 if exists(select 1 from public.payment_history_local_publications other where other.shop_id=p_shop and other.operation_id<>p_operation
   and other.grant_id is not null and other.state not in('committed','aborted'))
  or exists(select 1 from public.payment_history_local_write_grants where shop_id=p_shop)
  or exists(select 1 from public.payment_history_source_objects b where b.source_snapshot_id=c.source_snapshot_id and b.table_name='operations' and (b.original_object->>'operation_id')::uuid=p_operation) then
  raise exception using errcode='40001',message='payment_history_local_publications_not_drained';end if;
 perform app_private.payment_history_local_mutation_fence_v2(p_shop);
 select max((m.transaction#>>'{timestamp,businessDateTime}')::date) into history_end
  from public.payment_history_local_review_movements m where m.operation_id=p_operation;
 if history_end is not null and exists(select 1 from public.pos_sales s where s.shop_id=p_shop and s.status='accepted' and (s.business_date is null or s.business_date<=history_end)) then
  raise exception using errcode='40001',message='payment_history_local_native_overlap';end if;
 issued:=clock_timestamp();deadline:=least(issued+interval '60 seconds',current_setting('app.payment_history_publish_deadline',true)::timestamptz);
 if deadline is null or deadline<=issued+interval '10 seconds' then raise exception using errcode='42501',message='payment_history_lease_expired';end if;
 select pos_device_credential_id into credential from public.pos_sessions where pos_session_id=p_session;
 grant_key:=gen_random_uuid();
 proof:=jsonb_build_object('grant_id',grant_key,'operation_id',p.operation_id,'shop_id',p.shop_id,'device_id',p.shop_device_id,'local_dataset_id',p.local_dataset_id,
  'restore_epoch',p.restore_epoch::text,'writer_epoch',p.writer_epoch::text,'content_digest',p.content_digest,'request_fingerprint',p.request_fingerprint,
  'decision','content_authorized_v2','server_dataset_id',p.server_dataset_id,'restore_lineage_id',p.restore_lineage_id,
  'local_decision',jsonb_build_object('inserted',review.local_inserted,'duplicates',review.local_duplicates,'rejected',review.local_rejected,'corrections',review.local_corrections,
   'deactivated',review.local_deactivated,'signed_gross_clp',review.local_gross::text,'revision_delta',(review.local_inserted+review.local_deactivated)::text),
  'canonical_decision',jsonb_build_object('batch_id',case when p.operation_kind='Undo' then review.undo_canonical_batch_id else review.planned_batch_id end,
   'revision',(r.revision+1)::text,'inserted',review.canonical_inserted,'duplicates',review.canonical_duplicates,'deactivated',review.canonical_deactivated,'signed_gross_clp',review.canonical_gross::text));
 update public.payment_history_local_publications set state='authorized',grant_id=grant_key,authorization_staff_id=p_staff,authorization_credential_version=p_version,
  authorization_session_id=p_session,authorization_device_credential_id=credential,issued_at=issued,expires_at=deadline,authorized_proof=proof,authorized_history_end_date=history_end
  where operation_id=p_operation returning * into p;
 return jsonb_build_object('state','authorized','operation_id',p.operation_id,'content_digest',p.content_digest,'grant_id',p.grant_id,'writer_epoch',p.writer_epoch::text,
  'remaining_milliseconds',greatest(0,least(60000,floor(extract(epoch from p.expires_at-clock_timestamp())*1000)::integer)),'proof',p.authorized_proof);
end;$$;


-- Fresh Web/POS jobs share the same qualified-proof review guard.
create or replace function app_private.payment_history_review_rows_v1(p_job uuid)
returns table(ordinal integer,merchant_id uuid,identity_key text,previous_version_id uuid,decision text,code text)
language sql volatile security definer set search_path='' as $$
 with job as materialized (select j.*,r.revision,r.writer_epoch from public.payment_history_jobs j join public.payment_history_runtime r using(shop_id) where j.job_id=p_job),
 proofs as materialized(select array(select configured.id::uuid from jsonb_array_elements_text(coalesce(j.configuration->'evidence_ids','[]')) configured(id)
 where not j.requires_qualified_input or exists(select 1 from public.payment_history_evidence e where e.shop_id=j.shop_id and e.evidence_id=configured.id::uuid
  and e.status='verified' and e.qualification_version='getnet-qualified-input-v1' and e.scope->>'parser_version'=j.parser_version)) ids from job j),
 base as materialized (
 select s.*,j.requires_qualified_input,a.merchant_id canonical_merchant_id,e.status alias_evidence_status,e.verification_level alias_evidence_level,e.qualification_version alias_qualification_version,e.scope->>'parser_version' alias_parser_version,e.evidence_id alias_scoped_evidence_id,
  encode(extensions.digest(convert_to(s.shop_id::text||chr(31)||'getnet'||chr(31)||a.merchant_id::text||chr(31)||(s.transaction->>'externalNamespace')||chr(31)||(s.transaction->>'externalId'),'UTF8'),'sha256'),'hex') global_key,
  row_number() over(partition by a.merchant_id,s.transaction->>'externalNamespace',s.transaction->>'externalId' order by s.ordinal) identity_ordinal,
  min((s.transaction#>>'{timestamp,businessDateTime}')::date) over() first_date
 from public.payment_history_staged_movements s join job j on j.job_id=s.job_id
 left join public.payment_history_merchant_aliases a on a.shop_id=s.shop_id and a.alias_key=s.alias_key and a.active
 left join lateral(select candidate.* from public.payment_history_evidence candidate where candidate.shop_id=a.shop_id and candidate.kind='merchant_mapping'
  and ((not j.requires_qualified_input and candidate.evidence_id=a.evidence_id) or (j.requires_qualified_input and j.configuration->'evidence_ids' ? candidate.evidence_id::text
   and candidate.qualification_version='getnet-qualified-input-v1' and candidate.status='verified' and candidate.scope->>'parser_version'=j.parser_version
   and app_private.payment_history_proof_covers_v1(s.shop_id,array[candidate.evidence_id],'merchant_mapping',a.merchant_id,s.transaction#>>'{source,fileSha256}',s.transaction))) order by candidate.evidence_id limit 1) e on true
 ), collisions as materialized (
 select b.global_key from base b where b.global_key is not null group by b.global_key having
 count(distinct b.economics->>'businessTicks')>1 or count(distinct b.economics->>'grossClp')>1 or count(distinct b.economics->>'movementKind')>1 or count(distinct b.economics->>'transactionState')>1
 or count(distinct b.economics->>'commissionClp')>1 or count(distinct b.economics->>'commissionVatClp')>1 or count(distinct b.economics->>'netClp')>1
 ), classified as (
 select b.ordinal,b.canonical_merchant_id,b.global_key,coalesce(active.movement_version_id,previous.movement_version_id) previous_id,
 case
 when b.canonical_merchant_id is null or b.requires_qualified_input and (b.alias_qualification_version is distinct from 'getnet-qualified-input-v1' or b.alias_parser_version is distinct from 'getnet-ooxml-web-v1') or b.alias_evidence_status is distinct from 'verified' or b.alias_evidence_level is null or b.alias_evidence_level='unverified' or not app_private.payment_history_proof_covers_v1(b.shop_id,array[b.alias_scoped_evidence_id],'merchant_mapping',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_merchant_unverified'
 when not exists(select 1 from public.payment_history_uploads u,job j where u.shop_id=b.shop_id and u.upload_id=b.source_upload_id and u.upload_id=any(j.source_upload_ids) and u.state='verified' and u.file_sha256=b.transaction#>>'{source,fileSha256}') then 'history_upload_unverified'
 when not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'native_start',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_native_start_unverified'
 when exists(select 1 from public.pos_sales n where n.shop_id=b.shop_id and n.status='accepted' and n.business_date<= (b.transaction#>>'{timestamp,businessDateTime}')::date) then 'history_native_overlap'
 when b.transaction->>'profile'='GetnetModern' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'modern_time',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_provider_time_unverified'
 when b.transaction->>'profile'='GetnetLegacy' and not app_private.payment_history_proof_covers_v1(b.shop_id,p.ids,'legacy_currency',b.canonical_merchant_id,b.transaction#>>'{source,fileSha256}',b.transaction) then 'history_currency_unverified'
 when collision.global_key is not null or (active.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(active.transaction))) then 'history_active_economics_conflict'
 when active.movement_version_id is not null or b.identity_ordinal>1 then 'history_duplicate'
 when previous.movement_version_id is not null and app_private.payment_history_conflict_v1(b.economics,app_private.payment_history_economics_v1(previous.transaction))
 and not exists(select 1 from job j,jsonb_array_elements(coalesce(j.configuration->'corrections','[]')) approval
  join public.payment_history_evidence e on e.evidence_id=(approval->>'evidence_id')::uuid
  where e.shop_id=b.shop_id and e.kind='economic_correction' and e.status='verified' and e.verification_level<>'unverified'
  and approval @> jsonb_build_object('identity_key',b.global_key,'previous_version_id',previous.movement_version_id,'previous_digest',previous.economic_digest,
    'proposed_digest',b.economic_digest,'analysis_digest',j.analysis_digest,'revision',j.revision::text,'writer_epoch',j.writer_epoch::text,
    'source_upload_id',b.source_upload_id,'source_row',b.source_row,'source_sheet',b.source_sheet)) then 'history_inactive_correction_unapproved'
 else 'history_new' end reason
 from base b cross join proofs p
 left join collisions collision on collision.global_key=b.global_key
 left join public.payment_history_movement_versions active on active.shop_id=b.shop_id and active.identity_key=b.global_key and active.active
 left join lateral(select v.* from public.payment_history_movement_versions v where v.shop_id=b.shop_id and v.identity_key=b.global_key and not v.active order by v.created_revision desc,v.movement_version_id desc limit 1) previous on true
 ) select c.ordinal,c.canonical_merchant_id,c.global_key,c.previous_id,
 case c.reason when 'history_new' then 'new' when 'history_duplicate' then 'duplicate' when 'history_active_economics_conflict' then 'conflict' else 'blocked' end,c.reason from classified c;
$$;

-- Preserve the actual local reader version explicitly; normalized transport is not parser equivalence.
create or replace function app_private.payment_history_local_transaction_v2(f jsonb,p_source_hash text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text;t jsonb;clock text;utc_clock text;raw_ticks bigint;utc_ticks bigint;business_ticks bigint;
 minutes integer;parts text[];hours integer;offset_minute integer;v_ms bigint;begin
 if f ? 'parser_version' and (jsonb_typeof(f->'parser_version') is distinct from 'string' or f->>'parser_version'<>'getnet-ooxml-v1') then raise exception using errcode='22023',message='payment_history_local_source_parser_invalid';end if;
 if jsonb_typeof(f) is distinct from 'object' or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$'
  or coalesce(f->>'profile','') not in('GetnetLegacy','GetnetModern') or length(coalesce(f->>'time_policy_version','')) not between 1 and 160
  or length(coalesce(f->>'time_evidence_reference',''))>2048 or length(coalesce(f->>'source_sheet',''))>256
  or coalesce(f->>'source_row','') !~ '^[1-9][0-9]*$' or (f->>'source_row')::bigint>1048576
  or coalesce(f->>'card_subtype','') not in('Unknown','Debit','Credit','Prepaid') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['gross_clp','fee_clp','fee_vat_clp','net_clp','business_ticks','offset_minutes','occurred_at_utc_ms'] loop
  if f->>k is not null and (jsonb_typeof(f->k)<>'string' or (f->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 business_ticks:=(f->>'business_ticks')::bigint;clock:=app_private.payment_history_clock_from_ticks_v2(f->>'business_ticks');
 if f->>'profile'='GetnetLegacy' then
  if f->>'offset_minutes' is not null or f->>'occurred_at_utc_ms' is not null or f->>'time_interpretation' is distinct from 'Unresolved'
   or f->>'external_namespace' is distinct from 'getnet.legacy.transaction' then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  -- Excel serial/date-system cell metadata was not retained by the legacy
  -- ledger. Keep its attested clock/raw value; never promote it to provider proof.
 else
  if f->>'external_namespace' is distinct from 'getnet.financial.movement' or coalesce(f->>'time_interpretation','') not in('IsoUtc','ExportedLocal')
   or coalesce(f->>'timestamp_raw','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,7})?Z$'
   or f->>'offset_minutes' is null or f->>'occurred_at_utc_ms' is null then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  parts:=regexp_match(btrim(f->>'offset_raw'),'^([+-]?)([0-9]{1,2})(:([0-9]{2}))?$');
  if parts is null then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  hours:=parts[2]::integer;offset_minute:=coalesce(parts[4],'0')::integer;
  if hours>14 or offset_minute>59 or hours=14 and offset_minute<>0 then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  minutes:=(case when parts[1]='-' then -1 else 1 end)*(hours*60+offset_minute);
  if minutes is distinct from (f->>'offset_minutes')::integer then raise exception using errcode='22023',message='payment_history_offset_invalid';end if;
  raw_ticks:=app_private.payment_history_ticks_v1(f->>'timestamp_raw');
  utc_ticks:=case when f->>'time_interpretation'='IsoUtc' then raw_ticks else raw_ticks-minutes::bigint*600000000 end;
  if business_ticks is distinct from (case when f->>'time_interpretation'='IsoUtc' then raw_ticks+minutes::bigint*600000000 else raw_ticks end) then
   raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  v_ms:=floor((utc_ticks::numeric-621355968000000000)/10000)::bigint;
  if v_ms is distinct from (f->>'occurred_at_utc_ms')::bigint then raise exception using errcode='22023',message='payment_history_timestamp_invalid';end if;
  utc_clock:=app_private.payment_history_clock_from_ticks_v2(utc_ticks::text)||'Z';
 end if;
 t:=jsonb_build_object('source',jsonb_build_object('fileId',f->>'source_file_id','fileSha256',p_source_hash,'sheetName',f->>'source_sheet','rowNumber',(f->>'source_row')::integer),
  'profile',f->>'profile','profileVersion',case when f->>'profile'='GetnetLegacy' then 'getnet-legacy-v1' else 'getnet-modern-v1' end,
  'parserVersion',coalesce(f->>'parser_version','history-pos-normalized-v2'),'provider','getnet','currency','CLP','paymentMethod','card','externalNamespace',f->>'external_namespace','externalId',f->>'external_id',
  'paymentId',f->>'payment_id','authorizationCode',f->>'authorization_code',
  'merchant',jsonb_build_object('local',f->>'merchant_local','seller',f->>'merchant_seller','sellerId',f->>'merchant_seller_id','localNumber',f->>'merchant_local_number','rut',f->>'merchant_rut','hasEvidence',true),
  'timestamp',jsonb_build_object('rawTimestamp',f->>'timestamp_raw','rawOffset',f->>'offset_raw','offsetMinutes',minutes,'businessDateTime',clock,'occurredAtUtc',utc_clock,
   'interpretation',f->>'time_interpretation','policyVersion',f->>'time_policy_version','evidenceReference',f->>'time_evidence_reference','needsEvidence',false),
  'movementKind',f->>'movement_kind','transactionStatus',upper(trim(f->>'transaction_state')),'sourceTransactionStatus',f->>'transaction_state','settlementStatus',f->>'settlement_state',
  'grossClp',f->>'gross_clp','commissionClp',f->>'fee_clp','commissionVatClp',f->>'fee_vat_clp','netClp',f->>'net_clp','cardSubtype',f->>'card_subtype',
  'originalCardType',f->>'original_card_type','originalPrepaid',f->>'original_prepaid','terminal',f->>'terminal','rawSettlementDate',f->>'settlement_date_raw','originalCashierId',null);
 -- The v1 helper's parser marker belongs to its input adapter. Reuse its exact
 -- monetary validation while retaining the actual v2 provenance in the ledger.
 perform app_private.payment_history_economics_v1(t||jsonb_build_object('parserVersion','getnet-ooxml-web-v1'));
 if app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1',f->>'merchant_local',f->>'merchant_seller',f->>'merchant_seller_id',f->>'merchant_local_number',f->>'merchant_rut']) is distinct from f->>'alias_key' then
  raise exception using errcode='22023',message='payment_history_merchant_alias_invalid';end if;
 return t;
end;$$;

create or replace function app_private.payment_history_economics_v1(p_transaction jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb;g bigint;c bigint;t bigint;n bigint;k text;s text;begin
 if jsonb_typeof(p_transaction) is distinct from 'object' or p_transaction->>'provider' is distinct from 'getnet' or p_transaction->>'currency' is distinct from 'CLP'
  or coalesce(p_transaction->>'parserVersion','') not in ('getnet-ooxml-web-v1','history-local-ledger-v1','history-pos-normalized-v2','getnet-ooxml-v1') or coalesce(p_transaction->>'externalNamespace','') not in ('getnet.legacy.transaction','getnet.financial.movement')
  or length(coalesce(p_transaction->>'externalId','')) not between 1 and 256 or (p_transaction->>'externalId') ~ '[[:cntrl:]]'
  or coalesce(p_transaction->>'profile','') not in ('GetnetLegacy','GetnetModern') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['grossClp','commissionClp','commissionVatClp','netClp'] loop
  if p_transaction->>k is not null and (jsonb_typeof(p_transaction->k)<>'string' or (p_transaction->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 g:=(p_transaction->>'grossClp')::bigint;c:=(p_transaction->>'commissionClp')::bigint;t:=(p_transaction->>'commissionVatClp')::bigint;n:=(p_transaction->>'netClp')::bigint;
 k:=p_transaction->>'movementKind';s:=upper(trim(p_transaction->>'transactionStatus'));
 if g is null or k is null or not ((k='Sale' and g>0) or (k='Cancellation' and g<0)) or s is null or s not in ('ABONADO','CONFIRMADA')
  or (p_transaction->>'profile'='GetnetLegacy' and (k<>'Sale' or c is null or c<0 or n is null or t is not null or n::numeric<>g::numeric-c::numeric))
  or (p_transaction->>'profile'='GetnetModern' and ((g>0 and (c>0 or t>0)) or (g<0 and (c<0 or t<0))
   or (n is not null and c is not null and t is not null and n::numeric<>g::numeric+c::numeric+t::numeric)))
  then raise exception using errcode='22023',message='payment_history_economics_invalid';end if;
 v:=jsonb_build_object('businessTicks',app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')::text,
  'grossClp',g::text,'commissionClp',c::text,'commissionVatClp',t::text,'netClp',n::text,'movementKind',k,'transactionState',s);
 return v;
end;$$;

create or replace function public.payment_history_device_v1(p_shop_id uuid,p_shop_device_id uuid,p_staff_id uuid,p_pos_session_id uuid,p_device_token_hash text,p_session_token_hash text,p_credential_version integer,p_operation text,p_payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$declare result jsonb;prior public.payment_history_local_write_grants;begin
 if p_operation='local_write_grant' then
  perform app_private.payment_history_local_device_actor_v2(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,
   case when p_payload->>'kind'='Undo' then 'cancel' else 'import' end);
  insert into public.payment_history_runtime(shop_id) values(p_shop_id) on conflict do nothing;
  perform 1 from public.payment_history_runtime where shop_id=p_shop_id for update;
  if exists(select 1 from public.payment_history_local_writer_contexts where shop_id=p_shop_id and source_snapshot_id is not null) then
   raise exception using errcode='40001',message='payment_history_local_protocol_required';end if;
  select * into prior from public.payment_history_local_write_grants where shop_id=p_shop_id and shop_device_id=p_shop_device_id and operation_id=(p_payload->>'operation_id')::uuid for update;
  if p_payload->>'kind'='Apply' and (prior.operation_id is null or prior.admission_kind is not null)
   and exists(select 1 from public.payment_history_runtime where shop_id=p_shop_id and writer_authority='local') then
   raise exception using errcode='55000',message='payment_history_qualified_upgrade_required';end if;
 end if;
 result:=app_private.payment_history_device_legacy_v1(p_shop_id,p_shop_device_id,p_staff_id,p_pos_session_id,p_device_token_hash,p_session_token_hash,p_credential_version,p_operation,p_payload);
 if p_operation='local_write_grant' and p_payload->>'kind'='Undo' and prior.operation_id is null then
  update public.payment_history_local_write_grants set admission_kind='Undo' where shop_id=p_shop_id and shop_device_id=p_shop_device_id and operation_id=(p_payload->>'operation_id')::uuid;
 end if;
 return result;
end;$$;
