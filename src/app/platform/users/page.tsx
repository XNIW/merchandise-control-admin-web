import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Users / Profiles | MerchandiseControl Admin Web",
  description: "Read-only users and profiles for the Master Console.",
};

export const dynamic = "force-dynamic";

type UsersSearchParams = Promise<{
  selected?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams?: UsersSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const section = await getPlatformSectionForRequest("users");

  return <PlatformPage section={section} selectedRowKey={firstParam(params.selected)} />;
}
