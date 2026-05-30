import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "POS / Staff | MerchandiseControl Admin Web",
  description: "Shop Admin POS and staff shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopStaffPage() {
  return <ShopSectionPage section={shopSections.staff} />;
}
