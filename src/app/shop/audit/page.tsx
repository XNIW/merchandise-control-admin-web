import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Shop Audit | MerchandiseControl Admin Web",
  description: "Shop Admin audit shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopAuditPage() {
  return <ShopSectionPage section={shopSections.audit} />;
}
