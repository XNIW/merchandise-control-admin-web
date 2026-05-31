import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformAuditDetailForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Audit Detail | MerchandiseControl Admin Web",
  description: "Platform Admin audit detail.",
};

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
