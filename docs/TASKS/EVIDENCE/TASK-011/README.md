# Evidence - TASK-011 Shop Onboarding Live Gate

## Stato

- Task: `TASK-011 - Shop Onboarding Live Gate`
- Fase: `DONE_RECONCILED`
- Execution: `PASS`
- Data: 2026-05-30
- Commit: `NOT_CREATED` (richiesto no commit)
- Push: `NOT_RUN` (richiesto no push)

## Sintesi

TASK-011 ha validato il flusso live Platform Admin -> create shop -> assign owner -> Shop Admin:

- Account Google indicato dall'utente trovato in Supabase: `PASS`.
- Account visibile nella Platform Admin Console/read model come profilo attivo: `PASS_WITH_NOTES`.
- Account confermato dual-role: `platform_admin` attivo e `shop_owner` sullo shop TASK-011.
- Fix route-specific: `/shop` autorizza da `shop_members` attive, non dal resolver generale che preferisce Platform Admin.
- Shop sintetico creato da `/platform/operations`: `PASS`.
- Membership owner `shop_owner` creata: `PASS`.
- Audit create/owner assign presente: `PASS`.
- Sessione browser owner ottenuta senza stampare token/link: `PASS`.
- Accesso `/shop` come stesso account dual-role: `PASS`.
- Read model `/shop/overview`, `/shop/members`, `/shop/audit`: `PASS`.
- Negative `shop_id` falso: `PASS`.
- Cleanup soft delete: `PASS`.

Risposta alla domanda "lo vedi nel platform master console?": si, l'account indicato e visibile al read model Platform Admin come profilo attivo `Platform Admin`; e anche un `platform_admin` attivo.

## Pre-flight

| Check | Esito | Evidence |
| --- | --- | --- |
| `git status --short` | `PASS` | Repo pulita prima della branch/documentazione TASK-011. |
| `git diff --stat` | `PASS` | Nessun diff iniziale. |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| Branch di lavoro | `PASS` | Creata `codex/task-011-shop-onboarding-live-gate`. |
| TASK-010 committed/pushed | `PASS` | `git log --oneline --decorate -8`: `95c5b3a (HEAD -> codex/task-011-shop-onboarding-live-gate, origin/main, origin/HEAD, main) Complete shop admin read model`. |
| Uncommitted TASK-010 | `PASS` | Nessuna modifica non committata da TASK-010 presente a inizio TASK-011. |

## Letture obbligatorie

| Area | Esito |
| --- | --- |
| Governance: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/MASTER-PLAN.md` | `PASS` |
| Task precedenti: TASK-007, TASK-009, TASK-010 | `PASS` |
| Evidence TASK-011 precedente | `PASS` |
| Auth/routing e Shop Admin read model code | `PASS` |
| Tests foundation/e2e e security scan | `PASS` |
| Next.js docs locali App Router/server components/auth/data security | `PASS` |
| Supabase changelog + docs SSR/Auth | `PASS_WITH_NOTES`, nessun breaking change applicabile al fix; confermata separazione server/client e uso di API auth server-side. |

## Supabase linked discovery

| Check | Esito | Output redatto |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.102.0` |
| `supabase db query --linked --output json "select count(*) from public.profiles"` | `PASS` | `profiles_count=3` |
| Query iniziale `XN197` su `auth.users`, `profiles`, email e metadata auth | `PASS_WITH_NOTES` | 0 candidati; stringa non corrispondeva all'email indicata dopo. |
| Query account Google indicato dall'utente | `PASS` | 1 candidato, `profile_id_prefix=6425adb0`, `display_name=Platform Admin`, `profile_status=active`, `email_confirmed=true`, `email_sha256_12=50094971cb3a`, `active_platform_admin=true`, `active_memberships=0` prima della task. |
| Auth users count | `PASS` | `auth_users_count=3` |

## Fix dual-role

Root cause verificata:

- `src/server/auth/admin-routing.ts` risolve prima `platform_admins` e torna `/platform`.
- `src/server/shop-admin/shop-access.ts` riusava quel resolver, quindi un account dual-role non raggiungeva mai la membership `shop_owner`.
- `src/app/shop/layout.tsx` convertiva `platform_admin` in blocco Shop Admin.

Fix applicato:

