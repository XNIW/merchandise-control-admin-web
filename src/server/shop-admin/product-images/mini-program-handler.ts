import "server-only";

import {
  resolveProductImageRequestActor,
  type ProductImageRequestActor,
} from "./auth";
import {
  parseProductImageFinalizeInput,
  parseProductImageIntentInput,
  parseProductImageReadInput,
  parseProductImageRemoveInput,
  productImageJson,
  readProductImageJson,
} from "./contract";
import {
  createProductImageIntent,
  finalizeProductImage,
  readProductImageUrls,
  recordProductImageDenied,
  removeProductImage,
  type ProductImageServiceResult,
} from "./service";
import {
  isWeChatSurfaceReady,
  resolveWeChatRuntimeConfig,
} from "@/server/auth/wechat-config";
import { isMiniProgramCatalogMutationReady } from "@/server/wechat/catalog-mutation-gateway";

export type MiniProgramProductImageOperation =
  | "finalize"
  | "intent"
  | "read-urls"
  | "remove";

type ProductImagePermission = "products.read" | "products.write";
type ProductImageDeniedOperation = "finalize" | "intent" | "read" | "remove";

type ProductImageOperation<Input extends { shopId: string }> = {
  deniedOperation: ProductImageDeniedOperation;
  parse: (value: unknown) => Input | null;
  permission: ProductImagePermission;
  productId: (input: Input) => string | undefined;
  requireIdentifiers?: boolean;
  run: (
    actor: ProductImageRequestActor,
    input: Input,
  ) => Promise<ProductImageServiceResult>;
};

type ProductImageRequestIdentifiers = {
  correlationId: string;
  idempotencyKey: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRequestIdentifiers(
  request: Request,
): ProductImageRequestIdentifiers | null {
  const correlationId = request.headers.get("x-correlation-id")?.trim();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  return correlationId &&
    idempotencyKey &&
    uuidPattern.test(correlationId) &&
    uuidPattern.test(idempotencyKey)
    ? { correlationId, idempotencyKey }
    : null;
}

function normalizedFailure(code: string) {
  if (code === "not_configured") {
    return { code: "provider_not_configured", status: 503 };
  }
  if (code === "unauthorized") {
    return { code: "session_expired", status: 401 };
  }
  if (code === "permission_denied") {
    return { code, status: 403 };
  }
  if (code === "not_found") {
    return { code: "entity_not_found", status: 404 };
  }
  if (code === "stale_conflict") {
    return { code: "stale_version", status: 409 };
  }
  if (
    code === "intent_expired" ||
    code === "invalid_state" ||
    code === "invalid_state_or_not_found" ||
    code === "storage_object_missing"
  ) {
    return { code: "invalid_state", status: 409 };
  }
  if (
    code === "jpeg_aspect_ratio_mismatch" ||
    code.startsWith("jpeg_") ||
    code === "verified_metadata_mismatch"
  ) {
    return { code: "image_invalid", status: 422 };
  }
  if (code === "rate_limited") {
    return { code, status: 429 };
  }
  if (code === "validation_failed") {
    return { code, status: 400 };
  }
  return { code: "retryable_error", status: 503 };
}

function normalizeProductImageResult(result: ProductImageServiceResult) {
  if (result.body.ok === true) return result;
  const rawCode =
    typeof result.body.code === "string" ? result.body.code : "retryable_error";
  const normalized = normalizedFailure(rawCode);
  return {
    body: {
      code: normalized.code,
      message: "Product image operation could not be completed.",
      ok: false,
    },
    status: normalized.status,
  };
}

async function handleProductImageOperation<Input extends { shopId: string }>(
  request: Request,
  value: unknown,
  operation: ProductImageOperation<Input>,
) {
  const identifiers = operation.requireIdentifiers
    ? parseRequestIdentifiers(request)
    : null;
  if (operation.requireIdentifiers && !identifiers) {
    return productImageJson(
      { code: "validation_failed", message: "Invalid request.", ok: false },
      400,
    );
  }
  const input = operation.parse(value);
  if (!input) {
    return productImageJson(
      { code: "validation_failed", message: "Invalid request.", ok: false },
      400,
    );
  }

  const auth = await resolveProductImageRequestActor(
    request,
    input.shopId,
    operation.permission,
    "personal_catalog_member",
  );
  if (auth.status !== "authorized") {
    await recordProductImageDenied({
      actorKind: auth.actorKind,
      actorProfileId: auth.actorProfileId,
      code: auth.code,
      operation: operation.deniedOperation,
      productId: operation.productId(input),
      shopId: input.shopId,
    });
    const normalized = normalizedFailure(auth.code);
    return productImageJson(
      {
        code: normalized.code,
        message: "Request is not authorized.",
        ok: false,
      },
      normalized.status,
    );
  }

  const result = normalizeProductImageResult(
    operation.deniedOperation === "intent" && identifiers
      ? await createProductImageIntent(
          auth.actor,
          input as never,
          identifiers,
        )
      : await operation.run(auth.actor, input),
  );
  return productImageJson(result.body, result.status);
}

export async function handleMiniProgramProductImageRequest(
  request: Request,
  operation: MiniProgramProductImageOperation,
) {
  const ready =
    operation === "read-urls"
      ? isWeChatSurfaceReady(
          "mini_program",
          resolveWeChatRuntimeConfig(),
        )
      : isMiniProgramCatalogMutationReady();
  if (!ready) {
    return productImageJson(
      {
        code: "provider_not_configured",
        message: "Product image operation is not configured.",
        ok: false,
      },
      503,
    );
  }

  const value = await readProductImageJson(request);

  switch (operation) {
    case "intent":
      return handleProductImageOperation(request, value, {
        deniedOperation: "intent",
        parse: parseProductImageIntentInput,
        permission: "products.write",
        productId: (input) => input.productId,
        requireIdentifiers: true,
        run: createProductImageIntent,
      });
    case "finalize":
      return handleProductImageOperation(request, value, {
        deniedOperation: "finalize",
        parse: parseProductImageFinalizeInput,
        permission: "products.write",
        productId: (input) => input.productId,
        run: finalizeProductImage,
      });
    case "remove":
      return handleProductImageOperation(request, value, {
        deniedOperation: "remove",
        parse: parseProductImageRemoveInput,
        permission: "products.write",
        productId: (input) => input.productId,
        run: removeProductImage,
      });
    case "read-urls":
      return handleProductImageOperation(request, value, {
        deniedOperation: "read",
        parse: parseProductImageReadInput,
        permission: "products.read",
        productId: (input) => input.refs[0]?.productId,
        run: readProductImageUrls,
      });
  }
}
