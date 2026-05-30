import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Shops | MerchandiseControl Admin Web",
  description:
    "Read-only shops using shops as the root business model.",
};

export const dynamic = "force-dynamic";

export default async function PlatformShopsPage() {
  const section = await getPlatformSectionForRequest("shops");

  return <PlatformPage section={section} />;
}
