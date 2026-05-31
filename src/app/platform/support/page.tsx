import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Support Diagnostics | MerchandiseControl Admin Web",
  description: "Read-only Platform Admin support diagnostics.",
};

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage() {
  const section = await getPlatformSectionForRequest("support");

  return <PlatformPage section={section} />;
}
