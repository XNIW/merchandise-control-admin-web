-- TASK-056: Master Console shop profile update.
-- Additive only. No production apply from Codex.

create or replace function app_private.task056_platform_audit(
  p_actor_profile_id uuid,
  p_scope text,
  p_shop_id uuid,
  p_event_key text,
  p_severity text,
  p_result text,
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_code text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
begin
  insert into public.audit_logs (
    actor_profile_id,
    scope,
    shop_id,
    event_key,
    severity,
    result,
    target_type,
    target_id,
    metadata_redacted
  )
  values (
    p_actor_profile_id,
    p_scope,
    p_shop_id,
    p_event_key,
    p_severity,
    p_result,
    p_target_type,
    p_target_id,
    jsonb_strip_nulls(
      jsonb_build_object(
        'reason_redacted', nullif(left(btrim(coalesce(p_reason, '')), 240), ''),
        'code', p_code,
        'source', 'TASK-056'
      ) || coalesce(p_metadata, '{}'::jsonb)
    )
  )
  returning audit_log_id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.platform_update_shop_profile(
  p_shop_id uuid,
  p_shop_name text,
  p_company_rut text,
  p_business_giro text,
  p_business_address text,
  p_business_city text,
  p_legal_representative_rut text,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  audit_event_id uuid;
  changed_fields jsonb := '[]'::jsonb;
  normalized_business_address text := btrim(coalesce(p_business_address, ''));
  normalized_business_city text := btrim(coalesce(p_business_city, ''));
  normalized_business_giro text := btrim(coalesce(p_business_giro, ''));
  normalized_company_rut text := app_private.task051_normalize_rut(p_company_rut);
  normalized_confirmation text := upper(btrim(coalesce(p_confirmation, '')));
  normalized_legal_representative_rut text := app_private.task051_normalize_rut(p_legal_representative_rut);
  normalized_shop_name text := upper(btrim(coalesce(p_shop_name, '')));
  redacted_reason text := btrim(coalesce(p_reason, ''));
  target_shop public.shops%rowtype;
begin
  if actor_id is null or not app_private.is_platform_admin() then
    return app_private.platform_action_result(false, 'unauthorized');
  end if;

  select * into target_shop from public.shops where shop_id = p_shop_id for update;

  if not found then
    return app_private.platform_action_result(false, 'shop_not_found');
  end if;

  if length(normalized_shop_name) = 0
    or normalized_company_rut !~ '^[0-9]{1,8}-[0-9K]$'
    or length(normalized_business_giro) = 0
    or length(normalized_business_address) = 0
    or length(normalized_business_city) = 0
    or normalized_legal_representative_rut !~ '^[0-9]{1,8}-[0-9K]$'
    or length(redacted_reason) = 0
    or normalized_confirmation <> 'UPDATE SHOP PROFILE' then
    audit_event_id := app_private.task056_platform_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.profile_update.failure',
      'warning',
      'blocked',
      'shop',
      p_shop_id::text,
      redacted_reason,
      'validation_failed',
      jsonb_build_object('event_family', 'platform.shop.profile_update')
    );

    return app_private.platform_action_result(false, 'validation_failed', p_shop_id, audit_event_id);
  end if;

  if exists (
    select 1
    from public.shops
    where company_rut = normalized_company_rut
      and shop_id <> p_shop_id
  ) then
    audit_event_id := app_private.task056_platform_audit(
      actor_id,
      'shop',
      p_shop_id,
      'platform.shop.profile_update.failure',
      'warning',
      'blocked',
      'shop',
      p_shop_id::text,
      redacted_reason,
      'duplicate_company_rut',
      jsonb_build_object('event_family', 'platform.shop.profile_update')
    );

    return app_private.platform_action_result(false, 'duplicate_company_rut', p_shop_id, audit_event_id);
  end if;

  select coalesce(jsonb_agg(field_name), '[]'::jsonb)
  into changed_fields
  from (
    values
      ('shop_name', target_shop.shop_name is distinct from normalized_shop_name),
      ('company_rut', target_shop.company_rut is distinct from normalized_company_rut),
      ('business_giro', target_shop.business_giro is distinct from normalized_business_giro),
      ('business_address', target_shop.business_address is distinct from normalized_business_address),
      ('business_city', target_shop.business_city is distinct from normalized_business_city),
      ('legal_representative_rut', target_shop.legal_representative_rut is distinct from normalized_legal_representative_rut)
  ) as field_changes(field_name, field_changed)
  where field_changed;

  update public.shops
  set shop_name = normalized_shop_name,
      company_rut = normalized_company_rut,
      business_giro = normalized_business_giro,
      business_address = normalized_business_address,
      business_city = normalized_business_city,
      legal_representative_rut = normalized_legal_representative_rut,
      fiscal_identity_locked_by_platform = true,
      fiscal_identity_updated_at = now(),
      fiscal_identity_updated_by_profile_id = actor_id,
      updated_at = now()
  where shop_id = p_shop_id;

  audit_event_id := app_private.task056_platform_audit(
    actor_id,
    'shop',
    p_shop_id,
    'platform.shop.profile_update.success',
    'info',
    'success',
    'shop',
    p_shop_id::text,
    redacted_reason,
    'success',
    jsonb_build_object(
      'changed_fields',
      changed_fields,
      'event_family',
      'platform.shop.profile_update'
    )
  );

  return app_private.platform_action_result(true, 'success', p_shop_id, audit_event_id);
exception
  when others then
    if actor_id is not null then
      audit_event_id := app_private.task056_platform_audit(
        actor_id,
        'shop',
        p_shop_id,
        'platform.shop.profile_update.failure',
        'critical',
        'failure',
        'shop',
        p_shop_id::text,
        redacted_reason,
        'db_failure',
        jsonb_build_object('event_family', 'platform.shop.profile_update')
      );
    end if;

    return app_private.platform_action_result(false, 'db_failure', p_shop_id, audit_event_id);
end;
$$;

revoke all on function app_private.task056_platform_audit(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public;
revoke all on function app_private.task056_platform_audit(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from anon;
revoke all on function app_private.task056_platform_audit(
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from authenticated;

revoke all on function public.platform_update_shop_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from public;
revoke all on function public.platform_update_shop_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from anon;
revoke all on function public.platform_update_shop_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) from authenticated;
grant execute on function public.platform_update_shop_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) to authenticated;
