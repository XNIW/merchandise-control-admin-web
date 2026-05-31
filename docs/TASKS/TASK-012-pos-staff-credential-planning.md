# TASK-012 - POS Staff Credential Planning / Schema Discovery

## Informazioni generali

- ID: `TASK-012`
- Titolo: POS Staff Credential Planning / Schema Discovery
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura planning: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-012/README.md`
- Commit: `NOT_CREATED` (richiesto esplicitamente no commit)
- Push: `NOT_RUN` (richiesto esplicitamente no push)

## Scopo

Pianificare in modo verificabile e sicuro il futuro modulo `POS / Staff` della `Shop Admin Console`, prima di scrivere login POS, credential write, migration esecutive o UI mutativa.

`POS / Staff` resta modulo interno della Shop Admin Console, non una console autonoma.

Il flusso prodotto target resta:

1. Platform Admin crea lo shop e assegna lo `shop_owner`.
2. Lo `shop_owner` entra nella `Shop Admin Console`.
3. Dentro `/shop/staff`, lo `shop_owner` o uno `shop_manager` autorizzato crea operatori POS.
4. L'operatore POS fara login in un task futuro con `shop_code + staff_code + PIN/password`.
5. Account personale web e staff POS restano identita separate.

## Scope incluso

- Discovery schema reale locale e linked Supabase.
- Verifica esistenza di tabelle, colonne, policy o tipi per `staff_accounts`, `staff_code`, credenziali staff, ruoli POS, dispositivi e audit staff.
- Lettura del placeholder attuale `/shop/staff`.
- Lettura del boundary Shop Admin corrente.
- Lettura del repo sibling `Win7POS` solo come contesto funzionale legacy, senza modificarlo.
- Consultazione fonti ufficiali esterne su password storage, autenticazione, Supabase RLS/API keys/secrets e PostgreSQL `pgcrypto`.
- Decisione tecnica proposta.
- Piano schema futuro.
- Piano RLS/grants.
- Piano hashing PIN/password.
- Piano reset/rotazione credenziali.
- Piano audit.
- Piano UI Shop Admin.
- Piano test e live gate futuro.
- Gate statico foundation/security per ricordare che `TASK-012` e solo planning.

## Scope escluso

- Nessun login POS reale.
- Nessun account staff reale.
- Nessun PIN/password reale.
- Nessuna migration esecutiva.
- Nessuna RPC mutativa staff.
- Nessuna Server Action mutativa staff.
- Nessun form funzionante di creazione staff.
- Nessuna modifica Android/iOS/POS.
- Nessuna nuova dipendenza.
- Nessun service-role client/browser.
- Nessuna password, PIN, token o credenziale in chiaro.
- Nessun esempio concreto pericoloso di credenziale debole o comune usato come valore.
- Nessun hash improvvisato.
- Nessun commit.
- Nessun push.

Placeholder ammessi nei documenti, test ed evidence:

- `<TEMP_CREDENTIAL_SHOWN_ONCE>` per rappresentare il segreto temporaneo mostrato una sola volta.
- `<NOT_STORED>` per rappresentare un plaintext non salvato.
- `<REDACTED>` per output, log o metadata da redigere.

## Letture completate

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/EVIDENCE/TASK-011/README.md`
- `src/server/auth/admin-routing.ts`
- `src/server/shop-admin/shop-access.ts`
- `src/server/shop-admin/read-model.ts`
- `src/app/shop/staff/page.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/*` con focus su `20260530041048_task_005g_admin_web_schema_rls.sql` e `20260530120000_task_006_platform_admin_controlled_actions.sql`
- `scripts/security-checks.mjs`
- `tests/foundation/*`
- `tests/e2e/*`

Next.js locale letto per boundary futuri:

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

Repo sibling letto solo come contesto:

- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Data/DbInitializer.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Data/Repositories/UserRepository.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Core/Security/PinHelper.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Core/Security/UserAccount.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Core/Security/UserRole.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Core/Security/SecurityEventCodes.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Infrastructure/Security/OperatorSession.cs`
- `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs`

Fonti esterne consultate:

- OWASP Password Storage Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
- OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- Supabase Row Level Security docs: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase API keys docs: <https://supabase.com/docs/guides/getting-started/api-keys>
- Supabase environment variables/secrets docs: <https://supabase.com/docs/guides/functions/secrets>
- PostgreSQL `pgcrypto` docs: <https://www.postgresql.org/docs/current/pgcrypto.html>

## Pre-flight

| Check | Esito | Evidence |
| --- | --- | --- |
| `git status --short` | `PASS` | Nessun output prima di aprire TASK-012. |
| `git diff --stat` | `PASS` | Nessun output prima di aprire TASK-012. |
| `git diff --check` | `PASS` | Exit code 0, nessun whitespace error. |
| Branch iniziale | `PASS_WITH_NOTES` | `codex/task-011-shop-onboarding-live-gate`, poi creata `codex/task-012-pos-staff-credential-planning`. |
| TASK-011 committed/pushed | `PASS_WITH_NOTES` | Commit locale `e5be968 Complete shop onboarding live gate`; branch senza upstream/push. |
| Commit/push TASK-012 | `NOT_RUN` | Vietati dal brief. |

## Discovery schema reale

### Stato linked Supabase

| Check | Esito | Sintesi |
| --- | --- | --- |
| `supabase --version` | `PASS` | `2.102.0` |
| `supabase migration list --linked` | `PASS` | Local/remoto allineati fino a `20260530120000`. |
| `supabase db push --linked --dry-run` | `PASS` | Remote database up to date. |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | `PASS` | No schema errors found. |
| `supabase db advisors --linked --type security --level error --fail-on error` | `PASS` | No issues found. |
| `information_schema.tables` linked | `PASS` | Nessuna tabella `staff_accounts`, `staff`, `devices` o credenziali POS. |
| `information_schema.columns` linked mirato | `PASS_WITH_NOTES` | Match reali solo `sync_events.source_device_id` e backup sync; nessun `staff_code`, `credential_hash`, `pin_hash`, password staff o device model autorizzativo. |

### Tabelle Admin Web attuali

Lo schema Admin Web reale verificato contiene:

- `profiles`
- `shops`
- `shop_members`
- `platform_admins`
- `shop_inventory_sources`
- `audit_logs`

Non contiene:

- `staff_accounts`
- `staff_code`
- `roles` / `permissions` Admin Web fisiche
- `devices` autorizzativi
- `credential_hash`
- `pin_hash` o `password_hash` per staff POS
- RPC o Server Actions staff

`shop_members.role_key` oggi permette solo `shop_owner`, `shop_manager`, `viewer`. Il ruolo `cashier` esiste nel dominio/roadmap, ma non e ancora uno stato DB Admin Web per staff POS.

`sync_events.source_device_id` e metadato sync owner-scoped legacy, non tabella dispositivi autorizzati e non modello POS device.

`pgcrypto` e abilitato nello schema Admin Web, ma oggi non viene usato per credenziali POS. Non ci sono chiamate `crypt()` o `gen_salt()` per staff.

### Stato UI e boundary Shop Admin

- `/shop/staff` e una route protetta e dynamic, ma renderizza ancora `ShopSectionPage` con `shopSections.staff`.
- `shopSections.staff` dichiara che `staff_accounts` va verificata prima di qualunque credential work.
- Il resolver Shop Admin usa `auth.getUser()`, `shop_members` attive e `shops` autorizzati.
- Il read model Shop Admin legge solo `shops`, `shop_members`, `audit_logs`, sempre filtrati da `selectedShop.shopId`.
- Nessun codice runtime crea, legge o verifica credenziali POS.

### Contesto Win7POS legacy

Il repo sibling `Win7POS` contiene un modello operativo locale, non Supabase:

- tabella SQLite `users` con `username`, `display_name`, `pin_hash`, `pin_salt`, `role_id`, `is_active`, `require_pin_change`, `max_discount_percent`, `failed_attempts`, `lockout_until`;
- tabella `roles` e `role_permissions`;
- `PinHelper` usa PBKDF2 locale con salt e 10000 iterazioni;
- login operatore usa username + PIN;
- lockout locale dopo 5 tentativi e 15 minuti;
- cambio PIN obbligatorio supportato;
- audit locale con `security_events`;
- non risulta un login remoto `shop_code + staff_code + PIN/password`.

Uso per TASK-012: questo conferma concetti utili da preservare (`require_pin_change`, lockout, ruoli/permessi, override audit), ma non e una migration da copiare. Il futuro Admin Web deve progettare un modello server-side shop-scoped, compatibile ma non accoppiato a Win7POS.

## Decisione tecnica proposta

### DEC-012-01 - Creare `staff_accounts` come tabella futura dedicata

Proposta: creare in una execution futura una tabella `public.staff_accounts`, separata da `profiles` e `shop_members`.

Motivo:

- `profiles` rappresenta account personali web.
- `shop_members` rappresenta membership web di owner/manager/viewer.
- staff POS e cashier sono identita operative, non account web personali.
- la separazione riduce il rischio di dare accesso web Shop Admin a operatori POS.

### DEC-012-02 - Staff legato a `shop_id`; login usa anche `shop_code`

Proposta:

- persistere staff con `shop_id` come foreign key autorevole;
- usare `shops.shop_code` come primo fattore di routing/login POS;
- risolvere `shop_code -> shop_id` nel boundary server-side del futuro login;
- non duplicare `shop_code` in `staff_accounts` salvo campo denormalizzato solo se motivato e vincolato.

`staff_code` deve essere unico dentro `shop_id`, non globalmente. Candidate unique:

```sql
unique (shop_id, staff_code)
```

Motivo: due negozi diversi possono voler usare codici operatori simili. La combinazione `shop_code + staff_code` resta univoca per il login.

### DEC-012-03 - Supportare credenziali distinte, non ambigue

Proposta:

- modellare `credential_kind` con valori iniziali `pin` e futuro `password`;
- abilitare inizialmente solo la modalita decisa dal task execution futuro;
- non usare lo stesso campo UI come "PIN o password" senza regole diverse.

Raccomandazione operativa:

- se il primo POS login richiede dispositivi controllati e rate limit robusto, `pin` puo essere MVP;
- se il login POS sara remoto o accessibile da browser pubblico prima del device gate, preferire `password`;
- il database deve comunque poter registrare algoritmo, parametri e versione dell'hash.

### DEC-012-04 - Hashing server-side application layer come opzione primaria

Proposta primaria:

- hashing nel server application layer, in modulo `server-only`;
- algoritmo preferito: Argon2id con parametri espliciti e profilati nella execution futura;
- nessun hash semplice tipo SHA256;
- nessuna password/PIN in chiaro nel DB o nei log;
- hash serializzato con algoritmo e parametri, per esempio PHC string o formato equivalente.

Fallback accettabile solo se motivato:

- Node `crypto.scrypt` se non si approva una dipendenza Argon2id;
- DB-side `pgcrypto.crypt()` solo come fallback consapevole, sapendo che `pgcrypto` non offre Argon2id e supporta `bf`, `sha256crypt` e `sha512crypt`.

Pepper:

- opzionale ma raccomandabile per PIN brevi;
- se usato, va in secret server-side o vault, mai nella tabella;
- serve piano di rotazione perche la compromissione del pepper richiede reset credenziali.

### DEC-012-05 - Ruoli staff iniziali separati dai ruoli web

Ruoli staff candidate:

- `cashier`
- `manager`
- `viewer`

Questi non equivalgono automaticamente a `shop_owner` / `shop_manager` web.

`staff_accounts` non deve poter accedere alla web `Shop Admin Console` in TASK futuro iniziale. Un eventuale collegamento a `profiles` deve restare decisione separata, non campo implicito MVP.

### DEC-012-06 - Mutazioni credenziali via boundary controllato

Proposta:

- lettura lista staff tramite server-only read model o view/RPC che non espone `credential_hash`;
- create/reset/suspend/reactivate tramite Server Action sottile + modulo server-only + RPC SQL `security definer` auditata, oppure endpoint server equivalente;
- nessuna mutation diretta da browser verso tabella;
- nessun service-role nel client/browser;
- RLS e grants come ultima linea di difesa.

## Schema candidate futuro

Non applicare in TASK-012.

```sql
create table public.staff_accounts (
  staff_id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(shop_id) on delete cascade,
  staff_code text not null,
  display_name text not null,
  role_key text not null,
  status text not null default 'pending_credential',
  credential_kind text,
  credential_hash text,
  credential_updated_at timestamptz,
  credential_expires_at timestamptz,
  must_change_credential boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_by_profile_id uuid references public.profiles(profile_id),
  updated_by_profile_id uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_accounts_staff_code_format check (
    staff_code = upper(staff_code)
    and staff_code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  ),
  constraint staff_accounts_staff_code_unique unique (shop_id, staff_code),
  constraint staff_accounts_role_key_check check (
    role_key in ('cashier', 'manager', 'viewer')
  ),
  constraint staff_accounts_status_check check (
    status in ('pending_credential', 'active', 'suspended', 'archived')
  ),
  constraint staff_accounts_credential_kind_check check (
    credential_kind is null or credential_kind in ('pin', 'password')
  ),
  constraint staff_accounts_active_credential_required check (
    status <> 'active'
    or (
      credential_kind is not null
      and credential_hash is not null
      and credential_updated_at is not null
    )
  )
);
```

Nota: il prompt iniziale proponeva `credential_hash text not null`. La variante sopra permette record `pending_credential` senza credenziale attiva, coerente con il placeholder attuale e utile per separare creazione anagrafica da attivazione. Se la execution futura sceglie create+credential atomico obbligatorio, si puo tornare a `credential_hash not null`.

Index candidate:

```sql
create index staff_accounts_shop_status_idx
  on public.staff_accounts(shop_id, status, staff_code);
