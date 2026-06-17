import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Global History");
}

export const dynamic = "force-dynamic";

export default async function PlatformHistoryPage() {
  const section = await getPlatformSectionForRequest("history");

  return <PlatformPage section={section} />;
}
