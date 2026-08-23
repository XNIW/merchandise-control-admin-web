import "server-only";

import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  resolveShopAdminDataAccess,
  revalidateShopAdminDataAccessForPublish,
} from "./data-access";
import { callStaffWebAfterSalesEvidenceRead } from "./staff-web-lease-bound-rpc";

const EVIDENCE_BUCKET = "customer-after-sales-evidence";
const EVIDENCE_READ_TTL_SECONDS = 60;
const EVIDENCE_PATH =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_CLEANUP_BATCH = 100;

type JsonObject = Record<string, Json | undefined>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

type EvidenceCleanupItem = {
  id: string;
  kind: "orphan_ticket" | "rejected_evidence";
  objectPath: string;
};

function cleanupItems(value: Json | undefined, limit: number) {
  if (!Array.isArray(value) || value.length > limit) {
    return null;
  }
  const seen = new Set<string>();
  const items: EvidenceCleanupItem[] = [];
  for (const raw of value) {
    const item = object(raw);
    const id = typeof item?.id === "string" ? item.id : "";
    const kind = item?.kind;
    const objectPath = typeof item?.objectPath === "string" ? item.objectPath : "";
    if (
      !UUID.test(id) ||
      (kind !== "orphan_ticket" && kind !== "rejected_evidence") ||
      !EVIDENCE_PATH.test(objectPath) ||
      seen.has(objectPath)
    ) {
      return null;
    }
    seen.add(objectPath);
    items.push({ id, kind, objectPath });
  }
  return items;
}

export async function runAfterSalesEvidenceCleanup(input: {
  adminClient?: SupabaseAdminClient;
  limit?: number;
  orphanBefore?: Date;
  rejectedBefore?: Date;
} = {}) {
  const now = Date.now();
  const limit = input.limit ?? MAX_CLEANUP_BATCH;
  const orphanBefore = input.orphanBefore ?? new Date(now);
  const rejectedBefore = input.rejectedBefore ?? new Date(now - 86_400_000);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_CLEANUP_BATCH ||
    !Number.isFinite(orphanBefore.getTime()) ||
    !Number.isFinite(rejectedBefore.getTime()) ||
    orphanBefore.getTime() > now ||
    rejectedBefore.getTime() > now
  ) {
    return { code: "validation_failed", ok: false as const };
  }
  const config = input.adminClient ? null : resolveSupabaseAdminConfig();
  const admin = input.adminClient ?? (config ? createSupabaseAdminClient(config) : null);
  if (!admin) {
    return { code: "backend_unavailable", ok: false as const };
  }
  const claim = await admin.rpc("service_after_sales_evidence_cleanup_claim_v1", {
    p_limit: limit,
    p_orphan_before: orphanBefore.toISOString(),
    p_rejected_before: rejectedBefore.toISOString(),
  });
  const payload = object(claim.data);
  const claimId = typeof payload?.claimId === "string" ? payload.claimId : "";
  const items = cleanupItems(payload?.items, limit);
  if (claim.error || payload?.status !== "ok" || !UUID.test(claimId) || !items) {
    return { code: "backend_contract_invalid", ok: false as const };
  }
  if (items.length === 0) {
    return { code: "success", deleted: 0, ok: true as const };
  }
  const objectPaths = items.map((item) => item.objectPath);
  const removed = await admin.storage.from(EVIDENCE_BUCKET).remove(objectPaths);
  const ack = await admin.rpc("service_after_sales_evidence_cleanup_ack_v1", {
    p_claim_id: claimId,
    p_storage_deleted: !removed.error,
  });
  const ackPayload = object(ack.data);
  if (removed.error) {
    return { code: "storage_unavailable", ok: false as const };
  }
  if (ack.error || ackPayload?.status !== "ok" || ackPayload?.storageDeleted !== true) {
    return { code: "backend_unavailable", ok: false as const };
  }
  return { code: "success", deleted: items.length, ok: true as const };
}

export async function createAfterSalesEvidenceSignedUrl(input: {
  evidenceId: string;
  requestedShopId?: string | null;
}) {
  if (!/^[0-9a-f-]{36}$/.test(input.evidenceId)) {
    return { code: "validation_failed", ok: false as const };
  }
  const access = await resolveShopAdminDataAccess({
    requestedShopId: input.requestedShopId,
    requiredPermission: "orders.view",
    strictRequestedShop: true,
  });
  if (access.status !== "ready") {
    return {
      code: access.status === "not_configured" ? "backend_unavailable" : "permission_denied",
      ok: false as const,
    };
  }
  const staffContext = access.principalKind === "pos_staff_manager"
    ? {
        actorStaffId: access.principal.staff.staffId,
        selectedShop: access.selectedShop,
        staffWebSession: access.principal.staffWebSession!,
      }
    : null;
  const rpc = access.principalKind === "personal_account"
    ? await access.supabase.rpc("admin_customer_after_sales_evidence_read_v1", {
        p_evidence_id: input.evidenceId,
        p_shop_id: access.selectedShop.shopId,
      })
    : await callStaffWebAfterSalesEvidenceRead(staffContext!, input.evidenceId);
  const payload = object(rpc.data);
  const objectPath = typeof payload?.objectPath === "string" ? payload.objectPath : null;
  if (rpc.error || payload?.ok !== true || !objectPath || !EVIDENCE_PATH.test(objectPath)) {
    return {
      code: typeof payload?.code === "string" ? payload.code : "backend_unavailable",
      ok: false as const,
    };
  }
  if (!(await revalidateShopAdminDataAccessForPublish(access, "orders.view"))) {
    return { code: "session_expired", ok: false as const };
  }
  const config = resolveSupabaseAdminConfig();
  const admin = createSupabaseAdminClient(config);
  if (config.status !== "configured" || !admin) {
    return { code: "backend_unavailable", ok: false as const };
  }
  const signed = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(objectPath, EVIDENCE_READ_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return { code: "storage_unavailable", ok: false as const };
  }
  return {
    code: "success",
    expiresInSeconds: EVIDENCE_READ_TTL_SECONDS,
    ok: true as const,
    signedUrl: signed.data.signedUrl,
  };
}
