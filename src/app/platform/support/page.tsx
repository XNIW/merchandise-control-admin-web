import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Support Diagnostics");
}

export const dynamic = "force-dynamic";

export default async function PlatformSupportPage() {
  const section = await getPlatformSectionForRequest("support");

  return <PlatformPage section={section} />;
}
