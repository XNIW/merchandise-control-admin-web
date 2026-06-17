import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Data Health");
}

export const dynamic = "force-dynamic";

export default async function PlatformDataHealthPage() {
  const section = await getPlatformSectionForRequest("data");

  return <PlatformPage section={section} />;
}
