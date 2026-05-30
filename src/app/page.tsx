import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessState } from "@/components/auth/AccessState";
import {
  getAdminRouteDestination,
  resolveCurrentAdminRouteAccess,
} from "@/server/auth/admin-routing";

export const metadata: Metadata = {
  title: "Admin Access | MerchandiseControl Admin Web",
  description:
    "Server-side routing entrypoint for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const access = await resolveCurrentAdminRouteAccess();
  const destination = getAdminRouteDestination(access);

  if (destination) {
    redirect(destination);
  }

  if (access.status === "platform_admin" || access.status === "shop_admin") {
    redirect(access.destination);
  }

  return (
    <AccessState
      area="Admin Web"
      status={access.status}
      reason={access.reason}
      loginHref="/auth/login?next=/"
    />
  );
}
