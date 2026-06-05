# Evidence TASK-044 - Platform provisioning UX, runtime and Operations cleanup

- Task: `TASK-044 - Platform provisioning UX, runtime and Operations cleanup`
- Stato: `DONE_RECONCILED`
- Fase: `DONE_RECONCILED`
- Branch: `codex/task-042-review-ci-win7pos-bridge`
- Verdict: `AUTO_RECONCILED_TASK045`

## Evidence Di Diagnosi

- Root cause doppio submit: `src/app/platform/provisioning/page.tsx` usava form server-side senza `useFormStatus` per create shop e pending owner invite.
- Root cause sidebar flicker: `src/app/platform/loading.tsx` renderizzava `AppShell activeSection="overview"`.
- Root cause Operations: `src/app/platform/operations/page.tsx` duplicava create shop, pending owner invite e Platform Admin grant/revoke.
- Root cause manager error: `src/server/platform-admin/staff-manager-provisioning.ts` collassava boundary DB diversi in `db_failure` / `Request could not be completed.` Il Playwright TASK-044 con Supabase locale process-only ha poi confermato che schema e ruolo `manager` + permesso `shop_admin.full_access` sono pronti; la failure manuale non era riprodotta come mismatch schema/ruolo, ma il vecchio codice non rendeva diagnosticabile quale boundary avesse fallito.

## Evidence Di Fix

- `src/components/platform/PendingSubmitButton.tsx`: pending submit disabilitato via `useFormStatus`.
- `src/app/platform/provisioning/page.tsx`: result banner, `returnTo=/platform/provisioning`, messaggi success/error e pending labels.
- `src/app/platform/operations/actions.ts`: `safeReturnTo` allowlistato e revalidate di `/platform/provisioning`.
- `src/components/platform/PlatformSidebarNav.tsx`: active state da pathname e click ottimistico derivato dall'origin pathname; rimosso il reset `setState` in effect dopo il rosso `react-hooks/set-state-in-effect`.
- `src/app/platform/loading.tsx`: skeleton neutro senza Overview forzato e senza `Rendering...`.
- `src/app/platform/operations/page.tsx`: solo shop lifecycle, emergency devices e audit preview.
- `src/server/platform-admin/staff-manager-provisioning.ts`: codici redatti specifici `shop_read_failed`, `staff_read_failed`, `permission_write_failed`, `staff_write_failed`, `audit_write_failed`.

## Test Aggiunti

- Foundation: `tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs`.
- Playwright gated: `tests/e2e/task-044-platform-provisioning-ux-runtime.spec.ts`.
- Gate e2e: `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes` con Supabase locale process-only.

## Check Finali

- `node --test tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs`: `PASS`, `tests 5`, `pass 5`, `fail 0`.
- `npm run security:scan`: `PASS`.
- `npm run test:foundation`: `PASS`, `tests 193`, `pass 193`, `fail 0`.
- `npm run lint`: `PASS`; primo run fresco aveva fallito su `react-hooks/set-state-in-effect` in `PlatformSidebarNav`, poi corretto e rilanciato con exit 0.
- `npm run typecheck`: `PASS`.
- `npm run build`: `PASS`, compiled successfully; warning noti Next `middleware`/`proxy` e Node `DEP0205`.
- `npm run verify`: `PASS`, lint + typecheck + security scan + build.
- `git diff --check`: `PASS`, output vuoto.
- Playwright TASK-044 runtime: `PASS`, `2 passed`, eseguito con `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3046`, Supabase locale process-only.
- Primo tentativo Playwright con `.env.local`: `BLOCKED_TASK044_REQUIRES_LOCAL_SUPABASE_URL`; non usato come risultato finale perche `.env.local` non puntava a Supabase locale.

## Riconciliazione Finale 2026-06-05

- Decisione: `AUTO_RECONCILED_TASK045`.
- Task finale: `TASK-045 - Platform Master Console final automated review and DONE reconciliation`.
- Gate: `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`.
- Esito TASK-045: `PASS`, `1 passed`.
- Copertura finale: Master Platform Console route smoke, Provisioning create/duplicate/pending/manager, Admins, Operations cleanup, sidebar navigation, logout e cleanup operativa.
- Stato finale TASK-044: `DONE_RECONCILED`.

## Rischi Residui

- La prova manuale Platform Admin e stata sostituita dal gate automatizzato `TASK-045` richiesto dall'utente.
- Il Playwright runtime TASK-044 resta gated per evitare uso accidentale di ambienti non locali.
- Nessuna credenziale, token o secret e stata salvata in file.

## Git

- No commit eseguito.
- No push eseguito.
- Stato staging finale richiesto: `NOT_STAGED`.

## Stato Finale

- TASK-044 e `DONE_RECONCILED`.
- Win7POS live E2E: `NOT_RUN`.
- Sales Sync live: `NOT_RUN`.
