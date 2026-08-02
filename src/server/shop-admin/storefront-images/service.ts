import "server-only";

import type { Json } from "@/lib/supabase/database.types";
import {
  createSupabaseAdminClient,
  resolveSupabaseAdminConfig,
} from "@/lib/supabase/admin";
import type { ShopAdminActionContext } from "../action-context";
import {
  PRODUCT_IMAGE_MAIN_MAX_BYTES,
  PRODUCT_IMAGE_MAIN_MAX_SIDE,
} from "../product-images/contract";
import { verifyDownloadedProductImageJpeg } from "../product-images/runtime-core";
import {
  STOREFRONT_IMAGE_BUCKET,
  STOREFRONT_IMAGE_SOURCE_BUCKET,
  type StorefrontImageIntentInput,
  type StorefrontImageMetadata,
  type StorefrontImageSourceInput,
  type StorefrontImageTargetInput,
  type StorefrontImageVariant,
} from "./contract";
import { verifyStorefrontWebp } from "./webp-validator";

type ReadyContext = Extract<ShopAdminActionContext, { status: "ready" }>;
type JsonObject = Record<string, Json | undefined>;
type ServiceResult = { body: Record<string, unknown>; status: number };

function adminClient() {
  const config = resolveSupabaseAdminConfig();
  return config.status === "configured"
    ? createSupabaseAdminClient(config)
    : null;
}
async function ensurePublicAssetOrigin() {
  const config = resolveSupabaseAdminConfig();
  if (config.status !== "configured") return false;
  const admin = createSupabaseAdminClient(config);
  if (!admin) return false;
  let origin: string;
  try {
    const url = new URL(config.url);
    origin =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
        ? "https://local.supabase.invalid"
        : url.origin;
  } catch {
    return false;
  }
  const result = await admin.rpc("storefront_image_configure_origin_v1", {
    p_origin: origin,
  });
  return !result.error && object(result.data).ok === true;
}
function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function text(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}
function number(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : null;
}
function failure(code: string, status = 503): ServiceResult {
  return {
    body: { code, message: "Storefront image operation failed.", ok: false },
    status,
  };
}
function rpcStatus(code: string) {
  if (code === "permission_denied") return 403;
  if (code === "invalid_state_or_not_found" || code === "not_found") return 404;
  if (code === "stale_conflict" || code === "invalid_state") return 409;
  if (code === "validation_failed") return 400;
  if (code === "verified_metadata_mismatch") return 422;
  return 503;
}
function lease(context: ReadyContext) {
  return context.principalKind === "pos_staff_manager"
    ? {
        p_expected_credential_version:
          context.staffWebSession.credentialVersion,
        p_session_token_hash: context.staffWebSession.sessionTokenHash,
        p_staff_id: context.actorStaffId,
        p_staff_web_session_id: context.staffWebSession.sessionId,
      }
    : {};
}
function contextRpc(
  context: ReadyContext,
  name:
    | "admin_storefront_image_finalize_v1"
    | "admin_storefront_image_intent_v1"
    | "admin_storefront_image_rollback_v1"
    | "admin_storefront_image_source_read_v1",
  args: Record<string, unknown>,
) {
  const client =
    context.principalKind === "personal_account"
      ? context.supabase
      : adminClient();
  if (!client)
    return Promise.resolve({ data: null, error: new Error("not_configured") });
  return client.rpc(name, { ...args, ...lease(context) } as never);
}

export async function readStorefrontSourceImage(
  context: ReadyContext,
  input: StorefrontImageSourceInput,
): Promise<
  { bytes: Uint8Array; contentType: "image/jpeg"; status: 200 } | ServiceResult
