import {
  archiveCategoryAction,
  archiveProductAction,
  archiveSupplierAction,
  createCategoryAction,
  createProductAction,
  createSupplierAction,
  restoreProductAction,
  updateCategoryAction,
  updateProductAction,
  updateSupplierAction,
} from "@/app/shop/actions";
import { SHOP_ADMIN_CONTENT_FRAME_CLASS } from "@/components/shop/shopLayout";

type CatalogActionPanelProps = {
  scope: "products" | "categories" | "suppliers";
  selectedShopId?: string;
};

const catalogActionCardClassName =
  "flex min-h-[14rem] min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-4 shadow-sm";
const catalogFormClassName = "flex min-w-0 flex-1 flex-col gap-3";
const catalogInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none";
const catalogButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white sm:w-auto";
const catalogArchiveButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-amber-400 bg-amber-50 px-4 text-sm font-medium text-amber-950 sm:w-auto";
const catalogRestoreButtonClassName =
  "mt-auto inline-flex h-10 w-full items-center justify-center rounded-md border border-emerald-500 bg-emerald-50 px-4 text-sm font-medium text-emerald-950 sm:w-auto";

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function TextInput({
  description,
  label,
  maxLength,
  name,
  required,
  type = "text",
}: {
  description?: string;
  label: string;
  maxLength?: number;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className={catalogInputClassName}
        maxLength={maxLength}
        name={name}
        required={required}
        type={type}
      />
      {description ? (
        <span className="text-xs font-normal text-zinc-500">{description}</span>
      ) : null}
    </label>
  );
}

function ActionShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className={catalogActionCardClassName}>
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function ProductForms({ selectedShopId }: { selectedShopId?: string }) {
  const auditReasonDescription = "Required for the audit trail.";
  const productFields = (
    <>
      <TextInput label="Barcode" name="barcode" required />
      <TextInput label="Product name" name="productName" required />
      <TextInput label="Second name" name="secondProductName" />
      <TextInput label="Item number" name="itemNumber" />
      <TextInput label="Supplier id" name="supplierId" />
      <TextInput label="Category id" name="categoryId" />
      <TextInput label="Retail price" name="retailPrice" type="number" />
      <TextInput label="Purchase price" name="purchasePrice" type="number" />
      <TextInput label="Stock quantity" name="stockQuantity" type="number" />
    </>
  );

  return (
    <>
      <ActionShell title="Create product">
        <form action={createProductAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          {productFields}
          <button className={catalogButtonClassName}>
            Create product
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update product">
        <form action={updateProductAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Product id" name="productId" required />
          {productFields}
          <button className={catalogButtonClassName}>
            Update product
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive product">
        <form action={archiveProductAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Product id" name="productId" required />
          <TextInput
            description={auditReasonDescription}
            label="Reason"
            maxLength={240}
            name="reason"
            required
          />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className={catalogArchiveButtonClassName}>
            Archive product
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archived products">
        <form action={restoreProductAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Product id" name="productId" required />
          <TextInput
            description={auditReasonDescription}
            label="Reason"
            maxLength={240}
            name="reason"
            required
          />
          <TextInput label="Type RESTORE as confirmation" name="confirmation" required />
          <button className={catalogRestoreButtonClassName}>
            Restore product
          </button>
        </form>
      </ActionShell>
    </>
  );
}

function CategoryForms({ selectedShopId }: { selectedShopId?: string }) {
  const auditReasonDescription = "Required for the audit trail.";

  return (
    <>
      <ActionShell title="Create category">
        <form action={createCategoryAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category name" name="name" required />
          <button className={catalogButtonClassName}>
            Create category
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update category">
        <form action={updateCategoryAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category id" name="categoryId" required />
          <TextInput label="Category name" name="name" required />
          <button className={catalogButtonClassName}>
            Update category
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive category">
        <form action={archiveCategoryAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category id" name="categoryId" required />
          <TextInput
            description={auditReasonDescription}
            label="Reason"
            maxLength={240}
            name="reason"
            required
          />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className={catalogArchiveButtonClassName}>
            Archive category
          </button>
        </form>
      </ActionShell>
    </>
  );
}

function SupplierForms({ selectedShopId }: { selectedShopId?: string }) {
  const auditReasonDescription = "Required for the audit trail.";

  return (
    <>
      <ActionShell title="Create supplier">
        <form action={createSupplierAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier name" name="name" required />
          <button className={catalogButtonClassName}>
            Create supplier
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update supplier">
        <form action={updateSupplierAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier id" name="supplierId" required />
          <TextInput label="Supplier name" name="name" required />
          <button className={catalogButtonClassName}>
            Update supplier
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive supplier">
        <form action={archiveSupplierAction} className={catalogFormClassName}>
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier id" name="supplierId" required />
          <TextInput
            description={auditReasonDescription}
            label="Reason"
            maxLength={240}
            name="reason"
            required
          />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className={catalogArchiveButtonClassName}>
            Archive supplier
          </button>
        </form>
      </ActionShell>
    </>
  );
}

export function CatalogActionPanel({
  scope,
  selectedShopId,
}: CatalogActionPanelProps) {
  return (
    <div className={`${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-4 lg:grid-cols-3`}>
      {scope === "products" ? (
        <ProductForms selectedShopId={selectedShopId} />
      ) : null}
      {scope === "categories" ? (
        <CategoryForms selectedShopId={selectedShopId} />
      ) : null}
      {scope === "suppliers" ? (
        <SupplierForms selectedShopId={selectedShopId} />
      ) : null}
    </div>
  );
}
