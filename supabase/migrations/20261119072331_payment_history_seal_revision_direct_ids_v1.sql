-- Every admitted revision references exactly one visible movement in its shop.
-- Remove only that redundant join; payload, multiplicity, ordering and hashes
-- remain unchanged. Refuse catalog drift instead of altering FK/RLS/privileges.
do $migration$
declare
 before_function jsonb;after_function jsonb;before_payload jsonb;catalog_before jsonb;catalog_now jsonb;
 revision_columns smallint[];movement_columns smallint[];reference_fk record;
 movement_table record;phase integer;
begin
 select to_jsonb(p) into before_function from pg_catalog.pg_proc p
  where p.oid='app_private.payment_history_seal_revision_v1(uuid,bigint)'::regprocedure;
 select to_jsonb(p) into before_payload from pg_catalog.pg_proc p
  where p.oid='app_private.payment_history_replica_payload_v1(uuid,text,uuid)'::regprocedure;
 if before_function is null or before_payload is null
    or encode(extensions.digest(convert_to(before_function->>'prosrc','UTF8'),'sha256'),'hex')
       is distinct from 'e6e99ad658aa13da1bb8f47fa0f786f8894abc27d1b73e5e23392356bf266f69'
    or encode(extensions.digest(convert_to(before_payload->>'prosrc','UTF8'),'sha256'),'hex')
       is distinct from 'a3ec1dee8d8d029e530a524db7fe1c7d93357eaa766e577671adeb7cd745e7ae' then
  raise exception using errcode='55000',message='payment_history_seal_preimage_mismatch';
 end if;
 for phase in 1..2 loop
  select array_agg(a.attnum order by w.ordinal) into revision_columns
   from (values(1,'shop_id'),(2,'movement_version_id')) w(ordinal,name)
   join pg_catalog.pg_attribute a on a.attrelid='public.payment_history_revisions'::regclass and a.attname=w.name
    and not a.attisdropped and a.attnotnull and a.atttypid='uuid'::regtype;
  select array_agg(a.attnum order by w.ordinal) into movement_columns
   from (values(1,'shop_id'),(2,'movement_version_id')) w(ordinal,name)
   join pg_catalog.pg_attribute a on a.attrelid='public.payment_history_movement_versions'::regclass and a.attname=w.name
    and not a.attisdropped and a.attnotnull and a.atttypid='uuid'::regtype;
  if cardinality(revision_columns) is distinct from 2 or cardinality(movement_columns) is distinct from 2 then
   raise exception using errcode='55000',message='payment_history_seal_reference_columns_mismatch';
  end if;
  select * into reference_fk from pg_catalog.pg_constraint c
   where c.conrelid='public.payment_history_revisions'::regclass and c.contype='f'
    and c.confrelid='public.payment_history_movement_versions'::regclass
    and c.conkey=revision_columns and c.confkey=movement_columns and c.convalidated
    and not c.condeferrable and not c.condeferred and c.confmatchtype='s' and c.confupdtype='a' and c.confdeltype='a';
  if not found or current_setting('session_replication_role')<>'origin'
    or (select count(*) from pg_catalog.pg_trigger t where t.tgconstraint=reference_fk.oid)<>4
    or exists(select 1 from pg_catalog.pg_trigger t where t.tgconstraint=reference_fk.oid
      and (not t.tgisinternal or t.tgenabled not in ('O','A') or t.tgdeferrable or t.tginitdeferred))
    or not exists(select 1 from pg_catalog.pg_constraint u join pg_catalog.pg_index i on i.indexrelid=u.conindid
      where u.conrelid=reference_fk.confrelid and u.contype in ('u','p') and u.conkey=movement_columns
       and u.conindid=reference_fk.conindid and not u.condeferrable and u.convalidated
       and i.indisunique and i.indisvalid and i.indisready and i.indislive and i.indpred is null and i.indexprs is null) then
   raise exception using errcode='55000',message='payment_history_seal_reference_constraint_mismatch';
  end if;
  select * into movement_table from pg_catalog.pg_class where oid='public.payment_history_movement_versions'::regclass;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner
      where p.oid in ('app_private.payment_history_seal_revision_v1(uuid,bigint)'::regprocedure,
        'app_private.payment_history_replica_payload_v1(uuid,text,uuid)'::regprocedure)
       and p.prosecdef and has_table_privilege(p.proowner,movement_table.oid,'SELECT')
       and (r.rolsuper or r.rolbypassrls or (p.proowner=movement_table.relowner and not movement_table.relforcerowsecurity)))<>2 then
   raise exception using errcode='55000',message='payment_history_seal_reference_visibility_mismatch';
  end if;
  select jsonb_build_object('foreignKey',to_jsonb(reference_fk),
   'triggers',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_catalog.pg_trigger t where t.tgconstraint=reference_fk.oid),
   'uniqueConstraint',(select jsonb_agg(to_jsonb(u) order by u.oid) from pg_catalog.pg_constraint u where u.conindid=reference_fk.conindid),
   'uniqueIndex',(select to_jsonb(i) from pg_catalog.pg_index i where i.indexrelid=reference_fk.conindid),
   'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_catalog.pg_attribute a
     where (a.attrelid='public.payment_history_revisions'::regclass and a.attnum=any(revision_columns))
        or (a.attrelid='public.payment_history_movement_versions'::regclass and a.attnum=any(movement_columns))),
   'visibility',(select jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
     from pg_catalog.pg_class c where c.oid in ('public.payment_history_revisions'::regclass,'public.payment_history_movement_versions'::regclass)),
   'roles',(select jsonb_agg(jsonb_build_array(r.oid,r.rolsuper,r.rolbypassrls) order by r.oid) from pg_catalog.pg_roles r
     where r.oid in ((before_function->>'proowner')::oid,(before_payload->>'proowner')::oid))) into catalog_now;
  if phase=1 then
   catalog_before:=catalog_now;
   execute $definition$create or replace function app_private.payment_history_seal_revision_v1(p_shop uuid,p_revision bigint) returns void
