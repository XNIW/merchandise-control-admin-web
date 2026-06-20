import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

function ProductsSkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-zinc-200 ${className}`}
    />
  );
}

export default function ShopProductsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Products loading"
      className="grid gap-5"
      data-products-loading
    >
      <section
        className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm`}
        data-products-loading-filters
      >
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <ProductsSkeletonBlock className="h-5 w-36 bg-zinc-300" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <ProductsSkeletonBlock
                className="h-10 w-32 bg-zinc-100"
                key={index}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(16rem,1.35fr)_minmax(0,190px)_minmax(0,190px)_minmax(0,150px)_minmax(0,130px)_auto] md:items-end">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="grid gap-1" key={index}>
              <ProductsSkeletonBlock className="h-3 w-20" />
              <ProductsSkeletonBlock className="h-10 w-full bg-zinc-100" />
            </div>
          ))}
          <ProductsSkeletonBlock className="h-10 w-28 bg-zinc-300" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="min-h-24 rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
            key={index}
          >
            <ProductsSkeletonBlock className="h-3 w-24" />
            <ProductsSkeletonBlock className="mt-4 h-7 w-20 bg-zinc-300" />
            <ProductsSkeletonBlock className="mt-3 h-3 w-32" />
          </div>
        ))}
      </section>

      <section className="grid gap-3" data-products-loading-rows>
        {Array.from({ length: 4 }, (_, index) => (
          <article
            className="grid min-w-0 gap-4 rounded-md border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(15rem,1.5fr)_minmax(12rem,1fr)_minmax(10rem,0.9fr)_minmax(10rem,0.9fr)_minmax(10rem,0.85fr)_minmax(9rem,auto)]"
            key={index}
          >
            {Array.from({ length: 6 }, (_, cellIndex) => (
              <div className="grid min-w-0 gap-2" key={cellIndex}>
                <ProductsSkeletonBlock className="h-3 w-20" />
                <ProductsSkeletonBlock className="h-5 w-full bg-zinc-100" />
                <ProductsSkeletonBlock className="h-4 w-3/4 bg-zinc-100" />
              </div>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}
