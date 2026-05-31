# Evidence - TASK-012 POS Staff Credential Planning / Schema Discovery

## Stato

- Task: `TASK-012 - POS Staff Credential Planning / Schema Discovery`
- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Sintesi

TASK-012 ha prodotto un piano tecnico e di sicurezza per il futuro modulo `POS / Staff`.

Risultati principali:

- Nessun modello Supabase completo `staff_accounts` trovato.
- Nessun `staff_code`, `credential_hash`, `pin_hash`, `password_hash` o login POS trovato nello schema Admin Web.
- Nessuna tabella `devices` autorizzativa trovata.
- `/shop/staff` resta placeholder protetto.
- `Win7POS` contiene un modello locale username + PIN con PBKDF2, lockout, ruoli/permessi e audit, utile come contesto ma non da copiare come schema Supabase.
- Decisione proposta: `staff_accounts` futura separata da `profiles`/`shop_members`, shop-scoped su `shop_id`, login futuro con `shop_code + staff_code + credential`, hashing server-side e RLS/grants severi.
- Nessuna credenziale POS creata.
- Nessuna migration staff creata.
- Review finale completata e task riconciliato a `DONE` su richiesta esplicita dell'utente nel prompt "Review finale TASK-012 - POS Staff Credential Planning / DONE reconciliation".

## Pre-flight

| Check | Esito | Output sintetico |
| --- | --- | --- |
| `date '+%Y-%m-%d %H:%M:%S %Z'` | `PASS` | `2026-05-30 23:45:27 -04` |
| `git status --short` | `PASS` | Nessun output prima di aprire TASK-012. |
| `git diff --stat` | `PASS` | Nessun output prima di aprire TASK-012. |
| `git diff --check` | `PASS` | Nessun output, exit code 0. |
| `git log --oneline --decorate -8` | `PASS` | HEAD iniziale `e5be968 Complete shop onboarding live gate`; `origin/main` su `95c5b3a Complete shop admin read model`. |
| `git branch -vv --no-color` | `PASS_WITH_NOTES` | Branch TASK-011 locale senza upstream; TASK-011 committato localmente, non pushato. |
| Branch TASK-012 | `PASS` | Creata `codex/task-012-pos-staff-credential-planning`. |

## Letture obbligatorie

| Area | Esito |
| --- | --- |
| Governance: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md` | `PASS` |
| Task precedenti `TASK-006`..`TASK-011` e evidence TASK-011 | `PASS` |
| Auth/routing e Shop Admin read model code | `PASS` |
| Supabase generated types e migrations | `PASS` |
| Security scan e foundation/e2e harness | `PASS` |
| Next.js docs locali Server Components, Server Actions, auth e data security | `PASS` |
| Supabase security skill locale | `PASS` |
| Repo sibling `Win7POS` come contesto funzionale | `PASS_WITH_NOTES`, nessuna modifica |
| Fonti esterne OWASP/Supabase/PostgreSQL | `PASS` |

## Supabase linked discovery

| Check | Esito | Output sintetico |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.102.0` |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati fino a `20260530120000`. |
| `supabase db push --linked --dry-run` | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | `No issues found`. |
| `information_schema.tables` linked | `PASS` | Tabelle presenti: `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs`, tabelle inventory/sync legacy e backup; nessuna `staff_accounts` o `devices`. |
| `information_schema.columns` mirato staff/device/credential | `PASS_WITH_NOTES` | Match solo `sync_events.source_device_id`, backup sync e `mapping_state` false positive su pattern `pin`; nessuna colonna staff/PIN/password credential. |

## Discovery locale schema/code

