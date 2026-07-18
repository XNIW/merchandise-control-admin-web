# TASK-137 post-fix security evidence

> Snapshot storico: questa directory documenta soltanto la prima remediation
> denied-audit Product Images. Il successivo scan consolidato a `3bd380c6` ha
> aperto sette finding ulteriori, gestiti nel ledger
> `../../13-release-security-remediation.md` e nel checkpoint `12`.

Evidence locale sanitizzata della correzione del confused deputy nel denied
audit delle product image. Questa directory non sostituisce il nuovo Codex
Security Changes scan: lo scan post-fix resta un gate separato sul commit
finale e con Deep Scan disabilitato.

## Confine corretto

- Migration additiva:
  `20260717200129_task_137_product_image_denied_audit_guard.sql`.
- Un solo confine comune: `public.product_image_record_denied`.
- Prima di `app_private.write_product_image_audit`, la funzione verifica ruolo
  runtime `service_role`, relazione attiva actor/shop e relazione
  product/shop.
- `public`, `anon` e `authenticated` non possono eseguire la funzione.
- Le letture necessarie al resolver server hanno soltanto `SELECT`; i test
  verificano esplicitamente che non sia stato aggiunto DML.
- Un denial cross-shop fallisce chiuso senza audit shop-scoped. Un viewer
  attivo nello stesso shop conserva un solo audit di denial legittimo.

## Evidence eseguita

| Controllo | Risultato |
|---|---|
| reset completo Supabase locale e migration fino a `20260717200129` | `PASS` |
| pgTAP TASK-137 esistente | `76/76 PASS` |
| pgTAP denied-audit post-fix | `32/32 PASS` |
| lint DB `public,app_private --fail-on error` | `PASS`, zero errori |
| report operativo locale read-only | `PASS`, tutti i conteggi a zero |
| cleanup locale dry-run | `PASS`, zero candidati e zero oggetti modificati |
| E2E HTTP cross-shop, quattro route | `1/1 PASS` (`8.0 s`) |
| E2E lifecycle completo | `1/1 PASS` (`12.5 s`) |
| residui fixture/auth/Storage dopo gli E2E | `0` |
| PoC originale vulnerabile, invariata | `FAIL 6/9` atteso post-fix |
| victim-shop audit rows osservate dalla PoC | `0` |
| victim product metadata rows osservate dalla PoC | `0` |
| quattro chiamate denied | `permission_denied` |
| staging/dev/production | `NOT_USED` / `NOT_APPLIED` |

La PoC originale non è stata modificata. Continua ad aspettarsi il
comportamento vulnerabile (`denied_recorded`, quattro audit nel tenant
vittima), quindi il suo `FAIL` post-fix è la prova prevista che l'exploit non
è più riproducibile. Il comportamento sicuro è asserito positivamente dal
nuovo pgTAP, che copre `intent`, `finalize`, `read` e `remove`, zero audit nel
tenant vittima, zero lifecycle/sync side effect, viewer same-shop, principal
staff cashier attivo, membro sospeso e shop sospeso.

L'E2E cross-shop ha attraversato `intent`, `finalize`, `read-urls` e `remove`
con bearer reali contro il server locale. Lo snapshot vittima prima/dopo è
rimasto identico: current version, lifecycle, cleanup, Storage, sync e audit.
Il lifecycle positivo separato ha verificato upload diretto, finalize, signed
read, cache offline, no-op checksum, remove idempotente e cleanup con baseline
finale identica.

## Gate ancora separati

- `npm run verify`: `BLOCKED_EXTERNAL_PREREQUISITE`; il repository Win7POS
  reale e read-only è pulito su `5160b7c`, ma non contiene più il file storico
  `OperatorLoginDialog.xaml.cs` richiesto dallo scanner Admin. Typecheck,
  build, lint, i18n e foundation TASK-137 restano controlli separati eseguiti.
- Il Changes scan successivo su `3bd380c6` e stato completato; la nuova
  scansione post-remediation dei sette finding resta `PENDING`.
- Chiusura manuale dei quattro finding nello snapshot storico:
  `MANUAL_CLOSURE_PENDING` se il workbench non li riconcilia automaticamente.

Nessun secret, bearer token, cookie, signed URL, byte immagine, object path
completo o path macchina locale è conservato in questi artefatti.
