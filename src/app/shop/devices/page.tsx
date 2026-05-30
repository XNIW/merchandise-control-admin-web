import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Devices | MerchandiseControl Admin Web",
  description: "Shop Admin devices shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopDevicesPage() {
  return <ShopSectionPage section={shopSections.devices} />;
}
