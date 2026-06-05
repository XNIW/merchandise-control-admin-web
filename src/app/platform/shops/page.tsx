import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { getPlatformSectionForRequest } from "@/server/platform-admin/platform-section-data";

export const metadata: Metadata = {
  title: "Shops | MerchandiseControl Admin Web",
  description:
    "Read-only shops using shops as the root business model.",
};

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
