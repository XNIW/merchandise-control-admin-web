-- Storefront v1 / TASK-008
--
-- Shop-scoped promotion control plane. Public pricing continues to be resolved
-- by the versioned Storefront contract; this boundary only authors approved
-- promotion rows and never grants mobile clients direct table access.

begin;

create extension if not exists pg_cron;

create or replace function app_private.storefront_promotion_effective_status_v1(
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_at timestamptz
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select case
    when p_status in ('draft', 'paused', 'ended') then p_status
    when p_ends_at <= p_at then 'ended'
    when p_starts_at <= p_at then 'active'
    else 'scheduled'
  end;
$$;

create or replace function app_private.storefront_promotion_reconcile_v1(
  p_shop_id uuid default null,
  p_at timestamptz default statement_timestamp()
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_updated integer := 0;
begin
  if p_at is null then
    raise exception 'promotion reconciliation timestamp is required'
      using errcode = '22004';
  end if;

  update public.storefront_promotions promotion
  set publication_status =
        app_private.storefront_promotion_effective_status_v1(
          promotion.publication_status,
          promotion.starts_at,
          promotion.ends_at,
          p_at
        )
  where promotion.publication_status in ('scheduled', 'active')
    and (p_shop_id is null or promotion.shop_id = p_shop_id)
    and promotion.publication_status <>
      app_private.storefront_promotion_effective_status_v1(
        promotion.publication_status,
        promotion.starts_at,
        promotion.ends_at,
        p_at
      );
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function app_private.storefront_promotion_effective_status_v1(
  text, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function app_private.storefront_promotion_reconcile_v1(
  uuid, timestamptz
) from public, anon, authenticated, service_role;

select cron.schedule(
  'storefront-promotion-reconcile-v1',
  '* * * * *',
  'select app_private.storefront_promotion_reconcile_v1(null, statement_timestamp());'
);

create or replace function public.admin_storefront_promotions_read_v1(
  p_shop_id uuid,
  p_query text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_rows jsonb := '[]'::jsonb;
  v_publications jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_now timestamptz := statement_timestamp();
begin
  if p_shop_id is null
    or octet_length(coalesce(v_query, '')) > 160
    or coalesce(p_page, 0) not between 1 and 10000
    or coalesce(p_page_size, 0) not between 1 and 100
    or (p_status is not null and p_status not in (
      'draft', 'scheduled', 'active', 'paused', 'ended'
    )) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  perform app_private.storefront_promotion_reconcile_v1(p_shop_id, v_now);

  with filtered as materialized (
    select
      promotion.*,
      app_private.storefront_promotion_effective_status_v1(
        promotion.publication_status,
        promotion.starts_at,
        promotion.ends_at,
        v_now
      ) as effective_status,
      coalesce((
        select array_agg(link.publication_id order by link.publication_id)
        from public.storefront_promotion_products link
        where link.shop_id = p_shop_id
          and link.promotion_id = promotion.id
      ), '{}'::uuid[]) as publication_ids,
      coalesce((
        select array_agg(link.publication_id order by link.publication_id)
        from public.storefront_promotion_products link
        where link.shop_id = p_shop_id
          and link.promotion_id = promotion.id
          and link.excluded
      ), '{}'::uuid[]) as excluded_publication_ids,
      (
        select count(distinct link.publication_id)::integer
        from public.storefront_promotion_products link
        where link.shop_id = p_shop_id
          and link.promotion_id = promotion.id
          and not link.excluded
          and exists (
            select 1
            from public.storefront_promotion_products other_link
            join public.storefront_promotions other_promotion
              on other_promotion.shop_id = other_link.shop_id
             and other_promotion.id = other_link.promotion_id
            where other_link.shop_id = p_shop_id
              and other_link.publication_id = link.publication_id
              and not other_link.excluded
              and other_promotion.id <> promotion.id
              and other_promotion.publication_status in ('scheduled', 'active')
              and promotion.publication_status in ('scheduled', 'active')
              and other_promotion.starts_at < promotion.ends_at
              and promotion.starts_at < other_promotion.ends_at
          )
      ) as conflict_product_count
    from public.storefront_promotions promotion
    where promotion.shop_id = p_shop_id
      and (p_status is null or
        app_private.storefront_promotion_effective_status_v1(
          promotion.publication_status,
          promotion.starts_at,
          promotion.ends_at,
          v_now
        ) = p_status)
      and (v_query is null or concat_ws(
        ' ', promotion.public_name, promotion.public_description
      ) ilike '%' || replace(replace(v_query, '%', '\\%'), '_', '\\_') || '%')
  ), counted as (
    select count(*)::integer as total from filtered
  ), paged as (
    select * from filtered
    order by starts_at desc, priority desc, id
    offset (p_page - 1) * p_page_size
    limit p_page_size
  )
  select
    coalesce((select total from counted), 0),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', paged.id,
      'publicName', paged.public_name,
      'publicDescription', paged.public_description,
      'publicationStatus', paged.publication_status,
      'effectiveStatus', paged.effective_status,
      'discountType', paged.discount_type,
      'discountValue', paged.discount_value,
      'priority', paged.priority,
      'startsAt', paged.starts_at,
      'endsAt', paged.ends_at,
      'publicationIds', to_jsonb(paged.publication_ids),
      'excludedPublicationIds', to_jsonb(paged.excluded_publication_ids),
      'productCount', cardinality(paged.publication_ids),
      'excludedCount', cardinality(paged.excluded_publication_ids),
      'conflictProductCount', paged.conflict_product_count,
      'updatedAt', paged.updated_at
    ) order by paged.starts_at desc, paged.priority desc, paged.id) from paged),
    '[]'::jsonb)
  into v_total, v_rows;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', publication.id,
    'name', publication.public_name,
    'status', publication.publication_status,
    'retailPriceClp', publication.retail_price_clp
  ) order by lower(publication.public_name), publication.id), '[]'::jsonb)
  into v_publications
  from (
    select publication.*
    from public.storefront_product_publications publication
    where publication.shop_id = p_shop_id
      and publication.publication_status <> 'ended'
    order by lower(publication.public_name), publication.id
    limit 500
  ) publication;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.view', p_staff_id, p_staff_web_session_id,
    p_session_token_hash, p_expected_credential_version
  ) then
    raise exception 'Storefront Admin authorization expired before promotion read'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'shop_id', p_shop_id,
    'rows', v_rows,
    'publications', v_publications,
    'conflictRule', 'lowest_effective_price_then_priority_then_uuid',
    'evaluatedAt', v_now,
    'pagination', jsonb_build_object(
      'page', p_page,
      'pageSize', p_page_size,
      'total', v_total,
      'totalPages', greatest(1, ceil(v_total::numeric / p_page_size)::integer)
    )
  );
