# TASK-044 - Platform provisioning UX, runtime and Operations cleanup

- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile: `REVIEWER`
- Branch: `codex/task-042-review-ci-win7pos-bridge`
- Evidence: `docs/TASKS/EVIDENCE/TASK-044/README.md`
- Verdict corrente: `AUTO_RECONCILED_TASK045`

## Scopo

Risolvere i problemi runtime segnalati nella Master Platform Console senza introdurre nuove dipendenze, mock data, colonne/tabelle inventate, secret o credenziali hardcoded.

## Root Cause

- Provisioning usava server forms senza pending state per create shop e pending owner invite, quindi un doppio click poteva inviare due Server Action prima del redirect.
- `src/app/platform/loading.tsx` montava `AppShell activeSection="overview"`, causando flicker della sidebar verso Overview durante le navigazioni.
- Operations duplicava superfici gia dedicate: create shop / pending owner invite in Provisioning e grant/revoke in Admins.
- Il provisioning POS manager collassava piu boundary DB in `db_failure` / messaggio generico. Il percorso schema locale e risultato pronto nel Playwright TASK-044; la failure manuale non era un mismatch `manager`/`shop_admin.full_access` riproducibile con env locale corretta, ma la UI non dava una causa redatta utile.
- Le action create shop / pending owner invite redirigevano sempre a `/platform/operations`, anche quando lanciate da `/platform/provisioning`.

## Fix Implementati

- Aggiunto `PendingSubmitButton` con `useFormStatus` per disabilitare il submit durante la Server Action.
- Provisioning ora mostra result banner su `/platform/provisioning`, usa `returnTo` allowlistato e messaggi specifici per success/error.
- Aggiunto `PlatformSidebarNav` client-aware con `usePathname` e active state ottimistico derivato dall'origin pathname, senza reset `setState` in effect.
- `loading.tsx` non forza piu Overview e non espone label `Rendering...`.
- Operations ora resta focalizzata su lifecycle, restore, emergency device e audit preview.
- POS manager provisioning espone codici redatti specifici: `shop_read_failed`, `staff_read_failed`, `permission_write_failed`, `staff_write_failed`, `audit_write_failed`.
- Aggiunti test foundation e Playwright gated `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes`.

## File Toccati

- `src/components/platform/PendingSubmitButton.tsx`
- `src/components/platform/PlatformSidebarNav.tsx`
- `src/components/platform/AppShell.tsx`
- `src/app/platform/loading.tsx`
- `src/app/platform/provisioning/page.tsx`
- `src/app/platform/provisioning/StaffManagerProvisioningPanel.tsx`
- `src/app/platform/operations/page.tsx`
- `src/app/platform/operations/actions.ts`
- `src/server/platform-admin/staff-manager-provisioning.ts`
- `src/server/platform-admin/action-types.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/components/platform/platformData.ts`
- `src/app/platform/admins/page.tsx`
- `scripts/security-checks.mjs`
- `tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs`
- `tests/e2e/task-044-platform-provisioning-ux-runtime.spec.ts`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/EVIDENCE/TASK-044/README.md`

## Check Richiesti

- `npm run security:scan`: `PASS`.
- `npm run test:foundation`: `PASS`, `tests 193`, `pass 193`, `fail 0`.
- `npm run lint`: `PASS`.
- `npm run build`: `PASS`, warning noti Next `middleware`/`proxy` e Node `DEP0205`.
- `npm run verify`: `PASS`.
- `git diff --check`: `PASS`, output vuoto.
- `npm run typecheck`: `PASS`.
- Playwright TASK-044: `PASS`, `2 passed`, eseguito con `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes` e Supabase locale process-only.
- Playwright TASK-045 final review: `PASS`, `1 passed`, eseguito con `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes` e Supabase locale process-only.

## Riconciliazione Finale 2026-06-05

- Decisione: `AUTO_RECONCILED_TASK045`.
- Task finale: `TASK-045 - Platform Master Console final automated review and DONE reconciliation`.
- Stato finale TASK-044: `DONE_RECONCILED`.
- La prova manuale utente e stata sostituita dalla review automatizzata richiesta dall'utente nel prompt del 2026-06-05.
- Win7POS live E2E e Sales Sync live restano fuori scope e non sono dichiarati `PASS`.

## Stati Non Completati

- Win7POS live E2E: `NOT_RUN`.
- Sales Sync live: `NOT_RUN`.
- Nessun commit eseguito.
- Nessun push eseguito.
- Stato staging git: `NOT_STAGED` richiesto.

## Criteri Di Accettazione

- Nessun doppio submit visibile su Provisioning create shop / pending invite.
- Nessun stato stuck `Rendering...` dopo success/error.
- Errori action chiari e redatti.
- Provision POS manager web access funzionante con schema corrente o errore tecnico specifico.
- Sidebar non torna a Overview durante navigazione.
- Operations non duplica Provisioning/Admins.
- Stato finale `DONE_RECONCILED` tramite `TASK-045`; follow-up esterni restano parcheggiati su `TASK-041`/`TASK-042`.
