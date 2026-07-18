# TASK-138 Evidence

Evidence durevole per Product Images Runtime Completion, UX e Live Parity.

## Regole

- registrare soltanto risultati prodotti da comandi/runtime realmente eseguiti;
- usare esclusivamente fixture sintetiche con prefisso run univoco;
- non salvare secret, token, cookie, signed URL, dati cliente o originali;
- distinguere `PASS`, `FAIL`, `NOT_IMPLEMENTED`,
  `IMPLEMENTED_NOT_CONNECTED`, `IMPLEMENTED_NOT_TESTED`, `NOT_RUN` e
  `BLOCKED_ENV`;
- staging/live soltanto se non-production e allowlistato;
- Win7POS e production esclusi. Commit, merge e push sono autorizzati soltanto
  dall'override utente finale documentato in `11-final-release-review.md`.

## Ledger previsto

- `00-baseline-and-gap-matrix.md`
- `01-backend-local-and-roles.md`
- `02-admin-runtime.md`
- `03-android-runtime.md`
- `04-ios-runtime.md`
- `05-cross-platform-parity.md`
- `06-performance-memory-storage.md`
- `07-security-and-diff-review.md`
- `08-cleanup-and-final-handoff.md`
- `09-optimization-review.md`
- `11-final-release-review.md`
- `screenshots/`
- `metrics/`

I file sono aggiunti solo quando esiste evidence reale.

## Baseline 2026-07-18

### Git

| Repository | SHA atteso | Tracking ref locale | Stato |
|---|---|---|---|
| Admin Web | `a20fdaf6ce9ed862d1c0fc0123ee355d4ff9fbdc` | uguale | worktree detached pulito |
| Android | `69c36c2c4e3e331da4ca6ce76524cf766d0a36f1` | uguale | worktree detached pulito |
| iOS | `2e2cc6202d4947e13946da7ec6e6ac5337703862` | uguale | worktree detached pulito |

`git fetch origin main` ha restituito:

```text
fatal: unable to access 'https://github.com/...': Could not resolve host: github.com
```

La verifica del remoto live e quindi `BLOCKED_ENV_DNS`; nessun risultato remoto
e inventato. Le checkout originali dirty sono state lasciate intatte.

### ID globale

La ricerca locale su file task, Master Plan e history dei tre repository non ha
trovato TASK-138 prima dell'apertura. La verifica remota resta bloccata dal DNS.

### Ambiente osservato

- stack Supabase locale `MerchandiseControlSupabase` presente e healthy;
- un secondo database Docker non correlato presente e non autorizzato come
  target del reset;
- Simulator `iPhone 16e` gia avviato;
- nessun runner Next/Playwright/Gradle/Xcodebuild rilevato al controllo;
- nessuna sessione staging/live dichiarata disponibile.

### Audit statico pre-modifica

| Area | Admin | Android | iOS |
|---|---|---|---|
| placeholder locale | implementato, non provato zero-I/O | implementato, non provato zero-I/O | implementato, non provato zero-I/O |
| thumb/main | implementato | main usa crop | implementato |
| lazy visible-only | non implementato realmente | parziale, job offscreen | parziale |
| batch max 100 | parziale | non implementato | non implementato |
| dedup/coalescing/limit | non implementato | non implementato | coalescing UI parziale, resto assente |
| cache scoped/offline | implementato, purge scope incompleto | implementato, purge scope incompleto | implementato, purge scope incompleto |
| one retry 401/403 | implementato | implementato | implementato |
| invalid decode no-cache | non implementato | validazione parziale | non implementato prima della cache |
| replace/remove race | parziale | parziale | parziale |
| preprocess off-main | non implementato | implementato | implementato |
| progress/cancel | parziale/non implementato | parziale/non implementato | parziale/non implementato |
| live same-shop parity | non eseguito | non eseguito | non eseguito |
| 200/10 fixture/screenshots | non eseguito | non eseguito | non eseguito |

Questa matrice e stata prodotta prima di qualunque modifica ai file TASK-138.

## Stato corrente

- task: `ACTIVE / REVIEW`;
- verdict executor: `REVIEW_WITH_BLOCKERS`, mai `DONE`;
- backend gate locale: `PASS`;
- runtime Admin: `PASS_LOCAL_RUNTIME`;
- runtime Android: `PASS_JVM_AND_EMULATOR`, parity image locale
  `BLOCKED_LOCAL_ORIGIN_CONTRACT`;
- runtime iOS: `PASS_BUILD_AND_SIMULATOR`, parity locale `BLOCKED_ENV` prima
  della rete;
- cleanup fixture: `PASS`, residui DB/Storage/Auth `0`;
- distribuzione Admin post-optimization: `PASS`, `12` input validi
  rappresentativi + `3` negativi, main/thumb/timing/memoria campionata e
  proiezioni separate in JSON schema `2`;
- screenshot mobile Android/iOS: `NOT_RUN`;
- staging/live stesso shop: `BLOCKED_EXTERNAL_PRECONDITION` per
  target/sessione/DNS mancanti;
- prossima fase: review repo-grounded e, solo con prerequisiti espliciti,
  parity non-production e walkthrough mobile.

## Evidence disponibile

- `00-baseline-and-gap-matrix.md`;
- `01-backend-local-and-roles.md`;
- `02-admin-runtime.md`;
- `03-android-runtime.md`;
- `04-ios-runtime.md`;
- `05-cross-platform-parity.md`;
- `06-performance-memory-storage.md`;
- `07-security-and-diff-review.md`;
- `08-cleanup-and-final-handoff.md`;
- `09-optimization-review.md`;
- screenshot e metriche Admin sanitizzati nella stessa directory, inclusi
  progressive thumb/main, errore, viewport `390x844` e
  `admin-preprocessing-chromium-desktop.json` schema `2`.
