# Evidence TASK-144

## Baseline

- Admin `origin/main`: `7ff0f6a0dfd9e1203cd07834f73ecc4269abc714`
- Win7POS `origin/main` read-only:
  `fb6dbe670ae1a646268331e7288d6e6b07b5500d`
- Admin checkout iniziale: pulito
- Win7POS checkout utente dirty: preservato e non usato
- Worktree Win7POS di riferimento: detached su `origin/main`
- Production: `NOT_MODIFIED`

## Contratto autorevole

- Campo response esistente:
  `effectiveOfflineAuthorizationExpiresAt`
- Policy Win7POS: massimo offline 12 ore, clamp su session expiry e
  authoritative expiry.
- Binding locale: session/device/shop/staff, credential version, token e
  monotonic high-water.
- Capability matrix letta:
  `docs/HANDOFFS/WIN7POS_ADMIN_ARTICLE_MUTATION_CAPABILITY_MATRIX.md` nel
  worktree read-only Win7POS.

## Check

Eseguiti realmente il 2026-07-28:

- `git diff --check`: `PASS`.
- `npm run typecheck`: `PASS`.
- focused foundation TASK-144: `PASS`, `6/6`.
- regressioni foundation aggiornate TASK-021/028/079/087 e runtime boundary:
  `PASS`; insieme a TASK-144 `29/29`.
- `WIN7POS_REPO_PATH=<worktree-detached> npm run test:foundation`: `PASS`.
- `npm run security:scan`: `PASS`.
- `npm run verify`: `PASS`; Next.js `16.2.6`, build e TypeScript verdi.
- `npm run cf:build`: `PASS`; bundle OpenNext Worker prodotto.
- `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local`: `PASS`, incluse
  guardie first-login, heartbeat, catalog pull/import e sales sync.
- Supabase isolato `MerchandiseControlTask144`, PostgreSQL `17.6`:
  `supabase db reset --local --no-seed` `PASS`; migration TASK-144 applicata
  nell'ordine repository.
- pgTAP focalizzato TASK-144 post-reset: `PASS`, `41/41` dopo review fix.
- `supabase db lint --schema public,app_private --fail-on error`: `PASS`,
  zero errori; soli warning preesistenti fuori scope.
- suite pgTAP completa: `15` file, `1011` assertioni; `1010` verdi e unico
  failure nella soglia prestazionale preesistente TASK-141
  `manifest preflight < 8s`. Rerun standalone: stesso unico failure in
  `253s`; correttezza TASK-141 `9/10`, tutte le altre suite incluse TASK-144
  verdi. Il test non è stato disabilitato, saltato o modificato.
- fixture Win7POS: `dotnet 10.0.302` con reference al progetto reale
  `Win7POS.Core` sullo SHA baseline; `PosFirstLoginResponse` deserializza il
  fixture TASK-144: `PASS`.
- tipi Supabase: generati dallo schema locale migrato e confrontati; le quattro
  colonne per credential/session e la firma RPC V3 coincidono con
  `database.types.ts`. Il file completo non è stato sovrascritto perché il
  generatore corrente mostra drift preesistente non collegato a TASK-144.

## Evidence funzionale

- RPC additiva:
  `public.pos_runtime_first_login_commit_v3`, solo `service_role`.
- Expiry: `least(serverTime + policy max, session expiry, device credential
  expiry, staff credential expiry)`.
- Replay: la nuova attestazione è limitata dalla precedente expiry ancora
  valida per shop/device/staff/credential-version/policy.
- Invalidazione: trigger privati su staff, shop, device, credential e sessione.
- Timestamp response: UTC con sei cifre frazionarie e suffisso `Z`.
- Errori: `offline_authorization_not_permitted`,
  `offline_authorization_expired`, `offline_authorization_policy_invalid`,
  `offline_authorization_persistence_failed`.
- Audit: solo metadata bounded; nessun body, PIN/password, token, hash o expiry.

## File implementativi

- `supabase/migrations/20260728030154_task_144_pos_offline_authorization_attestation.sql`
- `supabase/tests/task_144_pos_offline_authorization.sql`
- `src/server/pos-auth/pos-contract.ts`
- `src/server/pos-auth/runtime-boundary.ts`
- `src/server/pos-auth/service.ts`
- `src/server/pos-auth/shop-payload.ts`
- `src/lib/supabase/database.types.ts`
- `contracts/pos/first-login-offline-authorization-v1.response.json`
- `tests/foundation/task-144-pos-offline-authorization-attestation.test.mjs`

## Stato delivery

- Fase corrente: `REVIEW_READY`.
- Prima review indipendente sulla head `cd11e533`: `P0/P1/P2/P3 =
  0/0/1/0`. Il P2 rilevava che l'accorciamento di `expires_at` invalidava
  correttamente la receipt nel trigger ma veniva poi respinto dal CHECK.
- Review fix: il bound `offline expiry <= expires_at` è ora obbligatorio solo
  per authority non invalidate; pgTAP prova che l'accorciamento di sessione e
  credential persiste e invalida la receipt. Reset isolato `PASS`, pgTAP
  `41/41`, foundation toccata `11/11`.
- Rereview indipendente sulla head corretta `fa791952`:
  `P0/P1/P2/P3 = 0/0/0/0`; nessun finding residuo.
- PR `#47`: non-draft, CI run `216` e Cloudflare run `213` `PASS`.
- Feature SHA remoto: `ffcf96a6c0d8b5c749e953f5fd354f4491a08722`.
- Tree remoto, identico byte-per-byte alla tree revisionata:
  `795bd965d9f773a353f498d724756ef972444e8f`.
- Merge normale: `6ae562c83a6ebcecad93bf53141a13fbcdf0a080`.
- Migration staging remota:
  `20260728055123 task_144_pos_offline_authorization_attestation`, applicata
  dopo entrambi i merge.
- Unico Worker deploy condiviso TASK-144/TASK-145: deployment
  `f0129552-d815-49fb-a2a3-f38c61aaa84f`, version
  `56ec23b1-a5b7-4635-94ff-b2ebaa682d0f`, 100% attiva.
- Acceptance reale staging `STGFE91FF04C`: first-login trusted `PASS`;
  `effectiveOfflineAuthorizationExpiresAt` bounded a `43.200s`, persistita
  identica su sessione e credential e non oltre la session expiry.
- Cleanup: sessione/credential/device revocati, fixture archiviate, residui
  runtime attivi `0`; audit immutabile preservato.
- Production: `NOT_MODIFIED`.
