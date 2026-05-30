import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Shop Admin | MerchandiseControl Admin Web",
  description:
    "Protected Shop Admin entrypoint for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopAdminPage() {
  return <ShopSectionPage section={shopSections.overview} />;
}
