# TASK-005F - Supabase Schema / RLS / Auth SSR Planning

## 1. Informazioni generali

- ID: `TASK-005F`
- Titolo: Supabase Schema / RLS / Auth SSR Planning
- Stato: `READY_FOR_REVIEW`
- Tipo: planning tecnico repo-grounded
- Dipende da:
  - `TASK-005E` chiuso a `DONE`;
  - `TASK-005D` decisione schema/auth boundary;
  - `TASK-005` ancora `PLANNED_BLOCKED`.
- File Master Plan: `docs/MASTER-PLAN.md`
- Runtime live: `NOT_RUN`
- Migration Supabase: `NOT_CREATED`
- Query live Supabase: `NOT_RUN`
- Tipi `Database`: `NOT_GENERATED`
- Commit: `NOT_CREATED`

## 2. Obiettivo

Preparare il livello successivo della futura integrazione Supabase Admin Web: schema candidate, RLS, grants/Data API, Auth SSR, `platform_admin`, mapping owner/shop, tipi `Database`, migration strategy, test data e harness.

Questo task non implementa runtime e non sblocca `TASK-005`.

## 3. Prerequisito TASK-005E

Esito: `PASS`.

Evidence:

- `docs/TASKS/TASK-005E-supabase-foundation-execution.md` indica `Stato task: DONE`.
- `docs/MASTER-PLAN.md` indica `TASK-005E` come `DONE`.
- `TASK-005` resta `PLANNED_BLOCKED`.

Nota: `docs/TASKS/EVIDENCE/TASK-005E/README.md` resta un artifact di evidence con stato precedente `READY_FOR_DONE_CONFIRMATION`; non blocca `TASK-005F` perche il task file e il Master Plan sono stati chiusi a `DONE` dopo conferma esplicita utente.

## 4. Pre-flight

