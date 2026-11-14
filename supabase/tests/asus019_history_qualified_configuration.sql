begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(41);
select ok(not has_function_privilege('authenticated','public.payment_history_device_qualified_config_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)','EXECUTE'),'browser cannot select a POS qualification lease');
select ok(not has_function_privilege('authenticated','public.payment_history_device_web_v1(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb)','EXECUTE'),'browser cannot impersonate a POS draft writer');
select ok(not has_function_privilege('service_role','app_private.payment_history_request_engine_v2(uuid,text,jsonb,jsonb)','EXECUTE'),'canonical engine is not an arbitrary service-role actor port');
insert into public.shops(shop_id,shop_code,shop_name,shop_status) values('10000000-0000-4000-8000-000000493019','QHISTORY019','Synthetic qualified history','active');
insert into public.staff_accounts(staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_hash,credential_updated_at,credential_expires_at,must_change_credential,credential_version,credential_status)
 values('20000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','1001','Synthetic badge-only administrator','pos_admin','active','password','argon2id:synthetic-not-a-login',clock_timestamp(),null,false,7,'active');
insert into public.staff_role_permissions(shop_id,role_key,permission_key,enabled) values('10000000-0000-4000-8000-000000493019','pos_admin','shop_admin.full_access',true);
insert into public.staff_web_sessions(staff_web_session_id,shop_id,staff_id,session_token_hash,staff_credential_version,status,issued_at,expires_at)
 values('30000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','sha256:'||repeat('a',64),7,'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour');
create function pg_temp.technical() returns jsonb language sql as $$select public.payment_history_technical_access_v1('10000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','30000000-0000-4000-8000-000000493019','sha256:'||repeat('a',64),7)->'result';$$;
create function pg_temp.qualification(op text,p jsonb default '{}') returns jsonb language sql as $$select public.payment_history_qualification_request_v1('10000000-0000-4000-8000-000000493019',op,p,'20000000-0000-4000-8000-000000493019','30000000-0000-4000-8000-000000493019','sha256:'||repeat('a',64),7)->'result';$$;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select throws_ok($$select pg_temp.technical()$$,'42501','payment_history_explicit_technical_grant_required','staff1001 and full-access badge do not become Master');
set local role postgres;
insert into public.payment_history_role_permissions(shop_id,role_key,capability,enabled) values('10000000-0000-4000-8000-000000493019','pos_admin','migrate',true);
set local role service_role;
select is(pg_temp.technical()->>'issuer','ExplicitShopDelegate','only a separate canonical grant delegates technical management');
select is(pg_temp.qualification('read')->'evidence','[]'::jsonb,'old empty shop has no qualified evidence');
select is(pg_temp.qualification('read')->'local_scope_bindings','[]'::jsonb,'Web access cannot borrow a device-local scope relationship');
select throws_ok($$select pg_temp.qualification('qualify','{"kind":"modern_time"}')$$,'22023','payment_history_qualification_input_invalid','a role does not replace document and exact scope');
set local role postgres;
insert into public.payment_history_uploads(upload_id,shop_id,actor_kind,actor_id,object_key,file_name,file_sha256,byte_length,state,verified_at) values
 ('40000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','pos_staff_manager','20000000-0000-4000-8000-000000493019','history/10000000-0000-4000-8000-000000493019/40000000-0000-4000-8000-000000493019','synthetic.xlsx',repeat('b',64),100,'verified',clock_timestamp()),
 ('50000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','pos_staff_manager','20000000-0000-4000-8000-000000493019','history/10000000-0000-4000-8000-000000493019/50000000-0000-4000-8000-000000493019','synthetic-provider.pdf',repeat('c',64),100,'verified',clock_timestamp());
create temp table q_context(key text primary key,value jsonb);grant all on q_context to service_role;
insert into q_context values('mapping',jsonb_build_object('request_key','60000000-0000-4000-8000-000000493019','kind','merchant_mapping','level','operator_attested','version','synthetic-map-v1','reference','Synthetic independently verified mapping','document_upload_id','50000000-0000-4000-8000-000000493019','document_sha256',repeat('c',64),
 'scope',jsonb_build_object('merchant_id','70000000-0000-4000-8000-000000493019','alias_key',app_private.payment_history_field_hash_v1(array['getnet-merchant-alias-v1','Synthetic merchant','','','','']),'profile','GetnetLegacy','parser_version','getnet-ooxml-v1','file_sha256',jsonb_build_array(repeat('b',64)),'from_ticks','1','to_ticks','3155378976000000000','interpretation','Unresolved','native_start_ticks',null),
 'mapping',jsonb_build_object('label','Synthetic merchant','source_identity',jsonb_build_object('local','Synthetic merchant','seller','','sellerId','','localNumber','','rut','','hasEvidence',true))));
