import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Users / Profiles | MerchandiseControl Admin Web",
  description:
    "Read-only users and profiles for the Platform Admin Console.",
};

export const dynamic = "force-dynamic";

export default async function PlatformUsersPage() {
  const section = await getPlatformSectionForRequest("users");

  return <PlatformPage section={section} />;
}
