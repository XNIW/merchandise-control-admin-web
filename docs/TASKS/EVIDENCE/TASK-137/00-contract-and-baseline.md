# 00 - Contratto e baseline

Data esecuzione: `2026-07-16` / `2026-07-17`.

## Stato iniziale

- nei tre client non esistevano campo immagine, bucket applicativo o pipeline;
- il prodotto cloud reale e `public.inventory_products.id` UUID;
- Android usa `ProductRemoteRef`, iOS `Product.remoteID`;
- `catalog_changed` supportava gia il targeted pull con `product_ids`;
- Admin e iOS erano dirty per task precedenti; Android e Win7POS erano puliti;
- Win7POS era ed e fuori scope.

`TASK-137` e stato scelto perche era il primo ID globale libero dopo TASK-136.
La fonte canonica resta il repository Admin Web; Android e iOS contengono un
mirror di governance.

## Contratto congelato

- bucket privato `product-images`;
- una sola versione primaria corrente per prodotto;
- oggetti immutabili `main.jpg` e `thumb.jpg` sotto path opachi e versionati;
- lifecycle `pending -> ready -> superseded|removed|failed`;
- intent server-side, due PUT firmati diretti, finalize atomico;
- database e sync contengono solo UUID versione e timestamp corrente;
- signed URL, token, byte, Base64, EXIF e path locale non vengono persistiti;
- cache `(account_scope, shop, product, version, variant)`;
- upload online-only, fuori dalla normale outbox;
- nessuna nuova dipendenza e nessuna feature Storage a pagamento.

## Flusso effettivo

```text
client preprocessa main+thumb
        |
        v
POST intent -- auth/shop/permission/checksum --> pending + 2 signed PUT exact-path
        |
        v
PUT main + PUT thumb direttamente al bucket privato
        |
        v
POST finalize -- verifica byte/JPEG/dimensioni/SHA/APP1 --> transazione
        |
        +--> current version sul prodotto
        +--> lifecycle precedente superseded
        +--> audit redatto
        +--> un catalog_changed con product_ids
```

Gli hash della baseline dei file sovrapposti sono conservati nel
`README.md` di questa directory. Nessun file preesistente e stato ripristinato
o sovrascritto fuori dal delta TASK-137.
