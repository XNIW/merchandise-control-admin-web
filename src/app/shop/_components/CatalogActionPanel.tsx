"use client";

import { useId, useState } from "react";
import {
  CatalogExportPanel,
  DatabaseTransferPanel,
  SupplierExcelImportWizard,
} from "@/app/shop/_components/ImportExportActionPanel";
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

export type CatalogProductOption = {
  barcode: string;
  categoryId: string | null;
  itemNumber: string | null;
  productId: string;
  productName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  secondProductName: string | null;
  stockQuantity: number | null;
  supplierId: string | null;
};

export type CatalogCategoryOption = {
  categoryId: string;
  name: string;
};

export type CatalogSupplierOption = {
  name: string;
  supplierId: string;
};

type CatalogActionPanelProps = {
  archivedProducts?: CatalogProductOption[];
  canExport?: boolean;
  canImport?: boolean;
  canManage?: boolean;
  categories?: CatalogCategoryOption[];
  embedded?: boolean;
  initialDialog?: DialogKey | null;
  initialEntityId?: string;
  products?: CatalogProductOption[];
  scope: "products" | "categories" | "suppliers";
  selectedShopId?: string;
  suppliers?: CatalogSupplierOption[];
};

type DialogKey =
  | "newProduct"
  | "editProduct"
  | "archiveProduct"
  | "restoreProduct"
  | "importSupplier"
  | "exportCatalog"
  | "advancedTransfer"
  | "newCategory"
  | "editCategory"
  | "archiveCategory"
  | "newSupplier"
  | "editSupplier"
  | "archiveSupplier";

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
const catalogToolbarButtonClassName =
  "inline-flex h-10 min-w-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm hover:border-emerald-400 hover:text-emerald-800";

function HiddenShopInput({ selectedShopId }: { selectedShopId?: string }) {
  return selectedShopId ? (
    <input name="shop_id" type="hidden" value={selectedShopId} />
  ) : null;
}

