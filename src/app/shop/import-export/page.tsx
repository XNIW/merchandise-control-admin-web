import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Import / Export | MerchandiseControl Admin Web",
  description:
    "Shop Admin import and export shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopImportExportPage() {
  return <ShopSectionPage section={shopSections.importExport} />;
}
