# Android database export format

Fonte auditata: repository Android read-only
`/Users/minxiang/AndroidStudioProjects/MerchandiseControlSplitView`.

## File Android letti

- `app/src/main/java/com/example/merchandisecontrolsplitview/util/DatabaseExportWriter.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/util/FullDbImportStreaming.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/util/DatabaseExportWriterTest.kt`
- `app/src/test/java/com/example/merchandisecontrolsplitview/util/FullDbExportImportRoundTripTest.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/Product.kt`
- `app/src/main/java/com/example/merchandisecontrolsplitview/data/ProductPrice.kt`
- `app/src/main/res/values-es/strings.xml`
- `app/src/main/res/values-en/strings.xml`
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/values-zh/strings.xml`

## Workbook

Android scrive workbook `.xlsx` con Apache POI `SXSSFWorkbook`.

Sheet tecnici:

- `Products`
- `Suppliers`
- `Categories`
- `PriceHistory`

Export completo: tutti e quattro gli sheet.

Export parziale: qualunque selezione non vuota. Il filename parziale usa
`Database_partial_<sigils>_yyyy_MM_dd_HH-mm-ss.xlsx`, dove i sigil sono in
ordine sheet: `P`, `S`, `C`, `PH`.

## Products

Gli header sono localizzati. Il sample spagnolo osservato corrisponde a
`values-es/strings.xml`:

- `Código de barras`
- `Código del artículo`
- `Nombre del producto`
- `Segundo nombre del producto`
- `Precio de compra`
- `Precio de venta`
- `Compra (Antiguo)`
- `Venta (Antiguo)`
- `Proveedor`
- `Categoría`
- `Existencias`

Mapping Admin Web:

- `Código de barras` -> `inventory_products.barcode`
- `Código del artículo` -> `item_number`
- `Nombre del producto` -> `product_name`
- `Segundo nombre del producto` -> `second_product_name`
- `Precio de compra` -> `purchase_price`
- `Precio de venta` -> `retail_price`
- `Proveedor` -> supplier name shop-scoped
- `Categoría` -> category name shop-scoped
- `Existencias` -> `stock_quantity`

`Compra (Antiguo)` e `Venta (Antiguo)` sono valori storici derivati dal price
summary Android (`prevPurchase` / `prevRetail`). Admin Web non ha colonne
prodotto dedicate per questi valori nel mapping corrente; lo storico reale va
importato da `PriceHistory`.

Prezzi e quantita sono scritti come `Double`. Non applicare conversioni
centesimi/minor units.

## Suppliers

Header:

- `id`
- `name`

`id` e un source id Android, non una primary key Admin Web. Admin Web risolve o
crea il supplier per nome dentro lo shop verificato.

## Categories

Header:

- `id`
- `name`

`id` e un source id Android, non una primary key Admin Web. Admin Web risolve o
crea la category per nome dentro lo shop verificato.

## PriceHistory

Header:

- `productBarcode`
- `timestamp`
- `type`
- `oldPrice`
- `newPrice`
- `source`

Semantica verificata:

- `productBarcode` collega la riga a `Products.Código de barras` o a un prodotto
  gia esistente nello shop Admin Web.
- `timestamp` e stringa Room `yyyy-MM-dd HH:mm:ss`.
- `type` e `purchase` o `retail` in export Android; Admin Web normalizza a
  `PURCHASE` / `RETAIL` per la RPC.
- `oldPrice` e calcolato durante export come prezzo precedente nello stesso
  gruppo `productBarcode|type`; la prima riga del gruppo e vuota. Android import
  non lo usa come sorgente autorevole.
- `newPrice` e il prezzo effettivo importabile.
- `source` e opzionale, per esempio `IMPORT`, `MANUAL` o `SYNC`.

Admin Web importa `PriceHistory` tramite RPC reale
`shop_catalog_import_price_history(p_shop_id, p_prices)`. La RPC verifica che
il prodotto risolto appartenga allo shop selezionato/mappato e fa upsert sulla
chiave reale del database `owner_user_id + product_id + type + effective_at`.

## Export parziali supportati

Admin Web deve accettare workbook con:

- solo `Products`
- solo `Suppliers`
- solo `Categories`
- solo `PriceHistory`
- qualunque combinazione non vuota dei quattro sheet

Per `PriceHistory` senza `Products`, il prodotto deve essere risolvibile nel
catalogo shop-scoped esistente tramite `productBarcode`; in caso contrario la
riga e bloccata.

## Guardrail Admin Web

- Parsing workbook server-side.
- Autorizzazione shop-scoped prima di leggere `request.formData()` e bytes file.
- `shop_id` da query/form e solo selezione: viene verificato server-side.
- Preview-first con digest legato a shop/mapping.
- Limiti correnti: `MAX_IMPORT_BYTES = 5 MB`, `MAX_IMPORT_ROWS = 80_000`,
  preview prodotti bounded a 500 righe.
- Formula injection: celle testuali esportate/mostrate vengono sanificate con
  prefissi `=`, `+`, `-`, `@`, tab e carriage return.
- Nessun workbook reale o dato business reale va committato nel repository.
