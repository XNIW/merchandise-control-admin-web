import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Sync Signals | MerchandiseControl Admin Web",
  description:
    "Internal diagnostic view for global sync signals and support triage.",
};

export const dynamic = "force-dynamic";

export default async function PlatformSyncPage() {
  const section = await getPlatformSectionForRequest("sync");

  return <PlatformPage section={section} />;
}