| Area | Esito | Evidence |
| --- | --- | --- |
| `src/lib/supabase/database.types.ts` | `PASS_WITH_NOTES` | Include `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs`; non include `staff_accounts`. |
| `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql` | `PASS_WITH_NOTES` | Crea schema Admin Web e RLS; nessun staff POS. |
| `supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql` | `PASS_WITH_NOTES` | RPC Platform Admin controlled actions; nessun staff POS. |
| `rg staff_accounts/staff_code/credential_hash` | `PASS_WITH_NOTES` | Match solo documentali/placeholder; nessun runtime schema. |
| `/shop/staff` | `PASS_WITH_NOTES` | Placeholder `ShopSectionPage`, nessuna Server Action o mutation. |
| `scripts/security-checks.mjs` | `PASS` | Rafforzato con gate TASK-012 planning. |
| `tests/foundation/pos-staff-credential-planning.test.mjs` | `PASS` | Aggiunto gate statico per TASK-012. |

## Discovery Win7POS

| Fonte | Esito | Sintesi |
| --- | --- | --- |
| `DbInitializer.cs` | `PASS_WITH_NOTES` | SQLite `users`, `roles`, `role_permissions`, `security_events`; `pin_hash`, `pin_salt`, `failed_attempts`, `lockout_until`. |
| `PinHelper.cs` | `PASS_WITH_NOTES` | PBKDF2 locale con salt, 10000 iterazioni. |
| `UserRepository.cs` | `PASS_WITH_NOTES` | Verifica PIN, lockout 5 tentativi / 15 minuti, reset tentativi su login success. |
| `OperatorSession.cs` | `PASS_WITH_NOTES` | Login operator, audit success/failure/locked. |
| `OperatorLoginDialog.xaml.cs` | `PASS_WITH_NOTES` | UI username + PIN, messaggi generici e cambio PIN obbligatorio. |

Interpretazione: Win7POS conferma esigenze funzionali, ma Admin Web deve progettare un modello server-side shop-scoped separato. Nessuna modifica Win7POS.

## Fonti esterne consultate

| Fonte | Uso nel piano |
| --- | --- |
| OWASP Password Storage Cheat Sheet | Algoritmi adattivi, Argon2id preferito, scrypt/bcrypt/PBKDF2 come alternative motivate, work factor, pepper come secret separato. |
| OWASP Authentication Cheat Sheet | Errori generici, throttling, lockout threshold/window/duration e rischio denial-of-service da lockout. |
| Supabase RLS docs | RLS come boundary DB; security definer helper con cautela e non in schema esposto. |
| Supabase API keys docs | Publishable vs secret/service keys; secret/service bypass RLS e non va mai in browser. |
| Supabase secrets/env docs | Segreti in env/secrets manager, non in Git. |
| PostgreSQL `pgcrypto` docs | `crypt()`/`gen_salt()` disponibili, ma senza Argon2id; DB-side hashing solo fallback consapevole. |

Review fonti 2026-05-30: `PASS`. Le fonti sono ancora coerenti con il piano: OWASP preferisce hashing adattivo e vieta plaintext/fast hash, OWASP Authentication include throttling/lockout, Supabase conferma RLS/service-key boundary, PostgreSQL documenta `pgcrypto.crypt()`/`gen_salt()` senza Argon2id.

## Review finale / DONE reconciliation

| Area | Esito | Sintesi |
| --- | --- | --- |
| Planning-only | `PASS` | TASK-012 resta discovery/planning, non execution runtime. |
| Separazione account | `PASS` | Account personale web e staff POS restano identita separate. |
| POS/Staff placement | `PASS` | POS/Staff resta modulo interno della Shop Admin Console, non terza console. |
| Runtime/migration | `PASS` | Nessun login POS, staff account, credential reale, migration, RPC staff o Server Action staff introdotti. |
| Repo-grounded scan | `PASS_WITH_NOTES` | Occorrenze `staff_accounts`, `staff_code`, `credential_hash`, PIN/password e POS sono documentali, placeholder UI o test/harness; schema/tipi/runtime non implementano staff credentials. |
| Placeholder sicuri | `PASS` | Usati placeholder `<TEMP_CREDENTIAL_SHOWN_ONCE>`, `<NOT_STORED>` e `<REDACTED>`; vietati esempi concreti pericolosi come credential. |
| Security harness | `PASS` | Rafforzato per bloccare esempi credential pericolosi, `credential_hash` in UI/client e staff credential runtime in `src/server/shop-admin`. |
| Foundation test | `PASS` | Rafforzato per coprire planning-only, placeholder, separazione account, no runtime/migration e future implementation gating. |

