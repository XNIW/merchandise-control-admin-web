import "server-only";

import type { SupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import type { ProductImageRequestActor } from "./auth";
import { createProductImageCacheScope } from "./cache-scope";
import {
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAIN_MAX_BYTES,
  PRODUCT_IMAGE_MAIN_MAX_SIDE,
  PRODUCT_IMAGE_READ_RESPONSE_LIMIT,
  PRODUCT_IMAGE_READ_URL_TTL_SECONDS,
  PRODUCT_IMAGE_THUMB_MAX_BYTES,
  PRODUCT_IMAGE_THUMB_MAX_SIDE,
  type ProductImageFinalizeInput,
  type ProductImageIntentInput,
  type ProductImageReadInput,
  type ProductImageRemoveInput,
  type ProductImageUploadMetadata,
} from "./contract";
import {
  isCanonicalProductImagePath as canonicalProductImagePath,
  isProductImageStorageObjectMissingError,
  resolveProductImageAdminClient as resolveAdminClient,
  verifyDownloadedProductImageJpeg as verifyDownloadedJpeg,
} from "./runtime-core";

type RpcObject = Record<string, Json | undefined>;
type ImageVersionRow = Tables<"inventory_product_image_versions">;

export type ProductImageServiceResult = {
  body: Record<string, unknown>;
  status: number;
};

function serviceResult(
  status: number,
  body: Record<string, unknown>,
): ProductImageServiceResult {
  return { body, status };
}

function safeFailure(code: string, status = 503) {
  return serviceResult(status, {
    code,
    message: "Product image operation could not be completed.",
    ok: false,
  });
}

function asObject(value: Json | null): RpcObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RpcObject)
    : {};
}

function textField(value: Json | undefined) {
  return typeof value === "string" ? value : null;
}

function booleanField(value: Json | undefined) {
  return value === true;
}

function statusForRpcCode(code: string) {
  if (code === "permission_denied") return 403;
  if (code === "not_found") return 404;
  if (code === "rate_limited") return 429;
  if (
    code === "stale_conflict" ||
    code === "invalid_state" ||
    code === "invalid_state_or_not_found" ||
    code === "intent_expired"
  ) {
    return 409;
  }
  if (code === "validation_failed") return 400;
  if (code === "verified_metadata_mismatch") return 422;
  return 503;
}

async function productImageAccessIsPublishable(
  admin: SupabaseAdminClient,
  actor: ProductImageRequestActor,
  permission: "read" | "write",
) {
  const { data, error } = await admin.rpc(
    "product_image_revalidate_access_v1",
    {
      p_actor_kind: actor.actorKind,
      p_actor_profile_id: actor.actorProfileId,
      p_permission: permission,
      p_shop_id: actor.shopId,
    },
  );
  return !error && data === true;
}

async function markVersionFailed(
  admin: SupabaseAdminClient,
  actor: ProductImageRequestActor,
  input: ProductImageFinalizeInput,
  code: string,
) {
  await admin.rpc("product_image_fail_version", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_error_code: code,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
    p_version_id: input.versionId,
  });
}

export async function recordProductImageDenied(input: {
  actorKind?: ProductImageRequestActor["actorKind"];
  actorProfileId?: string;
  code: string;
  operation: "finalize" | "intent" | "read" | "remove" | "request";
  productId?: string;
  shopId: string;
}) {
  if (!input.actorProfileId || !input.productId) {
    return;
  }

  const admin = resolveAdminClient();
  if (!admin) {
    return;
  }

  await admin.rpc("product_image_record_denied", {
    p_actor_kind: input.actorKind ?? "personal_account",
    p_actor_profile_id: input.actorProfileId,
    p_code: input.code,
    p_operation: input.operation,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
  });
}

