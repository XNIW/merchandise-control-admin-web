import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformUserDetailForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "User Detail | MerchandiseControl Admin Web",
  description: "Platform Admin user detail.",
};

export const dynamic = "force-dynamic";

type UserDetailParams = Promise<{
  profileId: string;
}>;

export default async function PlatformUserDetailPage({
  params,
}: {
  params: UserDetailParams;
}) {
  const { profileId } = await params;
  const section = await getPlatformUserDetailForRequest(profileId);

  return <PlatformPage section={section} />;
}
