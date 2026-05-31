import "server-only";

import {
  mapShopAdminRpcResult,
  resolveShopActionContext,
  shopAdminActionResult,
  type ShopAdminActionResult,
} from "./action-context";

export type ShopMemberRole = "shop_owner" | "shop_manager" | "viewer";

type InviteMemberInput = {
  profileId: string;
  requestedShopId?: string;
  roleKey: string;
};

type UpdateMemberRoleInput = {
  memberId: string;
  requestedShopId?: string;
  roleKey: string;
};

type RemoveMemberInput = {
  memberId: string;
  reason?: string;
  requestedShopId?: string;
};

function normalizeRole(value: string): ShopMemberRole | null {
  return value === "shop_owner" ||
    value === "shop_manager" ||
    value === "viewer"
    ? value
    : null;
}

async function memberRpcResult(
  requestedShopId: string | undefined,
  call: (
    context: Extract<
      Awaited<ReturnType<typeof resolveShopActionContext>>,
      { status: "ready" }
    >,
  ) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<ShopAdminActionResult> {
  const context = await resolveShopActionContext(
    requestedShopId,
    "members.manage",
  );

  if (context.status !== "ready") {
    return context.result;
  }

  const { data, error } = await call(context);

  if (error) {
    return shopAdminActionResult("db_failure", {
      ok: false,
      shopId: context.selectedShop.shopId,
    });
  }

  return mapShopAdminRpcResult(data);
}

export async function inviteShopMember(
  input: InviteMemberInput,
): Promise<ShopAdminActionResult> {
  const profileId = input.profileId.trim();
  const roleKey = normalizeRole(input.roleKey.trim());

  if (!profileId || !roleKey) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        member: "Profile id and member role are required.",
      },
      ok: false,
    });
  }

  return memberRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_member_invite_profile", {
      p_profile_id: profileId,
      p_role_key: roleKey,
      p_shop_id: context.selectedShop.shopId,
    }),
  );
}

export async function updateShopMemberRole(
  input: UpdateMemberRoleInput,
): Promise<ShopAdminActionResult> {
  const memberId = input.memberId.trim();
  const roleKey = normalizeRole(input.roleKey.trim());

  if (!memberId || !roleKey) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        member: "Member id and member role are required.",
      },
      ok: false,
    });
  }

  return memberRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_member_update_role", {
      p_role_key: roleKey,
      p_shop_id: context.selectedShop.shopId,
      p_shop_member_id: memberId,
    }),
  );
}

export async function removeShopMember(
  input: RemoveMemberInput,
): Promise<ShopAdminActionResult> {
  const memberId = input.memberId.trim();
  const reason = input.reason?.trim();

  if (!memberId || !reason) {
    return shopAdminActionResult("validation_failed", {
      fieldErrors: {
        member: "Member id is required.",
        reason: "Reason is required.",
      },
      ok: false,
    });
  }

  return memberRpcResult(input.requestedShopId, (context) =>
    context.supabase.rpc("shop_member_remove", {
      p_reason: reason,
      p_shop_id: context.selectedShop.shopId,
      p_shop_member_id: memberId,
    }),
  );
}
