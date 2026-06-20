import { ShopRouteLoading } from "@/app/shop/_components/ShopRouteLoading";

export default function ShopCategoriesLoading() {
  return (
    <ShopRouteLoading
      dataAttribute="categories"
      eyebrow="Catalog taxonomy"
      title="Categories"
    />
  );
}