set local role service_role;
select is((select pg_temp.qualification('qualify',value)->>'status' from q_context where key='mapping'),'verified','documented exact mapping is persisted');
select is((select pg_temp.qualification('qualify',value)->>'status' from q_context where key='mapping'),'verified','qualification retry returns the same proof without creating another');
select is((pg_temp.qualification('read')->'evidence'->0)->>'issuer','ExplicitShopDelegate','saved issuer preserves the actual authority');
select is((pg_temp.qualification('read')->'evidence'->0)->>'to_ticks','3155378976000000000','exclusive raw boundary remains an exact decimal');
select throws_ok($$select pg_temp.qualification('qualify',jsonb_set(value,'{reference}','"changed request"')) from q_context where key='mapping'$$,'23505','payment_history_qualification_idempotency_conflict','same key cannot mutate already qualified scope');
select throws_ok($$select pg_temp.qualification('qualify',jsonb_set(jsonb_set(value,'{request_key}','"61000000-0000-4000-8000-000000493019"'),'{document_sha256}',to_jsonb(repeat('e',64)))) from q_context where key='mapping'$$,'22023','payment_history_qualified_document_required','a copied filename does not qualify a different document hash');
insert into q_context values('before',pg_temp.qualification('read'));
select is(pg_temp.qualification('revoke','{"evidence_id":"60000000-0000-4000-8000-000000493019"}')->>'status','revoked','technical authority can revoke a specific qualification');
select isnt(pg_temp.qualification('read')->>'config_digest',(select value->>'config_digest' from q_context where key='before'),'revocation changes the immutable-configuration digest');
select is((pg_temp.qualification('read')->'evidence'->0)->>'state','Revoked','device-facing contract preserves explicit revocation');
set local role postgres;
select throws_ok($$update public.payment_history_evidence set status='verified' where evidence_id='60000000-0000-4000-8000-000000493019'$$,'55000','payment_history_qualified_evidence_immutable','revoked evidence cannot silently become authoritative again');
select ok(app_private.payment_history_local_qualification_shape_v1(jsonb_build_object('config_digest',repeat('a',64),'resolver_fingerprint',repeat('b',64),'evidence_ids',jsonb_build_array('60000000-0000-4000-8000-000000493019'))),'local qualification binds configuration, resolver and actual proof IDs');
select ok(not app_private.payment_history_local_qualification_shape_v1(jsonb_build_object('config_digest',repeat('a',64),'resolver_fingerprint',repeat('b',64),'evidence_ids',jsonb_build_array('60000000-0000-4000-8000-000000493019','60000000-0000-4000-8000-000000493019'))),'duplicate proof IDs cannot expand the local grant');
select ok(not app_private.payment_history_local_qualification_shape_v1(jsonb_build_object('config_digest',repeat('a',64),'resolver_fingerprint',repeat('b',64),'evidence_ids',jsonb_build_array('70000000-0000-4000-8000-000000493019','60000000-0000-4000-8000-000000493019'))),'proof order is canonical and immutable');
insert into auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','80000000-0000-4000-8000-000000493019','authenticated','authenticated','qualified-master@example.invalid','{}','{}',clock_timestamp(),clock_timestamp());
insert into public.profiles(profile_id,display_name,profile_status) values('80000000-0000-4000-8000-000000493019','Synthetic Master','active') on conflict(profile_id) do update set profile_status='active',disabled_at=null;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values('90000000-0000-4000-8000-000000493019','80000000-0000-4000-8000-000000493019',clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour');
insert into public.platform_admins(profile_id,status) values('80000000-0000-4000-8000-000000493019','active');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','80000000-0000-4000-8000-000000493019','session_id','90000000-0000-4000-8000-000000493019','exp',floor(extract(epoch from clock_timestamp()+interval '1 hour')))::text,true);
set local role authenticated;
select is(public.payment_history_technical_access_v1('10000000-0000-4000-8000-000000493019')#>>'{result,issuer}','PlatformMaster','an actual active Master manages a shop without a shop membership');
select is(public.payment_history_request_v1('10000000-0000-4000-8000-000000493019','capabilities')#>>'{result,capabilities,read}','true','Master workbench reuses the same canonical read API');
set local role postgres;
insert into public.payment_history_jobs(job_id,shop_id,actor_kind,actor_id,actor_session_id,request_key,request_digest,parser_version,configuration,source_upload_ids) values('a0000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','personal_account','80000000-0000-4000-8000-000000493019','90000000-0000-4000-8000-000000493019',gen_random_uuid(),repeat('a',64),'getnet-ooxml-web-v1','{}',array['40000000-0000-4000-8000-000000493019']::uuid[]);
select ok((select app_private.payment_history_job_actor_current_v1(j) from public.payment_history_jobs j where job_id='a0000000-0000-4000-8000-000000493019'),'worker recognizes the actual Master session without inventing a shop role');
update public.platform_admins set status='revoked',revoked_at=clock_timestamp() where profile_id='80000000-0000-4000-8000-000000493019';
select ok(not (select app_private.payment_history_job_actor_current_v1(j) from public.payment_history_jobs j where job_id='a0000000-0000-4000-8000-000000493019'),'Master revocation stops queued analysis publication');
set local role authenticated;
select throws_ok($$select public.payment_history_technical_access_v1('10000000-0000-4000-8000-000000493019')$$,'42501','payment_history_permission_denied','a revoked platform row is not a Master');
set local role postgres;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.payment_history_role_permissions set enabled=false where shop_id='10000000-0000-4000-8000-000000493019' and capability='migrate';
set local role service_role;
select throws_ok($$select pg_temp.technical()$$,'42501','payment_history_permission_denied','revoked explicit grant cannot fall back to full_access');
select throws_ok($$select pg_temp.qualification('read')$$,'42501','payment_history_permission_denied','qualification metadata also rechecks the current technical grant');
set local role postgres;
update public.payment_history_role_permissions set enabled=true where shop_id='10000000-0000-4000-8000-000000493019' and capability='migrate';
insert into public.shop_devices(shop_device_id,shop_id,device_identifier,display_name,device_type,status) values('b0000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','SYNTHETIC-QUALIFIED-POS','Synthetic qualified POS','pos','active');
insert into public.pos_device_credentials(pos_device_credential_id,shop_id,shop_device_id,staff_id,token_hash,staff_credential_version,expires_at) values('c0000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),7,'9999-12-31 23:59:59.999999+00'::timestamptz);
insert into public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) values('d0000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','c0000000-0000-4000-8000-000000493019','sha256:'||repeat('e',64),7,clock_timestamp(),'9999-12-31 23:59:59.999999+00'::timestamptz);
create function pg_temp.device_web(op text,p jsonb) returns jsonb language sql as $$select public.payment_history_device_web_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d0000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('e',64),7,op,p)->'result';$$;
set local role service_role;
select is(public.payment_history_device_qualified_config_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d0000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('e',64),7,'qualified_config','{}')#>>'{result,schema_version}','getnet-qualified-input-v1','device qualification read uses the canonical non-expiring v6 lease');
select throws_ok($$select pg_temp.device_web('web_evidence','{}')$$,'22023','payment_history_operation_invalid','device draft adapter cannot invent provider evidence');
insert into q_context values('pos_job',pg_temp.device_web('web_start','{"request_key":"e0000000-0000-4000-8000-000000493019","upload_ids":["40000000-0000-4000-8000-000000493019"],"configuration":{"legacyAmountsAreClp":true,"modernTimeInterpretation":"Unresolved","temporalPolicyVersion":"synthetic-v1","temporalEvidenceReference":""}}'));
select is((select value->>'state' from q_context where key='pos_job'),'queued','POS draft enters the same canonical bounded job queue');
select throws_ok($$select pg_temp.device_web('web_configure',jsonb_build_object('job_id',(select value->>'job_id' from q_context where key='pos_job'),'evidence_ids',jsonb_build_array('60000000-0000-4000-8000-000000493019'),'corrections','[]'::jsonb))$$,'22023','payment_history_qualified_evidence_required','a revoked or incompatible qualification cannot configure a POS draft');
set local role postgres;
select ok((select origin_device_id='b0000000-0000-4000-8000-000000493019'::uuid and actor_session_id='d0000000-0000-4000-8000-000000493019'::uuid and requires_qualified_input from public.payment_history_jobs where job_id=(select (value->>'job_id')::uuid from q_context where key='pos_job')),'canonical job stores actual device/session origin and requires qualified input');
select ok((select app_private.payment_history_job_actor_current_v1(j) from public.payment_history_jobs j where job_id=(select (value->>'job_id')::uuid from q_context where key='pos_job')),'Worker current-actor check preserves a PIN without expiration');
select throws_ok($$select app_private.payment_history_local_prepare_intent_v2('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','{"operation_id":"f0000000-0000-4000-8000-000000493019","local_nonce":"f1000000-0000-4000-8000-000000493019","kind":"Apply","local_dataset_id":"synthetic","restore_epoch":"0","restore_lineage_id":"f2000000-0000-4000-8000-000000493019","base_revision":"0","writer_epoch":"1","request_fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","content_digest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","page_count":1,"protocol_version":2}')$$,'22023','payment_history_qualified_configuration_required','new local Apply cannot enter the legacy unqualified compatibility path');
set local role service_role;
select throws_ok($$select public.payment_history_request_v1('10000000-0000-4000-8000-000000493019','evidence','{"kind":"legacy_currency","level":"operator_attested","reference":"free text"}','20000000-0000-4000-8000-000000493019','30000000-0000-4000-8000-000000493019','sha256:'||repeat('a',64),7)$$,'22023','payment_history_qualified_evidence_required','ordinary Web endpoint cannot mint a qualification from free text');
select throws_ok($$select public.payment_history_device_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d0000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('e',64),7,'local_write_grant','{"operation_id":"f3000000-0000-4000-8000-000000493019","writer_epoch":"1","kind":"Apply"}')$$,'55000','payment_history_qualified_upgrade_required','even without a baseline snapshot a new v1 Apply requires the qualified protocol');
select lives_ok($$select public.payment_history_device_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d0000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('e',64),7,'local_write_grant','{"operation_id":"f4000000-0000-4000-8000-000000493019","writer_epoch":"1","kind":"Undo"}')$$,'the separately authorized legacy Undo contract is retained');
select throws_ok($$select public.payment_history_device_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d0000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('e',64),7,'local_write_grant','{"operation_id":"f4000000-0000-4000-8000-000000493019","writer_epoch":"1","kind":"Apply"}')$$,'55000','payment_history_qualified_upgrade_required','a new Undo grant cannot be relabeled as Apply to bypass qualification');
set local role postgres;
-- An already committed receipt is an independent read-recovery fixture, not a
-- shortcut for admitting or qualifying a new financial Apply.
insert into public.payment_history_batches(batch_id,shop_id,job_id,origin,apply_operation_id,created_revision)
 select 'f5000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019',(value->>'job_id')::uuid,'web_import','f6000000-0000-4000-8000-000000493019',1 from q_context where key='pos_job';
