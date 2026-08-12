import {
  CATALOG_TEXT_LIMITS,
  canonicalizeCatalogDisplayText,
  validateCatalogIdentityText,
} from "./catalog-text-policy.ts";
import { parseLocalizedNumberText } from "./localized-number.ts";

export type ProductDraft = {
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

type ProductDraftSource = {
  barcode: string;
  categoryName: string | null;
  itemNumber: string | null;
  productName: string | null;
  purchasePrice: number | null;
  retailPrice: number | null;
  secondProductName: string | null;
  stockQuantity: number | null;
  supplierName: string | null;
};

function numberInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export function blankProductDraft(): ProductDraft {
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

export function productDraftFromProduct(
  product: ProductDraftSource,
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

function canonicalTextValue(
  value: string,
  options: { maxLength: number; required: boolean },
  caseInsensitive = false,
) {
  const result = canonicalizeCatalogDisplayText(value, options);

  if (result.status === "rejected") {
    return `rejected:${value}`;
  }

  return `accepted:${caseInsensitive ? result.value.toLowerCase() : result.value}`;
}

function canonicalIdentityValue(
  value: string,
  options: { maxLength: number; required: boolean },
) {
  const result = validateCatalogIdentityText(value, options);

  return result.status === "rejected"
    ? `rejected:${value}`
    : `accepted:${result.value}`;
}

function canonicalNumberValue(value: string) {
  if (!value.trim()) {
    return "empty";
  }

  const parsed = parseLocalizedNumberText(value);

  return Number.isFinite(parsed) ? `number:${String(parsed)}` : `rejected:${value}`;
}

function canonicalProductDraftField(
  field: keyof ProductDraft,
  value: string,
) {
  switch (field) {
    case "barcode":
      return canonicalIdentityValue(value, {
        maxLength: CATALOG_TEXT_LIMITS.barcode,
        required: true,
      });
    case "itemNumber":
      return canonicalIdentityValue(value, {
        maxLength: CATALOG_TEXT_LIMITS.itemNumber,
        required: false,
      });
    case "productName":
      return canonicalTextValue(value, {
        maxLength: CATALOG_TEXT_LIMITS.productName,
        required: false,
      });
    case "secondProductName":
      return canonicalTextValue(value, {
        maxLength: CATALOG_TEXT_LIMITS.secondProductName,
        required: false,
      });
    case "categoryName":
      return canonicalTextValue(
        value,
        { maxLength: CATALOG_TEXT_LIMITS.categoryName, required: false },
        true,
      );
    case "supplierName":
      return canonicalTextValue(
        value,
        { maxLength: CATALOG_TEXT_LIMITS.supplierName, required: false },
        true,
      );
    case "purchasePrice":
    case "retailPrice":
    case "stockQuantity":
      return canonicalNumberValue(value);
  }
}

function locallyChanged(
  field: keyof ProductDraft,
  draft: ProductDraft,
  base: ProductDraft,
) {
  return canonicalProductDraftField(field, draft[field]) !==
    canonicalProductDraftField(field, base[field]);
}

export function rebaseProductDraft(
  baseProduct: ProductDraftSource,
  latestProduct: ProductDraftSource,
  draft: ProductDraft,
): ProductDraft {
  const base = productDraftFromProduct(baseProduct);
  const latest = productDraftFromProduct(latestProduct);
  const rebased = { ...latest };

  for (const field of Object.keys(rebased) as Array<keyof ProductDraft>) {
    if (locallyChanged(field, draft, base)) {
      rebased[field] = draft[field];
    }
  }

  return rebased;
}

export function areProductDraftsEqual(
  left: ProductDraft,
  right: ProductDraft,
) {
  return (Object.keys(left) as Array<keyof ProductDraft>).every(
    (field) => left[field] === right[field],
  );
}