- `src/server/shop-admin/shop-access.ts` ora usa `supabase.auth.getUser()` direttamente.
- Il resolver Shop Admin interroga `shop_members` attive per `profile_id=userId` e ruoli `shop_owner` / `shop_manager`.
- I dettagli shop sono letti solo per `shop_id` ottenuti dalle membership autorizzate.
- `src/app/shop/layout.tsx` non ha piu una special-case `platform_admin` per bloccare Shop Admin.
- `src/server/shop-admin/read-model.ts` continua a scegliere lo shop solo da `availableShops`; il query param `shop_id` resta navigazione.
- `/` e `/platform` non sono stati modificati: il default Platform Admin resta invariato.

TDD:

| Check | Esito | Evidence |
| --- | --- | --- |
| `node --test tests/foundation/shop-switcher.test.mjs` RED | `FAIL_EXPECTED` | 1 fail: `auth.getUser()` assente e dipendenza da `resolveCurrentAdminRouteAccess`. |
| `node --test tests/foundation/shop-switcher.test.mjs` GREEN | `PASS` | 4 test passati / 0 falliti. |
| `scripts/security-checks.mjs` aggiornato | `PASS` | Blocca `resolveCurrentAdminRouteAccess` e `.from("platform_admins")` in `shop-access.ts`. |

## Platform Admin Console

| Check | Esito | Evidence |
| --- | --- | --- |
| Sessione browser account owner | `PASS` | OTP/magic link generato e verificato in memoria; cookie SSR impostati; nessun token/link stampato. |
| `/platform/operations` | `PASS` | H1 `Controlled Operations` visibile con sessione owner. |
| `/platform/users` | `PASS_WITH_NOTES` | H1 `Users / Profiles` visibile e `display_name=Platform Admin` presente; la UI non mostra email/id completo, quindi l'identita esatta e confermata dal DB redatto. |
| `/` default Platform Admin | `PASS_BY_EXISTING_RESOLVER_AND_SMOKE` | `resolveCurrentAdminRouteAccess` e `getAdminRouteDestination` invariati; smoke protegge root/access state. |

## TASK011 test data finale

| Check | Esito | Evidence |
| --- | --- | --- |
| Verifica owner prima di creare dati | `PASS` | 1 candidato sicuro. |
| Creazione nuovo shop `TASK011_TEST_...` | `PASS` | `TASK011_TEST_MPT7XWN3ECF5`, shop prefix `5c350e09`. |
| Stato shop dopo create | `PASS` | `active` prima del cleanup. |
| Assegnazione owner `shop_owner` | `PASS` | 1 membership owner attiva. |
| Verifica audit create/owner assign | `PASS` | 2 eventi audit rilevanti. |
| Cleanup soft delete | `PASS` | Stato finale shop `archived`, `archived=true`, 1 evento `platform.shop.soft_delete.success`. |
| Hard delete | `NOT_RUN` | Vietato dal task; non eseguito. |

Query finale redatta sugli ultimi shop TASK011:

```text
latest_shop_code=TASK011_TEST_MPT7XWN3ECF5
latest_shop_id_prefix=5c350e09
latest_shop_status=archived
latest_active_owner_memberships=1
latest_create_owner_audit_events=2
latest_archive_audit_events=1
latest_created_by_prefix=6425adb0
recent_TASK011_shops_archived=true
```

## Browser/live gate

| Fase | Esito | Motivo |
| --- | --- | --- |
| Fase A - Platform Admin access | `PASS` | `/platform/operations` e `/platform/users` raggiunti con sessione reale owner/platform admin. |
| Fase B - Create shop + assign owner | `PASS` | UI `/platform/operations` + RPC TASK-006 verificate via DB/API. |
| Fase C - Login/sessione owner | `PASS_WITH_NOTES` | Sessione ottenuta via OTP/magic link in memoria, non via password; nessun link/token stampato. |
| Fase D - Shop Admin read model | `PASS` | `/shop`, `/shop/overview`, `/shop/members`, `/shop/audit` visibili come owner dual-role. |
| Fase E - Authorization negative tests | `PASS` | `shop_id` falso ignorato; fake id non renderizzato. |
| Fase F - POS/staff credential check | `PASS_WITH_NOTES` | Discovery solo schema/repo, nessuna credenziale creata. |

Comando finale eseguito:

```bash
CONFIRM_TASK011_SHOP_ONBOARDING_LIVE_TEST=yes \
TASK011_OWNER_EMAIL='[REDACTED_BY_EVIDENCE]' \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
PLAYWRIGHT_WEB_SERVER_COMMAND='npm run dev -- --hostname 127.0.0.1 --port 3011' \
PLAYWRIGHT_REUSE_SERVER=0 \
npx playwright test tests/e2e/shop-onboarding-live-gate.spec.ts --project=chromium-desktop --reporter=list
```

