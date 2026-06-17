import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Sync Signals");
}

export const dynamic = "force-dynamic";

export default async function PlatformSyncPage() {
  const section = await getPlatformSectionForRequest("sync");

  return <PlatformPage section={section} />;
}
