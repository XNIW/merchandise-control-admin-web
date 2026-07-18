# TASK-137 publish checkpoint

Timestamp UTC: `2026-07-18T00:40:17Z`
Fase corrente: `REMEDIATION_RESCAN_PENDING`

## Snapshot Security di partenza

- scan ufficiale: `276dd0cb-1c47-4bae-b2c2-8e8343bfebb1`;
- base/head:
  `38f02bd969e55df91ff41d3905661da8dfdb145a..3bd380c64b24b21fffa8922d61b0d1675156d7dc`;
- worklist `36/36`, coverage `partial`, Deep Scan `OFF`;
- finding `3 High / 2 Medium / 2 Low`;
- report SHA-256
  `4551a569759dff7dac1aef882ea55762007e648ce042317c50811d300c2573d1`;
- ambienti staging/dev/production non usati;
- Win7POS read-only, non modificato e fuori dalla pubblicazione.

## Repository di validazione

| Repository | Branch | HEAD pre-release | origin/main al recovery |
|---|---|---|---|
| Admin Web | `validate/mac-final-admin-20260717T150455Z` | scan-target `SELF` dopo commit | `38f02bd969e55df91ff41d3905661da8dfdb145a` |
| Android | `validate/mac-final-android-20260717T150455Z` | `38c2a01fc71ebc218038e67f1eab54430a9f5bce` | `8e7c88918d520b78073b8d0d9a1460f0ff4b215b` |
| iOS | `validate/mac-final-ios-20260717T150455Z` | `98da803d145a8757661ed30c768a8cae53ec3610` | `2801241a646cd5d35aba5e7d285f23a44825c0ef` |

I checkout originali sporchi restano preservati. Nessun force push, bypass,
deploy production, migration remota o release store e stato eseguito.

## Remediation release Admin

- `20260717235400_task_137_release_catalog_security_hardening.sql`:
  profilo/membership/shop attivi, policy tenant-safe, resolver RPC e difesa
  trigger privilegiato, storico prezzi append-only indipendente dagli header;
- `20260717235500_task_137_release_pos_financial_hardening.sql`:
  direzione tender coerente e `pos.pay` verificato prima dell'idempotenza e
  prima di ogni sink;
- `sales-sync.ts`: fail-fast mixed-sign prima dell'RPC;
- fixture QA ProductPrice: update trasformato in append deterministico dopo
  validazione target shop-scoped;
- test dinamici e statici per i sette finding e riconciliazione delle sole
  asserzioni foundation obsolete usate dai workflow GitHub.

## Gate realmente eseguiti

| Gate | Esito |
|---|---|
| migration locali nuove | `PASS` |
| suite pgTAP completa | `241 PASS` |
| pgTAP release catalog Security | `41/41 PASS` |
| pgTAP POS Security esteso | `38/38 PASS` |
| DB lint `public,app_private --fail-on error` | `PASS`, zero errori |
| DB push locale dry-run | `PASS`, up-to-date |
| foundation in-scope incluse immagini/QA/POS/remediation | `48/48 PASS` |
| foundation riallineamento RPC POS/UI | `19/19 PASS`, `3` skip esterni |
| typecheck | `PASS` |
| lint | `PASS` |
| i18n con Win7POS canonico | `PASS` |
| build Next.js 16.2.6 | `PASS` |
| `git diff --check` | `PASS` |
| full foundation CI-like con repository esterni assenti | `PASS` |
| `npm run verify` CI-like Admin-only | `PASS`, repository esterno `SKIPPED` esplicito |
| UI smoke | `48/48 PASS` |
| Cloudflare build OpenNext + smoke locale | `PASS`, nessun deploy |
| E2E TASK-137 post-hardening, Chromium desktop seriale | `2/2 PASS` |
| `npm run security:scan` con Win7POS reale | `BLOCKED_EXTERNAL_PREREQUISITE` |
| security scan Admin-only con repo esterno assente | `PASS`, external repo `SKIPPED` |

Il gate monolitico con Win7POS reale non viene trasformato in PASS: il checkout
read-only non contiene piu `OperatorLoginDialog.xaml.cs`, ancora richiesto da
uno scanner storico Admin. GitHub non monta quel repository esterno; la
parita CI viene verificata separatamente con i path esterni assenti.

Il primo run E2E parallelo non e usato come evidence: i due worker avevano
condiviso le stesse fixture e prodotto una collisione di baseline. Il rerun
seriale autorevole ha completato entrambi gli scenari e il cleanup con esito
`2/2 PASS`.

## PoC originali post-fix

- supplier/category/history cross-shop: RLS `42501`, zero righe e zero eventi;
- privileged trigger defense: `42501`, zero sink;
- price header bypass: `price_idempotency_conflict`, prezzo ed eventi invariati;
- shop suspended/archived: write prodotto/prezzo negate; solo controlli attivi
  restano presenti;
- POS `pos.pay` falso o assente: `denied`, sink e ledger zero; retry dopo
  riabilitazione consentito;
- mixed-sign sale/refund/void: `validation_failed`, RPC/sink zero;
- residuo fixture dopo PoC abortite: `0`.

## Nuovo Changes scan obbligatorio

- mode Changes/diff, repository Admin Web;
- base `38f02bd969e55df91ff41d3905661da8dfdb145a`;
- head SHA esatto del prossimo commit clean;
- Deep Scan `OFF`;
- branch immutato fino alla conclusione;
- risultato: `PENDING`.

## Pubblicazione ordinata

1. Admin Web: merge normale su `main`, push, attesa Verify e Cloudflare build;
2. Android: gate Gradle, merge normale su `main`, push e attesa CI;
3. iOS: gate XCTest/build, merge normale su `main`, push e verifica remota.

Nessun branch viene forzato e nessun workflow production viene avviato.

## Blocker residui dichiarati

- nuovo Changes scan post-remediation: `PENDING`;
- parity live Admin/Android/iOS sul medesimo target non-production: `NOT_RUN`;
- migration staging/dev: `NOT_APPLIED`;
- device fisici: `NOT_RUN`;
- scanner monolitico Win7POS: `BLOCKED_EXTERNAL_PREREQUISITE`.

TASK-137 resta `REVIEW_WITH_BLOCKERS`, non `DONE`.