export async function createProductImageIntent(
  actor: ProductImageRequestActor,
  input: ProductImageIntentInput,
): Promise<ProductImageServiceResult> {
  const admin = resolveAdminClient();
  if (!admin) {
    return safeFailure("not_configured");
  }

  const rpcResult = await admin.rpc("product_image_create_intent", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_main_bytes: input.main.bytes,
    p_main_height: input.main.height,
    p_main_sha256: input.main.sha256,
    p_main_width: input.main.width,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
    p_thumb_bytes: input.thumb.bytes,
    p_thumb_height: input.thumb.height,
    p_thumb_sha256: input.thumb.sha256,
    p_thumb_width: input.thumb.width,
  });

  if (rpcResult.error) {
    return safeFailure("backend_unavailable");
  }

  const rpc = asObject(rpcResult.data);
  const code = textField(rpc.code) ?? "backend_unavailable";

  if (!booleanField(rpc.ok)) {
    return safeFailure(code, statusForRpcCode(code));
  }

  const versionId = textField(rpc.version_id);
  if (rpc.status === "noop" && versionId) {
    return serviceResult(200, {
      cacheScope: createProductImageCacheScope(
        actor.actorKind,
        actor.actorProfileId,
      ),
      ok: true,
      status: "noop",
      versionId,
    });
  }

  const mainPath = textField(rpc.main_path);
  const thumbPath = textField(rpc.thumb_path);
  const expiresAt = textField(rpc.expires_at);

  if (
    !versionId ||
    !mainPath ||
    !thumbPath ||
    !expiresAt ||
    !canonicalProductImagePath({
      path: mainPath,
      productId: input.productId,
      shopId: input.shopId,
      variant: "main",
      versionId,
    }) ||
    !canonicalProductImagePath({
      path: thumbPath,
      productId: input.productId,
      shopId: input.shopId,
      variant: "thumb",
      versionId,
    })
  ) {
    return safeFailure("backend_contract_invalid");
  }

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  const [mainSigned, thumbSigned] = await Promise.all([
    bucket.createSignedUploadUrl(mainPath),
    bucket.createSignedUploadUrl(thumbPath),
  ]);

  const mainUploadUrl = mainSigned.data?.signedUrl;
  const thumbUploadUrl = thumbSigned.data?.signedUrl;

  if (
    mainSigned.error ||
    thumbSigned.error ||
    !mainUploadUrl ||
    !thumbUploadUrl
  ) {
    await markVersionFailed(
      admin,
      actor,
      { productId: input.productId, shopId: input.shopId, versionId },
      "signed_url_creation_failed",
    );
    return safeFailure("storage_unavailable");
  }

  if (!(await productImageAccessIsPublishable(admin, actor, "write"))) {
    await markVersionFailed(
      admin,
      actor,
      { productId: input.productId, shopId: input.shopId, versionId },
      "permission_revoked_before_publication",
    );
    return safeFailure("permission_denied", 403);
  }

  return serviceResult(201, {
    cacheScope: createProductImageCacheScope(
      actor.actorKind,
      actor.actorProfileId,
    ),
    expiresAt,
    mainUploadUrl,
    ok: true,
    status: "upload_required",
    thumbUploadUrl,
    versionId,
  });
}

async function loadImageVersion(
  admin: SupabaseAdminClient,
  input: ProductImageFinalizeInput,
) {
  return admin
    .from("inventory_product_image_versions")
    .select(
      "id,shop_id,product_id,status,expires_at,main_path,thumb_path,expected_main_sha256,expected_main_bytes,expected_main_width,expected_main_height,expected_thumb_sha256,expected_thumb_bytes,expected_thumb_width,expected_thumb_height,verified_main_sha256,verified_main_bytes,verified_main_width,verified_main_height,verified_thumb_sha256,verified_thumb_bytes,verified_thumb_width,verified_thumb_height",
    )
    .eq("id", input.versionId)
    .eq("shop_id", input.shopId)
    .eq("product_id", input.productId)
    .maybeSingle();
}

function finalizedMetadata(row: ImageVersionRow) {
  if (
    !row.verified_main_sha256 ||
    row.verified_main_bytes === null ||
    row.verified_main_width === null ||
    row.verified_main_height === null ||
    !row.verified_thumb_sha256 ||
    row.verified_thumb_bytes === null ||
    row.verified_thumb_width === null ||
    row.verified_thumb_height === null
  ) {
    return null;
  }

  return {
    main: {
      bytes: row.verified_main_bytes,
      height: row.verified_main_height,
      sha256: row.verified_main_sha256,
      width: row.verified_main_width,
    },
    thumb: {
      bytes: row.verified_thumb_bytes,
      height: row.verified_thumb_height,
      sha256: row.verified_thumb_sha256,
      width: row.verified_thumb_width,
    },
  };
}

async function callFinalizeRpc(
  admin: SupabaseAdminClient,
  actor: ProductImageRequestActor,
  input: ProductImageFinalizeInput,
  metadata: ReturnType<typeof finalizedMetadata> extends infer T
    ? Exclude<T, null>
    : never,
) {
  return admin.rpc("product_image_finalize", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_main_bytes: metadata.main.bytes,
    p_main_height: metadata.main.height,
    p_main_sha256: metadata.main.sha256,
    p_main_width: metadata.main.width,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
    p_thumb_bytes: metadata.thumb.bytes,
    p_thumb_height: metadata.thumb.height,
    p_thumb_sha256: metadata.thumb.sha256,
    p_thumb_width: metadata.thumb.width,
    p_version_id: input.versionId,
  });
}