insert into public.payment_history_receipts(operation_id,shop_id,batch_id,operation_kind,actor_kind,actor_id,request_key,request_digest,receipt)
 select 'f6000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','f5000000-0000-4000-8000-000000493019','apply','pos_staff_manager','20000000-0000-4000-8000-000000493019','f7000000-0000-4000-8000-000000493019',repeat('f',64),
 jsonb_build_object('operation_id','f6000000-0000-4000-8000-000000493019','batch_id','f5000000-0000-4000-8000-000000493019','kind','apply','dataset_id',dataset_id,'revision','1','writer_epoch','1','summary',jsonb_build_object('total',0,'new_count',0,'duplicate_count',0,'conflicts',0,'blocked',0,'new_gross_clp','0','known_new_net_clp','0','known_new_net_count',0)) from public.payment_history_runtime where shop_id='10000000-0000-4000-8000-000000493019';
insert into public.pos_sessions(pos_session_id,shop_id,shop_device_id,staff_id,pos_device_credential_id,session_token_hash,staff_credential_version,issued_at,expires_at) values('d1000000-0000-4000-8000-000000493019','10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','c0000000-0000-4000-8000-000000493019','sha256:'||repeat('f',64),7,clock_timestamp(),'9999-12-31 23:59:59.999999+00'::timestamptz);
set local role service_role;
select is(public.payment_history_device_web_v1('10000000-0000-4000-8000-000000493019','b0000000-0000-4000-8000-000000493019','20000000-0000-4000-8000-000000493019','d1000000-0000-4000-8000-000000493019','sha256:'||repeat('d',64),'sha256:'||repeat('f',64),7,'web_receipt','{"request_key":"f7000000-0000-4000-8000-000000493019"}')#>>'{result,receipt,operation_id}','f6000000-0000-4000-8000-000000493019','a fresh session of the same durable principal recovers the already committed receipt');
set local role postgres;
select is((select actor_session_id::text from public.payment_history_jobs where job_id=(select (value->>'job_id')::uuid from q_context where key='pos_job')),'d0000000-0000-4000-8000-000000493019','read-only receipt recovery never resumes or changes the old job lease');
select * from finish();
rollback;
