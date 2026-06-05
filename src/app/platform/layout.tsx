import type { ReactNode } from "react";
import { AccessState } from "@/components/auth/AccessState";
import { resolveCurrentAdminRouteAccess } from "@/server/auth/admin-routing";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await resolveCurrentAdminRouteAccess();

  if (access.status !== "platform_admin") {
    const blockedStatus = access.status === "shop_admin" ? "no_shop" : access.status;
    const reason =
      access.status === "shop_admin"
        ? "This account is authorized for Admin Console, not Master Console."
        : access.reason;

    return (
      <AccessState
        area="Master Console"
        status={blockedStatus}
        reason={reason}
        loginHref="/auth/login?next=/platform"
      />
    );
  }

  return children;
}
