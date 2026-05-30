# TASK-005E - Supabase Foundation Execution

## Stato

- Stato task: `DONE`
- Tipo: execution fondazionale controllata
- Deriva da: `TASK-005D - Supabase Schema / Auth Boundary Decision`
- Stato `TASK-005`: resta `PLANNED_BLOCKED`
- Runtime live: `DISABLED`
- Migration Supabase: `NOT_CREATED`
- Query live Supabase: `NOT_RUN`
- Commit: `NOT_CREATED`

## Obiettivo

Creare una base verificabile per la futura integrazione Supabase senza collegare la UI a dati reali e senza aprire `TASK-005`.

La foundation introduce solo:

- template env senza valori;
- dipendenza Supabase JS minima;
- guardia `server-only`;
- boundary server-side per Supabase;
- skeleton authorization `platform_admin`;
- read model server-side read-only non eseguito;
- mapper candidati separati dai tipi `Database`;
- harness statici di sicurezza;
- evidence documentale.

## Decisioni eseguite da TASK-005D

### profiles

- Scelta raccomandata: tabella applicativa `profiles` separata da `auth.users`, con FK futura a `auth.users.id`.
- Execution in TASK-005E: solo mapper candidato `ProfileRowCandidate`; nessuna tabella, migration o query.
- Safety gate: `Database` types e RLS reali obbligatori prima di usare dati live.

### platform_admin

- Scelta raccomandata: autorizzazione server-side basata su ruolo globale server-managed.
- Execution in TASK-005E: `authorizePlatformAdmin()` restituisce `not_configured` finche env/auth SSR/ruolo non esistono.
- Vietato: service-role nel client, `user_metadata`, ruolo browser-managed, allowlist in UI.

### shop_inventory_sources

- Scelta raccomandata: boundary server-side/read model dedicato, non lettura diretta client.
- Execution in TASK-005E: `inventory-sources.ts` codifica gli stati `mapped`, `unmapped`, `not_configured`, `mobile_only`.
- Stato reale: `not_configured`.

### owner_user_id e shop_id

- `shop_id -> owner_user_id`: inizialmente al massimo un owner mobile legacy per shop, trattato come mapping esterno.
- `owner_user_id -> shop_id`: inizialmente massimo 1 shop attivo per owner source mobile.
- Execution in TASK-005E: `ShopOwnerMappingRowCandidate` e `mapShopOwnerMappingRow()` senza query live.
- Fix review/finale: aggiunto `validateInitialShopOwnerMappingCardinality()` per classificare come `ambiguous` mapping `mapped` senza owner, piu owner attivi sullo stesso shop o piu shop attivi sullo stesso `owner_user_id`.
- Motivazione: mantiene la decisione `TASK-005D`; il multi-shop per owner source mobile resta fuori scope per evitare data leak cross-shop finche il modello mobile resta owner-scoped.

### audit_logs e sync_events

- `audit_logs`: obbligatorio prima di azioni mutative, ma `Audit not configured` resta accettabile per foundation/read-only.
- `sync_events`: flusso separato da audit umano/amministrativo.
- Execution in TASK-005E: mapper candidato `AuditLogRowCandidate`, nessuna scrittura e nessuna RPC.

## Boundary Client / Server / Database

- Client/UI: non importa `@supabase/*`, `src/lib/supabase`, `src/server`, ne chiavi sensibili.
- Server: unico punto Supabase in `src/lib/supabase/server.ts`, protetto da `import "server-only"`.
- Database: non configurato; nessuna migration, nessuna RLS reale, nessuna view.

## Env template

Creato `.env.example` con soli nomi variabile e valori vuoti:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`

Nessun file `.env` reale e nessun valore segreto sono stati creati o letti.

## Harness introdotti

- `npm run security:scan`
  - verifica env template vuoto;
  - blocca import Supabase/server da UI;
  - blocca pattern di mutation/RPC nel boundary read-only;
  - blocca `user_metadata` per authz;
  - blocca label mock-as-live;
  - verifica helper di redazione errori;
  - verifica coerenza cardinalita iniziale 1:1 `owner_user_id`/`shop_id`;
  - cerca literal secret/JWT-like.
- `npm run test:foundation`
  - harness Node statico per presenza file, env template, script `verify` e boundary service-role free.
- `npm run verify`
  - ora include `npm run security:scan` tra typecheck e build.

## Criteri per aprire vera execution Supabase

`TASK-005` puo essere rivalutato solo dopo:

1. schema/migration approvati e applicabili in ambiente Supabase controllato;
2. tipi `Database` generati da schema reale;
3. RLS reali su tabelle/vista esposte;
4. auth SSR funzionante e verificata;
5. `platform_admin` server-managed risolto senza `user_metadata`;
6. mapping `owner_user_id -> shop_id` validato con casi `mapped`, `unmapped`, `not_configured`, `mobile_only`;
7. audit/read-only policy chiarita per ogni endpoint;
8. harness `security:scan`, lint, typecheck, build e verify verdi;
9. nessuna chiave secret o service-role esposta al browser;
10. approvazione esplicita dell'utente per aprire execution `TASK-005`.

## Check

Risultati finali registrati in `docs/TASKS/EVIDENCE/TASK-005E/README.md`:

- `npm install @supabase/supabase-js`: `PASS`, 0 vulnerabilita.
- `npm install server-only`: `PASS`, 0 vulnerabilita.
- `node --test tests/foundation/supabase-foundation.test.mjs`: `RED` iniziale atteso prima della foundation.
- `npm run test:foundation`: `PASS`, 5 test passati.
- `npm run security:scan`: `PASS`, `Security scan passed.`
- `npm run lint`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run build`: `PASS`, con warning Node `DEP0205` da runtime Next/Turbopack.
- `npm run verify`: `PASS`, include lint, typecheck, security scan e build.

## NOT_RUN

- Supabase live/migration/seed/query: vietato nello scope.
- Login/auth runtime: non implementato.
- CRUD: vietato nello scope.
- Playwright/smoke UI: nessuna UI runtime modificata.
- iOS/Android build: fuori perimetro.

## Rischi residui

- La presence di `@supabase/supabase-js` e `server-only` non implica connessione funzionante.
- `@supabase/ssr` non e introdotto; auth SSR resta task futuro.
- Il modello `Database` non esiste ancora.
- Le policy RLS non sono verificabili finche non esistono migration e schema live.
- Il read model e uno skeleton: non deve essere usato dalla UI finche `TASK-005` resta bloccato.
- Il mapping molti-shop per singolo `owner_user_id` mobile resta fuori scope; richiedera nuova decisione, constraint, RLS e test anti data leak.

## Review/fix finale

- Incoerenza trovata: `TASK-005E` conteneva una formulazione multi-shop per owner source mobile, in conflitto con `TASK-005D`.
- Decisione applicata: mantenere la cardinalita iniziale 1:1 di `TASK-005D`.
- Fix applicati:
  - documento `TASK-005E` corretto;
  - mapper aggiornato con validatore cardinalita iniziale;
  - harness `security:scan` aggiornato per bloccare regressioni documentali/codice su multi-shop owner;
  - harness `test:foundation` aggiornato a 5 test;
  - evidence e Master Plan aggiornati.
- Verdict tecnico: tutti i gate nello scope `TASK-005E` sono superati.
- Stato governance: `DONE` su conferma esplicita dell'utente.

## Handoff

- Verdict finale: `DONE`.
- Conferma utente per `DONE`: ricevuta.
- `TASK-005` resta `PLANNED_BLOCKED`.
