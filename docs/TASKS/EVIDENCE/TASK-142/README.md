# TASK-142 Evidence - CATALOG-TEXT-001

Evidence redatta per `TASK-142 - Cross-platform catalog text integrity`.

Regole:

- non registrare raw catalog values, workbook reali, payload completi, token,
  credenziali, password o secret;
- per record staging usare soltanto conteggi, campo, classe di codepoint e ID
  redatto/hash;
- distinguere sempre `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` e `NOT_RUN`;
- production e Win7POS restano `NOT_MODIFIED`.

## Baseline

- Repository: `XNIW/merchandise-control-admin-web`
- Baseline: `54889a68a65cec39764bbb5479574e942f4d54f1`
- Branch: `codex/catalog-text-integrity-admin-20260727`
- Coordination key: `CATALOG-TEXT-001`
- Android task/PR: `TASK-140` / `PENDING_PRE_REVIEW`
- iOS task/PR: `TASK-140` / `PENDING_PRE_REVIEW`

## Evidence ledger

| Gate | Stato | Evidence |
|---|---|---|
| Baseline Git/GitHub | `PASS` | main e origin/main coincidono; ultimi 8 commit letti |
| Target staging allowlisted | `PASS` | unico progetto connector `merchandisecontrol-dev`, healthy, PostgreSQL 17 |
| Audit preliminare display/strict | `PASS_WITH_FINDINGS` | 356 campi display canonicalizzabili; zero classi proibite/vuote/over-limit; zero strict invalidi |
| Contract/fixture | `PASS` | byte-identica nei tre repository; SHA-256 `139d63eedea47b54bb63a9289bef5fc6f7372668f209aac7753b586da7ccd9f8` |
| Focused foundation | `PASS` | pre-review 25/25; post-fix 30/30; delta finale 29/29, zero skip/failure |
| Foundation completa | `PASS` | snapshot pulito Win7POS `origin/main`; zero failure |
| Verify | `PASS` | lint, typecheck, security scan e Next.js production build |
| Cloudflare build | `PASS` | OpenNext bundle generato |
| i18n / paging / diff | `PASS` | i18n contract, paging statico e `git diff --check` |
| Playwright locale | `PASS` | scenario manager Dingli-like 1/1; canonicalizzazione, warning, apply e readback |
| Supabase reset/lint | `PASS` | reset isolato da zero; lint livello error senza finding |
| Migration/pgTAP | `PASS_LOCAL` | post-fix 14 file, 975 test, zero failure |
| Staging backup/repair | `NOT_RUN_PRE_MERGE` | attende review, CI e merge dei tre repository |
| Cross-platform acceptance | `NOT_RUN_PRE_MERGE` | attende deploy/migration/repair staging |
| Independent review | `APPROVED_PRE_PR` | SHA finale codice `3f7bedc3`: P0/P1/P2/P3 `0/0/0/0` |
| PR/CI/merge | `NOT_RUN_PRE_PR` | review Admin verde; attende coordinazione dei tre repository |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-142-cross-platform-catalog-text-integrity.md`
- `docs/TASKS/EVIDENCE/TASK-142/README.md`
- `docs/TASKS/EVIDENCE/TASK-142/entry-point-matrix.md`
- `docs/TASKS/TASK-142-cross-platform-catalog-text-integrity.md`
- `docs/contracts/catalog-text-policy-v1.md`
- `scripts/testing/run-playwright-target.mjs`
- `scripts/testing/target-guardrails.mjs`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/actions.ts`
- `src/i18n/dictionaries.ts`
- `src/lib/catalog-text-policy.ts`
- `src/server/pos-auth/catalog-import-sync.ts`
- `src/server/pos-auth/catalog-pull.ts`
- `src/server/shop-admin/catalog-import-contract.ts`
- `src/server/shop-admin/catalog-mutations.ts`
- `src/server/shop-admin/import-export-workbook.ts`
- `supabase/migrations/20260727055520_task_142_catalog_text_policy_v1.sql`
- `supabase/tests/cross_platform_sync_recovery_contract.sql`
- `supabase/tests/task_142_catalog_text_policy_v1.sql`
- `tests/e2e/task-060-supplier-excel-preview.spec.ts`
- `tests/fixtures/catalog-text-policy-v1.json`
- `tests/foundation/task-028-catalog-crud-import-export-win7pos-e2e.test.mjs`
- `tests/foundation/task-032-excel-hardening.test.mjs`
- `tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs`
- `tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- `tests/foundation/task-142-catalog-text-policy.test.mjs`

## Note sui run

- Il primo run foundation completo ha esposto tre fixture storiche senza prezzo
  retail per nuovi prodotti; le fixture sono state rese conformi al contratto
  già esistente e il rerun completo è passato.
- Il primo run pgTAP completo ha usato una copia isolata non aggiornata del test
  storico; il mismatch è stato provato con `cmp`, il file è stato sincronizzato,
  il database è stato resettato e il rerun completo ha chiuso 973/973 test.
- Il comando aggregato ha richiamato per errore uno script npm inesistente
  `check:diff`; non viene registrato come gate. Il controllo corretto
  `git diff --check` è passato.
- Nessun valore catalogo reale o carattere invisibile raw è registrato in
  questa evidence.

## Review indipendente e fix

Finding sullo SHA `5722b274`:

- `P1` collisioni barcode/item number dopo trim e case-fold nel workbook;
- `P1` restore di record legacy fuori dal trigger testuale;
- `P2` identity PriceHistory normalizzate prima della validazione strict;
- `P2` POS import senza collision scan item number e con case-fold barcode;
- `P3` CA-05/CA-06 dichiarati prima della copertura dei consumer reali.

Fix applicati e rereviewati:

- provenienza raw + canonical conservata per gli identity field del workbook;
  collisioni distinte bloccano preview e apply, confronto case-sensitive;
- trigger DB esteso a `deleted_at` e `shop_id` per canonicalizzare o rifiutare
  atomicamente un restore legacy;
- PriceHistory usa il validator strict prima di qualsiasi trasformazione;
- POS import verifica collisioni raw→canonical barcode/item number e non
  applica case folding;
- test consumer-level e restore-boundary pgTAP aggiunti;
- follow-up `3f7bedc3`: raw identity degli adjustment preservata separatamente
  dal canonical in entrambi i percorsi, con test collisioni barcode/item
  introdotte dall'edit; parser POS reale testato per collisioni e identità
  case-distinct;
- rereview finale `APPROVED_PRE_PR`, P0/P1/P2/P3 `0/0/0/0`.

## Rischi residui

- Il validator Win7POS attuale è meno severo della policy richiesta per
  zero-width/BOM/bidi; il contratto v1 deve restare più severo e compatibile.
- `item_number` contiene gruppi duplicati preesistenti, ma l'audit non rileva
  valori trim-only: la policy non deve fonderli o trasformarli.
- Backup, repair e acceptance staging devono attendere migration review e gate
  locali verdi.
- Il public staging non è ancora stato mutato; backup, migration, repair,
  deploy, acceptance e cleanup sono obbligatori dopo i tre merge.
- P0/P1/P2 Admin aperti: `0/0/0`.
