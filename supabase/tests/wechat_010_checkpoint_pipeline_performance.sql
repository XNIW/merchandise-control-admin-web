-- Exact scope predicate equivalence. All rows and helper copies are transaction-local.
-- Synthetic mapping-table copies exercise states canonical write guards now reject;
-- canonical tables/triggers remain enabled and the real mapping path is tested too.
begin;
select plan(32);
create temporary table scope_truth_sources(shop_id uuid,owner_user_id uuid,mapping_state text,created_at timestamptz,verified_at timestamptz,disabled_at timestamptz);
create temporary table scope_truth_values(x uuid);
insert into scope_truth_values values(null),('00000000-0000-4000-8000-000000009811'),('00000000-0000-4000-8000-000000009812'),('10000000-0000-4000-8000-000000009811'),('10000000-0000-4000-8000-000000009812');


create or replace function pg_temp.original_0(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      p_event_shop_id is not null
      and p_row_shop_id = p_event_shop_id
    )
    or (
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
      and (
        p_event_shop_id is null
        or (
          exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_event_shop_id
              and source.owner_user_id = p_event_owner_user_id
              and source.mapping_state = 'mapped'
              and source.verified_at is not null
              and pg_catalog.isfinite(source.created_at)
              and pg_catalog.isfinite(source.verified_at)
              and source.disabled_at is null
          )
          and not exists (
            select 1
            from public.shop_inventory_sources source
            where source.shop_id = p_event_shop_id
              and source.disabled_at is null
              and (
                source.mapping_state <> 'mapped'
                or source.owner_user_id is null
                or source.verified_at is null
                or not pg_catalog.isfinite(source.created_at)
                or (
                  source.verified_at is not null
                  and not pg_catalog.isfinite(source.verified_at)
                )
              )
          )
        )
      )
    );
$$;

