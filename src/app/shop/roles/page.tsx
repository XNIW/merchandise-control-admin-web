import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Roles | MerchandiseControl Admin Web",
  description: "Shop Admin roles shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopRolesPage() {
  return <ShopSectionPage section={shopSections.roles} />;
}