export async function finalizeProductImage(
  actor: ProductImageRequestActor,
  input: ProductImageFinalizeInput,
): Promise<ProductImageServiceResult> {
  const admin = resolveAdminClient();
  if (!admin) {
    return safeFailure("not_configured");
  }

  const versionResult = await loadImageVersion(admin, input);
  if (versionResult.error || !versionResult.data) {
    return safeFailure("not_found", 404);
  }

  const version = versionResult.data as ImageVersionRow;
  let metadata = finalizedMetadata(version);

  if (version.status === "ready" && metadata) {
    const idempotentResult = await callFinalizeRpc(admin, actor, input, metadata);
    if (idempotentResult.error) {
      return safeFailure("backend_unavailable");
    }
    const rpc = asObject(idempotentResult.data);
    const code = textField(rpc.code) ?? "backend_unavailable";
    return booleanField(rpc.ok)
      ? serviceResult(200, {
          imageUpdatedAt: textField(rpc.image_updated_at),
          ok: true,
          status: textField(rpc.status) ?? "already_finalized",
          versionId: input.versionId,
        })
      : safeFailure(code, statusForRpcCode(code));
  }

  if (version.status !== "pending") {
    return safeFailure("invalid_state", 409);
  }
  if (Date.parse(version.expires_at) < Date.now()) {
    await markVersionFailed(admin, actor, input, "intent_expired");
    return safeFailure("intent_expired", 409);
  }

  const bucket = admin.storage.from(PRODUCT_IMAGE_BUCKET);
  const [mainDownload, thumbDownload] = await Promise.all([
    bucket.download(version.main_path),
    bucket.download(version.thumb_path),
  ]);
  const downloads = [mainDownload, thumbDownload];

  if (
    mainDownload.error ||
    thumbDownload.error ||
    !mainDownload.data ||
    !thumbDownload.data
  ) {
    const hasTransientOrMalformedResult = downloads.some((download) =>
      download.error
        ? !isProductImageStorageObjectMissingError(download.error)
        : !download.data,
    );
    if (hasTransientOrMalformedResult) {
      return safeFailure("storage_unavailable");
    }
    await markVersionFailed(admin, actor, input, "storage_object_missing");
    return safeFailure("storage_object_missing", 409);
  }

  const [mainBuffer, thumbBuffer] = await Promise.all([
    mainDownload.data.arrayBuffer(),
    thumbDownload.data.arrayBuffer(),
  ]);
  const mainBytes = new Uint8Array(mainBuffer);
  const thumbBytes = new Uint8Array(thumbBuffer);
  const main = verifyDownloadedJpeg({
    blobMimeType: mainDownload.data.type,
    bytes: mainBytes,
    expectedBytes: version.expected_main_bytes,
    expectedHeight: version.expected_main_height,
    expectedSha256: version.expected_main_sha256,
    expectedWidth: version.expected_main_width,
    maxBytes: PRODUCT_IMAGE_MAIN_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_MAIN_MAX_SIDE,
  });
  const thumb = verifyDownloadedJpeg({
    blobMimeType: thumbDownload.data.type,
    bytes: thumbBytes,
    expectedBytes: version.expected_thumb_bytes,
    expectedHeight: version.expected_thumb_height,
    expectedSha256: version.expected_thumb_sha256,
    expectedWidth: version.expected_thumb_width,
    maxBytes: PRODUCT_IMAGE_THUMB_MAX_BYTES,
    maxSide: PRODUCT_IMAGE_THUMB_MAX_SIDE,
  });

  if (!main.ok || !thumb.ok) {
    const code = !main.ok ? main.code : !thumb.ok ? thumb.code : "validation_failed";
    await markVersionFailed(admin, actor, input, code);
    return safeFailure(code, 422);
  }

  if (Math.abs(main.width / main.height - thumb.width / thumb.height) > 0.02) {
    await markVersionFailed(admin, actor, input, "jpeg_aspect_ratio_mismatch");
    return safeFailure("jpeg_aspect_ratio_mismatch", 422);
  }

  metadata = {
    main: {
      bytes: mainBytes.byteLength,
      height: main.height,
      sha256: main.sha256,
      width: main.width,
    },
    thumb: {
      bytes: thumbBytes.byteLength,
      height: thumb.height,
      sha256: thumb.sha256,
      width: thumb.width,
    },
  };

  const finalizeResult = await callFinalizeRpc(admin, actor, input, metadata);
  if (finalizeResult.error) {
    return safeFailure("backend_unavailable");
  }

  const rpc = asObject(finalizeResult.data);
  const code = textField(rpc.code) ?? "backend_unavailable";
  return booleanField(rpc.ok)
    ? serviceResult(200, {
        imageUpdatedAt: textField(rpc.image_updated_at),
        ok: true,
        status: textField(rpc.status) ?? "finalized",
        versionId: input.versionId,
      })
    : safeFailure(code, statusForRpcCode(code));
}

