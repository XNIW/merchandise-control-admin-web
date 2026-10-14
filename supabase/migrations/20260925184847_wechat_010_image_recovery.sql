-- WECHAT-010: additive replacement; original signature/ACL and native RPC remain unchanged.
create or replace function public.product_image_create_intent_wechat_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_product_id uuid,
  p_main_sha256 text,
  p_main_bytes integer,
  p_main_width integer,
  p_main_height integer,
  p_thumb_sha256 text,
  p_thumb_bytes integer,
  p_thumb_width integer,
  p_thumb_height integer,
  p_idempotency_key uuid,
  p_correlation_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_existing app_private.wechat_product_image_intent_receipts%rowtype;
  v_request_hash text;
  v_result jsonb;
  v_code text;
  v_admitted boolean;
  v_product public.inventory_products%rowtype;
  v_version public.inventory_product_image_versions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'wechat_service_role_required';
  end if;

  if p_actor_profile_id is null
    or p_shop_id is null
    or p_product_id is null
    or p_idempotency_key is null
    or p_correlation_id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  if not app_private.wechat_image_intent_actor_is_authorized_v1(
    p_actor_profile_id, p_shop_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'permission_denied',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  v_request_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'actor_profile_id', p_actor_profile_id,
      'shop_id', p_shop_id,
      'product_id', p_product_id,
      'main_sha256', p_main_sha256,
      'main_bytes', p_main_bytes,
      'main_width', p_main_width,
      'main_height', p_main_height,
      'thumb_sha256', p_thumb_sha256,
      'thumb_bytes', p_thumb_bytes,
      'thumb_width', p_thumb_width,
      'thumb_height', p_thumb_height,
      'correlation_id', p_correlation_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'wechat-product-image-intent:' || p_shop_id::text || ':'
      || p_actor_profile_id::text || ':' || p_idempotency_key::text,
    0
  ));

  -- Preserve a thirty-day retry horizon while bounding long-lived receipt
  -- storage. The cleanup path is private, serialized and can delete only rows
  -- that the append-only trigger independently recognizes as expired.
  perform app_private.cleanup_wechat_image_intent_receipts_v1(100);

  select receipt.* into v_existing
  from app_private.wechat_product_image_intent_receipts receipt
  where receipt.shop_id = p_shop_id
    and receipt.actor_profile_id = p_actor_profile_id
    and receipt.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.request_hash = v_request_hash then
      if not app_private.wechat_image_intent_actor_is_authorized_v1(
        p_actor_profile_id, p_shop_id
      ) then
        return jsonb_build_object(
          'ok', false,
          'code', 'permission_denied',
          'correlation_id', p_correlation_id,
          'replayed', false
        );
      end if;
      if v_existing.result->>'code' in ('upload_required', 'checksum_noop') then
        if coalesce(v_existing.result->>'version_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          return jsonb_build_object('ok', false, 'code', 'invalid_state',
            'correlation_id', p_correlation_id, 'replayed', false);
        end if;
        -- Match canonical product -> version lock order. Classify only after
        -- concurrent finalize/removal commits, without a status-filtered scan.
        select product.* into v_product from public.inventory_products product
        where product.id = p_product_id and product.shop_id = p_shop_id
        for share;
        if not found or v_product.deleted_at is not null then
          return jsonb_build_object('ok', false, 'code', 'invalid_state',
            'correlation_id', p_correlation_id, 'replayed', false);
        end if;
        select version.* into v_version
        from public.inventory_product_image_versions version
        where version.id = (v_existing.result->>'version_id')::uuid
          and version.shop_id = p_shop_id and version.product_id = p_product_id
        for share;
        if not found then
          return jsonb_build_object('ok', false, 'code', 'invalid_state',
            'correlation_id', p_correlation_id, 'replayed', false);
        end if;
        -- Never revive a removed/superseded image.
        if v_version.status = 'ready'
          and v_product.primary_image_version_id = v_version.id then
          return v_existing.result || jsonb_build_object(
            'code', 'checksum_noop', 'status', 'noop', 'replayed', true);
        end if;
        if v_version.status <> 'pending'
          or v_version.expires_at <= statement_timestamp()
          or v_existing.result->>'code' <> 'upload_required' then
          return jsonb_build_object('ok', false, 'code', 'invalid_state',
            'correlation_id', p_correlation_id, 'replayed', false);
        end if;
      end if;
      return v_existing.result || jsonb_build_object('replayed', true);
    end if;

    v_admitted := app_private.wechat_image_intent_attempt_admit_v1(
      p_actor_profile_id, p_shop_id
    );
    if v_admitted then
      perform app_private.write_product_image_audit(
        p_actor_profile_id,
        p_shop_id,
        'shop.product_image.intent_idempotency_conflict',
        'warning',
        'blocked',
        p_product_id,
        null,
        'idempotency_conflict',
        'personal_account',
        jsonb_build_object('correlation_id', p_correlation_id)
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'idempotency_conflict',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  -- Every fresh request, including invalid and unknown-product requests, must
  -- win bounded actor and shop admission before the legacy product lookup can
  -- audit or allocate durable state. Exact successful replay skips this step.
  v_admitted := app_private.wechat_image_intent_attempt_admit_v1(
    p_actor_profile_id, p_shop_id
  );
  if not v_admitted then
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'permission_denied',
        'correlation_id', p_correlation_id,
        'replayed', false
      );
    end if;
    return jsonb_build_object(
      'ok', false,
      'code', 'rate_limited',
      'correlation_id', p_correlation_id,
      'replayed', false
    );
  end if;

  v_result := app_private.product_image_create_intent_unlocked_legacy_v1(
    p_actor_profile_id,
    'personal_account',
    p_shop_id,
    p_product_id,
    p_main_sha256,
    p_main_bytes,
    p_main_width,
    p_main_height,
    p_thumb_sha256,
    p_thumb_bytes,
    p_thumb_width,
    p_thumb_height
  );
  v_code := coalesce(nullif(v_result->>'code', ''), 'backend_unavailable');
  v_result := v_result || jsonb_build_object(
    'correlation_id', p_correlation_id,
    'replayed', false
  );

  -- Permission and rate denials can change after revocation/window expiry, and
  -- infrastructure failures must remain retryable with the same key.
  if coalesce((v_result->>'ok')::boolean, false)
    and v_code in ('checksum_noop', 'upload_required') then
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      raise exception 'image intent authorization lease lost'
        using errcode = '40001';
    end if;

    insert into app_private.wechat_product_image_intent_receipts (
      shop_id,
      actor_profile_id,
      idempotency_key,
      correlation_id,
      product_id,
      request_hash,
      result
    ) values (
      p_shop_id,
      p_actor_profile_id,
      p_idempotency_key,
      p_correlation_id,
      p_product_id,
      v_request_hash,
      v_result
    );
  else
    if not app_private.wechat_image_intent_actor_is_authorized_v1(
      p_actor_profile_id, p_shop_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'code', 'permission_denied',
        'correlation_id', p_correlation_id,
        'replayed', false
      );
    end if;
  end if;

  return v_result;
end;
$$;
