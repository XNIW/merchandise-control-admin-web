import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Audit");
}

export const dynamic = "force-dynamic";

export default async function PlatformAuditPage() {
  const section = await getPlatformSectionForRequest("audit");

  return <PlatformPage section={section} />;
}
