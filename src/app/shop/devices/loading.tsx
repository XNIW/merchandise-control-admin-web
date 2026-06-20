import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopDevicesLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="devices"
      eyebrow="POS devices"
      rows={5}
      title="Devices"
    />
  );
}
