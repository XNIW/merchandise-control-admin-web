#!/usr/bin/env python3
"""Owned, network-isolated PostgreSQL test; no external DB or credential reads.
Tests the actual migration against a minimal model of unchanged dependencies.
The delegated legacy apply has an economic-write sentinel, not real products.
"""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'cmc-pos-receipt-' + uuid.uuid4().hex[:10]
MIGRATION = ROOT / 'supabase/migrations/20261008194809_pos_catalog_import_receipt_and_retirement.sql'
SHOP = '10000000-0000-4000-8000-000000000094'
DEVICE = '30000000-0000-4000-8000-000000000094'
STAFF = '20000000-0000-4000-8000-000000000094'
SESSION = '40000000-0000-4000-8000-000000000094'
OWNER = '50000000-0000-4000-8000-000000000094'
HASH = 'sha256:' + 'a' * 64
PASS = []
OWNED_CREATED = False

def command(args, **kwargs):
    completed = subprocess.run(args, capture_output=True, text=True, timeout=30, **kwargs)
    if completed.returncode != 0:
        print(completed.stderr, flush=True)
        completed.check_returncode()
    return completed.stdout.strip()

def sql(query):
    return command(['docker', 'exec', '-i', NAME, 'psql', '-X', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input=query)

def result(query):
    return json.loads(sql(query).splitlines()[-1])

def call(operation, identity='old', key=None, payload=HASH, shop=SHOP, device=DEVICE):
    key = key or identity + '-idem'
    base = f"'{shop}','{device}','{STAFF}','{SESSION}','{OWNER}','{identity}','{key}','{payload}'"
    if operation == 'apply':
        return f"select public.pos_catalog_import_apply_v2({base},'pos-catalog-import-v1','supplier_excel',now(),'[]','{{}}','{{}}');"
    return f"select public.pos_catalog_import_{operation}_v1({base});"

def check(name, truth):
    if not truth:
        raise AssertionError(name)
    PASS.append(name)
    print('PASS ' + name, flush=True)

FIXTURE = f"""
create role anon; create role authenticated; create role service_role;
create schema app_private;
create table public.staff_accounts(staff_id uuid primary key,shop_id uuid,role_key text,credential_expires_at timestamptz);
create table public.staff_role_permissions(shop_id uuid,role_key text,permission_key text,enabled boolean);
create table public.pos_device_credentials(pos_device_credential_id uuid primary key,expires_at timestamptz);
create table public.pos_sessions(pos_session_id uuid primary key,shop_id uuid,shop_device_id uuid,staff_id uuid,pos_device_credential_id uuid,expires_at timestamptz);
insert into public.staff_accounts values('{STAFF}','{SHOP}','pos_admin',null);
insert into public.staff_role_permissions values('{SHOP}','pos_admin','catalog.import',true);
insert into public.pos_device_credentials values('{DEVICE}',clock_timestamp()+interval '1 hour');
insert into public.pos_sessions values('{SESSION}','{SHOP}','{DEVICE}','{STAFF}','{DEVICE}',clock_timestamp()+interval '1 hour');
create table public.fixture_auth(valid boolean);insert into public.fixture_auth values(true);
create function app_private.pos_runtime_lease_is_valid_v1(uuid,uuid,uuid,uuid) returns boolean language sql as $$
 select valid and exists(select 1 from public.pos_sessions s where s.shop_id=$1 and s.shop_device_id=$2 and s.staff_id=$3 and s.pos_session_id=$4) from public.fixture_auth;
$$;
create function app_private.resolve_pos_catalog_import_owner_v1(uuid,boolean) returns uuid language sql as $$select '{OWNER}'::uuid$$;
create table public.pos_catalog_import_batches(pos_catalog_import_batch_id uuid primary key default gen_random_uuid(),shop_id uuid,shop_device_id uuid,client_import_id text,idempotency_key text,payload_hash text,status text,ack_response jsonb,
 unique(shop_id,shop_device_id,client_import_id),unique(shop_id,shop_device_id,idempotency_key));
create table public.fixture_economic_writes(identity text);
create table public.inventory_products(id uuid primary key,shop_id uuid,owner_user_id uuid,deleted_at timestamptz,updated_at timestamptz,retail_price double precision,purchase_price double precision,stock_quantity double precision,product_name text,barcode text);

create function public.pos_catalog_import_apply_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) returns jsonb language plpgsql security definer as $$begin insert into public.fixture_economic_writes values($6);return '{{"ok":true}}';end$$;
grant execute on function public.pos_catalog_import_apply_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) to service_role;
create function public.pos_catalog_import_apply_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb) returns jsonb language plpgsql security definer as $$
declare ack jsonb; bid uuid := gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtext($1::text||':'||$2::text),hashtext($6));
 perform pg_advisory_xact_lock(hashtext($1::text||':'||$2::text),hashtext($7));
 ack := jsonb_build_object('ok',true,'batchId',bid,'status','accepted','items','[]'::jsonb,'remoteProductIds','[]'::jsonb,'remotePriceIds','[]'::jsonb,'summary','{{"acceptedItemCount":0,"duplicateItemCount":0,"productCount":0}}'::jsonb);
 insert into public.pos_catalog_import_batches values(bid,$1,$2,$6,$7,$8,'accepted',ack);
 insert into public.fixture_economic_writes values($6);
 return ack;
end$$;
"""

try:
    images = command(['docker', 'image', 'ls', 'postgres', '--format', '{{.ID}}']).splitlines()
    if not images:
        raise RuntimeError('NOT_RUN: cached postgres image unavailable; no pull attempted')
    command(['docker','run','--pull=never','-d','--name',NAME,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',images[0]])
    OWNED_CREATED = True
    # The image's temporary init server also answers pg_isready. Wait for the
    # entrypoint to finish initialization before checking the final server.
    for attempt in range(60):
        startup = subprocess.run(['docker','logs',NAME],capture_output=True,text=True,timeout=5)
        ready = subprocess.run(['docker','exec',NAME,'pg_isready','-U','postgres'],capture_output=True,timeout=5)
        if ready.returncode == 0 and 'PostgreSQL init process complete; ready for start up.' in startup.stdout + startup.stderr:
            break
        time.sleep(.25)
    else:
        raise RuntimeError('Owned PostgreSQL initialization failed')
    sql(FIXTURE)
    sql(MIGRATION.read_text())
    sql("""
      create table public.inventory_product_prices(id uuid primary key,owner_user_id uuid,shop_id uuid,product_id uuid,type text,price double precision,effective_at text,source text,note text,created_at text, unique(owner_user_id,product_id,type,effective_at));
      create table public.pos_sale_stock_movements(pos_sale_stock_movement_id uuid primary key default gen_random_uuid(),movement_key text unique,pos_sale_id uuid,pos_sale_line_id uuid,shop_id uuid,product_id uuid,movement_kind text,quantity_delta numeric,status text,issue_code text,stock_before numeric,stock_after numeric,metadata_redacted jsonb,pos_article_mutation_id text,unique(shop_id,pos_article_mutation_id));
      create function public.fixture_product_revision() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
      create trigger fixture_revision before update on public.inventory_products for each row execute function public.fixture_product_revision();
    """)
    sql((ROOT / 'supabase/migrations/20261008200355_pos_catalog_import_linked_correction.sql').read_text())
    check('actual migration parses and commits on owned PostgreSQL', True)
    before = sql("select md5(coalesce(jsonb_agg(to_jsonb(b))::text,'[]')) from public.pos_catalog_import_batches b;")
    check('missing receipt is snapshot only', result(call('receipt'))['status'] == 'not_found')
    check('lookup writes no ledger or economic row', before == sql("select md5(coalesce(jsonb_agg(to_jsonb(b))::text,'[]')) from public.pos_catalog_import_batches b;") and sql('select count(*) from public.fixture_economic_writes;') == '0')
    check('existing apply produces accepted durable ACK', result(call('apply','accepted'))['ok'])
    stored = result("select ack_response from public.pos_catalog_import_batches where client_import_id='accepted';")
    check('lookup returns persisted ACK exactly', result(call('receipt','accepted'))['receipt'] == stored)
    check('repeated receipt leaves ACK unchanged', result(call('receipt','accepted'))['receipt'] == stored)
    check('hash mismatch conflicts', result(call('receipt','accepted',payload='sha256:'+'b'*64))['status'] == 'conflict')
    check('clientImportId mismatch conflicts', result(call('receipt','other',key='accepted-idem'))['status'] == 'conflict')
    check('idempotencyKey mismatch conflicts', result(call('receipt','accepted',key='other-idem'))['status'] == 'conflict')
    check('retirement returns ACK when apply already committed', result(call('retire','accepted'))['status'] == 'accepted')
    sql("update public.pos_catalog_import_batches set ack_response=ack_response-'status' where client_import_id='accepted';")
    check('legacy incomplete ACK fails closed', result(call('receipt','accepted'))['reason'] == 'receipt_unavailable')
    sql("update public.pos_catalog_import_batches set status='failed',ack_response='{}' where client_import_id='accepted';")
    check('failed legacy import cannot be retired', result(call('retire','accepted'))['status'] == 'conflict')
    sql('update public.staff_role_permissions set enabled=false;')
    check('catalog.import denial prevents reading receipt', result(call('receipt'))['code'] == 'auth_denied')
    check('catalog.import denial prevents retirement', result(call('retire'))['code'] == 'auth_denied')
    sql('update public.staff_role_permissions set enabled=true;update public.fixture_auth set valid=false;')
    check('revoked runtime lease denies lookup', result(call('receipt'))['code'] == 'auth_denied')
    sql('update public.fixture_auth set valid=true;')
    check('cross-shop request cannot enumerate ledger', result(call('receipt',shop='10000000-0000-4000-8000-000000000095'))['code'] == 'auth_denied')
    check('cross-device request cannot enumerate ledger', result(call('receipt',device='30000000-0000-4000-8000-000000000095'))['code'] == 'auth_denied')
    check('retirement commits private identity fence', result(call('retire'))['status'] == 'retired')
    first_retired = result(call('retire'))
    check('retirement repeats idempotently with exact timestamp', first_retired == result(call('retire')))
    check('retired lookup is conflict not false absence', result(call('receipt'))['reason'] == 'identity_retired')
    count = sql('select count(*) from public.fixture_economic_writes;')
    check('late original rejects before delegated economic writes', result(call('apply'))['code'] == 'conflict' and count == sql('select count(*) from public.fixture_economic_writes;'))
    check('new replacement operation remains independently admissible', result(call('apply','replacement'))['ok'])
    check('late original after replacement is still rejected', result(call('apply'))['code'] == 'conflict')
    check('retirement changed hash conflicts', result(call('retire',payload='sha256:'+'c'*64))['reason'] == 'identity_conflict')
    check('retirement clashing key conflicts', result(call('retire','other',key='old-idem'))['reason'] == 'identity_conflict')
    check('direct legacy v1 cannot bypass retirement', sql("select has_function_privilege('service_role','public.pos_catalog_import_apply_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)','execute');") == 'f')
    check('private prior implementation is not callable by service_role', sql("select has_function_privilege('service_role','app_private.pos_catalog_import_apply_pre_retirement_v2(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,timestamptz,jsonb,jsonb,jsonb)','execute');") == 'f')
    check('anon/authenticated cannot lookup or retire', sql("select has_function_privilege('anon','public.pos_catalog_import_receipt_v1(uuid,uuid,uuid,uuid,uuid,text,text,text)','execute') or has_function_privilege('authenticated','public.pos_catalog_import_retire_v1(uuid,uuid,uuid,uuid,uuid,text,text,text)','execute');") == 'f')
    # Occupied original identity. Lookup starts before expiry, then must recheck
    # the advancing wall clock after the lock holder releases it.
    def holder(identity, operation=None):
        held = f"begin;select pg_advisory_xact_lock(hashtext('{SHOP}:{DEVICE}'),hashtext('{identity}'));"
        if operation:
            held += call(operation,identity)
        return sql(held + 'select pg_sleep(1);commit;')
    with concurrent.futures.ThreadPoolExecutor() as pool:
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '600 milliseconds';")
        future = pool.submit(holder,'expiry')
        time.sleep(.1)
        check('session expiry while waiting on identity lock denies lookup', result(call('receipt','expiry'))['code'] == 'auth_denied')
        future.result()
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '1 hour';")
        future = pool.submit(holder,'race-apply','apply')
        time.sleep(.1)
        check('retirement waits for in-flight apply and returns accepted ACK', result(call('retire','race-apply'))['status'] == 'accepted')
        future.result()
        future = pool.submit(holder,'race-retire','retire')
        time.sleep(.1)
        before_economic = sql('select count(*) from public.fixture_economic_writes;')
        check('late original waits for retirement then rejects', result(call('apply','race-retire'))['code'] == 'conflict')
        future.result()
        check('retirement-win race has zero additional economic writes', before_economic == sql('select count(*) from public.fixture_economic_writes;'))
    with concurrent.futures.ThreadPoolExecutor() as pool:
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '600 milliseconds';")
        future = pool.submit(sql, "begin;update public.staff_role_permissions set enabled=enabled;select pg_sleep(1);commit;")
        time.sleep(.1)
        check('session expiry while waiting on permission lock denies lookup', result(call('receipt','permission-expiry'))['code'] == 'auth_denied')
        future.result()
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '1 hour';")
    # Linked correction: original ACK remains authoritative while remote metadata
    # and stock may have advanced after that ACK. Fixtures contain real columns.
    products=['80000000-0000-4000-8000-000000000094','80000000-0000-4000-8000-000000000095']
    sql("insert into public.inventory_products values('"+products[0]+"','"+SHOP+"','"+OWNER+"',null,clock_timestamp(),1200,900,10,'REMOTE-NEW-NAME','REMOTE-CODE');")
    sql("insert into public.inventory_products values('"+products[1]+"','"+SHOP+"','"+OWNER+"',null,clock_timestamp(),2200,1900,20,'SECOND-REMOTE-NAME','SECOND-CODE');")
    ack={'ok':True,'batchId':'70000000-0000-4000-8000-000000000095','status':'accepted','items':[],
      'remoteProductIds':[{'clientItemId':'row-'+str(i),'remoteProductId':prod,'barcode':'ORIGINAL-CODE'} for i,prod in enumerate(products)],'remotePriceIds':[],
      'summary':{'acceptedItemCount':2,'duplicateItemCount':0,'productCount':2}}
    sql("insert into public.pos_catalog_import_batches values('"+ack['batchId']+"','"+SHOP+"','"+DEVICE+"','original-linked','original-linked-idem','"+HASH+"','accepted','"+json.dumps(ack)+"');")
    current = result(call('receipt','original-linked'))
    check('selective current snapshots contain only original ACK products', len(current['currentProductSnapshots']) == 2 and {x['remoteProductId'] for x in current['currentProductSnapshots']}==set(products))
    revisions={x['remoteProductId']:x['baseRevision'] for x in current['currentProductSnapshots']}
    def correction(identity='correct-1',items=None,payload=HASH,created="clock_timestamp()"):
        items=items or [{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['purchasePrice','retailPrice','quantityDelta'],'changes':{'purchasePrice':950,'retailPrice':1300,'quantityDelta':.25}}]
        for item in items:
            if 'baseSnapshot' not in item:
                current=result("select jsonb_build_object('retailPrice',retail_price,'purchasePrice',purchase_price,'stockQuantity',stock_quantity) from public.inventory_products where id='"+item['remoteProductId']+"';")
                item['baseSnapshot']={('stockQuantity' if key=='quantityDelta' else key):current[('stockQuantity' if key=='quantityDelta' else key)] for key in item['fieldMask']}
        return "select public.pos_catalog_import_correct_v1('"+SHOP+"','"+DEVICE+"','"+STAFF+"','"+SESSION+"','"+OWNER+"','original-linked','original-linked-idem','"+HASH+"','"+identity+"','"+identity+"-idem','"+payload+"',"+created+",'"+json.dumps(items)+"');"
    first=result(correction())
    check('linked correction atomically updates requested prices and relative stock', first['status']=='accepted' and sql("select retail_price||','||purchase_price||','||stock_quantity from public.inventory_products where id='"+products[0]+"';")=='1300,950,10.25')
    check('correction ACK maps use current barcode without changing original product identity',first['receipt']['remoteProductIds'][0]['barcode']=='REMOTE-CODE' and first['receipt']['remoteProductIds'][0]['remoteProductId']==products[0])
    check('remote metadata edited since original ACK is preserved',sql("select product_name||','||barcode from public.inventory_products where id='"+products[0]+"';")=='REMOTE-NEW-NAME,REMOTE-CODE')
    check('new ACK includes fresh six-digit product revision', first['receipt']['items'][0]['authoritativeRevision']!=revisions[products[0]] and first['receipt']['remoteProductIds'][0]['authoritativeRevision']==first['receipt']['items'][0]['authoritativeRevision'])
    counts=sql("select (select count(*) from public.inventory_product_prices)||','||(select count(*) from public.pos_sale_stock_movements);")
    replayitems=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'baseSnapshot':{'retailPrice':1200,'purchasePrice':900,'stockQuantity':10},'fieldMask':['purchasePrice','retailPrice','quantityDelta'],'changes':{'purchasePrice':950,'retailPrice':1300,'quantityDelta':.25}}]
    second=result(correction(items=replayitems))
    check('correction replay precedes stale revision check and preserves exact ACK',second['status']=='duplicate' and second['receipt']==first['receipt'])
    check('replayed correction creates no duplicate price history or stock delta',counts=='2,1' and counts==sql("select (select count(*) from public.inventory_product_prices)||','||(select count(*) from public.pos_sale_stock_movements);"))
    check('normal import cannot consume a correction identity',result(call('apply','correct-1'))['code']=='conflict')
    check('correction child lookup returns persisted ACK instead of false absence',result(call('receipt','correct-1'))['receipt']==first['receipt'])
    check('normal lookup with wrong canonical hash conflicts in correction namespace',result(call('receipt','correct-1',payload='sha256:'+'b'*64))['status']=='conflict')
    check('retirement returns accepted ACK if correction already committed',result(call('retire','correct-1'))['receipt']==first['receipt'])
    check('correction hash mismatch conflicts',result(correction(payload='sha256:'+'d'*64))['status']=='conflict')
    badrows=[{'clientItemId':'row-1','remoteProductId':products[1],'baseRevision':revisions[products[1]],'fieldMask':['retailPrice'],'changes':{'retailPrice':2300}},
      {'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['quantityDelta'],'changes':{'quantityDelta':.5}}]
    state=sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;")
    check('any stale row aborts all correction rows before DML',result(correction('stale',badrows))['reason']=='revision_conflict' and state==sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;"))
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    duplicate=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['quantityDelta'],'changes':{'quantityDelta':.1}}]*2
    check('duplicate product/item correction is refused before DML',result(correction('duplicate',duplicate))['code']=='validation_failed')
    mismatch=[{'clientItemId':'row-1','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['quantityDelta'],'changes':{'quantityDelta':.1}}]
    check('correction requires exact original client-item/product mapping',result(correction('badmap',mismatch))['reason']=='original_mapping_mismatch')
    unchanged=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'changes':{'retailPrice':1300}}]
    no_effect=result(correction('same-price',unchanged))
    check('unchanged included price writes no duplicate history',no_effect['status']=='accepted' and counts==sql("select (select count(*) from public.inventory_product_prices)||','||(select count(*) from public.pos_sale_stock_movements);"))
    check('durable no-effect ACK proves unchanged price without new price ID',no_effect['receipt']['items'][0]['unchangedFields']==['retailPrice'] and no_effect['receipt']['remotePriceIds']==[])
    # A late stock constraint simulates the existing reservation guard. Rollback
    # must include the earlier row and new price rows within the subtransaction.
    sql("create function public.fixture_reservation_guard() returns trigger language plpgsql as $$begin if new.id='"+products[1]+"' and new.stock_quantity<20 then raise exception 'reserved stock' using errcode='23514';end if;return new;end$$;create trigger fixture_reserved before update on public.inventory_products for each row execute function public.fixture_reservation_guard();")
    atomic=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'changes':{'retailPrice':1400}}, {'clientItemId':'row-1','remoteProductId':products[1],'baseRevision':revisions[products[1]],'fieldMask':['quantityDelta'],'changes':{'quantityDelta':-.25}}]
    state=sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;")
    failed=result(correction('atomic-failure',atomic))
    check('late constraint rolls back earlier row, price history and whole batch',failed['reason']=='mutation_conflict' and state==sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;") and counts==sql("select (select count(*) from public.inventory_product_prices)||','||(select count(*) from public.pos_sale_stock_movements);"))
    check('failed correction stores no successful receipt',sql("select count(*) from app_private.pos_catalog_import_corrections where client_import_id='atomic-failure';")=='0')
    # Receipt, including correction-target ACK, never changes economic state.
    def economic_digest():
        return sql("select md5(jsonb_build_object('products',(select jsonb_agg(to_jsonb(p) order by id) from public.inventory_products p),'prices',(select jsonb_agg(to_jsonb(p) order by id) from public.inventory_product_prices p),'movements',(select jsonb_agg(to_jsonb(p) order by movement_key) from public.pos_sale_stock_movements p),'legacy',(select jsonb_agg(to_jsonb(p)) from public.fixture_economic_writes p))::text);")
    before=economic_digest()
    result(call('receipt','correct-1'));result(call('retire','correct-1'));result(call('receipt','unknown-child'))
    check('accepted and absent receipt plus apply-won retirement write no economic tables',before==economic_digest())
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    forged=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'baseSnapshot':{'retailPrice':1},'changes':{'retailPrice':1700}}]
    before=economic_digest()
    check('masked snapshot mismatch refuses whole correction before any economic write',result(correction('snapshot-mismatch',forged))['reason']=='revision_conflict' and before==economic_digest())
    precision=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'changes':{'retailPrice':1.0001}}]
    check('direct RPC rejects prices beyond existing three-decimal precision',result(correction('precision',precision))['code']=='validation_failed')
    check('correction identity cannot clash with a normal accepted import key',result(correction('replacement'))['status']=='conflict')
    # A failed correction snapshot is not committable; explicitly retire it
    # before a replacement. Delayed correction uses the same permanent fence.
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    state=sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;")
    check('failed correction child lookup remains a noncommittable snapshot',result(call('receipt','child-retired'))['status']=='not_found')
    check('explicit child retirement stores permanent correction identity fence',result(call('retire','child-retired'))['status']=='retired')
    check('delayed retired correction is refused before economic writes',result(correction('child-retired'))['status']=='conflict' and state==sql("select md5(jsonb_agg(to_jsonb(p) order by id)::text) from public.inventory_products p;"))
    replacement=result(correction('child-replacement'))
    check('new correction identity with fresh base succeeds after child retirement',replacement['status']=='accepted')
    check('late retired correction remains blocked after replacement',result(correction('child-retired'))['status']=='conflict')
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    before=sql("select count(*) from public.inventory_product_prices;")
    check('future corrective timestamp rejects before price history',result(correction('future',created="'2099-01-01T00:00:00Z'"))['code']=='validation_failed' and before==sql("select count(*) from public.inventory_product_prices;"))
    check('old corrective timestamp rejects before price history',result(correction('old-date',created="clock_timestamp()-interval '181 days'"))['code']=='validation_failed')
    # Price-only updates do not narrow unrelated legacy stock through numeric(12,3).
    sql("update public.inventory_products set stock_quantity=1000000000000,purchase_price=null where id='"+products[0]+"';")
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    check('available snapshot preserves nullable purchase price',next(x for x in fresh if x['remoteProductId']==products[0])['purchasePrice'] is None)
    priceonly=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'changes':{'retailPrice':1500}}]
    check('price-only correction preserves large legacy stock without numeric overflow',result(correction('price-only-large-stock',priceonly))['status']=='accepted' and sql("select stock_quantity from public.inventory_products where id='"+products[0]+"';")=='1000000000000')
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    with concurrent.futures.ThreadPoolExecutor() as pool:
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '600 milliseconds';")
        future=pool.submit(sql,"begin;select 1 from public.inventory_products where id='"+products[0]+"' for update;select pg_sleep(1);commit;")
        time.sleep(.1)
        check('session expiry while waiting on product lock denies correction',result(correction('product-expiry',priceonly))['code']=='auth_denied')
        future.result()
        sql("update public.pos_sessions set expires_at=clock_timestamp()+interval '1 hour';")
    # Actual concurrent correction winner and retirement winner, same identity locks.
    fresh=result(call('receipt','original-linked'))['currentProductSnapshots'];revisions={x['remoteProductId']:x['baseRevision'] for x in fresh}
    priceonly=[{'clientItemId':'row-0','remoteProductId':products[0],'baseRevision':revisions[products[0]],'fieldMask':['retailPrice'],'changes':{'retailPrice':1600}}]
    racequery=correction('race-correction',priceonly)
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future=pool.submit(sql,'begin;'+racequery+'select pg_sleep(1);commit;')
        time.sleep(.1)
        accepted=result(call('retire','race-correction'))
        check('child retirement waits for correction winner and returns accepted ACK',accepted['status']=='accepted')
        future.result()
        future=pool.submit(holder,'race-child-retire','retire')
        time.sleep(.1)
        check('late child correction waits for retirement winner and rejects',result(correction('race-child-retire',priceonly))['status']=='conflict')
        future.result()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future=pool.submit(holder,'revocation-wait')
        time.sleep(.1)
        pending=pool.submit(result,call('receipt','revocation-wait'))
        time.sleep(.1)
        sql('update public.fixture_auth set valid=false;')
        check('revocation while identity wait is denied after lock release',pending.result()['code']=='auth_denied')
        future.result()
        sql('update public.fixture_auth set valid=true;')
    print(json.dumps({'result':'PASS'  ,'checks':len(PASS),'migrationSha256':hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),'correctionMigrationSha256':hashlib.sha256((ROOT / 'supabase/migrations/20261008200355_pos_catalog_import_linked_correction.sql').read_bytes()).hexdigest(),'scope':'owned synthetic PostgreSQL model; no external DB; legacy apply sentinel','checksPassed':PASS}),flush=True)
finally:
    # Stop/remove only this script's unique named container. No foreign process.
    if OWNED_CREATED:
        stopped = subprocess.run(['docker','stop','--time','10',NAME],capture_output=True,text=True,timeout=20)
        removed = subprocess.run(['docker','rm',NAME],capture_output=True,text=True,timeout=10)
        inspected = subprocess.run(['docker','inspect','--type','container',NAME],capture_output=True,text=True,timeout=10)
        absent = inspected.returncode == 1 and ('No such container' in inspected.stderr or 'No such object' in inspected.stderr)
        print(json.dumps({'ownedContainer':NAME,'stopExitCode':stopped.returncode,'removeExitCode':removed.returncode,'inspectExitCode':inspected.returncode,'observedAbsent':absent}),flush=True)
        if stopped.returncode != 0 or removed.returncode != 0 or not absent:
            raise RuntimeError('Owned container closure failed; no closure PASS claimed')
        print('OWNED_CONTAINER_CLOSED ' + NAME,flush=True)
    else:
        print('OWNED_CONTAINER_NOT_CREATED ' + NAME,flush=True)
