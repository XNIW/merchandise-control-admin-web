"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Json } from "@/lib/supabase/database.types";
import { resolveShopActionContext } from "@/server/shop-admin/action-context";
import {
  isCourierLocationInput,
  isDeliveryUuid,
  validatedExternalTrackingUrl,
} from "@/server/shop-admin/delivery-tracking-validation";
import {
  callStaffWebCourierLocationUpsert,
  callStaffWebCourierTrackingControl,
  callStaffWebDeliveryTrackingManage,
} from "@/server/shop-admin/staff-web-lease-bound-rpc";

export type DeliveryActionResult = {
  code: string;
  message: string;
  ok: boolean;
  retryAfterSeconds?: number;
};

type ConfigureDeliveryInput = {
  contactCapability?: "none" | "store_phone" | "store_support_url";
  courierPublicLabel?: string;
  courierStaffId?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  etaEndsAt?: string;
  etaStartsAt?: string;
  externalCarrier?: string;
  externalTrackingCodeMasked?: string;
  externalTrackingUrl?: string;
  mode: "externalCarrier" | "liveCourier" | "statusOnly";
  orderId: string;
  shopId: string;
  storeLatitude?: number;
  storeLongitude?: number;
  vehicleKind?: string;
};

function objectValue(value: Json | null): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : {};
}

function resultFromRpc(
  data: Json | null,
  error: unknown,
): DeliveryActionResult {
  if (error) {
    return { code: "db_failure", message: "Operazione non riuscita.", ok: false };
  }
  const payload = objectValue(data);
  const code = typeof payload.code === "string" ? payload.code : "db_failure";
  const messages: Record<string, string> = {
    assignment_denied: "Questa consegna non è più assegnata al corriere.",
    feature_disabled: "Il tracking live non è attivo per questo negozio.",
    idempotency_conflict: "La richiesta è già stata usata con dati diversi.",
    invalid_state: "Lo stato corrente dell’ordine non consente questa operazione.",
    out_of_order: "La posizione è precedente all’ultimo aggiornamento accettato.",
    permission_denied: "Permesso di tracking non disponibile.",
    rate_limited: "Aggiornamento coalesciato dal limite del server.",
    session_expired: "Sessione scaduta. Accedi di nuovo.",
    success: "Operazione completata.",
    validation_failed: "Controlla i dati e riprova.",
  };
  return {
    code,
    message: messages[code] ?? "Operazione non riuscita.",
    ok: payload.ok === true,
    retryAfterSeconds:
      typeof payload.retryAfterSeconds === "number"
        ? payload.retryAfterSeconds
        : undefined,
  };
}

function staffContext(context: Awaited<ReturnType<typeof resolveShopActionContext>>) {
  return context.status === "ready" &&
    context.principalKind === "pos_staff_manager"
    ? {
        actorStaffId: context.actorStaffId,
        selectedShop: context.selectedShop,
        staffWebSession: context.staffWebSession,
      }
    : null;
}

export async function configureDeliveryTrackingAction(
  input: ConfigureDeliveryInput,
): Promise<DeliveryActionResult> {
  if (!isDeliveryUuid(input.shopId) || !isDeliveryUuid(input.orderId)) {
    return { code: "validation_failed", message: "Ordine non valido.", ok: false };
  }
  const context = await resolveShopActionContext(
    input.shopId,
    "orders.delivery.manage",
  );
  if (context.status !== "ready") return context.result;

  let operation:
    | "configure_external"
    | "configure_live"
    | "configure_status";
  const request: Record<string, Json | undefined> = {
    contactCapability: input.contactCapability ?? "none",
    etaEndsAt: input.etaEndsAt,
    etaStartsAt: input.etaStartsAt,
  };
  if (input.mode === "liveCourier") {
    operation = "configure_live";
    Object.assign(request, {
      courierPublicLabel: input.courierPublicLabel?.trim(),
      destinationLatitude: input.destinationLatitude,
      destinationLongitude: input.destinationLongitude,
      storeLatitude: input.storeLatitude,
      storeLongitude: input.storeLongitude,
      vehicleKind: input.vehicleKind,
    });
  } else if (input.mode === "externalCarrier") {
    operation = "configure_external";
    const safeUrl = validatedExternalTrackingUrl(input.externalTrackingUrl ?? "");
    if (!safeUrl) {
      return {
        code: "validation_failed",
        message: "Usa un URL HTTPS pubblico senza credenziali o frammenti.",
        ok: false,
      };
    }
    Object.assign(request, {
      externalCarrier: input.externalCarrier?.trim(),
      externalTrackingCodeMasked: input.externalTrackingCodeMasked?.trim(),
      externalTrackingUrl: safeUrl,
    });
  } else {
    operation = "configure_status";
  }

  const rpc =
    context.principalKind === "personal_account"
      ? await context.supabase.rpc("admin_delivery_tracking_manage_v1", {
          p_idempotency_key: randomUUID(),
          p_operation: operation,
          p_order_id: input.orderId,
          p_request: request,
          p_shop_id: input.shopId,
        })
      : await callStaffWebDeliveryTrackingManage(staffContext(context)!, {
          idempotencyKey: randomUUID(),
          operation,
          orderId: input.orderId,
          request,
        });
  const result = resultFromRpc(rpc.data, rpc.error);
  if (result.ok && input.courierStaffId) {
    const assignRpc =
      context.principalKind === "personal_account"
        ? await context.supabase.rpc("admin_delivery_tracking_manage_v1", {
            p_idempotency_key: randomUUID(),
            p_operation: "assign",
            p_order_id: input.orderId,
            p_request: { courierStaffId: input.courierStaffId },
            p_shop_id: input.shopId,
          })
        : await callStaffWebDeliveryTrackingManage(staffContext(context)!, {
            idempotencyKey: randomUUID(),
            operation: "assign",
            orderId: input.orderId,
            request: { courierStaffId: input.courierStaffId },
          });
    const assignResult = resultFromRpc(assignRpc.data, assignRpc.error);
    if (!assignResult.ok) return assignResult;
  }
  if (result.ok) revalidatePath("/shop/courier");
  return result;
}

