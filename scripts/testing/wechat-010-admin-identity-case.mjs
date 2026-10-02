// Local-only real-RPC identity regression. No remote connection or protected data.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const container='supabase_db_MerchandiseControlSupabase',template='wechat010_sync_final_20260926';
const db=`wechat010_identity_${process.pid}`;
assert.ok(statSync('/var/run/docker.sock').isSocket());
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('DOCKER_')));
const sql=(input,database=db,user='postgres')=>execFileSync('/usr/local/bin/docker',[
 '--host','unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d',database,
],{input,encoding:'utf8',env,timeout:120000,stdio:['pipe','pipe','pipe']}).trim();
const q=value=>`'${value.replaceAll("'","''")}'`;
const migration=readFileSync('supabase/migrations/20261002180757_wechat_010_admin_identity_case.sql','utf8');
const regression=readFileSync('supabase/tests/wechat_010_admin_identity_case.sql','utf8');
const source=readFileSync('supabase/migrations/20260612010000_task_057_shop_scoped_catalog.sql','utf8');
const signatures=[
 'public.shop_catalog_create_product(uuid,text,text,text,text,double precision,double precision,double precision,uuid,uuid)',
 'public.shop_catalog_update_product(uuid,uuid,text,text,text,text,double precision,double precision,double precision,uuid,uuid)',
];
const where=`f.oid in(${signatures.map(s=>`${q(s)}::regprocedure`).join(',')})`;
const attrs=()=>sql(`select jsonb_agg(to_jsonb(f)-'prosrc' order by oid)from pg_proc f where ${where};`);
const defs=()=>sql(`select string_agg(pg_get_functiondef(f.oid)||';',E'\n'order by oid)from pg_proc f where ${where};`);
const other=()=>sql(`select md5(string_agg(to_jsonb(f)::text,E'\n'order by oid))from pg_proc f where pronamespace in('public'::regnamespace,'app_private'::regnamespace)and not(${where});`);
const triggers=()=>sql("select md5(string_agg(to_jsonb(t)::text,E'\\n'order by oid))from pg_trigger t where not tgisinternal;");
const fingerprint=()=>sql("select md5(string_agg(v,E'\\n'order by v))from("+['inventory_products','inventory_product_prices','inventory_suppliers','inventory_categories','shared_sheet_sessions','sync_events','audit_logs'].map(t=>`select md5(to_jsonb(r)::text)v from public.${t} r`).join(' union all ')+")x;");
const body=(text,name)=>{const start=text.toLowerCase().indexOf(`create or replace function public.${name}(`);assert.ok(start>=0);const as=text.indexOf('as $$',start);assert.ok(as>=0);return text.slice(as+5,text.indexOf('$$;',as+5));};
for(const name of ['shop_catalog_create_product','shop_catalog_update_product']) {
 const before=body(source,name),after=body(migration,name);
 assert.equal(after,before.replace("upper(btrim(coalesce(p_barcode, '')))","btrim(coalesce(p_barcode, ''))").replace("upper(btrim(coalesce(p_item_number, '')))","btrim(coalesce(p_item_number, ''))"));
}
let created=false,primaryFailure=null;
try {
 assert.equal(sql(`select pg_get_userbyid(datdba)from pg_database where datname='${template}';`,'postgres','supabase_admin'),'postgres');
 assert.equal(sql(`select count(*)from pg_stat_activity where datname='${template}';`,'postgres','supabase_admin'),'0');
 assert.equal(sql('select (select count(*)from shops)+(select count(*)from inventory_products)+(select count(*)from inventory_product_prices)+(select count(*)from sync_events);',template),'0');
 sql(`create database ${db} template ${template} owner postgres;`,'postgres','supabase_admin');created=true;
 // Install the already-reviewed registry154 contracts in an empty isolated clone.
 for(const name of ['20260929013345_wechat_010_history_physical_normalization.sql','20260929013437_wechat_010_catalog_keyset_order.sql','20261001220355_wechat_010_recovery_checkpoint_performance.sql','20261001235153_wechat_010_history_timestamp_compatibility.sql','20261002005414_wechat_010_price_digest_performance.sql','20261002013745_wechat_010_checkpoint_integrity_performance.sql','20261002025317_wechat_010_checkpoint_pipeline_performance.sql','20261002044017_wechat_010_preflight_price_bytes.sql','20261002150909_wechat_010_bounded_product_bytes.sql'])sql(readFileSync(`supabase/migrations/${name}`,'utf8'));
 const original=defs(),beforeAttrs=attrs(),beforeOther=other(),beforeTriggers=triggers(),beforeData=fingerprint();
 const red=sql(regression);assert.match(red,/^not ok/m);console.log('BASELINE_RED_BEGIN\n'+red+'\nBASELINE_RED_END');
 assert.equal(fingerprint(),beforeData,'baseline test rollback');
 const transaction=migration.replace('begin;\nset local lock_timeout', 'set local lock_timeout').replace(/\ncommit;\s*$/,'\n');
 assert.throws(()=>sql(migration,db,'supabase_admin'),/admin_identity_case_baseline_mismatch/);
 for(const[label,setup,accepted]of[
  ['canonical ACL',signatures.map(s=>`revoke execute on function ${s} from service_role;`).join('\n'),true],
  ['TEST ACL',signatures.map(s=>`grant execute on function ${s} to service_role;`).join('\n'),true],
  ['extra grant',`grant execute on function ${signatures[0]} to anon;`,false],
  ['grant option',`grant execute on function ${signatures[1]} to authenticated with grant option;`,false],
  ['wrong volatility',`alter function ${signatures[0]} stable;`,false],
  ['strict drift',`alter function ${signatures[1]} strict;`,false],
  ['signature drift',`alter function ${signatures[0]} rename to original_create_product;`,false],
 ]){
  const statement=`begin;${setup}${transaction}rollback;`;
  if(accepted)sql(statement);else assert.throws(()=>sql(statement),/admin_identity_case_baseline_mismatch/,label);
  assert.equal(defs(),original);assert.equal(attrs(),beforeAttrs);assert.equal(other(),beforeOther);assert.equal(triggers(),beforeTriggers);
  console.log(`PASS migration guard ${label}: ${accepted?'accepted exact set':'atomic refusal'}`);
 }
 // A deploy search_path must never validate shadow copies instead of public.
 // Reproduce the old unqualified guard in this transaction, then prove refusal.
 const shadowDefinitions=original.replaceAll('FUNCTION public.shop_catalog_', 'FUNCTION identity_guard_shadow.shop_catalog_');
 assert.notEqual(shadowDefinitions,original);
 const shadowSetup=`create schema identity_guard_shadow;${shadowDefinitions}`+
  signatures.map(s=>`revoke all on function ${s.replace('public.','identity_guard_shadow.')} from public,anon,authenticated,service_role;grant execute on function ${s.replace('public.','identity_guard_shadow.')} to authenticated;`).join('\n')+
  `alter function ${signatures[0]} strict;set local search_path=identity_guard_shadow,public;`;
 const unqualifiedTransaction=transaction.replace("('public.shop_catalog_create_product(","('shop_catalog_create_product(")
  .replace("('public.shop_catalog_update_product(","('shop_catalog_update_product(");
 assert.notEqual(unqualifiedTransaction,transaction);
 sql(`begin;${shadowSetup}${unqualifiedTransaction}rollback;`);
 assert.throws(()=>sql(`begin;${shadowSetup}${transaction}rollback;`),/admin_identity_case_baseline_mismatch/);
 assert.equal(defs(),original);assert.equal(attrs(),beforeAttrs);assert.equal(other(),beforeOther);assert.equal(triggers(),beforeTriggers);
 console.log('PASS shadow-search_path: old guard accepts wrong schema; qualified guard refuses public metadata drift atomically');
 sql(migration.replace(/commit;\s*$/,'rollback;'));assert.equal(defs(),original);
 sql(migration);
 assert.equal(attrs(),beforeAttrs);assert.equal(other(),beforeOther);assert.equal(triggers(),beforeTriggers);assert.equal(fingerprint(),beforeData);
 const candidate=defs();
 for(const path of ['supabase/tests/wechat_010_admin_identity_case.sql','supabase/tests/task_142_catalog_text_policy_v1.sql','supabase/tests/cross_platform_product_revision_guard.sql','supabase/tests/wechat_003_catalog_mutations.sql']){
  const output=sql(readFileSync(path,'utf8'));console.log(`TAP_BEGIN ${path}\n${output}\nTAP_END ${path}`);
  assert.doesNotMatch(output,/^not ok/m,output);assert.match(output,/^1\.\.[1-9][0-9]*$/m);
 }
 assert.equal(fingerprint(),beforeData);assert.equal(attrs(),beforeAttrs);assert.equal(other(),beforeOther);assert.equal(triggers(),beforeTriggers);
 sql(original);assert.equal(defs(),original);sql(migration);assert.equal(defs(),candidate);
 assert.equal(attrs(),beforeAttrs);assert.equal(other(),beforeOther);assert.equal(triggers(),beforeTriggers);assert.equal(fingerprint(),beforeData);
 console.log(JSON.stringify({status:'PASS_LOCAL_RPC_CONTRACT',migrationSha256:createHash('sha256').update(migration).digest('hex'),scope:'Only4upper wrappers removed; exact metadata/OID/ACL/otherfunctions/triggers/data unchanged; no remote or authenticated live acceptance.'}));
}catch(error){primaryFailure=error;console.error('PRIMARY_FAILURE',error.stack??String(error));throw error;}
finally{if(created){try{sql(`drop database ${db};`,'postgres','supabase_admin');}catch(error){console.error('CLEANUP_FAILURE',error.message);if(!primaryFailure)throw error;}}}
