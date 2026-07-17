# 01 - Schema, RLS e grant

## Migration locali

- `20260717072959_task_137_product_catalog_images.sql`;
- `20260717073607_task_137_product_catalog_images_sync_fix.sql`;
- `20260717170000_task_137_product_image_cleanup_hardening.sql`.

Applicate esclusivamente allo stack Supabase locale. Il dry-run successivo e
risultato vuoto. Staging e production non sono stati usati.

## Modello finale

- `public.inventory_product_image_versions`: lifecycle, path server-only,
  metadata attesi/verificati, actor, audit/cleanup e versione precedente;
- `inventory_products.primary_image_version_id` e
  `primary_image_updated_at`: unico riferimento sincronizzato;
- bucket `product-images`: `public=false`, `image/jpeg`, max `1 MiB` per
  oggetto;
- main max `1600 px` e `1 MiB`; thumb max `384 px` e `90 KiB`;
- tabella lifecycle con RLS forzata e nessuna lettura/mutazione diretta per
  `authenticated`/`anon`;
- RPC lifecycle eseguibili solo da `service_role`;
- nessuna policy Storage INSERT/UPDATE/DELETE per client autenticati;
- SELECT Storage limitata a oggetto corrente, exact path e membership attiva.

## Matrice autorizzazioni provata

- owner e manager attivi: write consentita;
- viewer: sola lettura privata corrente, write negata;
- cashier: nessun grant immagini;
- membership sospesa/revocata e cross-shop: negate;
- platform admin: solo boundary server con actor kind esplicito e audit;
- update client del riferimento immagine prodotto: trigger di guardia nega;
- normale update business del prodotto: resta consentito.

## Risultati

- pgTAP TASK-137 post-hardening: `76/76 PASS`;
- test foundation schema/contratto post-hardening: `19/19 PASS`;
- bucket privato, limite, MIME, grant, RLS, exact path, no-op, duplicate,
  replace, stale remove, remove, cleanup e redaction verificati;
- nessuna migration production e nessuna modifica staging.
