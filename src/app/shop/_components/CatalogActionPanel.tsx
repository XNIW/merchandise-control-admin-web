"use client";

import { createContext, useCallback, useContext, useId, useState } from "react";
import {
  CatalogExportPanel,
  DatabaseTransferPanel,
  type HeaderBackState,
  type HeaderFileState,
  SupplierExcelImportWizard,
  type UiTextMap,
} from "@/app/shop/_components/ImportExportActionPanel";
import {
  archiveCategoryWithStrategyAction,
  archiveProductAction,
  archiveSupplierWithStrategyAction,
  createCategoryAction,
  createProductAction,
  createSupplierAction,
  restoreProductAction,
  updateCategoryAction,
  updateSupplierAction,
} from "@/app/shop/actions";
import { CreatableCatalogCombobox } from "@/app/shop/_components/CreatableCatalogCombobox";
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
  activeProductsCount: number;
  categoryId: string;
  name: string;
};

export type CatalogSupplierOption = {
  activeProductsCount: number;
  name: string;
  supplierId: string;
};

type CatalogActionPanelProps = {
  archivedProducts?: CatalogProductOption[];
  authPrincipalKind?: "personal_account" | "pos_staff_manager";
  canExport?: boolean;
  canImport?: boolean;
  canManage?: boolean;
  categories?: CatalogCategoryOption[];
  embedded?: boolean;
  initialDialog?: DialogKey | null;
  initialEntityId?: string;
  labels?: UiTextMap;
  products?: CatalogProductOption[];
  scope: "products" | "categories" | "suppliers";
  selectedShopId?: string;
  suppliers?: CatalogSupplierOption[];
};

type DialogKey =
  | "newProduct"
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

type DialogLeadingAction = {
  label: string;
  onBack: () => void;
};

const CatalogActionLabelsContext = createContext<UiTextMap | undefined>(
  undefined,
);

function useCatalogActionText() {
  const labels = useContext(CatalogActionLabelsContext);

  return useCallback((value: string) => labels?.[value] ?? value, [labels]);
}

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
  "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 shadow-sm hover:border-emerald-400 hover:text-emerald-800";

type CatalogActionIconName =
  | "databaseTransfer"
  | "downloadSpreadsheet"
  | "newProduct"
  | "uploadSpreadsheet";

