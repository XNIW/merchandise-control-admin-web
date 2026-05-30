import type { Metadata } from "next";
import { PlatformPage } from "@/components/platform/PlatformPage";
import { platformSections } from "@/components/platform/platformData";

export const metadata: Metadata = {
  title: "Users / Profiles | MerchandiseControl Admin Web",
  description:
    "Static users and profiles placeholder for the Platform Admin Console.",
};

export default function PlatformUsersPage() {
  return <PlatformPage section={platformSections.users} />;
}