```

View/read model candidate:

```sql
create view public.staff_accounts_safe as
select
  staff_id,
  shop_id,
  staff_code,
  display_name,
  role_key,
  status,
  credential_kind,
  credential_updated_at,
  credential_expires_at,
  must_change_credential,
  failed_attempts,
  locked_until,
  last_login_at,
  created_at,
  updated_at
from public.staff_accounts;
```

La view o RPC safe non deve selezionare `credential_hash`.

## Piano RLS e grants

Principi:

- RLS enabled su `staff_accounts`.
- Revoke all da `anon`.
- Nessun grant diretto `insert/update/delete` a `authenticated` sulla tabella base.
- `credential_hash` non deve essere selezionabile dalla UI client; in altri termini, credential_hash non deve essere selezionabile da view, DTO o RPC pensate per il browser.
- `shop_owner` e `shop_manager` autorizzati possono leggere la lista staff safe solo per i propri shop.
- Solo owner/manager autorizzati possono creare, resettare, sospendere o riattivare staff.
- Platform Admin puo avere emergency action solo server-side, auditata, non routine.
- Staff POS non deve usare Supabase Auth web come `authenticated` per leggere `staff_accounts`.

Policy candidate lettura safe:

- se si usa tabella base: policy select con `app_private.is_active_shop_admin_member(shop_id)`;
- meglio: RPC/view safe che elimina `credential_hash` e usa comunque RLS;
- le mutazioni passano da RPC con `auth.uid()` del profilo web owner/manager.

RPC future candidate:

- `public.shop_staff_create(...)`
- `public.shop_staff_reset_credential(...)`
- `public.shop_staff_suspend(...)`
- `public.shop_staff_reactivate(...)`
- `public.shop_staff_archive(...)`

Ogni RPC deve:

- essere `security definer` con `search_path` controllato;
- verificare `auth.uid()` non nullo;
- verificare membership attiva `shop_owner` o `shop_manager` sullo `shop_id`;
- bloccare `viewer`;
- non restituire `credential_hash`;
- restituire solo payload redatto;
- scrivere audit nella stessa transazione.

## Piano hashing PIN/password

### Casi vietati

- Salvare PIN/password in chiaro.
- Salvare PIN/password in audit metadata.
- Stampare PIN/password in console, Playwright output o evidence.
- Hashare con SHA256/MD5 non adattivo.
- Far girare hashing nel browser.
- Usare service-role nel client/browser.

### Opzione raccomandata

Future execution:

1. scegliere algoritmo e libreria dopo benchmark locale;
2. motivare esplicitamente qualunque nuova dipendenza;
3. introdurre modulo `server-only`, per esempio `src/server/shop-admin/staff-credentials.ts`;
4. salvare hash con algoritmo e parametri;
5. verificare con confronto costante dove disponibile;
6. prevedere `needsRehash` quando i parametri cambiano;
7. azzerare plaintext subito dopo il calcolo quanto possibile nel runtime JS;
8. non passare plaintext a componenti client.

Proposta algoritmo:

- `Argon2id` se una dipendenza nativa/wasm affidabile viene approvata nel task execution.
- `scrypt` via Node `crypto.scrypt` se si decide zero dipendenze.
- `pgcrypto.crypt()` solo se si decide hashing DB-side via RPC e si accetta che non sia Argon2id.

### Reset e rotazione

- Create/reset genera una credenziale temporanea.
- Plaintext mostrato una sola volta dopo successo come placeholder UI `<TEMP_CREDENTIAL_SHOWN_ONCE>`.
- DB salva solo hash e metadata.
- Evidence e log devono rappresentare il plaintext come `<NOT_STORED>` o `<REDACTED>`, mai come valore concreto.
- `must_change_credential=true` per primo login/reset.
- Reset richiede conferma owner/manager.
- Reset invalida tentativi falliti e lockout.
- Rotazione algoritmo usa `credential_hash` versionato e migrazione progressiva su login o reset.

## Piano login POS futuro

Non implementare in TASK-012.

Flow candidate:

1. POS invia `shop_code`, `staff_code`, credential e device context se disponibile.
2. Server normalizza `shop_code` e `staff_code`.
3. Server risolve shop active non archived.
4. Server cerca `staff_accounts` active per `shop_id + staff_code`.
5. Server applica lockout/rate limit prima di hash verify.
6. Server verifica hash.
7. Server incrementa `failed_attempts` o azzera su successo.
8. Server verifica `must_change_credential`.
9. Server emette sessione POS separata, non sessione web Shop Admin.
10. Server scrive audit redatto.

Errori UI/API:

- messaggio generico per credential errata, staff inesistente, shop inesistente, account sospeso o lockout;
- nessun dettaglio interno, nessun raw DB error;
- audit interno con motivo redatto.

## Piano UI `/shop/staff`

Prima UI futura:

- lista staff per shop selezionato;
- `staff_code`;
- `display_name`;
- ruolo;
- stato;
- ultimo aggiornamento credenziale;
- `must_change_credential`;
- stato locked/suspended;
- azioni consentite da ruolo.

Azioni candidate:

- create staff;
- reset credenziale;
- suspend;
- reactivate;
- archive;
- show temporary credential once after create/reset.

La UI non deve mostrare:

- PIN/password;
- `credential_hash`;
- reset token;
- pepper;
- stack trace o errori DB grezzi;
- dati di altri shop.

## Piano audit

Eventi candidate:

- `shop.staff.create.attempt`
- `shop.staff.create.success`
- `shop.staff.create.failure`
- `shop.staff.credential.reset.attempt`
- `shop.staff.credential.reset.success`
- `shop.staff.credential.reset.failure`
- `shop.staff.suspend.attempt`
- `shop.staff.suspend.success`
- `shop.staff.suspend.failure`
- `shop.staff.reactivate.attempt`
- `shop.staff.reactivate.success`
- `shop.staff.reactivate.failure`
- `pos.staff.login.success`
- `pos.staff.login.failure`
- `pos.staff.login.locked`
- `pos.staff.credential.change.success`

Audit metadata ammessi:

- `staff_id`;
- `shop_id`;
- `staff_code` redatto o normalizzato, se non considerato segreto;
- `role_key`;
- `status`;
- `credential_kind`;
- outcome code stabile.

Audit metadata vietati:

- plaintext PIN/password;
- `credential_hash`;
- pepper;
- token/sessione;
- stack trace;
- email o identita personale non necessaria.

## Matrice rischi

| Rischio | Impatto | Mitigazione proposta |
| --- | --- | --- |
| PIN/password in chiaro | Critico | Hash server-side, no logging, static scan, evidence redatta. |
| PIN breve brute-force | Alto | Lockout, rate limit, generic errors, device gate, valutare password se device gate non c'e. |
| Cross-shop leak | Critico | `shop_id` FK, unique `(shop_id, staff_code)`, RLS per shop, test negative. |
| `credential_hash` esposto alla UI | Critico | View/RPC safe, DTO minimali, no `select("*")`, scanner. |
| Staff POS trattato come account web | Alto | Tabelle separate, niente Supabase Auth web per staff, no `profile_id` implicito. |
| Platform Admin gestisce staff ordinario | Medio/Alto | Routine solo Shop Admin; emergency platform server-side e auditata. |
| Secret key/service-role nel browser | Critico | Boundary server-only, scan, Supabase API key policy. |
| Hashing debole per evitare dipendenze | Alto | Decisione esplicita Argon2id/scrypt/pgcrypto; benchmark e review. |
| Lockout usato per denial-of-service | Medio | Finestra/threshold bilanciati, reset owner, audit e monitoraggio. |
| Audit troppo dettagliato | Medio | Metadata redatta, denylist secret, test. |
| Migration rompe RLS esistente | Alto | Dry-run, lint, advisors, SQL tests e rollback forward-only. |

## Piano test futuro

### TASK-012 static/foundation

- `node --test tests/foundation/pos-staff-credential-planning.test.mjs`
- `npm run security:scan`
- `npm run test:foundation`
- `git diff --check`

Il gate statico deve fallire se TASK-012 introduce esempi pericolosi come credenziali concrete, runtime staff credential handling, `credential_hash` in UI/client, migration `staff_accounts`, o `credential_hash` nei tipi/migration reali.

### Execution futura schema

- migration SQL test:
  - crea `staff_accounts`;
  - RLS enabled;
  - revoke anon;
  - no direct table mutation grants a browser;
  - unique `(shop_id, staff_code)`;
  - check su role/status/staff_code;
  - `credential_hash` non in read model safe.
- Supabase linked:
  - `supabase migration list --linked`;
  - `supabase db push --linked --dry-run`;
  - `supabase db lint --linked --schema public,app_private --level error --fail-on error`;
  - `supabase db advisors --linked --type security --level error --fail-on error`.

### Execution futura app/foundation

- hash/verify positivo e negativo;
- parametri hash versionati;
- reset mostra plaintext una sola volta;
- no plaintext in DB/evidence/log;
- lockout dopo threshold;
- generic auth error;
- no import server/Supabase in client components;
- no `credential_hash` nei DTO passati alla UI.

### Execution futura E2E/live gate

- owner crea staff su shop autorizzato;
- manager autorizzato crea/resetta se permesso;
- viewer bloccato;
- altro shop bloccato;
- POS login futuro successo/failure/lockout;
- cleanup senza hard delete e con audit.

## Criteri di accettazione TASK-012

| CA | Criterio | Stato |
| --- | --- | --- |
| CA-01 | Governance TASK-012 creata e Master Plan aggiornato | `PASS` |
| CA-02 | Evidence TASK-012 creata | `PASS` |
| CA-03 | Pre-flight reale documentato | `PASS` |
| CA-04 | TASK-011 commit/push state documentato | `PASS_WITH_NOTES` |
| CA-05 | Schema reale locale e linked verificato | `PASS` |
| CA-06 | Decisione tecnica proposta documentata | `PASS` |
| CA-07 | Matrice rischi documentata | `PASS` |
| CA-08 | Piano schema/RLS/hashing/UI/test documentato | `PASS` |
| CA-09 | Nessuna credenziale reale, login POS o migration staff implementata | `PASS` |
| CA-10 | Check statici eseguiti con evidence reale | `PASS` |
| CA-11 | Review finale repo-grounded e fonti aggiornata | `PASS` |
| CA-12 | Harness rafforzato contro esempi credential pericolosi e runtime staff fuori scope | `PASS` |

## File toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- `docs/TASKS/EVIDENCE/TASK-012/README.md`
- `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`
- `scripts/security-checks.mjs`
- `tests/foundation/pos-staff-credential-planning.test.mjs`

## Conferme negative

- Nessun dato reale, token, password, PIN, JWT, magic link o credential salvato.
- Nessun service-role esposto al client/browser.
- Nessun account POS creato.
- Nessun `staff_accounts` creato.
- Nessun `staff_code` live creato.
- Nessuna migration staff creata.
- Nessuna RPC staff creata.
- Nessuna Server Action staff creata.
- Nessuna modifica Win7POS.
- Nessuna nuova dipendenza.
- Nessun commit.
- Nessun push.

## Rischi residui

- La scelta finale tra Argon2id, scrypt e DB-side `pgcrypto` richiede task execution e benchmark.
- Il device gate POS non esiste ancora; se non viene implementato prima del login POS, i PIN brevi restano rischio elevato.
- Il modello ruoli/permessi POS e ancora minimo e andra separato dai ruoli web.
- Il collegamento con Win7POS legacy richiede task dedicato di compatibility/import, non automatico.

## Handoff finale

- Verdict finale: `DONE_RECONCILED`.
- Stato finale: `DONE`, su richiesta esplicita di review finale/DONE reconciliation e dopo check positivi.
- Prossima fase: nessun task attivo; aprire un task separato solo se si vuole eseguire la schema foundation POS Staff.
- Candidate task successivo dopo review: `TASK-013 - POS Staff Credentials Schema Foundation`, con migration/RLS/hash boundary solo se approvato.

## Review finale / DONE reconciliation

Esito review repo-grounded:

- Planning confermato come documentale/discovery, non execution runtime.
- Nessun login POS reale, staff account reale, PIN/password reale, migration, RPC staff o Server Action staff introdotti.
- Account personale web e staff POS restano identita separate.
- `/shop/staff` resta placeholder protetto e non mutativo.
- `staff_accounts`, `staff_code`, `credential_hash`, `pin_hash` e `password_hash` non esistono in migration o tipi generati reali.
- Riferimenti Win7POS restano solo contesto funzionale, non runtime copiato.
- Fonti OWASP/Supabase/PostgreSQL riesaminate e coerenti con il piano.

Fix applicato in review:

- Aggiunti placeholder espliciti `<TEMP_CREDENTIAL_SHOWN_ONCE>`, `<NOT_STORED>` e `<REDACTED>`.
- Rafforzato il gate foundation per vietare esempi credential pericolosi e runtime staff credential fuori scope.
- Rafforzato `scripts/security-checks.mjs` per bloccare `credential_hash` in UI/client e staff credential runtime in `src/server/shop-admin` durante TASK-012.

Check review finali:

- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run test:foundation`: `PASS`, 41 test passati.
- `npm run security:scan`: `PASS`, `Security scan passed.`
- `npm run build`: `PASS_WITH_WARNINGS`, warning Node `DEP0205` non bloccante.
- `npm run verify`: `PASS_WITH_WARNINGS`, warning Node `DEP0205` non bloccante.
- `git diff --check`: `PASS`.
- Supabase linked:
  - `supabase db push --linked --dry-run`: `PASS`, remote database up to date.
  - `supabase migration list --linked`: `PASS_AFTER_RETRY`, un retry parallelo ha attivato temporaneamente `ECIRCUITBREAKER`; rerun seriale passato con local/remoto allineati fino a `20260530120000`.
  - `supabase db lint --linked --schema public,app_private --level error --fail-on error`: `PASS_AFTER_RETRY`, rerun seriale con `No schema errors found`.
  - `supabase db advisors --linked --type security --level error --fail-on error`: `PASS_AFTER_RETRY`, rerun seriale con `No issues found`.
- `npm run test:ui-smoke`: `NOT_RUN_NOT_NEEDED`, TASK-012 non modifica componenti, routing o UI runtime.
