# 13 - Release Security remediation

Data: `2026-07-17`
Stato: `REMEDIATION_RESCAN_PENDING`
Deep Scan: `OFF`

## Scan sorgente

- scan ID `276dd0cb-1c47-4bae-b2c2-8e8343bfebb1`;
- range immutabile
  `38f02bd969e55df91ff41d3905661da8dfdb145a..3bd380c64b24b21fffa8922d61b0d1675156d7dc`;
- worklist `36/36`, coverage ufficiale `partial`;
- finding `3 High / 2 Medium / 2 Low`;
- report SHA-256
  `4551a569759dff7dac1aef882ea55762007e648ce042317c50811d300c2573d1`.

## Finding e correzioni

| Finding ufficiale | Severita | Correzione |
|---|---|---|
| Cross-shop category and sync-event injection | High | helper write tenant/lifecycle, policy RLS sostituita, controllo nel trigger privilegiato |
| Cross-shop history and synchronization-event injection | High | policy history tenant-safe per insert/update/delete e difesa event sink |
| Cross-shop supplier and sync-event injection | High | policy supplier tenant-safe e difesa event sink |
| Inactive shops retain catalog-write authority | Medium | profilo, membership e shop devono essere attivi per DML/RPC catalogo |
| Client-controlled headers bypass append-only price history and suppress sync events | Medium | guard append-only incondizionato; header esclusi dalla decisione di integrita |
| Mixed-sign POS tender components corrupt per-method ledger totals | Low | direction guard nel parser e nel preflight SQL prima dell'idempotenza |
| Missing pos.pay enforcement allows payment ledger writes | Low | `pos.pay` fail-closed prima dell'idempotenza e prima di ogni sink |

File principali:

- `supabase/migrations/20260717235400_task_137_release_catalog_security_hardening.sql`;
- `supabase/migrations/20260717235500_task_137_release_pos_financial_hardening.sql`;
- `src/server/pos-auth/sales-sync.ts`;
- `src/app/shop/qa-sync-fixture/route.ts`;
- `supabase/tests/task_137_release_catalog_security.sql`;
- `supabase/tests/dsc_093_094_134_pos_sales_security.sql`;
- `tests/foundation/task-137-release-security-hardening.test.mjs`.

## Invarianti preservati

- owner/manager attivi nello shop attivo conservano il write previsto;
- profilo disabilitato, membership sospesa, shop sospeso/archiviato,
  non-member e cross-shop falliscono chiuso;
- il bridge legacy resta consentito soltanto nei casi canonici attivi;
- il prezzo e uno storico append-only: replay identico consentito, divergenza
  rifiutata con `price_idempotency_conflict`;
- la fixture QA valida la versione target e appende una nuova riga
  deterministica, senza mutare quella storica;
- split tender legittimo same-sign raggiunge l'RPC; sale/refund/void con segni
  incoerenti falliscono prima dei sink;
- il replay POS resta idempotente, ma una revoca corrente di `pos.pay` nega
  anche un batch precedentemente accettato;
- batch, sale, linee, ledger e stock restano nello stesso RPC transazionale.

## PoC originali post-fix

| PoC | Esito osservato |
|---|---|
| supplier cross-shop | RLS `42501`, zero riga/evento |
| category cross-shop | RLS `42501`, zero riga/evento |
| history cross-shop | RLS `42501`, zero riga/evento |
| trigger privilegiato con scope vittima | `42501`, zero sink |
| price update senza header / header non-mobile | `price_idempotency_conflict`, prezzo `100`, eventi `0` |
| shop suspended/archived | product/price DML e RPC negati |
| POS `pos.pay=false` o riga assente | `denied`, sink `0` |
| POS mixed-sign | `validation_failed`, RPC/sink `0` |
| residuo fixture dopo i run | `0` |

Il comportamento legittimo e coperto positivamente: owner/manager attivi,
replay prezzo identico, riattivazione shop, sale split `40/60`, `pos.pay=true`
e retry dopo riabilitazione.

## Gate eseguiti

- migration locali applicate: `PASS`;
- pgTAP completo: `241 PASS`;
- catalog Security: `41/41 PASS`;
- POS Security: `38/38 PASS`;
- DB lint `public,app_private --fail-on error`: `PASS`, zero errori;
- local push dry-run: `PASS`, schema up-to-date;
- foundation in-scope: `48/48 PASS`;
- foundation RPC POS/UI riallineata: `19/19 PASS`, tre skip esterni;
- typecheck, lint, i18n con Win7POS canonico e build Next.js 16.2.6: `PASS`;
- full foundation CI-like con repository esterni assenti: `PASS`;
- `npm run verify` CI-like Admin-only: `PASS`, con skip esterno esplicito;
- E2E TASK-137 post-hardening, Chromium desktop seriale: `2/2 PASS`;
- UI smoke: `48/48 PASS`;
- Cloudflare build OpenNext e smoke locale: `PASS`, nessun deploy.

Un primo run E2E parallelo ha condiviso le fixture tra i worker e non viene
usato come evidence; il rerun seriale autorevole ha completato i due scenari
e il cleanup con esito `2/2 PASS`.

`npm run security:scan` con il checkout Win7POS reale resta
`BLOCKED_EXTERNAL_PREREQUISITE`: manca il file storico
`OperatorLoginDialog.xaml.cs`. La variante Admin-only con repository esterno
assente passa dichiarando esplicitamente lo skip. Nessuno dei due esiti viene
presentato come scan Codex Security ufficiale.

## Nuovo Changes scan

- base `38f02bd969e55df91ff41d3905661da8dfdb145a`;
- head: commit clean `SELF`, da sostituire con lo SHA risolto al freeze;
- branch immutato durante il run;
- Deep Scan `OFF`;
- esito `PENDING`.

## Rischi e blocker residui

- il rischio downstream di dati JPEG dopo il primo end-of-image marker resta
  deferito dal report storico e non e stato ampliato in questa remediation;
- `pos.pay` aveva semantica prodotto non documentata nel report: la release
  adotta il comportamento conservativo di capability indipendente e fail-closed;
- parity live cross-client sul medesimo target non-production `NOT_RUN`;
- migration staging/dev `NOT_APPLIED`;
- device fisici `NOT_RUN`;
- nessun deploy/migration production o store release eseguito.

TASK-137 resta `REVIEW_WITH_BLOCKERS`, non `DONE`.
