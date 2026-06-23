# TASK-081 - Win7POS Sales Sync, Revenue, Stock Sync and Shop Admin Dashboard

## Informazioni generali

- ID: `TASK-081`
- Titolo: Win7POS Sales Sync, Revenue, Stock Sync and Shop Admin Dashboard
- Stato: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Fase attuale: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Responsabile attuale: `NESSUNO`
- Data apertura: `2026-06-22`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-081/README.md`

## Dipendenze

- Documenti letti: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md`, `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`.
- Task precedenti: `TASK-020`, `TASK-021`, `TASK-022_023`, `TASK-026`, `TASK-027`, `TASK-028`, `TASK-041`, `TASK-070`, `TASK-072`, `TASK-079`.
- Repository coinvolti: Admin Web `/Users/minxiang/Projects/merchandise-control-admin-web`, Win7POS `/Users/minxiang/Projects/Win7POS`.
- Next.js locale: prima di modificare App Router sono state lette le guide in `node_modules/next/dist/docs/01-app/...`.

## Scopo

Portare Win7POS da client online catalog/bootstrap a POS offline-first collegato ad Admin Web/Supabase per vendite, pagamenti, stato fiscale, stock decrement/reversal, incasso giornaliero, registro mensile, stato sync e dashboard Shop Admin responsive.

Addendum finale UX/product alignment: Win7POS resta client POS offline-first e non modifica dati ufficiali shop; Admin Web/Master Console resta source of truth per dati shop, catalogo, prezzi, stock server, staff, device e incassi.

## Contesto

La foundation `TASK-041` fornisce `POST /api/pos/sales/sync` e tabelle `pos_sales_sync_batches`, `pos_sales`, `pos_sale_lines`, ma non copre pagamenti dettagliati, fiscal document status, stock movements, outbox Win7POS o dashboard incassi reale. Il README e stato riallineato durante TASK-081 per non descrivere piu il sales sync come assente.

## Non incluso

- Nessun commit, push, stage o deploy production.
- Nessun Supabase production apply.
- Nessuna service-role key nel client/browser/Win7POS.
- Nessun salvataggio raw di PIN/password/token.
- Nessuna console POS separata.
- Nessun dominio `merchant -> stores`.
- Nessuna dashboard con placeholder o dati simulati e nessuna funzione per nascondere/falsificare incassi.
- Nessuna modifica native Android/iOS salvo lettura o harness local-only.

## File potenzialmente coinvolti

