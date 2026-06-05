# Shop Admin Dual Access Model

## Terminologia prodotto TASK-047

- `Master Console`: nome breve della console globale. Route tecnica: `/platform`. Principal ammesso: account personale con ruolo tecnico `platform_admin`.
- `Admin Console`: nome breve della console shop-scoped. Route tecnica: `/shop`.
- `Admin account`: account personale Supabase Auth con `profiles` e `shop_members`, adatto a uso multi-shop.
- `Shop code`: accesso staff shop-scoped con shop-code/staff-code, `staff_accounts` e `staff_web_sessions`, sempre single-shop.

Il nome storico `Shop Admin Console` resta solo come contesto storico del documento. Nel copy nuovo e nei runbook operativi si usa `Admin Console`. Il nome storico `Platform Admin Console` viene sostituito da `Master Console`, mentre `platform_admin` resta il role key tecnico.

La Admin Console puo essere aperta da un account personale o da uno staff account. I due principal restano separati, ma sono permission-equivalent dentro lo stesso shop quando il permission tree concede le stesse operazioni. Le differenze non spariscono: identita, sessione, audit actor e capacita multi-shop restano distinte.

Win7POS usa shop-code/staff-code e non personal account. Android/iOS usano personal account e possono essere multi-shop. Uno shop puo essere creato da provisioning master o da flussi futuri POS-first shop, ma la scelta del principal di accesso resta esplicita e non dipende da `.env.local`. Guardrail: no production.

## Decisione prodotto

La Admin Console supporta due principal distinti:

1. `personal_account`: account personale web basato su Supabase Auth e membership `shop_members`.
2. `pos_staff_manager`: accesso web staff POS basato su shop-code/staff-code e credential, separato da `profiles`; TASK-038 introduce runtime server-side, sessione web separata, permission tree e accesso read-only ai read model Admin Console.

Questa decisione non fonde `profiles` e `staff_accounts`.

## Stato attuale

### personal_account

- Implementato oggi per `/shop`.
- La sessione nasce da Supabase Auth personale.
- `src/server/shop-admin/shop-access.ts` usa `supabase.auth.getUser()`.
- L'autorizzazione Shop Admin deriva da `shop_members` attive con `role_key in ('shop_owner', 'shop_manager')`.
- `viewer` non apre la Shop Admin web.
- Lo shop switcher usa `shop_id` solo come navigazione tra shop gia autorizzati.
- Un account personale puo essere multi-shop.

### pos_staff_manager

- TASK-038 introduce migration e runtime server-only per una sessione web staff manager.
- `src/server/pos-auth/service.ts` implementa POS API server-side per first login/heartbeat, non una sessione web.
- `staff_accounts` resta shop-scoped e separato da `profiles`.
- `staff_accounts_safe` espone solo metadati safe, non `credential_hash`.
- `credential_status` esiste con stati `pending_setup`, `active`, `rotation_required`, `locked`.
- `pos_sessions`, `pos_device_credentials` e `shop_devices` esistono per la foundation POS runtime.
- `audit_logs` registra eventi POS con `actor_profile_id = null` quando l'attore e staff/POS.
- `staff_web_sessions` e separata da Supabase Auth personale e da `pos_sessions` device-bound.
- `staff_web_login_attempts` conserva solo chiave hash e contatori/lockout redatti.
- `staff_role_permissions` conserva il permission tree role/shop-scoped, incluso `shop_admin.full_access`.

## Target

### Principal `personal_account`

- Identita: `profiles.profile_id = auth.users.id`.
- Sessione: Supabase SSR cookie.
- Scope: uno o piu shop tramite `shop_members`.
- Autorizzazione Shop Admin: `shop_owner` o `shop_manager`.
- Navigazione multi-shop: consentita solo su shop presenti in `availableShops`.

### Principal `pos_staff_manager`

- Identita: `staff_accounts.staff_id`.
- Sessione: cookie HTTP-only server-side, non Supabase Auth personale.
- Scope: sempre single-shop.
- Requisiti minimi target:
  - `staff_accounts.status = 'active'`;
  - `staff_accounts.credential_status = 'active'`;
  - nessun lockout attivo;
  - `must_change_credential = false`;
  - `role_key` manager/admin;
  - permesso esplicito `shop_admin.full_access`.