function CatalogActionIcon({ name }: { name: CatalogActionIconName }) {
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
  const paths: Record<CatalogActionIconName, React.ReactNode> = {
    databaseTransfer: (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        <path d="m9 16 3 3 3-3" />
      </>
    ),
    downloadSpreadsheet: (
      <>
        <path d="M7 3h7l3 3v15H7V3Z" />
        <path d="M14 3v4h4" />
        <path d="M12 9v7" />
        <path d="m9 13 3 3 3-3" />
      </>
    ),
    newProduct: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="M4.5 7.5 12 12l7.5-4.5" />
        <path d="M12 12v9" />
        <path d="M18 3v5" />
        <path d="M15.5 5.5h5" />
      </>
    ),
    uploadSpreadsheet: (
      <>
        <path d="M7 3h7l3 3v15H7V3Z" />
        <path d="M14 3v4h4" />
        <path d="M12 16V9" />
        <path d="m9 12 3-3 3 3" />
      </>
    ),
  };

  return <svg {...commonProps}>{paths[name]}</svg>;
}

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
  closeDisabled = false,
  headerAccessory,
  leadingAction,
  onClose,
  open,
  size = "default",
  title,
}: {
  children: React.ReactNode;
  closeDisabled?: boolean;
  headerAccessory?: React.ReactNode;
  leadingAction?: DialogLeadingAction | null;
  onClose: () => void;
  open: boolean;
  size?: "default" | "wide";
  title: string;
}) {
  const titleId = useId();
  const t = useCatalogActionText();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-zinc-950/35 p-3 sm:p-6">
      <div className="flex min-h-full min-w-0 items-center justify-center">
        <section
          aria-labelledby={titleId}
          aria-modal="true"
          className={`flex max-h-[calc(100vh-64px)] w-full min-w-0 flex-col overflow-hidden rounded-md bg-white shadow-xl ${
            size === "wide"
              ? "sm:w-[min(1500px,calc(100vw-96px))] sm:max-w-none"
              : "max-w-3xl"
          }`}
          role="dialog"
        >
          <div className="sticky top-0 z-20 flex min-w-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {leadingAction ? (
                <button
                  aria-label={leadingAction.label}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  onClick={leadingAction.onBack}
                  title={leadingAction.label}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.25"
                    viewBox="0 0 24 24"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
              ) : null}
              <h2
                className="min-w-0 truncate text-lg font-semibold text-zinc-950"
                id={titleId}
              >
                {t(title)}
              </h2>
            </div>
            <div className="flex min-w-0 shrink items-center justify-end gap-2">
              {headerAccessory}
              <button
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800"
                disabled={closeDisabled}
                onClick={onClose}
                title={closeDisabled ? t("Import in progress") : undefined}
                type="button"
              >
                {t("Close")}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
            {children}
          </div>
        </section>
      </div>
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
            {product.barcode} -{" "}
            {product.productName ??
              product.secondProductName ??
              product.productId}
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

  return (
    <CreatableCatalogCombobox
      className={catalogInputClassName}
      createLabel="Create new supplier"
      defaultId={defaultSupplierId}
      defaultName={defaultSupplier?.name}
      description="Select an existing supplier or type a new supplier name."
      idName="supplierId"
      label="Existing supplier or new supplier name"
      name="supplierName"
      noResultsLabel="No supplier suggestions"
      options={suppliers.map((supplier) => ({
        id: supplier.supplierId,
        name: supplier.name,
      }))}
      suggestionsLabel="Supplier suggestions"
    />
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

  return (
    <CreatableCatalogCombobox
      className={catalogInputClassName}
      createLabel="Create new category"
      defaultId={defaultCategoryId}
      defaultName={defaultCategory?.name}
      description="Select an existing category or type a new category name."
      idName="categoryId"
      label="Existing category or new category name"
      name="categoryName"
      noResultsLabel="No category suggestions"
      options={categories.map((category) => ({
        id: category.categoryId,
        name: category.name,
      }))}
      suggestionsLabel="Category suggestions"
    />
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

function DialogFormShell({ children }: { children: React.ReactNode }) {
  return <section className={catalogActionCardClassName}>{children}</section>;
}

function DialogHeaderFileAccessory({ file }: { file: HeaderFileState | null }) {
  if (!file) {
    return null;
  }

  return (
    <span className="hidden min-w-0 max-w-[min(30vw,22rem)] shrink items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 sm:inline-flex">
      <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-900">
        {file.extension}
      </span>
      <span aria-hidden="true" className="shrink-0 text-zinc-400">
        ·
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
        {file.name}
      </span>
      <span aria-hidden="true" className="shrink-0 text-zinc-400">
        ·
      </span>
      <span className="shrink-0 text-zinc-500">{file.sizeLabel}</span>
    </span>
  );
}

function ProductFields({
  categories,
  suppliers,
}: {
  categories: CatalogCategoryOption[];
  suppliers: CatalogSupplierOption[];
}) {
  return (
    <>
      <TextInput label="Barcode" name="barcode" required />
      <TextInput label="Product name" name="productName" required />
      <TextInput label="Second name" name="secondProductName" />
      <TextInput label="Item number" name="itemNumber" />
      <CreatableSupplierField suppliers={suppliers} />
      <CreatableCategoryField categories={categories} />
      <TextInput label="Purchase price" name="purchasePrice" type="number" />
      <TextInput label="Retail price" name="retailPrice" type="number" />
      <TextInput label="Stock quantity" name="stockQuantity" type="number" />
    </>
  );
}

function SelectedEntitySummary({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950">
      {children}
    </p>
  );
}

function linkedProductsLabel(count: number, t: (value: string) => string) {
  return `${count} ${t("linked products")}`;
}

function ProductsDialogs({
  archivedProducts,
  authPrincipalKind,
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
  authPrincipalKind?: "personal_account" | "pos_staff_manager";
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
  const labels = useContext(CatalogActionLabelsContext);
  const t = useCatalogActionText();
  const auditReasonDescription = "Required for the audit trail.";
  const [supplierImportLeadingAction, setSupplierImportLeadingAction] =
    useState<DialogLeadingAction | null>(null);
  const [supplierImportHeaderFile, setSupplierImportHeaderFile] =
    useState<HeaderFileState | null>(null);
  const [databaseTransferLeadingAction, setDatabaseTransferLeadingAction] =
    useState<DialogLeadingAction | null>(null);
  const [databaseTransferHeaderFile, setDatabaseTransferHeaderFile] =
    useState<HeaderFileState | null>(null);
  const [databaseTransferBusy, setDatabaseTransferBusy] = useState(false);
  const handleSupplierImportLeadingAction = useCallback(
    (nextAction: HeaderBackState | null) => {
      setSupplierImportLeadingAction(nextAction);
    },
    [],
  );
  const handleSupplierImportHeaderFile = useCallback(
    (nextFile: HeaderFileState | null) => {
      setSupplierImportHeaderFile(nextFile);
    },
    [],
  );
  const handleDatabaseTransferLeadingAction = useCallback(
    (nextAction: HeaderBackState | null) => {
      setDatabaseTransferLeadingAction(nextAction);
    },
    [],
  );
  const handleDatabaseTransferHeaderFile = useCallback(
    (nextFile: HeaderFileState | null) => {
      setDatabaseTransferHeaderFile(nextFile);
    },
    [],
  );
  const supplierImportHeaderAccessory = (
    <DialogHeaderFileAccessory file={supplierImportHeaderFile} />
  );
  const databaseTransferHeaderAccessory = (
    <DialogHeaderFileAccessory file={databaseTransferHeaderFile} />
  );
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
            <button className={catalogButtonClassName}>{t("Create product")}</button>
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
                  {t("Archiving")} {selectedProductLabel}
                </SelectedEntitySummary>
              </>
            ) : (
              <ProductPicker
                defaultProductId={selectedEntityId}
                products={products}
              />
            )}
            <TextInput
              description={t(auditReasonDescription)}
              label={t("Reason")}
              maxLength={240}
              name="reason"
              required
            />
            <TextInput
              label={t("Type ARCHIVE as confirmation")}
              name="confirmation"
              required
            />
            <button className={catalogArchiveButtonClassName}>
              {t("Archive product")}
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
          {t("Archived products can be restored with an audit reason.")}
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
                  {t("Restoring")} {selectedProductLabel}
                </SelectedEntitySummary>
              </>
            ) : (
              <ProductPicker
                archivedProducts={archivedProducts}
                defaultProductId={selectedEntityId}
              />
            )}
            <TextInput
              description={t(auditReasonDescription)}
              label={t("Reason")}
              maxLength={240}
              name="reason"
              required
            />
            <TextInput
              label={t("Type RESTORE as confirmation")}
              name="confirmation"
              required
            />
            <button className={catalogRestoreButtonClassName}>
              {t("Restore product")}
            </button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        headerAccessory={supplierImportHeaderAccessory}
        leadingAction={supplierImportLeadingAction}
        onClose={() => setOpenDialog(null)}
        open={openDialog === "importSupplier"}
        size="wide"
        title="Supplier workbook preview"
      >
        {canImport ? (
          <SupplierExcelImportWizard
            authPrincipalKind={authPrincipalKind}
            categories={categories}
            labels={labels}
            onHeaderBackStateChange={handleSupplierImportLeadingAction}
            onHeaderFileStateChange={handleSupplierImportHeaderFile}
            selectedShopId={selectedShopId}
            suppliers={suppliers}
          />
        ) : null}
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "exportCatalog"}
        title="Export catalog Excel"
      >
        {canExport ? (
          <CatalogExportPanel
            labels={labels}
            selectedShopId={selectedShopId}
          />
        ) : null}
      </CatalogDialog>

      <CatalogDialog
        closeDisabled={databaseTransferBusy}
        headerAccessory={databaseTransferHeaderAccessory}
        leadingAction={databaseTransferLeadingAction}
        onClose={() => setOpenDialog(null)}
        open={openDialog === "advancedTransfer"}
        size="wide"
        title="Database transfer"
      >
        {canImport ? (
          <DatabaseTransferPanel
            labels={labels}
            onBusyStateChange={setDatabaseTransferBusy}
            onHeaderBackStateChange={handleDatabaseTransferLeadingAction}
            onHeaderFileStateChange={handleDatabaseTransferHeaderFile}
            selectedShopId={selectedShopId}
          />
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
  const t = useCatalogActionText();
  const auditReasonDescription = "Required for the audit trail.";
  const categoryOptions = categories.map((category) => ({
    id: category.categoryId,
    label: category.name,
  }));
  const selectedCategory = categories.find(
    (category) => category.categoryId === selectedEntityId,
  );
  const replacementCategoryOptions = categories
    .filter((category) => category.categoryId !== selectedCategory?.categoryId)
    .map((category) => ({
      id: category.categoryId,
      label: category.name,
    }));
  const selectedCategoryLinkedProducts =
    selectedCategory?.activeProductsCount ?? 0;

  return (
    <>
      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "newCategory"}
        title={t("Create category")}
      >
        <DialogFormShell>
          <form action={createCategoryAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={t("Category name")} name="name" required />
            <button className={catalogButtonClassName}>
              {t("Create category")}
            </button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "editCategory"}
        title={t("Rename category")}
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
                  {t("Renaming")} {selectedCategory.name} ·{" "}
                  {linkedProductsLabel(selectedCategoryLinkedProducts, t)}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel={t("Select category")}
                label={t("Category")}
                name="categoryId"
                options={categoryOptions}
              />
            )}
            <TextInput
              defaultValue={selectedCategory?.name}
              label={t("Category name")}
              name="name"
              required
            />
            <button className={catalogButtonClassName}>
              {t("Rename category")}
            </button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "archiveCategory"}
        title={t("Delete category")}
      >
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-zinc-600">
            {selectedCategory
              ? `${selectedCategory.name} ${t("is linked to")} ${linkedProductsLabel(
                  selectedCategoryLinkedProducts,
                  t,
                )}.`
              : t("Choose the category to delete.")}
          </p>
          {selectedCategoryLinkedProducts === 0 ? (
            <DialogFormShell>
              <form
                action={archiveCategoryWithStrategyAction}
                className={catalogFormClassName}
              >
                <HiddenShopInput selectedShopId={selectedShopId} />
                <input name="strategy" type="hidden" value="delete_if_unused" />
                {selectedCategory ? (
                  <>
                    <input
                      name="categoryId"
                      type="hidden"
                      value={selectedCategory.categoryId}
                    />
                    <SelectedEntitySummary>
                      {t("Deleting")} {selectedCategory.name}
                    </SelectedEntitySummary>
                  </>
                ) : (
                  <EntityPicker
                    defaultEntityId={selectedEntityId}
                    emptyLabel={t("Select category")}
                    label={t("Category")}
                    name="categoryId"
                    options={categoryOptions}
                  />
                )}
                <TextInput
                  description={t(auditReasonDescription)}
                  label={t("Reason")}
                  maxLength={240}
                  name="reason"
                  required
                />
                <TextInput
                  label="Type ARCHIVE as confirmation"
                  name="confirmation"
                  required
                />
                <button className={catalogArchiveButtonClassName}>
                  {t("Delete category")}
                </button>
              </form>
            </DialogFormShell>
          ) : (
            <>
              <DialogFormShell>
                <form
                  action={archiveCategoryWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="categoryId"
                    type="hidden"
                    value={selectedCategory?.categoryId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="replace_existing" />
                  <SelectedEntitySummary>
                    {t("Replace with existing")} ·{" "}
                    {linkedProductsLabel(selectedCategoryLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <EntityPicker
                    emptyLabel={t("Select category")}
                    label={t("Replacement category")}
                    name="replacementId"
                    options={replacementCategoryOptions}
                  />
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Replace and delete")}
                  </button>
                </form>
              </DialogFormShell>

              <DialogFormShell>
                <form
                  action={archiveCategoryWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="categoryId"
                    type="hidden"
                    value={selectedCategory?.categoryId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="create_replacement" />
                  <SelectedEntitySummary>
                    {t("Create new and replace")} ·{" "}
                    {linkedProductsLabel(selectedCategoryLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <TextInput
                    label={t("Replacement category name")}
                    name="replacementName"
                    required
                  />
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Create, replace and delete")}
                  </button>
                </form>
              </DialogFormShell>

              <DialogFormShell>
                <form
                  action={archiveCategoryWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="categoryId"
                    type="hidden"
                    value={selectedCategory?.categoryId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="clear_assignments" />
                  <SelectedEntitySummary>
                    {t("Remove assignment")} ·{" "}
                    {linkedProductsLabel(selectedCategoryLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Remove assignment and delete")}
                  </button>
                </form>
              </DialogFormShell>
            </>
          )}
        </div>
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
  const t = useCatalogActionText();
  const auditReasonDescription = "Required for the audit trail.";
  const supplierOptions = suppliers.map((supplier) => ({
    id: supplier.supplierId,
    label: supplier.name,
  }));
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.supplierId === selectedEntityId,
  );
  const replacementSupplierOptions = suppliers
    .filter((supplier) => supplier.supplierId !== selectedSupplier?.supplierId)
    .map((supplier) => ({
      id: supplier.supplierId,
      label: supplier.name,
    }));
  const selectedSupplierLinkedProducts =
    selectedSupplier?.activeProductsCount ?? 0;

  return (
    <>
      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "newSupplier"}
        title={t("Create supplier")}
      >
        <DialogFormShell>
          <form action={createSupplierAction} className={catalogFormClassName}>
            <HiddenShopInput selectedShopId={selectedShopId} />
            <TextInput label={t("Supplier name")} name="name" required />
            <button className={catalogButtonClassName}>
              {t("Create supplier")}
            </button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "editSupplier"}
        title={t("Rename supplier")}
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
                  {t("Renaming")} {selectedSupplier.name} ·{" "}
                  {linkedProductsLabel(selectedSupplierLinkedProducts, t)}
                </SelectedEntitySummary>
              </>
            ) : (
              <EntityPicker
                defaultEntityId={selectedEntityId}
                emptyLabel={t("Select supplier")}
                label={t("Supplier")}
                name="supplierId"
                options={supplierOptions}
              />
            )}
            <TextInput
              defaultValue={selectedSupplier?.name}
              label={t("Supplier name")}
              name="name"
              required
            />
            <button className={catalogButtonClassName}>
              {t("Rename supplier")}
            </button>
          </form>
        </DialogFormShell>
      </CatalogDialog>

      <CatalogDialog
        onClose={() => setOpenDialog(null)}
        open={openDialog === "archiveSupplier"}
        title={t("Delete supplier")}
      >
        <div className="grid gap-3">
          <p className="text-sm leading-6 text-zinc-600">
            {selectedSupplier
              ? `${selectedSupplier.name} ${t("is linked to")} ${linkedProductsLabel(
                  selectedSupplierLinkedProducts,
                  t,
                )}.`
              : t("Choose the supplier to delete.")}
          </p>
          {selectedSupplierLinkedProducts === 0 ? (
            <DialogFormShell>
              <form
                action={archiveSupplierWithStrategyAction}
                className={catalogFormClassName}
              >
                <HiddenShopInput selectedShopId={selectedShopId} />
                <input name="strategy" type="hidden" value="delete_if_unused" />
                {selectedSupplier ? (
                  <>
                    <input
                      name="supplierId"
                      type="hidden"
                      value={selectedSupplier.supplierId}
                    />
                    <SelectedEntitySummary>
                      {t("Deleting")} {selectedSupplier.name}
                    </SelectedEntitySummary>
                  </>
                ) : (
                  <EntityPicker
                    defaultEntityId={selectedEntityId}
                    emptyLabel={t("Select supplier")}
                    label={t("Supplier")}
                    name="supplierId"
                    options={supplierOptions}
                  />
                )}
                <TextInput
                  description={t(auditReasonDescription)}
                  label={t("Reason")}
                  maxLength={240}
                  name="reason"
                  required
                />
                <TextInput
                  label="Type ARCHIVE as confirmation"
                  name="confirmation"
                  required
                />
                <button className={catalogArchiveButtonClassName}>
                  {t("Delete supplier")}
                </button>
              </form>
            </DialogFormShell>
          ) : (
            <>
              <DialogFormShell>
                <form
                  action={archiveSupplierWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="supplierId"
                    type="hidden"
                    value={selectedSupplier?.supplierId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="replace_existing" />
                  <SelectedEntitySummary>
                    {t("Replace with existing")} ·{" "}
                    {linkedProductsLabel(selectedSupplierLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <EntityPicker
                    emptyLabel={t("Select supplier")}
                    label={t("Replacement supplier")}
                    name="replacementId"
                    options={replacementSupplierOptions}
                  />
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Replace and delete")}
                  </button>
                </form>
              </DialogFormShell>

              <DialogFormShell>
                <form
                  action={archiveSupplierWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="supplierId"
                    type="hidden"
                    value={selectedSupplier?.supplierId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="create_replacement" />
                  <SelectedEntitySummary>
                    {t("Create new and replace")} ·{" "}
                    {linkedProductsLabel(selectedSupplierLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <TextInput
                    label={t("Replacement supplier name")}
                    name="replacementName"
                    required
                  />
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Create, replace and delete")}
                  </button>
                </form>
              </DialogFormShell>

              <DialogFormShell>
                <form
                  action={archiveSupplierWithStrategyAction}
                  className={catalogFormClassName}
                >
                  <HiddenShopInput selectedShopId={selectedShopId} />
                  <input
                    name="supplierId"
                    type="hidden"
                    value={selectedSupplier?.supplierId ?? ""}
                  />
                  <input name="strategy" type="hidden" value="clear_assignments" />
                  <SelectedEntitySummary>
                    {t("Remove assignment")} ·{" "}
                    {linkedProductsLabel(selectedSupplierLinkedProducts, t)}
                  </SelectedEntitySummary>
                  <TextInput
                    description={t(auditReasonDescription)}
                    label={t("Reason")}
                    maxLength={240}
                    name="reason"
                    required
                  />
                  <TextInput
                    label="Type ARCHIVE as confirmation"
                    name="confirmation"
                    required
                  />
                  <button className={catalogArchiveButtonClassName}>
                    {t("Remove assignment and delete")}
                  </button>
                </form>
              </DialogFormShell>
            </>
          )}
        </div>
      </CatalogDialog>
    </>
  );
}

function ToolbarButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: CatalogActionIconName;
  onClick: () => void;
}) {
  return (
    <button
      className={catalogToolbarButtonClassName}
      onClick={onClick}
      type="button"
    >
      {icon ? <CatalogActionIcon name={icon} /> : null}
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
  authPrincipalKind,
  canExport = false,
  canImport = false,
  canManage = true,
  categories = [],
  embedded = false,
  initialDialog = null,
  initialEntityId = "",
  labels,
  products = [],
  scope,
  selectedShopId,
  suppliers = [],
}: CatalogActionPanelProps) {
  const [openDialog, setOpenDialog] = useState<DialogKey | null>(initialDialog);
  const t = useCallback((value: string) => labels?.[value] ?? value, [labels]);
  const panelClassName = embedded
    ? "grid gap-3"
    : `${SHOP_ADMIN_CONTENT_FRAME_CLASS} grid gap-3`;

  return (
    <CatalogActionLabelsContext.Provider value={labels}>
    <section className={panelClassName}>
      <div className="flex min-w-0 flex-wrap gap-2 rounded-md border border-zinc-200 bg-white p-3 shadow-sm">
        {scope === "products" ? (
          <>
            {canManage ? (
              <ToolbarButton
                icon="newProduct"
                onClick={() => setOpenDialog("newProduct")}
              >
                {t("New product")}
              </ToolbarButton>
            ) : null}
            {canImport ? (
              <>
                <ToolbarButton
                  icon="uploadSpreadsheet"
                  onClick={() => setOpenDialog("importSupplier")}
                >
                  {t("Import supplier Excel")}
                </ToolbarButton>
              </>
            ) : null}
            {canExport ? (
              <>
                <ToolbarButton
                  icon="downloadSpreadsheet"
                  onClick={() => setOpenDialog("exportCatalog")}
                >
                  {t("Export catalog Excel")}
                </ToolbarButton>
              </>
            ) : null}
            {canImport ? (
              <>
                <ToolbarButton
                  icon="databaseTransfer"
                  onClick={() => setOpenDialog("advancedTransfer")}
                >
                  {t("Database transfer")}
                </ToolbarButton>
              </>
            ) : null}
          </>
        ) : null}

        {scope === "categories" ? (
          <ToolbarButton onClick={() => setOpenDialog("newCategory")}>
            {t("Create category")}
          </ToolbarButton>
        ) : null}

        {scope === "suppliers" ? (
          <ToolbarButton onClick={() => setOpenDialog("newSupplier")}>
            {t("Create supplier")}
          </ToolbarButton>
        ) : null}
      </div>

      {scope === "products" ? (
        <ProductsDialogs
          archivedProducts={archivedProducts}
          authPrincipalKind={authPrincipalKind}
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
    </CatalogActionLabelsContext.Provider>
  );
}
