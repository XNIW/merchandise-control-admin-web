# TASK-137 publish checkpoint

Timestamp UTC: `2026-07-17T18:14:25Z`
Fase corrente: `VALIDATION_PASS`

## Repository recuperati

| Repository | Branch | HEAD | origin/main | Divergenza HEAD...origin/main | Staged |
|---|---|---|---|---|---|
| Admin Web | `validate/mac-final-admin-20260717T150455Z` | merge `bfec822e`, fix/evidence `SELF` | `38f02bd969e55df91ff41d3905661da8dfdb145a` | `9/0` dopo `SELF` | nessuno dopo `SELF` |
| Android | `validate/mac-final-android-20260717T150455Z` | `38c2a01fc71ebc218038e67f1eab54430a9f5bce` | `8e7c88918d520b78073b8d0d9a1460f0ff4b215b` | `4/0` | nessuno |
| iOS | `validate/mac-final-ios-20260717T150455Z` | `98da803d145a8757661ed30c768a8cae53ec3610` | `2801241a646cd5d35aba5e7d285f23a44825c0ef` | `4/0` | nessuno |

## Commit già creati e non duplicati

- `1aadd76d` — `TASK-088 freeze K125 security and runtime evidence`
- `40d1c445` — `TASK-137 add Admin product image runtime`
- `205da0a6` — `TASK-137 add Admin product image verification`
- `cf76fe36` — `fix: harden product image storage lifecycle`
- `cfd101b7` — `feat: render product catalog images and placeholder`
- `96051fc6` — `test: cover product image storage and UI contracts`
- Android: `d3b1d93` runtime/UI, `57befb2` test, `c21de31` docs/evidence.
- iOS: `629eb8e8` runtime/UI/remove fail-closed, `4b89c7d2` test,
  `21db5edb` docs/evidence.
- Admin docs/evidence iniziali: `aa916929`.
- Admin clean-merge reconciliation: commit corrente `SELF` (permission gate,
  scanner TASK-088 atomico, i18n path/prefisso dinamico ed evidence).
- Nessuno dei tre branch `integrate/mac-final-*` risulta pubblicato sul remoto.

## File inclusi

- Whitelist Admin: `docs/TASKS/EVIDENCE/TASK-137/11-mac-final-manifest.md`.
- Whitelist Android: `docs/TASKS/evidence/TASK-137/mac-final-manifest.md`.
- Whitelist iOS: `docs/TASKS/EVIDENCE/TASK-137/11-mac-final-manifest.md`.
- Questo checkpoint: `docs/TASKS/EVIDENCE/TASK-137/12-publish-checkpoint.md`.
- Dipendenze validate clean-merge elencate nel manifest Admin, categoria `I`.

## File esclusi e preservati

- Tutti i path non presenti nelle whitelist TASK-137, salvo successiva classificazione esplicita.
- Evidence/log grezzi TASK-076, TASK-088 non whitelisted e TASK-136.
- `artifacts/`, `Data/`, `Info.plist`, database locali, build output, DerivedData, xcresult, APK/IPA.
- File sensibili, sessioni, cookie, token, signed URL, secret e configurazioni locali.
- Checkout Android secondario e repository Win7POS: read-only, non integrati.
- Harness TASK-088 Android non compilabile isolatamente: escluso da TASK-137.
- `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`: contaminazione Win7POS, escluso dal commit TASK-137.

## Ultimo comando concluso

`WIN7POS_REPO_PATH=/Users/minxiang/Projects/Win7POS npm run i18n:check`
nel worktree Admin pulito, con Win7POS esclusivamente read-only.

Risultato: `PASS`; il pgTAP immediatamente precedente è `76/76 PASS`. Admin
clean merge: `npm run verify` `PASS` dopo
l'unico retry fuori sandbox per il fetch dei font Geist, scanner repository
`PASS` con Win7POS `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`, i18n `PASS`,
foundation TASK-137 `20/20 PASS`, diff-check `PASS`. Android clean merge:
unit Product Image/repository/migration, `assembleDebug` e `lintDebug`
`BUILD SUCCESSFUL` (primo tentativo senza SDK path preservato, retry con
`ANDROID_HOME` riuscito). iOS clean merge: build e Product Images `22/22 PASS`,
zero failure su iPhone 16e Simulator 26.2. I tre worktree non hanno conflitti;
Android e iOS sono puliti.

L’implementazione UI/client è completa a livello codice sui tre repository: thumbnail lista e main dettaglio, placeholder locali, stati accessibili, retry manuale, retry signed URL singolo, cache scope account/shop/version, remove semantico e conferma Android. iOS effettua downsample/decode fuori dal `MainActor` e conserva le altre namespace in memoria. I due reviewer read-only hanno confermato i gap iniziali e la necessità di congelare i commit prima dello scan. Nessuna verifica visuale runtime viene dichiarata in questa fase.

## Prossimo comando esatto

`Codex Security Changes scan: Admin origin/main...validate/mac-final-admin-20260717T150455Z (Deep Scan OFF)`

## Blocker correnti

- Codex Security Changes scan non ancora avviato; Deep Scan resta OFF.
- Audit visuale con screenshot della build corrente non eseguito: nessun browser scelto dall’utente; non viene dichiarato come PASS.
- Parity live cross-client e staging/dev migration: `NOT_RUN` / `NOT_APPLIED`.
