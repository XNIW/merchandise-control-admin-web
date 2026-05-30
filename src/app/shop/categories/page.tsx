import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Categories | MerchandiseControl Admin Web",
  description: "Shop Admin categories shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopCategoriesPage() {
  return <ShopSectionPage section={shopSections.categories} />;
}