function TextInput({
  description,
  defaultValue,
  label,
  maxLength,
  name,
  required,
  type = "text",
}: {
  description?: string;
  defaultValue?: string | number | null;
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
        defaultValue={defaultValue ?? undefined}
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

function SelectField({
  children,
  defaultValue,
  label,
  name,
  required,
}: {
  children: React.ReactNode;
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      {label}
      <select
        className={catalogInputClassName}
        defaultValue={defaultValue}
        name={name}
        required={required}
      >
        {children}
      </select>
    </label>
  );
}

function CatalogDialog({
  children,
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/35 p-4">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-md bg-white p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex min-w-0 items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950" id={titleId}>
            {title}
          </h2>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

function ProductPicker({
  archivedProducts = [],
  defaultProductId,
  products = [],
}: {
  archivedProducts?: CatalogProductOption[];
  defaultProductId?: string;
  products?: CatalogProductOption[];
}) {
  const allProducts = [...products, ...archivedProducts];

  return (
    <>
      <SelectField
        defaultValue={defaultProductId ?? ""}
        label="Product"
        name="productId"
      >
        <option value="">Select product</option>
        {allProducts.map((product) => (
          <option key={product.productId} value={product.productId}>
            {product.barcode} - {product.productName ?? product.secondProductName ?? product.productId}
          </option>
        ))}
      </SelectField>
      <TextInput
        description="Fallback when the product is not listed."
        label="Product id / barcode fallback"
        name="productLookup"
      />
    </>
  );
}

function CreatableSupplierField({
  defaultSupplierId,
  suppliers = [],
}: {
  defaultSupplierId?: string | null;
  suppliers?: CatalogSupplierOption[];
}) {
  const defaultSupplier = suppliers.find(
    (supplier) => supplier.supplierId === defaultSupplierId,
  );
  const [supplierName, setSupplierName] = useState(defaultSupplier?.name ?? "");
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.name.toLowerCase() === supplierName.trim().toLowerCase(),
  );

  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      Existing supplier or new supplier name
      <input
        className={catalogInputClassName}
        list="supplier-options"
        name="supplierName"
        onChange={(event) => setSupplierName(event.currentTarget.value)}
        value={supplierName}
      />
      <input name="supplierId" type="hidden" value={selectedSupplier?.supplierId ?? ""} />
      <datalist id="supplier-options">
        {suppliers.map((supplier) => (
          <option key={supplier.supplierId} value={supplier.name} />
        ))}
      </datalist>
      <span className="text-xs font-normal text-zinc-500">
        Select an existing supplier or type a new supplier name.
      </span>
    </label>
  );
}

function CreatableCategoryField({
  categories = [],
  defaultCategoryId,
}: {
  categories?: CatalogCategoryOption[];
  defaultCategoryId?: string | null;
}) {
  const defaultCategory = categories.find(
    (category) => category.categoryId === defaultCategoryId,
  );
  const [categoryName, setCategoryName] = useState(defaultCategory?.name ?? "");
  const selectedCategory = categories.find(
    (category) => category.name.toLowerCase() === categoryName.trim().toLowerCase(),
  );

  return (
    <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-800">
      Existing category or new category name
      <input
        className={catalogInputClassName}
        list="category-options"
        name="categoryName"
        onChange={(event) => setCategoryName(event.currentTarget.value)}
        value={categoryName}
      />
      <input name="categoryId" type="hidden" value={selectedCategory?.categoryId ?? ""} />
      <datalist id="category-options">
        {categories.map((category) => (
          <option key={category.categoryId} value={category.name} />
        ))}
      </datalist>
      <span className="text-xs font-normal text-zinc-500">
        Select an existing category or type a new category name.
      </span>
    </label>
  );
}

function EntityPicker({
  defaultEntityId,
  emptyLabel,
  label,
  name,
  options,
}: {
  defaultEntityId?: string;
  emptyLabel: string;
  label: string;
  name: string;
  options: Array<{ id: string; label: string }>;
}) {
  if (options.length === 0) {
    return <TextInput label={`${label} id`} name={name} required />;
  }

  return (
    <SelectField
      defaultValue={defaultEntityId ?? ""}
      label={label}
      name={name}
      required
    >
      <option value="">{emptyLabel}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}

function DialogFormShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section className={catalogActionCardClassName}>{children}</section>;
}

function ProductFields({
  categories,
  defaultProduct,
  suppliers,
}: {
  categories: CatalogCategoryOption[];
  defaultProduct?: CatalogProductOption;
  suppliers: CatalogSupplierOption[];
}) {
  return (
    <>
      <TextInput
        defaultValue={defaultProduct?.barcode}
        label="Barcode"
        name="barcode"
        required
      />
      <TextInput
        defaultValue={defaultProduct?.productName}
        label="Product name"
        name="productName"
        required
      />
      <TextInput
        defaultValue={defaultProduct?.secondProductName}
        label="Second name"
        name="secondProductName"
      />
      <TextInput
        defaultValue={defaultProduct?.itemNumber}
        label="Item number"
        name="itemNumber"
      />
      <CreatableSupplierField
        defaultSupplierId={defaultProduct?.supplierId}
        suppliers={suppliers}
      />
      <CreatableCategoryField
        categories={categories}
        defaultCategoryId={defaultProduct?.categoryId}
      />
      <TextInput
        defaultValue={defaultProduct?.purchasePrice}
        label="Purchase price"
        name="purchasePrice"
        type="number"
      />
      <TextInput
        defaultValue={defaultProduct?.retailPrice}
        label="Retail price"
        name="retailPrice"
        type="number"
      />
      <TextInput
        defaultValue={defaultProduct?.stockQuantity}
        label="Stock quantity"
        name="stockQuantity"
        type="number"
      />
    </>
  );
}

function SelectedEntitySummary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
      {children}
    </p>
  );
}

