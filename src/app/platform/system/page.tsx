import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("System Status");
}

export const dynamic = "force-dynamic";

export default async function PlatformSystemPage() {
  const section = await getPlatformSectionForRequest("system");

  return <PlatformPage section={section} />;
}
