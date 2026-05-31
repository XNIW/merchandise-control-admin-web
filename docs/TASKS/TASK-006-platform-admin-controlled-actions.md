# TASK-006 - Platform Admin Controlled Actions

## Informazioni generali

- ID: `TASK-006`
- Titolo: Platform Admin Controlled Actions
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Execution: `COMPLETED`
- Responsabile attuale: `CODEX / DONE_RECONCILIATION`
- Data apertura planning: 2026-05-30
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-006/README.md`
- Commit: `NOT_CREATED` (richiesto esplicitamente no commit)
- Push: `NOT_RUN` (richiesto esplicitamente no push)
- Review/fix correttiva: `COMPLETED` il 2026-05-30
- Verdict review/fix Codex: `PASS_WITH_NOTES`
- Review finale / DONE reconciliation: `DONE_RECONCILED` il 2026-05-30

## Guardrail del task

Execution autorizzata dall'utente via allegato e completata come `TASK-006` unico.

Non sono stati creati `TASK-006A`, `TASK-006B`, `TASK-006C`, `TASK-006D` o `TASK-006E`.
Non sono stati introdotti service-role client/browser, segreti nel repository, hard delete, cancellazione audit, modifiche mobile o route handler mutativi paralleli.
Il task e stato marcato `DONE` solo nella review finale del 2026-05-30, dopo autorizzazione esplicita dell'utente alla reconciliation automatica di `TASK-006`..`TASK-009`.

## Review finale / DONE reconciliation - 2026-05-30

- Verdict finale: `DONE_RECONCILED`.
- Fix applicati durante la review finale: nessun fix specifico TASK-006; confermata la review/fix precedente su `Controlled Operations`, redazione risultati e scanner `.sql`.
- Check locali freschi:
  - `npm run typecheck`: `PASS`.
  - `npm run lint`: `PASS`.
  - `npm run test:foundation`: `PASS`, 32 test passati.
  - `npm run security:scan`: `PASS`.
  - `npm run build`: `PASS_WITH_WARNINGS`, solo warning Node `DEP0205` gia noto.
  - `npm run test:ui-smoke` con `next start` production su `127.0.0.1:3106`: `PASS_WITH_WARNINGS`, 44 test passati; warning `DEP0205` e `NO_COLOR`/`FORCE_COLOR` non bloccanti.
  - `git diff --check`: `PASS`.
- Check Supabase linked freschi:
  - `supabase migration list --linked`: `PASS`, local/remoto allineati fino a `20260530120000`.
  - `supabase db push --linked --dry-run`: `PASS`, remote database up to date.
  - `supabase db lint --linked --schema public,app_private --level error --fail-on error`: `PASS`, no schema errors.
  - `supabase db advisors --linked --type security --level error --fail-on error`: `PASS`, no issues found.
- Acceptance criteria finali: `PASS`; nessun blocker critico aperto.
- Rischi residui accettati: warning Node/Playwright non bloccanti; record sintetici TASK-006 archiviati restano per audit trail; nessuna pulizia fisica perche fuori scope.
- Non fatto: nessun commit, nessun push, nessun TASK-010 aperto, nessun hard delete, nessun service-role client/browser.

## Summary execution

- Creata e applicata la migration `supabase/migrations/20260530120000_task_006_platform_admin_controlled_actions.sql`.
- Aggiunte colonne stato su `shops`: suspend metadata, reason redatta, actor/timestamp ultimo cambio stato.
- Esteso `audit_logs.result` con `failure`.
- Aggiunte RPC transazionali `security definer` con `search_path` controllato:
  - `public.platform_create_shop`;
  - `public.platform_suspend_shop`;
  - `public.platform_reactivate_shop`;
  - `public.platform_soft_delete_shop`.
- Mantenuto grant mutativo diretto nullo sulle tabelle Admin Web per `authenticated` e `anon`; execute solo alle RPC approvate per `authenticated`.
- Implementate funzioni server-only in `src/server/platform-admin/shop-actions.ts` e Server Actions sottili in `src/app/platform/operations/actions.ts`.
- Aggiornata `/platform/operations` come `Controlled Operations` con create shop, assegnazione owner iniziale, suspend, reactivate e soft delete con conferme shop code visibili.
- Aggiunti redirect post-action con risultato redatto e banner `aria-live`; rimossa etichetta fuorviante `Safe Operations` dalla superficie mutativa.
- Rigenerati tipi Supabase in `src/lib/supabase/database.types.ts`.
- Aggiornati harness foundation, security e Playwright, incluso gate live TASK-006 con dati sintetici.
- Fixata configurazione ESLint per ignorare artifact Playwright/test-results anche quando assenti.

## Summary decisionale finale

- `TASK-006` e rimasto monolitico: controlled actions Platform Admin complete in un solo task.
- La execution usa Server Actions sottili solo come entrypoint App Router, logica server-only in `src/server/platform-admin/*` e RPC SQL atomiche come boundary transazionale.
- Le RPC sono `security definer`, con `search_path` controllato, grant `execute` minimo a `authenticated`, revoke da `anon` e nessun grant mutativo diretto sulle tabelle Admin Web.
- L'autorizzazione resta doppia: `authorizeCurrentPlatformAdmin()` lato TypeScript e `app_private.is_platform_admin()` lato SQL.
- `audit_logs.result` e stato esteso a `failure`: `success` per mutazioni riuscite, `blocked` per negazioni attese/validation/conflict, `failure` per errore tecnico inatteso.
- `shops.shop_status='archived'` rappresenta la cancellazione logica di `TASK-006`; non si introduce `deleted_at` e non si introduce un livello `merchant -> stores`.
- `assign initial owner` resta incorporato in create shop; il trasferimento owner separato e fuori scope.
- Create shop non deve creare automaticamente `shop_inventory_sources not_configured` in `TASK-006`; il mapping inventory/mobile resta futuro e separato, salvo review execution che dimostri un uso UI/read-model indispensabile.
- Verdict planning review storico: `PASS_WITH_NOTES`; la execution e la review/fix correttiva sono state completate successivamente. La conferma/autorizzazione esplicita utente per la reconciliation finale e arrivata prima del passaggio a `DONE`.

## Stato iniziale repo-grounded

- `TASK-001`..`TASK-005L` risultano chiusi nel Master Plan.
- `TASK-005` read-only e chiuso a `DONE`, con Platform Admin live/auth/read-only validato fino a `TASK-005K` e riconciliato in `TASK-005L`.
- `TASK-006` era il task successivo nel Master Plan ed e ora in execution handoff.
- La UI `/platform/operations` e ora la superficie mutativa `Controlled Operations`.
- `src/server/platform-admin/read-model.ts` usa solo letture Supabase sequenziali e mantiene il contratto `readOnly: true`.
- `src/server/platform-admin/authz.ts` autorizza `platform_admin` server-side leggendo `platform_admins` con `status='active'` e `revoked_at is null`.
- La migration Admin Web attuale e `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`.
- Le tabelle Admin Web hanno RLS attiva e grant `SELECT` a `authenticated`; non hanno grant mutativi per `authenticated`.

## Precondition e assumption

Sezione storica: queste condizioni sono state rivalidate all'inizio della execution, prima di scrivere codice o migration.

- Master Plan allineato con `TASK-006` come unico task attivo.
- Nessun `TASK-006A/B/C/D/E` creato.
- `.env.example` resta value-free e `.env.local` non viene stampato.
- `/platform/operations` e diventata mutativa solo dopo implementazione di Server Actions e RPC.
- `platform_admin` server-side resta basato su `platform_admins`, non su metadata auth.
- `audit_logs` resta append-only.
- Grants Admin Web restano `SELECT`-only sulle tabelle per `authenticated`; le mutazioni passano solo da RPC approvate.
- La execution ha letto le guide Next pertinenti in `node_modules/next/dist/docs/` prima di cambiare convenzioni App Router o Server Actions.

## Scope unico TASK-006

`TASK-006` deve restare un unico task completo e includere insieme:

- create shop;
- assign initial owner;
- suspend shop;
- reactivate shop;
- soft delete shop;
- audit log obbligatorio per attempt/success/failure;
- UI safe operations su `/platform/operations`;
- autorizzazione server-side `platform_admin`;
- migration/RLS/grants/policy coerenti se necessarie;
- update `src/lib/supabase/database.types.ts` se cambia schema;
- test SQL, foundation/unit, security, build, Playwright e browser live;
- evidence completa.

## Non scope

Restano fuori da `TASK-006`:

- Shop Admin Console completa;
- gestione prodotti, fornitori e categorie;
- import/export Excel;
- staff POS;
- PIN/password staff;
- dispositivi;
- ruoli/permessi granulari completi;
- Android/iOS/POS changes;
- sync mobile;
- Vercel/deploy;
- service-role client/browser;
- hard delete;
- commit e push.

## Decisioni architetturali

| Tema | Decisione planning | Motivo |
| --- | --- | --- |
| Primitive HTTP | Usare Server Actions collegate a `/platform/operations`, con funzioni server-only in `src/server/platform-admin/shop-actions.ts`. | Restano integrate con App Router, sessione SSR e refresh/revalidation della UI senza introdurre API pubbliche mutative. |
| RPC SQL | Usare RPC SQL `security definer` per le azioni atomiche, chiamata dal server client SSR con sessione utente. | L'attuale RLS/grants concede solo `SELECT`. Le azioni multi-step richiedono atomicita tra shop, membership e audit. La RPC mantiene DB come boundary finale e non richiede service-role runtime. |
| Authz | Verifica doppia: `authorizeCurrentPlatformAdmin()` in TypeScript e `app_private.is_platform_admin()` dentro RPC. | Nessuna fiducia in UI/client; revoked admin e sessioni mancanti restano bloccati. |
| Audit success/failure | Le RPC scrivono audit per attempt/success/failure quando l'actor e identificato. Failure senza sessione o senza admin puo essere auditata solo se l'actor e noto e senza data leak. | L'audit deve essere vicino alla mutazione per evitare inconsistenza. |
| Conflitti/idempotenza | Duplicate `shop_code` e owner incompatibile sono `conflict`; suspend/reactivate su stato gia coerente sono no-op auditati con `result='blocked'` o evento dedicato failure redatto; soft delete gia archiviato e no-op bloccato. | Evita doppie mutazioni e rende verificabile il comportamento concorrente. |
| `shop_code` | Normalizzare trim+uppercase lato server e validare regex DB `^[A-Z0-9][A-Z0-9_-]{2,31}$`; unique resta su `shops.shop_code`. | Coerente con constraint esistente. |
| Owner iniziale | `owner_profile_id` deve esistere in `profiles`, essere `profile_status='active'`, non essere staff POS, e non avere membership incompatibile nello stesso shop. | Gli account web personali restano separati da staff POS. |
| Soft delete | Usare lo stato esistente `archived` come cancellazione logica per compatibilita schema/mobile; UI ed eventi lo chiamano `soft_delete`. | Lo schema attuale non ha `deleted`; introdurre un nuovo stato romperebbe mapper/tipi e potenzialmente mobile. |
| Colonne mancanti | Migration candidata aggiunge obbligatoriamente a `shops`: `suspended_at`, `suspended_by_profile_id`, `status_reason_redacted`, `status_changed_at`, `status_changed_by_profile_id`. Non aggiunge `deleted_at/deleted_by`; usa `archived_at/archived_by_profile_id` esistenti per soft delete. | Le azioni richiedono actor, timestamp e reason coerenti per ogni cambio stato; `archived` e gia nello schema e rappresenta la cancellazione logica. |
| Mobile compatibility | Non toccare tabelle mobile inventory/sync e mantenere `shop_inventory_sources` 1:1 come mapping separato. | Evita regressioni owner-scoped mobile e cross-shop leak. |

## Stato schema attuale

| Tabella | Colonne rilevanti presenti | Mancanze per TASK-006 | RLS/grants attuali |
| --- | --- | --- | --- |
| `profiles` | `profile_id`, `display_name`, `profile_status`, `disabled_at`, `disabled_by_profile_id`, `created_at`, `updated_at` | nessuna colonna obbligatoria; serve solo lookup owner attivo | RLS attiva; `SELECT` authenticated; policy self/platform admin |
| `shops` | `shop_id`, `shop_code`, `shop_name`, `shop_status`, `created_by_profile_id`, `archived_at`, `archived_by_profile_id`, timestamps | mancano `suspended_at`, `suspended_by_profile_id`, reason redatta/status change metadata; grant/policy mutative assenti | RLS attiva; `SELECT` authenticated; policy member/platform admin |
| `shop_members` | `profile_id`, `shop_id`, `role_key`, `membership_status`, `invited_by_profile_id`, `suspended_at`, `suspended_by_profile_id` | grant/policy insert per owner iniziale assenti se non si usa RPC | RLS attiva; `SELECT` authenticated; policy related/platform admin |
| `platform_admins` | `profile_id`, `status`, `granted_at`, `revoked_at`, `reason_redacted` | nessuna | RLS attiva; `SELECT` authenticated; helper `app_private.is_platform_admin()` |
| `audit_logs` | `actor_profile_id`, `scope`, `shop_id`, `event_key`, `severity`, `result`, `target_type`, `target_id`, `metadata_redacted`, `created_at` | `result` oggi permette `success`, `blocked`, `simulated`; `TASK-006` deve estendere il check constraint a `failure` | RLS attiva; append-only trigger; `SELECT` authenticated |
| `shop_inventory_sources` | mapping owner mobile/shop con stati `mapped`, `unmapped`, `not_configured`, `mobile_only`, `ambiguous` | nessuna per controlled actions; non deve essere mutata salvo decisione esplicita futura | RLS attiva; `SELECT` authenticated |

## Migration candidate

La futura execution deve creare una migration forward-only, per esempio `supabase/migrations/<timestamp>_task_006_platform_admin_controlled_actions.sql`, con:

- nuove colonne idempotenti su `public.shops`:
  - `suspended_at timestamptz`;
  - `suspended_by_profile_id uuid references public.profiles(profile_id)`;
  - `status_reason_redacted text`;
  - `status_changed_at timestamptz not null default now()`;
  - `status_changed_by_profile_id uuid references public.profiles(profile_id)`;
- constraint coerenti:
  - `shop_status='suspended'` richiede `suspended_at is not null`;
  - `shop_status<>'suspended'` richiede `suspended_at is null`;
  - `shop_status='archived'` richiede `archived_at is not null`;
  - `shop_status<>'archived'` richiede `archived_at is null`;
- estensione `audit_logs_result_check` per includere `failure`;
- funzioni RPC in schema privato o pubblico callable solo da `authenticated`, per esempio:
  - `public.platform_create_shop(...)`;
  - `public.platform_suspend_shop(...)`;
  - `public.platform_reactivate_shop(...)`;
  - `public.platform_soft_delete_shop(...)`;
- revoke da `anon` e grant `execute` minimo a `authenticated` sulle RPC;
- nessun grant mutativo diretto su tabelle Admin Web a `authenticated`, salvo motivazione documentata;
- commenti SQL sintetici per boundary e audit.

Rollback strategy: non fare rollback distruttivo in production. Se una RPC e difettosa, nuova migration forward-only che revoca execute o sostituisce funzione con failure controllata. Le colonne aggiunte restano additive.

Esecuzione futura obbligatoria:

1. `supabase migration list --linked`
2. `supabase db push --linked --dry-run`
3. review SQL dry-run
4. `supabase db lint --linked --schema public,app_private --level error --fail-on error`
5. `supabase db advisors --linked --type security --level error --fail-on error`
6. apply solo dopo dry-run sicuro e approvazione execution
7. rigenerazione `src/lib/supabase/database.types.ts`

## SQL function contract

Le RPC future devono essere definite in `public` per essere invocabili via PostgREST/Supabase client, ma devono delegare solo a logica interna con `security definer` controllato. Ogni funzione deve:

- essere `security definer` con owner privilegiato controllato dalla migration;
- impostare `set search_path = public, app_private, pg_temp`;
- validare `auth.uid()` non nullo;
- chiamare `app_private.is_platform_admin()` prima di leggere o mutare target sensibili;
- normalizzare input minimi dentro SQL, anche se gia validati in TypeScript;
- inserire audit attempt prima della mutazione quando l'actor e autorizzato e identificato;
- eseguire mutazione e audit success/failure nella stessa transazione della funzione;
- restituire solo payload redatto, per esempio `{ ok, code, shop_id, event_id }`;
- non restituire email complete, token, stack trace, constraint raw o valori secret;
- usare lock mirati dove serve, per esempio `select ... for update` sullo shop target nelle transizioni stato;
- usare error code applicativi stabili, non messaggi DB grezzi.

Contratti candidati:

| RPC | Input | Output redatto | Note |
| --- | --- | --- | --- |
| `public.platform_create_shop` | `shop_name text`, `shop_code text`, `owner_profile_id uuid`, `reason text` | `ok`, `code`, `shop_id` | Crea shop active e membership owner atomici. |
| `public.platform_suspend_shop` | `shop_id uuid`, `reason text`, `confirmation text` | `ok`, `code`, `shop_id` | Blocca archived e no-op suspended con audit `blocked`. |
| `public.platform_reactivate_shop` | `shop_id uuid`, `reason text`, `confirmation text` | `ok`, `code`, `shop_id` | Solo suspended -> active. |
| `public.platform_soft_delete_shop` | `shop_id uuid`, `shop_code_confirmation text`, `reason text` | `ok`, `code`, `shop_id` | Usa archived come stato terminale; richiede conferma forte. |

La duplicazione TS/SQL va tenuta intenzionale e minima: TypeScript serve UX e redazione precoce; SQL e il controllo definitivo per sicurezza, atomicita e consistenza. Non aggiungere route handlers mutativi paralleli in `TASK-006`.

Il mapping errori deve essere stabile:

| Code | Categoria | Audit result | UI |
| --- | --- | --- | --- |
| `unauthorized` | sessione mancante, non admin, admin revoked | `blocked` se actor noto | messaggio accesso negato redatto |
| `validation_failed` | input mancante/formato invalido | `blocked` | evidenza campo senza eco dati sensibili |
| `duplicate_shop_code` | conflitto unique atteso | `blocked` | conflitto redatto |
| `owner_not_found` / `owner_not_active` | owner lookup invalido | `blocked` | owner non valido redatto |
| `invalid_state` | transizione non ammessa | `blocked` | azione non disponibile |
| `db_failure` | errore tecnico inatteso | `failure` | richiesta non completata |

## Shop status state machine

| Transizione | Da | A | Actor | Input richiesti | Audit | Metadata status | Allowed | Blocked/no-op | UI state | Test futuro |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| create | nessuno | `active` | platform_admin active | `shop_name`, `shop_code`, `owner_profile_id`, `reason` | create attempt/success/failure e owner assign attempt/success/failure | `created_by_profile_id`, `status_changed_at`, `status_changed_by_profile_id`, reason redatta | profilo owner active, code unique | duplicate code, owner missing/non active, unauthorized | form create separato | create + membership + audit |
| suspend | `active`, `pending_setup` | `suspended` | platform_admin active | `shop_id`, `reason`, confirmation | suspend attempt/success/failure | `suspended_at`, `suspended_by_profile_id`, `status_changed_at`, `status_changed_by_profile_id`, reason redatta | shop non archived | gia suspended = blocked auditato; archived = blocked | azione abilitata solo se stato valido | stato + audit |
| reactivate | `suspended` | `active` | platform_admin active | `shop_id`, `reason`, confirmation | reactivate attempt/success/failure | pulisce suspend metadata, aggiorna `status_changed_at`, `status_changed_by_profile_id`, reason redatta | solo suspended | active/pending_setup/archived = blocked | azione abilitata solo su suspended | stato + audit |
| soft_delete | `active`, `pending_setup`, `suspended` | `archived` | platform_admin active | `shop_id`, `reason`, digitazione `shop_code` | soft_delete attempt/success/failure | `archived_at`, `archived_by_profile_id`, `status_changed_at`, `status_changed_by_profile_id`, reason redatta | shop non archived e code confermato | archived = blocked; code mismatch = validation | danger zone, conferma forte | archived terminale, no hard delete |

Invarianti:

- `archived` e terminale in `TASK-006`; non e riattivabile.
- `suspended` richiede `suspended_at` e `suspended_by_profile_id`.
- `active` e `pending_setup` non devono avere metadata suspend attivi.
- `archived` richiede `archived_at` e `archived_by_profile_id`.
- ogni transizione aggiorna `status_changed_at`, `status_changed_by_profile_id` e `status_reason_redacted`.
- reactivate pulisce `suspended_at` e `suspended_by_profile_id`, ma conserva audit storico.

## Data access design

File candidati per la futura execution:

- creare `src/server/platform-admin/action-types.ts`: tipi input/output, error code redatti, event key.
- creare `src/server/platform-admin/audit-events.ts`: costanti eventi audit.
- creare `src/server/platform-admin/shop-action-validation.ts`: normalizzazione e validazione server-side degli input.
- creare `src/server/platform-admin/shop-actions.ts`: funzioni server-only che autorizzano e chiamano RPC.
- creare `src/app/platform/operations/actions.ts`: Server Actions sottili che chiamano `shop-actions.ts` e fanno `revalidatePath("/platform/operations")` e, se necessario, `revalidatePath("/platform/shops")`.
- modificare `src/app/platform/operations/page.tsx`: comporre la pagina operations reale mantenendo `dynamic = "force-dynamic"`.
- creare componenti sotto `src/components/platform/operations/`: form create shop, selettore shop, pannelli suspend/reactivate/soft delete, confirmation.
- aggiornare `src/server/platform-admin/read-model.ts` solo se serve esporre campi nuovi alla UI.
- aggiornare `src/server/platform-admin/mappers.ts` e tipi dominio solo se campi/stati nuovi cambiano la view.

Le Server Actions non devono contenere segreti, query raw non redatte o log runtime. Il client non importa `@/server/*` o `@/lib/supabase/server`.

Semplificazione anti-overengineering: non creare route handlers mutativi, non introdurre nuove dipendenze, non creare framework custom per form/actions e non separare ulteriormente i file se una funzione resta piccola e leggibile. La separazione proposta serve solo dove evita duplicazione reale tra validazione, tipi, audit event key e chiamate RPC.

## Azione: create shop + assign initial owner

Input minimi:

- `shop_name`;
- `shop_code`;
- `owner_profile_id`;
- `reason`.

Validazioni:

- `shop_name` trim non vuoto;
- `shop_code` trim, uppercase e formato DB;
- `shop_code` unique;
- owner esiste in `profiles`;
- owner `profile_status='active'`;
- owner non e account staff POS;
- owner non ha membership incompatibile nello stesso shop;
- actor e `platform_admin` active;
- `reason` trim non vuoto e redatta.

Scritture previste dentro RPC atomica:

- audit `platform.shop.create.attempt`;
- insert `shops` con `shop_status='active'`, `created_by_profile_id=actor`;
- insert `shop_members` con `role_key='shop_owner'`, `membership_status='active'`, `invited_by_profile_id=actor`;
- nessun insert automatico in `shop_inventory_sources` in `TASK-006`; inventory/mobile mapping resta fuori scope;
- audit `platform.shop.create.success` o `platform.shop.create.failure`.

Errori redatti:

- `unauthorized`;
- `duplicate_shop_code`;
- `owner_not_found`;
- `owner_not_active`;
- `validation_failed`;
- `conflict`;
- `db_failure`.

`assign initial owner` e permesso solo come parte della create shop in `TASK-006`. Una action separata di trasferimento owner resta fuori scope per evitare gestione parziale di ruoli/permessi.

## Azione: suspend shop

Input:

- `shop_id`;
- `reason`;
- `confirmation`.

Regole:

- stato valido: `active` o `pending_setup` -> `suspended`;
- vietato su `archived`;
- se gia `suspended`, no-op auditato come failure/bloccato redatto;
- update `shops.shop_status='suspended'`, `suspended_at=now()`, `suspended_by_profile_id=actor`, `status_reason_redacted=reason`;
- audit attempt/success/failure;
- UI con azione pericolosa, conferma e messaggio redatto.

## Azione: reactivate shop

Input:

- `shop_id`;
- `reason`;
- `confirmation`.

Regole:

- stato valido: `suspended` -> `active`;
- vietato su `archived`;
- se gia `active`, no-op auditato come failure/bloccato redatto;
- update `shops.shop_status='active'`, `suspended_at=null`, `suspended_by_profile_id=null`, `status_reason_redacted=reason`;
- audit attempt/success/failure;
- UI e test dedicati.

## Azione: soft delete shop

Input:

- `shop_id`;
- `reason`;
- confirmation forte con digitazione `shop_code`.

Regole:

- stato valido: `active`, `pending_setup` o `suspended` -> `archived`;
- hard delete vietato;
- non cancellare audit;
- non cancellare membership in `TASK-006`;
- update `shops.shop_status='archived'`, `archived_at=now()`, `archived_by_profile_id=actor`, `status_reason_redacted=reason`;
- audit attempt/success/failure;
- UI in zona pericolosa, testo chiaro, nessun undo automatico.

## Audit obbligatorio

Eventi richiesti:

- `platform.shop.create.attempt`
- `platform.shop.create.success`
- `platform.shop.create.failure`
- `platform.shop.owner.assign.attempt`
- `platform.shop.owner.assign.success`
- `platform.shop.owner.assign.failure`
- `platform.shop.suspend.attempt`
- `platform.shop.suspend.success`
- `platform.shop.suspend.failure`
- `platform.shop.reactivate.attempt`
- `platform.shop.reactivate.success`
- `platform.shop.reactivate.failure`
- `platform.shop.soft_delete.attempt`
- `platform.shop.soft_delete.success`
- `platform.shop.soft_delete.failure`

Gli eventi owner assign restano separati anche se l'azione e incorporata in create shop: servono a distinguere il fallimento della membership dal fallimento dell'insert shop nella stessa transazione. Se in execution la RPC non puo produrre entrambi senza rumore, deve mantenere almeno metadata redatti che distinguano `shop_created=false` da `owner_assigned=false`.

Ridondanza audit accettata: gli event key sono numerosi ma intenzionali, perche ogni controlled action richiede tracciabilita attempt/success/failure. Non aggiungere altri event key in `TASK-006` senza una nuova azione o un nuovo target auditabile.

Ogni audit deve contenere:

- `actor_profile_id` se disponibile;
- `scope` `global` o `shop`;
- `shop_id` se disponibile;
- `event_key`;
- `severity`;
- `result`;
- `metadata_redacted` con reason redatta;
- `target_type` e `target_id` redatti;
- timestamp DB;
- nessun secret, token, password, PIN o email completa non necessaria.

## UI/UX planning

`/platform/operations` deve diventare la pagina operativa principale:

- form create shop + initial owner;
- selettore shop da read model;
- riepilogo shop selezionato con `shop_code`, stato corrente, owner noto e ultimi audit correlati;
- area "Create shop" separata dalla "Danger zone";
- banner rischio per azioni mutative, con testo operativo e senza dati sensibili;
- pannelli suspend/reactivate/soft delete con stati disabilitati coerenti;
- confirmation panel accessibile, preferito a modali complesse salvo necessita reale;
- digitazione `shop_code` obbligatoria per soft delete;
- reason obbligatorio per ogni azione;
- pending/loading per singola action;
- success/error redatti;
- stato empty per nessuno shop selezionato o nessuno shop visibile;
- stati unauthorized, not_configured, no session e revoked admin;
- bottoni pericolosi disabilitati senza selezione shop o se la transizione non e valida;
- aria-live per risultati action, label esplicite, focus visibile e uso keyboard;
- audit preview read-only dagli ultimi audit logs;
- nessun mock spacciato per live;
- niente dashboard finta.

Flusso operatore previsto:

1. Il Platform Admin apre `/platform/operations`.
2. La pagina carica read model server-side e mostra stato authz.
3. Se autorizzato, l'operatore puo creare shop in un'area dedicata.
4. Per azioni su shop esistente, l'operatore seleziona uno shop e vede cosa cambiera prima di confermare.
5. Le azioni non valide per lo stato corrente sono visibili ma disabilitate con motivo redatto.
6. Dopo submit, solo il pannello interessato entra in pending; al risultato, la pagina revalida `/platform/operations` e `/platform/shops`.

## Test plan

Foundation/unit:

- validazione `shop_code`;
- validazione reason obbligatoria;
- mapper/risultati action redatti;
- no service-role client/browser;
- no user_metadata/raw_user_meta_data;
- no mock-as-live;
- `read-model` resta limitato e senza `Promise.all` remoto non necessario.

SQL/Supabase:

- active platform admin puo creare shop;
- non-platform user non puo creare shop/suspend/reactivate/soft delete;
- revoked platform admin bloccato;
- duplicate `shop_code` bloccato;
- owner missing/non active bloccato;
- create shop crea membership `shop_owner`;
- create shop scrive audit success/failure;
- suspend cambia stato e audit;
- reactivate cambia stato e audit;
- soft delete usa `archived` e non hard-delete;
- shop archived non riattivabile;
- RLS/grants: 0 grant anon, 0 grant mutativi diretti authenticated sulle tabelle Admin Web, grant execute solo RPC approvate;
- `database.types.ts` aggiornato dopo migration.

Playwright/browser live:

- `/platform/operations` mostra form e conferme a platform admin;
- unauthorized vede stato bloccato;
- create/suspend/reactivate/soft delete su dati sintetici `TASK006_TEST_`;
- read model si aggiorna dopo action;
- audit preview mostra eventi redatti;
- cleanup/archiviazione dei dati sintetici quando possibile.

Comandi futuri minimi:

- `git status --short`
- `git diff --stat`
- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run test:foundation`
- `npm run security:scan`
- `npm run build`
- `npm run verify`
- `npm run test:ui-smoke`
- live auth test dedicato TASK-006 con opt-in esplicito

## Test/evidence matrix futura

| Area | Comando futuro | Prerequisiti | PASS | FAIL | BLOCKED | NOT_RUN | Evidence prevista |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Static docs/pre-flight | `git status --short`, `git diff --stat`, `git diff --check` | worktree controllata | diff atteso e check whitespace pulito | diff inatteso o whitespace error | n/a | vietato da fase | output sintetizzato |
| Foundation | `npm run test:foundation` | test aggiornati in execution | validazione/action types/security foundation verdi | assertion fallita | dipendenze mancanti | planning-only | log test |
| Security scan | `npm run security:scan` | script aggiornato se necessario | no service-role client, no mock-as-live, no raw metadata | finding reale | n/a | planning-only | report redatto |
| Lint/type/build | `npm run lint`, `npm run typecheck`, `npm run build` | codice execution presente | exit 0 | exit non zero | ambiente Node rotto | planning-only | output comando |
| SQL rollback/local | test SQL in transazione rollback | Supabase locale o dev sicuro | RPC crea/muta/audita e rollback pulito | inconsistenza schema/RPC | DB locale non disponibile | planning-only | SQL output redatto |
| Supabase live dev | migration list, dry-run, lint, advisors | autorizzazione execution e progetto dev | dry-run sicuro, lint/advisors verdi | drift o advisor error | credenziali/progetto assenti | planning-only | output redatto |
| Playwright smoke | `npm run test:ui-smoke` | UI mutativa implementata | operations render e stati base verdi | regressione UI | browser non installato | planning-only | report/screenshot safe |
| Playwright live auth | test opt-in TASK-006 | ambiente dev, utente test, autorizzazione esplicita | create/suspend/reactivate/archive su `TASK006_TEST_` | action o audit fallisce | env live non disponibile | planning-only | trace/screenshot redatti |
| Grants/RLS scan | script/check SQL futuro | migration applicata in dev | 0 anon grants, 0 table mutative grants authenticated, execute RPC minimo | grant eccessivo | introspection non disponibile | planning-only | query summary |
| Secret/no-token | security scan + rg mirati | artifact generati | nessun JWT/token/email reale | secret-like trovato | n/a | planning-only | summary redatto |

## Automazione/tooling da pianificare in execution

Non creare tool in planning. In execution valutare solo se necessari:

- estendere `scripts/security-checks.mjs` per Server Actions mutative e import `@/server` in client components;
- includere le migration `.sql` nel secret scan generico dello scanner locale;
- aggiungere scan statico per grant RPC e assenza grant mutativi diretti su tabelle Admin Web;
- aggiungere scan per route auth-scoped `dynamic = "force-dynamic"`;
- aggiungere costanti audit event key e scan per event key non dichiarati;
- aggiungere helper test data `TASK006_TEST_` solo se evita duplicazione nei test live;
- aggiungere cleanup controllato solo per auth user temporanei; non cancellare audit e non hard-delete shop archiviati;
- verificare che Playwright storage, `.auth`, `.env.local` e report non contengano token o magic link.

## Strategia test data

- Usare solo shop sintetici con prefisso `TASK006_TEST_`.
- Usare profili/test user dev, non clienti reali.
- Non usare email reali nei documenti; preferire domini `.invalid`.
- Non cancellare audit.
- Non toccare dati mobile reali.
- Non modificare Android/iOS/POS.
- Se soft delete e append-only, lasciare record archiviati chiaramente test.
- Se viene creato un auth user temporaneo, cancellare solo l'auth user nel cleanup; lasciare audit e record shop archiviati/redatti.
- Non riportare UUID/email completi nei documenti evidence; usare fingerprint brevi redatti.

## Evidence structure futura

La futura execution deve salvare o sintetizzare evidence in:

- `docs/TASKS/EVIDENCE/TASK-006/README.md`;
- `docs/TASKS/EVIDENCE/TASK-006/sql/`, solo se servono output SQL redatti;
- `docs/TASKS/EVIDENCE/TASK-006/playwright/`, solo per screenshot/report safe;
- `docs/TASKS/EVIDENCE/TASK-006/security/`, solo per scan redatti.

Il report deve includere pre-flight, file modificati, diff stat, migration dry-run, SQL/RLS/grants checks, check locali, browser live se autorizzato, cleanup/retention dati test, rischi residui e conferme negative.

## Performance e sicurezza

- Query limitate e paginate.
- Lista shop operations limitata inizialmente a 100 righe, con piano di paginazione se il volume supera il limite operativo.
- Evitare N+1 e fetch globali non necessari.
- Mutazioni atomiche in RPC.
- No caching statico su route auth-scoped.
- `/platform/operations` resta `force-dynamic`.
- Input validato lato server e DB.
- Errori redatti.
- Secret scan obbligatorio.
- `.env.local` ignorato.
- Service-role non necessario per runtime user action; vietato nel browser/client.
- Audit append-only.
- CSRF: usare Server Actions con sessione SSR e validazione server-side; nessuna action basata solo su dati client.
- Rate/abuse: in `TASK-006` non introdurre infrastruttura pesante; pianificare limiti leggeri lato UI/pending state e considerare rate limiting separato solo se emergono abusi reali.
- Revoked admin: deve fallire sia nel controllo TS sia nella RPC.
- No `user_metadata` o `raw_user_meta_data` per autorizzazione.
- Nessun hard delete e nessuna cancellazione audit.

## Safety gates eseguiti

La execution unica di `TASK-006` e la review/fix correttiva hanno verificato questi gate:

| Gate | Richiesta | Esito ammesso |
| --- | --- | --- |
| Governance | Master Plan indica `TASK-006` unico, nessun task spezzato | `PASS` |
| Next docs | guida Next pertinente letta prima di Server Actions/App Router changes | `PASS` |
| Worktree | diff iniziale compreso e non conflittuale | `PASS` o `PASS_WITH_NOTES` |
| Schema | migration candidate reviewata prima di apply | `PASS` |
| Supabase | dry-run/lint/advisors eseguiti su linked | `PASS` |
| Security | nessun service-role browser/client, nessun auth metadata per authz | `PASS` |
| UI | operations non mostra mock come live e mantiene stati unauthorized/not_configured | `PASS` |
| Test data | prefisso `TASK006_TEST_`, `.invalid`, retention audit definita | `PASS` |
| Evidence | README evidence aggiornabile con output reali e `NOT_RUN` motivati | `PASS` |
| Long Goal review/fix | Scanner locale include `.sql`; check freschi type/lint/foundation/security/build/verify/UI smoke | `PASS_WITH_NOTES` |

## Execution prompt readiness storica

Sezione storica del planning originale, conservata per audit documentale. La execution e stata poi autorizzata dall'utente e completata in questo stesso `TASK-006`.

Il piano era pronto per essere usato come prompt di execution unica solo se la review confermava:

- nessuna decisione bloccante aperta;
- scope unico invariato;
- migration/RPC/UI/test/evidence coperti;
- comandi runtime autorizzati esplicitamente dall'utente in un messaggio successivo;
- accettazione del fatto che `TASK-006` non passera a `DONE` senza review positiva e conferma esplicita utente.

Il prompt execution doveva imporre:

- leggere AGENTS, Master Plan, task `TASK-006`, evidence e guide Next locali pertinenti;
- non creare task spezzati;
- implementare in ordine test/foundation, migration/RPC, server-only actions, Server Actions, UI, evidence;
- eseguire check reali e riportare output sintetizzati;
- non usare service-role nel browser;
- non hard-delete shop o audit;
- preparare handoff verso `REVIEW`, non marcare `DONE`.

## Criteri di stato e review

| Stato/verdict | Significato |
| --- | --- |
| `PASS` | Planning completo, coerente, eseguibile e senza incoerenze note. |
| `PASS_WITH_NOTES` | Planning completo con rischi documentati e accettabili per execution. |
| `CHANGES_REQUIRED` | Mancano decisioni bloccanti o sezioni fondamentali. |
| `BLOCKED` | Manca informazione reale indispensabile non recuperabile in planning statico. |
| `NOT_RUN` | Check non eseguito perche planning-only, runtime vietato o non applicabile. |
| `READY_FOR_REVIEW` | Piano integrato e pronto per review utente/reviewer. |
| `PLANNING_DONE` | Solo dopo review positiva del planning. |
| `READY_FOR_EXECUTION_APPROVAL` | Stato storico del planning, superato dall'execution autorizzata. |

`TASK-006` e stato marcato `DONE` nella review finale del 2026-05-30, dopo review positiva e conferma/autorizzazione esplicita dell'utente alla reconciliation automatica.

## Acceptance criteria

| CA | Criterio | Stato execution |
| --- | --- | --- |
| CA-01 | Governance aggiornata | `PASS` |
| CA-02 | Schema/migration plan chiaro | `PASS` |
| CA-03 | Create shop implemented | `PASS` |
| CA-04 | Assign owner implemented | `PASS` |
| CA-05 | Suspend implemented | `PASS` |
| CA-06 | Reactivate implemented | `PASS` |
| CA-07 | Soft delete implemented | `PASS` |
| CA-08 | Audit obbligatorio implemented | `PASS` |
| CA-09 | Authz server-side implemented | `PASS` |
| CA-10 | RLS/grants verified | `PASS` |
| CA-11 | UI operations implemented | `PASS` |
| CA-12 | Test plan executed | `PASS` |
| CA-13 | No service-role client | `PASS` |
| CA-14 | No Android/iOS/POS | `PASS` |
| CA-15 | Execution prompt futuro producibile | `SUPERSEDED_BY_EXECUTION` |
| CA-16 | Safety gates definiti ed eseguiti | `PASS` |
| CA-17 | Ready for execution approval documentale | `SUPERSEDED_BY_EXECUTION` |

## Handoff finale

- Verdict execution/review-fix: `PASS_WITH_NOTES`.
- Verdict finale reconciliation: `DONE_RECONCILED`.
- Stato finale TASK-006: `DONE`.
- Review/fix integrativa Long Goal: `PASS_WITH_NOTES`, con fix piccolo allo scanner `.sql` e check locali freschi.
- Fase: `DONE_RECONCILED`.
- Execution: `COMPLETED`.
- Decisioni rimaste aperte per review: nessuna decisione bloccante nota.
- Prossimo passo consigliato: aprire `TASK-010 - Shop Read Model Real Data` come task separato, senza implementarlo in questa reconciliation.
