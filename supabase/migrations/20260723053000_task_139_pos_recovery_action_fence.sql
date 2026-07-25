-- TASK-139: authorize, resolve the target and append the recovery audit in one
-- transaction. Row locks turn profile/shop/membership revocation into a
-- publication fence instead of a service-role TOCTOU window.

begin;

create or replace function public.shop_pos_recovery_action_v1(
  p_actor_profile_id uuid,
  p_shop_id uuid,
  p_action_type text,
  p_target_type text,
  p_target_id text,
  p_note_redacted text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_audit_id uuid;
  v_target_metadata jsonb;
begin
  if p_actor_profile_id is null
    or p_shop_id is null
    or p_action_type not in ('add_note', 'mark_reviewed', 'request_pos_retry')
    or p_target_type not in (
      'pos_sale', 'pos_sale_stock_movement', 'pos_sales_sync_batch', 'pos_shop'
    )
    or coalesce(octet_length(p_target_id), 0) not between 1 and 160
    or octet_length(coalesce(p_note_redacted, '')) > 2400
    or (p_action_type = 'add_note'
      and coalesce(length(btrim(p_note_redacted)), 0) = 0) then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  end if;

  perform 1
  from public.profiles profile
  where profile.profile_id = p_actor_profile_id
    and profile.profile_status = 'active'
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  perform 1
  from public.shops shop
  where shop.shop_id = p_shop_id
    and shop.shop_status = 'active'
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  perform 1
  from public.shop_members member
  where member.profile_id = p_actor_profile_id
    and member.shop_id = p_shop_id
    and member.membership_status = 'active'
    and member.role_key in ('shop_owner', 'shop_manager')
  for share;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'permission_denied');
  end if;

  if p_target_type = 'pos_shop' then
    if p_target_id <> p_shop_id::text then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
    v_target_metadata := jsonb_build_object('status', 'shop_scoped');
  elsif p_target_id !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
  elsif p_target_type = 'pos_sales_sync_batch' then
    select jsonb_build_object(
      'client_batch_id', batch.client_batch_id,
      'status', batch.status
    ) into v_target_metadata
    from public.pos_sales_sync_batches batch
    where batch.shop_id = p_shop_id
      and batch.pos_sales_sync_batch_id = p_target_id::uuid
    for share;
  elsif p_target_type = 'pos_sale' then
    select jsonb_build_object(
      'client_sale_id', sale.client_sale_id,
      'status', sale.status
    ) into v_target_metadata
    from public.pos_sales sale
    where sale.shop_id = p_shop_id
      and sale.pos_sale_id = p_target_id::uuid
    for share;
  else
    select jsonb_build_object(
      'movement_key', movement.movement_key,
      'status', movement.status
    ) into v_target_metadata
    from public.pos_sale_stock_movements movement
    where movement.shop_id = p_shop_id
      and movement.pos_sale_stock_movement_id = p_target_id::uuid
    for share;
  end if;

  if v_target_metadata is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  insert into public.audit_logs (
    actor_profile_id, actor_staff_id, scope, shop_id, event_key,
    severity, result, target_type, target_id, metadata_redacted
  ) values (
    p_actor_profile_id, null, 'shop', p_shop_id,
    'pos.sync.recovery.' || p_action_type || '.success',
    case when p_action_type = 'request_pos_retry' then 'warning' else 'info' end,
    'success', p_target_type, p_target_id,
    jsonb_build_object(
      'action_type', p_action_type,
      'actor_kind', 'personal_account',
      'behavior', 'append_only_audit_no_sales_stock_outbox_mutation',
      'note_redacted', nullif(btrim(coalesce(p_note_redacted, '')), ''),
      'request_pos_retry_effect', case
        when p_action_type = 'request_pos_retry'
          then 'audit_only_pos_polling_not_implemented'
        else 'not_requested'
      end,
      'source', 'admin_web_pos_sync_recovery',
      'target', v_target_metadata
    )
  ) returning audit_log_id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'success',
    'auditEventId', v_audit_id,
    'shopId', p_shop_id,
    'targetId', p_target_id
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'validation_failed');
end;
$$;

revoke all on function public.shop_pos_recovery_action_v1(
  uuid, uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.shop_pos_recovery_action_v1(
  uuid, uuid, text, text, text, text
) to service_role;

commit;
