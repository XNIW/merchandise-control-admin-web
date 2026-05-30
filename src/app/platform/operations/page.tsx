import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "Safe Operations | MerchandiseControl Admin Web",
  description:
    "Disabled static operations placeholder for future controlled actions.",
};

export default function PlatformOperationsPage() {
  return <PlatformPage section={platformSections.operations} />;
}