exception
  when insufficient_privilege then
    return jsonb_build_object(
      'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
    );
end;
$$;

create or replace function public.admin_storefront_promotion_mutate_v1(
  p_shop_id uuid,
  p_operation text,
  p_payload jsonb,
  p_staff_id uuid default null,
  p_staff_web_session_id uuid default null,
  p_session_token_hash text default null,
  p_expected_credential_version integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_promotion_id uuid;
  v_public_name text;
  v_public_description text;
  v_requested_status text;
  v_status text;
  v_discount_type text;
  v_discount_value bigint;
  v_priority integer;
  v_time_zone text;
  v_starts_at_text text;
  v_ends_at_text text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_publication_ids uuid[] := '{}'::uuid[];
  v_excluded_ids uuid[] := '{}'::uuid[];
  v_before jsonb := 'null'::jsonb;
  v_after jsonb := 'null'::jsonb;
  v_actor_staff_id uuid;
  v_actor_profile_id uuid;
  v_audit_id uuid;
  v_now timestamptz := statement_timestamp();
begin
  if p_shop_id is null
    or p_operation <> 'upsert'
    or jsonb_typeof(coalesce(p_payload, 'null'::jsonb)) <> 'object'
    or pg_column_size(p_payload) > 131072 then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  if not app_private.storefront_admin_authorized_v1(
    p_shop_id, 'storefront.promotions.manage', p_staff_id,
    p_staff_web_session_id, p_session_token_hash,
    p_expected_credential_version
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'permission_denied', 'shop_id', p_shop_id
    );
  end if;

  v_actor_staff_id := case when auth.role() = 'service_role' then p_staff_id end;
  v_actor_profile_id := case when auth.role() = 'authenticated' then auth.uid() end;

  begin
    v_promotion_id := nullif(p_payload->>'promotionId', '')::uuid;
    v_public_name := regexp_replace(
      btrim(coalesce(p_payload->>'publicName', '')), '\s+', ' ', 'g'
    );
    v_public_description := nullif(
      btrim(coalesce(p_payload->>'publicDescription', '')), ''
    );
    v_requested_status := coalesce(
      nullif(p_payload->>'publicationStatus', ''), 'draft'
    );
    v_discount_type := nullif(p_payload->>'discountType', '');
    v_discount_value := (p_payload->>'discountValue')::bigint;
    v_priority := coalesce(nullif(p_payload->>'priority', '')::integer, 0);
    v_time_zone := coalesce(nullif(p_payload->>'timeZone', ''), 'America/Santiago');
    v_starts_at_text := nullif(p_payload->>'startsAt', '');
    v_ends_at_text := nullif(p_payload->>'endsAt', '');
    if v_time_zone not in ('America/Santiago', 'UTC') then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    end if;
    v_starts_at := case
      when v_starts_at_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
        then v_starts_at_text::timestamptz
      else v_starts_at_text::timestamp at time zone v_time_zone
    end;
    v_ends_at := case
      when v_ends_at_text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
        then v_ends_at_text::timestamptz
      else v_ends_at_text::timestamp at time zone v_time_zone
    end;

    select coalesce(array_agg(value::uuid order by value), '{}'::uuid[])
    into v_publication_ids
    from jsonb_array_elements_text(
      coalesce(p_payload->'publicationIds', '[]'::jsonb)
    ) value;
    select coalesce(array_agg(value::uuid order by value), '{}'::uuid[])
    into v_excluded_ids
    from jsonb_array_elements_text(
      coalesce(p_payload->'excludedPublicationIds', '[]'::jsonb)
    ) value;

    if length(v_public_name) not between 1 and 160
      or coalesce(length(v_public_description), 0) > 2000
      or v_requested_status not in ('draft', 'scheduled', 'active', 'paused', 'ended')
      or v_discount_type not in ('fixed_price_clp', 'percentage_bps')
      or v_starts_at >= v_ends_at
      or v_priority not between -100000 and 100000
      or cardinality(v_publication_ids) > 500
      or cardinality(v_excluded_ids) > cardinality(v_publication_ids)
      or not v_excluded_ids <@ v_publication_ids
      or cardinality(v_publication_ids) <> (
        select count(distinct id)::integer from unnest(v_publication_ids) id
      )
      or cardinality(v_excluded_ids) <> (
        select count(distinct id)::integer from unnest(v_excluded_ids) id
      )
      or (v_discount_type = 'fixed_price_clp'
        and v_discount_value not between 0 and 999999999999)
      or (v_discount_type = 'percentage_bps'
        and v_discount_value not between 1 and 10000)
      or (v_requested_status in ('scheduled', 'active')
        and cardinality(v_publication_ids) - cardinality(v_excluded_ids) < 1) then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    end if;

    if cardinality(v_publication_ids) <> (
      select count(*)::integer
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.id = any(v_publication_ids)
    ) then
      return jsonb_build_object(
        'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
      );
    end if;

    if v_discount_type = 'fixed_price_clp' and exists (
      select 1
      from public.storefront_product_publications publication
      where publication.shop_id = p_shop_id
        and publication.id = any(v_publication_ids)
        and not publication.id = any(v_excluded_ids)
        and publication.retail_price_clp <= v_discount_value
    ) then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    end if;

    v_status := case
      when v_requested_status in ('scheduled', 'active') then
        app_private.storefront_promotion_effective_status_v1(
          v_requested_status, v_starts_at, v_ends_at, v_now
        )
      else v_requested_status
    end;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'storefront-promotion-admin:' || p_shop_id::text,
        0
      )
    );

    if v_promotion_id is not null then
      perform 1
      from public.storefront_promotions promotion
      where promotion.shop_id = p_shop_id
        and promotion.id = v_promotion_id
      for update;
      if not found then
        return jsonb_build_object(
          'ok', false, 'code', 'not_found', 'shop_id', p_shop_id
        );
      end if;

      select jsonb_build_object(
        'id', promotion.id,
        'publicName', promotion.public_name,
        'publicationStatus', promotion.publication_status,
        'discountType', promotion.discount_type,
        'discountValue', promotion.discount_value,
        'priority', promotion.priority,
        'startsAt', promotion.starts_at,
        'endsAt', promotion.ends_at,
        'publicationIds', coalesce((select jsonb_agg(link.publication_id order by link.publication_id)
          from public.storefront_promotion_products link
          where link.shop_id = p_shop_id and link.promotion_id = promotion.id), '[]'::jsonb),
        'excludedPublicationIds', coalesce((select jsonb_agg(link.publication_id order by link.publication_id)
          from public.storefront_promotion_products link
          where link.shop_id = p_shop_id and link.promotion_id = promotion.id
            and link.excluded), '[]'::jsonb)
      ) into v_before
      from public.storefront_promotions promotion
      where promotion.shop_id = p_shop_id
        and promotion.id = v_promotion_id;

      update public.storefront_promotions promotion
      set public_name = v_public_name,
          public_description = v_public_description,
          publication_status = v_status,
          discount_type = v_discount_type,
          discount_value = v_discount_value,
          priority = v_priority,
          starts_at = v_starts_at,
          ends_at = v_ends_at,
          updated_by_profile_id = v_actor_profile_id
      where promotion.shop_id = p_shop_id
        and promotion.id = v_promotion_id;
    else
      insert into public.storefront_promotions (
        shop_id, public_name, public_description, publication_status,
        discount_type, discount_value, priority, starts_at, ends_at,
        updated_by_profile_id
      ) values (
        p_shop_id, v_public_name, v_public_description, v_status,
        v_discount_type, v_discount_value, v_priority, v_starts_at, v_ends_at,
        v_actor_profile_id
      ) returning id into v_promotion_id;
    end if;

    delete from public.storefront_promotion_products link
    where link.shop_id = p_shop_id
      and link.promotion_id = v_promotion_id;

    insert into public.storefront_promotion_products (
      shop_id, promotion_id, publication_id, excluded,
      created_by_profile_id
    )
    select
      p_shop_id,
      v_promotion_id,
      publication_id,
      publication_id = any(v_excluded_ids),
      v_actor_profile_id
    from unnest(v_publication_ids) publication_id;

    select jsonb_build_object(
      'id', promotion.id,
      'publicName', promotion.public_name,
      'publicationStatus', promotion.publication_status,
      'discountType', promotion.discount_type,
      'discountValue', promotion.discount_value,
      'priority', promotion.priority,
      'startsAt', promotion.starts_at,
      'endsAt', promotion.ends_at,
      'publicationIds', to_jsonb(v_publication_ids),
      'excludedPublicationIds', to_jsonb(v_excluded_ids)
    ) into v_after
    from public.storefront_promotions promotion
    where promotion.shop_id = p_shop_id
      and promotion.id = v_promotion_id;

    if not app_private.storefront_admin_authorized_v1(
      p_shop_id, 'storefront.promotions.manage', p_staff_id,
      p_staff_web_session_id, p_session_token_hash,
      p_expected_credential_version
    ) then
      raise exception 'Storefront Admin authorization expired before promotion write'
        using errcode = '42501';
    end if;

    insert into public.audit_logs (
      actor_profile_id, actor_staff_id, scope, shop_id, event_key,
      severity, result, target_type, target_id, metadata_redacted
    ) values (
      v_actor_profile_id,
      v_actor_staff_id,
      'shop',
      p_shop_id,
      'shop.storefront.promotion.upsert.success',
      'info',
      'success',
      'storefront_promotion',
      v_promotion_id::text,
      jsonb_build_object(
        'code', 'success',
        'source', 'storefront_admin',
        'operation', p_operation,
        'before', coalesce(v_before, 'null'::jsonb),
        'after', coalesce(v_after, 'null'::jsonb),
        'updatedCount', 1,
        'conflictRule', 'lowest_effective_price_then_priority_then_uuid'
      )
    ) returning audit_log_id into v_audit_id;

    return jsonb_build_object(
      'ok', true,
      'code', 'success',
      'shop_id', p_shop_id,
      'target_id', v_promotion_id,
      'audit_event_id', v_audit_id,
      'payload', jsonb_build_object(
        'status', v_status,
        'productCount', cardinality(v_publication_ids),
        'excludedCount', cardinality(v_excluded_ids)
      )
    );
  exception
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or foreign_key_violation or not_null_violation
      or invalid_datetime_format or invalid_parameter_value then
      return jsonb_build_object(
        'ok', false, 'code', 'validation_failed', 'shop_id', p_shop_id
      );
    when unique_violation then
      return jsonb_build_object(
        'ok', false, 'code', 'conflict', 'shop_id', p_shop_id
      );
    when insufficient_privilege then
      return jsonb_build_object(
        'ok', false, 'code', 'session_expired', 'shop_id', p_shop_id
      );
  end;
end;
$$;

revoke all on function public.admin_storefront_promotions_read_v1(
  uuid, text, text, integer, integer, uuid, uuid, text, integer
) from public, anon;
revoke all on function public.admin_storefront_promotion_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) from public, anon;
grant execute on function public.admin_storefront_promotions_read_v1(
  uuid, text, text, integer, integer, uuid, uuid, text, integer
) to authenticated, service_role;
grant execute on function public.admin_storefront_promotion_mutate_v1(
  uuid, text, jsonb, uuid, uuid, text, integer
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
