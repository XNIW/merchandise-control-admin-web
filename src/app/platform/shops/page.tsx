import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "Shops | MerchandiseControl Admin Web",
  description:
    "Static shops placeholder using shops as the root business model.",
};

export default function PlatformShopsPage() {
  return <PlatformPage section={platformSections.shops} />;
}