export async function controlCourierTrackingAction(input: {
  operation: "pause" | "start" | "stop";
  orderId: string;
  shopId: string;
}): Promise<DeliveryActionResult> {
  if (!isDeliveryUuid(input.shopId) || !isDeliveryUuid(input.orderId)) {
    return { code: "validation_failed", message: "Ordine non valido.", ok: false };
  }
  const context = await resolveShopActionContext(
    input.shopId,
    "orders.delivery.track",
  );
  const staff = staffContext(context);
  if (context.status !== "ready" || !staff) {
    return context.status === "blocked"
      ? context.result
      : { code: "permission_denied", message: "Permesso non disponibile.", ok: false };
  }
  const rpc = await callStaffWebCourierTrackingControl(staff, {
    idempotencyKey: randomUUID(),
    operation: input.operation,
    orderId: input.orderId,
  });
  const result = resultFromRpc(rpc.data, rpc.error);
  if (result.ok) revalidatePath("/shop/courier");
  return result;
}

export async function manageDeliverySessionAction(input: {
  operation: "start" | "terminate";
  orderId: string;
  shopId: string;
}): Promise<DeliveryActionResult> {
  if (!isDeliveryUuid(input.shopId) || !isDeliveryUuid(input.orderId)) {
    return { code: "validation_failed", message: "Ordine non valido.", ok: false };
  }
  const context = await resolveShopActionContext(
    input.shopId,
    "orders.delivery.manage",
  );
  if (context.status !== "ready") return context.result;

  const rpc =
    context.principalKind === "personal_account"
      ? await context.supabase.rpc("admin_delivery_tracking_manage_v1", {
          p_idempotency_key: randomUUID(),
          p_operation: input.operation,
          p_order_id: input.orderId,
          p_request: {},
          p_shop_id: input.shopId,
        })
      : await callStaffWebDeliveryTrackingManage(staffContext(context)!, {
          idempotencyKey: randomUUID(),
          operation: input.operation,
          orderId: input.orderId,
          request: {},
        });
  const result = resultFromRpc(rpc.data, rpc.error);
  if (result.ok) revalidatePath("/shop/courier");
  return result;
}

export async function publishCourierLocationAction(input: {
  bearingDegrees?: number;
  horizontalAccuracyMeters: number;
  latitude: number;
  longitude: number;
  observedAt: string;
  orderId: string;
  shopId: string;
  speedMetersPerSecond?: number;
}): Promise<DeliveryActionResult> {
  if (
    !isDeliveryUuid(input.shopId) ||
    !isDeliveryUuid(input.orderId) ||
    !isCourierLocationInput(input)
  ) {
    return { code: "validation_failed", message: "Posizione non valida.", ok: false };
  }
  const context = await resolveShopActionContext(
    input.shopId,
    "orders.delivery.track",
  );
  const staff = staffContext(context);
  if (context.status !== "ready" || !staff) {
    return context.status === "blocked"
      ? context.result
      : { code: "permission_denied", message: "Permesso non disponibile.", ok: false };
  }
  const rpc = await callStaffWebCourierLocationUpsert(staff, {
    bearingDegrees: input.bearingDegrees,
    horizontalAccuracyMeters: input.horizontalAccuracyMeters,
    idempotencyKey: randomUUID(),
    latitude: input.latitude,
    longitude: input.longitude,
    observedAt: input.observedAt,
    orderId: input.orderId,
    speedMetersPerSecond: input.speedMetersPerSecond,
  });
  return resultFromRpc(rpc.data, rpc.error);
}
