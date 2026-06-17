import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Platform Overview");
}

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const section = await getPlatformSectionForRequest("overview");

  return <PlatformPage section={section} />;
}
