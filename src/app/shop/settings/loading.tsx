import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopSettingsLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="settings"
      eyebrow="Settings"
      rows={3}
      title="Settings"
    />
  );
}
