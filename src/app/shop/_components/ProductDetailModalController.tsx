"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  archiveProductInlineAction,
  restoreProductInlineAction,
  updateProductInlineAction,
  type ShopAdminActionState,
} from "@/app/shop/actions";
import type {
  CatalogCategoryOption,
  CatalogSupplierOption,
} from "@/app/shop/_components/CatalogActionPanel";

type ProductDetailModalProduct = {
  productId: string;
  barcode: string;
  itemNumber: string | null;
  productName: string | null;
  secondProductName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  stockQuantity: number | null;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  state: "active" | "archived";
  updatedAt: string;
  deletedAt: string | null;
};

type ProductDetailModalReadModel = {
  status: string;
  reason: string;
  product: ProductDetailModalProduct | null;
  prices: Array<{
    priceId: string;
    productId: string;
    type: string;
    price: number;
    effectiveAt: string;
    note: string | null;
    source: string | null;
    createdAt: string;
  }>;
  historyEntries: Array<{
    entryId: string;
    kind: "history_entry" | "sync_event";
    title: string;
    source: string;
    payload: string;
    updatedAt: string;
  }>;
  diagnostics: {
    catalogScope: string;
    mappingState: string;
    priceRows: number;
    historyRows: number;
    lastSyncAt: string | null;
    selectedShopName: string | null;
  };
};

type ProductDetailModalControllerProps = {
  canManageProducts: boolean;
  categories?: CatalogCategoryOption[];
  labels?: Record<string, string>;
  requestedShopId?: string | null;
  selectedShopId?: string | null;
  suppliers?: CatalogSupplierOption[];
};

type ProductTab =
  | "overview"
  | "prices"
  | "inventory"
  | "history"
  | "advanced";

type ProductMode = "edit" | "view";

const initialActionState: ShopAdminActionState = {
  code: "success",
  message: "",
  ok: true,
};

const tabs: Array<{ key: ProductTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "prices", label: "Prices" },
  { key: "inventory", label: "Inventory / Sync" },
  { key: "history", label: "History entries" },
  { key: "advanced", label: "Advanced" },
];

type TranslateFn = (value: string) => string;

const identityTranslate: TranslateFn = (value) => value;

function fieldValue(
  value: string | number | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  return value === null || value === undefined || value === ""
    ? translate("Not set")
    : String(value);
}

function formatDate(
  value: string | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  if (!value) {
    return translate("Not set");
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatNumber(
  value: number | null | undefined,
  translate: TranslateFn = identityTranslate,
) {
  return value === null || value === undefined
    ? translate("Not set")
    : new Intl.NumberFormat("en-US").format(value);
}

function translateToken(value: string | null | undefined, translate: TranslateFn) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized) {
    return translate("Unknown");
  }

  const labels: Record<string, string> = {
    legacy_owner_bridge: "Legacy mobile bridge",
    mapped: "Mapped",
    not_mapped: "Not mapped",
    shop_scoped: "Shop scoped",
    unknown: "Unknown",
  };

  return translate(labels[normalized] ?? value ?? "Unknown");
}

function ActionMessage({ state }: { state: ShopAdminActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={[
        "rounded-md border px-3 py-2 text-sm",
        state.ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-950",
      ].join(" ")}
      role="status"
    >
      {state.message}
    </p>
  );
}

function DialogShell({
  children,
  title,
  titleId,
}: {
  children: React.ReactNode;
  title: string;
  titleId: string;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-zinc-950/35 p-0 sm:p-6">
      <div className="flex min-h-full min-w-0 items-center justify-center">
        <section
          aria-label={title}
          aria-labelledby={titleId}
          aria-modal="true"
          className="flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden rounded-none bg-white shadow-xl sm:h-auto sm:max-h-[calc(100dvh-48px)] sm:w-[min(1120px,calc(100vw-48px))] sm:rounded-md xl:w-[min(1200px,calc(100vw-72px))]"
          role="dialog"
        >
          {children}
        </section>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="grid gap-4 p-5" data-product-detail-loading>
      <div className="h-7 w-2/5 rounded-md bg-zinc-200" />
      <div className="grid gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div className="h-20 rounded-md bg-zinc-100" key={item} />
        ))}
      </div>
      <div className="h-80 rounded-md bg-zinc-100" />
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold text-zinc-950 [overflow-wrap:anywhere]">
        {value}
      </p>
    </article>
  );
}