Esito finale: `PASS_WITH_WARNINGS`, 1 test passato / 0 falliti. Warning non bloccanti: Node `DEP0205`, `NO_COLOR` ignorato per `FORCE_COLOR`.

## Iterazioni harness

| Tentativo | Esito | Dati creati |
| --- | --- | --- |
| Magic link via callback app | `FAIL` su login page/callback non compatibile con OTP link admin | No |
| OTP SSR cookie + locator generico `Users / Profiles` | `FAIL` per strict mode locator | No |
| OTP SSR cookie + locator fix pre dual-role | `FAIL_EXPECTED_BLOCKER` su ruolo doppio; create/assign/cleanup completati | Si, poi archiviati |
| Resume dual-role + locator shop code generico | `FAIL` per strict mode locator dopo accesso Shop Admin riuscito | Si, poi archiviati |
| Locator `Live shop data` generico | `FAIL` per strict mode locator dopo accesso Shop Admin riuscito | Si, poi archiviati |
| Locator specifici finali | `PASS` | Si, poi archiviati |

## POS/staff credential discovery

| Check | Esito | Evidence |
| --- | --- | --- |
| `rg staff_accounts` su schema/tipi/migrations | `PASS_WITH_NOTES` | Nessun modello `staff_accounts` trovato. |
| `rg staff_code` / PIN/password POS | `PASS_WITH_NOTES` | Nessun flusso credenziale POS completo trovato nello schema Admin Web. |
| Creazione credenziali POS | `NOT_RUN` | Fuori scope e non sicura senza task dedicato. |

Decisione confermata:

- Account owner = login web/personale.
- Staff/POS = flusso futuro separato con `shop_code + staff_code + PIN/password`.
- Nessun account POS o PIN/password e stato creato.

## Check locali finali

| Check | Esito | Note |
| --- | --- | --- |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| `npm run test:foundation` | `PASS` | 36 test passati / 0 falliti. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint + typecheck + security scan + build completati; warning Node `DEP0205` non bloccante. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3012 ... npm run test:ui-smoke -- --project=chromium-desktop` | `PASS_WITH_WARNINGS` | 22 test passati / 0 falliti; warning `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| TASK-011 live gate opt-in | `PASS_WITH_WARNINGS` | 1 test passato / 0 falliti; warning runtime non bloccanti. |

## Supabase linked finali

| Check | Esito | Note |
| --- | --- | --- |
| `supabase --version` | `PASS` | CLI `2.102.0`. |
| `supabase db push --linked --dry-run` | `PASS` | Remote database up to date. |
| `supabase migration list --linked` | `PASS_AFTER_RETRY` | Primo run bloccato da temp login role/circuit-breaker; rerun passato con local/remoto allineati fino a `20260530120000`. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | No schema errors found. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | No issues found. |
| API redatta ultimi shop TASK011 | `PASS` | Tutti gli shop recenti risultano `archived`, membership owner e audit presenti. |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/EVIDENCE/TASK-011/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`
- `scripts/security-checks.mjs`
- `src/app/shop/layout.tsx`
- `src/server/shop-admin/read-model.ts`
- `src/server/shop-admin/shop-access.ts`
- `tests/foundation/shop-switcher.test.mjs`
- `tests/e2e/shop-onboarding-live-gate.spec.ts`

## Conferme negative

- Nessun dato reale, token, password, JWT o magic link salvato o stampato.
- Nessun service role esposto al client/browser.
- Nessun hard delete.
- Nessuna cancellazione audit.
- Nessuna migration.
- Nessuna nuova dipendenza.
- Nessun account finto alternativo creato.
- Nessuna revoca del grant `platform_admin`.
- Nessun POS/staff login o credenziale creata.
- Nessun commit.
- Nessun push.

## Rischi residui

- Gli shop test restano archiviati per audit trail.
- Esistono profili live test precedenti con membership attiva; TASK-011 non li ha modificati.
- Il modello POS/staff resta futuro e non verificato end-to-end.

## Handoff

- Verdict: `DONE_RECONCILED`.
- Stato finale: `DONE`.
- Acceptance criteria: `PASS`.
- Prossima azione: review/commit della tranche corrente, poi apertura di un prossimo task separato.
