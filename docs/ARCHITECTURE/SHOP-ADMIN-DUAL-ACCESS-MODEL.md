# Shop Admin Dual Access Model

## Decisione prodotto

La Shop Admin Console supporta due principal distinti:

1. `personal_account`: account personale web basato su Supabase Auth e membership `shop_members`.
2. `pos_staff_manager`: futuro accesso web staff POS basato su `shop_code + staff_code + credential`, separato da `profiles`.

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

- Non e ancora implementato come login web.
- `src/server/pos-auth/service.ts` implementa POS API server-side per first login/heartbeat, non una sessione web.
- `staff_accounts` resta shop-scoped e separato da `profiles`.
- `staff_accounts_safe` espone solo metadati safe, non `credential_hash`.
- `credential_status` esiste con stati `pending_setup`, `active`, `rotation_required`, `locked`.
- `pos_sessions`, `pos_device_credentials` e `shop_devices` esistono per la foundation POS runtime.
- `audit_logs` registra eventi POS con `actor_profile_id = null` quando l'attore e staff/POS.

## Target

### Principal `personal_account`

- Identita: `profiles.profile_id = auth.users.id`.
- Sessione: Supabase SSR cookie.
- Scope: uno o piu shop tramite `shop_members`.
- Autorizzazione Shop Admin: `shop_owner` o `shop_manager`.
- Navigazione multi-shop: consentita solo su shop presenti in `availableShops`.

### Principal `pos_staff_manager`

- Identita: `staff_accounts.staff_id`.
- Sessione futura: cookie HTTP-only server-side, non Supabase Auth personale.
- Scope: sempre single-shop.
- Requisiti minimi target:
  - `staff_accounts.status = 'active'`;
  - `staff_accounts.credential_status = 'active'`;
  - nessun lockout attivo;
  - `must_change_credential = false`;
  - `role_key` manager/admin;
  - permesso esplicito `shop_admin.full_access`.
- `cashier/operator` e staff ordinario restano esclusi dalla Shop Admin web.
- TASK-037 non accetta `admin` come ruolo schema attuale: `admin` resta target prodotto/follow-up finche una migration o una policy equivalente non lo introduce esplicitamente.

## Gap schema verificati

- `staff_accounts.role_key` oggi ammette `cashier`, `manager`, `viewer`.
- `admin` role_key: `NOT_PRESENT_IN_SCHEMA`.
- Current schema staff web role: `manager` only.
- Non esiste oggi una tabella staff permissions granulare per `shop_admin.full_access`.
- Lo staff manager web login completo: `PLANNED_NOT_IMPLEMENTED`.

## Boundary di sicurezza

- Nessun `shop_id` query param vale come autorizzazione.
- Nessun `credential_hash`, PIN, password, token o hash deve entrare in UI, log o audit metadata.
- Nessun service-role lato client/browser.
- Eventuale login staff web futuro deve essere server-side, con cookie HTTP-only, audit login/logout, rate limit/lockout e messaggi di errore generici.
- PIN breve non basta per web admin senza mitigazioni esplicite; preferire password robusta o credential manager-grade.

## Foundation repo

- `src/server/shop-admin/access-principal.ts` definisce i principal `personal_account` e `pos_staff_manager`.
- Il resolver attivo `resolveCurrentShopAdminPrincipal` incapsula l'accesso personale esistente.
- `resolvePosStaffManagerWebPrincipal` e foundation conservativa: non legge cookie e non autentica staff web; costruisce un principal staff solo se input gia verificato, ruolo schema corrente `manager`, credenziale attiva e permesso target `shop_admin.full_access`.
- `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` e documentazione di target, non accesso runtime attuale.

## Fuori scope TASK-037

- No Sales Sync.
- No email invite.
- No Google/Apple/WeChat.
- No Win7POS/Android/iOS changes.
- No Supabase production.
- No Vercel Production.
- No migration TASK-037.