Fix applicati durante la review:

- `tests/foundation/pos-staff-credential-planning.test.mjs`: aggiunti assert su stato `DONE_RECONCILED`, placeholder redatti, separazione account, POS/Staff come modulo Shop Admin, no runtime staff credential in `src/server/shop-admin`, no hash credential in UI.
- `scripts/security-checks.mjs`: rafforzato `checkTask012PosStaffCredentialPlanning()` con gate meno decorativi e piu contrattuali.
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`: aggiunti placeholder sicuri e review finale.
- `docs/MASTER-PLAN.md` e `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`: riconciliazione a `DONE`.

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- `docs/TASKS/EVIDENCE/TASK-012/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`
- `scripts/security-checks.mjs`
- `tests/foundation/pos-staff-credential-planning.test.mjs`

## Check finali

| Check | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/pos-staff-credential-planning.test.mjs` | `PASS` | Gate TASK-012 dedicato. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit`. |
| `npm run lint` | `PASS` | ESLint completato. |
| `npm run security:scan` | `PASS` | Include gate TASK-012. |
| `npm run test:foundation` | `PASS` | 41 test passati / 0 falliti. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build completata; warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint + typecheck + security scan + build completati; warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `NOT_RUN_NOT_NEEDED` | TASK-012 non modifica componenti, routing o UI runtime. |
| `supabase migration list --linked` review rerun | `PASS_AFTER_RETRY` | Un rerun parallelo ha attivato temporaneamente `ECIRCUITBREAKER`; rerun seriale passato, local/remoto allineati fino a `20260530120000`. |
| `supabase db push --linked --dry-run` review rerun | `PASS` | `Remote database is up to date.` |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` review rerun | `PASS_AFTER_RETRY` | Rerun seriale passato, `No schema errors found`. |
| `supabase db advisors --linked --type security --level error --fail-on error` review rerun | `PASS_AFTER_RETRY` | Rerun seriale passato, `No issues found`. |
| `git diff --check` | `PASS` | Nessun whitespace error. |
| `git status --short` | `PASS_WITH_NOTES` | Solo file TASK-012 modificati/aggiunti. |

## Conferme negative

- Nessun dato reale, token, password, PIN, JWT, magic link o credential salvato.
- Nessun esempio concreto pericoloso usato come credenziale; solo `<TEMP_CREDENTIAL_SHOWN_ONCE>`, `<NOT_STORED>` e `<REDACTED>`.
- Nessun service-role esposto al client/browser.
- Nessun account POS creato.
- Nessun `staff_accounts` creato.
- Nessun `staff_code` live creato.
- Nessuna migration staff creata.
- Nessuna RPC staff creata.
- Nessuna Server Action staff creata.
- Nessuna modifica Android/iOS/POS/Win7POS.
- Nessuna nuova dipendenza.
- Nessun commit.
- Nessun push.

## Rischi residui

- Algoritmo finale richiede decisione execution e benchmark.
- PIN brevi sono rischiosi senza device gate/rate limiting robusto.
- `roles`/`permissions` Admin Web fisici non esistono ancora; staff roles vanno introdotti con schema dedicato o check constraint iniziale.
- Win7POS compatibility/import richiede task separato.

## Handoff

- Verdict finale: `DONE_RECONCILED`.
- Stato finale: `DONE`.
- Prossima fase: nessun task attivo; eventuale `TASK-013 - POS Staff Credentials Schema Foundation` va aperto come task separato.