function ProductsDialogs({
  archivedProducts,
  canExport,
  canImport,
  categories,
  openDialog,
  products,
  selectedEntityId,
  selectedShopId,
  setOpenDialog,
  suppliers,
}: {
  archivedProducts: CatalogProductOption[];
  canExport: boolean;
  canImport: boolean;
  categories: CatalogCategoryOption[];
  openDialog: DialogKey | null;
  products: CatalogProductOption[];
  selectedEntityId?: string;
  selectedShopId?: string;
  setOpenDialog: (dialog: DialogKey | null) => void;
  suppliers: CatalogSupplierOption[];
}) {
  const auditReasonDescription = "Required for the audit trail.";
  const selectedProduct = [...products, ...archivedProducts].find(
    (product) => product.productId === selectedEntityId,
  );
  const selectedProductLabel = selectedProduct
    ? `${selectedProduct.barcode} - ${
        selectedProduct.productName ??
        selectedProduct.secondProductName ??
        selectedProduct.productId
      }`
    : null;

  return (
    <>
      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "newProduct"}
        title="New product"
      >
        <DialogFormShell>
          <form action={createProductAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <ProductFields categories={categories} suppliers={suppliers} />
            <button className={catalogButtonClassName}>Create product</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "editProduct"}
        title="Edit product"
      >
        <DialogFormShell>
          <form action={updateProductAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedProduct ? (
              <>
                <input
                  name="productId"
                  type="hidden"
                  value={selectedProduct.productId}
                />
                <SelectedEntitySummary>
                  Editing {selectedProductLabel}
                </SelectedEntitySummary>
              </>
            ) : (
              <ProductPicker
                archivedProducts={archivedProducts}
                defaultProductId={selectedEntityId}
                products={products}
              />
            )}
            <ProductFields
              categories={categories}
              defaultProduct={selectedProduct}
              suppliers={suppliers}
            />
            <button className={catalogButtonClassName}>Update product</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "archiveProduct"}
        title="Archive product"
      >
        <DialogFormShell>
          <form action={archiveProductAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedProduct ? (
              <>
                <input
                  name="productId"
                  type="hidden"
                  value={selectedProduct.productId}
                />
                <SelectedEntitySummary>
                  Archiving {selectedProductLabel}
                </SelectedEntitySummary>
              </>
            ) : (
              <ProductPicker
                defaultProductId={selectedEntityId}
                products={products}
              />
            )}
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
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "restoreProduct"}
        title="Restore product"
      >
        <p className="mb-3 text-sm leading-6 text-zinc-600">
          Archived products can be restored with an audit reason.
        </p>
        <DialogFormShell>
          <form action={restoreProductAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedProduct ? (
              <>
                <input
                  name="productId"
                  type="hidden"
                  value={selectedProduct.productId}
                />
                <SelectedEntitySummary>
                  Restoring {selectedProductLabel}
                </SelectedEntitySummary>
              </>
            ) : (
              <ProductPicker
                archivedProducts={archivedProducts}
                defaultProductId={selectedEntityId}
              />
            )}
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
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "importSupplier"}
        title="Import supplier Excel"
      >
        {canImport ? (
          <SupplierExcelImportWizard selectedShopId={selectedShopId} />
        ) : null}
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "exportCatalog"}
        title="Export catalog Excel"
      >
        {canExport ? <CatalogExportPanel selectedShopId={selectedShopId} /> : null}
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "advancedTransfer"}
        title="Database transfer"
      >
        {canImport ? (
          <DatabaseTransferPanel selectedShopId={selectedShopId} />
        ) : null}
      </CatalogDialog>
    </>
  );
}

function CategoryDialogs({
  categories,
  openDialog,
  selectedEntityId,
  selectedShopId,
  setOpenDialog,
}: {
  categories: CatalogCategoryOption[];
  openDialog: DialogKey | null;
  selectedEntityId?: string;
  selectedShopId?: string;
  setOpenDialog: (dialog: DialogKey | null) => void;
}) {
  const auditReasonDescription = "Required for the audit trail.";
  const categoryOptions = categories.map((category) => ({
    id: category.categoryId,
    label: category.name,
  }));
  const selectedCategory = categories.find(
    (category) => category.categoryId === selectedEntityId,
  );

  return (
    <>
      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "newCategory"}
        title="Create category"
      >
        <DialogFormShell>
          <form action={createCategoryAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label="Category name" name="name" required />
            <button className={catalogButtonClassName}>Create category</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "editCategory"}
        title="Update category"
      >
        <DialogFormShell>
          <form action={updateCategoryAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedCategory ? (
              <>
                <input
                  name="categoryId"
                  type="hidden"
                  value={selectedCategory.categoryId}
                />
                <SelectedEntitySummary>
                  Updating {selectedCategory.name}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel="Select category"
                label="Category"
                name="categoryId"
                options={categoryOptions}
              />
            )}
            <TextInput
              defaultValue={selectedCategory?.name}
              label="Category name"
              name="name"
              required
            />
            <button className={catalogButtonClassName}>Update category</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "archiveCategory"}
        title="Archive category"
      >
        <DialogFormShell>
          <form action={archiveCategoryAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedCategory ? (
              <>
                <input
                  name="categoryId"
                  type="hidden"
                  value={selectedCategory.categoryId}
                />
                <SelectedEntitySummary>
                  Archiving {selectedCategory.name}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel="Select category"
                label="Category"
                name="categoryId"
                options={categoryOptions}
              />
            )}
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
        </DialogFormShell>
      </CatalogDialog>
    </>
  );
}

