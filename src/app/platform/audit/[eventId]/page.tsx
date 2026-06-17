import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformAuditDetailForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Audit Detail");
}

export const dynamic = "force-dynamic";

type AuditDetailParams = Promise<{
  eventId: string;
}>;

export default async function PlatformAuditDetailPage({
  params,
}: {
  params: AuditDetailParams;
}) {
  const { eventId } = await params;
  const section = await getPlatformAuditDetailForRequest(eventId);

  return <PlatformPage section={section} />;
}