create or replace function pg_temp.oracle_0(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (
      p_event_shop_id is not null
      and p_row_shop_id = p_event_shop_id
    )
    or (
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
      and (
        p_event_shop_id is null
        or (
          exists (
            select 1
            from pg_temp.scope_truth_sources source
            where source.shop_id = p_event_shop_id
              and source.owner_user_id = p_event_owner_user_id
              and source.mapping_state = 'mapped'
              and source.verified_at is not null
              and pg_catalog.isfinite(source.created_at)
              and pg_catalog.isfinite(source.verified_at)
              and source.disabled_at is null
          )
          and not exists (
            select 1
            from pg_temp.scope_truth_sources source
            where source.shop_id = p_event_shop_id
              and source.disabled_at is null
              and (
                source.mapping_state <> 'mapped'
                or source.owner_user_id is null
                or source.verified_at is null
                or not pg_catalog.isfinite(source.created_at)
                or (
                  source.verified_at is not null
                  and not pg_catalog.isfinite(source.verified_at)
                )
              )
          )
        )
      )
    );
$$;

do $copy$
declare definition text := pg_get_functiondef('app_private.sync_event_row_matches_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure);
begin
  if (length(definition)-length(replace(definition,'public.shop_inventory_sources','')))/length('public.shop_inventory_sources') <> 2 then
    raise exception 'unexpected scope source';
  end if;
  execute replace(replace(definition,'app_private.sync_event_row_matches_scope_v1','pg_temp.candidate_0'),'public.shop_inventory_sources','pg_temp.scope_truth_sources');
end;
$copy$;

select is((select md5(prosrc) from pg_proc where oid='pg_temp.original_0(uuid,uuid,uuid,uuid)'::regprocedure),'2d199a50c0f9c1eff464823a840b6db7','original 0 is exact frozen canonical expression');

select is((select array_agg(a::text order by a::text collate "C") from pg_proc f,lateral unnest(f.proacl) a where f.oid='app_private.sync_event_row_matches_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure),array['postgres=X/postgres'],'scope 0 remains postgres-only');

select ok((select prosecdef and not proisstrict and provolatile='s' and proconfig=array['search_path=public, pg_temp'] from pg_proc where oid='app_private.sync_event_row_matches_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure),'scope 0 security/null/stability/search-path preserved');

select is(app_private.sync_event_row_matches_scope_v1(null,'10000000-0000-4000-8000-000000009811',null,null),false,'scope 0 nonnull row shop and null event shop is false');

select is(app_private.sync_event_row_matches_scope_v1(null,'10000000-0000-4000-8000-000000009811',null,'10000000-0000-4000-8000-000000009811'),true,'scope 0 matching shops ignore null owners exactly');

select is(app_private.sync_event_row_matches_scope_v1(null,null,null,null),null::boolean,'scope 0 legacy null remains SQL null');

create or replace function pg_temp.original_1(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_event_shop_id is null then
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
    else
      p_row_shop_id = p_event_shop_id
      or (
        p_row_shop_id is null
        and exists (
          select 1
          from public.shop_inventory_sources source
          where source.shop_id = p_event_shop_id
            and source.owner_user_id = p_row_owner_user_id
            and source.mapping_state = 'mapped'
            and source.verified_at is not null
            and pg_catalog.isfinite(source.created_at)
            and pg_catalog.isfinite(source.verified_at)
            and source.disabled_at is null
        )
        and not exists (
          select 1
          from public.shop_inventory_sources source
          where source.shop_id = p_event_shop_id
            and source.disabled_at is null
            and (
              source.mapping_state <> 'mapped'
              or source.owner_user_id is null
              or source.verified_at is null
              or not pg_catalog.isfinite(source.created_at)
              or (
                source.verified_at is not null
                and not pg_catalog.isfinite(source.verified_at)
              )
            )
        )
      )
  end;
$$;

create or replace function pg_temp.oracle_1(
  p_row_owner_user_id uuid,
  p_row_shop_id uuid,
  p_event_owner_user_id uuid,
  p_event_shop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_event_shop_id is null then
      p_row_shop_id is null
      and p_row_owner_user_id = p_event_owner_user_id
    else
      p_row_shop_id = p_event_shop_id
      or (
        p_row_shop_id is null
        and exists (
          select 1
          from pg_temp.scope_truth_sources source
          where source.shop_id = p_event_shop_id
            and source.owner_user_id = p_row_owner_user_id
            and source.mapping_state = 'mapped'
            and source.verified_at is not null
            and pg_catalog.isfinite(source.created_at)
            and pg_catalog.isfinite(source.verified_at)
            and source.disabled_at is null
        )
        and not exists (
          select 1
          from pg_temp.scope_truth_sources source
          where source.shop_id = p_event_shop_id
            and source.disabled_at is null
            and (
              source.mapping_state <> 'mapped'
              or source.owner_user_id is null
              or source.verified_at is null
              or not pg_catalog.isfinite(source.created_at)
              or (
                source.verified_at is not null
                and not pg_catalog.isfinite(source.verified_at)
              )
            )
        )
      )
  end;
$$;

do $copy$
declare definition text := pg_get_functiondef('app_private.sync_relation_row_matches_event_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure);
begin
  if (length(definition)-length(replace(definition,'public.shop_inventory_sources','')))/length('public.shop_inventory_sources') <> 2 then
    raise exception 'unexpected scope source';
  end if;
  execute replace(replace(definition,'app_private.sync_relation_row_matches_event_scope_v1','pg_temp.candidate_1'),'public.shop_inventory_sources','pg_temp.scope_truth_sources');
end;
$copy$;

select is((select md5(prosrc) from pg_proc where oid='pg_temp.original_1(uuid,uuid,uuid,uuid)'::regprocedure),'0d58fbbf644d2e744fbba525d4968dd2','original 1 is exact frozen canonical expression');

select is((select array_agg(a::text order by a::text collate "C") from pg_proc f,lateral unnest(f.proacl) a where f.oid='app_private.sync_relation_row_matches_event_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure),array['postgres=X/postgres'],'scope 1 remains postgres-only');

select ok((select prosecdef and not proisstrict and provolatile='s' and proconfig=array['search_path=public, pg_temp'] from pg_proc where oid='app_private.sync_relation_row_matches_event_scope_v1(uuid,uuid,uuid,uuid)'::regprocedure),'scope 1 security/null/stability/search-path preserved');

select is(app_private.sync_relation_row_matches_event_scope_v1(null,'10000000-0000-4000-8000-000000009811',null,null),false,'scope 1 nonnull row shop and null event shop is false');

select is(app_private.sync_relation_row_matches_event_scope_v1(null,'10000000-0000-4000-8000-000000009811',null,'10000000-0000-4000-8000-000000009811'),true,'scope 1 matching shops ignore null owners exactly');

select is(app_private.sync_relation_row_matches_event_scope_v1(null,null,null,null),null::boolean,'scope 1 legacy null remains SQL null');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','2026-01-01 00:00:00+00','2026-01-02 00:00:00+00',null);

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'mapped: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'mapped: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','2026-01-01 00:00:00+00','2026-01-02 00:00:00+00','2026-01-03 00:00:00+00');

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'disabled: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'disabled: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','2026-01-01 00:00:00+00',null,null);

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'unverified: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'unverified: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','-infinity','2026-01-02 00:00:00+00',null);

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'created_nonfinite: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'created_nonfinite: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','2026-01-01 00:00:00+00','infinity',null);

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'verified_nonfinite: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'verified_nonfinite: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;insert into pg_temp.scope_truth_sources values ('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped','2026-01-01 00:00:00+00','2026-01-02 00:00:00+00',null),('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009812','ambiguous','2026-01-01 00:00:00+00',null,null);

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'ambiguous: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'ambiguous: scope 1 all 625 tuples including NULL match');

truncate pg_temp.scope_truth_sources;

select is((select count(*) filter(where pg_temp.oracle_0(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_0(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'absent: scope 0 all 625 tuples including NULL match');

select is((select count(*) filter(where pg_temp.oracle_1(a.x,b.x,c.x,d.x) is distinct from pg_temp.candidate_1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'absent: scope 1 all 625 tuples including NULL match');

insert into auth.users(instance_id,id,aud,role,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-000000009811'::uuid,'authenticated','authenticated','{}','{}',now(),now());
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000009811'::uuid,'SCOPETRUTH','Synthetic scope truth','active');
insert into public.shop_inventory_sources(shop_id,owner_user_id,mapping_state,verified_at) values('10000000-0000-4000-8000-000000009811'::uuid,'00000000-0000-4000-8000-000000009811'::uuid,'mapped',now());



select is((select count(*) filter(where pg_temp.original_0(a.x,b.x,c.x,d.x) is distinct from app_private.sync_event_row_matches_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real mapped: scope 0 all 625 tuples match canonical original');

select is((select count(*) filter(where pg_temp.original_1(a.x,b.x,c.x,d.x) is distinct from app_private.sync_relation_row_matches_event_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real mapped: scope 1 all 625 tuples match canonical original');

update public.shop_inventory_sources set disabled_at=now() where shop_id='10000000-0000-4000-8000-000000009811'::uuid;

select is((select count(*) filter(where pg_temp.original_0(a.x,b.x,c.x,d.x) is distinct from app_private.sync_event_row_matches_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real disabled: scope 0 all 625 tuples match canonical original');

select is((select count(*) filter(where pg_temp.original_1(a.x,b.x,c.x,d.x) is distinct from app_private.sync_relation_row_matches_event_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real disabled: scope 1 all 625 tuples match canonical original');

delete from public.shop_inventory_sources where shop_id='10000000-0000-4000-8000-000000009811'::uuid;

select is((select count(*) filter(where pg_temp.original_0(a.x,b.x,c.x,d.x) is distinct from app_private.sync_event_row_matches_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real absent: scope 0 all 625 tuples match canonical original');

select is((select count(*) filter(where pg_temp.original_1(a.x,b.x,c.x,d.x) is distinct from app_private.sync_relation_row_matches_event_scope_v1(a.x,b.x,c.x,d.x)) from scope_truth_values a cross join scope_truth_values b cross join scope_truth_values c cross join scope_truth_values d),0::bigint,'real absent: scope 1 all 625 tuples match canonical original');

select * from finish();
rollback;
