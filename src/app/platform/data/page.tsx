import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Data Health | MerchandiseControl Admin Web",
  description: "Platform data health diagnostics.",
};

export const dynamic = "force-dynamic";

export default async function PlatformDataHealthPage() {
  const section = await getPlatformSectionForRequest("data");

  return <PlatformPage section={section} />;
}
