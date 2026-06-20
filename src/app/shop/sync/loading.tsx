import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopSyncLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="sync"
      eyebrow="Data"
      rows={5}
      title="Sync Center"
    />
  );
}
