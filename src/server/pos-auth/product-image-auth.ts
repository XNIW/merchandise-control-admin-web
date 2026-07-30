import "server-only";

import {
  createPosProductImageErrorBody,
  type PosProductImageOperation,
  type PosProductImageFinalizeRequest,
  type PosProductImageIntentRequest,
  type PosProductImageReadUrlsRequest,
  type PosProductImageRemoveRequest,
  type PosProductImageRequest,
} from "./product-image-envelope";
import { loadPosRuntimeLease } from "./runtime-boundary";
import { createPosRuntimeRpcClient } from "./runtime-rpc-client";
import { verifyPosSecret } from "./tokens";

export type PosProductImagePermission = "catalog.read" | "catalog.write";

export type TrustedPosProductImageRequest<
  T extends PosProductImageRequest = PosProductImageRequest,
> = Omit<T, "deviceToken" | "sessionToken"> & {
  permission: PosProductImagePermission;
  posDeviceCredentialId: string;
};

export type TrustedPosProductImageIntentRequest =
  TrustedPosProductImageRequest<PosProductImageIntentRequest>;
export type TrustedPosProductImageFinalizeRequest =
  TrustedPosProductImageRequest<PosProductImageFinalizeRequest>;
export type TrustedPosProductImageReadUrlsRequest =
  TrustedPosProductImageRequest<PosProductImageReadUrlsRequest>;
export type TrustedPosProductImageRemoveRequest =
  TrustedPosProductImageRequest<PosProductImageRemoveRequest>;

type PosProductImageAuthorizationFailureCode =
  "auth_denied" | "db_failure" | "not_configured" | "permission_denied";

export type PosProductImageAuthorizationResult<
  T extends PosProductImageRequest,
> =
  | {
      ok: true;
      request: TrustedPosProductImageRequest<T>;
    }
  | {
      body: Record<string, unknown>;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameUuid(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function authorizationFailure<T extends PosProductImageRequest>(
  code: PosProductImageAuthorizationFailureCode,
  operation: PosProductImageOperation,
): PosProductImageAuthorizationResult<T> {
  const accessDenied = code === "auth_denied" || code === "permission_denied";
  const status =
    code === "auth_denied"
      ? 401
      : code === "permission_denied"
        ? 403
        : code === "not_configured"
          ? 503
          : 500;

  return {
    body: createPosProductImageErrorBody({
      code,
      message: accessDenied
        ? "POS product image authorization was denied."
        : "POS product image authorization could not be completed.",
      operation,
      retryable: !accessDenied,
      terminal: accessDenied,
    }),
    ok: false,
    status,
  };
}

function requiredPermission(request: PosProductImageRequest) {
  return "operation" in request ? "catalog.write" : "catalog.read";
}

function requestOperation(
  request: PosProductImageRequest,
): PosProductImageOperation {
  return "operation" in request ? request.operation : "read-urls";
}

function sanitizeAuthorizedRequest<T extends PosProductImageRequest>(
  request: T,
  permission: PosProductImagePermission,
  posDeviceCredentialId: string,
) {
  const runtime = {
    appVersion: request.appVersion,
    permission,
    posDeviceCredentialId,
    posSessionId: request.posSessionId,
    schemaVersion: request.schemaVersion,
    shopDeviceId: request.shopDeviceId,
    shopId: request.shopId,
    staffCredentialVersion: request.staffCredentialVersion,
    staffId: request.staffId,
  };

  if (!("operation" in request)) {
    return {
      ...runtime,
      refs: request.refs.map((ref) => ({
        productId: ref.productId,
        variant: ref.variant,
        versionId: ref.versionId,
      })),
    } as unknown as TrustedPosProductImageRequest<T>;
  }

  const mutation = {
    ...runtime,
    expectedCurrentVersionId: request.expectedCurrentVersionId,
    idempotencyKey: request.idempotencyKey,
    operation: request.operation,
    operationId: request.operationId,
    payloadHash: request.payloadHash,
    productId: request.productId,
  };

  if (request.operation === "intent") {
    return {
      ...mutation,
      main: {
        bytes: request.main.bytes,
        height: request.main.height,
        mimeType: request.main.mimeType,
        sha256: request.main.sha256,
        width: request.main.width,
      },
      thumb: {
        bytes: request.thumb.bytes,
        height: request.thumb.height,
        mimeType: request.thumb.mimeType,
        sha256: request.thumb.sha256,
        width: request.thumb.width,
      },
    } as unknown as TrustedPosProductImageRequest<T>;
  }

  if (request.operation === "finalize") {
    return {
      ...mutation,
      versionId: request.versionId,
    } as unknown as TrustedPosProductImageRequest<T>;
  }

  return mutation as unknown as TrustedPosProductImageRequest<T>;
}

export async function authorizePosProductImageRequest<
  T extends PosProductImageRequest,
>(
  request: T,
  permission: PosProductImagePermission,
): Promise<PosProductImageAuthorizationResult<T>> {
  const operation = requestOperation(request);

  if (requiredPermission(request) !== permission) {
    return authorizationFailure<T>("db_failure", operation);
  }

  const rpcClient = createPosRuntimeRpcClient();

  if (!rpcClient) {
    return authorizationFailure<T>("not_configured", operation);
  }

  const lease = await loadPosRuntimeLease(rpcClient, {
    posSessionId: request.posSessionId,
    shopDeviceId: request.shopDeviceId,
  });

  if (lease.status === "db_failure") {
    return authorizationFailure<T>("db_failure", operation);
  }

  if (lease.status === "denied") {
    return authorizationFailure<T>("auth_denied", operation);
  }

  const identityMatches =
    sameUuid(lease.shop.shop_id, request.shopId) &&
    sameUuid(lease.device.shop_device_id, request.shopDeviceId) &&
    sameUuid(lease.session.pos_session_id, request.posSessionId) &&
    sameUuid(lease.staff.staff_id, request.staffId) &&
    lease.session.staff_credential_version === request.staffCredentialVersion &&
    lease.credential.staff_credential_version ===
      request.staffCredentialVersion &&
    lease.staff.credential_version === request.staffCredentialVersion;
  const deviceSecretMatches = verifyPosSecret(
    request.deviceToken,
    lease.credential.token_hash,
  );
  const sessionSecretMatches = verifyPosSecret(
    request.sessionToken,
    lease.session.session_token_hash,
  );
  const secretsMatch = deviceSecretMatches && sessionSecretMatches;

  if (!identityMatches || !secretsMatch) {
    return authorizationFailure<T>("auth_denied", operation);
  }

  const authorizationRpcClient = rpcClient as unknown as {
    rpc(
      functionName: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await authorizationRpcClient.rpc(
    "pos_product_image_authorize_v1",
    {
      p_expected_staff_credential_version: request.staffCredentialVersion,
      p_permission: permission,
      p_pos_session_id: request.posSessionId,
      p_shop_device_id: request.shopDeviceId,
      p_shop_id: request.shopId,
      p_staff_id: request.staffId,
    },
  );

  if (error || !isRecord(data)) {
    return authorizationFailure<T>("db_failure", operation);
  }

  if (data.ok === false && data.code === "auth_denied") {
    return authorizationFailure<T>("auth_denied", operation);
  }

  if (data.ok === false && data.code === "permission_denied") {
    return authorizationFailure<T>("permission_denied", operation);
  }

  if (data.ok !== true || data.code !== "authorized") {
    return authorizationFailure<T>("db_failure", operation);
  }

  return {
    ok: true,
    request: sanitizeAuthorizedRequest(
      request,
      permission,
      lease.credential.pos_device_credential_id,
    ),
  };
}
