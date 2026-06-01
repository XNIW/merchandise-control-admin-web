# TASK-019 Evidence

## Stato corrente

- Task: `TASK-019 - POS Auth Foundation Implementation`
- Stato task: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura: `2026-05-31`
- Commit/push/stage: `NOT_RUN_BY_REQUEST`
- Verdict Codex: `DONE`

## Letture obbligatorie

- `AGENTS.md`: `PASS`
- `CLAUDE.md`: `PASS`
- `README.md`: `PASS`
- `docs/MASTER-PLAN.md`: `PASS`
- `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md`: `PASS`
- `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md`: `PASS`
- `docs/TASKS/TASK-015-complete-shop-admin-console.md`: `PASS`
- `docs/TASKS/TASK-016-complete-platform-admin-console.md`: `PASS`
- `docs/TASKS/TASK-017-shop-business-completion.md`: `PASS`
- `docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md`: `PASS`
- `docs/TASKS/EVIDENCE/TASK-015/README.md`: `PASS`
- `docs/TASKS/EVIDENCE/TASK-016/README.md`: `PASS`
- `docs/TASKS/EVIDENCE/TASK-017/README.md`: `PASS`
- `docs/TASKS/EVIDENCE/TASK-018/README.md`: `PASS`
- Supabase migrations esistenti: `PASS`
- `src/server/shop-admin/`: `PASS`
- `src/app/shop/`: `PASS`
- `src/components/shop/`: `PASS`
- `scripts/security-checks.mjs`: `PASS`
- `tests/foundation/*`: `PASS`

## Guide Next.js locali lette

- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/02-guides/forms.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`

Sintesi: Server Actions e Server Functions sono entrypoint POST raggiungibili; ogni action deve rieseguire auth/authz server-side, validare input e restituire solo DTO minimi.

## Discovery schema iniziale

| Area | Esito | Evidence |
| --- | --- | --- |
| `staff_accounts` | `PASS` | Tabella esistente da TASK-014 con `staff_code`, `status`, `credential_hash`, `credential_kind`, `credential_updated_at`, `credential_expires_at`, `must_change_credential`, `failed_attempts`, `locked_until`, `last_login_at`. |
| `staff_accounts_safe` | `PASS` | View safe esistente senza `credential_hash`. |
| Staff RPC | `PASS_WITH_NOTES` | TASK-015 espone create/reset/suspend/reactivate/archive con self-authorization DB-side; reset/suspend non richiedono ancora reason a livello DB. |
| Device registry | `PASS` | `shop_devices` esiste da TASK-015; nessuna integrazione POS client in scope. |
| Shop membership | `PASS` | Helper `app_private.is_active_shop_staff_admin_member` autorizza owner/manager per staff operations. |
| Audit helper | `PASS_WITH_NOTES` | `app_private.write_shop_admin_audit` esiste; alcuni RPC staff salvano ancora reason redatta come testo troncato invece di metadata solo strutturato. |

## Check eseguiti

| Check | Esito | Evidence sintetica |
| --- | --- | --- |
| `node --test tests/foundation/task-019-pos-auth-foundation.test.mjs` | `PASS` | `4/4` test passati. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `100/100` test passati. |
| `npm run typecheck` | `PASS` | `next typegen` completato e `tsc --noEmit` senza errori. |
| `npm run lint` | `PASS` | `eslint` exit 0. |
| `npm run build` | `PASS_WITH_NOTES` | Build Next completata; warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_NOTES` | `lint`, `typecheck`, `security:scan` e `build` passati; stesso warning Node `DEP0205`. |
| `npm run test:ui-smoke` | `PASS_WITH_NOTES` | `86/86` Playwright passati; warning runtime Node/NO_COLOR non bloccanti. |
| `npm run test:ui-smoke:ci` | `PASS_WITH_NOTES` | `43/43` Playwright passati con `next start` su `127.0.0.1:3003`; warning runtime Node/NO_COLOR non bloccanti. |
| `supabase migration list --linked` | `PASS` | Local/Remote allineati fino a `20260601000500`. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked` | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security` | `PASS_WITH_NOTES` | Exit 0; warning noti su RPC `SECURITY DEFINER` callable da `authenticated` e Auth leaked-password protection disabilitata provider-side. |
| `git diff --check` | `PASS` | Exit 0, nessun whitespace error. |
| `git diff --cached --name-only` | `PASS` | Output vuoto, nessun file staged. |
| `git status --short --branch` | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche TASK-019 non staged e non committate, come richiesto. |

Nota Supabase: un primo lancio parallelo dei linked checks ha prodotto `ECIRCUITBREAKER` temporaneo sul pooler per troppe autenticazioni concorrenti; i comandi sono poi stati rieseguiti in sequenza con esito positivo.

## Implementazione

### Migration applicata

- `supabase/migrations/20260531235900_task_019_pos_auth_foundation.sql`
- `supabase/migrations/20260601000500_task_019_staff_safe_view_grants.sql`
- Applicate al progetto Supabase linked con `supabase db push --linked`.
- Tipi rigenerati da Supabase linked in `src/lib/supabase/database.types.ts`.

### Tabelle, view, helper e RPC coinvolti

