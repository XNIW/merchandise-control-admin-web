# TASK-142 - Cross-platform catalog text integrity

## Informazioni generali

- ID: `TASK-142`
- Coordination key: `CATALOG-TEXT-001`
- Repository: `XNIW/merchandise-control-admin-web`
- Titolo: `Cross-platform catalog text integrity`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `USER / FINAL CONFIRMATION`
- Data apertura: `2026-07-27`
- Branch implementazione: `codex/catalog-text-integrity-admin-20260727`
- Branch closeout: `codex/catalog-text-integrity-closeout-admin-20260727`
- Baseline: `54889a68a65cec39764bbb5479574e942f4d54f1`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-142/README.md`
- Task Android collegato: `TASK-140 - Catalog text integrity Android`
- Task iOS collegato: `TASK-140 - Catalog text integrity iOS`

## Autorizzazione e target

L'utente ha autorizzato execution, fix, test, worktree/branch, commit, push, PR,
review, merge normale, migration e data repair esclusivamente sul Supabase
pubblico staging allowlisted, un eventuale deploy Worker staging e acceptance
cross-platform su Android Emulator e iOS Simulator.

- Supabase target: `merchandisecontrol-dev`, pubblico dev/staging allowlisted.
- Production: `NOT_MODIFIED`.
- Win7POS: `READ_ONLY / NOT_MODIFIED`.
- Android e iOS: modificati soltanto nei rispettivi repository e task.

La governance locale resta applicabile: Codex prepara il task per `REVIEW` e
non lo marca autonomamente `DONE`.

## Scopo

- Definire `catalog_text_policy_v1` come contratto unico e fixture golden.
- Canonicalizzare display text con Unicode NFC, whitespace benigno in U+0020,
  collapse/trim, limiti post-normalizzazione e risultato tipizzato.
- Rifiutare controlli residui, Unicode malformato, zero-width vietati, BOM
  interno, bidi embedding/override/isolate e testo oltre limite.
- Validare in modo severo barcode, item number e altri identity/code text senza
  trasformare newline/control per farli passare o fondere identità.
- Integrare la policy nei write path Admin: editor prodotto/supplier/category,
  import supplier/database, preview/apply, endpoint POS import e RPC/database
  boundary.
- Aggiungere una migration additiva con funzioni private/versionate, trigger
  `BEFORE INSERT/UPDATE`, `search_path` esplicito e nessuna nuova grant
  `anon`/`authenticated`.
- Aggiungere pgTAP, foundation/unit test, Playwright locale/staging e fixture
  di import con warning non bloccanti e righe bloccate tipizzate.
- Eseguire audit, backup, repair e post-verifica soltanto sul target staging
  allowlisted, preservando ID, conteggi, prezzi, stock, relazioni e deleted
  state.
- Verificare catalog paging completo e contratto Win7POS equivalente senza
  modificare o avviare Win7POS.

## Non incluso

- Production apply/deploy o accesso a dati production.
- Modifiche Win7POS.
- Modifiche a note/descrizioni free-form volutamente multilinea.
- Refactor estesi o dipendenze nuove non necessarie.
- Indebolimento di RLS, grants, lease, revisioni, fail-closed o audit.
- Raw catalog values, credenziali, token, payload completi o nomi prodotto reali
  in log/evidence.
- Force push, squash merge, reset/clean distruttivi.

## Contratto e limiti

| Classe | Campi Admin | Limite |
|---|---|---:|
| Display required | `inventory_products.product_name` | 240 |
| Display optional | `inventory_products.second_product_name` | 240 |
| Display required | `inventory_suppliers.name` | 160 |
| Display required | `inventory_categories.name` | 160 |
| Identity required | `inventory_products.barcode` | 96 |
| Identity optional | `inventory_products.item_number` | 120 |
| Identity | UUID/shop code/remote ID attraversati dai flussi catalogo | limite dominio esistente |

Il fallback del nome primario resta esclusivamente quello già approvato dal
dominio import esistente; nessun placeholder viene inventato.

## Entry point Admin da coprire

| Source | Parser/boundary | Apply | Persistenza/sync |
|---|---|---|---|
| Manual product editor | Server Action + validator centrale | catalog mutation | RPC + trigger DB |
| Manual supplier/category | Server Action + validator centrale | catalog mutation | RPC + trigger DB |
| Supplier Excel | workbook parser + preview | digest-bound apply | bulk RPC + trigger DB |
| Database workbook | workbook parser + preview | digest-bound apply | bulk RPC + trigger DB |
| POS import sync | Route Handler body parser | POS import apply RPC | trigger DB |
| Recovery/restore | preflight sul valore persistito | restore esistente | trigger DB su eventuali update |
| Catalog pull/export | response validation | read-only | valore canonico persistito |
| Direct mobile writes/legacy versions | DB boundary | trigger DB | revision/update trigger esistente |

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Task, Master Plan, evidence, contratto e fixture golden sono tracciati; digest uguale nei tre repository. | `PASS` |
| CA-02 | Utility TypeScript centrale produce `unchanged`, `normalized` o `rejected` con reason tipizzata ed è idempotente. | `PASS` |
| CA-03 | Display text preserva cinese, accenti, simboli, emoji/ZWJ validi e normalizza soltanto whitespace benigno + NFC. | `PASS` |
| CA-04 | Control, surrogate/UTF-8 invalidi, zero-width vietati, BOM interno, bidi e over-limit sono bloccati. | `PASS` |
| CA-05 | Identity text non converte control/newline/tab e non introduce collisioni tramite trim. | `PASS_REVIEWED` |
| CA-06 | Editor manuali e tutti gli import Admin applicano esattamente il valore preview canonicalizzato prima della scrittura. | `PASS_REVIEWED` |
| CA-07 | Warning per riga/campo e conteggi normalizzazioni sono localizzati senza mostrare caratteri invisibili raw. | `PASS` |
| CA-08 | Migration additiva protegge prodotti, supplier e category senza modificare RLS/grants/lease. | `PASS_LOCAL` |
| CA-09 | pgTAP, focused tests, TASK-141 regressions, verify, cf:build, Playwright e paging passano realmente. | `PASS_LOCAL` |
| CA-10 | Audit/backup/repair staging preservano invarianti e portano gli invalidi a zero; production resta intatta. | `PASS` |
| CA-11 | Acceptance Admin -> mobile, Android -> Admin/iOS e iOS -> Admin/Android passa con cleanup esatto. | `PASS` |
| CA-12 | Review indipendente chiude tutti i P0/P1/P2 prima del merge normale. | `PASS` |

## Evidence iniziale

- `main == origin/main == 54889a68a65cec39764bbb5479574e942f4d54f1`.
- Working tree baseline pulito.
- Ultimi otto commit verificati sia con Git locale sia tramite GitHub.
- Supabase connector espone un solo progetto: `merchandisecontrol-dev`,
  PostgreSQL 17, stato healthy; repository e runbook lo identificano come
  dev/staging allowlisted.
- Audit preliminare staging read-only:
  - display canonicalizzabili: product name `245`, second name `111`;
  - display proibiti/vuoti/over-limit: `0`;
  - strict barcode/item proibiti, trim-only, vuoti o over-limit: `0`;
  - nessun raw value registrato.
- L'audit verrà ripetuto immediatamente prima della mutazione staging.

## Check previsti

- `git diff --check`
- focused `node --test` TASK-142
- `npm run lint`
- `npm run typecheck`
- `npm run security:scan`
- `npm run test:foundation`
- `npm run verify`
- `npm run cf:build`
- TASK-141 regressions
- Supabase reset isolato, migration parity, lint e pgTAP
- Playwright locale e public staging
- catalog paging completo e validator Win7POS-equivalente
- Supabase security/performance advisors post-migration

## Execution

- `2026-07-27`: baseline e GitHub main verificati; worktree isolato creato.
- `2026-07-27`: guide locali Next.js per mutations, Route Handlers e data
  security lette prima delle modifiche runtime.
- `2026-07-27`: changelog Supabase e guide ufficiali trigger/RLS consultati.
- `2026-07-27`: audit preliminare staging completato in sola lettura.
- `2026-07-27`: contratto e fixture golden congelati nei tre repository con
  SHA-256
  `139d63eedea47b54bb63a9289bef5fc6f7372668f209aac7753b586da7ccd9f8`.
- `2026-07-27`: utility TypeScript, editor manuali, import supplier/database,
  preview/correction/apply, POS import/pull e boundary DB implementati.
- `2026-07-27`: reset Supabase isolato da zero, lint SQL e 14 file pgTAP /
  973 test completati con esito `PASS`.
- `2026-07-27`: focused foundation 25/25, foundation completa, `verify`,
  `cf:build`, i18n, paging statico, Playwright locale autenticato e
  `git diff --check` completati con esito `PASS`.
- `2026-07-27`: due difetti rilevati dal test browser sono stati corretti prima
  dell'handoff: campo non contrattuale nel payload staff e mancato blocco del
  prezzo retail sui nuovi prodotti nominati.
- `2026-07-27`: implementazione consegnata alla fase `REVIEW`; migration,
  repair, deploy e acceptance pubblica staging restano intenzionalmente
  post-merge.
- `2026-07-27`: review indipendente sullo SHA `5722b274` completata con
  `P0=0`, `P1=2`, `P2=2`, `P3=1`; merge bloccato.
- `2026-07-27`: applicati fix mirati per collisioni identity raw→canonical
  case-sensitive, restore boundary, PriceHistory strict-before-transform e
  collisioni POS barcode/item number. Gate toccati: focused foundation 30/30,
  foundation completa, typecheck, lint, reset/lint DB e pgTAP 14 file /
  975 test `PASS`.
- `2026-07-27`: il primo rereview dello SHA `91641602` ha rilevato un P1
  residuo nel raw degli adjustment e un P3 di copertura POS. Il delta
  `3f7bedc3` separa raw/canonical negli adjustment general e supplier e aggiunge
  test funzionali adjustment→validation e parser POS. Rereview finale:
  `APPROVED_PRE_PR`, P0/P1/P2/P3 `0/0/0/0`; 29/29 focused, foundation completa
  contro snapshot Win7POS pulito, typecheck, lint, verify e cf:build `PASS`.
- `2026-07-27`: PR di implementazione Admin
  [#42](https://github.com/XNIW/merchandise-control-admin-web/pull/42),
  Android [#3](https://github.com/XNIW/MerchandiseControlSplitView/pull/3) e
  iOS [#1](https://github.com/XNIW/iOSMerchandiseControl/pull/1) collegati,
  revisionati con P0/P1/P2/P3 `0/0/0/0`, CI verdi e integrati con merge
  normali a due parent rispettivamente in `d52e23da`, `ec858d0b` e
  `712689dd`.
- `2026-07-27`: backup staging pre-repair creato in area evidence esterna,
  compresso, permessi `0600`, verifica gzip e SHA-256
  `783c9e77d6edd91bf7c5ad46e240ec55b538b4dd94df9da12ce48d332b36ad97`
  `PASS`. La migration è applicata esclusivamente a
  `merchandisecontrol-dev` come versione remota `20260727084040`.
- `2026-07-27`: repair atomico staging completato su esattamente `345`
  prodotti, revisione `1 -> 2`. Post-verifica: display/strict non canonici
  `0`; conteggi, ID, prezzi, stock, relazioni e deleted state invariati.
- `2026-07-27`: Worker staging pubblico distribuito nella versione
  `c5ae7e81-ded9-43ec-996a-199f7cfa540b`; UI Admin valida preview/apply/readback
  canonico e blocca quattro classi negative senza scritture parziali.
- `2026-07-27`: acceptance pubblica cross-platform completata sul solo shop QA:
  Android write -> iOS/Admin read, iOS write -> Android/Admin read, quattro
  prezzi per ciascun prodotto e identità strict preservate. Android API 35 e
  iOS Simulator hanno eseguito i test selezionati con esito `PASS`.
- `2026-07-27`: gate Win7POS-equivalente read-only completato sull'intero
  catalogo staging: `71` categorie, `102` supplier, `19.763` prodotti e
  `41.228` prezzi; snapshot pinned, cursori senza ripetizioni, ID senza
  duplicati e valori invalidi `0`. Il drain delta/tombstone ha terminato con
  tombstone validi e conteggi attesi.
- `2026-07-27`: cleanup fixture esatto completato: `3` prodotti, `8` prezzi,
  `1` supplier, `1` categoria e `7` eventi registrati rimossi; residue fixture
  e shop QA `0`. File temporanei di sessione, build e browser eliminati;
  production e Win7POS restano `NOT_MODIFIED`.

## Handoff

- Risultato: tutti i criteri TASK-142 sono verificati nel perimetro
  autorizzato; implementazioni integrate, migration/repair staging applicati,
  acceptance pubblica e cleanup esatto completati.
- File toccati nel closeout: questo task,
  `docs/TASKS/EVIDENCE/TASK-142/README.md` e `docs/MASTER-PLAN.md`.
- Evidence dettagliata:
  `docs/TASKS/EVIDENCE/TASK-142/README.md`; matrice entry point:
  `docs/TASKS/EVIDENCE/TASK-142/entry-point-matrix.md`.
- Rischi residui: advisor Supabase legacy e warning console del Worker staging
  già presenti restano note non bloccanti; nessuno coinvolge le funzioni
  TASK-142 o ha impedito i flussi pubblici verificati.
- P0/P1/P2/P3 aperti: `0/0/0/0`.
- Production e Win7POS: `NOT_MODIFIED`.
- Prossima fase: `REVIEW / READY_FOR_USER_CONFIRMATION`. Codex non marca il
  task `DONE`; il passaggio finale richiede conferma esplicita dell'utente.
