import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Shop Overview | MerchandiseControl Admin Web",
  description: "Shop Admin overview shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopOverviewPage() {
  return <ShopSectionPage section={shopSections.overview} />;
}
