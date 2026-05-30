import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "Platform Overview | MerchandiseControl Admin Web",
  description:
    "Static platform overview shell for MerchandiseControl Admin Web.",
};

export default function PlatformOverviewPage() {
  return <PlatformPage section={platformSections.overview} />;
}
