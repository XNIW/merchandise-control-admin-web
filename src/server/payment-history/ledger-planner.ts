import type {GetnetTransaction} from "./getnet-contract";
import {checkedClp} from "./value-rules";
import {demandUuid,economicDigest,economics,economicsConflict,globalMovementIdentity,historyRequestDigest,merchantAliasKey,verifiedPolicyCovers,
    type HistoryActor,type LedgerMovement,type LedgerRuntime,type MerchantBinding,type ReviewedPolicy} from "./ledger-contract";

export type HistoryCorrection={identityKey:string;previousVersionId:string;previousDigest:string;proposedDigest:string;evidenceId:string;contextDigest:string};
export type HistoryPlanInput={runtime:LedgerRuntime;actor:HistoryActor;rows:readonly GetnetTransaction[];existing:readonly LedgerMovement[];
    bindings:readonly MerchantBinding[];policies:readonly ReviewedPolicy[];nativeStartTicks:string|null;corrections:readonly HistoryCorrection[]};
type Decision={ordinal:number;identityKey:string|null;merchantId:string|null;economicDigest:string|null;kind:"new"|"duplicate"|"conflict"|"blocked";code:string;previousVersionId:string|null};
export function correctionContext(runtime:LedgerRuntime,identityKey:string,previous:LedgerMovement,proposedDigest:string,row:GetnetTransaction) {
    return historyRequestDigest({shop:runtime.shopId,dataset:runtime.datasetId,revision:runtime.revision,epoch:runtime.writerEpoch,identityKey,
        previousVersion:previous.versionId,previousDigest:previous.economicDigest,proposedDigest,source:row.source});
}
// Pure deterministic review. Only the SQL transaction may authorize or publish money.
export function planHistoryImport(input:HistoryPlanInput) {
    demandUuid(input.runtime.shopId);demandUuid(input.runtime.datasetId);demandUuid(input.actor.id);demandUuid(input.actor.sessionId);
    if(!input.rows.length||input.rows.length>100000||input.bindings.length>200||input.corrections.length>200)throw Error("history_plan_limit");
    const bindings=new Map(input.bindings.map(binding=>[binding.aliasKey,binding]));
    if(bindings.size!==input.bindings.length)throw Error("history_ambiguous_alias");
    const active=new Map<string,LedgerMovement>(),inactive=new Map<string,LedgerMovement>();
    for(const row of input.existing){if(row.active){if(active.has(row.identityKey))throw Error("history_ambiguous_active_identity");active.set(row.identityKey,row);}else if(!inactive.has(row.identityKey))inactive.set(row.identityKey,row);}
    const corrections=new Map(input.corrections.map(c=>[c.identityKey,c]));
    if(corrections.size!==input.corrections.length)throw Error("history_ambiguous_correction");
    const observed=new Map<string,ReturnType<typeof economics>[]>(),decisions:Decision[]=[],newRows:GetnetTransaction[]=[];
    const policy=(row:GetnetTransaction,merchant:string,kind:ReviewedPolicy["kind"])=>input.policies.some(p=>verifiedPolicyCovers(p,row,merchant,kind));
    for(const [index,row] of input.rows.entries()){
        const decision:Decision={ordinal:index+1,identityKey:null,merchantId:null,economicDigest:null,kind:"blocked",code:"history_merchant_unverified",previousVersionId:null};
        decisions.push(decision);
        const binding=bindings.get(merchantAliasKey(row.merchant));
        if(!binding?.verified||binding.evidenceLevel==="unverified"||!input.policies.some(p=>p.id===binding.evidenceId&&verifiedPolicyCovers(p,row,binding.merchantId,"merchant_mapping")))continue;
        decision.merchantId=demandUuid(binding.merchantId);
        if(!row.timestamp.businessDateTime){decision.code="history_time_unresolved";continue;}
        const value=economics(row),fingerprint=economicDigest(value);
        decision.identityKey=globalMovementIdentity(input.runtime.shopId,binding.merchantId,row.externalNamespace,row.externalId);decision.economicDigest=fingerprint;
        if(row.profile==="GetnetModern"&&!policy(row,binding.merchantId,"modern_time")){decision.code="history_provider_time_unverified";continue;}
        if(row.profile==="GetnetLegacy"&&!policy(row,binding.merchantId,"legacy_currency")){decision.code="history_currency_unverified";continue;}
        if(!policy(row,binding.merchantId,"native_start")){decision.code="history_native_start_unverified";continue;}
        if(input.nativeStartTicks!==null&&BigInt(value.businessTicks)>=BigInt(input.nativeStartTicks)){decision.code="history_native_overlap";continue;}
        // Check every known component across duplicate candidates: an unknown value must not
        // hide a conflict between two later known values. The first payload retains ownership.
        const earlier=observed.get(decision.identityKey)??[];
        const current=active.get(decision.identityKey);
        if(earlier.some(other=>economicsConflict(other,value))||current&&economicsConflict(current,value)){
            decision.kind="conflict";decision.code="history_active_economics_conflict";continue;
        }
        earlier.push(value);observed.set(decision.identityKey,earlier);
        if(current||earlier.length>1){decision.kind="duplicate";decision.code="history_duplicate";decision.previousVersionId=current?.versionId??null;continue;}
        const previous=inactive.get(decision.identityKey);
        if(previous&&economicsConflict(previous,value)){
            const approval=corrections.get(decision.identityKey);
            if(!approval||approval.previousVersionId!==previous.versionId||approval.previousDigest!==previous.economicDigest||approval.proposedDigest!==fingerprint||
                approval.contextDigest!==correctionContext(input.runtime,decision.identityKey,previous,fingerprint,row)||
                !input.policies.some(p=>p.id===approval.evidenceId&&verifiedPolicyCovers(p,row,binding.merchantId,"economic_correction"))){
                decision.code="history_inactive_correction_unapproved";continue;
            }
        }
        decision.kind="new";decision.code=previous?"history_reactivation":"history_new";decision.previousVersionId=previous?.versionId??null;newRows.push(row);
    }
    const sum=(values:(string|null)[])=>checkedClp(values.reduce((total,value)=>total+BigInt(value??"0"),BigInt("0"))).toString();
    let gross:string|null=null,net:string|null=null,overflow=false;
    try{gross=sum(newRows.map(row=>row.grossClp));net=sum(newRows.map(row=>row.netClp));}catch{overflow=true;}
    const counts={new:decisions.filter(d=>d.kind==="new").length,duplicates:decisions.filter(d=>d.kind==="duplicate").length,
        conflicts:decisions.filter(d=>d.kind==="conflict").length,blocked:decisions.filter(d=>d.kind==="blocked").length};
    const writerReady=input.runtime.writerAuthority==="web"&&input.runtime.inventoryVerified;
    const plan={shopId:input.runtime.shopId,datasetId:input.runtime.datasetId,revision:input.runtime.revision,writerEpoch:input.runtime.writerEpoch,
        actor:input.actor,decisions,counts,newGrossClp:gross,knownNewNetClp:net,knownNewNetCount:newRows.filter(r=>r.netClp!==null).length,
        totalNetClp:newRows.every(r=>r.netClp!==null)?net:null,overflow,writerReady,
        canCommit:writerReady&&!overflow&&counts.conflicts===0&&counts.blocked===0};
    return {...plan,reviewDigest:historyRequestDigest({...plan,rows:input.rows.map(row=>({...row})),bindings:input.bindings.map(binding=>({...binding})),nativeStartTicks:input.nativeStartTicks,
        corrections:input.corrections.map(correction=>({...correction})),proofs:input.policies.map(p=>({...p})).sort((a,b)=>a.id.localeCompare(b.id))})};
}