- `cashier/operator/viewer` e staff ordinario restano esclusi dalla Shop Admin web.
- TASK-037 non accetta `admin` come ruolo schema attuale: `admin` resta target prodotto/follow-up finche una migration o una policy equivalente non lo introduce esplicitamente.
- TASK-038 continua ad accettare solo `manager` nello schema corrente e richiede `shop_admin.full_access`.

## Gap schema verificati

- `staff_accounts.role_key` oggi ammette `cashier`, `manager`, `viewer`.
- `admin` role_key: `NOT_PRESENT_IN_SCHEMA`.
- Current schema staff web role: `manager` only.
- Tabella staff permissions granulare creata e applicata localmente in migration TASK-038.
- Lo staff manager web login: `DONE`; shell/read model supportano `pos_staff_manager`, mentre i mutator Shop Admin restano personal-account-only.

## Boundary di sicurezza

- Nessun `shop_id` query param vale come autorizzazione.
- Nessun `credential_hash`, PIN, password, token o hash deve essere persistito in UI, log, audit metadata o URL; il provisioning puo mostrare una credential one-time solo nella risposta immediata dell'action.
- Nessun service-role lato client/browser.
- Eventuale login staff web futuro deve essere server-side, con cookie HTTP-only, audit login/logout, rate limit/lockout e messaggi di errore generici.
- TASK-038 implementa login/logout server-side con cookie HTTP-only, token hash, audit login/logout e lockout; non salva raw token/credential in UI, log o audit metadata.
- PIN breve non basta per web admin senza mitigazioni esplicite; preferire password robusta o credential manager-grade.

## Foundation repo

- `src/server/shop-admin/access-principal.ts` definisce i principal `personal_account` e `pos_staff_manager`.
- Il resolver attivo `resolveCurrentShopAdminPrincipal` incapsula l'accesso personale esistente.
- `resolvePosStaffManagerWebPrincipal` e foundation conservativa: non legge cookie e non autentica staff web; costruisce un principal staff solo se input gia verificato, ruolo schema corrente `manager`, credenziale attiva e permesso target `shop_admin.full_access`.
- `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` e documentazione di target, non accesso runtime attuale.
- `src/server/shop-admin/staff-web-auth.ts` risolve il cookie staff web TASK-038 e costruisce il principal `pos_staff_manager` solo dopo credential/session/permission check.
- `src/server/shop-admin/staff-web-permissions.ts` definisce `SHOP_STAFF_WEB_PERMISSION_TREE` e richiede `shop_admin.full_access` per l'accesso web staff.
- `src/server/shop-admin/data-access.ts` centralizza il dual data access: `personal_account` usa SSR/RLS, `pos_staff_manager` usa admin client solo server-side e sempre con shop derivato dal principal.
- I read model Shop Admin principali usano `resolveShopAdminDataAccess`; `action-context.ts` blocca `pos_staff_manager` sui mutator esistenti per evitare RPC personali basati su `auth.uid()`.
- `src/server/platform-admin/staff-manager-provisioning.ts` implementa il provisioning Platform server-only di staff manager web e del permesso `shop_admin.full_access` role/shop-scoped.
- `src/app/(staff-auth)/shop/staff-login` ospita il login staff manager fuori dal layout protetto `/shop`.
- `src/app/shop/staff-logout/route.ts` revoca la sessione staff web e cancella il cookie.

## Gap TASK-038 residui

- `npm run dev:db:check` resta fail-closed su `.env.local` cloud/container mismatch; TASK-038 ha applicato migration/typegen solo dopo verifica diretta dello stack locale non-production.
- Mutazioni Shop Admin staff web non implementate: i mutator restano personal-account-only finche non esistono RPC dedicate o un boundary staff-aware.
- Smoke staff web live copre session resolver e cashier denial; il submit login/logout reale e stato verificato separatamente con dataset sintetico locale `TASK038_*` e cleanup zero.
- Revenue dashboard resta `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`; Revenue dashboard requires real sales sync data.

## Fuori scope TASK-037

- No Sales Sync.
- No email invite.
- No Google/Apple/WeChat.
- No Win7POS/Android/iOS changes.
- No Supabase production.
- No Vercel Production.
- No migration TASK-037.