> {
  const rpc = await contextRpc(
    context,
    "admin_storefront_image_source_read_v1",
    {
      p_publication_id: input.publicationId,
      p_shop_id: input.shopId,
      p_source_image_version_id: input.sourceImageVersionId,
    },
  );
  if (rpc.error) return failure("backend_unavailable");
  const payload = object(rpc.data);
  const code = text(payload.code) ?? "backend_unavailable";
  if (payload.ok !== true) return failure(code, rpcStatus(code));
  const path = text(payload.path);
  const expected = {
    bytes: number(payload.bytes),
    height: number(payload.height),
    sha256: text(payload.sha256),
    width: number(payload.width),
  };
  if (
    !path ||
    !expected.bytes ||
    !expected.height ||
    !expected.sha256 ||
    !expected.width
  ) {
    return failure("backend_contract_invalid");
  }
  const admin = adminClient();
  if (!admin) return failure("not_configured");
  const download = await admin.storage
    .from(STOREFRONT_IMAGE_SOURCE_BUCKET)
    .download(path);
  if (download.error || !download.data)
    return failure("source_storage_unavailable");
  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const verified = verifyDownloadedProductImageJpeg({
    blobMimeType: download.data.type,
    bytes,
    expectedBytes: expected.bytes,
    expectedHeight: expected.height,
    expectedSha256: expected.sha256,
    expectedWidth: expected.width,
    maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
  });
  return verified.ok
    ? { bytes, contentType: "image/jpeg", status: 200 }
    : failure(verified.code, 422);
}

function variantArray(input: StorefrontImageIntentInput) {
  return (["thumb", "card", "detail"] as const).map((variant) => ({
    variant,
    ...input.variants[variant],
  }));
}

export async function createStorefrontImageIntent(
  context: ReadyContext,
  input: StorefrontImageIntentInput,
): Promise<ServiceResult> {
  if (!(await ensurePublicAssetOrigin())) return failure("not_configured");
  const rpc = await contextRpc(context, "admin_storefront_image_intent_v1", {
    p_publication_id: input.publicationId,
    p_shop_id: input.shopId,
    p_source_image_version_id: input.sourceImageVersionId,
    p_variants: variantArray(input),
  });
  if (rpc.error) return failure("backend_unavailable");
  const payload = object(rpc.data);
  const code = text(payload.code) ?? "backend_unavailable";
  if (payload.ok !== true) return failure(code, rpcStatus(code));
  const imagePublicationId = text(payload.targetId);
  const status = text(payload.status);
  if (
    !imagePublicationId ||
    (status !== "noop" && status !== "upload_required")
  ) {
    return failure("backend_contract_invalid");
  }
  if (status === "noop") {
    return { body: { imagePublicationId, ok: true, status }, status: 200 };
  }
  const rows = Array.isArray(payload.variants) ? payload.variants : [];
  const paths = new Map<StorefrontImageVariant, string>();
  for (const row of rows) {
    const item = object(row);
    const variant = text(item.variant) as StorefrontImageVariant | null;
    const path = text(item.path);
    if (
      !variant ||
      !path ||
      !Object.hasOwn(input.variants, variant) ||
      path !==
        `shops/${input.shopId}/products/${text(payload.productId)}/public/${imagePublicationId}/${variant}-${input.variants[variant].sha256.slice(0, 16)}.webp`
    ) {
      return failure("backend_contract_invalid");
    }
    paths.set(variant, path);
  }
  if (paths.size !== 3) return failure("backend_contract_invalid");
  const admin = adminClient();
  if (!admin) return failure("not_configured");
  const bucket = admin.storage.from(STOREFRONT_IMAGE_BUCKET);
  const signed = await Promise.all(
    (["thumb", "card", "detail"] as const).map(async (variant) => {
      const result = await bucket.createSignedUploadUrl(paths.get(variant)!);
      return { result, variant };
    }),
  );
  if (signed.some(({ result }) => result.error || !result.data?.signedUrl)) {
    return failure("storage_unavailable");
  }
  return {
    body: {
      imagePublicationId,
      ok: true,
      paths: Object.fromEntries(paths),
      status,
      uploads: Object.fromEntries(
        signed.map(({ result, variant }) => [variant, result.data!.signedUrl]),
      ),
    },
    status: 201,
  };
}

