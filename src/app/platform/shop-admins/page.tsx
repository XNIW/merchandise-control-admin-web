import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Shop Admins | MerchandiseControl Admin Web",
  description:
    "Personal accounts with shop-scoped Admin Console access for the Master Console.",
};

export const dynamic = "force-dynamic";

type ShopAdminsSearchParams = Promise<{
  q?: string | string[];
  selected?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformShopAdminsPage({
  searchParams,
}: {
  searchParams?: ShopAdminsSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const section = await getPlatformSectionForRequest("shopAdmins", {
    usersSearchQuery: firstParam(params.q),
  });

  return (
    <PlatformPage
      section={section}
      selectedRowKey={firstParam(params.selected)}
    />
  );
}
