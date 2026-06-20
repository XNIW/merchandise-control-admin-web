import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopRolesLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="roles"
      eyebrow="Access policy"
      rows={3}
      title="Roles"
    />
  );
}
