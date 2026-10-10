import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseForPosCatalogImport, validatePosCatalogImportAuth, type PosCatalogImportRequestMeta } from "./catalog-import-sync";
import { parsePosCatalogImportCorrection, unwrapSavedForensicRequest } from "./catalog-import-recovery-contract";
import { boundedFrame, MAX_PAGE_JSON_BYTES, MAX_PLAN_CHILDREN, normalizeChildPage, normalizeCoveragePage, normalizeOriginalPage, parseManifestRegistration, parsePagedBytes } from "./catalog-import-multipart-paging";
import { businessOriginal, hydrateOriginal, isHash, isUuid, MULTIPART_SCHEMA, parseLargeOriginal, parseRecoveryPlan, parseRecoveryTrust, parseUpload, rebuildUpload, record, type Contributor, type PredecessorPart } from "./catalog-import-multipart-contract";

export const RECOVERY_ACTIONS=["upload","finalize","receipt","retire","plan","apply","receipt-page"] as const;
export type RecoveryAction=typeof RECOVERY_ACTIONS[number];
function failure(code:string,status=400) { return {status,body:{ok:false,code,message:"POS multipart recovery request failed."}}; }
function errorStatus(code:unknown) {return code==="auth_denied"?401:code==="scope_changed"||code==="conflict"||code==="quota_exceeded"||code==="phased_upload_required"?409:code==="not_configured"?503:code==="not_found"?404:code==="validation_failed"||code==="projection_too_large"||code==="original_bytes_or_unicode_unsupported"||code==="original_bytes_or_numeric_precision_unsupported"?400:500;}

