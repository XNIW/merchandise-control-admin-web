import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "System Status | MerchandiseControl Admin Web",
  description:
    "Static system status placeholder for the Platform Admin Console.",
};

export default function PlatformSystemPage() {
  return <PlatformPage section={platformSections.system} />;
}