type StoredVariant = {
  expected: StorefrontImageMetadata;
  id: string;
  path: string;
  variant: StorefrontImageVariant;
};

async function storedVariants(input: StorefrontImageTargetInput) {
  const admin = adminClient();
  if (!admin) return { admin: null, rows: null };
  const result = await admin
    .from("storefront_image_publication_variants")
    .select(
      "id,variant,object_path,expected_bytes,expected_width,expected_height,expected_sha256",
    )
    .eq("shop_id", input.shopId)
    .eq("image_publication_id", input.imagePublicationId);
  if (result.error || result.data.length !== 3) return { admin, rows: null };
  const rows: StoredVariant[] = [];
  for (const row of result.data) {
    if (
      row.variant !== "thumb" &&
      row.variant !== "card" &&
      row.variant !== "detail"
    )
      return { admin, rows: null };
    rows.push({
      expected: {
        bytes: row.expected_bytes,
        height: row.expected_height,
        mimeType: "image/webp",
        sha256: row.expected_sha256,
        width: row.expected_width,
      },
      id: row.id,
      path: row.object_path,
      variant: row.variant,
    });
  }
  return { admin, rows };
}

async function verifyStoredVariants(input: StorefrontImageTargetInput) {
  const loaded = await storedVariants(input);
  if (!loaded.admin || !loaded.rows) return null;
  const bucket = loaded.admin.storage.from(STOREFRONT_IMAGE_BUCKET);
  const verified = await Promise.all(
    loaded.rows.map(async (row) => {
      const download = await bucket.download(row.path);
      if (download.error || !download.data) return null;
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const result = verifyStorefrontWebp({
        blobMimeType: download.data.type,
        bytes,
        expected: row.expected,
      });
      if (!result.ok) return null;
      const publicUrl = bucket.getPublicUrl(row.path).data.publicUrl;
      return { publicUrl, variant: row.variant, ...row.expected };
    }),
  );
  return verified.every(Boolean) ? verified : null;
}

export async function finalizeStorefrontImage(
  context: ReadyContext,
  input: StorefrontImageTargetInput,
): Promise<ServiceResult> {
  if (!(await ensurePublicAssetOrigin())) return failure("not_configured");
  const verified = await verifyStoredVariants(input);
  if (!verified) return failure("stored_derivative_verification_failed", 422);
  const rpc = await contextRpc(context, "admin_storefront_image_finalize_v1", {
    p_image_publication_id: input.imagePublicationId,
    p_shop_id: input.shopId,
    p_verified_variants: verified,
  });
  if (rpc.error) return failure("backend_unavailable");
  const payload = object(rpc.data);
  const code = text(payload.code) ?? "backend_unavailable";
  return payload.ok === true
    ? {
        body: {
          imagePublicationId: input.imagePublicationId,
          ok: true,
          status: text(payload.status),
        },
        status: 200,
      }
    : failure(code, rpcStatus(code));
}

export async function rollbackStorefrontImage(
  context: ReadyContext,
  input: StorefrontImageTargetInput,
): Promise<ServiceResult> {
  const verified = await verifyStoredVariants(input);
  if (!verified) return failure("rollback_artifact_unavailable", 409);
  const rpc = await contextRpc(context, "admin_storefront_image_rollback_v1", {
    p_shop_id: input.shopId,
    p_target_image_publication_id: input.imagePublicationId,
  });
  if (rpc.error) return failure("backend_unavailable");
  const payload = object(rpc.data);
  const code = text(payload.code) ?? "backend_unavailable";
  return payload.ok === true
    ? {
        body: {
          imagePublicationId: input.imagePublicationId,
          ok: true,
          status: text(payload.status),
        },
        status: 200,
      }
    : failure(code, rpcStatus(code));
}
