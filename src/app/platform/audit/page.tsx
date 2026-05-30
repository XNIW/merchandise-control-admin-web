import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Audit | MerchandiseControl Admin Web",
  description:
    "Read-only audit visibility for platform traceability.",
};

export const dynamic = "force-dynamic";

export default async function PlatformAuditPage() {
  const section = await getPlatformSectionForRequest("audit");

  return <PlatformPage section={section} />;
}
