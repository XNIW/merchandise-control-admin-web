import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { parseShopSyncEventRead } from "@/server/sync-events/read-boundary";
import { revalidateShopAdminDataAccessForPublish } from "./data-access";
import { callStaffWebMobileOperationsRead } from "./staff-web-lease-bound-rpc";
import { validateBoundedStaffRows, type StaffOperationsAccess } from "./staff-operations-read";

type Operation="devices"|"history_list"|"history_detail"|"sync";
const schema={
  devices:"shop_device_id,shop_id,device_identifier,device_type,display_name,app_version,status,last_seen_at,last_seen_principal_kind,last_seen_profile_id,last_seen_staff_id,metadata_redacted,reactivated_at,revoked_at,created_at,updated_at",
  staff:"staff_id,staff_code,display_name",profiles:"profile_id,display_name",
  sessions:"remote_id,shop_id,owner_user_id,display_name,supplier,category,timestamp,updated_at,deleted_at,payload_version,data,session_overlay,is_manual_entry,sourceScope",
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==="object"&&!Array.isArray(v));
const rootKeys="ok,code,shop_id,actor_staff_id,staff_web_session_id,credential_version,operation,mapping,sync,sessions,total_count,page,page_size,devices,staff,profiles".split(",").sort().join(",");
export async function readStaffMobileOperations(access:StaffOperationsAccess,operation:Operation,payload:Record<string,Json>={}) {
  const blocked=(status:"unauthorized"|"error"|"unmapped"|"staff_surface_unavailable",reason:string)=>({status,reason,data:null});
  const session=access.principal.staffWebSession;
  if (!session) return blocked("unauthorized","The staff session is no longer active.");
  try {
    const {data,error}=await callStaffWebMobileOperationsRead({selectedShop:access.selectedShop,actorStaffId:access.principal.staff.staffId,staffWebSession:session},operation,payload);
    if(error) { const code=record(error)?error.code:undefined; return blocked(code==="42501"?"unauthorized":code==="55000"?"unmapped":code==="PGRST202"||code==="42883"?"staff_surface_unavailable":"error","The shop device or mobile history data could not be loaded."); }
    if(!record(data)) throw Error("invalid_mobile_dto");
    if(data.ok!==true||data.code!=="success") return blocked(data.code==="scope_unresolved"?"unmapped":data.code==="permission_denied"?"unauthorized":"error",data.code==="data_limit_exceeded"?"This page exceeds the data limit. Select fewer rows.":"The shop device or mobile history read is blocked.");
    if(Object.keys(data).sort().join(",")!==rootKeys||data.shop_id!==access.selectedShop.shopId||data.actor_staff_id!==access.principal.staff.staffId||data.staff_web_session_id!==session.sessionId||data.credential_version!==session.credentialVersion||data.operation!==operation||JSON.stringify(data).length>4_194_304) throw Error("invalid_mobile_dto");
    let mapping:{shop_inventory_source_id:string;owner_user_id:string;mapping_state:string;source_kind:string}|null=null;
    if(data.mapping!==null) {
      const m=data.mapping;
      if(!record(m)||Object.keys(m).sort().join(",")!=="mapping_state,owner_user_id,shop_inventory_source_id,source_kind"||typeof m.owner_user_id!=="string"||!uuid.test(m.owner_user_id)||typeof m.shop_inventory_source_id!=="string"||!uuid.test(m.shop_inventory_source_id)||m.mapping_state!=="mapped"||m.source_kind!=="mobile_owner") throw Error("invalid_mobile_dto");
      mapping={shop_inventory_source_id:m.shop_inventory_source_id,owner_user_id:m.owner_user_id,mapping_state:"mapped",source_kind:"mobile_owner"};
    }
    const eventId=operation==="history_detail"&&payload.kind==="sync_event"?String(payload.id):null;
    const sync=parseShopSyncEventRead(data.sync,access.selectedShop.shopId,operation==="history_list"?160:eventId?1:operation==="sync"?25:100,eventId,operation==="history_list"?["history"]:null);
    if(!sync||sync.scope.mappedLegacyOwnerUserId!==(mapping?.owner_user_id??null)) throw Error("invalid_mobile_dto");
    // Legacy rows retain their owner binding; normalize only for the common column validator.
    if(!Array.isArray(data.sessions)) throw Error("invalid_mobile_dto");
    for(const row of data.sessions) {
      if(!record(row)||typeof row.remote_id!=="string"||!row.remote_id||row.remote_id.length>256||!row.data||!Array.isArray(row.data)||typeof row.timestamp!=="string"||!Number.isFinite(Date.parse(row.timestamp))) throw Error("invalid_mobile_dto");
      if(row.sourceScope==="shop_scoped" ? row.shop_id!==access.selectedShop.shopId : row.sourceScope!=="legacy_owner_bridge"||row.shop_id!==null||!mapping||row.owner_user_id!==mapping.owner_user_id) throw Error("invalid_mobile_dto");
      if(operation==="history_detail"&&(payload.kind!=="shared_sheet_session"||row.remote_id!==payload.id)) throw Error("invalid_mobile_dto");
    }
    const sessions=data.sessions as Record<string,unknown>[];
    const normalized=sessions.map(row=>({...row,shop_id:access.selectedShop.shopId}));
    const rows=validateBoundedStaffRows({devices:data.devices,staff:data.staff,profiles:data.profiles,sessions:normalized},schema,access.selectedShop.shopId);
    if(operation!=="devices"&&(rows.devices.length||rows.staff.length||rows.profiles.length)||!["history_list","history_detail"].includes(operation)&&rows.sessions.length) throw Error("invalid_mobile_dto");
    if(!Number.isSafeInteger(data.total_count)||Number(data.total_count)<rows.sessions.length||!Number.isSafeInteger(data.page)||!Number.isSafeInteger(data.page_size)) throw Error("invalid_mobile_dto");
    if(operation==="history_list"&&(data.page!==Number(payload.page)||data.page_size!==Number(payload.pageSize)||rows.sessions.length>Number(payload.pageSize))) throw Error("invalid_mobile_dto");
    if(operation==="history_detail"&&(rows.sessions.length>1||data.total_count!==rows.sessions.length)) throw Error("invalid_mobile_dto");
    if(!await revalidateShopAdminDataAccessForPublish(access,operation==="devices"?"devices.read":"history.read")) return blocked("unauthorized","Shop access changed before publication.");
    const publishedRows:Record<string,Record<string,unknown>[]>={...rows,sessions};
    return {status:"ready" as const,reason:"Shop device and mobile history data loaded under the current staff session.",data:{mapping,sync,rows:publishedRows,totalCount:Number(data.total_count)}};
  } catch {return blocked("error","The shop device or mobile history data could not be loaded.");}
}
