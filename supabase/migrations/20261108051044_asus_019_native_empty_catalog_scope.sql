-- ASUS-W7POS-019: an active native shop has a canonical shop scope before
-- its first inventory row. Absence of a legacy bridge is not an empty-scope
-- authorization failure. Any mapping history still requires its existing
-- verified bridge; incomplete/disabled mappings remain fail-closed.
-- No data, grants, lease checks, publication fences or client sale-safety change.
begin;
do $patch$
declare
  v_oid oid := to_regprocedure('app_private.resolve_pos_catalog_scope_v2(uuid)');
  v_body text;
  v_new_body text;
  v_before jsonb;
  v_after jsonb;
  v_definition text;
begin
  if v_oid is null then
    raise exception using errcode = '55000', message = 'catalog scope resolver missing';
  end if;
  select prosrc, to_jsonb(proc) - 'prosrc'
    into v_body, v_before
  from pg_proc proc where oid = v_oid;
  if md5(v_body) not in (
    '9ef09cf7740e3e9c8e18e9dfa986fee0',
    'acce3e3ce2f88c86caa1a4170ec2d76e'
  ) then
    raise exception using errcode = '55000', message = 'catalog scope resolver drift';
  end if;
  v_new_body := replace(v_body, E'\r\n', E'\n');
  v_new_body := replace(v_new_body,
    '  v_has_legacy_rows boolean := false;',
    E'  v_has_legacy_rows boolean := false;\n  v_has_native_empty_scope boolean := false;'
  );
  v_new_body := replace(v_new_body,
$old$  blocked := v_has_blocking_mapping
    or (v_mapped_owner_id is null and not v_has_shop_rows);
  scope_kind := case
    when v_has_shop_rows and v_has_legacy_rows then 'authorized_shop_plus_legacy'
    when v_has_shop_rows then 'shop_scoped'$old$,
$new$  -- Re-read under the existing canonical scope-pair lock. The lease-bound
  -- caller/publication fence still validates shop, staff, device and session.
  -- Never reinterpret a disabled or incomplete legacy bridge as native-empty.
  if v_mapped_owner_id is null and not v_has_shop_rows then
    select exists (
      select 1 from public.shops shop
      where shop.shop_id = p_shop_id and shop.shop_status = 'active'
    ) and not exists (
      select 1 from public.shop_inventory_sources source
      where source.shop_id = p_shop_id
    ) into v_has_native_empty_scope;
  end if;

  blocked := v_has_blocking_mapping
    or (v_mapped_owner_id is null and not v_has_shop_rows
      and not v_has_native_empty_scope);
  scope_kind := case
    when v_has_shop_rows and v_has_legacy_rows then 'authorized_shop_plus_legacy'
    when v_has_shop_rows or v_has_native_empty_scope then 'shop_scoped'$new$
  );
  if md5(v_new_body) <> '9622c4d3a4c793a7803d730b8a8c51d4'
    or position('v_has_native_empty_scope' in v_new_body) = 0 then
    raise exception using errcode = '55000', message = 'catalog scope patch not applied';
  end if;
  v_definition := pg_get_functiondef(v_oid);
  execute replace(v_definition, v_body, v_new_body);
  select to_jsonb(proc) - 'prosrc' into v_after
  from pg_proc proc where oid = v_oid;
  if v_after is distinct from v_before then
    raise exception using errcode = '55000', message = 'catalog scope metadata changed';
  end if;
end;
$patch$;
commit;
