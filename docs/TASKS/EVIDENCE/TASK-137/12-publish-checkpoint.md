# TASK-137 publish checkpoint

Timestamp UTC: `2026-07-17T17:52:45Z`
Fase corrente: `COMMITS_CREATED`

## Repository recuperati

| Repository | Branch | HEAD | origin/main | Divergenza HEAD...origin/main | Staged |
|---|---|---|---|---|---|
| Admin Web | `integrate/mac-final-admin-20260717T150455Z` | `96051fc63233befd6135bc2d1f6fa5d4ce246cc6` (code/test; docs commit = `SELF`) | `38f02bd969e55df91ff41d3905661da8dfdb145a` | `6/5` pre-docs | docs TASK-137 in preparazione |
| Android | `integrate/mac-final-android-20260717T150455Z` | `c21de31` | `8e7c88918d520b78073b8d0d9a1460f0ff4b215b` | `3/0` | nessuno |
| iOS | `integrate/mac-final-ios-20260717T150455Z` | `21db5edb` | `2801241a646cd5d35aba5e7d285f23a44825c0ef` | `3/0` | nessuno |

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
- Admin docs/evidence: commit corrente `SELF`.
- Nessuno dei tre branch `integrate/mac-final-*` risulta pubblicato sul remoto.

## File inclusi

- Whitelist Admin: `docs/TASKS/EVIDENCE/TASK-137/11-mac-final-manifest.md`.
- Whitelist Android: `docs/TASKS/evidence/TASK-137/mac-final-manifest.md`.
- Whitelist iOS: `docs/TASKS/EVIDENCE/TASK-137/11-mac-final-manifest.md`.
- Questo checkpoint: `docs/TASKS/EVIDENCE/TASK-137/12-publish-checkpoint.md`.

## File esclusi e preservati

- Tutti i path non presenti nelle whitelist TASK-137, salvo successiva classificazione esplicita.
- Evidence/log grezzi TASK-076, TASK-088 non whitelisted e TASK-136.
- `artifacts/`, `Data/`, `Info.plist`, database locali, build output, DerivedData, xcresult, APK/IPA.
- File sensibili, sessioni, cookie, token, signed URL, secret e configurazioni locali.
- Checkout Android secondario e repository Win7POS: read-only, non integrati.
- Harness TASK-088 Android non compilabile isolatamente: escluso da TASK-137.
- `tests/foundation/task-027-catalog-pull-delta-sync.test.mjs`: contaminazione Win7POS, escluso dal commit TASK-137.

## Ultimo comando concluso

`git commit -m 'docs: finalize TASK-137 iOS evidence'` nel repository iOS.

Risultato: commit iOS `21db5edb` creato. I commit runtime/test/docs sono ora
separati nei tre repository. Admin: reset Supabase esclusivamente locale
`PASS`, migration hardening applicata e pgTAP TASK-137 `76/76 PASS`;
foundation TASK-137 `19/19 PASS`, ESLint mirato `PASS`, typecheck `PASS`,
`node --check` cleanup/report `PASS`. Android: unit mirati e compilazione
androidTest `BUILD SUCCESSFUL`; rerun del caso invalidato `1/1 PASS`, emulatore
arrestato. iOS: test mirati Product Images `22/22 PASS`, zero failure.

L’implementazione UI/client è completa a livello codice sui tre repository: thumbnail lista e main dettaglio, placeholder locali, stati accessibili, retry manuale, retry signed URL singolo, cache scope account/shop/version, remove semantico e conferma Android. iOS effettua downsample/decode fuori dal `MainActor` e conserva le altre namespace in memoria. I due reviewer read-only hanno confermato i gap iniziali e la necessità di congelare i commit prima dello scan. Nessuna verifica visuale runtime viene dichiarata in questa fase.

## Prossimo comando esatto

`git fetch origin --prune --tags`

## Blocker correnti

- Worktree validate e relativi gate non ancora creati/eseguiti.
- Codex Security Changes scan non ancora avviato; Deep Scan resta OFF.
- Admin branch basato su una main locale cinque commit dietro `origin/main`; l’integrazione sarà validata soltanto in un worktree pulito da `origin/main`.
- Audit visuale con screenshot della build corrente non eseguito: nessun browser scelto dall’utente; non viene dichiarato come PASS.
- Parity live cross-client e staging/dev migration: `NOT_RUN` / `NOT_APPLIED`.
