import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopStaffLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="staff"
      eyebrow="POS / Staff"
      rows={5}
      title="POS / Staff"
    />
  );
}
