import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Platform Overview | MerchandiseControl Admin Web",
  description: "Global Platform Admin overview.",
};

export const dynamic = "force-dynamic";

export default async function PlatformOverviewAliasPage() {
  const section = await getPlatformSectionForRequest("overview");

  return <PlatformPage section={section} />;
}
