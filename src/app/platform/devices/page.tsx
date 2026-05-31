import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Global Devices | MerchandiseControl Admin Web",
  description: "Global device authorization overview.",
};

export const dynamic = "force-dynamic";

export default async function PlatformDevicesPage() {
  const section = await getPlatformSectionForRequest("devices");

  return <PlatformPage section={section} />;
}
