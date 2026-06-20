import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-zinc-200 ${className}`}
    />
  );
}

export default function ShopLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Shop workspace loading"
      className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-5`}
      data-shop-loading
    >
      <section className="grid gap-3">
        <SkeletonBlock className="h-3 w-28 bg-emerald-100" />
        <SkeletonBlock className="h-8 w-64 max-w-full bg-zinc-300" />
        <SkeletonBlock className="h-4 w-full max-w-2xl" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="min-h-24 rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
            key={index}
          >
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-4 h-7 w-20 bg-zinc-300" />
            <SkeletonBlock className="mt-3 h-3 w-32" />
          </div>
        ))}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
        <SkeletonBlock className="h-5 w-52 bg-zinc-300" />
        <div className="mt-5 grid gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonBlock className="h-12 w-full" key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
