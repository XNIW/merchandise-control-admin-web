import {
  archiveCategoryAction,
  archiveProductAction,
  archiveSupplierAction,
  createCategoryAction,
  createProductAction,
  createSupplierAction,
  updateCategoryAction,
  updateProductAction,
  updateSupplierAction,
} from "@/app/shop/actions";

type CatalogActionPanelProps = {
  scope: "products" | "categories" | "suppliers";
  selectedShopId?: string;
};

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function TextInput({
  label,
  name,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-800">
      {label}
      <input
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm focus:border-emerald-600 focus:outline-none"
        name={name}
        required={required}
        type={type}
      />
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
    <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function ProductForms({ selectedShopId }: { selectedShopId?: string }) {
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
        <form action={createProductAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          {productFields}
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Create product
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update product">
        <form action={updateProductAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Product id" name="productId" required />
          {productFields}
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Update product
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive product">
        <form action={archiveProductAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Product id" name="productId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Archive product
          </button>
        </form>
      </ActionShell>
    </>
  );
}

function CategoryForms({ selectedShopId }: { selectedShopId?: string }) {
  return (
    <>
      <ActionShell title="Create category">
        <form action={createCategoryAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category name" name="name" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Create category
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update category">
        <form action={updateCategoryAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category id" name="categoryId" required />
          <TextInput label="Category name" name="name" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Update category
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive category">
        <form action={archiveCategoryAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Category id" name="categoryId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
            Archive category
          </button>
        </form>
      </ActionShell>
    </>
  );
}

function SupplierForms({ selectedShopId }: { selectedShopId?: string }) {
  return (
    <>
      <ActionShell title="Create supplier">
        <form action={createSupplierAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier name" name="name" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Create supplier
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Update supplier">
        <form action={updateSupplierAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier id" name="supplierId" required />
          <TextInput label="Supplier name" name="name" required />
          <button className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
            Update supplier
          </button>
        </form>
      </ActionShell>

      <ActionShell title="Archive supplier">
        <form action={archiveSupplierAction} className="grid gap-3">
          <HiddenShopInput selectedShopId={selectedShopId} />
          <TextInput label="Supplier id" name="supplierId" required />
          <TextInput label="Reason" name="reason" />
          <TextInput label="Type ARCHIVE as confirmation" name="confirmation" required />
          <button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
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
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-3">
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
