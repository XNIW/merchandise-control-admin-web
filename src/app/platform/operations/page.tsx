import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Safe Operations | MerchandiseControl Admin Web",
  description:
    "Disabled operations placeholder for future controlled actions.",
};

export const dynamic = "force-dynamic";

export default async function PlatformOperationsPage() {
  const section = await getPlatformSectionForRequest("operations");

  return <PlatformPage section={section} />;
}
