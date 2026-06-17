import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Shop Admins");
}

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
