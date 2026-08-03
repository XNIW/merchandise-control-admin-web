import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-lg bg-zinc-200 ${className}`} />;
}

export default function ShopOrdersLoading() {
  return (
    <div aria-busy="true" className="grid gap-5" data-admin-orders-loading>
      <header className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3`}>
        <Block className="h-4 w-36" />
        <Block className="h-9 w-64" />
        <Block className="h-5 w-full max-w-2xl" />
      </header>
      <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3 sm:grid-cols-2 xl:grid-cols-4`}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className="rounded-xl border border-zinc-200 bg-white p-4" key={index}>
            <Block className="h-4 w-24" />
            <Block className="mt-3 h-8 w-16" />
          </div>
        ))}
      </section>
      <section className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(0,1.25fr)]`}>
        <div className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="bg-white p-4" key={index}>
              <Block className="h-5 w-44" />
              <Block className="mt-3 h-4 w-full" />
              <Block className="mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <Block className="h-7 w-56" />
          <Block className="mt-5 h-28 w-full" />
          <Block className="mt-4 h-44 w-full" />
        </div>
      </section>
    </div>
  );
}
