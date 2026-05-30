import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "Audit | MerchandiseControl Admin Web",
  description:
    "Static audit placeholder for future platform traceability.",
};

export default function PlatformAuditPage() {
  return <PlatformPage section={platformSections.audit} />;
}
