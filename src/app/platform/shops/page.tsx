import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";
import { createLocalizedPageMetadata } from "@/i18n/metadata";

export function generateMetadata() {
  return createLocalizedPageMetadata("Shops");
}

export const dynamic = "force-dynamic";

type ShopsSearchParams = Promise<{
  selected?: string | string[];
}>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformShopsPage({
  searchParams,
}: {
  searchParams?: ShopsSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const section = await getPlatformSectionForRequest("shops");

  return <PlatformPage section={section} selectedRowKey={firstParam(params.selected)} />;
}
