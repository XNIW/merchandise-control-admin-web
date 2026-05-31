import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Global History | MerchandiseControl Admin Web",
  description: "Global history overview.",
};

export const dynamic = "force-dynamic";

export default async function PlatformHistoryPage() {
  const section = await getPlatformSectionForRequest("history");

  return <PlatformPage section={section} />;
}