- `public.staff_accounts`: aggiunti `credential_version`, `credential_status`, `session_invalidated_at`.
- `public.staff_accounts_safe`: aggiornata con soli campi credential safe, senza `credential_hash`.
- Grant colonnare safe: `credential_version`, `credential_status`, `session_invalidated_at` selezionabili da `authenticated` per supportare la view `security_invoker`, senza grant mutativi.
- `app_private.shop_admin_reason_metadata(text)`: helper redatto per audit metadata.
- `public.shop_staff_create(...)`: aggiornata per inizializzare version/status credential.
- `public.shop_staff_reset_credential(...)`: nuova firma con `p_reason` obbligatorio, incrementa version, invalida session marker e non espone hash.
- `public.shop_staff_suspend(...)`, `public.shop_staff_reactivate(...)`, `public.shop_staff_archive(...)`: reason obbligatoria e audit redatto.
- `public.shop_staff_force_credential_rotation(...)`: nuovo RPC DB-authorized per forzare rotazione.
- `public.shop_staff_clear_lockout(...)`: nuovo RPC DB-authorized per azzerare lockout.

## Review finale / reconciliation

| Finding | Impatto | Fix |
| --- | --- | --- |
| `BUG-019-R1` | `staff_accounts_safe` e `security_invoker`; le nuove colonne safe erano nella view ma non avevano grant colonnari sul base table, quindi il read model poteva fallire in runtime per utenti `authenticated`. | Aggiunta e applicata `20260601000500_task_019_staff_safe_view_grants.sql` con `grant select` solo su `credential_version`, `credential_status`, `session_invalidated_at`. |
| `BUG-019-R2` | `credential_status` poteva perdere lo stato `locked` in reactivate/force rotation se `locked_until` era ancora futuro. | Ricreate `shop_staff_reactivate` e `shop_staff_force_credential_rotation` con precedenza a `locked`. |
| `FRAGILITY-019-R3` | `staffId` e `reason` erano validati con trim ma potevano essere passati alle RPC non normalizzati. | Normalizzazione server-side in `src/server/shop-admin/staff-mutations.ts`. |
| `HARNESS-019-R4` | Scanner/test non bloccavano il grant safe view mancante, una console POS separata generica o la reconciliation a `DONE_RECONCILED`. | Rafforzati `scripts/security-checks.mjs` e `tests/foundation/task-019-pos-auth-foundation.test.mjs`. |

### Admin Web

- `src/server/shop-admin/staff-mutations.ts`: azioni server-side reasoned, permission check `staff.manage`, RPC allowlist e one-time credential handling.
- `src/server/shop-admin/staff-read-model.ts`: DTO safe con `credentialStatus`, `credentialVersion`, `sessionInvalidatedAt`.
- `src/server/shop-admin/shop-section-data.ts`: stato credenziale safe visibile nel modulo Shop Admin.
- `src/app/shop/actions.ts`: Server Actions per reset, force rotation, clear lockout e azioni sensibili reasoned.
- `src/app/shop/_components/StaffActionPanel.tsx`: controlli Shop Admin per reset credential, suspend/reactivate/archive, force rotation e clear lockout.
- `src/app/shop/_components/ActionResultBanner.tsx`: messaggio safe per `reason_required`.

### Harness

- `scripts/security-checks.mjs`: gate TASK-019 per hash redaction, no endpoint POS login pubblico, no service-role client/browser, RPC DB-authorized, reason obbligatoria e audit redatto.
- `tests/foundation/task-019-pos-auth-foundation.test.mjs`: test foundation dedicato TASK-019.
- Test storici TASK-014/TASK-018/UI polish aggiornati solo per accettare TASK-019 come task attivo/in review.

## Fuori scope confermato

- Nessun endpoint pubblico `/api/pos/login`.
- Nessuna app Android POS login reale.
- Nessuna app iOS POS login reale.
- Nessun client Win7 POS login reale.
- Nessun sync reale.
- Nessuna sessione runtime POS completa.
- Nessuna email delivery.
- Nessun WeChat, Google o Apple login.
- Nessuna console POS separata.
- Nessun modello `merchant -> stores`.
- Nessun commit o push TASK-019.

## Rischi residui

- Nessun login POS reale verra implementato in TASK-019.
- Nessun client Android/iOS/POS verra modificato.
- Session invalidation immediata resta foundation marker, non session store runtime.
- Gli advisors Supabase continuano a segnalare warning generici sulle RPC `SECURITY DEFINER` eseguibili da `authenticated`; le RPC TASK-019 sono intenzionalmente callable e si auto-autorizzano DB-side tramite membership shop-scoped.
- Auth leaked-password protection e ancora una configurazione provider-side fuori scope TASK-019.

## Cleanup e prossimo passo

- File temporanei/log/artifact inutili: `PASS`, nessun artifact TASK-019 tracciato.
- Secret esposti: `PASS`, nessun secret introdotto.
- Stage finale: `NOT_RUN_BY_REQUEST`, `git diff --cached --name-only` vuoto.
- Commit/push: `NOT_RUN_BY_REQUEST`.
- Prossimo passo concreto: review umana del diff TASK-019 e, se approvato, commit separato senza includere artifact locali.