export async function handlePosCatalogImportMultipart(action:RecoveryAction,input:unknown,meta:PosCatalogImportRequestMeta={}) {
  const trust=parseRecoveryTrust(input);
  if (!trust || !record(input) || !RECOVERY_ACTIONS.includes(action)) return failure("validation_failed");
  const supabase=await getSupabaseForPosCatalogImport();
  if (!supabase) return failure("not_configured",503);
  const auth=await validatePosCatalogImportAuth(supabase,trust,meta,false);
  if (auth.result) return auth.result;
  const {context}=auth;
  const rpc=async(operation:string,payload:unknown)=>{
    const result=await supabase.rpc("pos_catalog_import_recovery_v1",{
      p_shop_id:context.session.shop_id,p_shop_device_id:context.session.shop_device_id,p_staff_id:context.staff.staff_id,
      p_pos_session_id:context.session.pos_session_id,p_owner_user_id:context.ownerUserId,p_action:operation,p_payload:payload as Json,
    });
    if (result.error || !record(result.data)) return null;
    if (result.data.ok===true && (result.data.shopId!==context.session.shop_id || result.data.shopDeviceId!==context.session.shop_device_id)) return null;
    return result.data;
  };
  const getOriginal=async(id:string)=>{
    const data=await rpc("read-original",{verifiedOriginalId:id});
    return data?.ok===true && data.status==="verified" && data.verifiedOriginalId===id && record(data.normalizedRequest)?data:null;
  };
  // Only selected immutable proof rows enter Worker memory. Private SQL caps
  // each response; split the same selection without trusting a caller subset.
  const readProofSelection=async(operation:string,payload:Record<string,unknown>,ids:string[]):Promise<Record<string,unknown>[]|null>=>{
    const proof=await rpc(operation,{...payload,clientItemIds:ids});
    if(!proof)return null;
    if(proof.code==="projection_too_large") {
      if(ids.length<2)return null;const at=Math.ceil(ids.length/2);
      const first=await readProofSelection(operation,payload,ids.slice(0,at));if(!first)return null;
      const second=await readProofSelection(operation,payload,ids.slice(at));return second?[...first,...second]:null;
    }
    return boundedFrame(proof) && Buffer.byteLength(JSON.stringify(proof),"utf8")<=MAX_PAGE_JSON_BYTES?[proof]:null;
  };
  const collectProofs=async(coverage:unknown[],originalId:string,supersedes:unknown)=>{
      const contributors=new Map<string,Contributor>();
      if (!Array.isArray(coverage)) return null;
      const ids=new Set(coverage.filter(entry=>record(entry)&&entry.kind==="accepted_contributor").map(entry=>(entry as Record<string,unknown>).verifiedContributorId));
      if (ids.size>128) return null;
      for (const id of ids) {
        if (!isUuid(id)) return null;
        const wanted=Array.from(new Set(coverage.filter(entry=>record(entry) && entry.kind==="accepted_contributor" && entry.verifiedContributorId===id)
          .map(entry=>(entry as Record<string,unknown>).contributorClientItemId)));
        if (!wanted.length || wanted.some(value=>typeof value!=="string")) return null;
        const productByClientId=new Map<string,string>();const rawItems:Record<string,unknown>[]=[];let receiptSha256:string|undefined;
        for(let at=0;at<wanted.length;at+=1000) {
          const selections=await readProofSelection("read-receipt",{verifiedOriginalId:id},wanted.slice(at,at+1000) as string[]);if(!selections)return null;
          for(const receipt of selections) {
          if (receipt.status!=="accepted" || receipt.receiptValidated!==true || !isHash(receipt.receiptSha256) ||
            receiptSha256!==undefined && receipt.receiptSha256!==receiptSha256 || receipt.originalSchemaVersion!=="pos-catalog-import-v1" ||
            !Array.isArray(receipt.remoteProductIds) || receipt.remoteProductIds.length>1000 || !Array.isArray(receipt.rawItems) || receipt.rawItems.length>1000 || !receipt.rawItems.every(record))
            return null;
          receiptSha256=receipt.receiptSha256;rawItems.push(...receipt.rawItems as Record<string,unknown>[]);
          for(const mapping of receipt.remoteProductIds) {
            if (!record(mapping) || typeof mapping.clientItemId!=="string" || !wanted.slice(at,at+1000).includes(mapping.clientItemId) ||
              !isUuid(mapping.remoteProductId) || productByClientId.has(mapping.clientItemId)) return null;
            productByClientId.set(mapping.clientItemId,mapping.remoteProductId);
          }
          }
        }
        contributors.set(id,{rawItems,receiptSha256:receiptSha256!,productByClientId});
      }
      const predecessorParts=new Map<string,PredecessorPart>();
      if(supersedes!==undefined) {
        if(!record(supersedes) || !isUuid(supersedes.planId)) return null;
        const wanted=new Map<string,{planId:string;index:number;clientItemIds:string[]}>();
        for(const entry of coverage) if(record(entry) && entry.kind==="accepted_plan_part") {
          if(!Number.isInteger(entry.contributorPartIndex) || typeof entry.contributorClientItemId!=="string") return null;
          const index=Number(entry.contributorPartIndex);const planId=entry.contributorPlanId??supersedes.planId;
          if(!isUuid(planId)) return null;const key=`${planId}:${index}`;
          wanted.set(key,{planId,index,clientItemIds:[...(wanted.get(key)?.clientItemIds??[]),entry.contributorClientItemId]});
        }
        for(const [key,{planId,index,clientItemIds}] of wanted) {
          if(clientItemIds.length>1000) return null;
          const selections=await readProofSelection("read-plan-part",{planId,predecessorPlanId:supersedes.planId,partIndex:index,verifiedOriginalId:originalId},clientItemIds);if(!selections)return null;
          const productByClientId:PredecessorPart["productByClientId"]=new Map();let receiptSha256:string|undefined;let canonicalPayloadHash:string|undefined;
          for(const proof of selections) {
          if(proof.status!=="accepted" || proof.receiptValidated!==true || !isHash(proof.receiptSha256) || !isHash(proof.canonicalPayloadHash) ||
            receiptSha256!==undefined && proof.receiptSha256!==receiptSha256 || canonicalPayloadHash!==undefined && proof.canonicalPayloadHash!==canonicalPayloadHash ||
            !Array.isArray(proof.items) || !proof.items.length || proof.items.length>1000) return null;
          receiptSha256=proof.receiptSha256;canonicalPayloadHash=proof.canonicalPayloadHash;
          for(const item of proof.items) {
            if(!record(item) || typeof item.clientItemId!=="string" || !clientItemIds.includes(item.clientItemId) ||
              !["accepted","duplicate","skipped"].includes(String(item.itemStatus)) || typeof item.economic!=="boolean" ||
              item.economic && (!isUuid(item.remoteProductId) || item.itemStatus==="skipped") || !item.economic && item.remoteProductId!==null ||
              typeof item.barcode!=="string" || typeof item.originalClientItemId!=="string" || productByClientId.has(item.clientItemId)) return null;
            productByClientId.set(item.clientItemId,{remoteProductId:item.remoteProductId as string|null,barcode:item.barcode,originalClientItemId:item.originalClientItemId,itemStatus:item.itemStatus as "accepted"|"duplicate"|"skipped"});
          }
          }
          if(productByClientId.size!==clientItemIds.length)return null;
          predecessorParts.set(key,{receiptSha256:receiptSha256!,canonicalPayloadHash:canonicalPayloadHash!,productByClientId});
        }
      }
    return {contributors,predecessorParts};
  };
  let result:Record<string,unknown>|null=null;
  if (action==="upload" && input.phase!==undefined) {
    if(input.phase==="manifest") {
      const page=parseManifestRegistration(input);if(!page)return failure("validation_failed");
      result=await rpc("manifest",page);
    } else if(input.phase==="seal" && isUuid(input.uploadId) && isHash(input.manifestSha256)) {
      result=await rpc("seal",{uploadId:input.uploadId,manifestSha256:input.manifestSha256});
    } else if(input.phase==="bytes") {
      const page=parsePagedBytes(input);if(!page)return failure("validation_failed");
      result=await rpc("bytes",page);
    } else return failure("validation_failed");
  } else if ((action==="finalize" || action==="plan") && input.phase!==undefined) {
    if(!isUuid(input.uploadId))return failure("validation_failed");
    if(input.phase==="prepare") result=await rpc(action==="finalize"?"prepare-original":"prepare-plan",{uploadId:input.uploadId});
    else if(input.phase==="complete" && isHash(input.rawSha256)) result=await rpc(action==="finalize"?"complete-original":"complete-plan",{uploadId:input.uploadId,rawSha256:input.rawSha256});
    else if(input.phase==="normalize" && isHash(input.rawSha256) && Number.isInteger(input.cursor) && Number(input.cursor)>=0 && Number(input.cursor)<=1025024 &&
      (action==="finalize" || ["children","coverage"].includes(String(input.stage)))) {
      const page=await rpc("read-normalize-page",{uploadId:input.uploadId,rawSha256:input.rawSha256,cursor:input.cursor,...(action==="plan"?{stage:input.stage}:{})});
      if(!page)return failure("db_failure",500);
      if(page.ok!==true)return failure(String(page.code??"db_failure"),errorStatus(page.code));
      if(page.status==="conflict") result=page;
      else if(page.pageComplete===true && record(page.response))result=page.response;
      else {
        if(!boundedFrame(page))return failure("projection_too_large");
        let normalized:Record<string,unknown>|null=null;
        if(page.stage==="items")normalized=normalizeOriginalPage(page,trust);
        else if(page.stage==="children" || page.stage==="correction")normalized=normalizeChildPage(page,trust);
        else if(page.stage==="coverage" && Array.isArray(page.items) && record(page.header) && isUuid(page.header.verifiedOriginalId)) {
          const proofs=await collectProofs(page.items,page.header.verifiedOriginalId,page.header.supersedes);
          if(!proofs)return failure("contributor_receipt_unavailable",409);
          normalized=normalizeCoveragePage(page,trust,proofs.contributors,proofs.predecessorParts);
        }
        if(!normalized || !Array.isArray(normalized.items)) {
          await rpc("fail-normalization",{uploadId:input.uploadId,rawSha256:input.rawSha256});
          return failure("validation_failed");
        }
        result=await rpc("store-normalize-page",{uploadId:input.uploadId,rawSha256:input.rawSha256,cursor:input.cursor,stage:page.stage,
          ...normalized,canonicalRows:normalized.items.map(item=>JSON.stringify(item))});
      }
    } else return failure("validation_failed");
  } else if (action==="upload") {
    const upload=parseUpload(input);
    if (!upload) return failure("validation_failed");
    result=await rpc("upload",upload);
  } else if (action==="finalize" || action==="plan") {
    if (!isUuid(input.uploadId)) return failure("validation_failed");
    const packet=await rpc("read-upload",{uploadId:input.uploadId});
    if (!packet) return failure("db_failure",500);
    if (packet.ok!==true) return failure(String(packet.code??"db_failure"),errorStatus(packet.code));
    const upload=rebuildUpload(packet);
    if (!upload) return failure("original_bytes_or_numeric_precision_unsupported");
    if (action==="finalize") {
      if (upload.manifest.mode!=="original" || !record(upload.value)) return failure("validation_failed");
      let normalized:unknown;let clientImportId:unknown;let idempotencyKey:unknown;let declaredHash:unknown;let canonicalHash:unknown;let count:unknown;
      const savedRequest=unwrapSavedForensicRequest(upload.value);
      if (!record(savedRequest) || typeof upload.manifest.declaredPayloadHash!=="string") return failure("validation_failed");
      const originalSchemaVersion=savedRequest.schemaVersion;
      if (originalSchemaVersion==="pos-catalog-import-correction-v1") {
        if (upload.manifest.originalKind!=="correction" || savedRequest.shopDeviceId!==undefined && savedRequest.shopDeviceId!==trust.shopDeviceId ||
          savedRequest.shopCode!==undefined && savedRequest.shopCode!==trust.shopCode || !record(savedRequest.correction) ||
          savedRequest.correction.payloadHash!==undefined && savedRequest.correction.payloadHash!==upload.manifest.declaredPayloadHash) return failure("validation_failed");
        if (!record(savedRequest.recoveryOf)) return failure("validation_failed");
        let root;
        if (isUuid(savedRequest.recoveryOf.verifiedOriginalId)) {
          const stored=await getOriginal(savedRequest.recoveryOf.verifiedOriginalId);
          if (!stored || stored.originalSchemaVersion!=="pos-catalog-import-v1") return failure("original_receipt_unavailable",409);
          root=hydrateOriginal(stored.normalizedRequest,trust);
          if (!root) return failure("db_failure",500);
        } else if (record(savedRequest.recoveryOf.originalRequest) && typeof savedRequest.recoveryOf.payloadHash==="string") {
          root=parseLargeOriginal(savedRequest.recoveryOf.originalRequest,trust,savedRequest.recoveryOf.payloadHash);
          if (!root) return failure("validation_failed");
        }
        const parsed=parsePosCatalogImportCorrection({...savedRequest,correction:{...savedRequest.correction,payloadHash:upload.manifest.declaredPayloadHash},...trust},root??undefined);
        if (!parsed) return failure("validation_failed");
        normalized={...parsed,original:businessOriginal(parsed.original)};
        clientImportId=parsed.clientImportId;idempotencyKey=parsed.idempotencyKey;declaredHash=parsed.payloadHash;canonicalHash=parsed.canonicalPayloadHash;count=parsed.items.length;
      } else {
        if (upload.manifest.originalKind!=="ordinary" || savedRequest!==upload.value) return failure("validation_failed");
        const parsed=parseLargeOriginal(savedRequest,trust,upload.manifest.declaredPayloadHash);
        if (!parsed) return failure("validation_failed");
        normalized={...businessOriginal(parsed),rawItems:savedRequest.items};
        clientImportId=parsed.clientImportId;idempotencyKey=parsed.idempotencyKey;declaredHash=parsed.declaredPayloadHash;canonicalHash=parsed.payloadHash;count=parsed.items.length;
      }
      result=await rpc("finalize",{uploadId:input.uploadId,manifestSha256:packet.manifestSha256,rawSha256:upload.manifest.rawSha256,
        normalizedRequest:normalized,clientImportId,idempotencyKey,payloadHash:declaredHash,canonicalPayloadHash:canonicalHash,itemCount:count,originalSchemaVersion});
    } else {
      if (upload.manifest.mode!=="plan" || !record(upload.value) || !isUuid(upload.value.verifiedOriginalId)) return failure("validation_failed");
      const stored=await getOriginal(upload.value.verifiedOriginalId);
      if (!stored || stored.originalSchemaVersion!=="pos-catalog-import-v1") return failure("original_receipt_unavailable",409);
      const original=hydrateOriginal(stored.normalizedRequest,trust);
      if (!original) return failure("db_failure",500);
      if(!Array.isArray(upload.value.coverage))return failure("validation_failed");
      const proofs=await collectProofs(upload.value.coverage,upload.value.verifiedOriginalId,upload.value.supersedes);
      if(!proofs) return failure("contributor_receipt_unavailable",409);
      const {contributors,predecessorParts}=proofs;
      const plan=parseRecoveryPlan(upload.value,original,upload.value.verifiedOriginalId,trust,contributors,predecessorParts);
      if (!plan) return failure("validation_failed");
      result=await rpc("plan",{uploadId:input.uploadId,manifestSha256:packet.manifestSha256,rawSha256:upload.manifest.rawSha256,plan});
    }
  } else {
    if (action==="apply") {
      if (!isUuid(input.planId) || !Number.isInteger(input.partIndex) || Number(input.partIndex)<0 || Number(input.partIndex)>=MAX_PLAN_CHILDREN) return failure("validation_failed");
      result=await rpc(action,{planId:input.planId,partIndex:input.partIndex});
    } else if (action==="receipt-page") {
      if (!isHash(input.receiptSha256) || !Number.isInteger(input.offset) || Number(input.offset)<0 || !Number.isInteger(input.limit) || Number(input.limit)<1 || Number(input.limit)>1000 ||
        !(isUuid(input.verifiedOriginalId) && !input.planId || isUuid(input.planId) && !input.verifiedOriginalId && Number.isInteger(input.partIndex) && Number(input.partIndex)>=0 && Number(input.partIndex)<MAX_PLAN_CHILDREN)) return failure("validation_failed");
      result=await rpc(action,{...(isUuid(input.verifiedOriginalId)?{verifiedOriginalId:input.verifiedOriginalId}:{planId:input.planId,partIndex:input.partIndex}),receiptSha256:input.receiptSha256,offset:input.offset,limit:input.limit});
    } else {
      if(isUuid(input.verifiedOriginalId) && input.planId===undefined) result=await rpc(action,{verifiedOriginalId:input.verifiedOriginalId});
      else if(input.verifiedOriginalId===undefined && isUuid(input.planId) && Number.isInteger(input.partIndex) && Number(input.partIndex)>=0 && Number(input.partIndex)<MAX_PLAN_CHILDREN)
        result=await rpc(action,{planId:input.planId,partIndex:input.partIndex});
      else return failure("validation_failed");
    }
  }
  if (!result) return failure("db_failure",500);
  if (result.ok!==true) return failure(String(result.code??"db_failure"),errorStatus(result.code));
  // Private raw bytes and normalized input can never escape the public routes.
  if ("normalizedRequest" in result || "manifest" in result || "contentBase64" in result || "header" in result || "root" in result || "canonicalRows" in result) return failure("db_failure",500);

  return {status:200,body:{...result,schemaVersion:MULTIPART_SCHEMA,code:"success"}};
}
