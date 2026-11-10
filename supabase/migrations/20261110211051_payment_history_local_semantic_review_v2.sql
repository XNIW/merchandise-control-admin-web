-- Normalized POS provenance is a supported ledger input; economic validation
-- remains byte-for-byte equivalent to v1 apart from its closed parser marker.
create or replace function app_private.payment_history_economics_v1(p_transaction jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb;g bigint;c bigint;t bigint;n bigint;k text;s text;begin
 if jsonb_typeof(p_transaction) is distinct from 'object' or p_transaction->>'provider' is distinct from 'getnet' or p_transaction->>'currency' is distinct from 'CLP'
  or coalesce(p_transaction->>'parserVersion','') not in ('getnet-ooxml-web-v1','history-local-ledger-v1','history-pos-normalized-v2') or coalesce(p_transaction->>'externalNamespace','') not in ('getnet.legacy.transaction','getnet.financial.movement')
  or length(coalesce(p_transaction->>'externalId','')) not between 1 and 256 or (p_transaction->>'externalId') ~ '[[:cntrl:]]'
  or coalesce(p_transaction->>'profile','') not in ('GetnetLegacy','GetnetModern') then raise exception using errcode='22023',message='payment_history_transaction_invalid';end if;
 foreach k in array array['grossClp','commissionClp','commissionVatClp','netClp'] loop
  if p_transaction->>k is not null and (jsonb_typeof(p_transaction->k)<>'string' or (p_transaction->>k) !~ '^(0|-?[1-9][0-9]*)$') then raise exception using errcode='22023',message='payment_history_amount_invalid';end if;
 end loop;
 g:=(p_transaction->>'grossClp')::bigint;c:=(p_transaction->>'commissionClp')::bigint;t:=(p_transaction->>'commissionVatClp')::bigint;n:=(p_transaction->>'netClp')::bigint;
 k:=p_transaction->>'movementKind';s:=upper(trim(p_transaction->>'transactionStatus'));
 if g is null or k is null or not ((k='Sale' and g>0) or (k='Cancellation' and g<0)) or s is null or s not in ('ABONADO','CONFIRMADA')
  or (p_transaction->>'profile'='GetnetLegacy' and (k<>'Sale' or c is null or c<0 or n is null or t is not null or n::numeric<>g::numeric-c::numeric))
  or (p_transaction->>'profile'='GetnetModern' and ((g>0 and (c>0 or t>0)) or (g<0 and (c<0 or t<0))
   or (n is not null and c is not null and t is not null and n::numeric<>g::numeric+c::numeric+t::numeric)))
  then raise exception using errcode='22023',message='payment_history_economics_invalid';end if;
 v:=jsonb_build_object('businessTicks',app_private.payment_history_ticks_v1(p_transaction#>>'{timestamp,businessDateTime}')::text,
  'grossClp',g::text,'commissionClp',c::text,'commissionVatClp',t::text,'netClp',n::text,'movementKind',k,'transactionState',s);
 return v;
end;$$;

-- Private semantic review only. The caller supplies server-selected policy IDs
-- and must authenticate/lock the writer before issuing a decision. This helper
-- neither creates evidence nor treats the POS reference text as verified proof.
create function app_private.payment_history_local_review_transaction_v2(p_shop uuid,f jsonb,p_source_hash text,p_native_start_ticks text,p_policy_ids uuid[]) returns jsonb
language plpgsql volatile set search_path='' as $$
declare t jsonb;economics jsonb;mapping record;native_policy uuid;other_policy uuid;v_kind text;identity text;begin
 t:=app_private.payment_history_local_transaction_v2(f,p_source_hash);
 economics:=app_private.payment_history_economics_v1(t);
 if p_native_start_ticks is null or p_native_start_ticks !~ '^(0|[1-9][0-9]{0,18})$'
  or p_native_start_ticks::bigint>3155378975999999999 or cardinality(p_policy_ids)>128 then raise exception using errcode='22023',message='payment_history_local_evidence_invalid';end if;
 select a.merchant_id,e.evidence_id into mapping from public.payment_history_merchant_aliases a
  join public.payment_history_evidence e on e.shop_id=a.shop_id and e.evidence_id=a.evidence_id
  join public.payment_history_merchants m on m.shop_id=a.shop_id and m.merchant_id=a.merchant_id
  where a.shop_id=p_shop and a.alias_key=f->>'alias_key' and a.active and e.kind='merchant_mapping' and e.status='verified' and e.verification_level<>'unverified'
  for share of a,e,m;
 if not found then raise exception using errcode='22023',message='payment_history_local_merchant_unverified';end if;
 -- Keep policy rows locked until the caller's final decision transaction ends.
 perform 1 from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=any(p_policy_ids) order by e.evidence_id for share;
 select e.evidence_id into native_policy from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=any(p_policy_ids)
  and e.kind='native_start' and e.scope->>'native_start_ticks'=p_native_start_ticks
  and app_private.payment_history_proof_covers_v1(p_shop,array[e.evidence_id],'native_start',mapping.merchant_id,p_source_hash,t)
  order by e.evidence_id limit 1;
 if native_policy is null then raise exception using errcode='22023',message='payment_history_local_native_start_unverified';end if;
 if exists(select 1 from public.pos_sales s where s.shop_id=p_shop and s.status='accepted' and s.business_date<=(t#>>'{timestamp,businessDateTime}')::date) then
  raise exception using errcode='22023',message='payment_history_local_native_overlap';end if;
 v_kind:=case when t->>'profile'='GetnetModern' then 'modern_time' else 'legacy_currency' end;
 select e.evidence_id into other_policy from public.payment_history_evidence e where e.shop_id=p_shop and e.evidence_id=any(p_policy_ids)
  and e.kind=v_kind and app_private.payment_history_proof_covers_v1(p_shop,array[e.evidence_id],v_kind,mapping.merchant_id,p_source_hash,t)
  order by e.evidence_id limit 1;
 if other_policy is null then raise exception using errcode='22023',message=case when v_kind='modern_time' then 'payment_history_local_provider_time_unverified' else 'payment_history_local_currency_unverified' end;end if;
 identity:=encode(extensions.digest(convert_to(p_shop::text||chr(31)||'getnet'||chr(31)||mapping.merchant_id::text||chr(31)||(t->>'externalNamespace')||chr(31)||(t->>'externalId'),'UTF8'),'sha256'),'hex');
 return jsonb_build_object('merchant_id',mapping.merchant_id,'identity_key',identity,'transaction',t,'economics',economics,
  'economic_digest',app_private.payment_history_economic_digest_v1(economics),'evidence_ids',jsonb_build_array(mapping.evidence_id,native_policy,other_policy));
end;$$;
revoke all on function app_private.payment_history_local_review_transaction_v2(uuid,jsonb,text,text,uuid[]) from public,anon,authenticated,service_role;
