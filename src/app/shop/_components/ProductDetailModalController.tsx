"use client";

import {
  type ReactNode,
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
import { CreatableCatalogCombobox } from "@/app/shop/_components/CreatableCatalogCombobox";

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

type ProductDraft = {
  barcode: string;
  categoryName: string;
  itemNumber: string;
  productName: string;
  purchasePrice: string;
  retailPrice: string;
  secondProductName: string;
  stockQuantity: string;
  supplierName: string;
};

type ProductDetailIconName =
  | "archive"
  | "barcode"
  | "box"
  | "cart"
  | "check"
  | "clock"
  | "close"
  | "copy"
  | "folder"
  | "id"
  | "link"
  | "pencil"
  | "priceTag"
  | "save"
  | "sync"
  | "tag"
  | "truck"
  | "warehouse"
  | "warning";

const initialActionState: ShopAdminActionState = {
  code: "success",
  message: "",
  ok: true,
};

const tabs: Array<{ icon: ProductDetailIconName; key: ProductTab; label: string }> = [
  { icon: "box", key: "overview", label: "Overview" },
  { icon: "priceTag", key: "prices", label: "Prices" },
  { icon: "warehouse", key: "inventory", label: "Inventory / Sync" },
  { icon: "sync", key: "history", label: "History entries" },
  { icon: "warning", key: "advanced", label: "Advanced" },
];

type TranslateFn = (value: string) => string;

const identityTranslate: TranslateFn = (value) => value;

function ProductDetailIcon({ name }: { name: ProductDetailIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-4 shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };
  const paths: Record<ProductDetailIconName, ReactNode> = {
    archive: (
      <>
        <path d="M4 7h16" />
        <path d="M6 7v12h12V7" />
        <path d="M9 11h6" />
        <path d="M8 4h8l1 3H7l1-3Z" />
      </>
    ),
    barcode: (
      <>
        <path d="M4 5v14" />
        <path d="M7 5v14" />
        <path d="M11 5v14" />
        <path d="M14 5v14" />
        <path d="M17 5v14" />
        <path d="M20 5v14" />
      </>
    ),
    box: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
      </>
    ),
    cart: (
      <>
        <path d="M4 5h2l2 10h9l2-7H7" />
        <circle cx="10" cy="19" r="1.5" />
        <circle cx="17" cy="19" r="1.5" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12 2.4 2.4 4.8-5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    close: (
      <>
        <path d="M7 7l10 10" />
        <path d="M17 7 7 17" />
      </>
    ),
    copy: (
      <>
        <rect height="10" rx="2" width="10" x="8" y="8" />
        <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    folder: (
      <>
        <path d="M4 6h7l2 2h7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
        <path d="M8 13h8" />
      </>
    ),
    id: (
      <>
        <rect height="14" rx="2" width="18" x="3" y="5" />
        <path d="M7 10h5" />
        <path d="M7 14h10" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 11a4 4 0 0 0-5.7 0L6 13.3A4 4 0 0 0 11.7 19l1-1" />
      </>
    ),
    pencil: (
      <>
        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
        <path d="m13.5 6.5 4 4" />
      </>
    ),
    priceTag: (
      <>
        <path d="M4 5v6l8 8 7-7-8-7H4Z" />
        <circle cx="8" cy="9" r="1" />
      </>
    ),
    save: (
      <>
        <path d="M5 4h12l2 2v14H5V4Z" />
        <path d="M8 4v6h8" />
        <path d="M8 20v-6h8v6" />
      </>
    ),
    sync: (
      <>
        <path d="M4 12a8 8 0 0 1 13.6-5.6" />
        <path d="M18 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.6 5.6" />
        <path d="M6 21v-4h4" />
      </>
    ),
    tag: (
      <>
        <path d="M4 5v6l8 8 7-7-8-7H4Z" />
        <circle cx="8" cy="9" r="1" />
      </>
    ),
    truck: (
      <>
        <path d="M3 8h11v8H3z" />
        <path d="M14 11h4l3 3v2h-7" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    warehouse: (
      <>
        <path d="M4 10 12 5l8 5v10H4V10Z" />
        <path d="M8 20v-6h8v6" />
        <path d="M8 10h8" />
      </>
    ),
    warning: (
      <>
        <path d="M12 4 3 20h18L12 4Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[name]}</svg>;
}

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

function numberInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function blankProductDraft(): ProductDraft {
  return {
    barcode: "",
    categoryName: "",
    itemNumber: "",
    productName: "",
    purchasePrice: "",
    retailPrice: "",
    secondProductName: "",
    stockQuantity: "",
    supplierName: "",
  };
}

function productDraftFromProduct(
  product: ProductDetailModalProduct,
): ProductDraft {
  return {
    barcode: product.barcode,
    categoryName: product.categoryName ?? "",
    itemNumber: product.itemNumber ?? "",
    productName: product.productName ?? "",
    purchasePrice: numberInputValue(product.purchasePrice),
    retailPrice: numberInputValue(product.retailPrice),
    secondProductName: product.secondProductName ?? "",
    stockQuantity: numberInputValue(product.stockQuantity),
    supplierName: product.supplierName ?? "",
  };
}

function areProductDraftsEqual(left: ProductDraft, right: ProductDraft) {
  return (
    left.barcode === right.barcode &&
    left.categoryName === right.categoryName &&
    left.itemNumber === right.itemNumber &&
    left.productName === right.productName &&
    left.purchasePrice === right.purchasePrice &&
    left.retailPrice === right.retailPrice &&
    left.secondProductName === right.secondProductName &&
    left.stockQuantity === right.stockQuantity &&
    left.supplierName === right.supplierName
  );
}

function isProductDraftDirty(
  product: ProductDetailModalProduct,
  draft: ProductDraft,
) {
  const initial = productDraftFromProduct(product);

  return !areProductDraftsEqual(draft, initial);
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

function mobileMappingDescription(
  value: string | null | undefined,
  translate: TranslateFn,
) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "mapped") {
    return translate("Mapped to mobile inventory");
  }

  if (normalized === "legacy_owner_bridge") {
    return translate("Legacy mobile bridge is in use");
  }

  if (normalized === "not_mapped") {
    return translate("No mobile inventory mapping is active");
  }

  return translate("Mapping state is not available");
}

function ActionMessage({ state }: { state: ShopAdminActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={[
        "inline-flex max-w-full rounded-md border px-3 py-2 text-xs font-medium",
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
  children: ReactNode;
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
  icon,
  label,
  value,
}: {
  icon: ProductDetailIconName;
  label: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-white text-emerald-800">
          <ProductDetailIcon name={icon} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            {label}
          </p>
          <p className="mt-1 break-words text-lg font-semibold text-zinc-950 [overflow-wrap:anywhere]">
            {value}
          </p>
        </div>
      </div>
    </article>
  );
}

function CopyChip({
  icon,
  label,
  translate,
  value,
}: {
  icon: ProductDetailIconName;
  label: string;
  translate: TranslateFn;
  value: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const displayValue = fieldValue(value, translate);
  const canCopy = value !== null && value !== undefined && value !== "";

  return (
    <button
      aria-label={`${translate("Copy")} ${label}: ${displayValue}`}
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium",
        canCopy
          ? "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-emerald-300 hover:text-emerald-800"
          : "cursor-default border-zinc-200 bg-zinc-50 text-zinc-500",
      ].join(" ")}
      disabled={!canCopy}
      onClick={() => {
        if (!canCopy || !navigator.clipboard) {
          return;
        }

        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      title={displayValue}
      type="button"
    >
      <ProductDetailIcon name={icon} />
      <span className="shrink-0 font-semibold">{label}</span>
      <span className="min-w-0 truncate font-mono">{displayValue}</span>
      {canCopy ? (
        <span className="shrink-0 text-zinc-400">
          {copied ? translate("Copied") : <ProductDetailIcon name="copy" />}
        </span>
      ) : null}
    </button>
  );
}

function DetailGrid({
  rows,
}: {
  rows: Array<{
    description?: string;
    icon: ProductDetailIconName;
    label: string;
    mono?: boolean;
    value: string;
  }>;
}) {
  return (
    <dl className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <div
          className="min-w-0 rounded-md border border-zinc-200 bg-white p-3"
          key={row.label}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-emerald-800">
              <ProductDetailIcon name={row.icon} />
            </span>
            <div className="min-w-0">
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
              {row.description ? (
                <dd className="mt-1 text-xs leading-5 text-zinc-500">
                  {row.description}
                </dd>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({
  icon,
  rows,
  title,
}: {
  icon: ProductDetailIconName;
  rows: Array<{
    description?: string;
    icon: ProductDetailIconName;
    label: string;
    mono?: boolean;
    value: string;
  }>;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
        <span className="grid size-7 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-emerald-800">
          <ProductDetailIcon name={icon} />
        </span>
        {title}
      </h3>
      <DetailGrid rows={rows} />
    </section>
  );
}

function FormSectionHeader({
  icon,
  title,
}: {
  icon: ProductDetailIconName;
  title: string;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
      <span className="grid size-7 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-emerald-800">
        <ProductDetailIcon name={icon} />
      </span>
      {title}
    </h3>
  );
}

function ProductOverviewForm({
  action,
  categories,
  draft,
  formId,
  labels,
  onDraftChange,
  pending,
  product,
  selectedShopId,
  suppliers,
}: {
  action: (formData: FormData) => void;
  categories: CatalogCategoryOption[];
  draft: ProductDraft;
  formId: string;
  labels?: Record<string, string>;
  onDraftChange: (draft: ProductDraft) => void;
  pending: boolean;
  product: ProductDetailModalProduct;
  selectedShopId?: string | null;
  suppliers: CatalogSupplierOption[];
}) {
  const translate = (value: string) => labels?.[value] ?? value;
  const fieldClassName =
    "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700";

  function updateDraft(field: keyof ProductDraft, value: string) {
    onDraftChange({ ...draft, [field]: value });
  }

  return (
    <form
      action={action}
      aria-busy={pending}
      className="grid gap-4"
      data-product-overview-edit-form
      id={formId}
    >
      {selectedShopId ? <input name="shop_id" type="hidden" value={selectedShopId} /> : null}
      <input name="productId" type="hidden" value={product.productId} />
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <FormSectionHeader icon="id" title={translate("Identity")} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Barcode")}
            <input
              className={fieldClassName}
              name="barcode"
              onChange={(event) => updateDraft("barcode", event.currentTarget.value)}
              required
              value={draft.barcode}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Item code")}
            <input
              className={fieldClassName}
              name="itemNumber"
              onChange={(event) => updateDraft("itemNumber", event.currentTarget.value)}
              value={draft.itemNumber}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800 md:col-span-2 xl:col-span-1">
            {translate("Product name")}
            <input
              className={fieldClassName}
              name="productName"
              onChange={(event) => updateDraft("productName", event.currentTarget.value)}
              required
              value={draft.productName}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Second name")}
            <input
              className={fieldClassName}
              name="secondProductName"
              onChange={(event) => updateDraft("secondProductName", event.currentTarget.value)}
              value={draft.secondProductName}
            />
          </label>
        </div>
      </section>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <FormSectionHeader icon="truck" title={translate("Classification")} />
        <div className="grid gap-3 md:grid-cols-2">
          <CreatableCatalogCombobox
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
            createLabel={translate("Create new supplier")}
            defaultId={product.supplierId}
            defaultName={product.supplierName}
            idName="supplierId"
            label={translate("Supplier")}
            name="supplierName"
            noResultsLabel={translate("No supplier suggestions")}
            onNameChange={(value) => updateDraft("supplierName", value)}
            options={suppliers.map((supplier) => ({
              id: supplier.supplierId,
              name: supplier.name,
            }))}
            suggestionsLabel={translate("Supplier suggestions")}
            value={draft.supplierName}
          />
          <CreatableCatalogCombobox
            className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950"
            createLabel={translate("Create new category")}
            defaultId={product.categoryId}
            defaultName={product.categoryName}
            idName="categoryId"
            label={translate("Category")}
            name="categoryName"
            noResultsLabel={translate("No category suggestions")}
            onNameChange={(value) => updateDraft("categoryName", value)}
            options={categories.map((category) => ({
              id: category.categoryId,
              name: category.name,
            }))}
            suggestionsLabel={translate("Category suggestions")}
            value={draft.categoryName}
          />
        </div>
      </section>
      <section className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <FormSectionHeader icon="warehouse" title={translate("Pricing / stock")} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Stock quantity")}
            <input
              className={fieldClassName}
              min="0"
              name="stockQuantity"
              onChange={(event) => updateDraft("stockQuantity", event.currentTarget.value)}
              step="1"
              type="number"
              value={draft.stockQuantity}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Purchase price")}
            <input
              className={fieldClassName}
              min="0"
              name="purchasePrice"
              onChange={(event) => updateDraft("purchasePrice", event.currentTarget.value)}
              step="0.01"
              type="number"
              value={draft.purchasePrice}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-zinc-800">
            {translate("Retail price")}
            <input
              className={fieldClassName}
              min="0"
              name="retailPrice"
              onChange={(event) => updateDraft("retailPrice", event.currentTarget.value)}
              step="0.01"
              type="number"
              value={draft.retailPrice}
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
  const [tab, setTab] = useState<ProductTab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readModel, setReadModel] = useState<ProductDetailModalReadModel | null>(null);
  const translate = useCallback((value: string) => labels?.[value] ?? value, [labels]);
  const titleId = "product-detail-modal-title";
  const overviewFormId = "product-detail-overview-form";
  const [draft, setDraft] = useState<ProductDraft>(blankProductDraft);
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
          setDraft(blankProductDraft());
          setError(body.reason || "Product detail is not available.");
          return;
        }

        setReadModel(body);
        setDraft(
          body.product ? productDraftFromProduct(body.product) : blankProductDraft(),
        );
      } catch {
        setDraft(blankProductDraft());
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
        setTab("overview");
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
  const draftDirty = product ? isProductDraftDirty(product, draft) : false;

  const openProduct = useCallback(
    (productId: string) => {
      setOpen(true);
      setTab("overview");
      setReadModel(null);
      setDraft(blankProductDraft());
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
      openProduct(productId);
    };

    document.addEventListener("click", onClick);

    return () => document.removeEventListener("click", onClick);
  }, [openProduct]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("product_action");

    if (action !== "detail" && action !== "edit") {
      return;
    }

    const productId = params.get("product_id");

    if (!productId) {
      return;
    }

    const timeout = window.setTimeout(() => openProduct(productId), 0);

    return () => window.clearTimeout(timeout);
  }, [openProduct]);

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
      {
        icon: product.state === "archived" ? ("archive" as const) : ("check" as const),
        label: translate("Status"),
        value:
          product.state === "archived"
            ? translate("Archived")
            : translate("Active"),
      },
      {
        icon: "clock" as const,
        label: translate("Last update"),
        value: formatDate(readModel?.diagnostics.lastSyncAt ?? product.updatedAt, translate),
      },
      {
        icon: "box" as const,
        label: translate("Catalog scope"),
        value: translateToken(readModel?.diagnostics.catalogScope, translate),
      },
      {
        icon: "link" as const,
        label: translate("Mobile mapping"),
        value: translateToken(readModel?.diagnostics.mappingState, translate),
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
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                  <ProductDetailIcon name="box" />
                </span>
                <div className="min-w-0">
                  <h2
                    className="line-clamp-2 break-words text-xl font-semibold leading-7 text-zinc-950 [overflow-wrap:anywhere]"
                    id={titleId}
                    title={product?.productName ?? translate("Product detail")}
                  >
                    {product?.productName ?? translate("Product detail")}
                  </h2>
                  <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                    <CopyChip
                      icon="barcode"
                      label={translate("Barcode")}
                      translate={translate}
                      value={product?.barcode}
                    />
                    <CopyChip
                      icon="tag"
                      label={translate("Item code")}
                      translate={translate}
                      value={product?.itemNumber}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={[
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold",
                        product?.state === "archived"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800",
                      ].join(" ")}
                    >
                      <ProductDetailIcon
                        name={
                          product?.state === "archived" ? "archive" : "check"
                        }
                      />
                      {product?.state === "archived"
                        ? translate("Archived")
                        : translate("Active")}
                    </span>
                    {readModel && readModel.status !== "ready" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                        <ProductDetailIcon name="warning" />
                        {translate("Sync issue")}
                      </span>
                    ) : null}
                    {readModel?.diagnostics.historyRows ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                        <ProductDetailIcon name="sync" />
                        {translate("Mobile history")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {canManageProducts && product ? (
                  <>
                    {tab === "overview" ? (
                      <>
                        <button
                          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!draftDirty || updatePending}
                          form={overviewFormId}
                          type="submit"
                        >
                          <ProductDetailIcon name="save" />
                          {updatePending ? translate("Saving") : translate("Save")}
                        </button>
                        {draftDirty ? (
                          <button
                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:border-zinc-400"
                            onClick={() => setDraft(productDraftFromProduct(product))}
                            type="button"
                          >
                            <ProductDetailIcon name="close" />
                            {translate("Reset changes")}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                  onClick={closeModal}
                  type="button"
                >
                  <ProductDetailIcon name="close" />
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
                    <SummaryCard
                      icon={card.icon}
                      key={card.label}
                      label={card.label}
                      value={card.value}
                    />
                  ))}
                </section>

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
                        "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700",
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
                      <ProductDetailIcon name={item.icon} />
                      {translate(item.label)}
                      {item.key === "prices" && readModel?.prices.length ? (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.68rem] font-semibold text-zinc-600">
                          {readModel.prices.length}
                        </span>
                      ) : null}
                      {item.key === "history" && readModel?.historyEntries.length ? (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.68rem] font-semibold text-zinc-600">
                          {readModel.historyEntries.length}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </nav>

                {tab === "overview" ? (
                  <section
                    aria-labelledby="product-detail-tab-overview"
                    className="grid gap-4"
                    id="product-detail-panel-overview"
                    role="tabpanel"
                  >
                    {canManageProducts ? (
                      <ProductOverviewForm
                        action={updateAction}
                        categories={categories}
                        draft={draft}
                        formId={overviewFormId}
                        labels={labels}
                        onDraftChange={setDraft}
                        pending={updatePending}
                        product={product}
                        selectedShopId={effectiveShopId}
                        suppliers={suppliers}
                      />
                    ) : (
                      <>
                        <DetailSection
                          icon="id"
                          title={translate("Product identity")}
                          rows={[
                            {
                              icon: "id",
                              label: translate("Product id"),
                              mono: true,
                              value: product.productId,
                            },
                            {
                              icon: "barcode",
                              label: translate("Barcode"),
                              mono: true,
                              value: product.barcode,
                            },
                            {
                              icon: "tag",
                              label: translate("Item code"),
                              mono: true,
                              value: fieldValue(product.itemNumber, translate),
                            },
                            {
                              icon: "box",
                              label: translate("Product name"),
                              value: fieldValue(product.productName, translate),
                            },
                            {
                              icon: "tag",
                              label: translate("Second name"),
                              value: fieldValue(product.secondProductName, translate),
                            },
                          ]}
                        />
                        <DetailSection
                          icon="folder"
                          title={translate("Classification")}
                          rows={[
                            {
                              icon: "truck",
                              label: translate("Supplier"),
                              value: fieldValue(product.supplierName, translate),
                            },
                            {
                              icon: "folder",
                              label: translate("Category"),
                              value: fieldValue(product.categoryName, translate),
                            },
                            {
                              icon: product.state === "archived" ? "archive" : "check",
                              label: translate("Status"),
                              value: product.state === "archived" ? translate("Archived") : translate("Active"),
                            },
                          ]}
                        />
                        <DetailSection
                          icon="sync"
                          title={translate("Mobile sync")}
                          rows={[
                            {
                              description: translate("Latest product row update visible to Admin Web"),
                              icon: "clock",
                              label: translate("Updated"),
                              value: formatDate(product.updatedAt, translate),
                            },
                            {
                              description: translate("Archived products remain restorable from Advanced"),
                              icon: "archive",
                              label: translate("Archived"),
                              value: formatDate(product.deletedAt, translate),
                            },
                            {
                              description: mobileMappingDescription(
                                readModel?.diagnostics.mappingState,
                                translate,
                              ),
                              icon: "sync",
                              label: translate("Last sync"),
                              value: formatDate(readModel?.diagnostics.lastSyncAt, translate),
                            },
                          ]}
                        />
                      </>
                    )}
                  </section>
                ) : null}

                {tab === "prices" ? (
                  <section
                    aria-labelledby="product-detail-tab-prices"
                    className="grid gap-4"
                    id="product-detail-panel-prices"
                    role="tabpanel"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryCard
                        icon="cart"
                        label={translate("Current purchase price")}
                        value={formatNumber(product.purchasePrice, translate)}
                      />
                      <SummaryCard
                        icon="priceTag"
                        label={translate("Current retail price")}
                        value={formatNumber(product.retailPrice, translate)}
                      />
                    </div>
                    {readModel?.prices.length ? (
                      <div className="grid gap-3">
                        {readModel.prices.map((price) => (
                          <article
                            className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start"
                            key={price.priceId}
                          >
                            <span className="grid size-9 place-items-center rounded-md border border-zinc-200 bg-zinc-50 text-emerald-800">
                              <ProductDetailIcon name="priceTag" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-zinc-950">
                                {translateToken(price.type, translate)} · {formatNumber(price.price, translate)}
                              </p>
                              <p className="mt-1 break-words text-xs leading-5 text-zinc-600 [overflow-wrap:anywhere]">
                                {translate("Source")}: {fieldValue(price.source, translate)}
                                {" · "}
                                {translate("Note")}: {fieldValue(price.note, translate)}
                              </p>
                            </div>
                            <dl className="grid gap-1 text-xs text-zinc-600 md:text-right">
                              <div>
                                <dt className="font-semibold text-zinc-500">
                                  {translate("Effective")}
                                </dt>
                                <dd>{formatDate(price.effectiveAt, translate)}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold text-zinc-500">
                                  {translate("Created")}
                                </dt>
                                <dd>{formatDate(price.createdAt, translate)}</dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
                        {translate("No previous price changes are recorded for this product.")}
                      </p>
                    )}
                  </section>
                ) : null}

                {tab === "inventory" ? (
                  <section
                    aria-labelledby="product-detail-tab-inventory"
                    className="grid gap-4"
                    id="product-detail-panel-inventory"
                    role="tabpanel"
                  >
                    <DetailSection
                      icon="warehouse"
                      title={translate("Inventory / Sync")}
                      rows={[
                        {
                          icon: "warehouse",
                          label: translate("Stock quantity"),
                          value: formatNumber(product.stockQuantity, translate),
                        },
                        {
                          description: translate("Source used by the admin product read model"),
                          icon: "box",
                          label: translate("Catalog scope"),
                          value: translateToken(readModel?.diagnostics.catalogScope, translate),
                        },
                        {
                          description: mobileMappingDescription(
                            readModel?.diagnostics.mappingState,
                            translate,
                          ),
                          icon: "link",
                          label: translate("Mobile mapping"),
                          value: translateToken(readModel?.diagnostics.mappingState, translate),
                        },
                        {
                          icon: "folder",
                          label: translate("Selected shop"),
                          value: fieldValue(readModel?.diagnostics.selectedShopName, translate),
                        },
                        {
                          icon: "sync",
                          label: translate("Last sync"),
                          value: formatDate(readModel?.diagnostics.lastSyncAt, translate),
                        },
                        {
                          icon: "clock",
                          label: translate("Last update"),
                          value: formatDate(product.updatedAt, translate),
                        },
                      ]}
                    />
                  </section>
                ) : null}

                {tab === "history" ? (
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

                {tab === "advanced" ? (
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
                            {
                              icon: "check",
                              label: translate("Read status"),
                              value: readModel?.status ?? translate("Unknown"),
                            },
                            {
                              icon: "warning",
                              label: translate("Reason"),
                              value: fieldValue(readModel?.reason, translate),
                            },
                            {
                              icon: "priceTag",
                              label: translate("Price rows"),
                              value: String(readModel?.diagnostics.priceRows ?? 0),
                            },
                            {
                              icon: "sync",
                              label: translate("History rows"),
                              value: String(readModel?.diagnostics.historyRows ?? 0),
                            },
                            {
                              icon: "box",
                              label: translate("Catalog scope"),
                              value: translateToken(readModel?.diagnostics.catalogScope, translate),
                            },
                            {
                              icon: "link",
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
