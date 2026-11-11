-- Bounded preparation index, not another economic ledger. Only immutable
-- source coordinates and lookup keys are stored; review reads the exact page.
create table public.payment_history_local_preparation_records (
 shop_id uuid not null,operation_id uuid not null,page_ordinal integer not null check(page_ordinal between 1 and 20000),
 record_ordinal integer not null check(record_ordinal between 1 and 200),
 kind text not null check(kind in('operation','overlap','file','binding','movement','rejected','correction','undo')),
 auxiliary_key text check(auxiliary_key ~ '^[0-9a-f]{64}$'),
 movement_ordinal integer check(movement_ordinal between 1 and 100000),
 primary key(operation_id,page_ordinal,record_ordinal),unique(operation_id,movement_ordinal),
 foreign key(shop_id,operation_id) references public.payment_history_local_publications(shop_id,operation_id),
 foreign key(operation_id,page_ordinal) references public.payment_history_local_publication_pages(operation_id,ordinal) on delete cascade,
 check((kind='movement')=(movement_ordinal is not null))
);
alter table public.payment_history_local_preparation_records enable row level security;
revoke all on public.payment_history_local_preparation_records from public,anon,authenticated,service_role;
create index payment_history_local_preparation_lookup_idx on public.payment_history_local_preparation_records(operation_id,kind,auxiliary_key);
create unique index payment_history_local_preparation_aux_unique_idx on public.payment_history_local_preparation_records(operation_id,kind,auxiliary_key)
 where kind in('operation','overlap','file','binding','correction','undo');

create function app_private.payment_history_local_preparation_index_guard_v2() returns trigger
language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' and not exists(select 1 from public.payment_history_local_publications where operation_id=old.operation_id and grant_id is not null) then return old;end if;
 raise exception using errcode='55000',message='payment_history_local_preparation_index_immutable';
end;$$;
revoke all on function app_private.payment_history_local_preparation_index_guard_v2() from public,anon,authenticated,service_role;
create trigger payment_history_local_preparation_index_guard before update or delete on public.payment_history_local_preparation_records
 for each row execute function app_private.payment_history_local_preparation_index_guard_v2();

-- Preserve the qualified immutable byte/root stage primitive. Its replacement
-- adds at most200 coordinate rows in that same transaction and operation lock.
alter function app_private.payment_history_local_stage_v2(uuid,uuid,jsonb) rename to payment_history_local_stage_pages_v2;
revoke all on function app_private.payment_history_local_stage_pages_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function app_private.payment_history_local_stage_v2(p_shop uuid,p_device uuid,p jsonb) returns jsonb
language plpgsql volatile set search_path='' as $$
declare result jsonb;op uuid;page_no integer;cached integer;offset_no integer;item record;f jsonb;key text;number integer;begin
 result:=app_private.payment_history_local_stage_pages_v2(p_shop,p_device,p);
 op:=(p->>'operation_id')::uuid;page_no:=(p->>'ordinal')::integer;
 select count(*) into cached from public.payment_history_local_preparation_records where operation_id=op and page_ordinal=page_no;
 if cached>0 then
  if cached<>jsonb_array_length((p->>'page_json')::jsonb) then raise exception using errcode='40001',message='payment_history_local_preparation_index_incomplete';end if;
  return result;
 end if;
 if exists(select 1 from public.payment_history_local_preparation_records where operation_id=op and page_ordinal>page_no) then
  raise exception using errcode='40001',message='payment_history_local_preparation_index_incomplete';end if;
 select coalesce(max(movement_ordinal),0) into offset_no from public.payment_history_local_preparation_records where operation_id=op;
 for item in select value v,ordinality n from jsonb_array_elements((p->>'page_json')::jsonb) with ordinality loop
  f:=item.v->'fields';number:=null;key:=null;
  case item.v->>'kind'
   when 'operation','overlap','undo' then key:=app_private.payment_history_field_hash_v1(array['single']);
   when 'file' then
    if f->>'id' is null or length(f->>'id') not between 1 and 256 then raise exception using errcode='22023',message='payment_history_local_preparation_key_invalid';end if;
    key:=app_private.payment_history_field_hash_v1(array[f->>'id']);
   when 'binding' then
    if coalesce(f->>'alias_key','') !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='payment_history_local_preparation_key_invalid';end if;
    key:=app_private.payment_history_field_hash_v1(array[f->>'alias_key']);
   when 'movement','correction' then
    if f->>'source_file_id' is null or f->>'source_sheet' is null or f->>'source_row' is null then raise exception using errcode='22023',message='payment_history_local_preparation_key_invalid';end if;
    key:=app_private.payment_history_field_hash_v1(array[f->>'source_file_id',f->>'source_sheet',f->>'source_row']);
    if item.v->>'kind'='movement' then offset_no:=offset_no+1;number:=offset_no;end if;
   else null;
  end case;
  if offset_no>100000 then raise exception using errcode='54000',message='payment_history_local_preparation_capacity';end if;
  insert into public.payment_history_local_preparation_records values(p_shop,op,page_no,item.n::integer,item.v->>'kind',key,number);
 end loop;
 return result;
end;$$;
revoke all on function app_private.payment_history_local_stage_v2(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function app_private.payment_history_local_review_records_v2(p_shop uuid,p_device uuid,p_operation uuid,p_page integer)
 returns table(record_ordinal integer,movement_ordinal integer,kind text,fields jsonb)
language plpgsql volatile set search_path='' as $$
declare r public.payment_history_runtime;p public.payment_history_local_publications;n integer;begin
 if p_page is null or p_page not between 1 and 20000 then raise exception using errcode='22023',message='payment_history_local_review_page_invalid';end if;
 select * into r from public.payment_history_runtime where shop_id=p_shop for share;
 if not found or r.writer_authority<>'local' then raise exception using errcode='40001',message='payment_history_local_writer_closed';end if;
 select * into p from public.payment_history_local_publications where shop_id=p_shop and shop_device_id=p_device and operation_id=p_operation for share;
 if not found or p.state<>'preparing' or p.server_dataset_id<>r.dataset_id or p.writer_epoch<>r.writer_epoch then
  raise exception using errcode='40001',message='payment_history_local_preparation_stale';end if;
 if p.staged_pages<>p.page_count or p_page>p.page_count or (select count(*) from public.payment_history_local_publication_pages where operation_id=p_operation)<>p.page_count then
  raise exception using errcode='40001',message='payment_history_local_preparation_index_incomplete';end if;
 select jsonb_array_length(page_json::jsonb) into n from public.payment_history_local_publication_pages where operation_id=p_operation and ordinal=p_page;
 if n is null or n<>(select count(*) from public.payment_history_local_preparation_records where operation_id=p_operation and page_ordinal=p_page) then
  raise exception using errcode='40001',message='payment_history_local_preparation_index_incomplete';end if;
 return query with page as materialized(select page_json::jsonb v from public.payment_history_local_publication_pages where operation_id=p_operation and ordinal=p_page)
  select i.record_ordinal,i.movement_ordinal,i.kind,page.v->(i.record_ordinal-1)->'fields'
  from public.payment_history_local_preparation_records i cross join page where i.operation_id=p_operation and i.page_ordinal=p_page order by i.record_ordinal;
end;$$;
revoke all on function app_private.payment_history_local_review_records_v2(uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