| Comando | Esito | Sintesi |
| --- | --- | --- |
| `git status --short` | `PASS_WITH_NOTES` | Worktree gia contiene modifiche/untracked da TASK-005E e task docs precedenti. |
| `git diff --stat` | `PASS_WITH_NOTES` | Diff tracked su `.gitignore`, `docs/MASTER-PLAN.md`, `package-lock.json`, `package.json`; untracked non inclusi nello stat standard. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff` | `PASS_WITH_NOTES` | Diff tracked coerente con TASK-005E e tracking precedente; nessuna migration SQL nel diff tracked. |
| `find docs -maxdepth 4 -type f \| sort` | `PASS` | Documenti governance/task/evidence presenti; `TASK-005F` non esisteva ancora al pre-flight. |
| `find src -maxdepth 5 -type f \| sort` | `PASS` | Boundary foundation `src/lib/supabase` e `src/server/platform-admin` presenti. |
| `cat package.json` | `PASS` | `@supabase/supabase-js`, `server-only`, `security:scan`, `test:foundation` e `verify` con security scan presenti. |
| `cat .env.example` | `PASS` | Solo nomi variabile, valori vuoti. Nessun `.env` reale letto. |
| `rg ... -g '!node_modules/**' -g '!.git/**' -g '!.env*'` | `PASS_WITH_NOTES` | Output ampio: riferimenti coerenti in docs, foundation server, mock e package lock; nessun uso live o migration Admin Web. |

## 5. File letti

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-005E-supabase-foundation-execution.md`
- `docs/TASKS/EVIDENCE/TASK-005E/README.md`
- `docs/TASKS/TASK-005D-supabase-schema-auth-boundary-decision.md`
- `docs/TASKS/TASK-005C-admin-web-supabase-schema-boundary-planning.md`
- `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`
- `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- `docs/TASKS/TASK-005-platform-admin-read-only-data.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/supabase-security.md`
- `package.json`
- `.env.example`
- `src/lib/supabase/server.ts`
- `src/server/platform-admin/authz.ts`
- `src/server/platform-admin/read-model.ts`
- `src/server/platform-admin/mappers.ts`
- `src/server/platform-admin/inventory-sources.ts`
- `scripts/security-checks.mjs`
- `tests/foundation/supabase-foundation.test.mjs`

Nota sicurezza: non sono stati letti o stampati file `.env` reali, token, password, PIN, JWT, refresh token, connection string, publishable key reale, anon key reale o service-role key.

## 6. Fonti Supabase ufficiali consultate

Solo documentazione pubblica, nessun Supabase live:

- Supabase Securing your API: grants e RLS sono livelli separati; RLS obbligatoria su oggetti esposti alla Data API.
- Supabase changelog: nuovi progetti possono non esporre automaticamente tabelle alla Data/GraphQL API; i grants vanno pianificati insieme a RLS.
- Supabase Generating TypeScript Types: tipi generati tramite dashboard o CLI da schema reale.
- Supabase JavaScript TypeScript support: `createClient<Database>()` usa tipi generati dallo schema.
- Supabase Server-Side Rendering docs: Next.js SSR usa cookie; `getUser()` e la verifica server-side restano centrali.
- Supabase SSR advanced guide: attenzione a sessioni stale, `getClaims()` non sostituisce verifica auth server per revoca/logout, route auth non devono essere cache/ISR.
- Supabase Tables and Data docs: view create da ruoli privilegiati possono bypassare RLS se non `security_invoker`.

## 7. Stato repo-grounded

Admin Web dopo `TASK-005E`:

- `.env.example` esiste e non contiene valori;
- `@supabase/supabase-js` e `server-only` sono installati;
- `src/lib/supabase/server.ts` contiene boundary server-only;
- `src/server/platform-admin/*` contiene skeleton authz/read model/mappers;
- `security:scan` e `test:foundation` esistono;
- `npm run verify` include `security:scan`;
- non esiste cartella `supabase/`;
- non esistono migration Admin Web;
- non esistono tipi `Database`;
- non esiste RLS reale in questa repo;
- non esiste Auth SSR runtime funzionante;
- nessuna UI e collegata a dati live.

## 8. Schema candidate summary

Tutte le entita sotto sono `CANDIDATE_SCHEMA`: non sono migration definitive, non sono schema reale, non sono state applicate.

### 8.1 `profiles` - CANDIDATE_SCHEMA

Scopo:

- rappresentare account personali web;
- separare dominio Admin Web da `auth.users`;
- supportare membership multi-shop;
- non rappresentare staff POS.

Colonne candidate non definitive:

- `profile_id` uuid;
- `auth_user_id` uuid, se si decide ID separato;
- `display_name` text;
- `profile_status` text/enum candidato: `active`, `review`, `disabled`;
- `created_at`, `updated_at`;
- `disabled_at`, `disabled_by_profile_id`, se serve revoca applicativa;
- `metadata_redacted` jsonb opzionale, solo se serve e senza dati sensibili.

Chiavi/vincoli candidati:

- opzione prudente iniziale: `profile_id` equivalente a `auth.users.id`;
- alternativa: `profile_id` separato + `auth_user_id` unique not null;
- `profile_status` constrained;
- nessuna email necessaria nella tabella se disponibile via auth e non serve al view model.

Relazioni candidate:

- `shop_members.profile_id`;
- `platform_admins.profile_id`;
- `audit_logs.actor_profile_id`.

Audit minimo:

- `created_at`, `updated_at`, eventuale `disabled_at/disabled_by_profile_id`.

RLS/grants richiesti:

- authenticated user puo leggere il proprio profilo minimo;
- `platform_admin` server-side puo leggere profili necessari alla console;
- anon nessun accesso;
- grants minimi solo dopo decisione Data API.

Mapper/view model:

- `ProfileRowCandidate -> Profile`;
- futuro `Database["public"]["Tables"]["profiles"]["Row"] -> Profile`.

Rischi:

- duplicare identita auth;
- esporre email/dati personali non necessari;
- trattare `user_metadata` come fonte authorization.

Test richiesti:

- own profile read;
- unauthorized profile read blocked;
- platform admin read allowed solo se authz passa;
- disabled profile behavior;
- schema mismatch mapper.

### 8.2 `shops` - CANDIDATE_SCHEMA

Scopo:

- root business Admin Web secondo ADR-001;
- contenere `shop_id` / `shop_code`;
- separare shop domain da `owner_user_id` mobile.

Colonne candidate non definitive:

- `shop_id` uuid;
- `shop_code` text;
- `shop_name` text;
- `shop_status` text/enum candidato: `active`, `pending_setup`, `suspended`, `archived`;
- `created_at`, `updated_at`;
- `created_by_profile_id`;
- `archived_at`, `archived_by_profile_id`.

Chiavi/vincoli candidati:

- `shop_id` primary key;
- `shop_code` unique, normalized, immutable o con migration/audit dedicata;
- `shop_status` constrained.

Relazioni candidate:

- `shop_members.shop_id`;
- `shop_inventory_sources.shop_id`;
- `audit_logs.shop_id`;
- futuri staff/devices/products shop-scoped fuori scope.

Audit minimo:

- created/updated/archived attribution.

RLS/grants richiesti:

- platform admin global read via server-side authz;
- shop owner/manager/viewer futuri leggono solo shop membership;
- anon nessun accesso.

Mapper/view model:

- `ShopRowCandidate -> Shop`.

Rischi:

- introdurre accidentalmente `merchant -> stores`;
- permettere cross-shop read;
- cambiare `shop_code` senza audit.

Test richiesti:

- member sees own shop only;
- non-member blocked;
- platform admin read allowed;
- archived/suspended behavior.

### 8.3 `shop_members` - CANDIDATE_SCHEMA

Scopo:

- collegare `profiles` e `shops`;
- modellare ruoli shop-scoped web;
- non trasformare staff POS in account web.

Colonne candidate non definitive:

- `shop_member_id` uuid;
- `profile_id` uuid;
- `shop_id` uuid;
- `role_key` text oppure `role_id` uuid;
- `membership_status` text/enum candidato: `active`, `invited`, `suspended`;
- `created_at`, `updated_at`;
- `invited_by_profile_id`;
- `suspended_at`, `suspended_by_profile_id`.

Chiavi/vincoli candidati:

- unique active membership per `profile_id + shop_id + role_key` oppure unique membership row per `profile_id + shop_id`;
- role scope must be `shop`;
- `membership_status` constrained.

Relazioni candidate:

- `profiles.profile_id`;
- `shops.shop_id`;
- `roles.role_id` se roles table viene materializzata.

Audit minimo:

- invited/suspended attribution.

RLS/grants richiesti:

- user puo leggere le proprie membership;
- shop owner/manager futuri possono leggere membri del proprio shop secondo permessi;
- platform admin puo leggere globalmente solo via boundary approvato;
- anon nessun accesso.

Mapper/view model:

- `ShopMemberRowCandidate -> ShopMember`.

Rischi:

- confondere `platform_admin` con membership shop;
- ereditare privilegi shop da staff POS.

Test richiesti:

- own membership read;
- cross-shop leakage blocked;
- suspended membership not authorized;
- role scope validation.

### 8.4 `platform_admins` - CANDIDATE_SCHEMA

Scopo:

- fonte autorevole server-side per ruolo globale `platform_admin`;
- supportare revoca verificabile;
- evitare authz da client, URL, mock, email hardcoded o `user_metadata`.

Colonne candidate non definitive:

- `platform_admin_id` uuid;
- `profile_id` uuid;
- `status` text/enum candidato: `active`, `revoked`;
- `granted_at`, `granted_by_profile_id`;
- `revoked_at`, `revoked_by_profile_id`;
- `reason_redacted` text opzionale;
- `last_reviewed_at` opzionale.

Chiavi/vincoli candidati:

- unique active row per `profile_id`;
- `status` constrained;
- revoked rows storicizzate, non riutilizzate senza audit.

Relazioni candidate:

- `profiles.profile_id`;
- `audit_logs.actor_profile_id` per grants/revokes.

Audit minimo:

- grant/revoke attribution obbligatoria prima di azioni sensibili.

RLS/grants richiesti:

- tabella non letta dal client come fonte autorevole;
- server boundary verifica `platform_admin`;
- grants Data API da evitare o limitare severamente;
- se esposta, RLS per self/no detail e platform-admin-only reviewata.

Mapper/view model:

- non esporre direttamente alla UI salvo stato autorizzato redatto.

Rischi:

- bootstrap insicuro;
- revoca non immediata se si usa solo app metadata/JWT;
- cache stale.

Test richiesti:

- authorized;
- unauthorized;
- revoked;
- stale token;
- no data leak in error.

### 8.5 `shop_inventory_sources` - CANDIDATE_SCHEMA

Scopo:

- collegare `shops` a fonte inventory mobile owner-scoped;
- mantenere esplicito che `owner_user_id` non e `shop_id`;
- gestire stati non mappati senza inventare dati live.

Colonne candidate non definitive:

- `shop_inventory_source_id` uuid;
- `shop_id` uuid nullable per stati non mappati/mobile-only;
- `source_kind` text, valore iniziale candidato `mobile_owner`;
- `owner_user_id` uuid/text secondo schema mobile reale;
- `mapping_state` text/enum candidato: `mapped`, `unmapped`, `not_configured`, `mobile_only`, `ambiguous`;
- `is_active` boolean o `disabled_at` nullable;
- `created_at`, `created_by_profile_id`;
- `verified_at`, `verified_by_profile_id`;
- `disabled_at`, `disabled_by_profile_id`.

Chiavi/vincoli candidati:

- massimo 1 owner mobile legacy attivo per shop;
- massimo 1 shop attivo per `owner_user_id` mobile;
- indice unico parziale candidato sui mapping attivi per `shop_id`;
- indice unico parziale candidato sui mapping attivi per `owner_user_id`;
- `mapped` richiede `shop_id` e `owner_user_id`;
- `not_configured` non deve fingere fonte live;
- `ambiguous` non deve esporre inventory live.

Relazioni candidate:

- `shops.shop_id`;
- eventuale riferimento logico a schema mobile owner-scoped, non FK se database/schema non lo consente.

Audit minimo:

- created/verified/disabled attribution.

RLS/grants richiesti:

- platform admin read via server boundary;
- shop owner/manager futuri vedono solo mapping del proprio shop se necessario;
- `unmapped`, `mobile_only`, `ambiguous` non espongono inventory live;
- anon nessun accesso.

Mapper/view model:

- `ShopOwnerMappingRowCandidate -> ShopOwnerMapping`;
- `validateInitialShopOwnerMappingCardinality()` resta guardrail foundation.

Rischi:

- cross-shop data leak;
- duplicare inventory mobile su piu root business;
- mapping ambiguo presentato come live.

Test richiesti:

- `mapped`;
- `unmapped`;
- `not_configured`;
- `mobile_only`;
- `ambiguous`;
- duplicate active owner blocked;
- duplicate active shop blocked;
- no live read on ambiguous.

### 8.6 `audit_logs` - CANDIDATE_SCHEMA

Scopo:

- audit amministrativo Admin Web;
- separato da `sync_events`;
- obbligatorio prima di `TASK-006` e azioni sensibili;
- per `TASK-005` read-only puo essere assente solo con UI `Audit not configured`.

Colonne candidate non definitive:

- `audit_log_id` uuid;
- `actor_profile_id` uuid nullable per eventi system redatti;
- `scope` text/enum: `global`, `shop`;
- `shop_id` uuid nullable;
- `event_key` text;
- `severity` text/enum: `info`, `warning`, `critical`;
- `result` text/enum: `success`, `blocked`, `simulated`;
- `target_type`, `target_id` redatti/opzionali;
- `metadata_redacted` jsonb;
- `created_at`.

Chiavi/vincoli candidati:

- append-only posture;
- `scope=shop` richiede `shop_id`;
- `event_key` constrained via registry applicativo o enum futura.

Relazioni candidate:

- `profiles.profile_id`;
- `shops.shop_id`.

Audit minimo:

- la tabella e l'audit minimo; non deve contenere secret, token, password, PIN.

RLS/grants richiesti:

- platform admin read via server boundary;
- shop owner/manager futuri possono leggere solo audit del proprio shop se prodotto lo richiede;
- anon nessun accesso;
- insert solo da server/action autorizzata in task futuro.

Mapper/view model:

- `AuditLogRowCandidate -> AuditLog`.

Rischi:

- usare `sync_events` come audit amministrativo;
- loggare dati sensibili;
- consentire update/delete.

Test richiesti:

- read-only no mutation;
- redaction;
- append-only constraints;
- `Audit not configured` fallback quando assente.

### 8.7 `roles` / `permissions` - CANDIDATE_SCHEMA opzionale

Scopo:

- solo se indispensabile per boundary;
- distinguere `global` da `shop`;
- evitare hardcoding disperso dei ruoli.

Colonne candidate non definitive:

- `roles`: `role_id`, `role_key`, `scope`, `label`, `created_at`;
- `permissions`: `permission_id`, `permission_key`, `scope`, `description`;
- `role_permissions`: `role_id`, `permission_id`.

Vincoli candidati:

- `role_key` unique per scope;
- `scope` constrained: `global`, `shop`;
- `platform_admin` solo global;
- `shop_owner`, `shop_manager`, `viewer` shop-scoped per default iniziale.

RLS/grants richiesti:

- read-only roles/permissions possono essere server-side;
- anon nessun accesso salvo esplicita decisione pubblica non necessaria.

Rischi:

- overengineering prima di Auth SSR;
- confondere RBAC app con RLS DB.

Test richiesti:

- role scope validation;
- permission mapping server-side;
- no privilege escalation da input client.

### 8.8 Viste/read model futuri - CANDIDATE_VIEW

Proposte non definitive:

- `platform_admin_shop_summary`;
- `platform_admin_profile_summary`;
- `shop_inventory_read_model`;
- `audit_log_read_model`.

Regole:

- preferire server-side read model TypeScript finche RLS/grants non sono verificati;
- se view DB viene creata, usare `security_invoker` quando applicabile oppure schema non esposto;
- non usare view privilegiata per bypassare RLS senza review;
- materialized view solo con refresh/ownership/RLS/grants pianificati.

## 9. Cardinalita owner/shop

Decisione confermata:

- massimo 1 owner mobile legacy attivo per shop;
- massimo 1 shop attivo per `owner_user_id` mobile;
- mapping molti-a-molti fuori scope.

Vincoli futuri possibili:

- unique parziale sui mapping attivi per `shop_id`;
- unique parziale sui mapping attivi per `owner_user_id`;
- constraint `mapped` richiede `shop_id` + `owner_user_id`;
- stato `ambiguous` obbligatorio se discovery trova duplicati storici.

Stati:

- `mapped`: mapping approvato, puo alimentare read model solo con authz/RLS;
- `unmapped`: fonte mobile nota ma non collegata a shop;
- `not_configured`: shop senza fonte inventory;
- `mobile_only`: fonte mobile non esponibile ad Admin Web;
- `ambiguous`: duplicato o conflitto, nessun dato live esposto.

UI futura:

- `mapped`: badge `Read model` o `Live`, solo se dati live realmente autorizzati;
- `unmapped`: `Mapping required`;
- `not_configured`: `Not configured`;
- `mobile_only`: `Mobile only`;
- `ambiguous`: `Ambiguous mapping`, dati nascosti.

Test anti leak:

- stesso `owner_user_id` collegato a due shop => blocked/ambiguous;
- stesso shop collegato a due owner attivi => blocked/ambiguous;
- `ambiguous` non ritorna inventory;
- platform admin vede lo stato ma non bypassa safety.

## 10. Piano RLS

Policy candidate, non SQL definitivo:

| Actor | Oggetti | Lettura ammessa | Lettura negata | Test richiesti |
| --- | --- | --- | --- | --- |
| Utente non autenticato | tutte le tabelle Admin Web | nessuna | tutto | anon receives empty/unauthorized |
| Authenticated non-member | proprio `profiles` minimo | profilo proprio redatto | shops/memberships di altri, audit, mapping inventory | non-member no cross-shop |
| Shop viewer | `shops`, `shop_members` redatti, eventuale read model shop | solo shop membership attiva e role viewer | platform global, altri shop, mapping ambiguous | viewer read own shop only |
| Shop owner/manager | `shops`, `shop_members`, eventuale audit shop/read model | shop autorizzati secondo membership attiva | altri shop, platform globals | owner/manager no cross-shop |
| Platform admin | profiles/shops/memberships/mapping/audit | global read solo dopo verifica server-side `platform_admins` | mutation read-only, secret, unmapped inventory raw | authorized/global read, revoked blocked |
| Record `unmapped` | `shop_inventory_sources` | stato redatto per platform admin | inventory live | unmapped no live data |
| Record `mobile_only` | `shop_inventory_sources` | stato redatto per platform admin | inventory live in Admin Web | mobile_only no live data |
| Record `ambiguous` | `shop_inventory_sources` | stato/conflitto redatto | inventory live | ambiguous no live data |
| Inventory mobile owner-scoped | tabelle mobile esistenti | owner mobile via policy esistenti; Admin Web solo via read model approvato | direct client/global reads | owner policy preserved |
| `audit_logs` | audit Admin Web | platform admin; shop-scoped se deciso | anon/non-member/cross-shop | audit no secret/no mutation |

Regole sicurezza:

- RLS obbligatoria su tabelle esposte.
- Nessun `user_metadata` / `raw_user_meta_data` per authz.
- App metadata solo eventuale cache server-managed, non fonte primaria.
- `platform_admins` fonte autorevole server-side.
- Nessun service-role nel browser.
- Nessuna policy basata solo su input client-controllable.
- View future solo con `security_invoker` quando applicabile o schema non esposto.
- Funzioni `security definer`, se necessarie in futuro, fuori schema esposto e con search path sicuro.

## 11. Piano grants / Data API

Principio: grants e RLS sono due livelli separati. Non assumere default storici.

Oggetti candidati esposti:

- idealmente un API schema dedicato o view/read model limitati, non tutte le tabelle base;
- eventuali `profiles`, `shops`, `shop_members` con `select` minimo per `authenticated`, solo se RLS pronta;
- `audit_logs` non esposto finche non serve e non e redatto;
- `platform_admins` preferibilmente non esposto direttamente alla Data API.

Oggetti candidati non esposti:

- helper private;
- eventuali funzioni privileged;
- base tables sensibili se si usa schema `api` con view;
- mapping raw se non necessario al client.

Grants minimi:

- `anon`: nessun grant sulle tabelle Admin Web;
- `authenticated`: `select` minimo solo sugli oggetti necessari e protetti da RLS;
- functions: `execute` solo ai ruoli necessari;
- revocare default grants non voluti prima o insieme alle migration.

Review plan:

- documentare exposed schemas;
- documentare exposed objects;
- verificare grants su table/view/function;
- verificare RLS attiva;
- test anon/authenticated/platform/shopped roles;
- includere grants accanto a RLS nella migration execution futura.

Rischi:

- tabelle raggiungibili dalla Data API senza RLS;
- funzioni eseguibili da ruoli non previsti;
- default privileges diversi tra vecchi e nuovi progetti;
- view in schema esposto che bypassano RLS.

## 12. Piano Auth SSR

Non implementato in `TASK-005F`.

File candidati futuri:

- `src/lib/supabase/server.ts`: evolvere con tipi `Database` e cookie-aware client;
- `src/lib/supabase/middleware.ts`: refresh sessione/cookie, se adottato;
- `middleware.ts`: integrazione Next.js;
- `src/server/platform-admin/authz.ts`: verifica `platform_admins`;
- `src/server/platform-admin/session.ts`: wrapper sessione redatta, se utile;
- `src/app/auth/callback/route.ts`: solo se provider OAuth richiede callback web.

Responsabilita server-only:

- leggere sessione/cookie lato server;
- chiamare verifica utente server-side;
- risolvere `profile_id`;
- verificare `platform_admins` come fonte autorevole;
- trattare sessione assente come `unauthorized` redatto;
- trattare sessione scaduta o refresh fallito come `unauthorized` o `session_expired`;
- trattare `platform_admin` revocato come `unauthorized`, senza data leak;
- evitare caching/ISR su route auth/protette;
- redigere errori.

Regole:

- installare `@supabase/ssr` solo in task execution dedicato, non qui;
- nessuna logica auth client-side autorevole;
- no `user_metadata` authz;
- app metadata solo cache opzionale e stale-aware;
- `getClaims()` non basta per revoca/logout; prevedere verifica auth server quando serve freschezza.

Test futuri:

- no session;
- expired session;
- revoked platform admin;
- stale app metadata;
- non-platform admin;
- platform admin active;
- cache no-store per route auth/protette;
- redaction error.

## 13. Piano tipi `Database`

Non generati in `TASK-005F`.

Comandi futuri candidati, da eseguire solo in task autorizzato:

- `npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public > src/lib/supabase/database.types.ts`
- oppure generazione locale con `--local` se ambiente locale Supabase viene approvato.

Prerequisiti:

- project ref approvato;
- schema/migration applicati o local DB allineato;
- Supabase CLI disponibile e versione scoperta con `--help`;
- nessun access token o DB URL stampato;
- output reviewato.

Destinazione candidata:

- `src/lib/supabase/database.types.ts`.

Collegamento ai mapper:

- sostituire `*RowCandidate` con alias da `Database["public"]["Tables"][...]["Row"]` solo dopo generazione;
- mantenere domain types separati;
- mapper falliscono su schema mismatch.

Test schema mismatch:

- typecheck con tipi generati;
- mapper unit tests;
- no `any`;
- check nullable/optional;
- query field selection allineata ai mapper.

Se i tipi non corrispondono:

- bloccare execution;
- aggiornare schema/migration o mapper;
- non correggere con cast permissivi.

## 14. Migration strategy futura

Task futuro consigliato: `TASK-005G - Supabase Schema Migration Execution`.

Ordine consigliato:

1. preparare ambiente target e backup/rollback posture;
2. creare migration solo nel task execution dedicato;
3. creare enum/check/domain constraints minimi;
4. creare `profiles`;
5. creare `shops`;
6. creare `shop_members`;
7. creare `platform_admins`;
8. creare `shop_inventory_sources`;
9. creare `audit_logs` se incluso;
10. aggiungere RLS per ogni tabella esposta;
11. aggiungere grants Data API minimi;
12. aggiungere seed sintetico se autorizzato;
13. generare tipi `Database`;
14. eseguire harness RLS/grants/types/mappers/security.

Rollback posture:

- migration piccole e reversibili dove possibile;
- no destructive change senza backup e rollback plan;
- seed test separato e cleanup documentato;
- nessun dato reale nei seed.

Review SQL:

- RLS enabled;
- grants espliciti;
- no `security definer` in schema esposto;
- search path controllato se funzioni privileged future;
- no broad `select *` in view esposte;
- constraints owner/shop 1:1.

PASS/FAIL/BLOCKED:

- `PASS`: migration reviewata, applicata in ambiente autorizzato, tests verdi;
- `FAIL`: SQL/test fallisce o policy espone dati;
- `BLOCKED`: env/project ref/permessi mancanti;
- `NOT_RUN`: live vietato o non richiesto.

## 15. Test data strategy

Solo dati sintetici e redatti. Prefissi obbligatori: `synthetic_` o `example_`.

Dataset candidato:

- `synthetic_profile_platform_admin`;
- `synthetic_profile_shop_owner`;
- `synthetic_profile_shop_manager`;
- `synthetic_profile_viewer`;
- `synthetic_profile_unauthorized`;
- `synthetic_shop_alpha`;
- `synthetic_shop_beta`;
- `synthetic_membership_owner_alpha`;
- `synthetic_membership_manager_alpha`;
- `synthetic_membership_viewer_beta`;
- `synthetic_platform_admin_active`;
- `synthetic_platform_admin_revoked`;
- `synthetic_inventory_source_mapped_alpha`;
- `synthetic_inventory_source_unmapped`;
- `synthetic_inventory_source_not_configured`;
- `synthetic_inventory_source_mobile_only`;
- `synthetic_inventory_source_ambiguous`.

Casi obbligatori:

- mapped;
- unmapped;
- not_configured;
- mobile_only;
- ambiguous;
- unauthorized;
- revoked/stale token;
- empty/error;
- no cross-shop access.

Divieti:

- nessuna email reale;
- nessun token;
- nessun PIN/password;
- nessun dato commerciale reale.

## 16. Harness futuri obbligatori

| Harness | Scopo | Quando |
| --- | --- | --- |
| RLS tests | Verificare anon/authenticated/member/platform/revoked/no cross-shop | Dopo migration/RLS |
| Grants review | Verificare Data API grants su table/view/function | In migration execution |
| Auth SSR tests | authorized/unauthorized/session expired/no cache leak | Quando `@supabase/ssr` viene introdotto |
| Platform admin tests | active/revoked/stale token/no data leak | Quando `platform_admins` esiste |
| Mapper tests | `Database -> view model` | Dopo tipi generati |
| No cross-shop leakage | mapping/read model non espone shop non autorizzati | Prima di TASK-005 |
| No service-role client | static scan client/browser | Sempre in verify |
| No secret/redaction | scan report/env/errors | Sempre prima di handoff |
| No mutation read-only | bloccare insert/update/delete/upsert/RPC mutative | TASK-005 e read model |
| No direct DB import client | UI non importa server/db | Prima di UI live |
| No mock-as-live | mock mai etichettato live | Prima di UI live |
| Schema mismatch | tipi generati vs mapper/query | Dopo gen types |
| Error redaction | SQL/token/errori interni non esposti | Prima di UI live |
| Pagination/limit budget | limiti server-side, no fetch globale | Prima di query globali |

Non sono stati implementati nuovi harness in `TASK-005F`.

## 17. UI/UX futura

Stati richiesti:

- `Not configured`: configurazione/fonte assente.
- `Unauthorized`: utente non autorizzato, senza dettagli interni.
- `Empty`: lista autorizzata ma senza righe.
- `Error`: errore redatto.
- `Audit not configured`: audit assente per read-only.
- `Mapping required`: fonte nota ma non collegata.
- `Mobile only`: fonte non esposta ad Admin Web.
- `Unmapped`: sorgente non associata.
- `Ambiguous mapping`: conflitto, dati nascosti.
- `Live`: solo dati reali autorizzati e verificati.
- `Read model`: dati derivati da server/read model autorizzato.
- `Mock`: dati sintetici, mai mescolati al live.

Copy operativo:

- evitare SQL, token, id interni non necessari;
- usare testo breve orientato all'azione: `Mapping required`, `Not configured`, `Access unavailable`;
- safe operations assenti o disabilitate;
- nessuna gestione ordinaria POS/staff fuori Shop Admin.

Verifiche future:

- focus/keyboard/contrasto solo quando UI cambia;
- smoke UI solo quando runtime/UI cambia.

## 18. Performance plan

- paginazione obbligatoria;
- limiti server-side;
- no fetch globale enorme;
- no N+1;
- summary dashboard separata da liste;
- query budget per endpoint/read model;
- caching solo compatibile con auth e session freshness;
- no prefetch dati sensibili;
- test performance futuri su dataset sintetico.

## 19. Safety gate per migration execution

Aprire `TASK-005G` solo se:

1. schema candidate approvato;
2. ambiente target scelto;
3. rollback posture definita;
4. RLS policy plan accettato;
5. grants/Data API plan accettato;
6. Auth SSR plan accettato;
7. mapping owner/shop 1:1 confermato;
8. test data sintetici approvati;
9. no secret strategy approvata;
10. harness minimi definiti.

## 20. Gate ancora bloccanti per TASK-005

`TASK-005` resta `PLANNED_BLOCKED` finche mancano:

- migration/schema reale;
- RLS applicate e testate;
- grants/Data API review;
- Auth SSR runtime;
- `platform_admins` reale con revoca;
- tipi `Database` generati;
- mapper allineati ai tipi;
- test no cross-shop leakage;
- no mutation read-only harness;
- UI states live/mock/read model verificati;
- approvazione esplicita per dati live.

## 21. Check finali

Eseguiti in `TASK-005F`:

- `git diff --check`: `PASS`, nessun output.
- `git status --short`: `PASS_WITH_NOTES`, mostra le modifiche/untracked attese nel worktree, incluso il nuovo `TASK-005F`.

`NOT_RUN` per planning-only:

- `npm run test:foundation`: documenti only, nessun codice/harness modificato.
- `npm run security:scan`: documenti only, nessun codice/harness modificato.
- `npm run lint`: documenti only.
- `npm run typecheck`: documenti only.
- `npm run build`: documenti only.
- `npm run verify`: documenti only.
- Playwright/smoke UI: nessuna UI modificata.
- Supabase live/migration/seed/query: vietato.
- iOS/Android build: fuori perimetro.

## 22. Fuori scope confermato

- Nessuna migration SQL.
- Nessun Supabase live.
- Nessuna query live.
- Nessun tipo `Database` generato.
- Nessun Auth SSR runtime.
- Nessun CRUD.
- Nessuna UI live.
- Nessuna modifica Android/iOS/POS.
- Nessun commit.
- Nessun `TASK-005` sbloccato.
- Nessun `merchant -> stores`.

## 23. Rischi residui

- Nessuna evidence live Supabase in questo task.
- Il piano resta candidate schema, non migration.
- `platform_admins` richiede bootstrap sicuro.
- Mapping owner/shop resta rischio principale di data leak.
- Grants/Data API possono variare per progetto/default; vanno verificati nel target.
- Auth SSR puo introdurre cache/session leakage se non configurata con cura.
- Tipi `Database` possono divergere dai mapper candidate.

## 24. Handoff

- Verdict: `READY_FOR_REVIEW`.
- `TASK-005F` resta planning tecnico.
- `TASK-005` resta `PLANNED_BLOCKED`.
- Prossimo passo concreto: review di `TASK-005F`; se approvato, aprire `TASK-005G - Supabase Schema Migration Execution` per creare migration in ambiente controllato, non aprire ancora `TASK-005`.
