import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Personal Accounts | MerchandiseControl Admin Web",
  description: "Read-only non-admin personal accounts for the Master Console.",
};

export const dynamic = "force-dynamic";

type UsersSearchParams = Promise<{
  q?: string | string[];
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
  const section = await getPlatformSectionForRequest("users", {
    usersSearchQuery: firstParam(params.q),
  });

  return <PlatformPage section={section} selectedRowKey={firstParam(params.selected)} />;
}
