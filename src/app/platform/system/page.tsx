import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "System Status | MerchandiseControl Admin Web",
  description:
    "Read-only system status for the Platform Admin Console.",
};

export const dynamic = "force-dynamic";

export default async function PlatformSystemPage() {
  const section = await getPlatformSectionForRequest("system");

  return <PlatformPage section={section} />;
}