function DetailGrid({
  rows,
}: {
  rows: Array<{ label: string; mono?: boolean; value: string }>;
}) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div
          className="min-w-0 rounded-md border border-zinc-200 bg-white p-3"
          key={row.label}
        >
          <dt className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {row.label}
          </dt>
          <dd
            className={[
              "mt-1 text-sm text-zinc-900",
              row.mono
                ? "overflow-x-auto whitespace-nowrap font-mono text-xs"
                : "break-words [overflow-wrap:anywhere]",
            ].join(" ")}
            title={row.value}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({
  rows,
  title,
}: {
  rows: Array<{ label: string; mono?: boolean; value: string }>;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      <DetailGrid rows={rows} />
    </section>
  );
}

function ProductEditForm({
  action,
  categories,
  formId,
  labels,
  pending,
  product,
  selectedShopId,
  suppliers,
}: {
  action: (formData: FormData) => void;
  categories: CatalogCategoryOption[];
  formId: string;
  labels?: Record<string, string>;
  pending: boolean;
  product: ProductDetailModalProduct;
  selectedShopId?: string | null;
  suppliers: CatalogSupplierOption[];
}) {
  const translate = (value: string) => labels?.[value] ?? value;

  return (
    <form action={action} aria-busy={pending} className="grid gap-4" id={formId}>
      {selectedShopId ? <input name="shop_id" type="hidden" value={selectedShopId} /> : null}
      <input name="productId" type="hidden" value={product.productId} />
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-zinc-950">{translate("Identity")}</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Barcode")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.barcode}
              name="barcode"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Item code")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.itemNumber ?? ""}
              name="itemNumber"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800 md:col-span-2 xl:col-span-1">
            {translate("Product name")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.productName ?? ""}
              name="productName"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Second name")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.secondProductName ?? ""}
              name="secondProductName"
            />
          </label>
        </div>
      </section>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-zinc-950">{translate("Classification")}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Supplier")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.supplierName ?? ""}
              list="product-detail-suppliers"
              name="supplierName"
            />
            <datalist id="product-detail-suppliers">
              {suppliers.map((supplier) => (
                <option key={supplier.supplierId} value={supplier.name} />
              ))}
            </datalist>
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Category")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.categoryName ?? ""}
              list="product-detail-categories"
              name="categoryName"
            />
            <datalist id="product-detail-categories">
              {categories.map((category) => (
                <option key={category.categoryId} value={category.name} />
              ))}
            </datalist>
          </label>
        </div>
      </section>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-zinc-950">{translate("Pricing / stock")}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Stock quantity")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.stockQuantity ?? ""}
              name="stockQuantity"
              step="1"
              type="number"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Purchase price")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.purchasePrice ?? ""}
              name="purchasePrice"
              step="0.01"
              type="number"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Retail price")}
            <input
              className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
              defaultValue={product.retailPrice ?? ""}
              name="retailPrice"
              step="0.01"
              type="number"
            />
          </label>
        </div>
      </section>
    </form>
  );
}

function ProductArchiveForm({
  action,
  actionLabel,
  confirmation,
  labels,
  pending,
  product,
  selectedShopId,
  tone,
}: {
  action: (formData: FormData) => void;
  actionLabel: string;
  confirmation: "ARCHIVE" | "RESTORE";
  labels?: Record<string, string>;
  pending: boolean;
  product: ProductDetailModalProduct;
  selectedShopId?: string | null;
  tone: "archive" | "restore";
}) {
  const translate = (value: string) => labels?.[value] ?? value;

  return (
    <form
      action={action}
      className={[
        "grid gap-3 rounded-md border p-3",
        tone === "archive"
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50",
      ].join(" ")}
    >
      {selectedShopId ? <input name="shop_id" type="hidden" value={selectedShopId} /> : null}
      <input name="productId" type="hidden" value={product.productId} />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.5fr)_auto] md:items-end">
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          {translate("Reason")}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
            maxLength={240}
            name="reason"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-800">
          {translate("Type")} {confirmation}
          <input
            className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
            name="confirmation"
            required
          />
        </label>
        <button
          className={[
            "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-60",
            tone === "archive"
              ? "bg-amber-900 text-white"
              : "bg-emerald-900 text-white",
          ].join(" ")}
          disabled={pending}
          type="submit"
        >
          {pending ? translate("Saving") : actionLabel}
        </button>
      </div>
    </form>
  );
}

