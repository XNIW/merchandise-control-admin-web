import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Settings | MerchandiseControl Admin Web",
  description: "Shop Admin settings shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopSettingsPage() {
  return <ShopSectionPage section={shopSections.settings} />;
}
