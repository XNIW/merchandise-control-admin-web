-- Preserve the UTF-16 field framing and UTF-8 digest protocol. In UTF8 only,
-- byte length equals character length exactly for ASCII, including empty text.
-- Unicode retains the original per-code-point calculation byte for byte.
-- This atomically replaces only the reviewed body; no ACL or caller changes.
do $migration$
declare before_function jsonb;after_function jsonb;
begin
 if current_setting('server_encoding') <> 'UTF8' then
  raise exception using errcode='55000',message='payment_history_field_hash_encoding_mismatch';
 end if;
 select to_jsonb(p) into before_function from pg_catalog.pg_proc p
  where p.oid='app_private.payment_history_field_hash_v1(text[])'::regprocedure;
 if before_function is null or encode(extensions.digest(convert_to(before_function->>'prosrc','UTF8'),'sha256'),'hex')
    is distinct from '69cd72ed4474105a1c70a8000f7e39aecf7d15cdbdc5e10ad2f4a194aa1bda87' then
  raise exception using errcode='55000',message='payment_history_field_hash_preimage_mismatch';
 end if;
 execute $definition$create or replace function app_private.payment_history_field_hash_v1(p_fields text[]) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(coalesce(string_agg(
   coalesce(case when octet_length(coalesce(f,''))=length(coalesce(f,'')) then length(f)
     else (select sum(case when ascii(substr(coalesce(f,''),n,1))>65535 then 2 else 1 end)
      from generate_series(1,length(coalesce(f,''))) n) end,0)::text||':'||coalesce(f,''),'' order by ord),''),'UTF8'),'sha256'),'hex')
 from unnest(p_fields) with ordinality x(f,ord);
$$;$definition$;
 select to_jsonb(p) into after_function from pg_catalog.pg_proc p
  where p.oid='app_private.payment_history_field_hash_v1(text[])'::regprocedure;
 if (after_function-'prosrc') is distinct from (before_function-'prosrc')
    or encode(extensions.digest(convert_to(after_function->>'prosrc','UTF8'),'sha256'),'hex')
       is distinct from 'e7d56862979190a43884c2607cf774a28935d4dbdd4e104e0e5a62b99a538f42' then
  raise exception using errcode='55000',message='payment_history_field_hash_metadata_changed';
 end if;
end;
$migration$;
