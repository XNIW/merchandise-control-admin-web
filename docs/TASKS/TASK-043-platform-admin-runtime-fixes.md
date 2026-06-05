# TASK-043 - Platform Admin runtime fixes

## Informazioni generali

- ID: `TASK-043`
- Titolo: `Platform Admin runtime fixes: RLS read model, provisioning, logout and navigation latency`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-05`
- Ultimo aggiornamento: `2026-06-05`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-043/README.md`
- Branch Admin Web: `codex/task-042-review-ci-win7pos-bridge`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN_USER_REQUESTED_NO_PUSH`
- Stage: `NOT_STAGED`
- No commit eseguito.
- No push eseguito.
- No stage finale.

## Obiettivo

Risolvere i blocchi runtime manuali della Master Platform Console su:

- `/platform`
- `/platform/users`
- `/platform/shops`
- `/platform/provisioning`
- `/platform/audit`
- `/platform/system`

Il task e riconciliato tramite review automatizzata finale `TASK-045` su richiesta esplicita utente del 2026-06-05.

## Root cause

Il server-side Platform Admin layout e la role check funzionavano: una sessione `platform_admin` locale riusciva a leggere le tabelle core tramite RLS.

Il blocco era nel read model: la query opzionale a `staff_accounts_safe` falliva con `42501 permission denied for table staff_accounts`, ma quel failure veniva trattato come errore fatale insieme alle query core. Di conseguenza tutte le sezioni Platform mostravano `Read blocked` e `/platform/provisioning` restava indisponibile anche quando la sessione Platform Admin era valida.

## Fix applicati

- `staff_accounts_safe` e ora un warning diagnostico non fatale in `readIssues`.
- Le query core restano fail-closed: profili, shop, membership, audit, device e sync bloccano ancora il read model se falliscono.
- `staff_schema_status` segnala `BLOCKED` quando il safe staff view non e leggibile, ma le pagine core continuano a renderizzare.
- `/platform/system` e `/platform/data` espongono la diagnostica del safe staff read model senza mostrare secret o dettagli sensibili.
- `/platform/provisioning` usa `readModel.reason` negli stati non-ready ed elimina il messaggio generico che confondeva sessione assente e read model bloccato.
- La shell Platform espone un link visibile `Logout` verso `/auth/logout`, che usa la route server esistente con `signOut()` e redirect.
- Le fetch indipendenti del read model Platform sono eseguite in batch con `Promise.all`, mantenendo limiti espliciti per ogni select.
- Aggiunto `src/app/platform/loading.tsx` per feedback immediato durante navigazione App Router.
- `AuthForm` mantiene `method="post"`.

## File toccati

- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/components/platform/AppShell.tsx`
- `src/app/platform/provisioning/page.tsx`
- `src/app/platform/loading.tsx`
- `tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs`
- `tests/e2e/task-043-platform-admin-runtime.spec.ts`
- `docs/TASKS/TASK-043-platform-admin-runtime-fixes.md`
- `docs/TASKS/EVIDENCE/TASK-043/README.md`
- `docs/MASTER-PLAN.md`

## Acceptance criteria

- `/platform`, `/platform/users`, `/platform/shops`, `/platform/audit`, `/platform/system` non devono mostrare `Read blocked` quando la sessione server e `platform_admin` e le query core passano.
- `/platform/provisioning` deve renderizzare i form quando il read model core e `ready`.
- Failure `staff_accounts_safe` resta visibile come diagnostica non fatale, non come blocco globale.
- La Platform shell deve esporre `Logout`.
- La navigazione Platform deve restare client-side con feedback di loading e senza full reload nel test Playwright.
- Nessun secret, token, password, service role o dati reali nel repository.
- Nessun commit, push o stage.

## Evidence sintetica

- Discovery RLS locale: core Platform read model `PASS`; `staff_accounts_safe` `BLOCKED_42501`.
- Test foundation TASK-043 creato in red e poi portato in green.
- Test Playwright TASK-043 creato in red contro UI runtime locale e poi portato in green su Supabase locale process-only.
- Final review `TASK-045`: `PASS`, `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`, `AUTO_RECONCILED_TASK045`.
- Check finali: vedere evidence `docs/TASKS/EVIDENCE/TASK-043/README.md`.

## Rischi residui

- La grant/RLS sottostante di `staff_accounts_safe` resta da correggere in un task dedicato se la vista staff deve essere disponibile a Platform Admin.
- Il test Playwright runtime richiede Supabase locale e service role solo in environment process-only; non viene eseguito automaticamente senza `CONFIRM_TASK043_PLATFORM_RUNTIME_TEST=yes`.
- Nessun deploy production eseguito.

## Prossima fase

- `TASK-043` chiuso come `DONE_RECONCILED` tramite `TASK-045`.
- Follow-up separato consigliato: grant/RLS completa per `staff_accounts_safe`, se la vista staff deve diventare disponibile a Platform Admin.