language plpgsql volatile security definer set search_path='' as $$
declare n integer;digest text;old public.payment_history_change_sets;begin
 if exists(select 1 from public.payment_history_change_sets where shop_id=p_shop and revision=p_revision) then return;end if;
 insert into public.payment_history_replica_events(shop_id,revision,ordinal,entity_kind,entity_id,entity_digest,payload)
 select p_shop,p_revision,row_number() over(order by x.kind collate "C",x.id)::integer,x.kind,x.id,app_private.payment_history_replica_entity_digest_v1(x.kind,x.payload),x.payload from(
  select 'batch'::text kind,b.batch_id id,app_private.payment_history_replica_payload_v1(p_shop,'batch',b.batch_id) payload from public.payment_history_batches b where b.shop_id=p_shop and (b.created_revision=p_revision or b.cancelled_revision=p_revision)
  union all select 'movement',c.movement_version_id,app_private.payment_history_replica_payload_v1(p_shop,'movement',c.movement_version_id) from public.payment_history_revisions c where c.shop_id=p_shop and c.revision=p_revision
 )x;
 select count(*)::integer,encode(extensions.digest(convert_to(coalesce(string_agg(entity_kind||'|'||entity_id::text||'|'||entity_digest||chr(10),'' order by ordinal),''),'UTF8'),'sha256'),'hex') into n,digest from public.payment_history_replica_events where shop_id=p_shop and revision=p_revision;
 insert into public.payment_history_change_sets(shop_id,revision,change_count,changes_digest) values(p_shop,p_revision,n,digest);
end;$$;$definition$;
  elsif catalog_now is distinct from catalog_before then
   raise exception using errcode='55000',message='payment_history_seal_reference_metadata_changed';
  end if;
 end loop;
 select to_jsonb(p) into after_function from pg_catalog.pg_proc p
  where p.oid='app_private.payment_history_seal_revision_v1(uuid,bigint)'::regprocedure;
 if (after_function-'prosrc') is distinct from (before_function-'prosrc')
    or encode(extensions.digest(convert_to(after_function->>'prosrc','UTF8'),'sha256'),'hex')
       is distinct from '830d71506150224fdc886653ba59bbd579f708190e7dcab632e18ce487cfcb57'
    or (select to_jsonb(p) from pg_catalog.pg_proc p
      where p.oid='app_private.payment_history_replica_payload_v1(uuid,text,uuid)'::regprocedure) is distinct from before_payload then
  raise exception using errcode='55000',message='payment_history_seal_metadata_changed';
 end if;
end;
$migration$;
