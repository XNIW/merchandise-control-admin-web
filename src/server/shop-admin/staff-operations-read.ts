import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { ShopAdminDataAccess } from "./data-access";
import { revalidateShopAdminDataAccessForPublish } from "./data-access";
import { callStaffWebOperationsRead } from "./staff-web-lease-bound-rpc";
import { staffOperationsSchemas } from "./staff-operations-schema";

export type StaffOperationsAccess = Extract<ShopAdminDataAccess, {status:"ready"; principalKind:"pos_staff_manager"}>;
export type StaffOperation = keyof typeof staffOperationsSchemas;
const bounds: Record<string,number> = {events:100,devices:100,credentials:200,sessions:200,staff:200,today:1,month:62,year:370,sales:50,batches:25,warnings:50};
const record = (value:unknown): value is Record<string,unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const numeric = new Set("heartbeat_count,staff_credential_version,total,net_amount_clp,stock_warning_count,sale_count,line_count,quantity_delta,stock_after,stock_before,card_received_clp,cash_received_clp,change_given_clp,documented_revenue_clp,net_revenue_clp,other_received_clp,refund_count,transaction_count,transfer_received_clp,verification_revenue_clp,void_count".split(","));
const required = new Set("shop_id,shop_device_id,pos_session_id,pos_device_credential_id,pos_sale_id,pos_sales_sync_batch_id,audit_log_id,staff_id,status,event_key,severity,result,scope,created_at,updated_at,issued_at,expires_at,occurred_at,device_identifier,device_type".split(","));

export function validateStaffOperationRows(value:unknown, operation:StaffOperation, shopId:string): Record<string,Record<string,unknown>[]> {
  const schema = staffOperationsSchemas[operation];
  if (!record(value) || Object.keys(value).length !== Object.keys(schema).length || JSON.stringify(value).length > 2_000_000) throw Error("invalid_staff_operations_dto");
  const output: Record<string,Record<string,unknown>[]> = {};
  for (const [group,columns] of Object.entries(schema)) {
    const rows = value[group], keys = columns.split(",");
    if (!Array.isArray(rows) || rows.length > bounds[group]) throw Error("invalid_staff_operations_dto");
    output[group] = rows.map(row => {
      if (!record(row) || Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row,key))) throw Error("invalid_staff_operations_dto");
      for (const key of keys) {
        const cell = row[key];
        if (cell === null) {
          if (required.has(key) && !(group === "staff" && key === "status")) throw Error("invalid_staff_operations_dto");
          continue;
        }
        if (key === "metadata_redacted") {
          if (!record(cell) && !Array.isArray(cell)) throw Error("invalid_staff_operations_dto");
          continue;
        }
        if (numeric.has(key)) {
          if (!["number","string"].includes(typeof cell) || !/^[-+]?\d+(?:\.\d+)?$/.test(String(cell)) || !Number.isFinite(Number(cell))) throw Error("invalid_staff_operations_dto");
        } else if (typeof cell !== "string" || cell.length > 2048) throw Error("invalid_staff_operations_dto");
        if (key === "shop_id" && cell !== shopId) throw Error("invalid_staff_operations_dto");
        if (key === "scope" && cell !== "shop") throw Error("invalid_staff_operations_dto");
        if ((key.endsWith("_at") || key === "business_date") && typeof cell === "string" && !Number.isFinite(Date.parse(cell))) throw Error("invalid_staff_operations_dto");
        if (key.endsWith("_id") && !["client_sale_id","client_original_sale_id","client_batch_id","target_id"].includes(key) && typeof cell === "string" && !uuid.test(cell)) throw Error("invalid_staff_operations_dto");
      }
      return row;
    });
  }
  return output;
}

export async function readStaffOperations(access:StaffOperationsAccess, operation:StaffOperation, payload:Record<string,Json> = {}) {
  const blocked = (status:"unauthorized"|"error"|"staff_surface_unavailable", reason:string) => ({status, reason, rows:null});
  const session = access.principal.staffWebSession;
  if (!session) return blocked("unauthorized","The staff session is no longer active.");
  try {
    const {data,error} = await callStaffWebOperationsRead({selectedShop:access.selectedShop,actorStaffId:access.principal.staff.staffId,staffWebSession:session},operation,payload);
    if (error) {
      const code = record(error) ? error.code : undefined;
      return blocked(code === "42501" ? "unauthorized" : code === "PGRST202" || code === "42883" ? "staff_surface_unavailable" : "error","The operational data could not be loaded.");
    }
    if (!record(data) || data.ok !== true || data.code !== "success") return blocked("unauthorized","The staff read is not authorized.");
    if (Object.keys(data).sort().join(",") !== ["ok","code","shop_id","actor_staff_id","staff_web_session_id","credential_version","operation","rows"].sort().join(",") || data.shop_id !== access.selectedShop.shopId || data.actor_staff_id !== access.principal.staff.staffId || data.staff_web_session_id !== session.sessionId || data.credential_version !== session.credentialVersion || data.operation !== operation) throw Error("invalid_staff_operations_dto");
    const rows = validateStaffOperationRows(data.rows,operation,access.selectedShop.shopId);
    if (!await revalidateShopAdminDataAccessForPublish(access,operation.startsWith("audit_") ? "audit.read" : "pos.dashboard.read")) return blocked("unauthorized","Shop access changed before publication.");
    return {status:"ready" as const,rows,reason:"Operational data loaded under the current staff session."};
  } catch { return blocked("error","The operational data could not be loaded."); }
}