export async function removeProductImage(
  actor: ProductImageRequestActor,
  input: ProductImageRemoveInput,
): Promise<ProductImageServiceResult> {
  const admin = resolveAdminClient();
  if (!admin) {
    return safeFailure("not_configured");
  }

  const removeResult = await admin.rpc("product_image_remove", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_expected_version_id: input.expectedVersionId,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
  });

  if (removeResult.error) {
    return safeFailure("backend_unavailable");
  }

  const rpc = asObject(removeResult.data);
  const code = textField(rpc.code) ?? "backend_unavailable";
  if (!booleanField(rpc.ok)) {
    return safeFailure(code, statusForRpcCode(code));
  }

  const status = textField(rpc.status) ?? "already_removed";
  if (status === "already_removed") {
    return serviceResult(200, {
      currentImageVersionId: null,
      ok: true,
      operation: "remove",
      productId: input.productId,
      shopId: input.shopId,
      status,
      versionId: input.expectedVersionId,
    });
  }

  const mainPath = textField(rpc.main_path);
  const thumbPath = textField(rpc.thumb_path);
  const versionId = textField(rpc.version_id);
  if (
    status !== "removed" ||
    versionId !== input.expectedVersionId ||
    !mainPath ||
    !thumbPath ||
    !canonicalProductImagePath({
      path: mainPath,
      productId: input.productId,
      shopId: input.shopId,
      variant: "main",
      versionId: input.expectedVersionId,
    }) ||
    !canonicalProductImagePath({
      path: thumbPath,
      productId: input.productId,
      shopId: input.shopId,
      variant: "thumb",
      versionId: input.expectedVersionId,
    })
  ) {
    return safeFailure("backend_contract_invalid");
  }

  const storageResult = await admin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .remove([mainPath, thumbPath]);

  const cleanupRecordResult = await admin.rpc("product_image_record_cleanup", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_error_code: storageResult.error ? "storage_delete_failed" : undefined,
    p_product_id: input.productId,
    p_shop_id: input.shopId,
    p_source: "api_remove",
    p_success: !storageResult.error,
    p_version_id: input.expectedVersionId,
  });
  const cleanupRecord = asObject(cleanupRecordResult.data);
  const cleanupStatus: "complete" | "pending" =
    !storageResult.error &&
    !cleanupRecordResult.error &&
    booleanField(cleanupRecord.ok) &&
    textField(cleanupRecord.cleanup_status) === "complete"
      ? "complete"
      : "pending";

  return serviceResult(200, {
    cleanupStatus,
    currentImageVersionId: null,
    imageUpdatedAt: textField(rpc.image_updated_at),
    ok: true,
    operation: "remove",
    productId: input.productId,
    shopId: input.shopId,
    status,
    versionId: input.expectedVersionId,
  });
}

type ResolvedReadItem = {
  code: string;
  metadata?: ProductImageUploadMetadata;
  objectPath?: string;
  productId: string;
  variant: "main" | "thumb";
  versionId: string;
};

