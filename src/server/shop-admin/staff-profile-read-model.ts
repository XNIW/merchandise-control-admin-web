import "server-only";
import type { ShopAdminDataAccess } from "./data-access";
import { revalidateShopAdminDataAccessForPublish } from "./data-access";
import { callStaffWebShopProfileRead } from "./staff-web-lease-bound-rpc";
import { createAccountIdentitySummary } from "@/lib/account-identity";
import type { ShopAdminReadModel, ShopAdminReadModelShop, ShopAdminReadModelMember } from "./read-model";

type StaffAccess = Extract<ShopAdminDataAccess, { status: "ready"; principalKind: "pos_staff_manager" }>;
type View = "overview" | "members" | "settings";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shopKeys = new Set(["shop_id", "shop_code", "shop_name", "shop_status", "created_at", "updated_at",
  "status_changed_at", "suspended_at", "archived_at", "company_rut", "business_address", "business_city",
  "business_giro", "legal_representative_rut", "fiscal_identity_locked_by_platform"]);
const memberKeys = new Set(["shop_member_id", "profile_id", "role_key", "membership_status", "created_at", "updated_at"]);
const envelopeKeys = new Set(["ok", "code", "shop_id", "actor_staff_id", "staff_web_session_id", "credential_version", "operation", "shop", "members"]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
function text(row: Record<string, unknown>, key: string, nullable = false) {
  const value = row[key];
  if (nullable && (value === null || value === "")) return null;
  if (typeof value !== "string" || !value || value.length > 2048) throw Error("invalid_staff_profile_dto");
  return value;
}
function date(row: Record<string, unknown>, key: string, nullable = false) {
  const value = text(row, key, nullable);
  if (value !== null && !Number.isFinite(Date.parse(value))) throw Error("invalid_staff_profile_dto");
  return value;
}
function mapProfile(value: unknown, access: StaffAccess): ShopAdminReadModelShop {
  if (!record(value) || Object.keys(value).some(key => !shopKeys.has(key)) ||
      value.shop_id !== access.selectedShop.shopId || value.shop_status !== "active" ||
      (value.fiscal_identity_locked_by_platform !== null && typeof value.fiscal_identity_locked_by_platform !== "boolean")) throw Error("invalid_staff_profile_dto");
  return {
    shopId: access.selectedShop.shopId, shopCode: text(value, "shop_code")!, shopName: text(value, "shop_name")!,
    shopStatus: "active", role: access.selectedShop.role,
    createdAt: date(value, "created_at")!, updatedAt: date(value, "updated_at")!,
    statusChangedAt: date(value, "status_changed_at", true), suspendedAt: date(value, "suspended_at", true), archivedAt: date(value, "archived_at", true),
    companyRut: text(value, "company_rut", true) ?? undefined,
    businessAddress: text(value, "business_address", true) ?? undefined, businessCity: text(value, "business_city", true) ?? undefined,
    businessGiro: text(value, "business_giro", true) ?? undefined, legalRepresentativeRut: text(value, "legal_representative_rut", true) ?? undefined,
    fiscalIdentityLockedByPlatform: typeof value.fiscal_identity_locked_by_platform === "boolean" ? value.fiscal_identity_locked_by_platform : undefined,
  };
}
function mapMember(value: unknown): ShopAdminReadModelMember {
  if (!record(value) || Object.keys(value).some(key => !memberKeys.has(key)) ||
      !uuid.test(text(value, "profile_id")!) || !uuid.test(text(value, "shop_member_id")!)) throw Error("invalid_staff_profile_dto");
  const profileId = text(value, "profile_id")!;
  return { profileId, shopMemberId: text(value, "shop_member_id")!,
    roleKey: text(value, "role_key")!, membershipStatus: text(value, "membership_status")!,
    createdAt: date(value, "created_at")!, updatedAt: date(value, "updated_at")!,
    accountIdentity: createAccountIdentitySummary({ profileId }),
  };
}

export async function readStaffShopProfile(access: StaffAccess, view: View): Promise<ShopAdminReadModel> {
  const blocked = (status: ShopAdminReadModel["status"], reason: string): ShopAdminReadModel => ({
    status, reason, selectedShop: null, members: [], auditLogs: [], readOnly: true, source: "supabase_server",
  });
  const session = access.principal.staffWebSession;
  if (!session) return blocked("unauthorized", "The staff session is no longer active.");
  try {
    const { data, error } = await callStaffWebShopProfileRead({ selectedShop: access.selectedShop,
      actorStaffId: access.principal.staff.staffId, staffWebSession: session }, view);
    if (error) {
      const code = record(error) ? error.code : undefined;
      if (code === "42501") return blocked("unauthorized", "The staff authorization changed before the page could be published.");
      return blocked(code === "PGRST202" || code === "42883" ? "staff_surface_unavailable" : "error",
        "This page could not load its data. Try again later.");
    }
    if (!record(data)) return blocked("error", "The staff read returned an invalid response.");
    if (data.ok !== true || data.code !== "success") return blocked("unauthorized", "The staff read is not authorized.");
    if (Object.keys(data).some(key => !envelopeKeys.has(key)) || data.shop_id !== access.selectedShop.shopId ||
        data.actor_staff_id !== access.principal.staff.staffId || data.staff_web_session_id !== session.sessionId ||
        data.credential_version !== session.credentialVersion || data.operation !== view ||
        !Array.isArray(data.members) || data.members.length > 100 || (view !== "members" && data.members.length > 0)) throw Error("invalid_staff_profile_dto");
    const profile = data.shop === null ? null : mapProfile(data.shop, access);
    const members = data.members.map(mapMember);
    if (new Set(members.map(member => member.shopMemberId)).size !== members.length) throw Error("invalid_staff_profile_dto");
    if (!await revalidateShopAdminDataAccessForPublish(access, view === "members" ? "members.view" : "settings.view")) {
      return blocked("unauthorized", "The staff authorization changed before the page could be published.");
    }
    return { status: profile ? "ready" : "empty", selectedShop: profile, members, auditLogs: [],
      readOnly: true, source: "supabase_server", reason: "Shop profile loaded under the current shop-scoped staff session." };
  } catch {
    return blocked("error", "This page could not load its data. Try again later.");
  }
}