export function ProductDetailModalController({
  canManageProducts,
  categories = [],
  labels,
  requestedShopId,
  selectedShopId,
  suppliers = [],
}: ProductDetailModalControllerProps) {
  const router = useRouter();
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ProductMode>("view");
  const [tab, setTab] = useState<ProductTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readModel, setReadModel] = useState<ProductDetailModalReadModel | null>(null);
  const translate = useCallback((value: string) => labels?.[value] ?? value, [labels]);
  const titleId = "product-detail-modal-title";
  const editFormId = "product-detail-edit-form";
  const loadProduct = useCallback(
    async (productId: string) => {
      const params = new URLSearchParams({ product_id: productId });

      if (requestedShopId) {
        params.set("shop_id", requestedShopId);
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/shop/products/detail?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const body = (await response.json()) as ProductDetailModalReadModel;

        if (!response.ok || body.status !== "ready") {
          setReadModel(body);
          setError(body.reason || "Product detail is not available.");
          return;
        }

        setReadModel(body);
      } catch {
        setError("Product detail could not be loaded.");
      } finally {
        setLoading(false);
      }
    },
    [requestedShopId],
  );
  const closeModal = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);
  const refreshProductAfterAction = useCallback(
    (state: ShopAdminActionState) => {
      if (state.ok && state.targetId) {
        setMode("view");
        void loadProduct(state.targetId);
        router.refresh();
      }

      return state;
    },
    [loadProduct, router],
  );
  const [updateState, updateAction, updatePending] = useActionState(
    async (previousState: ShopAdminActionState, formData: FormData) =>
      refreshProductAfterAction(
        await updateProductInlineAction(previousState, formData),
      ),
    initialActionState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    async (previousState: ShopAdminActionState, formData: FormData) =>
      refreshProductAfterAction(
        await archiveProductInlineAction(previousState, formData),
      ),
    initialActionState,
  );
  const [restoreState, restoreAction, restorePending] = useActionState(
    async (previousState: ShopAdminActionState, formData: FormData) =>
      refreshProductAfterAction(
        await restoreProductInlineAction(previousState, formData),
      ),
    initialActionState,
  );
  const product = readModel?.product ?? null;
  const effectiveShopId = selectedShopId ?? requestedShopId ?? undefined;

  const openProduct = useCallback(
    (productId: string, initialMode: ProductMode = "view") => {
      setOpen(true);
      setMode(initialMode);
      setTab("overview");
      setReadModel(null);
      void loadProduct(productId);
    },
    [loadProduct],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const trigger = target.closest("[data-product-detail-trigger]");

      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      const productId = trigger.dataset.productDetailId;

      if (!productId) {
        return;
      }

      event.preventDefault();
      lastTriggerRef.current = trigger;
      openProduct(
        productId,
        trigger.dataset.productDetailMode === "edit" && canManageProducts
          ? "edit"
          : "view",
      );
    };

    document.addEventListener("click", onClick);

    return () => document.removeEventListener("click", onClick);
  }, [canManageProducts, openProduct]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeModal, open]);

  const summaryCards = useMemo(() => {
    if (!product) {
      return [];
    }

    return [
      { label: translate("Stock"), value: formatNumber(product.stockQuantity, translate) },
      { label: translate("Purchase price"), value: formatNumber(product.purchasePrice, translate) },
      { label: translate("Retail price"), value: formatNumber(product.retailPrice, translate) },
      {
        label: translate("Last sync / update"),
        value: formatDate(readModel?.diagnostics.lastSyncAt ?? product.updatedAt, translate),
      },
    ];
  }, [product, readModel, translate]);
  const hasActionMessage =
    Boolean(updateState.message) ||
    Boolean(archiveState.message) ||
    Boolean(restoreState.message);

  if (!open) {
    return null;
  }

  return (
    <DialogShell title={translate("Product detail")} titleId={titleId}>
      {loading && !readModel ? (
        <ProductSkeleton />
      ) : (
        <>
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
            <div className="flex min-w-0 flex-col gap-3 px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h2
                  className="line-clamp-2 break-words text-xl font-semibold leading-7 text-zinc-950 [overflow-wrap:anywhere]"
                  id={titleId}
                  title={product?.productName ?? translate("Product detail")}
                >
                  {product?.productName ?? translate("Product detail")}
                </h2>
                <p className="mt-1 break-words text-sm text-zinc-600 [overflow-wrap:anywhere]">
                  {translate("Barcode")}{" "}
                  <span className="font-mono text-xs">{fieldValue(product?.barcode, translate)}</span>
                  {" / "}
                  {translate("Item code")}{" "}
                  <span className="font-mono text-xs">{fieldValue(product?.itemNumber, translate)}</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={[
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      product?.state === "archived"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-emerald-200 bg-emerald-50 text-emerald-800",
                    ].join(" ")}
                  >
                    {product?.state === "archived" ? translate("Archived") : translate("Active")}
                  </span>
                  {readModel && readModel.status !== "ready" ? (
                    <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      {translate("Sync issue")}
                    </span>
                  ) : null}
                  {readModel?.diagnostics.historyRows ? (
                    <span className="inline-flex rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                      {translate("Mobile history")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {canManageProducts && product ? (
                  mode === "edit" ? (
                    <>
                      <button
                        className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-zinc-400"
                        onClick={() => setMode("view")}
                        type="button"
                      >
                        {translate("Cancel")}
                      </button>
                      <button
                        className="inline-flex h-9 items-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white disabled:opacity-60"
                        disabled={updatePending}
                        form={editFormId}
                        type="submit"
                      >
                        {updatePending ? translate("Saving") : translate("Save")}
                      </button>
                    </>
                  ) : (
                    <button
                      className="inline-flex h-9 items-center rounded-md bg-emerald-900 px-3 text-sm font-medium text-white hover:bg-emerald-800"
                      onClick={() => setMode("edit")}
                      type="button"
                    >
                      {translate("Edit")}
                    </button>
                  )
                ) : null}
                <button
                  className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                  onClick={closeModal}
                  type="button"
                >
                  {translate("Close")}
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {error ? (
              <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {error}
              </p>
            ) : null}
            {hasActionMessage ? (
              <div className="mb-4 grid gap-2">
                <ActionMessage state={updateState} />
                <ActionMessage state={archiveState} />
                <ActionMessage state={restoreState} />
              </div>
            ) : null}
            {product ? (
              <div className="grid gap-5">
                <section className="grid gap-3 md:grid-cols-4">
                  {summaryCards.map((card) => (
                    <SummaryCard key={card.label} label={card.label} value={card.value} />
                  ))}
                </section>

                {mode === "edit" ? (
                  <section className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                    <ProductEditForm
                      action={updateAction}
                      categories={categories}
                      formId={editFormId}
                      labels={labels}
                      pending={updatePending}
                      product={product}
                      selectedShopId={effectiveShopId}
                      suppliers={suppliers}
                    />
                  </section>
                ) : null}

                {mode === "view" ? (
                  <nav
                    aria-label={translate("Product detail tabs")}
                    className="flex min-w-0 gap-2 overflow-x-auto border-b border-zinc-200"
                    role="tablist"
                  >
                  {tabs.map((item) => (
                    <button
                      aria-controls={`product-detail-panel-${item.key}`}
                      aria-selected={tab === item.key}
                      className={[
                        "h-10 shrink-0 border-b-2 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
                        tab === item.key
                          ? "border-emerald-700 text-emerald-800"
                          : "border-transparent text-zinc-600 hover:text-zinc-950",
                      ].join(" ")}
                      id={`product-detail-tab-${item.key}`}
                      key={item.key}
                      onClick={() => setTab(item.key)}
                      role="tab"
                      type="button"
                    >
                      {translate(item.label)}
                    </button>
                  ))}
                  </nav>
                ) : null}

                {mode === "view" && tab === "overview" ? (
                  <section
                    aria-labelledby="product-detail-tab-overview"
                    className="grid gap-4"
                    id="product-detail-panel-overview"
                    role="tabpanel"
                  >
                    <DetailSection
                      title={translate("Identity")}
                      rows={[
                        { label: translate("Product id"), mono: true, value: product.productId },
                        { label: translate("Barcode"), mono: true, value: product.barcode },
                        { label: translate("Item code"), mono: true, value: fieldValue(product.itemNumber, translate) },
                        { label: translate("Product name"), value: fieldValue(product.productName, translate) },
                        { label: translate("Second name"), value: fieldValue(product.secondProductName, translate) },
                      ]}
                    />
                    <DetailSection
                      title={translate("Classification")}
                      rows={[
                        { label: translate("Supplier"), value: fieldValue(product.supplierName, translate) },
                        { label: translate("Category"), value: fieldValue(product.categoryName, translate) },
                        {
                          label: translate("Status"),
                          value: product.state === "archived" ? translate("Archived") : translate("Active"),
                        },
                      ]}
                    />
                    <DetailSection
                      title={translate("Pricing / stock")}
                      rows={[
                        { label: translate("Stock quantity"), value: formatNumber(product.stockQuantity, translate) },
                        { label: translate("Purchase price"), value: formatNumber(product.purchasePrice, translate) },
                        { label: translate("Retail price"), value: formatNumber(product.retailPrice, translate) },
                      ]}
                    />
                    <DetailSection
                      title={translate("Sync state")}
                      rows={[
                        { label: translate("Updated"), value: formatDate(product.updatedAt, translate) },
                        { label: translate("Archived"), value: formatDate(product.deletedAt, translate) },
                        {
                          label: translate("Last sync"),
                          value: formatDate(readModel?.diagnostics.lastSyncAt, translate),
                        },
                      ]}
                    />
                  </section>
                ) : null}

                {mode === "view" && tab === "prices" ? (
                  <section
                    aria-labelledby="product-detail-tab-prices"
                    className="grid gap-4"
                    id="product-detail-panel-prices"
                    role="tabpanel"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryCard
                        label={translate("Current purchase price")}
                        value={formatNumber(product.purchasePrice, translate)}
                      />
                      <SummaryCard
                        label={translate("Current retail price")}
                        value={formatNumber(product.retailPrice, translate)}
                      />
                    </div>
                    <div className="overflow-x-auto rounded-md border border-zinc-200">
                      <table className="w-full min-w-[56rem] text-left text-sm">
                        <thead className="bg-zinc-50 text-xs uppercase tracking-normal text-zinc-500">
                          <tr>
                            <th className="px-3 py-2">{translate("Type")}</th>
                            <th className="px-3 py-2">{translate("Price")}</th>
                            <th className="px-3 py-2">{translate("Effective")}</th>
                            <th className="px-3 py-2">{translate("Source")}</th>
                            <th className="px-3 py-2">{translate("Note")}</th>
                            <th className="px-3 py-2">{translate("Created")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readModel?.prices.length ? (
                            readModel.prices.map((price) => (
                              <tr className="border-t border-zinc-100" key={price.priceId}>
                                <td className="px-3 py-2">{translateToken(price.type, translate)}</td>
                                <td className="px-3 py-2">{formatNumber(price.price, translate)}</td>
                                <td className="px-3 py-2">{formatDate(price.effectiveAt, translate)}</td>
                                <td className="px-3 py-2">{fieldValue(price.source, translate)}</td>
                                <td className="px-3 py-2">{fieldValue(price.note, translate)}</td>
                                <td className="px-3 py-2">{formatDate(price.createdAt, translate)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="px-3 py-5 text-zinc-500" colSpan={6}>
                                {translate("No previous price changes are recorded for this product.")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {mode === "view" && tab === "inventory" ? (
                  <section
                    aria-labelledby="product-detail-tab-inventory"
                    className="grid gap-4"
                    id="product-detail-panel-inventory"
                    role="tabpanel"
                  >
                    <DetailSection
                      title={translate("Inventory / Sync")}
                      rows={[
                        { label: translate("Stock quantity"), value: formatNumber(product.stockQuantity, translate) },
                        {
                          label: translate("Catalog scope"),
                          value: translateToken(readModel?.diagnostics.catalogScope, translate),
                        },
                        {
                          label: translate("Mobile mapping"),
                          value: translateToken(readModel?.diagnostics.mappingState, translate),
                        },
                        {
                          label: translate("Selected shop"),
                          value: fieldValue(readModel?.diagnostics.selectedShopName, translate),
                        },
                        {
                          label: translate("Last sync"),
                          value: formatDate(readModel?.diagnostics.lastSyncAt, translate),
                        },
                        { label: translate("Last update"), value: formatDate(product.updatedAt, translate) },
                      ]}
                    />
                  </section>
                ) : null}

                {mode === "view" && tab === "history" ? (
                  <section
                    aria-labelledby="product-detail-tab-history"
                    className="grid gap-3"
                    id="product-detail-panel-history"
                    role="tabpanel"
                  >
                    {readModel?.historyEntries.length ? (
                      readModel.historyEntries.map((entry) => (
                        <article
                          className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                          key={entry.entryId}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-950" title={entry.title}>
                              {entry.title}
                            </p>
                            <p className="mt-1 truncate text-xs text-zinc-600" title={entry.payload}>
                              {entry.kind === "sync_event" ? translate("Sync event") : translate("History entry")} / {entry.source}
                            </p>
                          </div>
                          <a
                            className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-300 px-2.5 text-xs font-medium text-zinc-900 hover:border-emerald-400 hover:text-emerald-800"
                            data-history-detail-id={entry.entryId}
                            data-history-detail-trigger
                            href={`/shop/history/${encodeURIComponent(entry.entryId)}${requestedShopId ? `?${new URLSearchParams({ shop_id: requestedShopId }).toString()}` : ""}`}
                          >
                            {entry.kind === "sync_event"
                              ? translate("Open sync event")
                              : translate("Open history detail")}
                          </a>
                        </article>
                      ))
                    ) : (
                      <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                        {translate("No related mobile history entries are visible for this product.")}
                      </p>
                    )}
                  </section>
                ) : null}

                {mode === "view" && tab === "advanced" ? (
                  <section
                    aria-labelledby="product-detail-tab-advanced"
                    className="grid gap-4"
                    id="product-detail-panel-advanced"
                    role="tabpanel"
                  >
                    <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-zinc-950">
                        {translate("Raw diagnostics")}
                      </summary>
                      <div className="mt-3">
                        <DetailGrid
                          rows={[
                            { label: translate("Read status"), value: readModel?.status ?? translate("Unknown") },
                            { label: translate("Reason"), value: fieldValue(readModel?.reason, translate) },
                            { label: translate("Price rows"), value: String(readModel?.diagnostics.priceRows ?? 0) },
                            { label: translate("History rows"), value: String(readModel?.diagnostics.historyRows ?? 0) },
                            {
                              label: translate("Catalog scope"),
                              value: translateToken(readModel?.diagnostics.catalogScope, translate),
                            },
                            {
                              label: translate("Mapping state"),
                              value: translateToken(readModel?.diagnostics.mappingState, translate),
                            },
                          ]}
                        />
                      </div>
                    </details>
                    {canManageProducts ? (
                      <section className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-amber-950">
                            {translate("Danger area")}
                          </h3>
                          <p className="mt-1 text-sm text-amber-900">
                            {translate("Keep this action separate from daily edits.")}
                          </p>
                        </div>
                        <ProductArchiveForm
                          action={product.state === "archived" ? restoreAction : archiveAction}
                          actionLabel={product.state === "archived" ? translate("Restore") : translate("Archive")}
                          confirmation={product.state === "archived" ? "RESTORE" : "ARCHIVE"}
                          labels={labels}
                          pending={product.state === "archived" ? restorePending : archivePending}
                          product={product}
                          selectedShopId={effectiveShopId}
                          tone={product.state === "archived" ? "restore" : "archive"}
                        />
                      </section>
                    ) : null}
                  </section>
                ) : null}
              </div>
            ) : loading ? (
              <ProductSkeleton />
            ) : null}
          </div>
        </>
      )}
    </DialogShell>
  );
}