function integerField(value: Json | undefined) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function parseResolvedReadItems(
  value: Json | undefined,
  input: ProductImageReadInput,
): ResolvedReadItem[] | null {
  if (!Array.isArray(value) || value.length !== input.refs.length) {
    return null;
  }

  const parsed: ResolvedReadItem[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const candidate = item as RpcObject;
    const productId = textField(candidate.product_id);
    const versionId = textField(candidate.version_id);
    const variant = textField(candidate.variant);
    const code = textField(candidate.code);
    const objectPath = textField(candidate.object_path) ?? undefined;
    const expected = input.refs[index];
    if (
      !productId ||
      !versionId ||
      !code ||
      (variant !== "main" && variant !== "thumb") ||
      !expected ||
      productId !== expected.productId ||
      versionId !== expected.versionId ||
      variant !== expected.variant ||
      (code !== "success" && code !== "not_found")
    ) {
      return null;
    }

    if (code === "not_found") {
      if (objectPath) return null;
      parsed.push({ code, productId, variant, versionId });
      continue;
    }

    const sha256 = textField(candidate.verified_sha256);
    const bytes = integerField(candidate.verified_bytes);
    const width = integerField(candidate.verified_width);
    const height = integerField(candidate.verified_height);
    const mimeType = textField(candidate.verified_mime_type);
    const maxBytes =
      variant === "main"
        ? PRODUCT_IMAGE_MAIN_MAX_BYTES
        : PRODUCT_IMAGE_THUMB_MAX_BYTES;
    const maxSide =
      variant === "main"
        ? PRODUCT_IMAGE_MAIN_MAX_SIDE
        : PRODUCT_IMAGE_THUMB_MAX_SIDE;
    if (
      !objectPath ||
      !canonicalProductImagePath({
        path: objectPath,
        productId,
        shopId: input.shopId,
        variant,
        versionId,
      }) ||
      !sha256 ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      bytes === null ||
      bytes < 1 ||
      bytes > maxBytes ||
      width === null ||
      width < 1 ||
      width > maxSide ||
      height === null ||
      height < 1 ||
      height > maxSide ||
      mimeType !== "image/jpeg"
    ) {
      return null;
    }
    parsed.push({
      code,
      metadata: { bytes, height, mimeType, sha256, width },
      objectPath,
      productId,
      variant,
      versionId,
    });
  }
  return parsed;
}

export async function readProductImageUrls(
  actor: ProductImageRequestActor,
  input: ProductImageReadInput,
): Promise<ProductImageServiceResult> {
  const admin = resolveAdminClient();
  if (!admin) {
    return safeFailure("not_configured");
  }

  const resolveResult = await admin.rpc("product_image_resolve_read_paths", {
    p_actor_kind: actor.actorKind,
    p_actor_profile_id: actor.actorProfileId,
    p_refs: input.refs,
    p_shop_id: input.shopId,
  });
  if (resolveResult.error) {
    return safeFailure("backend_unavailable");
  }

  const rpc = asObject(resolveResult.data);
  const code = textField(rpc.code) ?? "backend_unavailable";
  if (!booleanField(rpc.ok)) {
    return safeFailure(code, statusForRpcCode(code));
  }

  const resolved = parseResolvedReadItems(rpc.items, input);
  if (!resolved) {
    return safeFailure("backend_contract_invalid");
  }

  const paths = resolved.flatMap((item) =>
    item.code === "success" && item.objectPath ? [item.objectPath] : [],
  );
  const signedByPath = new Map<string, string>();

  if (paths.length > 0) {
    const signedResult = await admin.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .createSignedUrls(paths, PRODUCT_IMAGE_READ_URL_TTL_SECONDS);

    if (
      signedResult.error ||
      !signedResult.data ||
      signedResult.data.length !== paths.length
    ) {
      return safeFailure("storage_unavailable");
    }

    for (const [index, signed] of signedResult.data.entries()) {
      const expectedPath = paths[index];
      if (
        !expectedPath ||
        signed.path !== expectedPath ||
        !signed.signedUrl
      ) {
        return safeFailure("storage_unavailable");
      }
      signedByPath.set(expectedPath, signed.signedUrl);
    }
  }

  const expiresAt = new Date(
    Date.now() + PRODUCT_IMAGE_READ_URL_TTL_SECONDS * 1000,
  ).toISOString();
  const items = resolved.map((item) => {
    const signedUrl = item.objectPath
      ? signedByPath.get(item.objectPath)
      : undefined;
    if (item.code === "success" && (!signedUrl || !item.metadata)) {
      return null;
    }
    return item.code === "success"
      ? {
          expiresAt,
          metadata: item.metadata,
          productId: item.productId,
          signedUrl: signedUrl!,
          status: "ready",
          variant: item.variant,
          versionId: item.versionId,
        }
      : {
          productId: item.productId,
          status: "not_found",
          variant: item.variant,
          versionId: item.versionId,
        };
  });

  if (items.some((item) => item === null)) {
    return safeFailure("storage_unavailable");
  }

  const body = {
    cacheScope: createProductImageCacheScope(
      actor.actorKind,
      actor.actorProfileId,
    ),
    items,
    ok: true,
  };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > PRODUCT_IMAGE_READ_RESPONSE_LIMIT) {
    return safeFailure("backend_contract_invalid");
  }
  if (!(await productImageAccessIsPublishable(admin, actor, "read"))) {
    return safeFailure("permission_denied", 403);
  }
  return serviceResult(200, body);
}
