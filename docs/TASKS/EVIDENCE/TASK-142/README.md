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
- Branch implementazione: `codex/catalog-text-integrity-admin-20260727`
- Branch closeout: `codex/catalog-text-integrity-closeout-admin-20260727`
- Branch chiusura: `codex/catalog-text-integrity-done-admin-20260727`
- Coordination key: `CATALOG-TEXT-001`
- Admin PR: [#42](https://github.com/XNIW/merchandise-control-admin-web/pull/42),
  merge normale `d52e23da689a713dc55c9528e06b4c68913ef76a`
- Android task/PR: `TASK-140` /
  [#3](https://github.com/XNIW/MerchandiseControlSplitView/pull/3), merge
  normale `ec858d0bd75b9d06ff7cbabeebcca9b25be21070`
- iOS task/PR: `TASK-140` /
  [#1](https://github.com/XNIW/iOSMerchandiseControl/pull/1), merge normale
  `712689dd917125c9c656b8cc48e7c392c87174fd`

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
| Staging backup/repair | `PASS` | backup gzip `0600` verificato; migration remota `20260727084040`; repair atomico esatto `345`; invalidi post-repair `0`; invarianti preservati |
| Cross-platform acceptance | `PASS` | Admin UI pubblica, Android API 35 e iOS Simulator: write/read bidirezionali, prezzi e strict identity verificati; negative Admin 4/4 bloccate senza write |
| Win7POS-equivalent paging | `PASS` | full refresh read-only `71/102/19.763/41.228`; snapshot pinned, duplicate ID/cursor `0`, policy invalid `0`; drain tombstone valido |
| Fixture cleanup | `PASS` | rimossi per ID esatti `3` prodotti, `8` prezzi, `1` supplier, `1` categoria, `7` eventi; residue fixture/shop QA `0` |
| Independent review | `APPROVED` | SHA finali dei tre repository: P0/P1/P2/P3 `0/0/0/0` |
| PR/CI/merge | `PASS` | PR Admin #42, Android #3 e iOS #1; CI verdi; merge normali a due parent verificati |
| Production / Win7POS | `NOT_MODIFIED` | nessun deploy/write production; Win7POS soltanto contratto equivalente read-only |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-142-cross-platform-catalog-text-integrity.md`
- `docs/TASKS/EVIDENCE/TASK-142/README.md`
- `docs/TASKS/EVIDENCE/TASK-142/entry-point-matrix.md`
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

## Closeout staging coordinato

- Target allowlisted: `merchandisecontrol-dev`, project ref
  `jpgoimipbothfgkokyvm`, PostgreSQL 17.6 `ACTIVE_HEALTHY`.
- Backup pre-repair: area evidence esterna al repository, `30.502` byte,
  `0600`, gzip verificato, SHA-256
  `783c9e77d6edd91bf7c5ad46e240ec55b538b4dd94df9da12ce48d332b36ad97`.
- Migration locale
  `supabase/migrations/20260727055520_task_142_catalog_text_policy_v1.sql`
  applicata come versione remota `20260727084040`; una policy trigger per
  products/suppliers/categories e funzioni private eseguibili soltanto da
  `postgres`. Test vettori SQL `PASS`.
- Repair atomico: `345` prodotti, revisione `1 -> 2`; `245` primary name e
  `111` second name interessati nel preflight. Post-audit display/strict
  non canonici `0`; conteggi, ID, hash protetti, prezzi, stock, relazioni e
  deleted state invariati.
- Worker staging:
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`,
  versione `c5ae7e81-ded9-43ec-996a-199f7cfa540b`.
- Admin public UI: import valido con `2` normalizzazioni preview/apply/readback
  coerenti. Quattro casi negativi distinti — zero-width, C1, oltre 240 UTF-16
  e control nel barcode — bloccati in preview; query read-only successiva:
  fixture negative persistite `0`.
- Mobile public flow: Android ha scritto un prodotto e quattro prezzi, letti
  canonicali da iOS/Admin; iOS ha scritto un prodotto e quattro prezzi, letti
  canonicali da Android/Admin. Owner/shop scope e strict identity verificati.
- Paging Win7POS-equivalente full refresh: categorie `71` in 1 pagina,
  supplier `102` in 1, prodotti `19.763` in 330, prezzi `41.228` in 344.
  Delta/tombstone: categorie `100/29 tombstone`, supplier `131/29`, prodotti
  `19.823/60`; tutti i conteggi pinned sono esatti, senza duplicati, cursori
  ripetuti, timeout o valori invalidi.
- Cleanup transazionale per ID esatti: `3` prodotti, `8` prezzi, `1` supplier,
  `1` categoria e `7` eventi; post-verifica fixture, eventi, identity residue
  e catalogo shop QA tutti `0`.
- Gli artefatti effimeri contenenti sessioni, build o profili browser sono
  stati eliminati. La loro eliminazione e il cleanup fixture non sono
  recuperabili; il backup pre-repair durevole resta disponibile e verificato.

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

- Il validator Win7POS resta meno severo su alcune classi Unicode, ma il gate
  read-only equivalente conferma che il catalogo staging consumabile è valido
  con la policy v1 più severa.
- Gli advisor Supabase legacy e alcuni warning console del Worker staging sono
  preesistenti e non implicano funzioni TASK-142; i flussi pubblici richiesti
  sono passati.
- P0/P1/P2/P3 aperti: `0/0/0/0`.
- Conferma utente esplicita ricevuta il `2026-07-27`.
- Stato finale: `DONE / USER_CONFIRMED_CLOSURE`.
