import "server-only";
import {createHash} from "node:crypto";
import {Open} from "unzipper-esm";
import type {GetnetTransaction} from "./getnet-contract";
import {commercialDateTimeTicks,parseLegacyTimestamp,parseModernTimestamp} from "./time-rules";
import {checkedClp,normalizeHeader,parseClp} from "./value-rules";
import {demandDigest,demandUuid,economicDigest,economics,historyRequestDigest} from "./ledger-contract";
import {parseReceiptJson,ReceiptNumber,type ReceiptJson} from "./lossless-receipt-json";

export const LOCAL_EXPORT_VERSION="history-local-export-v1";
export const LOCAL_BASELINE_VERSION="history-local-export-v2";
const columns={
 scopes:["id","shop_id","provider","evidence_reference","created_at"],
 bindings:["id","scope_id","shop_id","provider","alias_version","alias_key","evidence_reference","used_at","is_active"],
 operations:["operation_id","operation_kind","shop_id","dataset_id","request_fingerprint","batch_id","operator_id","created_at","receipt_json","inserted_count","duplicate_count","signed_amount_clp"],
 batches:["id","shop_id","dataset_id","apply_operation_id","state","revision","created_at","undone_at","undo_operation_id"],
 files:["id","batch_id","source_sha256","profile","parser_version","temporal_policy","evidence_reference","source_rows"],
 movements:["id","batch_id","file_id","shop_id","provider","merchant_scope_id","binding_id","external_namespace","external_id","business_ticks","timestamp_raw","offset_minutes","occurred_at_utc_ms","movement_kind","state","settlement_state","signed_amount_clp","signed_fee_clp","signed_fee_vat_clp","signed_net_clp","original_cashier_id","card_subtype","source_sheet","source_row","is_active","supersedes_id"],
 observations:["id","batch_id","file_id","source_row","observation_kind","code","existing_transaction_id"]
} as const;
export type LocalHistoryTable=keyof typeof columns;
export type LocalHistoryRow=Record<string,string|null>;
type LocalHistoryManifestFields={shopId:string;deviceId:string;localDatasetId:string;dataRevision:string;restoreEpoch:string;createdAtUtc:string;backupSha256:string;backupByteLength:string;evidenceLevel:"legacy_attested";entries:{name:string;rows:string;byteLength:string;sha256:string}[]};
export type LocalHistoryManifest=LocalHistoryManifestFields&({schemaVersion:typeof LOCAL_EXPORT_VERSION;restoreLineageId?:never}|{schemaVersion:typeof LOCAL_BASELINE_VERSION;restoreLineageId:string});
const fail=(code="history_local_export_invalid"):never=>{throw Error(code);};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
function closed(v:unknown,keys:readonly string[]){if(!record(v)||Object.keys(v).length!==keys.length||keys.some(k=>!(k in v)))return fail();return v;}
function integer(v:unknown,nullable=false){if(nullable&&v===null)return null;if(typeof v!=="string"||!/^(0|-?[1-9][0-9]*)$/.test(v))return fail();const n=parseClp(v);if(n.toString()!==v)return fail();return n;}
function positive(v:unknown,zero=false){const n=integer(v)!;if(n<BigInt(zero?"0":"1"))fail();return n;}
function text(v:unknown,max=2048){if(typeof v!=="string"||v.length>max||v.includes("\0"))return fail();return v;}
function id(v:unknown){const value=text(v,256);if(!value||/\p{Cc}/u.test(value))return fail();return value;}
const hash=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
function dateFromTicks(raw:string){const ticks=positive(raw,true),unix=ticks-BigInt("621355968000000000"),millis=unix>=BigInt("0")?unix/BigInt("10000"):(unix-BigInt("9999"))/BigInt("10000"),remainder=unix-millis*BigInt("10000"),d=new Date(Number(millis));if(ticks>BigInt("3155378975999999999")||!Number.isFinite(d.getTime()))return fail();const value=d.toISOString().slice(0,23)+remainder.toString().padStart(4,"0");if(commercialDateTimeTicks(value)!==raw)return fail();return value;}
function receiptNumber(v:ReceiptJson|undefined){if(!(v instanceof ReceiptNumber)||!/^(0|-?[1-9][0-9]*)$/.test(v.raw))return fail("history_local_receipt_mismatch");return integer(v.raw)!;}
export async function readLocalHistoryExport(bytes:Buffer,expectedShop:string,signal?:AbortSignal,onObject?:(table:LocalHistoryTable,ordinal:number,line:string,row:LocalHistoryRow)=>Promise<void>,expectedVersion:typeof LOCAL_EXPORT_VERSION|typeof LOCAL_BASELINE_VERSION=LOCAL_EXPORT_VERSION){
 // The admission selected by the server chooses the contract. A raw manifest
 // cannot switch a frozen v1 migration into a local v2 baseline.
 if(expectedVersion!==LOCAL_EXPORT_VERSION&&expectedVersion!==LOCAL_BASELINE_VERSION)return fail();
 demandUuid(expectedShop);if(!bytes.length||bytes.length>20*1024*1024)return fail("history_local_export_limit");const archiveSha256=hash(bytes);
 const zip=await Open.buffer(bytes),names=Object.keys(columns).map(k=>k+".ndjson");names.push("manifest.json");
 if(zip.files.length!==8||new Set(zip.files.map(f=>f.path)).size!==8||zip.files.some(f=>!names.includes(f.path)||f.flags&1||![0,8].includes(f.compressionMethod))||zip.files.reduce((n,f)=>n+f.uncompressedSize,0)>256*1024*1024)return fail("history_local_export_limit");
 let expanded=0;
 async function readPart(name:string,onLine?:(line:string)=>void|Promise<void>){
  const file=zip.files.find(f=>f.path===name)!;if(!file||file.uncompressedSize>(name==="manifest.json"?65536:128*1024*1024))return fail("history_local_export_limit");
  const decoder=new TextDecoder("utf-8",{fatal:true}),digest=createHash("sha256");let length=0,pending="",all="";
  for await(const chunk of file.stream()){
   signal?.throwIfAborted();const data=Buffer.from(chunk);length+=data.length;expanded+=data.length;if(length>file.uncompressedSize||expanded>256*1024*1024)return fail("history_local_export_limit");digest.update(data);pending+=decoder.decode(data,{stream:true});
   if(onLine){let end:number;while((end=pending.indexOf("\n"))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line||Buffer.byteLength(line)>2*1024*1024)return fail();await onLine(line);}if(Buffer.byteLength(pending)>2*1024*1024)return fail("history_local_export_limit");}
   else{all+=pending;pending="";if(Buffer.byteLength(all)>65536)return fail("history_local_export_limit");}
  }
  pending+=decoder.decode();if(onLine&&pending)return fail();if(!onLine)all+=pending;if(length!==file.uncompressedSize)return fail();return {text:all,length,sha256:digest.digest("hex")};
 }
 const manifestPart=await readPart("manifest.json"),metadata=JSON.parse(manifestPart.text) as unknown;
 const keys=["schemaVersion","shopId","deviceId","localDatasetId","dataRevision","restoreEpoch","createdAtUtc","backupSha256","backupByteLength","evidenceLevel","entries"];
 if(expectedVersion===LOCAL_BASELINE_VERSION)keys.push("restoreLineageId");
 const m=closed(metadata,keys);
 if(m.schemaVersion!==expectedVersion||m.shopId!==expectedShop||m.evidenceLevel!=="legacy_attested")return fail("history_local_scope_mismatch");
 if(expectedVersion===LOCAL_BASELINE_VERSION){if(typeof m.restoreLineageId!=="string")return fail();demandUuid(m.restoreLineageId);}
 if(typeof m.deviceId!=="string"||typeof m.backupSha256!=="string")return fail();
 demandUuid(m.deviceId);id(m.localDatasetId);positive(m.dataRevision,true);positive(m.restoreEpoch,true);positive(m.backupByteLength);demandDigest(m.backupSha256);
 if(typeof m.createdAtUtc!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(m.createdAtUtc)||!Number.isFinite(Date.parse(m.createdAtUtc)))return fail();
 if(!Array.isArray(m.entries)||m.entries.length!==7)return fail();
 const entries=m.entries.map(item=>closed(item,["name","rows","byteLength","sha256"]));
 if(new Set(entries.map(e=>e.name)).size!==7||entries.some(e=>typeof e.name!=="string"||!names.includes(e.name)||e.name==="manifest.json"))return fail();
 const tables={} as Record<LocalHistoryTable,LocalHistoryRow[]>;
 for(const table of Object.keys(columns) as LocalHistoryTable[]){
  const rows:LocalHistoryRow[]=[];tables[table]=rows;const entry=entries.find(e=>e.name===table+".ndjson")!;positive(entry.rows,true);positive(entry.byteLength,true);if(typeof entry.sha256!=="string")return fail();demandDigest(entry.sha256);
  const part=await readPart(table+".ndjson",async line=>{const row=closed(JSON.parse(line),columns[table]);if(Object.values(row).some(v=>v!==null&&typeof v!=="string"))return fail();rows.push(row as LocalHistoryRow);if(rows.length>(table==="movements"?100000:table==="observations"?200000:10000))return fail("history_local_export_limit");if(onObject)await onObject(table,rows.length,line,row as LocalHistoryRow);});
  if(part.length.toString()!==entry.byteLength||part.sha256!==entry.sha256||rows.length.toString()!==entry.rows)return fail("history_local_entry_checksum_mismatch");
 }
 const maps={} as Record<LocalHistoryTable,Map<string,LocalHistoryRow>>;
 for(const table of Object.keys(columns) as LocalHistoryTable[]){
  const key=table==="operations"?"operation_id":"id",map=new Map<string,LocalHistoryRow>();maps[table]=map;
  for(const row of tables[table]){const value=id(row[key]);if(map.has(value))return fail("history_local_duplicate_id");map.set(value,row);
   if("shop_id"in row&&row.shop_id!==expectedShop||"dataset_id"in row&&row.dataset_id!==m.localDatasetId)return fail("history_local_scope_mismatch");
   if("provider"in row&&row.provider!=="getnet")return fail();}
 }
 for(const row of tables.scopes){text(row.evidence_reference);positive(row.created_at,true);}
 const activeAliases=new Set<string>();
 for(const row of tables.bindings){if(!maps.scopes.has(id(row.scope_id))||row.alias_version!=="getnet-merchant-alias-v1"||!["0","1"].includes(row.is_active??""))return fail();demandDigest(String(row.alias_key));text(row.evidence_reference);integer(row.used_at,true);if(row.is_active==="1"){if(activeAliases.has(String(row.alias_key)))return fail("history_local_ambiguous_binding");activeAliases.add(String(row.alias_key));}}
 for(const row of tables.files){if(!maps.batches.has(id(row.batch_id))||!["GetnetLegacy","GetnetModern"].includes(row.profile??"")||row.parser_version!=="getnet-ooxml-v1")return fail();demandDigest(String(row.source_sha256));positive(row.source_rows,true);text(row.temporal_policy,512);if(row.evidence_reference!==null)text(row.evidence_reference);}
 for(const row of tables.operations){
  const batch=maps.batches.get(id(row.batch_id));if(!batch||!["Apply","Undo"].includes(row.operation_kind??""))return fail();positive(row.inserted_count,true);positive(row.duplicate_count,true);integer(row.signed_amount_clp);demandDigest(String(row.request_fingerprint));positive(row.operator_id);positive(row.created_at,true);
  if(typeof row.receipt_json!=="string")return fail();const receipt=parseReceiptJson(row.receipt_json);
  if(!record(receipt)||receipt.OperationId!==row.operation_id||receipt.BatchId!==row.batch_id||receipt.OperationKind!==row.operation_kind||receiptNumber(receipt.InsertedCount as ReceiptJson).toString()!==row.inserted_count||receiptNumber(receipt.DuplicateCount as ReceiptJson).toString()!==row.duplicate_count||receiptNumber(receipt.SignedAmountClp as ReceiptJson).toString()!==row.signed_amount_clp)return fail("history_local_receipt_mismatch");
 }
 for(const row of tables.batches){const apply=maps.operations.get(id(row.apply_operation_id));if(!apply||apply.batch_id!==row.id||apply.operation_kind!=="Apply"||!["Active","Undone"].includes(row.state??""))return fail();positive(row.revision);positive(row.created_at,true);if(row.state==="Undone"){const undo=maps.operations.get(id(row.undo_operation_id));if(!undo||undo.operation_kind!=="Undo"||undo.batch_id!==row.id)return fail();positive(row.undone_at,true);}else if(row.undo_operation_id!==null||row.undone_at!==null)return fail();}
 const movements=tables.movements.map(row=>{
  const file=maps.files.get(id(row.file_id)),binding=maps.bindings.get(id(row.binding_id)),batch=maps.batches.get(id(row.batch_id));
  if(!file||!binding||!batch||file.batch_id!==batch.id||binding.scope_id!==row.merchant_scope_id||!["0","1"].includes(row.is_active??"")||(batch.state==="Active")!==(row.is_active==="1"))return fail();
  text(row.timestamp_raw,128);
  positive(row.id);if(positive(row.source_row)>BigInt("1048576"))return fail();if(row.original_cashier_id!==null)return fail("history_local_cashier_unverified");
  const profile=file.profile as "GetnetLegacy"|"GetnetModern",businessDateTime=dateFromTicks(String(row.business_ticks)),marker=String(file.temporal_policy).lastIndexOf(";interpretation="),policy=String(file.temporal_policy).slice(0,marker);
  if(marker<1||policy.length>160)return fail();
  const legacy=profile==="GetnetLegacy",mode=legacy?"Unresolved":String(file.temporal_policy).slice(marker+16).split(";")[0];
  if(legacy?!String(file.temporal_policy).endsWith(";interpretation=LegacyLocal;CLP=explicitly-approved"):!["IsoUtc","ExportedLocal"].includes(mode))return fail();
  let timestamp:GetnetTransaction["timestamp"];
  if(legacy){
   if(row.offset_minutes!==null||row.occurred_at_utc_ms!==null||row.external_namespace!=="getnet.legacy.transaction")return fail();
   const raw=String(row.timestamp_raw);
   // Legacy SQLite did not retain the Excel numeric cell type/date1904 flag.
   // Never reinterpret those serials. Text clocks that are self-describing
   // can additionally be checked against the retained100ns business value.
   if(/^\d{2}\/\d{2}\/\d{4} /.test(raw)&&parseLegacyTimestamp(raw,raw,{modernTimeInterpretation:"Unresolved",temporalPolicyVersion:policy,temporalEvidenceReference:""}).businessDateTime!==businessDateTime)return fail("history_local_timestamp_mismatch");
   if(/^\d{4}-\d{2}-\d{2}T/.test(raw)&&commercialDateTimeTicks(raw)!==row.business_ticks)return fail("history_local_timestamp_mismatch");
   timestamp={rawTimestamp:raw,rawOffset:"",offsetMinutes:null,businessDateTime,isoBusinessDateTime:null,exportedLocalDateTime:null,occurredAtUtc:null,interpretation:"Unresolved",policyVersion:policy,evidenceReference:file.evidence_reference??"",needsEvidence:false};
  }
  else{
   const minutes=integer(row.offset_minutes);if(minutes===null||minutes<BigInt("-840")||minutes>BigInt("840")||row.external_namespace!=="getnet.financial.movement")return fail();
   const n=Number(minutes),absolute=Math.abs(n),offset=(n<0?"-":"+")+Math.floor(absolute/60)+":"+String(absolute%60).padStart(2,"0");
   timestamp=parseModernTimestamp(String(row.timestamp_raw),offset,{modernTimeInterpretation:mode as "IsoUtc"|"ExportedLocal",temporalPolicyVersion:policy,temporalEvidenceReference:file.evidence_reference??""});
   if(timestamp.businessDateTime!==businessDateTime||timestamp.occurredAtUtc===null)return fail();
   const utc=BigInt(commercialDateTimeTicks(timestamp.occurredAtUtc))-BigInt("621355968000000000"),ms=utc>=BigInt("0")?utc/BigInt("10000"):(utc-BigInt("9999"))/BigInt("10000");
   if(ms.toString()!==row.occurred_at_utc_ms)return fail();
  }
  const gross=integer(row.signed_amount_clp)!,fee=integer(row.signed_fee_clp,true),vat=integer(row.signed_fee_vat_clp,true),net=integer(row.signed_net_clp,true),kind=row.movement_kind;
  if(!(kind==="Sale"&&gross>BigInt("0")||kind==="Cancellation"&&gross<BigInt("0"))||!["Credit","Debit","Prepaid","Unknown"].includes(row.card_subtype??"")||![legacy?"ABONADO":"CONFIRMADA"].includes(normalizeHeader(String(row.state))))return fail();
  if(legacy?(kind!=="Sale"||fee===null||fee<BigInt("0")||net===null||vat!==null||gross-fee!==net):[fee,vat].some(v=>v!==null&&(gross>BigInt("0")?v>BigInt("0"):v<BigInt("0")))||fee!==null&&vat!==null&&net!==null&&gross+fee+vat!==net||normalizeHeader(row.settlement_state??"")==="ABONADO"&&(fee===null||vat===null||net===null))return fail("history_local_economics_mismatch");
  if(row.supersedes_id!==null){const old=maps.movements.get(id(row.supersedes_id));if(!old||positive(old.id)>=positive(row.id)||old.is_active!=="0"||old.merchant_scope_id!==row.merchant_scope_id||old.external_namespace!==row.external_namespace||old.external_id!==row.external_id)return fail();}
  const transaction:GetnetTransaction={source:{fileId:String(file.id),fileSha256:String(file.source_sha256),sheetName:text(row.source_sheet,256),rowNumber:Number(positive(row.source_row))},profile,profileVersion:legacy?"getnet-legacy-v1":"getnet-modern-v1",parserVersion:"history-local-ledger-v1",provider:"getnet",currency:"CLP",paymentMethod:"card",externalNamespace:String(row.external_namespace),externalId:id(row.external_id),paymentId:"",authorizationCode:"",merchant:{local:"",seller:"",sellerId:"",localNumber:"",rut:"",hasEvidence:false},timestamp,movementKind:kind as "Sale"|"Cancellation",transactionStatus:String(row.state),settlementStatus:row.settlement_state??"",grossClp:String(row.signed_amount_clp),commissionClp:row.signed_fee_clp,commissionVatClp:row.signed_fee_vat_clp,netClp:row.signed_net_clp,cardSubtype:row.card_subtype as GetnetTransaction["cardSubtype"],originalCardType:"",originalPrepaid:"",terminal:"",rawSettlementDate:"",originalCashierId:null};
  return {localId:String(row.id),localBatchId:String(row.batch_id),localScopeId:String(row.merchant_scope_id),localBindingId:String(row.binding_id),localFileId:String(row.file_id),aliasKey:String(binding.alias_key),active:row.is_active==="1",supersedesLocalId:row.supersedes_id,
   transaction:{...transaction,transactionStatus:normalizeHeader(transaction.transactionStatus),sourceTransactionStatus:transaction.transactionStatus},economics:economics(transaction),economicDigest:economicDigest(economics(transaction))};
 });
 for(const row of tables.observations){positive(row.id);const file=maps.files.get(id(row.file_id));if(!file||file.batch_id!==row.batch_id||!maps.batches.has(id(row.batch_id)))return fail();positive(row.source_row);if(row.existing_transaction_id!==null&&!maps.movements.has(id(row.existing_transaction_id)))return fail();text(row.observation_kind,64);text(row.code,160);}
 const active=new Set<string>();for(const row of movements)if(row.active){const key=historyRequestDigest({scope:row.localScopeId,namespace:row.transaction.externalNamespace,id:row.transaction.externalId});if(active.has(key))return fail("history_local_duplicate_active_identity");active.add(key);}
 const batchFacts=new Map<string,{count:number;gross:bigint}>();
 for(const row of movements){const fact=batchFacts.get(row.localBatchId)??{count:0,gross:BigInt("0")};fact.count++;fact.gross+=BigInt(row.transaction.grossClp);batchFacts.set(row.localBatchId,fact);}
 for(const batch of tables.batches){const fact=batchFacts.get(String(batch.id))??{count:0,gross:BigInt("0")},apply=maps.operations.get(String(batch.apply_operation_id))!;
  if(BigInt(fact.count)!==integer(apply.inserted_count)||checkedClp(fact.gross).toString()!==apply.signed_amount_clp)return fail("history_local_receipt_mismatch");}
 if(hash(bytes)!==archiveSha256)return fail("history_local_source_changed");
 return {manifest:m as unknown as LocalHistoryManifest,rawManifest:manifestPart.text,manifestSha256:manifestPart.sha256,archiveSha256,tables,movements,summary:{movements:movements.length,active:movements.filter(m=>m.active).length,batches:tables.batches.length,originalOperations:tables.operations.length,
  activeGrossClp:checkedClp(movements.filter(m=>m.active).reduce((s,m)=>s+BigInt(m.transaction.grossClp),BigInt("0"))).toString(),knownActiveNetClp:checkedClp(movements.filter(m=>m.active).reduce((s,m)=>s+BigInt(m.transaction.netClp??"0"),BigInt("0"))).toString(),knownActiveNetCount:movements.filter(m=>m.active&&m.transaction.netClp!==null).length}};
}
