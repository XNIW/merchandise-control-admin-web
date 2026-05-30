import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Platform Overview | MerchandiseControl Admin Web",
  description:
    "Read-only platform overview for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const section = await getPlatformSectionForRequest("overview");

  return <PlatformPage section={section} />;
}
