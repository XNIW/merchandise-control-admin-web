# TASK-073 Evidence - Account identity display globale

## Stato

- Fase: `DONE`
- Data apertura: `2026-06-19`
- Closure review: `2026-06-19`
- Handoff: `DONE_CLOSURE_REVIEW`

## Evidence incrementale

- Letti `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md`,
  `package.json`, task attivo, brief allegato e guide Next locali pertinenti.
- Schema verificato: `profiles` non contiene email/provider; provider/email
  arrivano solo tramite boundary server-side Supabase Auth con DTO minimo.
- Vincoli confermati: Shop Admin resta shop-scoped; Staff POS resta separato
  dagli account personali; nessun service-role nel client/browser.
- Implementato modello `AccountIdentitySummary` e componente riusabile
  `AccountIdentity` senza nuove dipendenze.
- Provider letto da Supabase Auth server-side DTO:
  `app_metadata.provider` e `user.identities[].provider`. Provider mancante
  resta `unknown`; nessuna deduzione da dominio email.
- Shop Admin usa lookup Auth bounded by profile id gia visibili nello shop
  selezionato; non scansiona globalmente gli utenti Auth da Shop Admin.
- Le tabelle Admin/Platform/Shop accettano celle strutturate identity e usano
  `AccountIdentity` solo quando `kind === "account_identity"`.
- Root `app/` vuota e non tracciata rimossa con `rmdir -p` durante la prima
  implementazione per evitare che Next 16 ignorasse `src/app` durante
  `next typegen` / build.

## Fix closure

- `BLOCKED_TASK035_DEVICE_CREATE` risolto applicando migrazioni locali pendenti
  con `supabase migration up --local`:
  `20260619044500_task_069_sync_events_compacted_changed_count.sql`,
  `20260619123000_task_072_device_auto_registration.sql`,
  `20260619173000_task_072_device_authorization_status.sql`.
- `scripts/testing/run-playwright-target.mjs` ricarica la schema cache
  PostgREST locale con `notify pgrst, 'reload schema';` dopo il caricamento env.
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` stabilizza seed
  device/audit, aggiunge screenshot TASK-073 e cleanup locale audit via `psql`
  senza cambiare il runtime append-only.
- `tests/e2e/task-064-platform-users-auth-profile-parity.spec.ts` aggiorna le
  aspettative legacy alla directory account personali corrente e produce
  screenshot su Users, Platform Admins, Shop Admins e Shop detail/ownership.
- Detail/ownership platform renderizza `AccountIdentitySummary` strutturato
  senza mostrare `[object Object]` e preservando testo cercabile/accessibile.

## Check

| Check | Esito | Note |
|---|---|---|
| `npm run lint` | `PASS` | 0 errori, 8 warning noti in file TASK-072/history. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `node --test tests/foundation/task-073-account-identity-display.test.mjs` | `PASS` | 3/3. |
| `npm run test:foundation` | `PASS` | 390/390. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3061 PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3061" npm run test:shop:local` | `PASS` | 5/5. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3060" npm run test:platform:local-users` | `PASS` | 1/1. |
| `npm run verify` | `PASS` | Include lint/typecheck/security/build. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short` | `PASS_DIRTY_WORKTREE_EXPECTED` | Dirty worktree include modifiche TASK-073 e modifiche TASK-072 preesistenti/non correlate. Nessuno stage, commit o push. |

## Screenshot / browser evidence

- Shop Admin Members: `docs/TASKS/EVIDENCE/TASK-073/browser-shop-members-account-identity.png`
- Shop Admin Audit: `docs/TASKS/EVIDENCE/TASK-073/browser-shop-audit-account-identity.png`
- Master Console Users: `docs/TASKS/EVIDENCE/TASK-073/browser-platform-users-account-identity.png`
- Master Console Platform Admins: `docs/TASKS/EVIDENCE/TASK-073/browser-platform-admins-account-identity.png`
- Master Console Shop Admins: `docs/TASKS/EVIDENCE/TASK-073/browser-platform-shop-admins-account-identity.png`
- Master Console Shop detail / ownership: `docs/TASKS/EVIDENCE/TASK-073/browser-platform-shop-detail-ownership-account-identity.png`

Browser plugin note: il setup e stato tentato, ma il webview attach e andato
in timeout. La verifica visuale e stata quindi eseguita con Playwright
autenticato e screenshot salvati nei file sopra.

## File TASK-073 principali

- `scripts/testing/run-playwright-target.mjs`
- `src/lib/account-identity.ts`
- `src/components/account/AccountIdentity.tsx`
- `src/server/platform-admin/auth-identities.ts`
- `src/server/platform-admin/platform-section-data.ts`
- `src/app/platform/admins/page.tsx`
- `src/server/shop-admin/read-model.ts`
- `src/server/shop-admin/audit-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/components/admin/AdminDataTable.tsx`
- `src/components/platform/PlatformMasterDetail.tsx`
- `src/components/platform/PlatformPage.tsx`
- `src/components/platform/components/DataTable.tsx`
- `src/components/platform/platformData.ts`
- `src/components/shop/shopSections.ts`
- `src/i18n/translate-sections.ts`
- `src/i18n/dictionaries.ts`
- `tests/foundation/task-073-account-identity-display.test.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`
- `tests/e2e/task-064-platform-users-auth-profile-parity.spec.ts`

## Verdict

`DONE`. Shop Admin Members/Audit e Master Console Users/Admins/Shop
detail/ownership mostrano email o display name come informazione primaria,
provider con icona e profile id secondario. Staff POS non e stato fuso con
account personale.
