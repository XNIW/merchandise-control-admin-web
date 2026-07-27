-- TASK-142 — catalog_text_policy_v1 authoritative write boundary.
-- Existing-row repair is intentionally excluded: it is a separately backed-up,
-- staging-only operation after this migration has passed review and CI.

create or replace function app_private.catalog_text_utf16_length_v1(p_value text)
returns integer
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_codepoint integer;
  v_index integer;
  v_length integer := 0;
begin
  for v_index in 1..char_length(p_value)
  loop
    v_codepoint := ascii(substr(p_value, v_index, 1));
    v_length := v_length + case when v_codepoint > 65535 then 2 else 1 end;
  end loop;

  return v_length;
end;
$$;

create or replace function app_private.catalog_display_text_v1(
  p_value text,
  p_max_utf16 integer,
  p_required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_codepoint integer;
  v_index integer;
  v_spaces text :=
    chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8239) || chr(8287) || chr(12288);
  v_value text := normalize(coalesce(p_value, ''), NFC);
begin
  if p_max_utf16 < 0 then
    raise exception using
      errcode = '22023',
      message = 'catalog_text_policy_v1 invalid length configuration';
  end if;

  v_value := replace(v_value, chr(13) || chr(10), ' ');
  v_value := replace(v_value, chr(13), ' ');
  v_value := replace(v_value, chr(10), ' ');
  v_value := replace(v_value, chr(9), ' ');
  v_value := translate(v_value, v_spaces, repeat(' ', char_length(v_spaces)));
  v_value := regexp_replace(v_value, ' {2,}', ' ', 'g');
  v_value := btrim(v_value, ' ');

  for v_index in 1..char_length(v_value)
  loop
    v_codepoint := ascii(substr(v_value, v_index, 1));

    if (v_codepoint between 0 and 31)
       or (v_codepoint between 127 and 159)
       or v_codepoint in (8232, 8233, 8203, 8288, 65279)
       or (v_codepoint between 8234 and 8238)
       or (v_codepoint between 8294 and 8297) then
      raise exception using
        errcode = '23514',
        message = 'catalog_text_policy_v1 rejected display text';
    end if;
  end loop;

  if p_required and v_value = '' then
    raise exception using
      errcode = '23514',
      message = 'catalog_text_policy_v1 rejected empty required display text';
  end if;

  if app_private.catalog_text_utf16_length_v1(v_value) > p_max_utf16 then
    raise exception using
      errcode = '23514',
      message = 'catalog_text_policy_v1 rejected over-limit display text';
  end if;

  return v_value;
end;
$$;

create or replace function app_private.catalog_identity_text_v1(
  p_value text,
  p_max_utf16 integer,
  p_required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_codepoint integer;
  v_index integer;
  v_trim_chars text :=
    ' ' || chr(160) || chr(5760) ||
    chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
    chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) ||
    chr(8202) || chr(8239) || chr(8287) || chr(12288);
  v_value text := coalesce(p_value, '');
begin
  if p_max_utf16 < 0 then
    raise exception using
      errcode = '22023',
      message = 'catalog_text_policy_v1 invalid length configuration';
  end if;

  for v_index in 1..char_length(v_value)
  loop
    v_codepoint := ascii(substr(v_value, v_index, 1));

    if (v_codepoint between 0 and 31)
       or (v_codepoint between 127 and 159)
       or v_codepoint in (8232, 8233, 8203, 8204, 8205, 8288, 65279)
       or (v_codepoint between 8234 and 8238)
       or (v_codepoint between 8294 and 8297) then
      raise exception using
        errcode = '23514',
        message = 'catalog_text_policy_v1 rejected identity text';
    end if;
  end loop;

  v_value := btrim(v_value, v_trim_chars);

  if p_required and v_value = '' then
    raise exception using
      errcode = '23514',
      message = 'catalog_text_policy_v1 rejected empty required identity text';
  end if;

  if app_private.catalog_text_utf16_length_v1(v_value) > p_max_utf16 then
    raise exception using
      errcode = '23514',
      message = 'catalog_text_policy_v1 rejected over-limit identity text';
  end if;

  return v_value;
end;
$$;

create or replace function app_private.enforce_catalog_text_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'inventory_categories' then
    new.name := app_private.catalog_display_text_v1(new.name, 160, true);
  elsif tg_table_name = 'inventory_suppliers' then
    new.name := app_private.catalog_display_text_v1(new.name, 160, true);
  elsif tg_table_name = 'inventory_products' then
    new.barcode := app_private.catalog_identity_text_v1(new.barcode, 96, true);
    new.item_number := nullif(
      app_private.catalog_identity_text_v1(new.item_number, 120, false),
      ''
    );
    new.product_name := nullif(
      app_private.catalog_display_text_v1(new.product_name, 240, false),
      ''
    );
    new.second_product_name := nullif(
      app_private.catalog_display_text_v1(new.second_product_name, 240, false),
      ''
    );
    new.product_name := coalesce(
      new.product_name,
      new.second_product_name,
      new.item_number
    );

    if new.product_name is null then
      raise exception using
        errcode = '23514',
        message = 'catalog_text_policy_v1 rejected product without display fallback';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.catalog_text_utf16_length_v1(text)
  from public, anon, authenticated;
revoke all on function app_private.catalog_display_text_v1(text, integer, boolean)
  from public, anon, authenticated;
revoke all on function app_private.catalog_identity_text_v1(text, integer, boolean)
  from public, anon, authenticated;
revoke all on function app_private.enforce_catalog_text_policy_v1()
  from public, anon, authenticated;

drop trigger if exists catalog_text_00_policy_v1
  on public.inventory_categories;
create trigger catalog_text_00_policy_v1
  before insert or update of name, deleted_at, shop_id
  on public.inventory_categories
  for each row
  execute function app_private.enforce_catalog_text_policy_v1();

drop trigger if exists catalog_text_00_policy_v1
  on public.inventory_suppliers;
create trigger catalog_text_00_policy_v1
  before insert or update of name, deleted_at, shop_id
  on public.inventory_suppliers
  for each row
  execute function app_private.enforce_catalog_text_policy_v1();

drop trigger if exists catalog_text_00_policy_v1
  on public.inventory_products;
create trigger catalog_text_00_policy_v1
  before insert or update of
    barcode, item_number, product_name, second_product_name, deleted_at, shop_id
  on public.inventory_products
  for each row
  execute function app_private.enforce_catalog_text_policy_v1();
