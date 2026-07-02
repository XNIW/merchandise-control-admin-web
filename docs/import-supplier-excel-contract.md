# Supplier Excel Import Contract

Android is the canonical source for supplier Excel import behavior. Import algorithms, previews, fixtures, and tests must use only these public keys.

Required UX workflow:
- Step 1: choose a supplier `.xlsx`/`.xls` file.
- Step 2: analyze columns with the Android algorithm, show `headerSource`, allow manual column override, and allow disabling wrong columns.
- Step 3: show an editable product/price preview before apply. Users must be able to edit `purchasePrice`, `retailPrice`, `quantity`, `supplier`, and `category` where the platform UI supports those fields.
- Bulk price helper: calculate `retailPrice` from `purchasePrice` with markup percent, rounding to 10/50/100 CLP, and an option to apply only when `retailPrice` is empty.
- `purchasePrice` must never silently auto-fill `retailPrice`. New products without `retailPrice` must be blocked or require an explicit user edit/helper action before apply.

Required/core keys:
- `barcode`
- `productName`
- `itemNumber`
- `purchasePrice`
- `retailPrice`
- `quantity`
- `supplier`
- `category`
- `secondProductName`

Optional/extra keys:
- `totalPrice`
- `rowNumber`
- `discount`
- `discountedPrice`
- `oldPurchasePrice`
- `oldRetailPrice`
- `realQuantity`
- `complete`

Forbidden as public import keys: `stockQuantity`, `supplierName`, `categoryName`, `articleCode`, `unitPrice`, `name`, `name2`, `cost`, `prevPurchase`, `prevRetail`. Legacy files may use some of these as aliases, but they must normalize to canonical keys before preview/import contract output.

Header detection:
- Normalize headers by trim, lowercase invariant, remove accents/diacritics, remove spaces/underscores, and remove non-alphanumeric characters.
- Detect the first data row with `numericCount >= 3` and `textCount >= 1`.
- If data starts after row 0, the previous row is the header. Otherwise generate `Column 1`, `Column 2`, etc.
- Preserve per-column `headerSource`: `alias`, `pattern`, `generated`, or `unknown`.
- Missing required columns `barcode`, `productName`, and `purchasePrice` are generated as empty columns.

Pattern recognition:
- `barcode`: 8/12/13 digits.
- `itemNumber`: length 4..12 with at least one digit or letter.
- `quantity` and `purchasePrice`: positive numeric values in at least 70% of rows.
- `totalPrice`: `quantity * purchasePrice` within 10% in at least 70% of rows.
- `productName`: text length at least 3 in at least 50% of rows.
- Headerless files also infer `retailPrice`, `secondProductName`, `supplier`, `discount`, `discountedPrice`, and `rowNumber`.

Rows and numbers:
- Summary rows are filtered when they contain any Android summary token and lack a plausible product identity: `合计`, `总计`, `小计`, `汇总`, `合計`, `總計`, `小計`, `總結`, `总额`, `subtotal`, `total`, `totale`, `tot.`, `sommario`, `resumen`, `sum`.
- `parseNumber` examples: `1.234,56 -> 1234.56`, `1,234.56 -> 1234.56`, `1234,56 -> 1234.56`, `1234 -> 1234`.
- Duplicate barcode rule: keep the last occurrence, warn with duplicate row numbers, and do not sum quantity.

Import analysis:
- `newProducts`
- `updatedProducts`
- `warnings`
- `errors`
- `canApply = errors empty`

Boundary mappings:
- Android: `quantity -> stockQuantity` and other canonical keys map to Room `Product` fields only inside analyzer/repository apply.
- iOS: `quantity -> stockQuantity` and other canonical keys map to `ProductDraft`/SwiftData fields only inside `ProductImportCore`.
- Admin: canonical preview/import rows map to API/database schema only inside server apply/merge functions.
- Win7POS: `itemNumber -> ImportRow.ArticleCode / product_meta.article_code`, `productName -> ImportRow.Name / products.name`, `secondProductName -> ImportRow.Name2 / product_meta.name2`, `retailPrice -> ImportRow.UnitPrice / products.unitPrice`, `purchasePrice -> ImportRow.Cost / product_meta.purchase_price`, `quantity -> ImportRow.Stock / product_meta.stock_qty`, `supplier -> SupplierName` inside the adapter, `category -> CategoryName` inside the adapter.

Operational policy:
- Files that parse cleanly and have retail prices are `ready_to_apply`.
- Files with wrong or ambiguous detection are valid Step 2 states: the user must map the source column to the canonical key or disable the wrong column, then rerun preview.
- Files with new products and empty `retailPrice` are valid Step 3 states: the user must type `retailPrice` or use the bulk helper before apply.
- Rows without barcode are business data issues: the user must correct or remove those rows before apply.
- Admin web import is for normal/smaller workbooks. Workbooks over the Admin upload limit must show a clear message telling the user to use Win7POS supplier Excel import or split the workbook. Win7POS offline import is the recommended route for large/complex supplier files and store-side offline operation.

Evidence:
- Admin: `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs` loads `tests/fixtures/supplier-import/android-canonical-sample.json` and asserts metadata/headerless/IT/ES/ZH fixture cases, canonical header, `headerSource`, duplicate warning rows, parseNumber parity, missing-new-`retailPrice` blocker, `canApply`, and public preview field names.
- Admin real-file policy: `SUPPLIER_EXCEL_SMOKE_DIR=<folder> node --test tests/foundation/supplier-excel-drive-smoke.mjs` exercises all Drive workbooks available locally, accepts parser/preview success, and expects the explicit `file_too_large` route for over-limit workbooks.
- Shared fixture: `tests/fixtures/supplier-import/android-canonical-sample.json`.