- Admin Web: `src/app/api/pos/sales/sync/route.ts`, `src/server/pos-auth/sales-sync.ts`, `src/app/shop/pos/**`, `src/server/shop-admin/**`, `src/lib/supabase/database.types.ts`.
- Supabase: `supabase/migrations/*task_081*`.
- Win7POS: `src/Win7POS.Data/**`, `src/Win7POS.Wpf/Pos/Online/**`, `src/Win7POS.Wpf/Pos/PosWorkflowService.cs`, scanner PowerShell.
- Documentazione/evidence: questo file, `docs/TASKS/EVIDENCE/TASK-081/README.md`, `docs/MASTER-PLAN.md`, `README.md`, `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Governance e baseline git Admin Web/Win7POS documentate senza stage/commit/push. | STATIC | `PASS` |
| CA-02 | Contratto sales sync supporta pagamenti, fiscal status, refund/void/corrected e idempotenza. | STATIC/TEST | `PASS` |
| CA-03 | Win7POS registra vendite offline, le mette in outbox persistente e sincronizza con retry/backoff. | STATIC/BUILD/TEST | `PASS` |
| CA-04 | Admin Web salva ledger completo shop-scoped, righe, pagamenti e batch redatti. | STATIC/TEST | `PASS` |
| CA-05 | Stock decrement/reversal server-side e local warning/conflict sono idempotenti. | STATIC/TEST | `PASS` |
| CA-06 | Shop Admin `/shop/pos` mostra incasso oggi, registro mensile, vendite recenti, vista completa/documentata e stock issues. | UI/TEST | `PASS` |
| CA-07 | Aggiornamento quasi realtime tramite polling leggero solo nel modulo incassi. | UI/TEST | `PASS` |
| CA-08 | Security: no secret, no service-role leak, device/staff/shop/session invalidi negati, no cross-shop leak. | STATIC/TEST | `PASS` |
| CA-09 | Performance: query bounded, indici shop/date/device/staff/idempotency, batch/polling limitati. | STATIC/TEST | `PASS` |
| CA-10 | Check reali eseguiti o marcati `NOT_RUN`/`BLOCKED` con motivo reale. | TEST | `PASS_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE` |
| CA-11 | Riconciliazione finale a DONE solo per code scope verificato, con Win7 fisico esplicitamente non dichiarato PASS. | MANUAL | `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE` |
| CA-12 | Dati ufficiali shop read-only in Win7POS, salvati come snapshot offline aggiornato solo da Admin Web. | STATIC/HARNESS | `PASS` |
| CA-13 | UX Win7POS mostra online/offline/sync/pending/errori redatti e revenue completo/documento/non stampata senza hidden/fake copy. | STATIC/TEST | `PASS` |

## Execution

- Subagenti richiesti: Repo Governance Auditor, Admin Web/Supabase Architect, Win7POS Offline Client Engineer, Android/iOS Sync Reference Auditor, POS Domain Parity Auditor, Revenue Ledger Architect, Cash Closing Engineer, Mobile Web QA Engineer, Performance/Load Reviewer, Final Architecture Reviewer.
- Checkpoint iniziale: Admin Web e Win7POS allineati a `origin/main`, working tree pulito prima delle modifiche.

## Riconciliazione finale

- Stato finale: `DONE_RECONCILED_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`.
- Conferma utente ricevuta nel prompt `TASK-081 FINAL REVIEW / DONE RECONCILIATION` per riconciliare a DONE se non restano difetti repo-controllabili.
- Evidence: `docs/TASKS/EVIDENCE/TASK-081/README.md` e `TEST-MATRIX.md`.
- Check reali: Admin Web `lint`, `typecheck`, `security:scan`, `test:foundation` 462/462, `build`, `verify`, TASK-081 Playwright locale reale con dataset sintetico/cleanup, TASK-081Z Win7POS HTTP Playwright E2E; Supabase local migration list/up/lint `public,app_private`; Win7POS CLI/WPF Release x86 build; Win7POS sales sync harness; Win7POS shop-cache offline harness; scanner PowerShell baseline e UX/read-only/sync/revenue; release pack TASK-081Z FINAL con zip/checksum/PathMap, validate/drop e redaction scan.
- Difetti corretti in review finale: rimosso da Win7POS `PaymentView.xaml.cs` un commento legacy `SII Web`/area fiscale disattivata non piu coerente con la UX boleta/PDF locale; aggiunto `PendingSalesText` al tooltip sync della shell WPF; rimossa dall'UI operatore la stampa del path assoluto del PDF boleta.
- Rischi residui: guest/fisico Windows 7 non eseguito per launch issue documentato (`open -a UTM` provato sul bundle reale; `utmctl start` su entrambi gli UUID Windows 7 resta appeso/timeouts e status rimane `stopped`; nessun processo QEMU Win7); bridge fisico `env-report`/`smoke-pos` non processato da runner attivo e job spostati in `failed` come `manual-stale`; stampante/cassetto/driver e rete intermittente reale non disponibili su questo host; Supabase remote/staging/production apply e deploy non eseguiti per vincolo task.
- Nota esplicita: Win7 physical/VM runtime resta `EXTERNAL_TEST_PENDING`; non e stato dichiarato superato il test fisico Windows 7 e non e stato dichiarato completato il runtime fisico.
