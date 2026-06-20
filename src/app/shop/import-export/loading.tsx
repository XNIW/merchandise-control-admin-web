import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopImportExportLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="import-export"
      eyebrow="Catalog transfer"
      rows={3}
      title="Import / Export"
    />
  );
}
