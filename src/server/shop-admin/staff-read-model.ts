import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { resolveShopAdminDataAccess } from "./data-access";
import type { ShopAdminShellShop } from "./shop-access";
import type {
  ShopAdminReadModelError,
  ShopAdminReadModelStatus,
} from "./read-model";

type StaffSafeRow =
  Database["public"]["Views"]["staff_accounts_safe"]["Row"];

export type ShopStaffReadModelStaffAccount = {
  staffId: string;
  shopId: string;
  staffCode: string;
  displayName: string;
  roleKey: string;
  status: string;
  credentialKind: string | null;
  credentialStatus: string;
  credentialUpdatedAt: string | null;
  credentialExpiresAt: string | null;
  credentialVersion: number;
  mustChangeCredential: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  sessionInvalidatedAt: string | null;
  webAccessRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShopStaffReadModel = {
  status: ShopAdminReadModelStatus;
  selectedShop: ShopAdminShellShop | null;
  staffAccounts: readonly ShopStaffReadModelStaffAccount[];
  readOnly: true;
  source: "supabase_server";
  reason: string;
  error?: ShopAdminReadModelError;
};

type GetShopStaffReadModelOptions = {
  client?: SupabaseServerClient | null;
  requestedShopId?: string | null;
};

const emptyRows = {
  selectedShop: null,
  staffAccounts: [],
} as const;

function redactStaffReadModelError(error: unknown): ShopAdminReadModelError {
  const code =
    error instanceof Error && error.name ? error.name : "staff_read_error";

  return {
    code,
    message: "Shop Staff read model could not be loaded.",
  };
}

function isCompleteStaffSafeRow(
  row: StaffSafeRow,
): row is StaffSafeRow & {
  created_at: string;
  display_name: string;
  failed_attempts: number;
  must_change_credential: boolean;
  role_key: string;
  shop_id: string;
  staff_code: string;
  staff_id: string;
  status: string;
  updated_at: string;
  credential_status: string;
  credential_version: number;
} {
  return Boolean(
    row.created_at &&
      row.credential_status &&
      typeof row.credential_version === "number" &&
      row.display_name &&
      typeof row.failed_attempts === "number" &&
      typeof row.must_change_credential === "boolean" &&
      row.role_key &&
      row.shop_id &&
      row.staff_code &&
      row.staff_id &&
      row.status &&
      row.updated_at,
  );
}

function mapStaffSafeRow(
  row: StaffSafeRow,
): ShopStaffReadModelStaffAccount | null {
  if (!isCompleteStaffSafeRow(row)) {
    return null;
  }

  return {
    staffId: row.staff_id,
    shopId: row.shop_id,
    staffCode: row.staff_code,
    displayName: row.display_name,
    roleKey: row.role_key,
    status: row.status,
    credentialKind: row.credential_kind,
    credentialStatus: row.credential_status,
    credentialUpdatedAt: row.credential_updated_at,
    credentialExpiresAt: row.credential_expires_at,
    credentialVersion: row.credential_version,
    mustChangeCredential: row.must_change_credential,
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    sessionInvalidatedAt: row.session_invalidated_at,
    webAccessRevokedAt: row.web_access_revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getShopStaffReadModel(
  options: GetShopStaffReadModelOptions = {},
): Promise<ShopStaffReadModel> {
  const access = await resolveShopAdminDataAccess(options);

  if (access.status !== "ready") {
    return {
      status:
        access.status === "not_configured" || access.status === "error"
          ? access.status
          : "unauthorized",
      ...emptyRows,
      readOnly: true,
      source: "supabase_server",
      reason: access.reason,
    };
  }

  const { selectedShop, supabase } = access;

  const staffResult = await supabase
    .from("staff_accounts_safe")
    .select(
      "staff_id,shop_id,staff_code,display_name,role_key,status,credential_kind,credential_status,credential_updated_at,credential_expires_at,credential_version,must_change_credential,failed_attempts,locked_until,last_login_at,session_invalidated_at,web_access_revoked_at,created_at,updated_at",
    )
    .eq("shop_id", selectedShop.shopId)
    .order("staff_code", { ascending: true })
    .limit(100);

  if (staffResult.error) {
    return {
      status: "error",
      selectedShop,
      staffAccounts: [],
      readOnly: true,
      source: "supabase_server",
      reason: "Shop Staff rows could not be loaded through the safe view.",
      error: redactStaffReadModelError(staffResult.error),
    };
  }

  const staffAccounts = (staffResult.data ?? [])
    .map(mapStaffSafeRow)
    .filter(
      (
        row,
      ): row is ShopStaffReadModelStaffAccount =>
        Boolean(row),
    );

  return {
    status: "ready",
    selectedShop,
    staffAccounts,
    readOnly: true,
    source: "supabase_server",
    reason:
      "Shop Staff read model loaded server-side through the credential-safe view.",
  };
}
