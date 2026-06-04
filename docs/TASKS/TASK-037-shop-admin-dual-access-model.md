# TASK-037 - Shop Admin dual access model

## Informazioni generali

- ID: `TASK-037`
- Titolo: `Shop Admin dual access model: personal account and POS manager login`
- Stato: `DONE`
- Fase: `DONE`
- Responsabile attuale: `COMPLETED`
- Data apertura: `2026-06-03`
- Branch Admin Web: `main`
- Evidence: `docs/TASKS/EVIDENCE/TASK-037/README.md`
- Architecture doc: `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`
- Migration: `NOT_CREATED`
- Commit: `COMMITTED_BY_USER_REQUEST`
- Push: `PUSHED_BY_USER_REQUEST`
- Verdict corrente: `DONE`

## Obiettivo

Verificare, documentare e preparare in modo repo-grounded il modello dual access della Shop Admin Console:

1. `personal_account`: account personale collegato allo shop tramite `shop_members`;
2. `pos_staff_manager`: futuro accesso staff POS manager con `shop_code + staff_code + credential`.

## Decisione prodotto registrata

La Shop Admin Console deve supportare due modalita di accesso distinte:

- `personal_account`, multi-shop, per owner/manager con account personale web;
- `pos_staff_manager`, single-shop, per clienti POS/Win7 coerenti con il gestionale cinese di riferimento.

Solo staff POS manager/admin con permesso completo puo accedere alla Shop Admin web. `cashier/operator` e staff ordinario restano esclusi.

## Discovery attuale

### Account personale web

- `/auth/login` usa Supabase browser auth email/password per account personali.
- `/auth/callback` e `/auth/logout` gestiscono la sessione Supabase SSR.
- `/shop` e protetto da `src/server/shop-admin/shop-access.ts`.
- `resolveCurrentShopAdminShellAccess` usa `supabase.auth.getUser()`.
- L'accesso deriva da `shop_members` attive con `role_key` `shop_owner` o `shop_manager`.
- `viewer` produce blocco `viewer_only`.
- Lo shop switcher conserva `shop_id` in query string solo come navigazione; la selezione viene validata contro `availableShops`.
- Stato attuale accesso account personale: `IMPLEMENTED`.

### Staff/POS credential model

- `staff_accounts` esiste ed e separata da `profiles`.
- `staff_accounts.role_key` consente oggi `cashier`, `manager`, `viewer`.
- `admin` role_key: `NOT_PRESENT_IN_SCHEMA`.
- Current schema staff web role: `manager` only.
- `credential_status` esiste con `pending_setup`, `active`, `rotation_required`, `locked`.
- `staff_accounts_safe` esiste e non espone `credential_hash`.
- `pos_sessions`, `pos_device_credentials` e `shop_devices` esistono come foundation POS.
- `audit_logs` supporta eventi POS/staff con `actor_profile_id = null` e target staff/device/session.
- Stato attuale staff manager web login completo: `PLANNED_NOT_IMPLEMENTED`.

## Implementation TASK-037

Implementata solo foundation server-side minima:

- nuovo `src/server/shop-admin/access-principal.ts`;
- tipi `ShopAdminPersonalAccountPrincipal` e `ShopAdminPosStaffManagerPrincipal`;
- resolver `resolveCurrentShopAdminPrincipal` sopra l'accesso personale esistente;
- helper conservativo `isPosStaffEligibleForShopAdminWeb`, limitato al ruolo schema corrente `manager`;
- helper `resolvePosStaffManagerWebPrincipal` per input staff gia verificato;
- documentazione access model;
- foundation/security test TASK-037;
- scanner sicurezza aggiornato.

Review finale hardening 2026-06-03:

- corretto il helper staff web per non accettare `admin` come ruolo corrente quando lo schema verifica solo `manager`;
- `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` resta target documentato, non accesso runtime attuale;
- rimossi helper non integrati che potevano suggerire autorizzazione shop/ruolo per staff web gia operativa;
- rafforzati foundation test e `security:scan` contro il pattern permissivo `manager/admin` e contro helper autorizzativi non usati.

Non e stata implementata una route/login staff web perche richiederebbe decisioni e schema aggiuntivi su:

- `admin` role_key o alternativa equivalente;
- permission storage per `shop_admin.full_access`;
- cookie HTTP-only staff web;
- rate limit/lockout web;
- audit login/logout;
- UX login staff separata e safe.

## Criteri di accettazione

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Governance TASK-037/evidence creata | `PASS` |
| CA-02 | Decisione prodotto dual access registrata | `PASS` |
| CA-03 | `/shop` attuale confermato su account personale + `shop_members` | `PASS` |
| CA-04 | Schema staff/POS credential verificato | `PASS_WITH_NOTES` |
| CA-05 | Separazione `profiles` vs `staff_accounts` verificata | `PASS` |
| CA-06 | Foundation server-side principal resolver implementata | `PASS` |
| CA-07 | No staff web login completo prematuro | `PASS` |
| CA-08 | No Sales Sync / email invite / social login / Win7POS changes | `PASS` |
| CA-09 | Check richiesti eseguiti o motivati | `PASS_WITH_NOTES` |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`
- `docs/TASKS/TASK-037-shop-admin-dual-access-model.md`
- `docs/TASKS/EVIDENCE/TASK-037/README.md`
- `scripts/security-checks.mjs`
- `src/server/shop-admin/access-principal.ts`
- `tests/foundation/task-035-authenticated-admin-web-qa-shop-admin-smoke-harness.test.mjs`
- `tests/foundation/task-037-dual-access-model.test.mjs`

## Conferme negative

- No Sales Sync.
- No email invite.
- No Google/Apple/WeChat.
- No Win7POS/Android/iOS changes.
- No Supabase production.
- No Vercel Production.
- No migration TASK-037.
- No service role nel client/browser.
- No secret, token, PIN, password o hash in UI/log/evidence.
- No fusione tra `profiles` e `staff_accounts`.

## Handoff

- Stato: `DONE`
- Verdict corrente: `DONE`
- Check finali: `PASS_WITH_NOTES`; `build`/`verify` emettono solo warning noto `[DEP0205]`, smoke autenticato locale passa la guardia non-auth e salta il ramo autenticato per ambiente corrente non locale/sicuro. `dev:db:check` fallisce chiuso su `.env.local` cloud/mismatch container senza usare production.
- Chiusura: conferma esplicita utente ricevuta per marcare TASK-037 `DONE`, commit e push su `main`.
- Prossimo passo consigliato: decidere il micro-task schema/auth per staff web manager solo dopo review del modello, includendo permesso `shop_admin.full_access`, cookie HTTP-only, rate limit/lockout e audit login/logout.