function SupplierDialogs({
  openDialog,
  selectedEntityId,
  selectedShopId,
  setOpenDialog,
  suppliers,
}: {
  openDialog: DialogKey | null;
  selectedEntityId?: string;
  selectedShopId?: string;
  setOpenDialog: (dialog: DialogKey | null) => void;
  suppliers: CatalogSupplierOption[];
}) {
  const auditReasonDescription = "Required for the audit trail.";
  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.supplierId,
    label: supplier.name,
  }));
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.supplierId === selectedEntityId,
  );

  return (
    <>
      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "newSupplier"}
        title="Create supplier"
      >
        <DialogFormShell>
          <form action={createSupplierAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label="Supplier name" name="name" required />
            <button className={catalogButtonClassName}>Create supplier</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "editSupplier"}
        title="Update supplier"
      >
        <DialogFormShell>
          <form action={updateSupplierAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedSupplier ? (
              <>
                <input
                  name="supplierId"
                  type="hidden"
                  value={selectedSupplier.supplierId}
                />
                <SelectedEntitySummary>
                  Updating {selectedSupplier.name}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel="Select supplier"
                label="Supplier"
                name="supplierId"
                options={supplierOptions}
              />
            )}
            <TextInput
              defaultValue={selectedSupplier?.name}
              label="Supplier name"
              name="name"
              required
            />
            <button className={catalogButtonClassName}>Update supplier</button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "archiveSupplier"}
        title="Archive supplier"
      >
        <DialogFormShell>
          <form action={archiveSupplierAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            {selectedSupplier ? (
              <>
                <input
                  name="supplierId"
                  type="hidden"
                  value={selectedSupplier.supplierId}
                />
                <SelectedEntitySummary>
                  Archiving {selectedSupplier.name}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel="Select supplier"
                label="Supplier"
                name="supplierId"
                options={supplierOptions}
              />
            )}
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
        </DialogFormShell>
      </CatalogDialog>
    </>
  );
}

function ToolbarButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={catalogToolbarButtonClassName}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function CatalogActionPanel({
  initialDialog = null,
  initialEntityId = "",
  ...props
}: CatalogActionPanelProps) {
  return (
    <CatalogActionPanelContent
      key={`${initialDialog ?? "closed"}:${initialEntityId}`}
      initialDialog={initialDialog}
      initialEntityId={initialEntityId}
      {...props}
    />
  );
}

function CatalogActionPanelContent({
  archivedProducts = [],
  canExport = false,
  canImport = false,
  canManage = true,
  categories = [],
  embedded = false,
  initialDialog = null,
  initialEntityId = "",
  products = [],
  scope,
  selectedShopId,
  suppliers = [],
}: CatalogActionPanelProps) {
  const [openDialog, setOpenDialog] = useState<DialogKey | null>(
    initialDialog,
  );
  const panelClassName = embedded
    ? "grid gap-3"
    : `${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3`;

  return (
    <section className={panelClassName}>
      <div className="flex min-w-0 flex-wrap gap-2 rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
        {scope === "products" ? (
          <>
            {canManage ? (
              <ToolbarButton onClick={() => setOpenDialog("newProduct")}>
                New product
              </ToolbarButton>
            ) : null}
            {canImport ? (
              <>
                <ToolbarButton onClick={() => setOpenDialog("importSupplier")}>
                  Import supplier Excel
                </ToolbarButton>
              </>
            ) : null}
            {canExport ? (
              <>
                <ToolbarButton onClick={() => setOpenDialog("exportCatalog")}>
                  Export catalog Excel
                </ToolbarButton>
              </>
            ) : null}
            {canImport ? (
              <>
                <ToolbarButton onClick={() => setOpenDialog("advancedTransfer")}>
                  Database transfer
                </ToolbarButton>
              </>
            ) : null}
          </>
        ) : null}

        {scope === "categories" ? (
          <ToolbarButton onClick={() => setOpenDialog("newCategory")}>
            Create category
          </ToolbarButton>
        ) : null}

        {scope === "suppliers" ? (
          <ToolbarButton onClick={() => setOpenDialog("newSupplier")}>
            Create supplier
          </ToolbarButton>
        ) : null}
      </div>

      {scope === "products" ? (
        <ProductsDialogs
          archivedProducts={archivedProducts}
          canExport={canExport}
          canImport={canImport}
          categories={categories}
          openDialog={openDialog}
          products={products}
          selectedEntityId={initialEntityId}
          selectedShopId={selectedShopId}
          setOpenDialog={setOpenDialog}
          suppliers={suppliers}
        />
      ) : null}

      {scope === "categories" ? (
        <CategoryDialogs
          categories={categories}
          openDialog={openDialog}
          selectedEntityId={initialEntityId}
          selectedShopId={selectedShopId}
          setOpenDialog={setOpenDialog}
        />
      ) : null}

      {scope === "suppliers" ? (
        <SupplierDialogs
          openDialog={openDialog}
          selectedEntityId={initialEntityId}
          selectedShopId={selectedShopId}
          setOpenDialog={setOpenDialog}
          suppliers={suppliers}
        />
      ) : null}
    </section>
  );
}
