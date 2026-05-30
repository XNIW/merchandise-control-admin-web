import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Suppliers | MerchandiseControl Admin Web",
  description: "Shop Admin suppliers shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopSuppliersPage() {
  return <ShopSectionPage section={shopSections.suppliers} />;
}
