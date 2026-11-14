"""Two bounded SQL windows over real CLR-produced empty baseline sources.

Only the canonical disposable container and current synthetic POS leases.
Separate evidence from the three canonical grant/native/freeze cases. No
linked target, reconstructed source, native sale or generic cleanup is used.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import sys
import time
import uuid
from pathlib import Path


def main():
    p=argparse.ArgumentParser()
    for name in ('workdir','context','descriptor','output'):p.add_argument('--'+name,required=True)
    args=p.parse_args();source=Path(__file__).with_name('mobile-recovery-local-replay.py')
    spec=importlib.util.spec_from_file_location('asus019_recovery_owned',source);runner=importlib.util.module_from_spec(spec);sys.modules[spec.name]=runner;spec.loader.exec_module(runner)
    check=runner.require;root=runner.root_path(args.workdir);runner.prefix_manifest(root);runner.local_endpoint(root)
    check(json.loads((root/'.replay/complete.json').read_text())['status']=='LOCAL_CANONICAL_BYTE_EXACT_AND_PGTAP_PASS','BASELINE_CANONICAL_REQUIRED')
    ctx_path,descriptor_path,out=(Path(getattr(args,n)) for n in ('context','descriptor','output'))
    check(all(x.is_absolute() for x in (ctx_path,descriptor_path,out)) and not out.exists() and ctx_path.parent.resolve()==out.parent.resolve()==descriptor_path.parent.resolve(),'BASELINE_PRIVATE_PATHS')
    check(all(not x.is_symlink() for path in (ctx_path,descriptor_path,out) for x in (path,*path.parents)),'BASELINE_REPARSE_DENIED')
    check(ctx_path.stat().st_size<=65536 and descriptor_path.stat().st_size<=4096,'BASELINE_CONTEXT_CAPACITY')
    context=json.loads(ctx_path.read_text());desc=json.loads(descriptor_path.read_text());kind=desc['kind']
    check(context.get('recoveryRaces') is True and desc['schema']=='asus019-baseline-lock-v1' and desc['nonce']==context['nonce'] and re.fullmatch('[0-9a-f]{32}',desc['nonce']) and kind in ('apply_recovery','two_recoveries'),'BASELINE_SCOPE')
    group=context['recoveryActors'][kind];original=group['original'];fresh=group['fresh'];later=group['later'];shop=context['shopId']
    check(shop=='10000000-0000-4000-8000-000000003019' and desc['shopId']==shop and desc['deviceId']==original['deviceId'] and desc['originalSessionId']==original['sessionId'],'BASELINE_ACTOR_SCOPE')
    check(original['deviceId'] not in (context['actorA']['deviceId'],context['actorB']['deviceId']),'BASELINE_DISTINCT_DEVICE_REQUIRED')
    for value in [shop,context['staffId'],desc['deviceId'],desc['runId'],desc['applyRequestKey'],*[a['sessionId'] for a in (original,fresh,later)]]:check(str(uuid.UUID(value))==value,'BASELINE_ID')
    check(len({a['sessionId'] for a in (original,fresh,later)})==3 and all(a['deviceId']==original['deviceId'] and a['deviceToken']==original['deviceToken'] and a['credentialId']==original['credentialId'] for a in (fresh,later)),'BASELINE_FRESH_SESSIONS')
    check(re.fullmatch('[0-9a-f]{64}',desc['previousReviewDigest']) and re.fullmatch('[0-9a-f]{40}',context['clientSha']) and context['credentialVersion']==7,'BASELINE_REVIEW_SCOPE')
    q=lambda value:"'"+str(value).replace("'","''")+"'"
    sha=lambda value:hashlib.sha256(value.encode()).hexdigest()
    def call(actor,op,payload):
        return 'public.payment_history_device_v2('+','.join([q(shop)+'::uuid',q(actor['deviceId'])+'::uuid',q(context['staffId'])+'::uuid',q(actor['sessionId'])+'::uuid',q('sha256:'+sha(actor['deviceToken'])),q('sha256:'+sha(actor['sessionToken'])),'7',q(op),q(json.dumps(payload,separators=(',',':')))+'::jsonb'])+')'
    apply={'run_id':desc['runId'],'request_key':desc['applyRequestKey'],'review_digest':desc['previousReviewDigest']}
    def recover(key):return {'run_id':desc['runId'],'apply_request_key':desc['applyRequestKey'],'recovery_request_key':key,'previous_review_digest':desc['previousReviewDigest']}
    report={'schema':'asus019-baseline-lock-v1','status':'FAIL','kind':kind,'syntheticOnly':True,'ownedLocalOnly':True,'coverage':'authenticated SQL engine lock windows; HTTP and WPF not claimed','clientSha':context['clientSha'],'descriptorSHA256':sha(descriptor_path.read_text()),'cases':[],'cleanup':[]}
    h=None
    transaction_settings="SET LOCAL statement_timeout='8s'; SET LOCAL search_path=pg_catalog; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{\"role\":\"service_role\"}'; SET LOCAL lock_timeout='6s';\n"
    def start(side):
        child=h.start(side);child.send(transaction_settings);return child
    def outcome(side,label,expression):
        h.children[side].send('CREATE FUNCTION pg_temp.capture_'+label.lower()+"() RETURNS jsonb LANGUAGE plpgsql AS $b$ DECLARE v jsonb; BEGIN v:="+expression+"; RETURN jsonb_build_object('sqlstate','00000','value',v); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'code',CASE WHEN SQLERRM ~ '^payment_history_[a-z_]{1,90}$' THEN SQLERRM ELSE 'unclassified' END); END $b$;\n"+h.emit(side,label,",'result',pg_temp.capture_"+label.lower()+'()'))
    def result(side,label):
        r=h.frame(side,label)['result']
        if r['sqlstate']!='00000':report['operationFailure']={'label':label,'sqlstate':r['sqlstate'],'code':r.get('code','unclassified')}
        check(r['sqlstate']=='00000','BASELINE_'+label+'_REJECTED');check(r['value'].get('ok') is True,'BASELINE_RESPONSE_INVALID');return r['value']['result']
    def commit(side,label):
        # SET LOCAL expires at COMMIT. Every new transaction needs the same
        # authenticated gateway context and the original bounded timeouts.
        h.children[side].send('COMMIT; BEGIN;\n'+transaction_settings+h.emit(side,label,",'role',auth.role(),'statementTimeout',current_setting('statement_timeout'),'lockTimeout',current_setting('lock_timeout'),'searchPath',current_setting('search_path')"))
        context=h.frame(side,label)
        check(context['role']=='service_role' and context['statementTimeout']=='8s' and context['lockTimeout']=='6s' and context['searchPath']=='pg_catalog','BASELINE_TRANSACTION_CONTEXT')
        report.setdefault('transactionContexts',[]).append({'side':side,'label':label,'gatewayRoleRestored':True,'statementTimeout':'8s','lockTimeout':'6s','searchPath':'pg_catalog'})
    def query(label):
        expression="jsonb_build_object('state',j.state,'actorSession',j.actor_session_id,'fence',j.lease_fence,'reviewClear',j.review_digest is null,'sourceRows',(select count(*) from public.payment_history_migration_movements where run_id=j.run_id),'receipts',case when j.receipt is not null and j.apply_request_key="+q(desc['applyRequestKey'])+"::uuid then 1 else 0 end,'bankReceipts',(select count(*) from public.payment_history_receipts where shop_id=j.shop_id),'intents',(select count(*) from app_private.payment_history_baseline_recovery_intents where shop_id=j.shop_id and run_id=j.run_id),'native',(select count(*) from public.pos_sales where shop_id=j.shop_id)+(select count(*) from public.pos_sale_stock_movements where shop_id=j.shop_id),'active',(select count(*) from public.payment_history_movement_versions where shop_id=j.shop_id and active),'economicsSHA256',(select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(v) order by to_jsonb(v)::text),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') from public.payment_history_movement_versions v where v.shop_id=j.shop_id and v.active),'receipt',j.receipt::text)"
        h.children['observer'].send(h.emit('observer',label,",'state',(select "+expression+' from public.payment_history_migration_runs j where j.shop_id='+q(shop)+'::uuid and j.run_id='+q(desc['runId'])+'::uuid)'));return h.frame('observer',label)['state']
    def wait(waiter,blocker):
        deadline=min(h.deadline,time.monotonic()+3);i=0
        while True:
            i+=1;label='WAIT'+str(i);pid=h.identities[waiter]['pid']
            h.children['observer'].send('SELECT pg_stat_clear_snapshot();\n'+h.emit('observer',label,",'wait',(select jsonb_build_object('pid',pid,'backendStart',backend_start,'xactStart',xact_start,'waitType',wait_event_type,'waitEvent',wait_event,'blockers',pg_blocking_pids(pid)) from pg_stat_activity where pid="+str(pid)+')'))
            row=h.frame('observer',label)['wait']
            if row and row['waitType']=='Lock' and h.identities[blocker]['pid'] in row['blockers']:return row
            check(time.monotonic()<deadline,'BASELINE_LOCK_NOT_OBSERVED');h.pump(deadline)
    def ack(value,actor,state):
        raw=value['recovery_ack_json'];r=json.loads(raw);check(r['state']==state and r['session_id']==actor['sessionId'] and r['apply_request_key']==desc['applyRequestKey'] and r['run_id']==desc['runId'],'BASELINE_ACK_CHANGED');return raw
    def applied_receipt(side,label,value):
        # baseline_apply returns the migration receipt itself. Capture its
        # canonical database text in the same transaction while its job lock
        # is still held; recovery must return these exact original bytes.
        check(isinstance(value,dict) and value.get('kind')=='migrate' and value.get('source_run_id')==desc['runId'],'BASELINE_APPLY_RECEIPT_SHAPE')
        h.children[side].send(h.emit(side,label,",'receipt',(select j.receipt::text from public.payment_history_migration_runs j where j.shop_id="+q(shop)+'::uuid and j.run_id='+q(desc['runId'])+'::uuid and j.apply_request_key='+q(desc['applyRequestKey'])+'::uuid)'))
        raw=h.frame(side,label)['receipt'];check(isinstance(raw,str) and json.loads(raw)==value,'BASELINE_ORIGINAL_RECEIPT_REQUIRED');return raw
    try:
        h=runner._GuardedLockCase(root,'history-baseline-'+kind);start('observer');before=query('BEFORE')
        check(before and before['state']=='review_ready' and before['sourceRows']==0 and before['receipts']==0 and before['native']==0 and before['actorSession']==original['sessionId'],'BASELINE_EMPTY_SOURCE_REQUIRED')
        start('first');start('second');key1=str(uuid.uuid4());key2=str(uuid.uuid4())
        if kind=='apply_recovery':
            outcome('first','APPLY',call(original,'baseline_apply',apply));applied=result('first','APPLY');raw=applied_receipt('first','APPLY_RECEIPT',applied)
            outcome('second','RECOVER',call(fresh,'baseline_recover',recover(key1)));witness=wait('second','first');commit('first','FIRST_COMMITTED');recovered=result('second','RECOVER');ack(recovered,fresh,'committed');check(recovered['receipt_json']==raw,'BASELINE_ORIGINAL_RECEIPT_CHANGED')
            outcome('second','REPLAY',call(fresh,'baseline_recover',recover(key1)));again=result('second','REPLAY');check(again==recovered,'BASELINE_COMMITTED_REPLAY_CHANGED');commit('second','SECOND_COMMITTED')
            after=query('AFTER');check(after['state']=='applied' and after['receipts']==1 and after['receipt']==raw and after['sourceRows']==0 and after['native']==0 and after['active']==before['active'] and after['economicsSHA256']==before['economicsSHA256'] and after['bankReceipts']==before['bankReceipts'],'BASELINE_COMMITTED_COUNTS')
            report['cases'].append({'id':'baseline-apply-before-current-session-recovery','status':'PASS','wait':witness,'originalReceiptSHA256':sha(raw),'canonicalBaselineReceipts':1,'newBankReceipts':0,'nativeRows':0,'activeEconomicsUnchanged':True,'originalEconomicsSHA256':before['economicsSHA256']})
        else:
            outcome('first','RECOVER',call(fresh,'baseline_recover',recover(key1)));one=result('first','RECOVER');raw1=ack(one,fresh,'uncommitted');check(one['receipt_json'] is None,'BASELINE_UNCOMMITTED_RECEIPT')
            outcome('first','REPLAY',call(fresh,'baseline_recover',recover(key1)));check(result('first','REPLAY')==one,'BASELINE_FIRST_REPLAY_CHANGED')
            outcome('second','RECOVER',call(later,'baseline_recover',recover(key2)));witness=wait('second','first');commit('first','FIRST_COMMITTED');two=result('second','RECOVER');raw2=ack(two,later,'uncommitted');check(two['receipt_json'] is None,'BASELINE_SECOND_UNCOMMITTED_RECEIPT')
            outcome('second','REPLAY',call(later,'baseline_recover',recover(key2)));check(result('second','REPLAY')==two,'BASELINE_SECOND_REPLAY_CHANGED');commit('second','SECOND_COMMITTED')
            after=query('AFTER');check(after['state']=='review_ready' and after['actorSession']==later['sessionId'] and after['reviewClear'] and after['intents']==2 and after['fence']==before['fence']+2 and after['receipts']==0 and after['native']==0 and after['active']==before['active'] and after['economicsSHA256']==before['economicsSHA256'],'BASELINE_RECOVERY_COUNTS')
            # Finish this exact empty source through its current authenticated
            # actor/review/Apply. No unresolved server fixture or generic delete.
            outcome('second','REVIEW',call(later,'baseline_review',{'run_id':desc['runId']}));review=result('second','REVIEW');check(review['can_apply'] is True,'BASELINE_FINAL_REVIEW_BLOCKED')
            outcome('second','APPLY',call(later,'baseline_apply',{**apply,'review_digest':review['review_digest']}));completed=result('second','APPLY');raw=applied_receipt('second','FINAL_RECEIPT',completed);commit('second','FINAL_COMMITTED');final=query('FINAL')
            check(final['state']=='applied' and final['receipts']==1 and final['receipt']==raw and final['active']==before['active'] and final['economicsSHA256']==before['economicsSHA256'] and final['native']==0 and final['bankReceipts']==before['bankReceipts'],'BASELINE_FINAL_COUNTS')
            report['cases'].append({'id':'baseline-two-current-session-recoveries','status':'PASS','wait':witness,'immutableRecoveryIntents':2,'leaseFenceIncrements':2,'receiptsDuringRecovery':0,'firstAckSHA256':sha(raw1),'secondAckSHA256':sha(raw2),'emptySourceCompleted':True,'newBankReceipts':0,'nativeRows':0,'activeEconomicsUnchanged':True,'originalEconomicsSHA256':before['economicsSHA256']})
        report['status']='PASS'
    except BaseException as error:
        report['failureException']=type(error).__name__
        if isinstance(error,KeyError) and len(error.args)==1 and isinstance(error.args[0],str) and re.fullmatch('[a-z_]{1,64}',error.args[0]):report['missingField']=error.args[0]
        report['failureCode']=str(error) if re.fullmatch('[A-Z][A-Z0-9_]{0,79}',str(error)) else 'BASELINE_UNEXPECTED';raise
    finally:
        if h is not None:
            closed=h.close();report['cleanup']=[{'side':x['side'],'exit':x['exit'],'rollbackAndNaturalExit':x['rollbackAndNaturalExit'],'sqlstates':x['sqlstates'],'stderrSQLSTATES':re.findall(r'(?:ERROR|FATAL):\s+([0-9A-Z]{5})(?:\s|$)',x['stderr'])[:8]} for x in closed]
            if not all(x['rollbackAndNaturalExit'] for x in closed):report['status']='FAIL';report['cleanupUnproven']=True
        with out.open('x',encoding='utf-8') as f:json.dump(report,f,indent=2);f.write('\n')
    check(report['status']=='PASS','BASELINE_CLEANUP_UNPROVEN');print(json.dumps({'status':'PASS','cases':report['cases'],'evidenceSHA256':hashlib.sha256(out.read_bytes()).hexdigest()}))


if __name__=='__main__':
    try:main()
    except BaseException:sys.stderr.write('baseline_recovery_lock_failed\n');sys.exit(1)
