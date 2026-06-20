import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopHistoryLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="history"
      eyebrow="Mobile history"
      rows={5}
      title="Android / iOS History Entries"
    />
  );
}
