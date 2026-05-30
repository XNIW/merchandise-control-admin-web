import type { Metadata } from "next";
import { ShopSectionPage } from "@/components/shop/ShopSectionPage";
import { shopSections } from "@/components/shop/shopSections";

export const metadata: Metadata = {
  title: "Members | MerchandiseControl Admin Web",
  description: "Shop Admin members shell for MerchandiseControl Admin Web.",
};

export const dynamic = "force-dynamic";

export default function ShopMembersPage() {
  return <ShopSectionPage section={shopSections.members} />;
}
