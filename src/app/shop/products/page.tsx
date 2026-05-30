import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Products | MerchandiseControl Admin Web",
  description: "Shop Admin products shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopProductsPage() {
  return <ShopSectionPage section={shopSections.products} />;
}
