# TASK-138 - Backend locale e fixture multi-ruolo

Data: `2026-07-18`.

## Target e reset

Verifica pre-reset:

```text
supabase/config.toml project_id = MerchandiseControlSupabase
API port = 54321
Postgres port = 54322
container supabase_db_MerchandiseControlSupabase = healthy
container label project = MerchandiseControlSupabase
```

Il secondo database Docker `codex-task137-price-validation` era distinto e non
e stato toccato. Nessun runner Next/Playwright/Gradle/Xcodebuild concorrente era
attivo.

Comando autorizzato:

```text
supabase db reset --local
```

Risultato:

```text
Finished supabase db reset on branch HEAD.
```

Sono state applicate tutte le migration fino a:

- `20260717072959_task_137_product_catalog_images.sql`;
- `20260717073607_task_137_product_catalog_images_sync_fix.sql`;
- `20260717170000_task_137_product_image_cleanup_hardening.sql`;
- `20260717200129_task_137_product_image_denied_audit_guard.sql`;
- `20260717235400_task_137_release_catalog_security_hardening.sql`;
- `20260717235500_task_137_release_pos_financial_hardening.sql`.

Production e il database secondario non sono stati usati.

## Gate backend

### pgTAP

File:

- `task_137_product_catalog_images.sql`;
- `task_137_product_image_denied_audit_regression.sql`;
- `task_137_release_catalog_security.sql`.

Risultato:

```text
Files=3, Tests=149
All tests successful.
Result: PASS
```

### Contratto foundation

```text
node --test tests/foundation/task-137-product-catalog-images.test.mjs
tests 20
pass 20
fail 0
```

### Route e lifecycle post-reset

```text
denied cross-shop routes: 1 passed (10.5s)
upload/no-op/offline/remove/cleanup: 1 passed (12.7s)
```

## Fixture persistente TASK-138

Nuovo harness:

`tests/e2e/task-138-product-images-shared-fixture-local.spec.ts`.

Il primo run si e fermato dentro la transazione per il profilo gia creato dal
trigger auth; cleanup automatico eseguito. Il secondo ha rilevato correttamente
che il cashier e negato anche in lettura immagini; e stata corretta
l'aspettativa del test, non il backend. Entrambi i run falliti hanno lasciato
zero fixture TASK-138 e nessun manifest.

Run seed finale:

```text
1 passed (8.1s)
test runtime 5.6s
```

Run status indipendente:

```text
manifest mode=600
1 passed (2.7s)
```

Stato redatto verificato:

- uno shop locale sintetico;
- membership `shop_owner`, `shop_manager`, `viewer`;
- staff `cashier`;
- Product A: versione corrente nulla, zero request/cache immagine nel browser;
- Product B: una versione ready, due oggetti (`main`, `thumb`), main visibile
  nel dettaglio e thumb visibile in lista;
- manager: intent stesso checksum `noop` con HTTP 200;
- viewer: write HTTP 403, read HTTP 200;
- cashier: write e read HTTP 403;
- credenziali generate casualmente, conservate soltanto nel manifest
  temporaneo `0600`; token e signed URL non persistiti o stampati.

La fixture resta attiva soltanto per i run cross-client serializzati. Il mode
`cleanup` dello stesso harness la rimuove a fine task.

## Gate

Verdict backend locale: `PASS`.

Le lane Admin, Android e iOS sono sbloccate. Staging/live resta
`BLOCKED_ENV_DNS` finche non esiste rete e target non-production verificabile.
