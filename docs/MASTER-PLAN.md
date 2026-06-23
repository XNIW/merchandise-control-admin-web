# MerchandiseControl Admin Web - Master Plan

## Identita progetto

- Nome progetto: `MerchandiseControl Admin Web`
- Obiettivo: dashboard web unica per amministrazione piattaforma, negozi, account personali, staff POS e futura integrazione Supabase.
- Stack: Next.js App Router, TypeScript, Tailwind CSS, futura integrazione Supabase SSR.

## Aree prodotto

Il prodotto distingue due aree amministrative principali:

- `Platform Admin Console`: area master globale per il proprietario dell'ecosistema.
- `Shop Admin Console`: area per proprietari e manager dei singoli negozi.

`POS/Staff` non e una terza console autonoma. E un modulo interno della `Shop Admin Console`, perche staff, PIN, ruoli operativi, permessi e dispositivi appartengono sempre a uno specifico shop.

## Responsabilita per area

- `platform_admin`: controlla ecosistema globale, utenti, negozi, stato sistema, audit globale e operazioni amministrative sicure. Non gestisce ordinariamente PIN/password/staff di ogni negozio.
- `shop_owner` / `shop_manager`: gestiscono i propri shop, inclusi staff POS, ruoli, permessi, dispositivi, prodotti, fornitori, categorie e import/export.
- `cashier` / staff POS: opera solo dentro uno shop con permessi limitati.

## Decisione architetturale principale

Usare direttamente `shops` come root aziendale/negozio.

Non introdurre per ora un livello separato `merchant -> stores`, per mantenere il dominio piu semplice e aderente al caso reale. Un account personale potra comunque essere membro di piu shop, e uno shop potra avere piu soci, ruoli, staff e dispositivi.

## Modello dominio previsto

- `profiles`: account personali per login web.
- `shops`: root aziendale/negozio, con `shop_id` e `shop_code`.
- `shop_members`: relazione tra profili personali, shop e ruoli.
- `staff_accounts`: account operativi futuri per POS.
- `roles`: ruoli applicativi.
- `permissions`: permessi granulari.
- `devices`: dispositivi autorizzati, incluso futuro POS.
- `audit_logs`: traccia delle azioni sensibili.

## Regole dati

- I dati business appartengono a `shop_id`/`shop_code`, non direttamente all'account personale.
- Login personale futuro: Google, Apple, WeChat, email-password.
- Login POS futuro: `shop_code + staff_code + PIN/password`.
- Account personale e staff POS restano separati.
- Gestione POS/Staff ordinaria: shop-scoped, dentro `Shop Admin Console`.

## Ruoli iniziali

- `platform_admin`
- `shop_owner`
- `shop_manager`
- `cashier`
- `viewer`

## Roadmap

### TASK-001 - Bootstrap governance Admin Web

- Stato: `DONE`
- Scopo: governance, documentazione, domini, ADR, evidence e verify harness.
- Nota: chiuso su conferma esplicita dell'utente dopo review documentale senza blocker reali.

### TASK-002 - Platform Admin UI Shell

- Stato: `DONE`
- File task pianificato: `docs/TASKS/TASK-002-platform-admin-ui-shell.md`
- Scopo: creare la prima UI statica moderna della `Platform Admin Console`.
- Include:
  - layout base dashboard;
  - sidebar;
  - topbar;
  - area contenuto;
  - pagine statiche placeholder per overview, utenti, negozi, audit, sistema e safe operations;
  - UX desktop/tablet;
  - harness Playwright smoke desktop/tablet;
  - nessun Supabase;
  - nessun login;
  - nessun dato reale;
  - nessuna azione database.
- Nota: chiuso su conferma esplicita dell'utente dopo review/fix finale; audit npm risolto con override transitivo `next -> postcss@8.5.10` senza `--force`.

### TASK-003 - Platform Admin Domain Types + Mock

- Stato: `DONE`
- Scopo: definire tipi TypeScript e mock sintetici dichiarati per `Platform Admin`.
- Include:
  - `Profile`;
  - `Shop`;
  - `ShopMember`;
  - `Role`;
  - `Permission`;
  - `AuditLog`;
  - `SystemStatus`;
  - dati mock separati dalla UI.
- Non include Supabase reale.
- Nota: chiuso su conferma esplicita dell'utente dopo review/fix con verdict `DONE`; nessun blocker reale.

### TASK-004 - Supabase Schema Discovery / Planning

- Stato: `DONE`
- Scopo: verificare schema reale Supabase o pianificare schema se assente.
- Include:
  - verifica migration/tabelle/colonne/policy reali;
  - piano RLS;
  - distinzione client/server boundary;
  - piano audit log;
  - piano ruoli globali e shop-scoped.
- Non inventare tabelle o colonne.
- Nota: chiuso su conferma esplicita dell'utente; scope limitato a discovery/planning. Nessuna integrazione Supabase reale, client, migration, login/auth o CRUD introdotti.

### TASK-005 - Platform Admin Read-only Data

- Stato: `DONE`
- Scopo: collegare la `Platform Admin Console` a letture dati reali solo dopo schema/auth/boundary verificati.
- Include:
  - lettura profili;
  - lettura shops;
  - lettura membership/owner;
  - lettura audit log se disponibile;
  - gestione loading/error/empty states.
- Solo read-only.
- Nessuna scrittura.
- Nota: gate read-only live completato in `TASK-005K` con sessione browser reale Platform Admin, read model server-side e safe operations disabilitate. Chiuso a `DONE` da `TASK-005L` dopo review globale, check locali/remoti/browser live e approvazione esplicita utente nel prompt `GLOBAL-REVIEW-001`.

### TASK-005A - Supabase Source Alignment / Foundation Readiness

- Stato: `DONE`
- File task pianificato: `docs/TASKS/TASK-005A-supabase-source-alignment-foundation-readiness.md`
- Scopo: riallineare Admin Web alle fonti Supabase/Android/iOS reali fornite dall'utente, senza collegare dati reali alla UI.
- Include:
  - verifica stato Supabase reale nella repo Admin Web;
  - verifica migration/documenti/task disponibili nel workspace Supabase e nei client Android/iOS;
  - matrice fonte/evidenza/attendibilita/riuso/rischio/prossimo passo;
  - prerequisiti concreti per sbloccare o ridurre `TASK-005`.
- Non include:
  - client Supabase;
  - dipendenze `@supabase/*`;
  - migration;
  - auth/login;
  - CRUD;
  - query live o dati reali;
  - modifiche UI/runtime.
- Nota: chiuso su conferma esplicita dell'utente. Storicamente `TASK-005` restava `PLANNED_BLOCKED` e il prossimo passo era `TASK-005B`; questa catena e stata completata fino a `TASK-005L`.

### TASK-005B - Admin Web Supabase Domain Mapping / Boundary Decision

- Stato: `DONE`
- File task pianificato: `docs/TASKS/TASK-005B-admin-web-supabase-domain-mapping-boundary-decision.md`
- Scopo: decidere il mapping futuro tra dominio Admin Web e schema Supabase/mobile esistente prima di qualunque lettura live.
- Include:
  - decisione su `profiles`, `shops`, `shop_members`, ruoli, permessi e audit;
  - decisione su rapporto tra `owner_user_id` mobile e `shop_id` / `shop_code`;
  - confronto tra tabelle Admin Web native, read model sopra schema mobile e opzione ibrida;
  - boundary server-side per `platform_admin`;
  - gate RLS/sicurezza per sbloccare `TASK-005`.
- Non include:
  - client Supabase;
  - dipendenze `@supabase/*`;
  - migration;
  - auth/login;
  - CRUD;
  - query live o dati reali;
  - modifiche UI/runtime;
  - execution `TASK-005`.
- Nota: chiuso su conferma esplicita dell'utente; scope limitato a decision/planning. Raccomandazione accettata = opzione ibrida con `shops` root Admin Web e mapping esplicito verso `owner_user_id`/inventory solo dopo decisione approvata. Nessun client Supabase, migration, dato reale UI, auth/login o CRUD introdotto in `TASK-005B`. I blocker storici di `TASK-005` sono stati poi superati dai task successivi fino a `TASK-005L`.

### TASK-005C - Admin Web Supabase Schema / Boundary Planning

- Stato: `DONE_AS_SUPERSEDED`
- File task pianificato: `docs/TASKS/TASK-005C-admin-web-supabase-schema-boundary-planning.md`
- Scopo: trasformare la decisione ibrida di `TASK-005B` in un piano verificabile per schema, mapping, boundary, RLS, env, tipi e test prima di qualunque execution runtime.
- Include:
  - entita candidate `profiles`, `shops`, `shop_members`, `platform_admins` o alternativa server-side, `roles`, `permissions`, `audit_logs` e `shop_inventory_sources`;
  - mapping proposto tra `owner_user_id` mobile e profilo/shop;
  - stati dati non mappati `unmapped`, `not_configured`, `mobile_only`;
  - read model/vista futura per inventory;
  - boundary server/client;
  - strategia RLS e `platform_admin`;
  - env template necessario e tipi `Database`;
  - test futuri e safety gate per rivalutare `TASK-005`.
- Non include:
  - migration SQL;
  - Supabase live;
  - client Supabase;
  - dipendenze `@supabase/*`;
  - CRUD;
  - login/auth runtime;
  - query live o dati reali;
  - modifiche UI/runtime;
  - modifiche Android/iOS;
  - execution `TASK-005`.
- Nota: piano creato come handoff documentale e review documentale ricevuta con verdict `READY_FOR_REVIEW`. Chiuso da `TASK-005L` come `DONE_AS_SUPERSEDED` perche i blocker planning sono stati superati da execution verificata in `TASK-005G`/`TASK-005K`.

### TASK-005D - Supabase Schema / Auth Boundary Decision

- Stato: `DONE_AS_SUPERSEDED`
- File task pianificato: `docs/TASKS/TASK-005D-supabase-schema-auth-boundary-decision.md`
- Scopo: chiudere una proposta decisionale documentale su schema candidate, auth/server boundary, `platform_admin`, mapping `owner_user_id` -> `shop_id`, env template futuro e harness richiesti prima di qualunque execution Supabase.
- Include:
  - decisione proposta su `profiles` e mapping a `auth.users`;
  - decisione proposta su `platform_admin` server-side;
  - decisione proposta su `shop_inventory_sources`;
  - cardinalita iniziali `shop_id` -> `owner_user_id` e `owner_user_id` -> `shop_id`;
  - stati `mapped`, `unmapped`, `not_configured`, `mobile_only`;
  - separazione `audit_logs` / `sync_events`;
  - boundary Client / Server / Database;
  - nomi env futuri senza valori;
  - harness futuri e criteri per aprire execution Supabase.
- Non include:
  - migration SQL;
  - Supabase live;
  - client Supabase;
  - dipendenze `@supabase/*`;
  - tipi `Database`;
  - env reali o template creato;
  - CRUD;
  - login/auth runtime;
  - query live o dati reali;
  - modifiche UI/runtime;
  - modifiche Android/iOS/POS;
  - execution `TASK-005`.
- Nota: piano decisionale creato come handoff documentale; review/fix finale nel file task con verdict `READY_FOR_REVIEW`. Chiuso da `TASK-005L` come `DONE_AS_SUPERSEDED` perche le decisioni sono state attuate e verificate nei task successivi.

### TASK-005E - Supabase Foundation Execution

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005E-supabase-foundation-execution.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005E/README.md`
- Scopo: introdurre una foundation Supabase verificabile senza collegare UI a dati reali e senza aprire execution `TASK-005`.
- Include:
  - `.env.example` con soli nomi variabile e valori vuoti;
  - dipendenze minime `@supabase/supabase-js` e `server-only`;
  - boundary server-only in `src/lib/supabase/server.ts`;
  - skeleton `platform_admin` server-side;
  - read model server-side read-only non collegato alla UI;
  - mapper candidati separati dai tipi `Database`;
  - validatore cardinalita iniziale 1:1 `owner_user_id`/`shop_id`;
  - stati inventory `mapped`, `unmapped`, `not_configured`, `mobile_only`;
  - harness statici `security:scan` e `test:foundation`;
  - integrazione `security:scan` in `npm run verify`.
- Non include:
  - Supabase live;
  - migration SQL;
  - tipi `Database`;
  - RLS reale;
  - auth/login runtime;
  - CRUD;
  - query live o dati reali;
  - modifiche UI;
  - modifiche Android/iOS/POS;
  - execution `TASK-005`.
- Nota: chiuso a `DONE` su conferma esplicita dell'utente dopo review/fix finale. L'incoerenza cardinalita owner/shop e stata corretta mantenendo la decisione `TASK-005D` 1:1 iniziale. Storicamente `TASK-005` restava bloccato per schema/migration/tipi/RLS/auth SSR/platform admin; questi gate sono stati completati fino a `TASK-005L`.

### TASK-005F - Supabase Schema / RLS / Auth SSR Planning

- Stato: `DONE_AS_SUPERSEDED`
- File task: `docs/TASKS/TASK-005F-supabase-schema-rls-auth-ssr-planning.md`
- Scopo: preparare un piano tecnico repo-grounded per schema candidate, RLS, grants/Data API, Auth SSR, tipi `Database`, mapping owner/shop 1:1, migration strategy, test data e harness futuri.
- Include:
  - schema candidate `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs` e ruoli/permessi opzionali;
  - piano RLS per anon, authenticated, shop roles, viewer, platform admin, mapping non mappati e audit;
  - piano grants/Data API separato da RLS;
  - piano Auth SSR futuro senza implementazione;
  - piano generazione tipi `Database` senza generarli;
  - piano migration futura `TASK-005G`;
  - test data strategy sintetica;
  - harness futuri obbligatori;
  - UI/UX states e performance plan futuri.
- Non include:
  - migration SQL;
  - Supabase live;
  - query live;
  - tipi `Database` generati;
  - Auth SSR runtime;
  - CRUD;
  - UI live;
  - modifiche Android/iOS/POS;
  - execution `TASK-005`.
- Nota: planning tecnico soltanto, superato da `TASK-005G` migration execution e `TASK-005K` live browser gate. Chiuso da `TASK-005L` come `DONE_AS_SUPERSEDED`.

### TASK-005G - Supabase End-to-End Execution

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005G-supabase-end-to-end-execution.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005G/README.md`
- Scopo: applicare una execution Supabase controllata per schema Admin Web, RLS/grants, tipi `Database`, Auth SSR server boundary e read model read-only, senza aprire ancora `TASK-005`.
- Include:
  - migration `profiles`, `shops`, `shop_members`, `platform_admins`, `shop_inventory_sources`, `audit_logs`;
  - schema privato `app_private` per helper RLS;
  - RLS e grants read-only per `authenticated`;
  - trigger append-only per `audit_logs`;
  - tipi `Database` generati dallo schema reale;
  - `@supabase/ssr` e client server-only cookie-aware;
  - autorizzazione `platform_admin` server-managed;
  - read model read-only e UI server-side con fallback `not_configured`/`unauthorized`;
  - harness `security:scan`, `test:foundation`, lint, typecheck, build, verify e smoke UI.
- Non include:
  - CRUD o mutazioni Admin Web;
  - seed permanente;
  - service-role key lato client/browser;
  - login UI;
  - apertura `TASK-005`;
  - modifiche Android/iOS/POS;
  - commit automatico durante execution.
- Nota: chiuso su conferma esplicita dell'utente del 2026-05-30 dopo review tecnica `PASS_WITH_NOTES`. La migration e stata validata in rollback e applicata via query diretta perche `supabase db push` era bloccato dalla migration history remota preesistente fuori repo. I gate storici migration history, bootstrap `platform_admin` e session lifecycle sono stati risolti da `TASK-005H`/`TASK-005K` e confermati da `TASK-005L`.

### TASK-005H - Supabase Final Readiness / TASK-005 Unblock

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005H-supabase-final-readiness-task-005-unblock.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005H/README.md`
- Scopo: completare i gate finali dopo `TASK-005G` per migration registry, bootstrap `platform_admin`, session lifecycle SSR e rivalutazione di `TASK-005`.
- Include:
  - import non distruttivo delle migration canoniche gia applicate da remoto;
  - verifica oggetti `TASK-005G` prima di repair registry;
  - `supabase migration repair --status applied 20260530041048`;
  - `supabase db push --linked --dry-run` come gate standard;
  - script CLI controllato per bootstrap primo `platform_admin`;
  - Next.js 16 Proxy per refresh session/cookie Supabase SSR;
  - harness statici per bootstrap, proxy, no service-role client/browser, read-only e route dinamiche;
  - documentazione dei blocker residui per `TASK-005`.
- Non include:
  - commit;
  - repair distruttivo o riscrittura cieca della migration history remota;
  - seed permanente non approvato;
  - hardcode di email, user id reale, token, password o secret;
  - service-role key nel client/browser;
  - login UI completa;
  - CRUD Admin Web;
  - apertura `TASK-006`.
- Nota: migration registry riconciliato e session lifecycle SSR implementato. I blocker bootstrap/sessione live sono stati superati da `TASK-005J`/`TASK-005K`; `TASK-005L` conferma lo stato `DONE`.

### TASK-005I - Platform Admin Read-only Data Completion / Live Gate Review

- Stato: `DONE_AS_SUPERSEDED`
- File task: `docs/TASKS/TASK-005I-platform-admin-read-only-data-completion.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005I/README.md`
- Scopo: rivalutare `TASK-005` dopo `TASK-005H` e completare solo cio che e verificabile senza inventare gate live.
- Include:
  - classificazione dell'esito reale di `TASK-005H`;
  - handoff bloccante se restano gate critici;
  - aggiornamento stato `TASK-005`;
  - check locali sicuri;
  - conferma che `TASK-006` resta fuori scope.
- Non include:
  - bootstrap reale senza `PLATFORM_ADMIN_BOOTSTRAP_PROFILE_ID`;
  - sessione browser finta o mock come live;
  - query Supabase remote non necessarie;
  - migration, repair, db push o seed;
  - CRUD o safe operations;
  - commit.
- Nota: handoff bloccante storico superato da `TASK-005J` e `TASK-005K`. Chiuso da `TASK-005L` come `DONE_AS_SUPERSEDED`.

### TASK-005J - Platform Admin Auth Live Gates / UI Polish Gate

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005J-platform-admin-auth-live-ui-polish.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005J/README.md`
- Scopo: eseguire la pipeline gate-based approvata per risolvere bootstrap reale `platform_admin`, sessione browser live, eventuale Figma/UI polish e solo dopo eventuale planning CRUD controllato ora ricondotto al task unico `TASK-006`.
- Include:
  - pre-flight git senza lettura di `.env` reali;
  - verifica input runtime per bootstrap e browser live senza stampare valori;
  - esecuzione dello script bootstrap esistente solo se input espliciti sono disponibili;
  - stop immediato se Gate 1A o Gate 1B resta bloccato.
- Non include:
  - scelta arbitraria di utenti reali;
  - lettura o stampa di `.env` reali;
  - Figma/UI polish se Gate 1A non passa;
  - CRUD o apertura di planning mutativo se Gate 1A/1B non passano;
  - commit.
- Nota: Gate 1A risolto con fallback deterministico sull'unico utente `auth.users` remoto dev. Gate 1B risolto in `TASK-005K` con test live browser. Figma/UI e CRUD non sono stati eseguiti. `TASK-005L` conferma lo stato `DONE`.

### TASK-005K - Platform Admin Live Browser Gate Completion

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005K-platform-admin-live-browser-gate-completion.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005K/README.md`
- Scopo: completare il gate browser/sessione live rimasto aperto per chiudere il perimetro read-only di `TASK-005`.
- Include:
  - env runtime locale Supabase redatto;
  - `.env.local` ignorato con soli valori pubblici;
  - service-role process-only via Supabase CLI api-keys;
  - test live browser auth opt-in;
  - utente dev/test temporaneo creato e ripulito;
  - verifica route Platform autorizzate e logout;
  - remote checks Supabase finali;
  - candidate planning mutativo solo documentale, poi ricondotto al task unico `TASK-006`.
- Non include:
  - commit;
  - CRUD o safe operations;
  - TASK-006 execution;
  - service-role nel browser/client;
  - token/JWT/magic link salvati;
  - modifiche Android/iOS/POS.
- Nota: `TASK-005K` ha esito `PASS_LIVE_UI_WITH_NOTES`; `TASK-005L` ha rieseguito browser live e Supabase checks e conferma lo stato `DONE`.

### TASK-005L - Global Review / DONE Reconciliation

- Stato: `DONE`
- File task: `docs/TASKS/TASK-005L-global-review-done-reconciliation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-005L/README.md`
- Scopo: audit globale di tutti i task creati finora, fix blocker sicuri e riconciliazione finale degli stati.
- Include:
  - inventario task/evidence;
  - review sicurezza, performance, UI/accessibilita e Supabase live;
  - browser live auth gate;
  - fix auth redirect protocol-relative;
  - chiusura task storici planning/blocker come `DONE_AS_SUPERSEDED`;
  - conferma `TASK-006` non eseguito.
- Non include:
  - commit;
  - push;
  - CRUD o safe operations;
  - execution `TASK-006`;
  - Shop Admin Console;
  - staff POS/PIN/password.
- Nota: verdict globale `PASS_WITH_NOTES`; tutti i task da `TASK-001` a `TASK-005L` sono chiusi, `TASK-006` resta `PLANNED`.

### TASK-006 - Platform Admin Controlled Actions

- Stato: `DONE`
- File task: `docs/TASKS/TASK-006-platform-admin-controlled-actions.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-006/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED`
- Scopo: implementare in un unico task completo le prime azioni amministrative sicure server-side.
- Include nell'execution unica:
  - crea shop;
  - assegna owner iniziale;
  - sospendi shop;
  - riattiva shop;
  - cancellazione logica shop;
  - audit log obbligatorio;
  - UI Controlled Operations;
  - server-side authorization;
  - RLS/grants/policy coerenti;
  - test SQL, foundation, Playwright e browser live;
  - documentazione/evidence.
- Non include:
  - Shop Admin Console;
  - Android/iOS/POS;
  - service-role client/browser;
  - hard delete;
  - cancellazione audit;
  - commit o push.
- Nota: execution completata da Codex dopo autorizzazione esplicita utente. Review/fix correttiva eseguita il 2026-05-30 con UI rinominata `Controlled Operations`, risultati azione redatti, conferme shop code visibili e harness ESLint/security aggiornati. Review/fix integrativa Long Goal aggiunge `.sql` al secret scan generico e riesegue check locali freschi. `TASK-006` resta unico; non sono stati creati `TASK-006A`, `TASK-006B`, `TASK-006C`, `TASK-006D` o `TASK-006E`.
- Evidence aggiornata in `docs/TASKS/EVIDENCE/TASK-006/README.md` e `docs/TASKS/EVIDENCE/LONG-GOAL/README.md`: migration applicata e local/remoto allineati, RPC verificate, tipi rigenerati, UI `/platform/operations` aggiornata, check locali/browser/live passati. Review finale del 2026-05-30 con check freschi e Supabase linked passati; task marcato `DONE` su autorizzazione esplicita utente per la reconciliation `TASK-006`..`TASK-009`.

### TASK-007 - Auth Routing and Route Protection

- Stato: `DONE`
- File task: `docs/TASKS/TASK-007-auth-routing-route-protection.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-007/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: implementare routing post-login e protezione server-side per `/`, `/platform/*` e `/shop`.
- Include:
  - resolver server-only per ruolo corrente;
  - `platform_admin` attivo verso `/platform`;
  - `shop_owner` / `shop_manager` attivo verso `/shop`;
  - stati no session, not configured, revoked/no access/no shop;
  - nessun auth metadata come fonte autorizzativa;
  - nessun client-side guard come protezione unica.
- Non include:
  - Shop Admin Console completa;
  - CRUD shop-scoped;
  - import/export;
  - staff POS, PIN/password o dispositivi;
  - nuove dipendenze;
  - commit o push.
- Nota: execution completata da Codex nella Long Goal milestone 1. Implementati resolver server-only, root routing, protezione `/platform/*`, entrypoint `/shop`, pagina login generica e harness aggiornati. Review finale del 2026-05-30 con check freschi e Supabase linked passati; task marcato `DONE` su autorizzazione esplicita utente per la reconciliation `TASK-006`..`TASK-009`.

### TASK-008 - Shop Admin Console Shell

- Stato: `DONE`
- File task: `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-008/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: creare la base navigabile della `Shop Admin Console`, protetta server-side, con layout e route placeholder dichiarate.
- Include:
  - layout `/shop` dedicato;
  - sidebar/topbar Shop Admin distinte da Platform Admin;
  - route candidate `/shop/overview`, `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/import-export`, `/shop/members`, `/shop/roles`, `/shop/staff`, `/shop/devices`, `/shop/settings`, `/shop/audit`;
  - stati placeholder dichiarati e non spacciati per dati live;
  - nessun nuovo schema o CRUD.
- Non include:
  - read model shop-scoped reale;
  - CRUD prodotti/categorie/fornitori;
  - import/export reale;
  - gestione reale membri/ruoli/staff/devices/settings/audit;
  - migration Supabase;
  - nuove dipendenze;
  - commit o push.
- Nota: execution completata da Codex nella Long Goal milestone 2. Implementati layout protetto `/shop`, shell Shop Admin, route placeholder dichiarate e harness aggiornati. Review finale del 2026-05-30 con check freschi e Supabase linked passati; task marcato `DONE` su autorizzazione esplicita utente per la reconciliation `TASK-006`..`TASK-009`.

### TASK-009 - Shop Switcher

- Stato: `DONE`
- File task: `docs/TASKS/TASK-009-shop-switcher.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-009/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: aggiungere switcher negozio nella Shop Admin Console usando solo membership attive verificate server-side.
- Include:
  - resolver server-only per lista shop autorizzati;
  - switcher UI che riceve solo shop verificati dal server;
  - query param `shop_id` come stato di navigazione, non come autorizzazione;
  - nessun dato business shop-scoped ancora renderizzato.
- Non include:
  - read model business completo;
  - CRUD;
  - persistenza database/cookie della selezione;
  - migration Supabase;
  - nuove dipendenze;
  - commit o push.
- Nota: execution completata da Codex nella Long Goal milestone 3. Implementato resolver server-only per shop autorizzati, switcher UI con query param non autorizzativo e gate security/foundation dedicati. Review finale del 2026-05-30 ha preservato `shop_id` nei link di sezione Shop Admin e ha aggiunto gate foundation/security; check freschi e Supabase linked passati. Task marcato `DONE` su autorizzazione esplicita utente per la reconciliation `TASK-006`..`TASK-009`.

### TASK-010 - Shop Read Model Real Data

- Stato: `DONE`
- File task: `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-010/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: creare read model shop-scoped server-only per mostrare dati reali autorizzati del negozio selezionato.
- Include:
  - selezione shop verificata server-side;
  - lettura reale `shops`, `shop_members` e `audit_logs` shop-scoped se disponibili;
  - tutte le query filtrate per `shop_id`;
  - stati `not_configured`, empty/error e no data;
  - overview, members e audit collegate a dati reali o empty state dichiarati;
  - nessun dato finto spacciato per live.
- Non include:
  - CRUD;
  - prodotti/categorie/fornitori se schema non verificato;
  - migration non necessarie;
  - nuove dipendenze;
  - commit o push.
- Nota: execution completata da Codex il 2026-05-30. Il read model parte da `resolveCurrentShopAdminShellAccess`, tratta `shop_id` query param come navigazione non autorizzativa, filtra `shops`, `shop_members` e `audit_logs` con `selectedShop.shopId`, e lascia le altre sezioni Shop Admin come placeholder dichiarati. Review/fix finale rimossa copia interna da UI, aggiunta `rowKey` stabile, rafforzati foundation/security gate, eseguiti check locali/build/smoke e Supabase linked. Task marcato `DONE` su autorizzazione esplicita utente nella review finale TASK-010.

### TASK-011 - Shop Onboarding Live Gate

- Stato: `DONE`
- File task: `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-011/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `PASS`
- Scopo: verificare live il flusso Platform Admin -> create shop -> assign account Google owner come `shop_owner` -> login/verifica owner -> Shop Admin read model -> cross-shop leak checks.
- Include:
  - pre-flight repo;
  - verifica TASK-010 gia committato/pushato;
  - discovery Supabase linked redatta;
  - verifica owner in `profiles` / auth prima di creare dati;
  - documentazione PASS, warnings non bloccanti e retry motivati;
  - POS/staff credential discovery senza creare credenziali.
- Non include:
  - CRUD prodotti/categorie/fornitori;
  - import/export Excel;
  - POS login reale;
  - staff account reale;
  - PIN/password staff;
  - migration;
  - nuove dipendenze;
  - commit o push;
  - hard delete o cancellazione audit.
- Nota: execution avviata da Codex il 2026-05-30 e ripresa su richiesta utente per correggere il caso dual-role. L'account Google owner e stato identificato in modo sicuro come profilo attivo `6425adb0...`, visibile nel read model Platform Admin e con grant `platform_admin` attivo. Fix applicato: `/shop` risolve l'accesso direttamente da membership attive `shop_owner` / `shop_manager`, senza riusare il resolver generale che mantiene la priorita Platform Admin per `/` e `/platform`. Gate live finale passato con shop sintetico `TASK011_TEST_MPT7XWN3ECF5`, read model `/shop/overview`, `/shop/members`, `/shop/audit`, negative `shop_id` falso e cleanup soft delete verificati. Task marcato `DONE` per autorizzazione esplicita nel resume TASK-011 e check/evidence positivi.

### TASK-012 - POS Staff Credential Planning / Schema Discovery

- Stato: `DONE`
- File task: `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-012/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: pianificare in modo sicuro il futuro modulo POS/Staff Credentials prima di login POS, credenziali reali o migration staff.
- Include:
  - discovery schema reale locale e linked Supabase;
  - verifica assenza/presenza di `staff_accounts`, `staff_code`, credential hash, ruoli POS, dispositivi e audit staff;
  - lettura `/shop/staff` e boundary Shop Admin corrente;
  - contesto Win7POS legacy solo in lettura;
  - fonti esterne OWASP/Supabase/PostgreSQL;
  - decisione tecnica proposta;
  - piano schema/RLS/grants;
  - piano hashing PIN/password;
  - piano reset/rotazione;
  - piano audit;
  - piano UI Shop Admin;
  - piano test e live gate futuro;
  - gate statico foundation/security per mantenere TASK-012 planning-only.
- Non include:
  - login POS reale;
  - staff account reale;
  - PIN/password reale;
  - migration staff;
  - RPC o Server Actions mutative staff;
  - form funzionanti di creazione staff;
  - modifiche Android/iOS/POS/Win7POS;
  - nuove dipendenze;
  - commit o push.
- Nota: planning aperto da Codex il 2026-05-30 su richiesta `Procedi`. Discovery linked conferma local/remoto allineati fino a `20260530120000`, nessuna tabella `staff_accounts`, nessun `staff_code`, nessun credential hash staff e nessun device model autorizzativo. Decisione proposta: futuro `staff_accounts` separato da `profiles`/`shop_members`, shop-scoped su `shop_id`, unique `(shop_id, staff_code)`, hashing server-side adattivo e RLS/grants severi. Review finale/DONE reconciliation richiesta esplicitamente dall'utente: harness rafforzato contro esempi credential pericolosi, runtime staff credential fuori scope e hash credential in UI; check locali e Supabase passati. Nessun login POS, migration, credenziale reale, nuova dipendenza, commit o push.

### TASK-013 - Admin Web UI/UX Professional Audit & Polish

- Stato: `DONE`
- File task: `docs/TASKS/TASK-013-admin-web-ui-ux-professional-polish.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-013/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: audit UI/UX repo-grounded e polish professionale scoped su Platform Admin Console e Shop Admin Console.
- Include:
  - inventario route UI principali;
  - audit matrix con severita;
  - Figma design direction/wireframe;
  - chiarimento selected shop nella Shop Admin Console;
  - miglioramento navigazione mobile/tablet;
  - copy placeholder/live piu chiaro;
  - table wrapping ed empty state;
  - harness foundation/security aggiornati;
  - evidence completa.
- Non include:
  - nuove funzionalita business;
  - CRUD prodotti/categorie/fornitori;
  - import/export;
  - POS login;
  - staff account, PIN/password/hash credential;
  - migration Supabase;
  - nuove dipendenze;
  - commit o push.
- Nota: execution aperta da Codex il 2026-05-31 dal brief allegato `TASK-013 - Admin Web UI/UX Professional Audit & Polish`. Figma usato nel file <https://www.figma.com/design/nw9wx6Q7jutwLGPHatGlWq>. Polish applicato senza schema change o nuove feature: selected shop context esplicito, nav responsive, copy placeholder piu chiaro, tabelle piu robuste, rimozione copy interna `TASK006_TEST_` dalla UI. Review finale / DONE reconciliation richiesta esplicitamente dall'utente il 2026-05-31: gate critici passati, harness riallineato a `DONE_RECONCILED`, browser smoke non autenticato aggiornato, QA autenticata classificata come limite non bloccante per assenza di fixture/sessione sicura. Nessun commit, push o stage.

### TASK-014 - Integrated Authenticated QA, Design System, POS Staff Foundation

- Stato: `DONE`
- File task: `docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-014/README.md`
- Fase: `DONE_RECONCILED`
- Scopo: mega-task sperimentale che unisce authenticated visual QA fixture, piccoli componenti Admin Web condivisi e foundation schema/sicurezza per POS Staff Credentials.
- Include:
  - harness QA autenticata opt-in sicuro o blocco documentato senza bypass;
  - componenti UI condivisi piccoli applicati in modo scoped;
  - migration/read model/hash boundary POS Staff foundation solo dopo discovery e gate Supabase;
  - scanner e test foundation aggiornati;
  - evidence, screenshot e handoff finale riconciliato.
- Non include:
  - login POS reale;
  - sessione POS;
  - staff account reale;
  - PIN/password reale;
  - UI mutativa staff funzionante;
  - esposizione `credential_hash`;
  - service-role nel client/browser;
  - modifiche Android/iOS/POS;
  - commit, git push o stage finale.
- Nota: execution aperta da Codex il 2026-05-31 dal brief allegato `TASK-014 - Integrated Authenticated QA, Design System Components, POS Staff Foundation`. Review finale / DONE reconciliation richiesta esplicitamente dall'utente il 2026-05-31: migration `20260531050837_task_014_pos_staff_foundation.sql` applicata al linked dev dopo dry-run/lint/advisors positivi, tipi Supabase rigenerati dal linked schema, hash boundary rafforzato con test runtime, live auth opt-in passato (`2 passed`, `1 skipped` TASK-006), smoke UI passato, build/verify/security/foundation passati. Figma resta `BLOCKED_TOOL_LIMIT` non bloccante. Nessun commit, nessun git push, nessuno stage finale.

### TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices

- Stato: `DONE`
- File task: `docs/TASKS/TASK-015-complete-shop-admin-console.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-015/README.md`
- Fase: `DONE_RECONCILED`
- Verdict planning: `READY_FOR_EXECUTION_WITH_NOTES`
- Execution: `COMPLETED_DONE_WITH_NOTES`
- Verdict execution: `REVIEW_WITH_BLOCKERS`
- Verdict final review: `PASS_WITH_NOTES`
- Verdict final completion: `DONE_WITH_NOTES`
- Verdict finale: `DONE_WITH_NOTES`
- Scopo: completare in un unico task la `Shop Admin Console` come console operativa shop-scoped per inventory, import/export Excel, history entry mobile, staff POS, ruoli/permessi, devices, settings e audit.
- Include:
  - discovery schema reale Admin Web, Supabase linked e repo mobile/POS se disponibili;
  - prodotti, categorie e fornitori con CRUD shop-scoped, soft delete, validazione e audit;
  - import Excel con preview/apply controllato ed export Excel;
  - history entry mobile con lista, dettaglio e tabelle coinvolte;
  - staff POS management dentro `/shop/staff`, senza esporre hash/PIN/password;
  - ruoli/permessi shop-scoped minimi con enforcement server-side;
  - dispositivi mobile/POS autorizzati con stato, dettaglio, revoca/riattivazione se supportata e audit;
  - settings shop sicure e audit Shop Admin completo;
  - read model/server actions/RPC/helper separati da UI;
  - migration Supabase additive solo se necessarie e verificate;
  - test/evidence per no cross-shop leak, no secret leakage, no service-role client/browser e no `credential_hash` in UI/DTO.
- Non include:
  - commit;
  - git push;
  - stage finale;
  - schema mobile inventato se Android/iOS non sono leggibili;
  - dati mock spacciati per live;
  - uso di `shop_id` query param come autorizzazione unica;
  - hard delete di dati business/audit;
  - service-role key nel client/browser;
  - lettura o stampa di `.env` reali;
  - trasformare POS/Staff in console separata;
  - introdurre `merchant -> stores`;
  - marcare `DONE` senza review positiva e conferma esplicita utente.
- Nota: task creato in pianificazione dal brief allegato utente del 2026-05-31. Execution avviata da Codex il 2026-05-31 su branch dedicato `codex/task-015-complete-shop-admin-console` dopo conferma utente. Codex puo usare fasi interne, ma il tracking ufficiale resta `TASK-015` e lo stato massimo a fine execution e `REVIEW`.
- Review planning integrata il 2026-05-31 dal secondo brief allegato: aggiunti stop condition, definizioni esiti, finding statici repo-grounded su inventory owner-scoped, sync/history, staff foundation TASK-014, devices, dipendenze Excel, performance, redaction, dati test e template evidence. Verdict planning: `READY_FOR_EXECUTION_WITH_NOTES`; progetto resta `IDLE`, nessuna execution avviata.
- Final hardening planning integrato il 2026-05-31 dal terzo brief allegato: confermate condizioni prodotto/sicurezza, aggiunti vincoli su lettura docs Next locali prima del codice, milestone evidence incrementale, timeout/fallback per operazioni lunghe, rollback/fallback migration non distruttivo, condizioni future esplicite per `REVIEW` e `DONE`. Verdict invariato: `READY_FOR_EXECUTION_WITH_NOTES`.
- Planning freeze audit integrato il 2026-05-31 dal quarto brief allegato: audit solo statico/read-only, nessuna lacuna bloccante residua, harness TASK-015 chiarito come scoped ai nuovi moduli e ai moduli Shop Admin toccati per evitare falsi fail da baseline fuori scope. Verdict freeze: `READY_FOR_EXECUTION_WITH_NOTES_CONFIRMED`.
- Completion finale avviata da Codex il 2026-05-31 e portata a `DONE_WITH_NOTES`: applicata migration additiva `20260531171726_task_015_shop_admin_completion.sql`, rigenerati i tipi Supabase, implementati CRUD catalogo via RPC auditabili, import/export Excel reale con `read-excel-file`/`write-excel-file`, mutazioni staff POS auditabili, registry `shop_devices` con revoke/reactivate server-side, Server Actions e pannelli UI reali, harness TASK-015 e security scan aggiornati. Supabase linked checks pre/post migration passano in sequenza; check finali locali passano, con build/verify solo `DEP0205`, UI smoke `48 passed` e live auth riusato su `localhost:3000` con `2 passed`, `1 skipped`. Resta solo nota `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`: Android/iOS/POS devono consumare `shop_devices.status` per enforcement client della revoca. Nessun commit, push o stage finale.
- DONE reconciliation 2026-05-31: TASK-015 chiuso a `DONE_WITH_NOTES` su conferma esplicita dell'utente. Gate freschi di chiusura passati: security scan, foundation, verify, UI smoke, git diff check e Supabase linked checks sequenziali. Stato TASK-015: `DONE`; fase TASK-015: `DONE_RECONCILED`.

### TASK-016 - Complete Platform Admin Console: Users, Shops, Provisioning, Global Security, Audit and System Operations

- Stato: `DONE`
- File task: `docs/TASKS/TASK-016-complete-platform-admin-console.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-016/README.md`
- Fase: `DONE_RECONCILED`
- Verdict planning: `READY_FOR_EXECUTION_WITH_NOTES`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Verdict finale: `DONE`
- Scopo: completare la `Platform Admin Console` come pannello master globale per users, shops, provisioning iniziale, platform admins, global audit, system/data health, device security overview, sync/history overview, safe operations e support diagnostics.
- Include:
  - dashboard platform globale con metriche reali o stati safe;
  - users/profiles globali con ricerca, filtri, dettaglio, membership e audit;
  - shops globali con lista, dettaglio, owner/members summary, data health e azioni controllate;
  - provisioning wizard per creare shop, assegnare owner iniziale e opzionale bootstrap POS admin solo se sicuro;
  - platform admins con grant/revoke solo se schema e policy sono sicuri;
  - global audit con filtri, detail e metadata redatti;
  - system/data health senza secret o `.env` reali;
  - global device security overview read-only di default, con emergency revoke solo se schema autorizzativo reale esiste;
  - global sync/history overview redatta, distinta da `audit_logs`;
  - safe operations server-side, confermate, motivate e auditate;
  - support diagnostics read-only, senza impersonation;
  - harness e test futuri per boundary platform, provisioning, audit, devices, health e security.
- Non include:
  - gestione quotidiana prodotti/categorie/fornitori/import Excel;
  - gestione quotidiana staff POS;
  - login POS completo;
  - modifiche Android/iOS/POS;
  - deploy Vercel;
  - hard delete;
  - impersonation;
  - commit;
  - git push;
  - stage finale;
  - secret;
  - service-role client/browser;
  - dati mock spacciati per live;
  - marcare `DONE` senza review positiva e conferma esplicita utente.
- Nota: task creato in pianificazione dal brief allegato utente del 2026-05-31. Execution avviata da Codex il 2026-05-31 dopo chiusura `TASK-015` a `DONE_WITH_NOTES`. `TASK-016` copre la parte Platform Admin globale e deve mantenere la separazione prodotto: Platform governa l'ecosistema, Shop Admin gestisce il negozio.
- Review planning repo-grounded integrata il 2026-05-31 dal secondo brief allegato: aggiunti boundary esplicito con `TASK-015`, finding statici su route Platform mancanti, read model Platform con `.select("*")` baseline, controlled operations TASK-006 gia presenti, assenza statica device authorization table, distinzione `sync_events.source_device_id`, staff foundation TASK-014, harness TASK-016 futuri, test data `TASK016_TEST_`, condizioni reali per `REVIEW`/`DONE` e verdict `READY_FOR_EXECUTION_WITH_NOTES`. Progetto resta `IDLE`, nessuna execution avviata.
- Execution completata da Codex il 2026-05-31 e poi sbloccata nella completion finale a `DONE_WITH_NOTES` / `REVIEW_DONE`: implementate route Platform globali, read model server-only con select esplicite, provisioning owner esistente e pending owner invite redatto, detail users/shops/audit, grant/revoke Platform Admin con anti self-lockout e audit, system/data health, global devices, sync/history, support diagnostics, Safe Operations Center con restore shop e migration additive `20260531190000_task_016_platform_admin_console.sql` + `20260531210000_task_016_platform_completion.sql`. Supabase linked push applicato e tipi rigenerati. Gate locali, Supabase e Playwright passano; live auth nominale ora usa `next start` su porta 3002 e passa `2 passed`, `1 skipped`. Resta nota non bloccante `PASS_WITH_NOTES_EMAIL_DELIVERY` per collegare delivery esterna del pending owner invite senza secret. Nessun commit, push o stage finale.
- Review/fix finale 2026-05-31: confermato `DONE_WITH_NOTES` senza marcare `DONE`. Fixati copy obsoleti nella superficie Platform che descrivevano grant/revoke Platform Admin e restore shop come bloccati, aggiunto link sidebar `/platform/history`, rimosso fallback empty-state ambiguo e rafforzato harness `task-016-platform-admins`. Check freschi passati: security scan, foundation `83/83`, typecheck, lint, build, verify, UI smoke `70/70`, TASK-016 smoke `24/24`, live auth `2 passed`/`1 skipped`, Supabase linked checks sequenziali, `git diff --check` e no stage. Resta solo `PASS_WITH_NOTES_EMAIL_DELIVERY`.
- Final reconciliation 2026-05-31: su richiesta esplicita dell'utente, TASK-016 riconciliato a `DONE_RECONCILED` / `DONE` dopo review repo-grounded finale. Nessun blocker applicativo, security o Supabase trovato; nessuna nuova migration creata. Ricontrollati separazione Platform/Shop, route Platform, azioni server-side, RPC Platform Admin, audit, redazione metadata, no secret/service-role client, Supabase linked `migration list`, dry-run, lint e advisors security. Gate freschi passati: security scan, foundation `89/89`, TASK-016 subset `14/14`, typecheck, lint, build, verify, UI smoke `86/86`, TASK-016 smoke `24/24`, live auth `2 passed`/`1 skipped`. Warning non bloccanti: Node `DEP0205` e Playwright `NO_COLOR`/`FORCE_COLOR`. TASK-015 e TASK-017 restano `DONE`; il progetto non viene dichiarato production-ready globale.

### TASK-017 - Shop Business Completion

- Stato: `DONE`
- File task: `docs/TASKS/TASK-017-shop-business-completion.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-017/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Verdict corrente: `DONE`
- Scopo: completare la `Shop Admin Console` come gestionale operativo shop-scoped con dashboard, catalogo, import/export, membri, ruoli, staff POS amministrativo, devices, audit e Sync Center, senza integrazioni Android/iOS/POS reali.
- Include:
  - dashboard shop con metriche operative, stato dati, ultimi eventi e ultimi audit;
  - categorie, fornitori e prodotti con lista, dettaglio, ricerca/filtri e azioni create/update/archive shop-scoped;
  - Excel import/export foundation nei limiti reali dello schema e del workflow esistente;
  - gestione membri shop con lista, detail, invito profilo esistente, cambio ruolo e rimozione/sospensione;
  - roles & permissions shop con enforcement server-side e separazione da Platform Admin;
  - POS Staff come modulo Shop Admin, non console separata;
  - devices autorizzati shop-scoped con dettaglio e audit collegato;
  - audit log shop con filtri, detail, metadata redatti e navigazione cronologica;
  - Sync Center read-only con stati `pending`, `success`, `failed`;
  - migration Supabase additiva solo per RPC membri se i check la confermano;
  - harness TASK-017, security scanner ed evidence.
- Non include:
  - commit;
  - git push;
  - stage finale;
  - login Google/Apple/WeChat;
  - impersonation;
  - realtime;
  - integrazione Android;
  - integrazione iOS;
  - integrazione POS;
  - autenticazione POS reale;
  - PIN/password POS reali;
  - service-role lato client/browser;
  - secret o token;
  - dati mock spacciati per live;
  - modello `merchant -> stores`;
  - accesso cross-shop;
  - funzionalita Platform dentro Shop Admin;
  - marcare `DONE` senza review positiva e conferma esplicita utente.
- Nota: task aperto in execution dal brief utente del 2026-05-31 mentre `TASK-016` era ancora `DONE_WITH_NOTES` e non era stato marcato `DONE`. Codex ha completato implementation e check, applicato la migration additiva `20260531230000_task_017_shop_business_completion.sql` al linked dev, rigenerato i tipi Supabase e preparato handoff a `REVIEW`. Review finale/reconciliation richiesta esplicitamente dall'utente il 2026-05-31: trovato e corretto un gap reale sugli RPC membri, che erano owner-only nel server web ma piu larghi nel DB; aggiunta e applicata `20260531233000_task_017_member_owner_enforcement.sql` con helper `app_private.is_active_shop_owner_member`, reason obbligatoria per remove e audit reason redatto. Gate finali: foundation `89/89`, typecheck, lint, build, verify, UI smoke `86/86`, security scan, Supabase linked checks post-push, `git diff --check`; warning non bloccanti Node `DEP0205` e Playwright colori. Residui: invito membri solo per profili esistenti, niente email/magic link, niente auth POS reale, Sync Center read-only. Stato finale: `DONE_RECONCILED`. `TASK-016` e stato poi riconciliato separatamente a `DONE_RECONCILED`.

### TASK-018 - Infrastructure, Security Hardening and POS Foundation

- Stato: `DONE`
- File task: `docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-018/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED`
- Verdict corrente: `DONE`
- Scopo: consolidare infrastruttura, sicurezza, automazioni e fondazioni POS prima di nuove funzionalita business o integrazioni Android/iOS/POS.
- Include:
  - CI GitHub Actions minimale senza deploy;
  - build, typecheck, lint, security scan, foundation tests, smoke UI CI e `git diff --check`;
  - audit Supabase di RPC/helper/grants/RLS/SECURITY DEFINER/search_path;
  - hardening non distruttivo delle backup table legacy TASK-108;
  - hardening non distruttivo del `search_path` della funzione trigger legacy `set_shared_sheet_sessions_updated_at`;
  - cleanup lint non distruttivo di `shop_member_invite_profile`;
  - design di enforcement mobile/POS per device revocation, device authorization, staff suspension, shop suspension ed emergency revoke;
  - design di POS auth foundation per `shop_code + staff_code + PIN/password`;
  - consolidamento README, task, evidence e roadmap.
- Non include:
  - commit;
  - git push;
  - stage finale;
  - deploy automatico o production;
  - email delivery;
  - sync reale;
  - Android sync;
  - iOS sync;
  - POS sync;
  - autenticazione POS completa;
  - endpoint pubblici POS;
  - login Google, Apple o WeChat;
  - modifiche Android/iOS/POS;
  - nuove dipendenze inutili;
  - schema Supabase inventato;
  - marcare `DONE` senza review positiva e conferma esplicita utente.
- Nota: task aperto dal brief utente del 2026-05-31 dopo riconciliazione di TASK-015, TASK-016 e TASK-017 su main. Codex ha preparato handoff a `REVIEW` con CI, migration additive `20260531234500_task_018_backup_table_lockdown.sql` e `20260531235000_task_018_trigger_search_path_hardening.sql`, security scanner/task foundation test aggiornati e design docs `MOBILE-POS-ENFORCEMENT-DESIGN` / `POS-AUTH-FOUNDATION`. Review/reconciliation finale richiesta esplicitamente dall'utente il 2026-05-31: corretto anche il warning lint `v_profile` con `20260531235500_task_018_member_invite_lint_cleanup.sql`, rafforzati i design docs su rate limit/device binding/offline edge cases e aggiornati i gate per consentire `DONE_RECONCILED`. Gate locali, UI smoke e Supabase linked passano; residui non bloccanti: warning advisors su RPC `SECURITY DEFINER` intenzionali e Auth leaked-password protection provider-side. Nessun commit, push o stage.

### TASK-019 - POS Auth Foundation Implementation

- Stato: `DONE`
- File task: `docs/TASKS/TASK-019-pos-auth-foundation-implementation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-019/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED`
- Verdict corrente: `DONE`
- Scopo: implementare una foundation sicura per credenziali POS staff e policy di sessione futura lato Admin Web/Supabase, senza login POS reale o integrazione client.
- Include:
  - verifica schema reale `staff_accounts`, `staff_accounts_safe`, device registry, shop membership e audit helper;
  - migration additiva minima per credential version/status/session invalidation marker se mancanti;
  - gestione Shop Admin `/shop/staff` per stato credenziale, reset, sospensione/riattivazione, force rotation e clear lockout se supportati;
  - RPC e Server Actions server-side con authz shop-scoped, reason obbligatoria per azioni sensibili, audit redatto e `search_path` controllato;
  - scanner sicurezza, foundation test, documentazione ed evidence.
- Non include:
  - app Android POS login reale;
  - app iOS POS login reale;
  - Win7 POS login reale;
  - sync reale;
  - sessioni runtime POS complete;
  - email delivery;
  - WeChat, Google o Apple login;
  - endpoint pubblico di login POS;
  - console POS separata;
  - secret, service-role client/browser, PIN/password in chiaro o `credential_hash` in UI/DTO/read model safe;
  - commit/push TASK-019 senza richiesta successiva.
- Nota: execution aperta da Codex il 2026-05-31 dopo commit/push TASK-018 su `main`. Codex ha creato e applicato la migration additiva `20260531235900_task_019_pos_auth_foundation.sql`, esteso le RPC staff credential management con reason obbligatoria, audit metadata redatto e marker `session_invalidated_at`, aggiornato Shop Admin `/shop/staff`, scanner, foundation test e documentazione. Final review/reconciliation richiesta esplicitamente dall'utente il 2026-05-31: trovato e corretto un gap reale di grant colonnari per `staff_accounts_safe` con `security_invoker`, aggiunta e applicata `20260601000500_task_019_staff_safe_view_grants.sql`, riallineato `credential_status` su lockout per reactivate/force rotation, normalizzati `staffId`/`reason` server-side e rafforzati harness. Gate locali, UI smoke e Supabase linked passano; residui non bloccanti: warning advisors su RPC `SECURITY DEFINER` intenzionali e Auth leaked-password protection provider-side. Commit/push richiesto e completato su `main` in FASE 1 del task successivo con commit `73042d6` (`feat: add POS staff auth foundation`).

### TASK-020 - Win7POS Integration Planning

- Stato: `DONE`
- File task: `docs/TASKS/TASK-020-win7pos-integration-planning.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-020/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_PLANNING_ONLY`
- Review: `COMPLETED`
- Verdict planning: `APPROVED`
- Verdict corrente: `DONE`
- Scopo: pianificare in modo repo-grounded l'integrazione reale tra Admin Web/Supabase e Win7POS, senza implementare codice runtime.
- Include:
  - discovery Admin Web su `shops`, `staff_accounts`, `shop_devices`, `audit_logs`, `sync_events` e read model Shop Admin;
  - discovery Win7POS dalla copia locale `/Users/minxiang/Projects/Win7POS` e da clone temporaneo `https://github.com/XNIW/Win7POS.git`;
  - flusso first login POS con `shop_code + staff_code + PIN/password`;
  - trusted device, heartbeat, revoca device, sospensione staff e sospensione shop;
  - comportamento online/offline e offline queue;
  - modello backend futuro per sessioni POS, device token, sales sync, payment totals e audit;
  - proposta dashboard futura per vendite per dispositivo e totale shop;
  - roadmap TASK-021/TASK-022/TASK-023/TASK-024/TASK-025;
  - foundation test statico planning-only.
- Non include:
  - login POS reale;
  - endpoint pubblico POS;
  - modifiche Win7POS;
  - modifiche Android/iOS;
  - sync vendite implementato;
  - dashboard live;
  - migration TASK-020 creata o applicata;
  - commit/push TASK-020 senza review successiva;
  - dichiarazione production-ready.
- Nota: TASK-020 creato come planning dopo commit/push TASK-019 (`73042d6`) su `main`. Win7POS e stato trovato anche localmente in `/Users/minxiang/Projects/Win7POS`, repo clean `## main...origin/main`, origin `https://github.com/XNIW/Win7POS.git`, commit `aa545fc Sconto`; il clone temporaneo `/tmp/win7pos-task-020-73042d6` e stato usato solo come controverifica read-only. Discovery conferma Win7POS WPF `net48` x86 con SQLite locale, first-run admin, login username/PIN locale, lockout, vendite/refund/void e pagamenti cash/card; non trova networking/API Supabase, `shop_code`, `staff_code` remoto, trusted device o sync vendite. Admin Web ha foundation staff/device/audit, ma non ha ancora POS session store, device token runtime, heartbeat POS o schema vendite POS. Final review/reconciliation del 2026-06-01: piano confermato corretto, harness rafforzato con check security scanner TASK-020, gate critici passati, nessun runtime POS implementato, nessuna migration TASK-020, nessun endpoint pubblico POS, nessuna modifica Win7POS. TASK-020 riconciliato a `DONE_RECONCILED`; non committato/pushato/staged per richiesta esplicita dell'utente.

### TASK-021 - POS backend session/device endpoints

- Stato: `DONE`
- File task: `docs/TASKS/TASK-021-pos-backend-session-device-endpoints.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-021/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Verdict corrente: `DONE_RECONCILED`
- Scopo: implementare foundation backend server-side per first login POS, trusted device token hash, sessione POS, heartbeat/refresh e revoca enforcement.
- Include:
  - verifica schema reale prima di creare nuove tabelle;
  - migration minima per `pos_device_credentials` e `pos_sessions`;
  - token trusted device e session token salvati backend solo come hash;
  - Route Handler Next.js server-side per `POST /api/pos/auth/first-login` e `POST /api/pos/session/heartbeat`;
  - Data access layer `server-only` con service-role solo server-side;
  - enforcement su `shops.shop_status`, `staff_accounts.status`, `staff_accounts.credential_status`, `shop_devices.status`, lockout e `session_invalidated_at`;
  - revoca device che invalida credential/sessioni POS;
  - audit log redatto per eventi sensibili;
  - foundation/security test TASK-021.
- Non include:
  - dashboard TASK-022;
  - modifiche Win7POS;
  - client HTTP Win7POS;
  - sales sync;
  - dati finti o seed;
  - service-role key lato client/browser;
  - salvataggio PIN/password/token raw;
  - commit/push senza richiesta successiva;
  - dichiarazione `DONE`.
- Nota: TASK-021 aperto da Codex il 2026-06-01 su richiesta esplicita utente dopo TASK-020 `DONE_RECONCILED`. Decisione tecnica: usare Route Handler Next.js piu moduli `server-only`, non RPC pubbliche Supabase per first login, perche la verifica `scrypt-v1` delle credential staff e Node-side. Implementata e applicata la migration `20260601120000_task_021_pos_sessions_devices.sql` con `pos_device_credentials`, `pos_sessions` e trigger di revoca device; aggiunti endpoint `POST /api/pos/auth/first-login` e `POST /api/pos/session/heartbeat`; tipi Supabase rigenerati. Review/reconciliation finale richiesta esplicitamente dall'utente via allegato il 2026-06-01: trovati e corretti lockout POS scaduto non recuperabile, cleanup first-login incompleto su failure session/audit, audit trusted-device non richiesto, token mismatch heartbeat che poteva bloccare sessioni valide e limiti input mancanti. Gate locali e Supabase passano; scope limitato a session/device backend, nessuna dashboard, nessun client Win7POS, nessun sales sync, nessun dato finto, nessun commit/push/stage.

### TASK-022_023 - POS live dashboard + Win7POS first login trusted device

- Stato: `DONE`
- File task: `docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-022-023/README.md`
- Fase: `DONE`
- Execution: `COMPLETED`
- Review: `PARKED_FOR_LIVE_E2E`
- Verdict corrente: `PASS_WITH_NOTES_READY_FOR_REVIEW`
- Parking: `PARKED_E2E_PENDING`
- Scopo: implementare la prima integrazione reale POS tra Admin Web e Win7POS, tenendo phase gate separati per client Win7POS e dashboard POS live.
- Include:
  - Win7POS first login online con `shop_code`, `staff_code` e PIN/password;
  - trusted device client con device identifier stabile non invasivo;
  - salvataggio token device/session con DPAPI o equivalente compatibile Windows 7;
  - heartbeat/session refresh verso endpoint TASK-021;
  - configurazione Admin Web base URL senza URL produzione hardcoded;
  - dashboard POS live read-only dentro Shop Admin;
  - read model server-only basato su `shop_devices`, `pos_device_credentials`, `pos_sessions`, `staff_accounts_safe` e audit POS;
  - harness statici/security per no secret, no token/PIN/password in chiaro e no sales sync.
- Non include:
  - TASK-024 sales sync;
  - import/export vendite;
  - tabelle vendite POS;
  - CRUD vendite;
  - dashboard con metriche inventate;
  - dati finti;
  - refactor grande Win7POS;
  - modifiche iOS/Android/Cash Register System;
  - commit/push/stage.
- Nota: TASK-022_023 aperto da Codex il 2026-06-01 su richiesta esplicita utente tramite allegato dopo TASK-021 `DONE_RECONCILED`. Il task unisce TASK-022 e TASK-023 ma resta phase-gated: prima Win7POS client minimo contro endpoint TASK-021, poi dashboard POS live Shop Admin. Execution completata da Codex il 2026-06-01: Win7POS client/DPAPI/heartbeat implementati, dashboard `/shop/pos` read-only implementata, scanner/foundation aggiornati, Admin Web verify e Win7POS build x86 passati. Review/reconciliation Codex richiesta via allegato il 2026-06-01: corretti hardening binding heartbeat e scanner log sensibili Win7POS; Supabase linked migration/dry-run/typegen passati; E2E live non eseguito per mancanza di service-role locale e dataset/harness test con cleanup. Verdict corrente `PASS_WITH_NOTES_READY_FOR_REVIEW`. Handoff a `REVIEW`; non chiuso a `DONE`.
- Checkpoint 2026-06-01: su richiesta utente il gate E2E live Supabase + Admin Web + Win7POS + dataset test + cleanup viene parcheggiato. TASK-022_023 resta `PASS_WITH_NOTES_READY_FOR_REVIEW` / `PARKED_E2E_PENDING`: il blocco residuo e il gate live mancante, non un bug codice noto. Nessun dato test live e nessun cleanup E2E sono stati eseguiti in questo checkpoint. `TASK-024` sales sync resta differito e non va implementato mentre il progetto procede su sviluppo Admin Web non-POS.
- DONE readiness check 2026-06-02: non consigliato marcare `DONE` ora. Il task file e l'evidence restano `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW`, con E2E live ancora `PARKED_E2E_PENDING`; TASK-029C non ha sbloccato staging HTTPS perche Vercel Preview resta bloccato.
- Win7POS scanner reconciliation 2026-06-02: il vecchio `scripts/check-pos-online-client.ps1` e stato riallineato al flusso TASK-029 `PosOnlineFirstLoginDialog` -> `PosOnlineBootstrapService` -> `PosAdminWebClient.FirstLoginAsync`. Check Win7POS bootstrap, online-client, catalog pull, build x86 e `git diff --check` passano; commit Win7POS `d2c3d4b` pushato su `main`. Follow-up hardening `5e35a37` valida trusted-device token, sessione, device, staff e shop prima del mirror locale e aggiorna lo scanner bootstrap. TASK-022_023 resta comunque `REVIEW` / `PASS_WITH_NOTES_READY_FOR_REVIEW` perche l'E2E live resta `PARKED_E2E_PENDING`.

### TASK-024 - Win7POS sales sync

- Stato: `DEFERRED`
- File task: `NOT_CREATED`
- Evidence: `NOT_CREATED`
- Fase: `DEFERRED`
- Execution: `NOT_STARTED`
- Review: `NOT_STARTED`
- Verdict corrente: `DEFERRED_BY_USER`
- Scopo: sincronizzare vendite Win7POS verso backend/Admin Web in un task futuro separato.
- Non include ora:
  - implementazione sales sync;
  - schema vendite POS;
  - modifiche Win7POS;
  - dashboard vendite;
  - dati finti;
  - avvio mentre TASK-022_023 E2E live resta parcheggiato.
- Nota: differito esplicitamente dal checkpoint 2026-06-01. Il prossimo sviluppo raccomandato non e POS e non deve introdurre sales sync.

### TASK-026 - Shop Admin product catalog foundation

- Stato: `DONE_WITH_NOTES`
- File task: `docs/TASKS/TASK-026-shop-admin-product-catalog-foundation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-026/README.md`
- Fase: `DONE_WITH_NOTES`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED`
- Verdict corrente: `DONE_WITH_NOTES`
- Scopo: consolidare la foundation catalogo prodotti Shop Admin partendo dallo schema Supabase reale e dalla base esistente, aggiungendo solo il pull catalogo read-only Win7POS trusted device. Nessun sales sync.
- Include:
  - discovery schema reale e tipi correnti per `shop_inventory_sources`, `inventory_products`, `inventory_categories`, `inventory_suppliers`, `inventory_product_prices` e RPC `shop_catalog_*`;
  - verifica dei read model server-only e delle pagine `/shop/products`, `/shop/categories`, `/shop/suppliers`;
  - filtri catalogo base su prodotti/categorie/fornitori;
  - verifica/hardening dei boundary mutativi catalogo esistenti;
  - endpoint `POST /api/pos/catalog/pull` e client Win7POS read-only su DB locale;
  - policy `docs/ARCHITECTURE/WIN7POS-SYNC-POLICY.md`;
  - evidence su mapping shop -> owner inventory, no cross-shop leak, no dati finti, no secret e no service-role client/browser;
  - check locali e Supabase appropriati allo scope effettivo.
- Non include:
  - E2E POS live TASK-022_023;
  - TASK-024 sales sync;
  - editing catalogo da Win7POS verso Supabase;
  - modifiche iOS/Android/Cash Register;
  - nuove tabelle Supabase senza discovery e decisione esplicita;
  - nuove dipendenze;
  - dashboard finte o dati mock spacciati per live;
  - commit/push/stage.
- Nota: execution avviata da Codex il 2026-06-01 su richiesta esplicita utente tramite allegato. Review finale positiva e chiusura documentale richiesta esplicitamente dall'utente il 2026-06-01 con verdict `DONE_WITH_NOTES`: nessun blocker, catalog pull server-only/no-store/trusted-session/device scoped, Win7POS pull read-only, nessun sales sync e nessun editing catalogo da POS. Note residue non bloccanti: E2E live non eseguito, pull `full_refresh` non delta, prezzi/stock da validare con dataset reale.

### TASK-027 - Catalog pull delta sync and POS catalog hardening

- Stato: `DONE`
- File task: `docs/TASKS/TASK-027-catalog-pull-delta-sync-and-pos-catalog-hardening.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-027/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_BY_USER_CONFIRMATION`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Scopo: consolidare il pull catalogo POS/Win7POS con delta sync reale, cursor, `updated_since`, tombstone, versioning per risposta e diagnostica minima Shop Admin, senza sync bidirezionale e senza purge distruttivo.
- Include:
  - helper server-side testabile per parsing `updated_since`, `syncCursor`, limite e paginazione;
  - endpoint `POST /api/pos/catalog/pull` con `syncMode`, `serverTime`, `hasMore`, `catalogVersion`, `syncCursor`, `updatedSince` e `catalog.tombstones`;
  - gestione `deleted_at` per prodotti/categorie/fornitori gia presente nello schema reale;
  - isolamento shop confermato tramite trusted POS session e mapping `shop_inventory_sources.shop_id -> owner_user_id`;
  - diagnostica reale `/shop/pos` basata su audit `pos.catalog.pull.*`;
  - Win7POS esistente aggiornato con cursor salvato e retry/backoff leggero;
  - test foundation TASK-027 e documentazione/evidence.
- Non include:
  - sync bidirezionale catalogo;
  - editing catalogo dal POS;
  - TASK-024 sales sync;
  - login POS completo;
  - purge locale/remoto;
  - nuova migration Supabase;
  - nuove dipendenze;
  - dashboard finte o dati fake;
  - commit/push/stage.
- Nota: execution avviata da Codex il 2026-06-01 su richiesta esplicita utente tramite allegato. Handoff iniziale preparato a `REVIEW` con verdict Codex `PASS_WITH_NOTES`: manca E2E live Supabase/Admin Web/Win7POS con dataset reale; `catalogVersion` e per risposta sync e non ancora persistente per shop; tombstone Win7POS ricevute ma non applicate come cancellazione locale per evitare purge distruttivo senza modello locale soft-delete.
- Review/fix 2026-06-01: corretti tre gap trovati durante la review dell'allegato: cursor opaco `catalog-v1:*` ora respinto se futuro o incoerente, audit catalog pull ora salva solo `sync_cursor_preview`/presenza e non il cursor completo, Win7POS ora reinvia il cursor salvato via `syncCursor` invece di `updated_since`. Codex Security diff scan completato su Admin Web e Win7POS con report locali in `/tmp/codex-security-scans/.../report.md`; nessun finding reportable non risolto dopo fix/validation/attack-path.
- Finalization 2026-06-01: su conferma esplicita utente, TASK-027 chiuso a `DONE_RECONCILED_WITH_NOTES`. Cleanup artefatti verificato: nessuna cartella `/tmp/codex-security-scans/...` o scan id dentro i repo; solo `docs/TASKS/EVIDENCE/TASK-027/README.md` mantenuto come evidence utile. Commit e push separati richiesti per Admin Web e Win7POS.

### TASK-028 - Catalog CRUD, Excel import/export, and Win7POS catalog pull E2E

- Stato: `DONE_RECONCILED_WITH_NOTES`
- File task: `docs/TASKS/TASK-028-catalog-crud-import-export-win7pos-e2e.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-028/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_BY_CODEX`
- Review: `USER_CONFIRMED_DONE`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Scopo: completare il catalogo Shop Admin con restore controllato, import/export Excel preview-first e applicazione Win7POS dei tombstone come soft state locale, mantenendo Admin Web/Supabase come sorgente autoritativa.
- Include:
  - RPC auditata `shop_catalog_restore_product`;
  - read model con `deletedAt` e `archivedProducts`;
  - import Excel con validazione duplicati/conflitti, digest preview/apply e merge conservativo;
  - riconoscimento colonne per campioni Drive fornitori con header dopo metadata e alias spagnoli/cinesi;
  - audit import/export con permessi separati `catalog.import` / `catalog.export` e fallimento chiuso;
  - guard limite upload multipart prima del parsing body;
  - Win7POS con `remote_product_id`, `remote_deleted_at`, `is_active`, diagnostica catalog pull e tombstone senza delete fisico;
  - test foundation TASK-028 e documentazione/evidence.
- Non include:
  - TASK-024 sales sync;
  - sync bidirezionale catalogo;
  - editing catalogo da POS;
  - modifiche iOS/Android;
  - nuove dipendenze;
  - commit/push/stage.
- Nota: execution avviata da Codex il 2026-06-01 su richiesta esplicita utente tramite allegato. L'utente ha fornito anche una cartella Drive con file fornitori; sono stati ispezionati campioni `.xlsx` reali e usati per estendere il riconoscimento colonne. Handoff preparato a `REVIEW`; Codex non marca mai `DONE`.
- Review/fix 2026-06-01: corretti audit import/export con permessi `catalog.import`/`catalog.export` e controllo esplicito esito audit, guard `Content-Length` prima di `formData()` su preview/apply, tabella prodotti con `Product id`, `State`, `Archived at` e righe archiviate visibili. Gate finali: `npm run test:foundation` PASS (`128/128`), `npm run verify` PASS con warning toolchain `[DEP0205]`, `npm run security:scan` PASS, Win7POS scanner ALL PASS, build WPF x86 PASS (`Avvisi: 0`, `Errori: 0`). Supabase migration non applicata su DB locale/live per container locale assente; no apply remoto. Codex Security diff scan Admin Web/Win7POS senza finding reportable, report in `/tmp/codex-security-scans/.../report.md`. Verdict tecnico aggiornato a `DONE`, mantenendo fase `REVIEW`.
- Review live Supabase + Win7POS E2E 2026-06-01: produzione/remoto `NOT_USED`; `.env.local` remota esclusa. Stack locale gia attivo ispezionato ma non modificato per migration history divergente; E2E eseguito su stack Supabase isolato `/tmp/mc-task028-supabase.6OZZEG` (`mc-task028-e2e`, API `127.0.0.1:55431`, DB `127.0.0.1:55432`). Migration complete fino a `20260601160000_task_028_catalog_restore_product.sql`; file SQL TASK-028 originale rieseguito con `psql` senza errori. E2E sintetico PASS: import `.xlsx` preview/apply Admin Web, POS first-login, catalog full pull, archive via UI/Server Action, delta tombstone, soft tombstone Win7POS SQLite (`isActive 1 -> 0`), restore via UI/Server Action, delta restore e re-activate Win7POS (`isActive 0 -> 1`). Check rieseguiti: Admin Web `test:foundation` PASS (`128/128`), `verify` PASS con warning `[DEP0205]`, `security:scan` PASS, `git diff --check` PASS; Win7POS scanner ALL PASS, build WPF x86 PASS (`Avvisi: 0`, `Errori: 0`), `git diff --check` PASS. Residuo: fresh reset Supabase non patchato resta bloccato prima di TASK-028 dalla migration storica `20260515161500_task110_history_tombstone_grants.sql` su `public.product_prices` assente; workaround applicato solo alla copia `/tmp`, non alla repo.
- DONE reconciliation 2026-06-01: su conferma esplicita dell'utente nel brief `TASK-029`, TASK-028 chiuso a `DONE_RECONCILED_WITH_NOTES`. Note residue mantenute: drift storico TASK-110 trattato in TASK-029, `.xls` legacy fuori scope, Android/iOS non toccati, TASK-024 sales sync deferred. Nessuna dichiarazione di readiness globale.

### TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening

- Stato: `DONE`
- File task: `docs/TASKS/TASK-029-production-path-staging-win7pos-bootstrap.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-029/README.md`
- Fase: `REVIEW`
- Execution: `COMPLETED_BY_CODEX`
- Review: `PENDING_USER_REVIEW`
- Verdict corrente: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Scopo: chiudere TASK-028, correggere fresh reset Supabase/TASK-110, preparare staging, implementare bootstrap online Win7POS fresh install e hardening minimo API POS.
- Include:
  - patch idempotente della migration storica TASK-110 per `public.product_prices` assente;
  - documentazione staging e blocker credenziali/provider;
  - helper POS route security con JSON `Content-Type`, body limit e `no-store`;
  - Win7POS online bootstrap prima del wizard locale su DB vuoto;
  - mirror locale staff remoto con hash/salt locale e metadati remoti non segreti;
  - FirstRunSetupDialog mantenuto come recovery/dev.
- Non include:
  - deploy production;
  - dati clienti reali;
  - secret nel repository;
  - Supabase diretto da Win7POS;
  - sales sync;
  - editing catalogo da POS;
  - modifiche Android/iOS;
  - commit/push/stage su `main`; eccezione TASK-029C: commit/push non-main solo per tentativo Vercel Preview, ora bloccato.
- Nota: execution avviata da Codex il 2026-06-01 su richiesta esplicita utente. Staging pubblico HTTPS non eseguito per assenza `.vercel`, `vercel.json`, `netlify.toml` e CLI `vercel`; stato fase staging `BLOCKED_STAGING_CREDENTIALS`. Produzione non usata.
- Review/fix 2026-06-01: Codex ha ricontrollato TASK-028 closure, TASK-110 fresh reset, API POS hardening, Win7POS bootstrap, staging discovery e docs/evidence. Fix scoped applicati: test comportamento helper POS JSON, scanner bootstrap rafforzato, copy Win7POS bootstrap/recovery piu orientato a operatore, pulizia PIN/password in `finally`, popup toccati senza `ex.Message`, response body Admin Web client limitato. Fresh reset Supabase isolato PASS fino a TASK-028 con `public.product_prices = NULL`, RPC restore presente e schema POS completo. Check locali Admin Web/Win7POS PASS; `build`/`verify` con solo warning `[DEP0205]`. Staging resta `BLOCKED_STAGING_CREDENTIALS`, nessuna produzione usata.
- TASK-029B update 2026-06-01: Vercel CLI installata/autenticata, progetto `xniw97-9857s-projects/merchandise-control-admin-web` linkato, GitHub `XNIW/merchandise-control-admin-web` collegato, env Vercel Preview configurate senza valori in repo/evidence, Supabase remoto dev `merchandisecontrol-dev` verificato e RPC restore TASK-028 applicata/verificata. I deploy manuali Vercel CLI da worktree locale, anche con `--target=preview` e branch locale non-main, hanno prodotto `target=production`; i deployment `dpl_EBv8HEroVsKQk5YaQrapyWZxqbGf`, `dpl_FVvS6QYv6FEiXutJrgLMJMM8qtz4`, `dpl_6bGHetzA2uduq4hy8zMdiYrV2XYJ` e `dpl_99aoNgtAJnCw3zTzKCcqQwBMP2ss` sono stati cancellati subito e lo stato finale Vercel non ha deployment attivi. TASK-029C ha poi verificato che il branch Git non-main pushato genera comunque `Production`, quindi staging resta bloccato finche non viene corretta Vercel/Git Integration o autorizzato hosting HTTPS non-production alternativo.
- TASK-029C update 2026-06-02: percorso branch Git non-main provato su `codex/task-029c-vercel-preview-e2e` con commit `274deff` e push remoto per attivare Vercel Git Integration. Anche questo percorso ha generato una deployment Vercel `Environment Production` (`merchandise-control-admin-gmip02vp7-xniw97-9857s-projects.vercel.app`); la deployment e stata cancellata subito e `vercel ls` finale non mostra deployment attivi. Il branch remoto temporaneo e stato poi rimosso con `git push origin --delete codex/task-029c-vercel-preview-e2e`. Project config osservata con GitHub link `XNIW/merchandise-control-admin-web` e `productionBranch=main`, ma nessuna URL Preview/non-production e stata ottenuta. Smoke API POS, dataset staging e Win7POS E2E staging restano `NOT_RUN_BLOCKED`; verdict aggiornato a `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`.
- Win7POS scanner/bootstrap reconciliation 2026-06-02: root cause del failure legacy era lo scanner `check-pos-online-client.ps1`, ancora ancorato al dialog che chiamava direttamente il client. Lo scanner ora valida il flusso corretto dialog -> `PosOnlineBootstrapService` -> client online, pulizia PIN/password, DPAPI trusted-device store, hashing credential locale, assenza log sensibili e assenza Base URL produzione hardcoded. Follow-up hardening `5e35a37` valida trusted-device token, sessione, device, staff e shop prima del mirror locale e aggiorna lo scanner bootstrap; check Win7POS richiesti passati. TASK-029 resta bloccato solo sul gate Preview/non-production e sui conseguenti smoke/E2E staging.

### TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation

- Stato: `DONE_WITH_NOTES`
- File task: `docs/TASKS/TASK-030-vercel-deployment-configuration-diagnosis-main-reconciliation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-030/README.md`
- Fase: `DONE_RECONCILED`
- Execution: `COMPLETED_BY_CODEX`
- Review: `COMPLETED_BY_CODEX_REVIEW`
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`
- Scopo: diagnosticare la configurazione Vercel/Git Integration che genera `Production` da percorsi non-production, neutralizzare il rischio di auto-deploy e riconciliare Admin Web su `main` solo se il gate anti-production e soddisfatto.
- Include:
  - diagnosi Vercel read-only;
  - verifica deployment/alias/env solo per nome e target;
  - disconnessione reversibile Git Integration;
  - guardrail `vercel.json` con `git.deploymentEnabled=false`;
  - aggiornamento documentazione/evidence;
  - eventuale merge/commit/push su `main` solo dopo check e gate anti-production.
- Non include:
  - deploy production;
  - uso production come staging;
  - rimozione env Production Vercel;
  - Supabase schema/migration/RLS/tipi;
  - runtime POS, catalogo o Win7POS;
  - TASK-024 sales sync.
- Nota: avviato da Codex il 2026-06-02 da handoff allegato utente. Prima azione remota applicata: `vercel git disconnect --scope xniw97-9857s-projects`, verificata con `link=null`, `live=false`, `hasDeployments=false`, deployment/alias vuoti. Aggiunto guardrail versionato `vercel.json` con `git.deploymentEnabled=false`. Merge controllato su `main`, check Admin Web e Win7POS passati, push su `main` completato e verifica Vercel post-push conferma nessun deployment/alias. TASK-029 resta bloccato per assenza di vera Preview/non-production; TASK-022_023 resta `PARKED_E2E_PENDING`; TASK-024 resta `DEFERRED`.
- Review finale 2026-06-02: TASK-030 riconciliato a `DONE_RECONCILED_WITH_NOTES` dopo verifica repo-grounded post-push. Check pre-review documentale su `main` e `origin/main` allineati a `71316e7`, working tree Admin Web pulito, Vercel ancora scollegato da Git (`link=null`, `gitRepository=null`), nessun deployment/alias, `vercel.json` con `git.deploymentEnabled=false`. Check freschi: Admin Web `security:scan` PASS, `test:foundation` PASS (`134/134`), `verify` PASS con warning `[DEP0205]`, `git diff --check` PASS; Win7POS `git diff --check`, scanner bootstrap/catalog e build x86 PASS. Follow-up successivo: scanner legacy `check-pos-online-client.ps1` riconciliato con il flusso TASK-029 in commit Win7POS `d2c3d4b`.

### TASK-031 - Vercel Preview retry after environment docs

- Stato: `REVIEW_BLOCKED`
- File task: `docs/TASKS/TASK-031-vercel-preview-retry.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-031/README.md`
- Fase: `REVIEW`
- Execution: `COMPLETED_BY_CODEX`
- Review: `PENDING_USER_REVIEW`
- Verdict corrente: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`
- Scopo: ritentare una vera Preview/non-production Vercel usando la documentazione ufficiale indicata dall'utente su Preview Environment e REST create-deployment.
- Include:
  - verifica doc Vercel Preview CLI senza `-prod`;
  - verifica REST API con `target` omesso;
  - verifica REST/API con branch remoto non-main;
  - verifica disponibilita Custom Environments;
  - cleanup immediato di ogni deployment Production inatteso.
- Non include:
  - uso Production come staging;
  - mantenere deployment Production attivi;
  - rimozione env Production Vercel;
  - lettura valori env/secret;
  - modifiche runtime Admin Web/POS/Supabase/Win7POS.
- Nota: retry eseguito da Codex il 2026-06-02 dopo link utente alla doc Vercel Preview Environment. La doc conferma che CLI senza `-prod` e REST `target` omesso dovrebbero produrre Preview, ma il progetto con `hasDeployments=false` ha restituito sempre `target:"production"` e OIDC `environment:"production"`, anche su branch remoto non-main e anche con `target:"staging"`. Tutti i deployment inattesi sono stati cancellati subito; Vercel finale resta senza deployment e senza alias. Custom environments non disponibili (`accountLimit.total=0`, piano Hobby). Ipotesi residua: Vercel forza il primo deployment del progetto a Production baseline; verificarlo richiede autorizzazione esplicita per lasciare temporaneamente un deployment Production, quindi TASK-031 resta `REVIEW_BLOCKED`.

### TASK-032 - Full project progression mega-task

- Stato: `DONE`
- File task: `docs/TASKS/TASK-032-full-project-progression-mega-task.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-032/README.md`
- Fase: `REVIEW`
- Milestone interna: `FASE_6_HTTPS_NON_PRODUCTION_BLOCKED`
- Responsabile: `COMPLETED`
- Verdict corrente: `PASS_WITH_NOTES_PHASE_5_COMPLETE_PHASE_6_BLOCKED`
- Scopo: mega-task unico richiesto esplicitamente dall'utente per avanzare baseline/handoff, Shop Admin polish, Excel hardening, permissions, local POS E2E, HTTPS non-production alternativo, riconciliazione TASK-029/TASK-022_023, planning sales sync e foundation sales sync solo se i gate lo rendono sicuro.
- Include:
  - pre-flight Admin Web, Win7POS e Vercel read-only;
  - apertura task/evidence ufficiali TASK-032;
  - gate base Admin Web e Win7POS;
  - fasi interne documentate senza creare task ufficiali separati;
  - handoff finale a `REVIEW`.
- Non include:
  - production usata come staging;
  - ricollegare Git Integration Vercel corrente senza gate;
  - leggere o salvare secret;
  - service-role nel browser o in Win7POS;
  - dati clienti reali;
  - sync bidirezionale catalogo o editing catalogo dal POS;
  - modifiche Android/iOS runtime senza necessita esplicita.
- Nota: execution avviata da Codex il 2026-06-02 da allegato utente. Baseline iniziale: Admin Web `main` pulito e allineato a `origin/main` su `18116bc`; Win7POS `main` pulito e allineato a `origin/main` su `5e35a37`; Vercel Git Integration scollegata (`link=null`, `gitRepository=null`), nessun deployment, nessun alias, `vercel.json` con `git.deploymentEnabled=false`. Branch Admin Web creato per l'execution: `codex/task-032-full-project-progression`. Fase 1 gate base passati dopo fix mirato delle whitelist governance per riconoscere TASK-032: Admin Web `security:scan`, `test:foundation` (`134/134`) e `git diff --check` PASS; Win7POS `git diff --check` e scanner bootstrap/client/catalog PASS. Fase 2 Shop Admin polish passata con note: `test:foundation` `137/137`, `security:scan`, `typecheck`, `lint`, `build`, `verify` e `git diff --check` PASS/PASS*WITH_WARNING; browser smoke autenticato `BLOCKED_NO_AUTH_SESSION` su route shop locali. Fase 3 Excel hardening passata con note: validazione `duplicate_product_sku`, test sintetici header spostati/alias cinesi-spagnoli/formula injection/numeri, Drive discovery read-only dei campioni fornitori, `test:foundation` `140/140`, `security:scan`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING. Fase 4 permissions hardening passata con note: `resolveShopActionContext` nega `shop_id` non autorizzati invece di fallback, test matrix owner/manager/viewer/POS staff, `test:foundation` `144/144`, `security:scan`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING. Fase 5 Local POS E2E passata con cleanup: stack Supabase temporaneo isolato, migration locali applicate, dataset sintetico `TASK032*\*`, POS first-login/trusted device/heartbeat/catalog full/tombstone/restore passati, cleanup verificato con zero residui attivi, Admin Web `test:foundation` `147/147`, `security:scan`, `verify`e`git diff --check`PASS/PASS_WITH_WARNING; Win7POS scanner bootstrap/client/catalog e`git diff --check`PASS. Review/fix finale Codex: diff security scan completato in`/tmp/codex-security-scans/merchandise-control-admin-web/18116bc_20260601235207/report.md`, trovato e corretto finding locale `TASK032-URL-CREDS-LEAK` nel harness POS (`TASK032_POS_E2E_BASE_URL`con userinfo non viene piu stampato su startup failure), regression test dedicato aggiunto. Check finali freschi: Admin Web`security:scan`PASS,`test:foundation` PASS (`148/148`), `verify`PASS con warning`[DEP0205]`, `git diff --check`PASS; browser smoke locale conferma blocco auth su prodotti/categorie/fornitori; Win7POS`git diff --check`e scanner bootstrap/client/catalog PASS; Vercel read-only conferma zero deployment, zero alias, Git Integration scollegata e env solo come`Encrypted`. TASK-032 passa a handoff `REVIEW`con Fase 6 bloccata; TASK-029, TASK-031 e TASK-022_023 restano non chiusi finche i relativi gate HTTPS/non-production e Win7POS live non passano. TASK-033 ha poi integrato il commit TASK-032`2fa1feb`sul branch`codex/task-033-https-pos-sales-mega-task` per review controllata e prosecuzione del gate HTTPS.

### TASK-033 - Controlled TASK-032 review + HTTPS non-production + Win7POS live E2E + POS reconciliation + sales sync foundation

- Stato: `REVIEW_WITH_BLOCKERS`
- File task: `docs/TASKS/TASK-033-controlled-task-032-review-https-pos-sales.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-033/README.md`
- Fase: `REVIEW_WITH_BLOCKERS`
- Milestone interna: `HANDOFF_REVIEW_WITH_BLOCKERS`
- Responsabile: `USER_REVIEW`
- Branch execution: Admin Web su `codex/task-033-https-pos-sales-mega-task`
- Verdict corrente: `REVIEW_WITH_BLOCKERS`
- Scopo: proseguire in task unico con review controllata di TASK-032, ambiente HTTPS non-production alternativo, Admin Web POS API smoke HTTPS, Win7POS live E2E, dashboard POS read-only con dati sintetici reali, riconciliazione TASK-029/TASK-022_023 solo dopo gate reali, sales sync planning e foundation solo se schema/endpoint/idempotency/offline/test sono sicuri.
- Include:
  - Controlled TASK-032 review;
  - HTTPS non-production senza Vercel Production e senza ricollegare Git Integration;
  - POS API smoke e Win7POS live E2E con dati sintetici;
  - POS reconciliation di TASK-029 e TASK-022_023 solo se i gate passano;
  - sales sync planning;
  - eventuale sales sync foundation e dashboard vendite solo se i gate sono verificati.
- Non include:
  - `DONE`;
  - uso Production come staging;
  - Vercel Git Integration ricollegata;
  - service role o secret nel client/browser/Win7POS;
  - dati reali hardcoded;
  - `merchant -> stores`;
  - dichiarazioni di readiness senza evidence reale.
- Nota: aperto da Codex il 2026-06-02 da brief utente. Branch dedicato creato da `main`; TASK-032 integrato via fast-forward controllato da `18116bc` a `2fa1feb`; check base Admin Web `security:scan` e `test:foundation` (`148/148`) passati. `cloudflared` installato e usato per Quick Tunnel HTTPS non-production `trycloudflare.com`; Admin Web POS API smoke HTTPS e harness positivo passati con dati sintetici e cleanup verificato. Check finali Admin Web: `security:scan` PASS, `test:foundation` PASS (`153/153` dopo fix regex governance), `verify` PASS con warning noto `[DEP0205]`, `git diff --check` PASS. Win7POS repo pulito, scanner bootstrap/client/catalog PASS e build WPF x86 PASS con `Avvisi: 0`, `Errori: 0`; il client WPF net48 non e pero eseguibile su questa macchina macOS senza Windows/Wine/Mono: TASK-033 va a `REVIEW_WITH_BLOCKERS`. Vercel resta parcheggiato con `git.deploymentEnabled=false`, zero deployment e zero alias; TASK-029 e TASK-022_023 non riconciliati; sales sync resta planning-only.
- Review/fix Codex 2026-06-02: review completa dell'allegato eseguita senza dichiarare `DONE`. Codex Security diff scan TASK-033 completato in `/tmp/codex-security-scans/merchandise-control-admin-web/2fa1feb_20260602051839/report.md` e `report.html`, `15/15` righe coperte e nessun finding reportable. Check freschi Admin Web `security:scan`, test TASK-033, `test:foundation` (`153/153`), `typecheck`, `lint`, `build`, `verify` e `git diff --check` passano, con solo warning noto `[DEP0205]` in build/verify. Browser smoke `/shop/pos` conferma guardia `Shop Admin access required` / `No active session`. Win7POS scanner bootstrap/client/catalog, build WPF x86 e `git diff --check` passano; live E2E resta `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE` su macOS arm64 senza Windows/Wine/Mono. Vercel read-only conferma zero deployment/alias e `git.deploymentEnabled=false`; Cloudflare/server/container temporanei chiusi. TASK-029 e TASK-022_023 restano non riconciliati; sales sync foundation e dashboard vendite restano non implementate.

### TASK-034 - Unified project progression: VM pause, Admin Web polish, Shop hardening, Win7POS non-VM hardening, sales sync planning

- Stato: `DONE_RECONCILED_WITH_NOTES`
- File task: `docs/TASKS/TASK-034-unified-project-progression.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-034/README.md`
- Fase: `DONE_RECONCILED`
- Milestone interna: `FINAL_RECONCILED_WITH_NOTES`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch execution: Admin Web su `main`; Win7POS su `main` se usato
- Verdict corrente: `DONE_WITH_NOTES`
- Verdict finale: `DONE_WITH_NOTES`
- Scopo: avanzare il progetto senza dipendere da VM/UTM/Win7 live, con phase gate rigidi su reconciliation VM pause, Admin Web UX/Product polish, Shop Admin operational hardening, Win7POS non-VM hardening, sales sync planning only e resume plan Win7 live E2E.
- Include:
  - reconciliation di TASK-029/TASK-031/TASK-032/TASK-033 senza chiuderli a `DONE`;
  - pausa esplicita VM/UTM/Win7 live testing come `PAUSED_VM_SETUP_REQUIRED`;
  - polish UI/UX Admin Web e hardening Shop Admin solo con fix piccoli, scoped e verificabili;
  - hardening Win7POS solo non-VM, scanner/docs/config/logging/bootstrap/catalog pull;
  - sales sync planning only in `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`;
  - resume checklist Win7 live E2E quando VM e drop saranno pronti.
- Non include:
  - commit/push/stage durante execution non confermata; commit e push finali
    su `main` autorizzati esplicitamente dall'utente il 2026-06-14;
  - `DONE`;
  - riapertura UTM/VM, download ISO o creazione VM;
  - uso Production come staging;
  - ricollegare Vercel Git Integration;
  - secret/service-role nel browser o in Win7POS;
  - dati reali;
  - runtime sales sync, migration sales, endpoint sales o dashboard vendite fake;
  - Android/iOS;
  - `merchant -> stores`.
- Nota iniziale 2026-06-02: Admin Web pre-flight pulito su `main`, `git diff --check` PASS; Win7POS disponibile su `main` con modifiche VM/docs/script preesistenti non revertite e `git diff --check` PASS. TASK-029 resta bloccato da staging/Win7 live gate, TASK-031 da comportamento Vercel Preview/Production, TASK-032 resta `REVIEW`, TASK-033 resta `REVIEW_WITH_BLOCKERS`. VM/UTM/Win7 live testing e messo in pausa. Sales sync resta `PLANNING_ONLY`; resume plan Win7 live E2E pronto ma non eseguito.
- Handoff Codex 2026-06-02: Admin Web UX polish e Shop Admin hardening completati con note: import/export copy preview-first, device revoke/reactivate con reason obbligatoria in UI e server boundary, test TASK-034 aggiunti. Win7POS non-VM hardening completato con scanner bootstrap/client/catalog PASS e note `PAUSED_VM_SETUP_REQUIRED` nei documenti VM; build WPF e smoke Win7 reale non eseguiti per pausa VM. Sales sync planning creato in `docs/ARCHITECTURE/POS-SALES-SYNC-PLAN.md`, senza migration/endpoint/dashboard runtime. Check Admin Web freschi: `security:scan` PASS, `test:foundation` PASS (`157/157`), `typecheck` PASS dopo fix, `lint` PASS, `build` PASS_WITH_WARNING `[DEP0205]`, `verify` PASS_WITH_WARNING `[DEP0205]`; browser in-app `BLOCKED_BROWSER_ATTACH_TIMEOUT`, fallback Playwright conferma guardia auth su `/shop/import-export` e `/shop/devices`.
- Review DONE-readiness 2026-06-02: review repo-grounded completata senza dichiarare `DONE`. Fix documentali scoped applicati a TASK-034/evidence/Master Plan e planning sales sync normalizzato. Supabase check classificato `SUPABASE_CHECK_PASS_WITH_NOTES`: CLI/local/linked migration list disponibili, con divergenza remota nota su `20260601160000` non peggiorata e nessuna migration/tipo modificato da TASK-034. UI autenticata resta `BLOCKED_NO_AUTH_SESSION`; smoke non-auth su `/shop/devices` e `/shop/import-export` conferma guardia auth e screenshot review salvato in evidence. VM/UTM/Win7 live E2E resta `PAUSED_VM_SETUP_REQUIRED`; iOS/Android `NOT_RUN_NOT_IN_SCOPE`; Vercel resta parcheggiato con `git.deploymentEnabled=false`. Verdict aggiornato a `PASS_WITH_NOTES_DONE`.
- Reconciliation finale 2026-06-02: su decisione esplicita dell'utente, TASK-034 chiuso documentamente a `DONE_RECONCILED_WITH_NOTES` / `DONE_WITH_NOTES`. Note residue mantenute: `BLOCKED_NO_AUTH_SESSION` per QA UI autenticata completa, `PAUSED_VM_SETUP_REQUIRED` per VM/UTM/Win7 live E2E, Vercel Preview/non-production bloccato, Supabase migration history divergence nota `20260601160000`, warning build/verify `[DEP0205]`, iOS/Android `NOT_RUN_NOT_IN_SCOPE`. TASK-029, TASK-031, TASK-032, TASK-033 e TASK-022_023 restano non chiusi. Nessuna migration Supabase, nessun runtime sales sync, nessun dato reale, nessun secret, nessun commit/push/stage e nessuna dichiarazione di readiness globale.
- Addendum Win7 live E2E resume 2026-06-02/03: su richiesta utente, ripreso il gate VM/UTM/Win7 live collegato a TASK-034 senza creare nuova task e senza collegarlo a TASK-035. `utmctl list` vede VM `Windows 7` UUID `B63440F6-8BFD-4E99-AB79-5465AC323398`; ISO Windows gia fuori dal CD/DVD osservabile e UTM Guest Tools ISO `/Users/minxiang/Downloads/utm-guest-tools-0.1.271.iso` montata. Shared folder host preparata in `/Users/minxiang/Projects/Win7POS/.win7pos-vm/shared-win7`; file sentinella, installer .NET 4.8 offline ufficiale, drop Win7POS e `run-pos-smoke.bat` copiati nella share host. Screenshot guest mostrano `Spice client (Z:)`, `map-drive.bat` con `Y:` mappato a `http://localhost:9843/` e contenuti host visibili da `Z:` (`host-share-check-task034.txt`, `Win7POS`, `run-pos-smoke.bat`, `NDP48-x86-x64-AllOS-ENU.exe`); `\\spice-webdavd\DavWWWRoot` non risolve ma non blocca la share. UTM mostra memoria VM a `4096 MiB` / `4 GB`, quindi non serve reinstallare Windows per cambiare RAM. La copia dell'installer .NET da WebDAV a `C:` e stata bloccata prima dal limite file del client WebDAV Windows, poi il restart `WebClient` ha richiesto rimappatura di `Z:`; screenshot guest mostra anche `C:` quasi pieno (`1,30 GB disponibile su 19,7 GB`). `qemu-img info` conferma disco virtuale `qcow2` da `20 GiB`; resize/extend di `C:` e possibile senza reinstallazione. Screenshot utente in chat mostra `.NET Framework 4.8` installato e verificato con `Release REG_DWORD 0x80eb1`; drop copiato in `C:\Win7POSTest\drop\Win7POS` con `38 File copiati` e `run-pos-smoke.bat` copiato localmente. `run-pos-smoke.bat` e stato eseguito manualmente e il launcher stampa `Starting Win7POS...` con ritorno al prompt senza errore batch; il gate passa a `WIN7_LIVE_RESUME_SMOKE_LAUNCHER_EXECUTED_APP_EVIDENCE_PENDING` finche non arrivano screenshot app, processo o log. Drop validato da `validate-drop.sh` su `src/Win7POS.Wpf/bin/x86/Release/net48` con warning su DLL SQLite nativa non trovata. Guest agent non risponde ancora a `utmctl ip-address`/`exec`, quindi controllo cmd remoto da Mac non disponibile.

### TASK-035 - Authenticated Admin Web QA + Shop Admin smoke harness

- Stato: `DONE`
- File task: `docs/TASKS/TASK-035-authenticated-admin-web-qa-shop-admin-smoke-harness.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-035/README.md`
- Fase: `DONE`
- Milestone interna: `AUTHENTICATED_LOCAL_SMOKE_PASSED`
- Responsabile: `COMPLETED`
- Branch previsto: Admin Web su `main` o branch dedicato se autorizzato in execution
- Verdict corrente: `DONE`
- Scopo: sbloccare il residuo `BLOCKED_NO_AUTH_SESSION` creando o rafforzando un harness QA autenticato per Admin Web, con dati sintetici e cleanup, per testare le route principali Shop Admin senza dipendere da VM Win7.
- Include:
  - discovery harness auth esistente;
  - scelta strategia auth test piu sicura;
  - dataset sintetico `TASK035_*`;
  - cleanup verificabile;
  - Playwright o harness equivalente se gia presente;
  - smoke route Shop Admin autenticate;
  - access guard Shop Admin;
  - catalogo, import/export, staff, devices, audit e POS read-only dove possibile;
  - reason obbligatoria per device revoke/reactivate;
  - no cross-shop leak;
  - no secret/PIN/password/token/hash in UI/log;
  - screenshot/evidence ripetibili.
- Non include:
  - VM/UTM/Win7 live E2E;
  - sales sync runtime;
  - dashboard vendite fake;
  - Vercel Production come staging;
  - Vercel Git Integration;
  - nuove migration Supabase non necessarie;
  - login Google/Apple/WeChat;
  - modifiche Android/iOS;
  - dati reali;
  - secret;
  - commit/push/stage fino alla conferma `DONE`; commit e push autorizzati esplicitamente il 2026-06-03.
- Route candidate: `/shop`, `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/import-export`, `/shop/members`, `/shop/roles`, `/shop/staff`, `/shop/devices`, `/shop/audit`, `/shop/settings`, `/shop/pos`, eventuale `/shop/sync`.
- Gate futuri: `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`, smoke UI autenticato se harness disponibile, cleanup dataset sintetico e `git diff --check`.
- Nota apertura 2026-06-02: creato solo planning/skeleton. Nessuna implementazione runtime, nessuna migration, nessun dataset, nessun smoke autenticato e nessun cleanup runtime eseguito.
- Handoff Codex 2026-06-02: aggiunto harness Playwright dedicato `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` e script `npm run test:shop-admin-auth-smoke`; guardia non-auth Shop Admin verificata su `/shop`, `/shop/products`, `/shop/import-export`, `/shop/devices`, `/shop/pos` con screenshot `docs/TASKS/EVIDENCE/TASK-035/browser-shop-devices-auth-required.png`. Il ramo autenticato crea solo dataset locale `TASK035_*` e cleanup verificabile, ma nel runtime corrente e stato saltato/bloccato perche il target Supabase rilevato e `supabase_cloud` e `SUPABASE_SERVICE_ROLE_KEY` non e disponibile localmente. Nessun dataset creato, nessun cleanup runtime necessario, nessuna migration/schema, nessun Win7POS, nessun sales sync, nessun Vercel live, nessun commit/push/stage. Verdict: `BLOCKED_NO_AUTH_SESSION`, task in handoff a `REVIEW`.
- Review/fix Codex 2026-06-03: harness TASK-035 rafforzato senza cambiare scope; readiness auth locale richiede anche `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, cleanup registra errori di delete/auth delete e conta residui anche su righe figlie shop-scoped. Probe redatti confermano target runtime `supabase_cloud`, service-role key mancante, REST locale `54321` raggiungibile ma stack Supabase del repo non ispezionabile (`supabase_db_merchandise-control-admin-web` assente). Nessun dataset `TASK035_*` creato, nessun cleanup runtime necessario, nessun nuovo task. Verdict resta `BLOCKED_NO_AUTH_SESSION`.
- Completion Codex 2026-06-03: gate autenticato Shop Admin eseguito su Supabase locale/non-production `127.0.0.1:54321` con key locali solo come env di processo e nessun secret stampato/salvato. Stack locale `MerchandiseControlSupabase` ispezionato direttamente; history locale riparata da `20260417` a `20260417000000`, pending migrations applicate fino a `schema_migrations_count=32`, nessuna migration repo nuova. Harness corretto per schema reale staff/device, attesa login su pathname, audit append-only senza fixture non ripulibile, redaction su materiale sensibile reale. `npm run test:shop-admin-auth-smoke` passa `2 passed`, route Shop Admin autenticate coperte, no cross-shop leak, screenshot autenticato salvato e cleanup verificato con zero residui `TASK035_*`, `shop_members`, `shop_inventory_sources`, auth e audit. Verdict: `DONE`; task resta `REVIEW`, non `DONE`.
- Chiusura 2026-06-03: su conferma esplicita dell'utente dopo review finale `DONE_READY`, TASK-035 chiuso a `DONE`. Check finali passati, nessun secret salvato, nessuna migration/dipendenza/feature fuori scope, commit e push richiesti dall'utente.

### TASK-036 - Admin Web web readiness, local dev, Cloudflared staging, Shop UX, Sync Center and production hardening

- Stato: `DONE`
- File task: `docs/TASKS/TASK-036-admin-web-web-readiness-local-dev-cloudflared-shop-sync-production-hardening.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-036/README.md`
- Fase: `DONE`
- Milestone interna: `TASK_036_DONE_CONFIRMED`
- Responsabile: `COMPLETED`
- Branch previsto: Admin Web su `main`
- Verdict corrente: `DONE`
- Scopo: migliorare la readiness del solo sito Admin Web senza dipendere da Win7, Vercel Production, Android/iOS o Sales Sync.
- Include:
  - Cloudflared Quick Tunnel come HTTPS temporaneo/non-production;
  - Supabase local/dev runbook e check redatti;
  - Shop Admin polish operativo piccolo e verificabile;
  - Sync Center read-only piu utile lato web;
  - production readiness checklist senza dichiarare production-ready globale;
  - foundation/security/regression checks.
- Non include:
  - commit, push o stage finale durante l'execution iniziale;
  - Vercel Production come staging;
  - ricollegare Vercel Git Integration;
  - Supabase production;
  - nuove migration Supabase;
  - Win7POS/Android/iOS/Cash Register;
  - TASK-024 Sales Sync runtime;
  - dashboard vendite fake;
  - secret o dati reali.
- Handoff Codex 2026-06-03: aperto TASK-036 dopo TASK-035 `DONE`; repo iniziale pulito su `main...origin/main`. Aggiunti runbook `docs/DEPLOYMENT/CLOUDFLARED-NON-PRODUCTION.md`, `docs/DEVELOPMENT/SUPABASE-LOCAL-DEV.md`, checklist `docs/DEPLOYMENT/PRODUCTION-READINESS-CHECKLIST.md`, script `dev:tunnel`, `dev:db:check`, `dev:db:status`, Sync Center con filtri read-only query/domain/source/status e diagnostica redatta, reason obbligatoria per archive/restore catalogo, foundation test TASK-036 e guardrail security per task attivo. Supabase locale osservato con mismatch noto `supabase_db_merchandise-control-admin-web` vs `supabase_db_MerchandiseControlSupabase`; `dev:db:check` fallisce chiuso su target `supabase_cloud`/mismatch senza stampare secret; nessun reset distruttivo. Check finali passano: `security:scan`, `test:foundation` (`163/163`), `typecheck`, `lint`, `build` con warning noto `[DEP0205]`, `verify` dopo rerun isolato, `git diff --check`; `test:shop-admin-auth-smoke` passa guardia non-auth e salta il ramo autenticato per ambiente corrente non locale/sicuro. Vercel resta parcheggiato con `git.deploymentEnabled=false`; Cloudflared resta solo HTTPS temporaneo/non-production; Win7POS live E2E e TASK-024 Sales Sync restano parcheggiati/deferred. TASK-036 va a `REVIEW`, non `DONE`.
- Review finale Codex 2026-06-03: hard review su diff TASK-036 con Codex Security diff-scan in `/tmp/codex-security-scans/merchandise-control-admin-web/9586993_20260603_task036/`, verdict no findings. Fix scoped applicati: cap render-side/server-side 160 sui filtri Sync Center, status filter normalizzato, reason catalog trim/cap server-side e hint audit UI, check Supabase CLI senza `which`, guardrail TASK-036 rafforzato. `npm run dev:db:check` resta `PASS_FAIL_CLOSED` su `.env.local` cloud e mismatch container, come guardrail. Smoke autenticato Shop Admin eseguito con Supabase locale `127.0.0.1:54321`, key generate solo come env di processo da `GOTRUE_JWT_SECRET` del container Auth locale e nessun secret stampato/salvato; primo probe con secret PostgREST fallisce `bad_jwt` come diagnostica, probe corretto GoTrue passa. Build con env locali process-only passa con warning noto `[DEP0205]`; `npm run test:shop-admin-auth-smoke` passa `2 passed`; cleanup DB post-smoke zero su `TASK035_*` e auth user. Production-ready globale non dichiarato, Cloudflared resta temporaneo, Vercel resta parcheggiato, Sales Sync resta `DEFERRED`, Win7POS live E2E resta parked. TASK-036 resta `REVIEW` e passa a `DONE`; Codex non marca `DONE` senza conferma utente.
- Chiusura 2026-06-03: conferma esplicita utente ricevuta per marcare TASK-036 `DONE`. Le note non bloccanti restano vincolanti: Cloudflared e temporaneo/non-production, Vercel resta parcheggiato con `git.deploymentEnabled=false`, `dev:db:check` fallisce chiuso su `.env.local` cloud/mismatch container, warning `[DEP0205]` non bloccante, Win7POS live E2E resta `PARKED_NOT_IN_SCOPE`, TASK-024 Sales Sync resta `DEFERRED`, progetto non dichiarato production-ready globale.

### TASK-037 - Shop Admin dual access model: personal account and POS manager login

- Stato: `DONE`
- File task: `docs/TASKS/TASK-037-shop-admin-dual-access-model.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-037/README.md`
- Architecture doc: `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`
- Fase: `DONE`
- Responsabile: `COMPLETED`
- Branch previsto: Admin Web su `main`
- Verdict corrente: `DONE`
- Scopo: verificare, documentare e preparare il modello dual access della Shop Admin Console senza implementare Sales Sync, email invite, social login o integrazioni Win7 live.
- Decisione prodotto:
  - `personal_account`: account personale web, multi-shop, collegato agli shop tramite `shop_members`;
  - `pos_staff_manager`: futuro accesso staff POS manager/admin, single-shop, con `shop_code + staff_code + credential`;
  - `profiles` e `staff_accounts` restano separati;
  - `cashier/operator` e staff ordinario non accedono alla Shop Admin web.
- Stato attuale repo-grounded:
  - `/shop` oggi e basato su Supabase Auth personale + `shop_members`;
  - shop switcher usa `shop_id` solo come navigazione tra shop gia autorizzati;
  - `staff_accounts`, `staff_accounts_safe`, `credential_status`, `shop_devices`, `pos_device_credentials`, `pos_sessions` e `audit_logs` sono presenti;
  - `staff_accounts.role_key` supporta `cashier`, `manager`, `viewer`;
  - `admin` role_key staff e `shop_admin.full_access` non sono ancora schema/runtime verificati.
  - Current schema staff web role: `manager` only; `admin` resta target prodotto/follow-up e non e accettato dalla foundation attuale.
- Implementation TASK-037:
  - aggiunto `src/server/shop-admin/access-principal.ts` come foundation server-only;
  - formalizzati i principal `personal_account` e `pos_staff_manager`;
  - `resolveCurrentShopAdminPrincipal` avvolge l'accesso personale esistente;
  - `resolvePosStaffManagerWebPrincipal` resta conservativo e richiede input staff gia verificato, ruolo schema corrente `manager` e permesso `shop_admin.full_access`;
  - aggiunti doc access model, task/evidence, foundation test e guardrail security scanner.
- Non include:
  - login staff web completo;
  - nuove migration Supabase;
  - Sales Sync;
  - email invite;
  - Google/Apple/WeChat login;
  - modifiche Win7POS/Android/iOS/Cash Register;
  - Supabase production o Vercel Production;
  - secret, service-role client/browser, PIN/password/token/hash in UI/log/evidence.
- Handoff Codex 2026-06-03: TASK-037 va a `REVIEW` con foundation minima server-side e decisione prodotto registrata. Login staff manager web completo resta task futuro perche richiede schema/permessi staff web, cookie HTTP-only, rate limit/lockout e audit login/logout.
- Review finale Codex 2026-06-03: hard review sul modello TASK-037 e security diff scan locale in `/tmp/codex-security-scans/merchandise-control-admin-web/ea1f0b8_20260604_task037_final/`, no findings reportable dopo fix. Corretto il guardrail staff web per non accettare `admin` come ruolo corrente quando lo schema verifica solo `manager`; `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` resta target/follow-up. Rimossi helper autorizzativi staff web non integrati e rafforzati foundation test/security scanner contro il pattern permissivo `manager/admin`. Check finali freschi passano: `security:scan`, `test:foundation` (`167/167`), `typecheck`, `lint`, `build`, `verify`, `test:shop-admin-auth-smoke`, `git diff --check`, `git status` e `git diff --cached --name-status`; solo warning noto `[DEP0205]`, smoke autenticato `PASS_WITH_SKIP` su ambiente non locale/sicuro, `dev:db:check` fail-closed su `.env.local` cloud/mismatch container. In quella fase TASK-037 restava `REVIEW` e passava a `DONE`; Codex non marcava `DONE` senza conferma utente.
- Chiusura 2026-06-03: conferma esplicita utente ricevuta per marcare TASK-037 `DONE`, commit e push su `main`. Le note residue restano vincolanti: login staff web completo non implementato, schema staff corrente solo `cashier`/`manager`/`viewer`, `admin` e `shop_admin.full_access` sono follow-up, nessuna migration TASK-037, Sales Sync resta `DEFERRED`, nessuna modifica Win7POS/Android/iOS e nessuna dichiarazione production-ready globale.

### TASK-038 - POS manager web login, Platform provisioning, role permission tree, and real revenue dashboard gate

- Stato: `DONE`
- File task: `docs/TASKS/TASK-038-pos-manager-web-login-platform-provisioning-permissions-revenue-gate.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-038/README.md`
- Fase: `DONE`
- Responsabile: `CODEX`
- Branch previsto: Admin Web su `main`
- Verdict corrente: `DONE`
- Scopo: implementare o bloccare in modo repo-grounded il login web staff POS manager, il provisioning Platform, un permission tree shop-scoped e il gate dashboard incassi senza fake data.
- Prerequisito: TASK-037 verificato `DONE`, committato e pushato in `0b54d09`.
- Decisioni iniziali:
  - `pos_staff_manager` resta single-shop e separato da `profiles`;
  - `pos_sessions` non viene riusata come browser staff web session perche e device-bound;
  - staff ordinario/cashier/operator/viewer resta escluso dalla Shop Admin web;
  - dashboard incassi resta bloccata se non esistono tabelle vendite reali;
  - Sales Sync non viene aperto.
- Discovery iniziale:
  - presenti `staff_accounts`, `staff_accounts_safe`, `credential_status`, `pos_sessions`, `shop_devices`, `pos_device_credentials`, `audit_logs`, `sync_events`;
  - mancanti staff web session table e storage verificato per `shop_admin.full_access` nella baseline; TASK-038 li introduce con migration additiva;
  - `staff_accounts.role_key` corrente supporta `cashier`, `manager`, `viewer`;
  - `admin` role staff e tabelle vendite/incassi reali non trovati staticamente.
- Note runtime: `npm run dev:db:check` fallisce chiuso su `.env.local` cloud e container locale mismatch; nessun uso Supabase production.
- Implementation TASK-038:
  - migration additiva `20260604035308_task_038_pos_manager_web_login.sql` creata per `staff_web_sessions`, `staff_web_login_attempts` e `staff_role_permissions`;
  - migration applicata su Supabase locale non-production e typegen reale rigenerato da DB locale;
  - runtime staff manager web server-only creato con cookie HTTP-only, token hash, credential verify, lockout, audit login/logout e logout route;
  - route login staff manager web creata in route group `/shop/staff-login`, senza service role lato browser e senza storage client;
  - shell `/shop` ora usa principal espliciti `personal_account` e `pos_staff_manager`, mantenendo personal account multi-shop e staff single-shop;
  - read model Shop Admin principali passano da `resolveShopAdminDataAccess`, con account personale SSR/RLS e staff manager admin-client server-only filtrato per shop;
  - Platform provisioning staff manager web implementato server-side con insert `staff_accounts`, upsert `staff_role_permissions`, credential one-time e audit redatto;
  - action context Shop Admin blocca `pos_staff_manager` sui mutator esistenti per non riusare RPC personali basati su `auth.uid()`;
  - permission tree server-side creato con `shop_admin.full_access`;
  - revenue dashboard resta bloccata con `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`; Revenue dashboard requires real sales sync data.
- Gap residui TASK-038:
  - mutazioni Shop Admin staff web non implementate; restano follow-up dedicato o boundary read-only intenzionale;
  - `npm run test:shop-admin-auth-smoke` usa sessione staff sintetica per evitare audit append-only nel dataset `TASK035_*`; submit login/logout reale verificato separatamente con manual smoke locale `TASK038_*`, logout revocato e cleanup zero;
  - `admin` staff role non introdotto; schema corrente resta `cashier`/`manager`/`viewer`;
  - nessun Sales Sync, nessun dashboard vendite fake, nessuna modifica Win7POS/Android/iOS.
- Check TASK-038:
  - `security:scan` PASS;
  - `test:foundation` PASS `173/173`;
  - `typecheck` PASS;
  - `lint` PASS;
  - `build` PASS con warning noto `[DEP0205]`;
  - `verify` PASS con warning noto `[DEP0205]`;
  - `test:shop-admin-auth-smoke` PASS locale non-production (`3 passed`, include staff manager web session e cashier denial).
- Review finale 2026-06-04: corretti audit failure staff web troppo informativi (`shop_resolved`/`staff_resolved` rimossi), pending state/copy one-time nel Platform provisioning panel e documentazione allineata al manual smoke reale `/shop/staff-login` + `/shop/staff-logout` con manager success, logout revocato, cashier/viewer denied, wrong credential generic e cleanup zero. Verdict aggiornato a `DONE_READY`.
- Finalizzazione 2026-06-04: conferma esplicita utente ricevuta, TASK-038 marcato `DONE`; commit/push richiesti nella finalizzazione. Non include Supabase production, Vercel Production, Sales Sync, dashboard vendite fake, Win7POS/Android/iOS/Cash Register changes, email invite, social login o fusione `profiles`/`staff_accounts`.

### TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation

- Stato: `DONE`
- File task: `docs/TASKS/TASK-039-staff-aware-shop-admin-completion.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-039/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED`
- Branch previsto: Admin Web su `main`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Scopo: completare il follow-up staff-aware di TASK-038 senza inventare schema, dati vendite, staging o Win7POS E2E non verificati.
- Audit iniziale 2026-06-04:
  - Next.js App Router `src/app` con Next `16.2.6`;
  - `/shop` usa due principal: `personal_account` via Supabase Auth/`shop_members` e `pos_staff_manager` via `staff_web_sessions`;
  - read model Shop Admin principali passano da `resolveShopAdminDataAccess`;
  - baseline iniziale: mutazioni Shop Admin personal-account-only perche `resolveShopActionContext` bloccava `pos_staff_manager`;
  - RPC catalogo, staff, device, member e import/export correnti dipendono da `auth.uid()` e membership `shop_members`;
  - baseline iniziale: `audit_logs` esponeva solo `actor_profile_id`, senza `actor_staff_id`;
  - baseline iniziale: `staff_role_permissions` e `SHOP_STAFF_WEB_PERMISSION_TREE` esistevano con `shop_admin.full_access` e permessi granulari, ma enforcement mutativo e UI template non erano completi;
  - baseline iniziale: lifecycle staff POS aveva create/reset/suspend/reactivate/archive/force rotation/clear lockout, ma non revoke web access/sessioni o permission edit;
  - baseline iniziale: `/shop/settings` era read-only; nessuna settings mutation auditata trovata;
  - baseline iniziale: account personale aveva login/logout ma non pagina profilo/cambio password sicuro;
  - staging stabile resta bloccato da `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`; Cloudflared resta solo HTTPS effimero/non-production;
  - Win7POS locale e disponibile ma con modifiche preesistenti non toccate; live E2E resta `PARKED_E2E_PENDING`;
  - Win7POS ha schema vendite locale reale (`sales`, `sale_lines`), ma Admin Web non ha schema/API Sales Sync, quindi `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` resta valido.
- Execution 2026-06-04:
  - migration `20260604120000_task_039_staff_aware_shop_admin.sql` aggiunge `audit_logs.actor_staff_id`, helper audit staff e campi `web_access_revoked_*`;
  - `src/server/shop-admin/action-context.ts` abilita `pos_staff_manager` alle mutazioni autorizzate con `canStaffWebPerformShopAdminAction`;
  - `src/server/shop-admin/staff-aware-mutations.ts` implementa staff-aware mutation foundation server-only per catalogo, staff lifecycle, dispositivi, session revoke e role permissions;
  - `personal_account` conserva le RPC storiche basate su `auth.uid()`/`shop_members` dove esistono e usa un path server-only auditato per i nuovi controlli web staff;
  - `pos_staff_manager` usa admin client solo server-side, shop-scoped dalla sessione staff, con audit `actor_staff_id`;
  - `SHOP_STAFF_WEB_ROLE_TEMPLATES` e permission enforcement granulare coprono catalog, staff, devices, settings, import/export, dashboard/read e sync/read;
  - `/shop/staff` espone revoke web access, revoke sessions e permission template/editing;
  - `/shop/settings` espone update shop name auditato con reason e conferma;
  - `/account/profile` espone session status e password reset email tramite Supabase Auth, senza flusso finto;
  - nessun runtime Sales Sync, route `src/app/api/pos/sales` o dashboard vendite fake introdotti.
- Review/fix 2026-06-04:
  - corretto privilege-escalation risk sui template `staff_role_permissions`: staff actor senza `shop_admin.full_access` non puo applicare permessi ruolo e riceve audit `unauthorized`;
  - sostituito il vecchio replace delete-all/insert dei permessi ruolo con delete mirato dei permessi stale e `upsert` su `shop_id,role_key,permission_key`;
  - irrigidita eligibility staff web: solo permessi riconosciuti dalla registry centrale contano come accesso web;
  - aggiunti preflight UI server-side su catalogo, staff, role permissions, devices, members, import/export e settings per non mostrare pannelli action se il server negherebbe la mutazione;
  - import/export separa render di `catalog.import` e `catalog.export`;
  - reset password profilo non usa piu una `redirectTo` relativa e resta nel flusso configurato di Supabase Auth;
  - review/fix finale da TASK-040 ha corretto `settings-mutations.ts`: il path personal account fallisce esplicitamente se la admin env non e configurata e l'audit settings usa lo stesso admin client server-side dell'update, evitando update riuscito senza audit sotto RLS;
  - test TASK-039 e scanner sicurezza aggiornati per bloccare regressioni su questi guardrail.
- Scope closure 2026-06-04:
  - code scope TASK-039 arriva a `DONE`, non `DONE`;
  - staging stabile resta `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION` ma viene separato in `TASK-043`;
  - Win7POS live E2E resta `PARKED_E2E_PENDING` ma viene separato in `TASK-044`;
  - Sales Sync foundation resta `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` / `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA` ma viene separato in `TASK-045`;
  - Supabase local/apply validation resta `BLOCKED_LOCAL_SUPABASE_ENV` nel runtime corrente e viene separato in `TASK-046`;
  - questi task futuri non sono dichiarati `PASS` e non bloccano il DONE del code scope TASK-039 perche non sono runtime introdotti o modificati da TASK-039.
- Chiusura formale 2026-06-04:
  - conferma esplicita utente ricevuta nell'allegato `TASK-040`: se i check freschi confermano lo stato gia documentato, TASK-039 puo essere marcato `DONE` per il suo code scope;
  - check freschi eseguiti da Codex nello stesso pass: `git diff --check`, test mirato TASK-039, `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`;
  - risultati freschi: test mirato `4/4`, foundation `179/179`, build/verify exit 0 con solo warning noto `[DEP0205]`;
  - TASK-039 marcato `DONE` / `DONE_RECONCILED` per il solo code scope;
  - i follow-up ex `TASK-043`, ex `TASK-044`, ex `TASK-045` ed ex `TASK-046` non restano task attivi separati: sono `FOLDED_INTO_TASK-040`;
  - no commit eseguito, no push, no stage finale.
- Check closure finali 2026-06-04:
  - `node --test tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` PASS `4/4`;
  - `npm run security:scan` PASS;
  - `npm run typecheck` PASS;
  - `npm run lint` PASS;
  - `npm run test:foundation` PASS `179/179`;
  - `npm run build` PASS con warning noto `[DEP0205]`;
  - `npm run verify` PASS con warning noto `[DEP0205]`;
  - `npm run test:shop-admin-auth-smoke` PASS_WITH_SKIPS (`1 passed`, `2 skipped`);
  - Browser in-app locale su `http://127.0.0.1:3040` PASS su `/account/profile`, `/shop/staff-login` e `/shop/settings`: render/gate corretti, console error `0`, screenshot evidence `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/artifacts/browser/staff-login.png`;
  - `npm run dev:db:status` resta `BLOCKED_LOCAL_SUPABASE_ENV` per `.env.local` cloud, service-role assente, container mismatch e `supabase status` non completato;
  - `git diff --check` PASS e `git diff --cached --name-status` vuoto.
- Fasi correnti:
  - Fase 0 audit: `PASS`;
  - Fase 1 staff-aware mutations: `PASS_DONE`;
  - Fase 2 permission tree granulare: `PASS_DONE`;
  - Fase 3 lifecycle: `PASS_DONE_WITH_NOTE`;
  - Fase 4 account/profile UX: `PASS_DONE`;
  - Fase 5 staging stabile: `SPLIT_TO_TASK-043_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 6 Win7POS live E2E: `SPLIT_TO_TASK-044_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 7 Sales Sync foundation: `SPLIT_TO_TASK-045_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 8 UI/UX cleanup: `PASS_DONE`;
  - Fase 9 test/security: `PASS_DONE`.
- Conferme negative: no commit eseguito, no push, no stage intenzionale, nessun deploy reale, nessuna modifica Win7POS, nessun Sales Sync runtime, nessuna dashboard vendite fake, nessun secret hardcoded.

### Roadmap futura separata da TASK-039

- `TASK-043 - Staging stabile non-production`: `FOLDED_INTO_TASK-040`; ex TASK-043; scope Vercel/non-production HTTPS stabile; blocker corrente `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`.
- `TASK-044 - Win7POS live E2E`: `FOLDED_INTO_TASK-040`; ex TASK-044; scope ambiente Windows/WPF, dataset sintetico live, run Win7POS, cleanup e evidence; blocker corrente `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`.
- `TASK-045 - Sales Sync foundation`: `FOLDED_INTO_TASK-040`; ex TASK-045; scope schema/API/idempotency/dashboard incassi reale solo con dati reali o sintetici controllati; blocker corrente `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` / `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.
- `TASK-046 - Supabase environment/apply validation`: `FOLDED_INTO_TASK-040`; ex TASK-046; scope ambiente Supabase locale coerente, migration apply non-production autorizzato e typegen da DB; blocker corrente `BLOCKED_LOCAL_SUPABASE_ENV` / `BLOCKED_SUPABASE_CONTAINER_MISMATCH`.

### TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation

- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- File task: `docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-040/README.md`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile: `REVIEWER`
- Sostituzione tracking: `SUPERSEDED_BY_TASK-041`
- Decisione TASK-041: `TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS`
- Branch previsto: Admin Web su `main`
- Milestone interna corrente: `PARTIAL_PASS_WITH_BLOCKERS`
- Verdict corrente: `PARTIAL_PASS_WITH_BLOCKERS`
- Scopo: assorbire in un unico task i follow-up runtime lasciati da TASK-039 e i gap storici collegati a `TASK-029`, `TASK-031`, `TASK-032`, `TASK-033` e `TASK-022_023`.
- Assorbimenti formali:
  - ex `TASK-046`: Supabase local/apply validation -> `FOLDED_INTO_TASK-040`;
  - ex `TASK-043`: staging stabile non-production -> `FOLDED_INTO_TASK-040`;
  - ex `TASK-044`: Win7POS live E2E -> `FOLDED_INTO_TASK-040`;
  - ex `TASK-045`: Sales Sync reale POS -> Admin Web -> `FOLDED_INTO_TASK-040`.
- Baseline Admin Web 2026-06-04:
  - `git status --short --branch --untracked-files=all`: branch `main...origin/main`, dirty/untracked TASK-039 gia presente, nessun file staged;
  - `git diff --check`: PASS;
  - no commit eseguito, no push, no stage finale.
- Supabase local/non-production 2026-06-04:
  - `.env.local` classificato `supabase_cloud`, con `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` presenti redatti, `SUPABASE_PROJECT_REF` e `SUPABASE_SERVICE_ROLE_KEY` assenti;
  - `supabase --version` PASS con `2.104.0` dopo rerun con telemetry disabilitata;
  - `npm run dev:db:status` exit `2`: `BLOCKED_LOCAL_SUPABASE_ENV`, `.env.local` cloud, service-role assente e container mismatch;
  - TASK-041 final review/fix ha allineato `supabase/config.toml` allo stack locale `MerchandiseControlSupabase`; `supabase status`, local dry-run, lint e typegen locale verso `/tmp` passano dal repo, quindi `BLOCKED_SUPABASE_CONTAINER_MISMATCH` e rimosso per TASK-041; nello stesso passaggio `scripts/dev-supabase-check.mjs` e stato rafforzato per redigere l'output tabellare Supabase CLI;
  - `supabase migration list --local` mostra `20260604120000` local presente e remote/history vuota: `MIGRATION_PENDING_NOT_APPLIED`;
  - `supabase db lint --local --schema public,app_private --fail-on error` PASS con `No schema errors found`;
  - migration TASK-039 e additiva (`actor_staff_id`, `web_access_revoked_*`, view `staff_accounts_safe`, function audit staff);
  - apply status: `APPLY_NOT_RUN_BLOCKED_ENV_MISMATCH`;
  - types status: `src/lib/supabase/database.types.ts` contiene `actor_staff_id`, `web_access_revoked_*` e `write_staff_shop_admin_audit`, ma typegen live post-apply non eseguito.
- Staging stabile non-production 2026-06-04:
  - `vercel --version`: `Vercel CLI 54.7.1`;
  - `vercel whoami`: account verificato;
  - `.vercel/project.json` presente per project `merchandise-control-admin-web`, framework `nextjs`, Node Vercel `24.x`;
  - `vercel.json` mantiene `git.deploymentEnabled=false`;
  - `vercel ls --scope xniw97-9857s-projects`: `No deployments found`;
  - `vercel alias ls --scope xniw97-9857s-projects`: nessun alias;
  - nessun deploy eseguito perche i percorsi storici generano `Production`;
  - staging status: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`.
- Review/fix finale TASK-040 2026-06-04:
  - problemi repo-controllabili trovati e corretti in `src/server/shop-admin/settings-mutations.ts`: guard esplicito `adminConfig.status !== "configured"` e audit settings scritto tramite admin client server-side;
  - test/scanner aggiornati in `tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs` e `scripts/security-checks.mjs`;
  - check freschi Admin Web: test mirato TASK-039 `4/4`, `security:scan` PASS, `test:foundation` PASS `179/179`, `typecheck` PASS, `lint` PASS, `build` PASS con warning `[DEP0205]`, `verify` PASS con warning `[DEP0205]`, `test:shop-admin-auth-smoke` PASS_WITH_SKIPS (`1 passed`, `2 skipped`);
  - Browser in-app locale: `/account/profile`, `/shop/staff-login` e `/shop/settings` render/gate PASS, console error `0`;
  - iOS/Android: nessun progetto mobile trovato nello workspace con discovery locale read-only; status `NOT_PRESENT_IN_CURRENT_WORKSPACE`;
  - Codex Security diff scan locale completato in `/tmp/codex-security-scans/merchandise-control-admin-web/localpatch_20260604145545/report.md` e `.html`, nessun finding reportable aperto dopo fix;
  - verdict TASK-040 invariato: `PARTIAL_PASS_WITH_BLOCKERS`, perche Supabase apply, staging stabile, Win7POS live E2E e Sales Sync reale restano bloccati.
- CI fix 2026-06-04:
  - `npm run security:scan` e i foundation guardrail non falliscono piu in GitHub Actions solo per assenza del repo sibling assoluto `/Users/minxiang/Projects/Win7POS`;
  - `WIN7POS_REPO_PATH` puo puntare a un checkout Win7POS alternativo;
  - `REQUIRE_WIN7POS_REPO=1` rende di nuovo il repo Win7POS obbligatorio e fallisce se manca;
  - default CI Admin Web: `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` per i controlli esterni, con scanner ancora `PASS` per lo scope self-contained;
  - follow-up CI fix: i foundation test Win7POS diretti di TASK-027, TASK-028, TASK-029 e TASK-032 rispettano `WIN7POS_REPO_PATH`, fanno `skipped` quando il repo esterno non e disponibile e tornano a fallire se `REQUIRE_WIN7POS_REPO=1`;
  - check CI-like: `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture npm run test:foundation` PASS_WITH_SKIPS (`tests 180`, `pass 176`, `skipped 4`, `fail 0`);
  - check finali locali: `security:scan` PASS, `test:foundation` PASS (`180/180`), `verify` PASS con warning noto `[DEP0205]`, `git diff --check` PASS.
- Win7POS live E2E 2026-06-04:
  - repo `/Users/minxiang/Projects/Win7POS` trovato;
  - baseline `git status --short --branch`: `main...origin/main`, dirty preesistente `.gitignore`, `docs/dev/`, `scripts/win7pos/`;
  - `git diff --check`: PASS;
  - scanner `check-dialog-standards.ps1`, `check-pos-online-bootstrap.ps1`, `check-pos-online-client.ps1`, `check-pos-catalog-pull.ps1`: ALL PASS;
  - `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86`: PASS, `Win7POS.Wpf -> .../net48/Win7POS.Wpf.exe`, `Avvisi: 0`, `Errori: 0`;
  - host corrente `Darwin ... arm64`, `wine`, `mono` e `qemu-system-x86_64` non disponibili;
  - live E2E status: `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`.
- Sales Sync reale POS -> Admin Web 2026-06-04:
  - Admin Web `src/app/api/pos/sales`: `NOT_FOUND`;
  - nessuna migration runtime `pos_sales` / `pos_sale_lines` presente;
  - Win7POS contiene modello vendite locale reale (`sales`, `sale_lines`, `Sale`, `SaleLine`, `SaleKind`, `SaleRepository`, refund/void);
  - foundation non implementata perche mancano apply Supabase coerente, staging stabile e live E2E Win7POS;
  - Sales Sync: `BLOCKED_NO_ADMIN_WEB_SALES_SCHEMA` / `REVENUE_DASHBOARD_BLOCKED_NO_REAL_SALES_DATA`.
- Riconciliazione gap:
  - `TASK-029`: ancora blocked da staging non-production e smoke/E2E staging mancanti;
  - `TASK-031`: ancora blocked da Vercel che forza Production;
  - `TASK-032`: fase HTTPS non-production stabile e riconciliazione live ancora blocked;
  - `TASK-033`: resta `REVIEW_WITH_BLOCKERS` per Win7POS runtime/live E2E;
  - `TASK-022_023`: resta `PARKED_E2E_PENDING`;
  - nessun task storico marcato `DONE` da TASK-040.

### TASK-041 - Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E

- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- File task: `docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-041/README.md`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile: `REVIEWER`
- Branch previsto: `codex/task-041-runtime-completion`
- Milestone interna corrente: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Verdict corrente: `PASS_WITH_NOTES_DONE_ADMIN_WEB_RUNTIME_ONLY`
- Scopo: sostituire il tracking attivo di `TASK-040` con un task runtime completion piu stretto, sbloccando i gate runtime sicuri senza dichiarare `TASK-040 DONE` se restano blocker esterni.
- Decisione TASK-040:
  - `TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS`;
  - `TASK-040_SUPERSEDED_BY_TASK-041`;
  - `SUPERSEDED_BY_TASK-041`.
- Governance 2026-06-04:
  - branch `codex/task-041-runtime-completion` creato;
  - task/evidence TASK-041 creati;
  - `docs/MASTER-PLAN.md` aggiornato per avere un solo task attivo;
  - `scripts/security-checks.mjs` e foundation test aggiornati per bloccare regressioni sul tracking TASK-041;
  - `scripts/dev-supabase-check.mjs` aggiornato con mode redatti `local`, `ci`, `cloud`, `staging`, `production` e fail-closed su production.
- Supabase runtime gate:
  - status: `PASS_SUPABASE_DEV_APPLIED` / `PASS_WITH_NOTES_LOCAL_CLI_CONTAINER_MISMATCH`;
  - migration TASK-039 verificata/applicata: `supabase/migrations/20260604120000_task_039_staff_aware_shop_admin.sql`;
  - migration TASK-041 Sales Sync foundation creata/applicata: `supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql`;
  - local e linked dev non-production allineati fino a `20260604214112`;
  - lint local/linked `public,app_private`: `PASS`, `No schema errors found`;
  - linked schema dump redatto: tabelle Sales Sync, RLS forced, grants, unique constraints e indici confermati;
  - typegen refresh da linked dev: `PASS`, `src/lib/supabase/database.types.ts` aggiornato;
  - production apply: `NOT_RUN_PRODUCTION_FORBIDDEN`;
  - nota residua: `supabase status` e local typegen restano limitati dal mismatch nomi container/progetto storico.
- Cloudflare/OpenNext gate:
  - status: `PASS_CLOUDFLARE_OPENNEXT_PREVIEW`;
  - introdotti `@opennextjs/cloudflare`, `wrangler`, `open-next.config.ts`, `wrangler.jsonc`, script `cf:build` e `cf:preview`;
  - `src/proxy.ts` rimosso e sostituito da `src/middleware.ts` per compatibilita OpenNext Cloudflare, con deprecation note Next 16 documentata;
  - local preview `127.0.0.1:8788` smoke: `/` HTTP 200, `/shop` HTTP 200 auth guard, GET `/api/pos/sales/sync` HTTP 405 atteso;
  - production deploy: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Sales Sync gate:
  - status: `PASS_SALES_SYNC_FOUNDATION`;
  - schema v1 creato con `pos_sales_sync_batches`, `pos_sales`, `pos_sale_lines`;
  - RLS forced, grants revocati da `public`/`anon`/`authenticated`, service-role server-side;
  - idempotency DB-level, duplicate/conflict handling, body bounded e audit `metadata_redacted`;
  - route `POST /api/pos/sales/sync` implementata con `runtime = "nodejs"` e auth POS esistente;
  - review/fix finale: duplicate intra-payload, line total mismatch, sale total mismatch, business date invalida, parsing numerico fragile, control chars e cleanup best-effort post batch corretti;
  - dashboard vendite fake: `NOT_CREATED_FORBIDDEN`;
  - Win7POS live sale sync: `NOT_RUN_WIN7_RUNTIME_NOT_AVAILABLE`.
- Win7POS E2E gate:
  - nuovi artefatti TASK-041 usano `WIN7POS_REPO_PATH`;
  - nei nuovi file TASK-041 non vengono salvati path hardcoded locali;
  - host check: `dotnet 10.0.300`, `pwsh 7.6.2`, `Darwin arm64`;
  - manual Windows 7 live run: `NOT_RUN_MANUAL_ENV_NOT_AVAILABLE`;
  - sync Admin Web verification: `NOT_RUN_WIN7_RUNTIME_NOT_AVAILABLE`;
  - status: `PASS_WITH_MANUAL_WIN7_STEPS`.
- Condizioni REVIEW:
  - tutti i gate hanno evidence o blocker motivato;
  - check finali freschi PASS/PASS_WITH_WARNINGS: `security:scan`, `test:foundation`, `typecheck`, `lint`, `build`, `verify`, `cf:build`, `git diff --check`;
  - no secret, no production deploy, no production apply, no dashboard vendite finta.
- Condizioni DONE:
  - solo dopo review approvata e conferma esplicita utente;
  - non ammesso da Codex e non ammesso se restano blocker critici su Win7POS live/manual E2E o production/staging non autorizzati.

### TASK-042 - TASK-041 Review, CI retry and Win7POS physical E2E bridge

- Stato: `READY_FOR_WIN7_MANUAL_TEST`
- File task: `docs/TASKS/TASK-042-task-041-review-ci-retry-win7pos-physical-e2e-bridge.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-042/README.md`
- Fase: `REVIEW`
- Responsabile: `REVIEWER`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `READY_FOR_WIN7_MANUAL_TEST`
- Verdict corrente: `READY_FOR_WIN7_MANUAL_TEST`
- Scopo: chiudere la review pratica di `TASK-041` verificando CI GitHub Actions, fix `WIN7POS_REPO_PATH`, build Win7POS WPF Release x86 e preparazione del bridge fisico Windows 7 tramite cartella condivisa.
- Decisioni di tracking:
  - `TASK-041_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS`;
  - `TASK-040_REMAINS_REVIEW_WITH_EXTERNAL_BLOCKERS_SUPERSEDED_BY_TASK-041`;
  - `TASK-042_IS_ACTIVE_REVIEW_BRIDGE`;
  - `CI_GITHUB_ACTIONS_GREEN`;
  - `WIN7POS_PHYSICAL_PACKAGE_READY`;
  - `WIN7POS_GITHUB_RELEASE_PACK_READY`.
- CI GitHub Actions:
  - ultimo run `26983953492` su `main`, commit `6d958c64ef016c634740eab66a496af75d95746c`, conclusion `success`;
  - job `Verify` verde per security scan, foundation tests, typecheck, lint, build, UI smoke e diff whitespace check;
  - errore storico `Win7POS repo is missing at /Users/minxiang/Projects/Win7POS` confermato nel run `26974280617` e superato dai run successivi;
  - simulazioni locali `WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture` passano con `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE`, mentre `REQUIRE_WIN7POS_REPO=1` fallisce come atteso.
- Win7POS:
  - `WIN7POS_REPO_PATH` non era impostato ma il repo e stato rilevato localmente in `/Users/minxiang/Projects/Win7POS`;
  - baseline Win7POS: branch `main`, dirty preesistente su `.gitignore`, `docs/dev/`, `scripts/win7pos/`;
  - `git diff --check`: `PASS`;
  - scanner `check-dialog-standards.ps1`, `check-pos-online-bootstrap.ps1`, `check-pos-online-client.ps1`, `check-pos-catalog-pull.ps1`: `PASS`;
  - `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86`: `PASS`, `Avvisi: 0`, `Errori: 0`;
  - output Release/x86: `/Users/minxiang/Projects/Win7POS/src/Win7POS.Wpf/bin/x86/Release/net48/Win7POS.Wpf.exe`.
- Win7POSBridge:
  - `WIN7POS_BRIDGE_ROOT` non era impostato ma la bridge e stata rilevata localmente in `/Users/minxiang/Projects/Win7POSBridge`;
  - sottocartelle `outbox`, `inbox`, `logs`, `screenshots`, `done`, `failed`, `drop` verificate/create;
  - pacchetto copiato in `Win7POSBridge/outbox/TASK-042-win7pos-physical-e2e-20260604-190038`;
  - cartella `app/` contiene l'intero output Release/x86/net48, non solo `Win7POS.Wpf.exe`;
  - creati `manifest.json`, `checksums/SHA256SUMS.txt`, `checksums/APP-FILES.txt`, `checksums/ZIP-SHA256SUM.txt`, zip e documenti manuali;
  - zip `TASK-042-win7pos-physical-e2e-20260604-190038.zip`: `zip -T` OK, SHA-256 `4175ca9e18a422bb696b323812d64a55b78a2a58f8e47545d6a55a4a1600944b`.
- TASK-042B build parity diagnosis:
  - esito reale Windows 7 sul pacchetto Codex locale: doppio click su `Win7POS.Wpf.exe` non apre UI visibile;
  - esito reale Windows 7 sul package GitHub manuale `/Users/minxiang/Downloads/Win7POS_20260602_0242`: UI visibile e login operatore aperto;
  - report generati in `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare/` e `docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-parity-diagnosis.md`;
  - Bad/Codex: `38` file, `13,831,941` byte; Good/GitHub: `96` file, `95,369,218` byte;
  - missing from Codex: `58`; extra in Codex: `0`; same relative path, different SHA-256: `7`;
  - root cause package: TASK-042 ha copiato raw output locale `dotnet build` invece del Release Pack GitHub; il Bad manca `e_sqlite3.dll`, `cli/`, `VERSION.txt`, `README_RUN.txt`, `RELEASE_CHECKLIST.txt`;
  - commit Win7POS uguale tra Bad e Good: `5e35a37af7cd4ca7b39edf9fb9f9eb5cdcb5dcc1`; toolchain diversa: locale macOS `dotnet 10.0.300`, GitHub `windows-latest` con `dotnet 8.0.x`;
  - script aggiunti: `scripts/win7pos/compare-build-folders.sh` e `scripts/win7pos/fetch-github-release-pack-to-bridge.sh`;
  - diagnostica Windows 7 creata in `Win7POSBridge/outbox/TASK-042-build-compare-diagnostics/`;
  - nuovo package corretto creato da artifact GitHub `Win7POS-ReleasePack-x86`, run `26795001032`: `Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656`;
  - nuovo package verificato contro Good manuale: `96` file vs `96`, `95,369,218` byte vs `95,369,218`, `0` missing, `0` extra, `0` hash differenti;
  - check finali TASK-042B: `npm run security:scan` PASS, `npm run test:foundation` PASS (`tests 184`, `pass 184`, `fail 0`), `git diff --check` PASS con output vuoto;
  - verifica puntuale package: `Win7POS.Wpf.exe`, `e_sqlite3.dll`, `README_RUN.txt` e `VERSION.txt` presenti in `Win7POSBridge/outbox/TASK-042B-github-release-pack-20260604-223656/app`;
  - prossimo test fisico deve usare il nuovo package GitHub Release Pack, non il vecchio raw package TASK-042.
- TASK-042C manual Win7 sync e Product dialog UX:
  - package provato su Windows 7: `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`;
  - risultati locali utente: `PASS_LAUNCHES_ON_WIN7`, `PASS_LOCAL_OPERATOR_LOGIN`, `PASS_MENU_UI`, `PASS_LOCAL_CART_BASIC`, `PASS_LOCAL_PRODUCT_CREATE`, `PASS_LOCAL_DISCOUNT`, `PASS_LOCAL_QTY_EDIT`, `PASS_LOCAL_PAYMENT_SCREEN_OPEN`, `PASS_LOCAL_REGISTER_OPEN`;
  - nessun crash osservato nello smoke locale Windows 7;
  - Admin Web manual test, POS online connection/catalog pull e Sales Sync live restano `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`, `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`, `NOT_RUN_SALES_SYNC_LIVE_PENDING`;
  - fix Win7POS implementato in `ProductEditDialog`, `ProductEditViewModel` e `ProductRepository`: `Fornitore`/`Categoria` editabili, input libero, dedup trim/case-insensitive e create/update atomico supplier/category + prodotto;
  - scanner Win7POS dedicato: `scripts/check-product-dialog-free-text.ps1`;
  - runbook Admin Web creato in `docs/TASKS/EVIDENCE/TASK-042/ADMIN-WEB-MANUAL-TEST-RUNBOOK.md`;
  - check finali TASK-042C: Admin Web `security:scan` PASS, `test:foundation` PASS (`tests 184`, `pass 184`, `fail 0`), `git diff --check` PASS; Win7POS scanner nuovo/dialog/bootstrap/client/catalog PASS, build WPF Release x86 PASS (`Avvisi: 0`, `Errori: 0`), `git diff --check` PASS;
  - verifica package `TASK-042B`: `Win7POS.Wpf.exe`, `e_sqlite3.dll`, `README_RUN.txt`, `VERSION.txt` presenti in `Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app`, `96` file, `91M`, manifest `containsESqlite3Dll=true`, `containsSecrets=false`;
  - il fix UX non e nel package storico `TASK-042B`; per retest fisico serve un nuovo GitHub Release Pack dopo commit/push autorizzati, stato `PHYSICAL_TEST_REQUIRES_GITHUB_RELEASE_ARTIFACT_AFTER_COMMIT`;
  - verdict TASK-042C: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES` e `WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST`.
- TASK-042C Admin Web runtime prep 2026-06-05:
  - target locale/non-production preparato per master Platform Console;
  - account test `platform_admin` sintetico creato/ruotato in Supabase Auth locale, credential condivisa solo in chat runtime e non salvata in repository;
  - `.env.local` non modificato e ancora fail-closed su `supabase_cloud`; runtime manuale avviato con env process-only;
  - Admin Web locale e accesso remoto temporaneo verificati con doppio tunnel Cloudflare non-production per Admin Web e Supabase locale;
  - hardening login: `AuthForm` usa `method="post"` e regression foundation copre il form;
  - Playwright login locale e tunnel: `PASS`, redirect `/platform`;
  - stati residui invariati: Admin Web manual smoke utente, POS online connection/catalog pull e Sales Sync live restano `NOT_RUN`.
- Documenti manuali creati nel pacchetto:
  - `RUNBOOK-WIN7POS-PHYSICAL-SMOKE.md`;
  - `EXPECTED-RESULTS.md`;
  - `MANUAL-RESULT-TEMPLATE.md`;
  - `TROUBLESHOOTING-WIN7.md`.
- Stati non completati:
  - Admin Web manual test: `NOT_RUN_ADMIN_WEB_MANUAL_TEST_PENDING`;
  - POS online connection/login: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`;
  - heartbeat reale online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`;
  - catalog pull online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`;
  - vendita sintetica Win7POS online: `NOT_RUN_POS_ONLINE_CONNECTION_PENDING`;
  - Sales Sync live Win7POS -> Admin Web -> Supabase: `NOT_RUN_SALES_SYNC_LIVE_PENDING`.
- Condizioni REVIEW:
  - evidence `TASK-042` aggiornata;
  - pacchetto bridge pronto;
  - prossimo passo manuale chiaro per Windows 7.
- Condizioni DONE:
  - non dichiarabile da Codex in `TASK-042`;
  - richiede CI confermata, run Windows 7 fisico/VM equivalente, login/heartbeat/catalog pull se disponibili, Sales Sync live verificato e conferma esplicita utente.

### TASK-043 - Platform Admin runtime fixes

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-043-platform-admin-runtime-fixes.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-043/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `REVIEWER`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `PLATFORM_ADMIN_RUNTIME_DONE_RECONCILED`
- Verdict corrente: `AUTO_RECONCILED_TASK045`
- Scopo: risolvere i blocchi runtime della Master Platform Console su `/platform`, `/platform/users`, `/platform/shops`, `/platform/provisioning`, `/platform/audit` e `/platform/system`.
- Root cause confermata:
  - la sessione server `platform_admin` e la role check erano valide;
  - le query core RLS passavano;
  - `staff_accounts_safe` falliva con `42501 permission denied for table staff_accounts`;
  - quel failure opzionale veniva trattato come errore fatale e causava `Read blocked` globale.
- Fix implementati:
  - `staff_accounts_safe` convertita in `readIssues` diagnostico non fatale;
  - query core Platform Admin ancora fail-closed;
  - `staff_schema_status` espone `BLOCKED` senza bloccare overview/users/shops/audit/system/provisioning;
  - `/platform/system` e `/platform/data` mostrano la diagnostica safe staff;
  - `/platform/provisioning` usa `readModel.reason` negli stati non-ready ed elimina il messaggio generico;
  - Platform shell espone `Logout` verso `/auth/logout`;
  - query indipendenti del read model Platform eseguite in batch con `Promise.all` e limiti espliciti;
  - aggiunto `src/app/platform/loading.tsx` per feedback immediato durante navigazione App Router;
  - `AuthForm` resta `method="post"`.
- Test/harness:
  - `tests/foundation/task-043-platform-admin-runtime-fixes.test.mjs`;
  - `tests/e2e/task-043-platform-admin-runtime.spec.ts`, eseguibile solo con `CONFIRM_TASK043_PLATFORM_RUNTIME_TEST=yes` e Supabase locale process-only;
  - `tests/e2e/task-045-platform-master-console-final-review.spec.ts`, eseguibile solo con `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`.
- Check finali:
  - Playwright runtime TASK-043 con Supabase locale process-only: `PASS`, `1 passed`;
  - Playwright TASK-045 final review: `PASS`, `1 passed`;
  - `AUTO_RECONCILED_TASK045`.
- Follow-up:
  - grant/RLS completa per `staff_accounts_safe`: `FOLLOW_UP_RECOMMENDED`;
  - production deploy: `NOT_RUN_PRODUCTION_FORBIDDEN`.

### TASK-044 - Platform provisioning UX, runtime and Operations cleanup

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-044-platform-provisioning-ux-runtime-fixes.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-044/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `REVIEWER`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `PLATFORM_PROVISIONING_UX_RUNTIME_DONE_RECONCILED`
- Verdict corrente: `AUTO_RECONCILED_TASK045`
- Scopo: risolvere doppio submit, stuck rendering, errori generici, flicker sidebar e duplicazioni Operations nella Master Platform Console.
- Root cause confermata:
  - i form Provisioning create shop / pending owner invite non avevano pending state client-side;
  - `src/app/platform/loading.tsx` forzava `AppShell activeSection="overview"`;
  - Operations duplicava Provisioning e Admins;
  - POS manager provisioning collassava failure DB diversi in `db_failure`; Playwright locale ha poi confermato schema pronto per ruolo `manager` e permesso `shop_admin.full_access`, quindi la failure manuale non era riprodotta come mismatch schema/ruolo;
  - create shop / pending invite redirigevano sempre a `/platform/operations`.
- Fix implementati:
  - `PendingSubmitButton` con `useFormStatus`;
  - result banner e `returnTo=/platform/provisioning` allowlistato;
  - `PlatformSidebarNav` con `usePathname` e active state ottimistico derivato dall'origin pathname;
  - loading neutro senza Overview forzato e senza `Rendering...`;
  - Operations focalizzata su lifecycle, restore, emergency device e audit preview;
  - errori POS manager redatti e specifici: `shop_read_failed`, `staff_read_failed`, `permission_write_failed`, `staff_write_failed`, `audit_write_failed`;
  - test foundation e Playwright gated `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes`.
- Check finali:
  - `node --test tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs`: `PASS`, `tests 5`, `pass 5`, `fail 0`;
  - `npm run security:scan`: `PASS`;
  - `npm run test:foundation`: `PASS`, `tests 193`, `pass 193`, `fail 0`;
  - `npm run lint`: `PASS`;
  - `npm run typecheck`: `PASS`;
  - `npm run build`: `PASS`, warning noti Next `middleware`/`proxy` e Node `DEP0205`;
  - `npm run verify`: `PASS`;
  - `git diff --check`: `PASS`, output vuoto;
  - Playwright TASK-044 runtime: `PASS`, `2 passed`, eseguito con `CONFIRM_TASK044_PLATFORM_RUNTIME_TEST=yes`, Supabase locale process-only;
  - Playwright TASK-045 final review: `PASS`, `1 passed`, eseguito con `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`, Supabase locale process-only.
- Riconciliazione:
  - `AUTO_RECONCILED_TASK045`;
  - `TASK-044` e `DONE_RECONCILED`;
  - nessun commit, nessun push, stato finale `NOT_STAGED`;
  - Win7POS live E2E e Sales Sync live restano `NOT_RUN`.

### TASK-045 - Platform Master Console final automated review and DONE reconciliation

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-045-platform-master-console-final-review-done-reconciliation.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-045/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `REVIEWER`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `PLATFORM_MASTER_CONSOLE_AUTO_REVIEW_DONE`
- Verdict corrente: `AUTO_RECONCILED_TASK045`
- Scopo: chiudere la review automatizzata finale della Master Platform Console e riconciliare `TASK-043`/`TASK-044` a `DONE_RECONCILED` senza promuovere blocker esterni Win7POS/Sales Sync.
- Evidence:
  - `tests/e2e/task-045-platform-master-console-final-review.spec.ts`;
  - `CONFIRM_TASK045_PLATFORM_FINAL_REVIEW_TEST=yes`;
  - Playwright TASK-045: `PASS`, `1 passed`;
  - Supabase locale process-only;
  - route Platform Master Console, Provisioning, Admins, Operations, duplicate shop code, pending owner invite, POS manager web access, sidebar navigation, logout e cleanup operativa verificati.
- Cleanup:
  - staff/permissions/sessioni/mapping/invite/POS temp rows a zero;
  - shop `TASK045_*` archiviati;
  - audit append-only trattenuti per design;
  - admin temporaneo revocato e profilo disabilitato.
- Blocchi esterni preservati:
  - `TASK-041`: `REVIEW_WITH_EXTERNAL_BLOCKERS`;
  - `TASK-042`: `READY_FOR_WIN7_MANUAL_TEST`;
  - Win7POS live E2E: `NOT_RUN`;
  - Sales Sync live: `NOT_RUN`.

### TASK-046 - Test target separation: local vs staging

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-046-test-target-separation-local-vs-staging.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-046/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Scopo: separare test sempre sicuri, test automatici locali e test cloud staging/dev senza dedurre il target da `.env.local`.
- Implementato:
  - `TEST_TARGET=local|staging` nei wrapper Node;
  - `db:local:status` e `db:staging:status`;
  - `test:e2e:local`, `test:e2e:staging`, `test:platform:local`, `test:platform:staging`, `test:shop:local`, `smoke:staging`;
  - guardrail locale su Supabase `127.0.0.1:54321`/`localhost:54321`;
  - guardrail staging su URL `https://*.supabase.co`, allowlist project ref, conferme staging e ref production vietati;
  - staging Playwright senza dev server locale;
  - staging smoke read-only;
  - setup locale Platform Master Console con `platform:local:seed`, `platform:local:dev`, `platform:local:status`, `platform:local:cleanup` e runbook `docs/RUNBOOKS/platform-master-console-local-login.md`;
  - smoke locale Platform login `test:platform:local-login`, gated da `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes`.
- Evidence:
  - foundation TASK-046 red/green;
  - `npm run security:scan`: `PASS`;
  - `npm run test:foundation`: `PASS`, `tests 198`, `pass 198`, `fail 0`;
  - `npm run typecheck`: `PASS`;
  - `npm run lint`: `PASS`;
  - `npm run build`: `PASS`, warning noti Next `middleware`/`proxy` e Node `DEP0205`;
  - `npm run verify`: `PASS`;
  - `npm run test:platform:local`: `PASS`, `1 passed`;
  - `npm run db:local:status`: `FAIL_EXPECTED_FAIL_CLOSED_ENV_LOCAL_POINTS_CLOUD`, output redatto;
  - `npm run db:staging:status`: `FAIL_EXPECTED_BLOCKED_STAGING_SUPABASE_URL_REQUIRED` senza env staging esplicita;
  - staging status positivo con URL cloud e project ref allowlistato: `PASS`;
  - foundation Platform local login environment: `PASS`, `tests 2`, `pass 2`;
  - `npm run platform:local:status`: `PASS`, account locale assente prima del seed;
  - `CONFIRM_TASK046_PLATFORM_LOCAL_LOGIN_TEST=yes DEV_PLATFORM_ADMIN_PASSWORD=<runtime-generated> npm run test:platform:local-login`: `PASS`, `1 passed`;
  - `npm run platform:local:cleanup`: `PASS`, auth user locale cancellato, audit append-only trattenuti.
- Stato:
  - riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06;
  - nessun commit, push o stage.

- DONE reconciliation 2026-06-06: conferma esplicita utente ricevuta; TASK-046 chiuso a `DONE_RECONCILED`.

### TASK-047 - Align Master Console and Admin Console access model

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-047-align-master-console-admin-console-access-model.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-047/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Scopo: allineare naming, copy, guard e runbook alla decisione prodotto Master Console / Admin Console, mantenendo route tecniche `/platform`, `/shop` e `/shop/staff-login`.
- Decisione prodotto:
  - `Master Console`: nome breve della console globale su `/platform`, riservata al principal tecnico `platform_admin`;
  - `Admin Console`: nome breve della console shop-scoped su `/shop`;
  - Admin Console via `personal_account`: Supabase Auth personale, `profiles`, `shop_members`, multi-shop quando autorizzato;
  - Admin Console via shop-code/staff-code: `pos_staff_manager`, `staff_accounts`, `staff_web_sessions`, single-shop;
  - principal personale e staff account restano separati ma permission-equivalent nello stesso shop quando il permission tree concede le stesse operazioni;
  - Win7POS usa shop-code/staff-code e non personal account;
  - Android/iOS usano personal account e possono essere multi-shop;
  - uno shop puo essere creato da provisioning master o da flussi futuri POS-first shop, senza dedurre il tipo di test/accesso da `.env.local`.
- Implementato:
  - `/` trasformata in console selection esplicita;
  - `/auth/login` rinominata come Admin account sign in e linkata a Shop code sign in;
  - `/shop/staff-login` rinominata come Shop code sign in per Admin Console single-shop;
  - guard `/platform` e shell Platform riallineati a Master Console;
  - guard `/shop` e shell Shop riallineati a Admin Console;
  - architettura dual access aggiornata;
  - runbook Admin Console personal account e Shop code aggiunti;
  - runbook Master Console locale aggiornato.
  - review UX Master Console 2026-06-05: liste `Users` e `Shops` aggiornate
    con righe selezionabili e pannello dettaglio contestuale; Users mostra ID
    breve, membership/shop access e origine account `Not captured`; Shops mostra
    owner multipli e membership attive/totali senza aggiungere secret auth o
    service-role lato browser.
  - correzione UX master-detail 2026-06-05: il pannello dettaglio non resta piu
    vuoto durante lo scroll, le pagine User/Shop Detail hanno `Back to Users` /
    `Back to Shops`, e il ritorno preserva la riga selezionata tramite
    `?selected=<rowId>`; la vista `Shops` usa layout piu largo per evitare righe
    tagliate.
  - review runtime locale 2026-06-05: `platform:local:dev` ora evita
    `EADDRINUSE` su `3000` scegliendo una porta locale alternativa e stampando
    l'URL corretto da aprire; usa `next dev --webpack` per default per evitare
    loop del dev indicator `Compiling` durante i test manuali locali.
  - follow-up UX polish Users/Shops 2026-06-05: liste Master Console rese piu
    operative con search/filtri locali, celle a piu righe controllate, badge
    stato colorati, inspector a sezioni, full detail sezionati, diagnostica
    normale collassata e `Open full detail` che apre la pagina dettaglio in cima
    mantenendo il ritorno lista con `?selected=<id>`.
  - final micro-polish 2026-06-05: sidebar Master Console sticky su desktop,
    inspector con header/action raggiungibili, copy meno tecnico, shop code copy
    verificato e riga selezionata piu evidente con bordo/ARIA.
- Guardrail:
  - no production;
  - no service-role lato browser;
  - no dati reali o secret;
  - no reset DB;
  - nessuna migration;
  - nessun commit, push o stage.
- Evidence:
  - foundation TASK-047 red confermato prima dell'implementazione;
  - terminale manuale utente conferma `.env.local` classificato
    `supabase_cloud`, Supabase locale attivo, e blocco `EADDRINUSE` su
    `127.0.0.1:3000`;
  - check finali da registrare in `docs/TASKS/EVIDENCE/TASK-047/README.md`.
- Stato:
  - riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06;
  - non marcare `DONE` senza conferma utente esplicita.

- DONE reconciliation 2026-06-06: conferma esplicita utente ricevuta; TASK-047 chiuso a `DONE_RECONCILED`.

### TASK-048 - Master Console secondary sections clarity and UX polish

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-048-master-console-secondary-sections-ux-polish.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-048/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Dipendenza: `TASK-047` resta in `REVIEW`; TASK-047 remains in REVIEW and is a dependency, not automatically DONE.
- Scopo: polish UX mirato delle schede secondarie Master Console
  `/platform/devices`, `/platform/sync`, `/platform/history`,
  `/platform/support` e `/platform/operations`, senza cambiare schema,
  migration, dati o sicurezza.
- Implementato:
  - Devices and Sync are not top-level Master Console sidebar entries.
  - `/platform/devices` and `/platform/sync` remain internal read-only diagnostics/deep links.
  - pattern comune `Use this page to` con purpose items, metriche, empty state,
    diagnostics secondaria e next action;
  - Devices come diagnostica interna read-only `Device Signals`, senza usare
    `sync_events` come righe device e con gestione quotidiana rimandata ad
    Admin Console;
  - Sync come diagnostica interna read-only `Sync Signals`, con nota che Sales
    Sync foundation esiste ma Win7POS sales sync live non e verificato e con
    troubleshooting shop-level rimandato ad Admin Console;
  - History distinto da Sync e Audit;
  - Support come diagnostics read-only con colonne `Subject`, `Signal`, `State`
    e `Suggested next step`, piu link verso Users, Shops, Data, Provisioning e
    Operations;
  - Data/System con blocco read-only `Device/sync data health`;
  - Operations ricomposta come workflow target shop -> action -> reason -> shop
    code confirmation -> submit, usando le Server Actions esistenti, e copy che
    limita le operazioni device a eccezioni globali/emergenziali.
- Guardrail:
  - No schema changes;
  - No mock rows;
  - No Sales Sync live claim;
  - No Win7POS live E2E claim;
  - no production;
  - no service-role lato browser;
  - no dati reali o secret;
  - no migration;
  - no impersonation;
  - no commit;
  - no push;
  - no final stage.
- Repository handoff 2026-06-05:
  - commit/push su `main` autorizzati dall'utente dopo check freschi;
  - stato TASK-048 poi riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.
- Evidence:
  - foundation TASK-048 red confermato prima dell'implementazione;
  - foundation TASK-048 green: `tests 3`, `pass 3`;
  - `security:scan`: `PASS`;
  - `test:foundation`: `PASS`, `tests 205`, `pass 205`;
  - `typecheck`: `PASS`;
  - `lint`: `PASS`;
  - `build`: `PASS_WITH_WARNING`, warning noti Next `middleware` -> `proxy`
    e Node `[DEP0205]`;
  - `verify`: `PASS_WITH_WARNING`, stessi warning build;
  - `test:ui-smoke:ci`: `PASS_WITH_WARNING`, Playwright protected-route
    smoke locale `43 passed`;
  - `git diff --check`: `PASS`;
  - `git diff --cached --name-status`: `PASS_NOT_STAGED`.
- Stato:
  - riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06;
  - non marcare `DONE` senza conferma utente esplicita.

- DONE reconciliation 2026-06-06: conferma esplicita utente ricevuta; TASK-048 chiuso a `DONE_RECONCILED`.

### TASK-049 - Master Console Admins UI/UX polish

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-049-master-console-admins-ui-ux-polish.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-049/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `codex/task-042-review-ci-win7pos-bridge`
- Milestone interna corrente: `DONE_RECONCILED`
- Verdict corrente: `DONE_RECONCILED`
- Dipendenza: `TASK-048` resta in `REVIEW`; non riaprire Devices/Sync come
  navigazione primaria.
- Scopo: polish UI/UX piccolo e verificabile della Master Console, con priorita
  alla pagina `/platform/admins` e micro-fix layout per Audit, Provisioning e
  Operations, senza cambiare backend, schema, RPC, RLS, permessi o azioni server.
- Implementato:
  - Admins con summary area, card grant compatta e lista active admins piu
    leggibile;
  - controlli revoke admin dentro danger zone espandibile per singolo admin;
  - copy preservata: `Server blocks self-lockout and last-admin removal.`;
  - tabella read-only con min-width, scroll orizzontale e date non spezzate;
  - Provisioning piu compatto con copy sul confine Platform Console / Shop Admin;
  - Operations robuste per shop code lunghi;
  - header chip nello stesso ordine: Read-only, Server boundary, Controlled
    actions, Logout;
  - review-fix visuale con date compatte UTC, ID corti con title completo,
    diagnostics collassate, status System/Data leggibili, detail Users/Shops
    meno pesanti, placeholder Provisioning e search/filter locale Operations;
  - Devices and Sync remain outside the primary Master Console sidebar.
- Guardrail:
  - No schema changes;
  - No RPC changes;
  - No RLS changes;
  - no production;
  - no service-role lato browser;
  - no dati reali o secret;
  - no migration;
  - no nuove feature operative;
  - no commit;
  - no push;
  - no final stage.
- Repository handoff 2026-06-05:
  - commit/push su `main` autorizzati dall'utente dopo check freschi;
  - stato TASK-049 poi riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06.
- Evidence:
  - foundation TASK-049 red confermato prima dell'implementazione;
  - foundation TASK-049 review-fix red confermato: `tests 5`, `pass 2`,
    `fail 3`;
  - foundation TASK-048 regression: `tests 3`, `pass 3`;
  - foundation TASK-049 green: `tests 5`, `pass 5`;
  - `security:scan`: `PASS`;
  - `test:foundation`: `PASS`, `tests 210`, `pass 210`;
  - `typecheck`: `PASS`;
  - `lint`: `PASS`;
  - `build`: `PASS_WITH_WARNING`, warning noti Next `middleware` -> `proxy`
    e Node `[DEP0205]`;
  - `verify`: `PASS_WITH_WARNING`, stessi warning build;
  - `test:ui-smoke:ci`: `PASS_WITH_WARNING`, Playwright protected-route
    smoke locale `43 passed`;
  - `git diff --check`: `PASS`;
  - `git diff --cached --name-status`: `PASS_NOT_STAGED`.
- Stato:
  - riconciliato a `DONE_RECONCILED` su conferma esplicita utente del 2026-06-06;
  - non marcare `DONE` senza conferma utente esplicita.

- DONE reconciliation 2026-06-06: conferma esplicita utente ricevuta; TASK-049 chiuso a `DONE_RECONCILED`.

### TASK-050 - Review and DONE reconciliation for TASK-040..TASK-049

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-050-review-done-reconciliation-task-040-049.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-050/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `main`
- Milestone interna corrente: `TASK_040_049_DONE_RECONCILED_WITH_EXTERNAL_BLOCKERS`
- Verdict corrente: `DONE_RECONCILED`
- Scopo: riconciliare in modo repo-grounded `TASK-040`..`TASK-049`,
  preservando i blocker esterni non eseguiti e preparando handoff verso
  conferma utente; commit/push finale su `main` autorizzati dall'utente il 2026-06-06.
- Matrice riconciliazione:
  - TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`;
  - TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`;
  - TASK-042: `READY_FOR_WIN7_MANUAL_TEST`;
  - TASK-043: `DONE_RECONCILED`;
  - TASK-044: `DONE_RECONCILED`;
  - TASK-045: `DONE_RECONCILED`;
  - TASK-046: `DONE_RECONCILED`;
  - TASK-047: `DONE_RECONCILED`;
  - TASK-048: `DONE_RECONCILED`;
  - TASK-049: `DONE_RECONCILED`.
- Blocker non promossi:
  - Win7POS live E2E: `NOT_RUN`;
  - POS online connection/catalog pull: `NOT_RUN`;
  - Sales Sync live Win7POS -> Admin Web: `NOT_RUN`;
  - stable non-production staging: `NOT_RUN`;
  - production deploy/apply: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Decisioni UI/UX preservate:
  - Devices and Sync remain outside the primary Master Console sidebar.
  - `/platform/devices` and `/platform/sync` remain diagnostic deep links.
  - route diagnostiche: `Device Signals`, `Sync Signals`.
- Stato:
  - riconciliato a `DONE_RECONCILED` su conferma utente del 2026-06-06;
  - `TASK-046`..`TASK-049` chiusi a `DONE_RECONCILED` su conferma utente del 2026-06-06;
  - check finali TASK-050: `security:scan` PASS, `test:foundation` PASS
    `212/212`, `typecheck` PASS, `lint` PASS, `build` PASS_WITH_WARNING,
    `verify` PASS_WITH_WARNING, `test:ui-smoke:ci` PASS_WITH_WARNING
    `43 passed`, `git diff --check` PASS, nessun file staged prima della richiesta finale di commit;
  - target separation: `db:local:status` FAIL_EXPECTED su `.env.local` cloud,
    `db:staging:status` FAIL_EXPECTED senza env staging esplicita,
    `platform:local:status` PASS;
  - Win7POS static scanners PASS, ma Win7POS live E2E/POS online/Sales Sync
    live restano `NOT_RUN`;
  - commit/push finale su `main` autorizzati dall'utente il 2026-06-06.

### TASK-052 - Admin Console UX polish, shell parity and operational clarity

- Stato: `DONE`
- File task: `docs/TASKS/TASK-052-admin-console-ux-polish-shell-parity.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-052/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `CODEX_DONE_RECONCILIATION`
- Branch previsto: `codex/task-059-post-merge-supabase-readiness`
- Scopo: recovery/safe redo dopo un tentativo precedente di polish Shop Admin
  troppo ampio e non compilabile. Ripristina i pannelli operativi danneggiati
  o fuori scope e applica solo polish P0/P1 piccolo: logout Shop Admin, sticky
  sidebar desktop, rimozione del chip globale `Read-only`, Diagnostics meno
  invasivo e tracking task corretto.
- Non include:
  - rewrite dei pannelli catalog/staff/member/import-export;
  - migration, schema, RPC, RLS o endpoint Supabase;
  - dati demo locali, credenziali, PIN, password o token;
  - commit, push o stage finale;
  - modifiche Win7POS, Android, iOS, Cash Register o Sales Sync.
- Verdict corrente: `REVIEW`.

### TASK-053 - Authorization architecture and staff safe read boundary fix

- Stato: `DONE`
- File task: `docs/TASKS/TASK-053-authorization-architecture-staff-safe-read-boundary.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-053/README.md`
- Fase: `REVIEW`
- Responsabile: `CODEX_HANDOFF_TO_REVIEW`
- Branch previsto: `main`
- Scopo: documentare il modello autorizzativo Master/Admin/staff POS e correggere
  il boundary di lettura safe staff che lasciava `/shop/staff` in `Read blocked`
  per account personali autenticati.
- Soluzione scelta: grant colonnare additivo sulla safe column
  `web_access_revoked_at`, mantenendo `staff_accounts_safe`
  `security_invoker=true`, RLS su `staff_accounts` e nessun accesso a
  `credential_hash`.
- Non include:
  - console POS separata;
  - fusione tra account personali e staff POS;
  - service-role nel browser;
  - apply cloud/production;
  - commit, push o stage finale.
- Verdict corrente: `DONE`.

### TASK-054 - Stabilizzare Shop Admin auth navigation e ripulire sidebar/diagnostics

- Stato: `DONE`
- File task: `docs/TASKS/TASK-054-shop-admin-auth-navigation-sidebar-diagnostics.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-054/README.md`
- Fase: `DONE`
- Responsabile: `CODEX_DONE_RECONCILIATION`
- Branch previsto: `main`
- Scopo: stabilizzare la navigazione Shop Admin per account personali,
  correggere il masking tra personal account e staff-web fallback, usare
  `getClaims()` nel proxy Supabase, ripulire sidebar/diagnostics e impedire
  regressioni con test foundation/E2E.
- Implementazione:
  - `resolveShopAdminDataAccess()` diventa il resolver unico del layout Shop;
  - personal account valido vince sul fallback staff;
  - il motivo `No staff web session cookie is present.` non maschera piu il
    flusso Admin account;
  - la sidebar Shop propaga solo `shop_id` e centralizza i guardrail in
    `Shop safety`;
  - Diagnostics ripetuti sono rimossi dalle pagine Shop;
  - copy Import/Export, Roles, Staff/POS e mapping states aggiornato.
- Non include:
  - schema/RLS/migration/RPC;
  - console POS separata;
  - modifiche Win7POS, Android, iOS o Cash Register;
  - deploy Cloudflare production;
  - rimozione `vercel.json`;
  - deploy production o cloud apply.
- Verdict corrente: `DONE_WITH_NOTES`.
- Follow-up `TASK-054C` 2026-06-11: Safari reale verificato su
  `localhost:3054` e `127.0.0.1:3054` via `safaridriver` con Supabase locale e
  fixture sintetica; login separati per host, sidebar `Products -> Import /
Export -> Overview`, solo `shop_id` propagato, assenti `No active session`,
  `No staff web session cookie is present` e `Unauthorized`, cleanup
  `cleanupErrors: []`.
- Final review correttiva Codex 2026-06-11: trovato e corretto drift minore
  dei guardrail `POS Live`, ora centralizzati in `sharedShopGuardrails` con
  divieto esplicito di renderizzare credential hash, PIN, password e raw token.
  Check freschi: `security:scan` PASS, TASK-054 targeted PASS 6/6,
  `test:foundation` PASS 241/241, `typecheck` PASS, `lint` PASS, `build` e
  `verify` PASS_WITH_WARNINGS, `test:shop:local` PASS 4/4 riusando server locale
  su `127.0.0.1:3000`, Safari reale via `safaridriver` PASS su server dedicato
  `3058` per `localhost` e `127.0.0.1` con cleanup sintetico a zero,
  `cf:build` PASS_WITH_WARNINGS. `db:local:status` resta fail-closed per
  `.env.local` puntato a `supabase_cloud`; `db:staging:status` non configurato.
  Nessun stage, commit, push, migration, deploy o production/cloud apply.
- Final DONE confirmation Codex 2026-06-11: su richiesta esplicita utente,
  TASK-054 chiuso a `DONE` con verdict `DONE_WITH_NOTES`.
  Gate freschi: `git diff --check` PASS, `security:scan` PASS, targeted
  TASK-054 PASS 6/6, `test:foundation` PASS 241/241, `typecheck` PASS,
  `lint` PASS, `build` e `verify` PASS_WITH_WARNINGS, `test:shop:local` PASS
  4/4 su server locale esistente, Safari reale via `safaridriver` PASS su
  server dedicato `3059` per `localhost` e `127.0.0.1` con solo `shop_id` in
  URL e cleanup sintetico a zero, `cf:build` PASS_WITH_WARNINGS.
  `db:local:status` e `db:staging:status` restano note ambientali fail-closed /
  non configurate. Commit/push finali autorizzati esplicitamente dall'utente;
  nessun migration, schema/RLS/RPC, deploy production, cloud apply o dato reale.

### TASK-057 - Shop Catalog Workspace: prodotti, categorie, fornitori e import Excel intelligente

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-057-shop-catalog-workspace-import-intelligence.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-057/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `REVIEWER_CONFIRMED_BY_TASK_058_PROMPT`
- Scopo: trasformare `/shop/products` nel Catalog Workspace principale con
  tabella prodotti completa, toolbar/dialog per CRUD catalogo, import/export
  Excel integrato, parser fornitore intelligente e verifica reale del boundary
  server-side catalogo.
- Include:
  - discovery schema/RPC/action context/mapping e fonti mobile Excel;
  - prodotti con filtri per search, category, supplier e state;
  - categorie e fornitori con pattern lista + toolbar + dialog;
  - import fornitore Excel preview-first e database transfer avanzato;
  - test foundation TASK-057 e handoff verso `REVIEW`.
- Non include:
  - commit, push o stage finale;
  - deploy production/cloud apply;
  - nuove dipendenze salvo blocker reale documentato;
  - bypass di mapping, permessi, RLS/RPC, audit o boundary server-side;
  - dati reali, token, password o service-role client/browser.
- Verdict corrente: `DONE_RECONCILED`.
- Nota: riconciliato a `DONE_RECONCILED` il 2026-06-12 dal prompt TASK-058,
  trattato come conferma utente esplicita dopo preflight reale positivo:
  `git status --short --branch --untracked-files=all` PASS,
  `git diff --check` PASS e targeted TASK-057 PASS `21/21`.

### TASK-058 - Cloudflare/OpenNext Staging Hardening and Deployment Governance

- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- File task: `docs/TASKS/TASK-058-cloudflare-opennext-staging-hardening.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-058/README.md`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile: `REVIEWER`
- Scopo: consolidare governance e hardening Cloudflare/OpenNext per staging e
  production manual-gated, verificando Vercel parcheggiato, `wrangler.jsonc`,
  `open-next.config.ts`, workflow Cloudflare, Supabase staging readiness,
  smoke locale/staging, rollback e WAF/rate-limit.
- Include:
  - discovery Cloudflare/OpenNext esistente;
  - Vercel guardrail;
  - build e smoke OpenNext/Workers locale;
  - staging remote readiness e blocker espliciti se mancano credenziali/target;
  - production deploy solo manual-gated, senza deploy production in task;
  - runbook rollback e WAF/rate-limit;
  - test foundation/security e evidence redatta.
- Non include:
  - deploy production;
  - DNS cutover production;
  - Supabase production apply;
  - Vercel Git Integration;
  - nuove migration non necessarie;
  - Win7POS live E2E o Sales Sync live;
  - dati reali, secret, commit, stage o push.
- Verdict corrente: `REVIEW_WITH_EXTERNAL_BLOCKERS`.

### TASK-059 - Post-merge Supabase Staging Readiness

- Stato: `DONE_RECONCILED_WITH_NOTES`
- File task: `docs/TASKS/TASK-059-post-merge-supabase-staging-readiness.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-059/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `main`
- Scopo: cleanup post-merge TASK-058, verifica Supabase staging read-only con
  timeout, readiness Cloudflare custom domain/WAF read-only e PR verso `main`.
- Include:
  - distinzione documentale tra token storici `Edit Cloudflare Workers` e token
    CI corrente `TASK-058 GitHub Actions Cloudflare deploy 2026-06-13`;
  - verifica Supabase CLI, GitHub env metadata e `db:staging:status` senza valori
    sensibili;
  - verifica Cloudflare zone/custom domains solo per metadata/count;
  - aggiornamento runbook/evidence/checklist.
- Non include:
  - deploy production;
  - deploy staging;
  - Supabase production apply, migration, reset, dump o query dati reali;
  - creazione di zone, DNS, custom domain, WAF/rate-limit o nuovi token.
- Verdict corrente: `DONE_RECONCILED_WITH_NOTES`.

### TASK-060 - Supplier Excel Android-style preview/import

- Stato: `DONE`
- File task: `docs/TASKS/TASK-060-supplier-excel-android-style-preview-import.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-060/README.md`
- Fase: `DONE`
- Responsabile: `CODEX_ORCHESTRATOR`
- Branch previsto: `main`
- Scopo: migliorare `Import supplier Excel` con drop zone, preview larga
  Android-style, tabella con valori riconosciuti read-only e input mutativi
  vuoti, parser supplier piu robusto e apply che importa solo valori
  quantity/retail price compilati dall'utente, creando/aggiornando prodotti
  validi dallo sheet supplier. Il resume/fix 2 aggiunge supporto `.xls`
  legacy/HTML-Excel, mapping colonne editabile e input supplier/category
  manuali shop-scoped. Il resume/fix 3 corregge session expiry/permission UX
  per Shop Code staff import. I resume/fix 5-7 puliscono lo step
  `Check columns` con sample prodotto/header reali, mapping tabellare,
  include/exclude optional, guardia numerica Dingli e Step 3 supplier compatto
  con `No.` prodotto e label Android/iOS `Total price`. Il gate finale
  corregge il boundary preview/apply per autorizzare prima del multipart body
  e aggiunge E2E locale sui workbook reali Dingli/Belina forniti dall'utente.
- Include:
  - apertura governance/evidence TASK-060;
  - drop zone `.xlsx` / `.xls` accessibile con click e drag/drop, file badge,
    remove e replace;
  - preview step/modale larga `Supplier workbook preview`;
  - mapping colonne digest-bound con override server-side validato;
  - default supplier/category e override per-riga collegati solo a nomi
    esistenti nello shop;
  - alias multilingua, header shifted, recognized column sources e summary rows;
  - parsing server-side `.xlsx`, `.xls` legacy/BIFF e HTML-Excel via
    `@e965/xlsx`;
  - `recognizedQuantity`, `recognizedPurchasePrice`, `recognizedRetailPrice`;
  - apply supplier preview-first con `APPLY`, digest e row fingerprint;
  - test foundation e browser/Playwright QA con fixture sintetiche;
  - QA locale con workbook reali Dingli/Belina forniti dall'utente, senza
    copiarli nel repository;
  - UX auth supplier import: `session_expired`/`no_active_session` con login
    recovery e `permission_denied` distinto da sessione non valida.
- Handoff:
  - supplier apply crea/aggiorna prodotti validi; identita prodotto e purchase
    price riconosciuti possono essere importati;
  - `retailPrice`/`stockQuantity` restano manual-only: campi vuoti preservano
    valori esistenti e restano vuoti/default sulle righe nuove;
  - riferimenti supplier/category non risolti nello shop diventano warning e
    non creano anagrafiche;
  - sheets `Suppliers`/`Categories`/`PriceHistory` restano preview-only nel
    supplier flow;
  - database transfer resta il percorso per import catalogo completo.
- Non include:
  - commit, push o stage finale;
  - deploy production/cloud apply;
  - dipendenze non motivate oltre `@e965/xlsx` per parsing `.xls`;
  - schema Supabase, migration, RLS o RPC;
  - Sales Sync, POS runtime, Win7POS/iOS/Android edits o dashboard fake;
  - workbook reale committato/copiato o raw workbook/secret in evidence.
- Verdict corrente: `DONE`.

### TASK-061 - Android database export compatibility for Admin Web database transfer

- Stato: `DONE`
- File task: `docs/TASKS/TASK-061-android-database-export-transfer-compatibility.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-061/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `NONE`
- Branch previsto: `codex/task-061-android-database-export`
- Scopo: rendere `Shop Admin Console > Catalog > Products > Database transfer`
  compatibile con il database export Android completo e parziale, riconoscendo
  automaticamente i workbook con sheet tecnici `Products`, `Suppliers`,
  `Categories` e `PriceHistory`, validando/mostrando preview multi-sheet e
  importando in modo sicuro i dati supportati dal backend reale shop-scoped.
- Include:
  - audit read-only del formato export Android da codice
    `MerchandiseControlSplitView`;
  - documentazione tecnica del formato Android database export;
  - detection esplicita Android database export full/partial;
  - parser/validation/preview separati per prodotti, fornitori, categorie e
    storico prezzi;
  - UI database transfer non product-only, con sheet summary e preview bounded;
  - import preview-first di suppliers, categories, products e PriceHistory
    tramite RPC/schema reali esistenti;
  - test foundation mirati e regressione supplier import esistente;
  - riconciliazione finale a `DONE` / `DONE_RECONCILED` dopo gate reali.
- Non include:
  - commit, push o stage finale;
  - modifiche al repository Android;
  - nuove dipendenze;
  - migration/schema/RLS/RPC non necessari;
  - workbook reali copiati o committati;
  - secret, service-role key lato client, dati finti o dashboard fake.
- Verdict corrente: `DONE`.
- Nota review/fix 2026-06-14: fix critico completato e verificato con E2E
  reale sul workbook locale
  `/Users/minxiang/Downloads/Database_2026_06_04_19-09-08.xlsx`, senza copiare
  il file nel repo. Il bulk write staff-aware e stato spostato fuori da
  `import-export-workbook.ts` e dentro `staff-aware-mutations.ts`; `security:scan`
  passa. Primo apply: `21181` products, `59` suppliers, `24` categories,
  `44295` PriceHistory, `failedRows=0`. Retry/idempotenza: preview
  `newProducts=0`, apply HTTP 200, `failedRows=0`, conteggi DB invariati.
  Browser/E2E locale PASS con busy state `Importing database...`, input e
  close disabilitati durante import.
- DONE closure loop 2026-06-15: i `27` failure foundation residui sono stati
  corretti come asserzioni statiche obsolete i18n/layout (`dictionary`,
  `labels`, `localizedSection`), non regressioni database transfer. Dopo il
  refactor security-safe e dopo foundation verde e stato rieseguito l'E2E reale
  completo con il workbook Downloads: primo apply HTTP `200`, `failedRows=0`,
  Products `21181`, Suppliers `59`, Categories `24`, PriceHistory `44295`;
  retry preview `newProducts=0`, retry apply HTTP `200`, `failedRows=0`,
  conteggi invariati; cleanup sintetico completato. Gate finali seriali PASS:
  TASK-061, TASK-060, `npm run test:foundation` (`308/308`), typecheck, lint,
  security scan, build, verify e `git diff --check`. TASK-061 riconciliato a
  `DONE` / `DONE_RECONCILED`; nessun commit/push/stage.

### TASK-064 - Master Console Auth/Profile Parity e ricerca utenti Android/iOS

- Stato: `DONE_RECONCILED`
- File task: `docs/TASKS/TASK-064-master-console-auth-profile-parity.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-064/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `NONE`
- Scopo: rendere visibili e ricercabili in Master Console gli account
  personali Supabase Auth usati da Android/iOS, fondendo in modo sicuro Auth,
  profiles e membership.
- Include:
  - search server-side `/platform/users?q=...`;
  - DTO Auth/Profile server-only minimale con email/provider/origin/state;
  - classificazione `profile_ok`, `auth_only`, `profile_only`,
    `origin_unavailable`;
  - migration additiva locale-verificata per trigger/backfill
    `auth.users -> public.profiles`;
  - verifica parity Supabase project/ref Admin Web, Android e iOS con valori
    redatti;
  - test foundation, security scanner e E2E locale TASK-064.
- Non include:
  - commit, push o stage finale;
  - apply cloud/production;
  - query mutative su account reale;
  - modifica Android/iOS;
  - merge tra `profiles` e `staff_accounts`;
  - esposizione client/browser di service-role, token, PIN, password o raw auth
    metadata.
- Nota execution 2026-06-15: root cause confermata: `/platform/users` caricava
  solo `profiles` limitati e il search UI filtrava le righe gia restituite;
  provider/origin erano hardcoded `Not captured`; schema locale senza trigger
  auth->profile. Fix implementato con read model server-side Auth/Profile,
  UI email/provider/state, migration `20260615143000_task_064_auth_profile_parity.sql`,
  scanner/test/E2E. Gate gia verdi: TASK-064 foundation `5/5`,
  `security:scan`, `typecheck`, `supabase migration up --local`,
  `supabase db lint --local --schema public,app_private --fail-on error`,
  E2E locale `test:platform:local-users` `1 passed` con cleanup a zero.
  Cloud/production non toccati; account reale redatto non usato in test
  mutativi. Codex prepara handoff a `REVIEW`, non marca `DONE`.
- DONE reconciliation 2026-06-16: su conferma esplicita utente, TASK-064
  chiuso a `DONE_RECONCILED` per il code scope dopo review orchestrata
  DB/UI/target/security/test. Fix finali: lookup profili Auth in batch per
  evitare falsi `auth_only` oltre 200 profili, full detail/returnTo preserva
  `q` e `selected`, E2E locale copre selected inspector/full detail e cleanup
  robusto. Gate passati: targeted TASK-064/TASK-047/TASK-049 `14/14`,
  `security:scan`, `lint`, `typecheck`, `test:foundation` `326/326`,
  `build`, `verify`, `test:platform:local-users` `1 passed`,
  `test:platform:local` `1 passed`, `test:platform:local-login` exit `0`
  con `1 skipped`, `supabase migration list --local`,
  `supabase migration up --local`, `supabase db lint --local --schema public,app_private --fail-on error`,
  trigger rollback probe `profile_exists=1` e residui TASK064 `0`.
  Admin Web/Android/iOS puntano allo stesso ref redatto `jpgo...yvm`, ma il
  target cloud e `production/unknown` dal repo: nessuna query cloud o migration
  cloud eseguita, e `xniw97@...` resta `NOT_RUN_EXTERNAL_TARGET_UNKNOWN`.
  Nessun commit/push/stage.
- REOPEN 2026-06-16: verifica manuale utente ha dimostrato che il problema
  reale non era risolto nel browser: search `xniw...@...com` mostrava `No
matching rows`. Root cause reale trovata: browser/runtime aperto con
  `platform:local:dev` legge Supabase locale `127.0.0.1:54321`
  (`authUsers=96`, `profiles=96`, account reale assente), mentre `.env.local`
  cloud ref redatto `jpgo...yvm` contiene `authUsers=3`, `profiles=3`,
  account reale presente provider Google e `profile_ok`. Aggiunti
  `platform:cloud:dev` e `platform:cloud:probe` per separare target locale e
  cloud; search Auth esplicita rafforzata con limite dedicato piu alto e
  warning se lo scan viene troncato; UI zero-result corretta per mantenere la
  search server-side visibile. TASK-064 torna
  `CHANGES_REQUIRED_TARGET_MISMATCH_FOUND`, non `DONE`.
- TASK-064C cloud reconciliation 2026-06-16: runtime locale fermato, avviato
  solo `platform:cloud:dev` su `127.0.0.1:3055`, target `cloud` ref redatto
  `jpgo...yvm`. Aggiunto login Google server-side tramite Supabase Auth per
  account cloud provider Google, diagnostica target runtime redatta su Users e
  Data, e browser acceptance reale dopo login manuale Google: URL
  `/platform/users?q=xniw97`, `Runtime target=cloud`, `Auth users=3`,
  `Platform admins=3`, riga `xniw...@...com` visibile, provider `google`,
  stato `Profile OK`. Screenshot evidence:
  `docs/TASKS/EVIDENCE/TASK-064/browser-cloud-xniw-visible.png`. Gate minimi
  TASK-064C passati: cloud probe read-only, browser cloud acceptance,
  `security:scan`, `typecheck`, `lint`, `git diff --check`, `git status`
  con dirty worktree noto; nessun commit/push/stage, nessuna migration cloud,
  nessun grant creato. Il successivo blocco Auth URL Configuration e stato
  risolto nel sotto-pass storico TASK-064C:
  `DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`.
- TASK-064C final reconciliation 2026-06-16: conferma esplicita utente della
  verifica reale nel browser Master Console cloud. La pagina su runtime
  `platform:cloud:dev` mostra `Runtime target=cloud`, project `jpgo...yvm`,
  `Auth users=3`, riga reale `xniw...@...com`, provider `google`, stato
  `Profile OK`. Root cause finale: target mismatch local vs cloud;
  `platform:local:dev` legge Supabase locale, mentre `platform:cloud:dev`
  legge Supabase cloud `jpgo...yvm`. Android/iOS/Admin Web risultano allineati
  sul target cloud redatto. Vercel non e hosting operativo per staging, login
  o callback; era solo una configurazione redirect storica da non usare.
- Final taxonomy reconciliation 2026-06-16: su conferma esplicita utente,
  TASK-064 e riconciliato a `DONE_RECONCILED` anche per la tassonomia Master
  Console Users / Shop Admins / Platform Admins. Users e `Personal Accounts`
  per account personali normali/non-admin o incompleti; Shop Admins deriva da
  `shop_members` owner/manager includendo current, historical-only e disabled;
  Platform Admins deriva solo da `platform_admins`; POS/Staff resta separato.
  UI/read model/test aggiornati: Shop Admins senza overlap, multi-shop compatto
  in tabella con dettagli in inspector/full detail, Users empty state/notice con
  CTA dedicate, Platform Admins con email/provider/Profile ID/current account,
  `Advanced global access` collassato e form aperto contenuto nel box. Gate
  finali passati: targeted TASK-047/TASK-049/TASK-064 `16/16`,
  `npm run test:foundation` `342/342`, `npm run security:scan`, `npm run lint`,
  `npm run typecheck`, `npm run build`, `npm run verify`,
  `npm run test:platform:local-users` `1 passed`,
  `npm run test:ui-smoke:ci` `48 passed`, visual QA screenshot desktop/tablet e
  `git diff --check`. Nessun commit/push/stage; nessun
  schema/migration/RPC/RLS; TASK-065 OAuth e TASK-067 lifecycle/cleanup restano
  fuori scope separati.
  Stato finale: `DONE_RECONCILED`.

### TASK-063 - History Sync Console cross-platform diagnostics

- Stato: `DONE`
- File task: `docs/TASKS/TASK-063-history-sync-console-cross-platform.md`
- Evidence: `docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md`
- Fase: `DONE_RECONCILED_INTEGRATION`
- Responsabile: `NONE`
- Scopo: preservare la lettura Admin Console di `shared_sheet_sessions`,
  `sync_events` e diagnostica history senza confondere questi eventi tecnici con
  `audit_logs` amministrativi.
- Include:
  - read model server-side per history/sessioni condivise;
  - diagnostica `sync_events` e normalizzazione riferimenti sessione;
  - migration additive per diagnostics/history legacy RLS;
  - seed demo solo sintetico;
  - test foundation `task-history-sync-console` e regressione `task-015-history`.
- Non include:
  - scritture raw dal client/browser;
  - service-role key lato client;
  - conversioni destructive dei payload mobile;
  - dati reali, workbook reali o secret nel repository.
- Nota integrazione 2026-06-15: preservato nel merge verso main insieme a
  TASK-061 e TASK-062; i gate finali di integrazione restano l'evidence
  definitiva prima del commit finale.
- Nota normalizzazione tracking 2026-06-15: la feature era gia presente su
  `main` senza task file numerato dedicato. Creato `TASK-063` come tracking
  retrospettivo documentale, senza modifiche runtime, migration, seed o test.

### TASK-062 - Global i18n locale and import/export coverage

- Stato: `DONE`
- File task: `docs/TASKS/TASK-062-global-i18n-locale.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-062/README.md`
- Fase: `DONE_RECONCILED`
- Responsabile: `NONE`
- Scopo: introdurre locale globale Admin Web con cookie
  `mc_admin_locale`, lingue `en`, `it`, `es`, `zh-CN`, fallback `en`,
  language switcher e copertura delle superfici Shop/Platform critiche.
- Include:
  - resolver locale server-side e dizionari esatti;
  - language switcher client con cookie e refresh;
  - shell/navigation Platform e Shop localizzate;
  - pagina compatibilita import/export e pannelli catalog/import-export coperti
    da `dictionary.exact`;
  - provisioning Platform e access gate globali localizzati;
  - scanner hardcoded UI e test foundation TASK-062.
- Non include:
  - nuove dipendenze;
  - traduzione dati business provenienti dal database;
  - secret, env o service-role client;
  - claim `DONE` prima dei gate finali e della review orchestrata.
- Nota integrazione 2026-06-15: import/export, Database transfer, Catalog
  action panel, provisioning Platform e access gate sono stati collegati alle
  label i18n. Gate finali verdi:
  `git diff --check`, `typecheck`, `lint`, `security:scan`,
  `test:foundation` (`315/315`), `build`, `verify`, targeted TASK-061/TASK-060,
  targeted History Sync/TASK-015, targeted TASK-062 e scanner i18n
  (`checkedPhrases: 260`). Browser QA locale su `127.0.0.1:3062` ha visitato
  `19` route x `4` locali senza crash, senza `wrongLang` e con auth/runtime
  fail-closed dove non era disponibile una sessione Supabase.
- Nota correttiva visual i18n 2026-06-15: sweep browser laterale autenticato
  su `127.0.0.1:3000` in `zh-CN` ha coperto `28` route Shop/Platform; scanner
  rendered riproducibile
  `node scripts/i18n-rendered-text-scan.mjs --input /tmp/task062-rendered-i18n-after.json`
  verde con `checkedPhrases: 86`, `checkedRoutes: 28`,
  `nonEnglishRecords: 28`.
- Nota staff shop-scope 2026-06-15: Master Console `/platform/shops` ha
  verificato `123456789` e `TASKHIST1` come shop reali distinti, entrambi
  autorizzati allo stesso personal owner locale ma non allo stesso staff
  account. Il resolver Admin Console ora da precedenza alla staff web session
  rispetto a una sessione personale stale; `ShopShell` rende lo switcher solo
  per `personal_account` multi-shop. E2E Shop locale `4/4` e Browser QA
  `zh-CN` confermano staff manager single-shop, nessun switcher e query
  cross-shop negata.
- Nota date/time e label tecniche 2026-06-15: addendum completato con helper
  centrale `src/i18n/format.ts` basato su `Intl.DateTimeFormat` senza cambiare
  numeri/prezzi/quantita. Browser laterale autenticato su `127.0.0.1:3000`
  conferma esempi `zh-CN` `2026年6月14日 21:16`, `it`
  `14 giu 2026, 21:16`, `es`/`es-CL` `14 jun 2026, 21:16`; dati business come
  nomi fornitori e UUID restano non tradotti. Scanner statico i18n verde
  (`checkedPhrases: 307`), scanner rendered verde su snapshot browser
  `/tmp/task062-rendered-i18n-after.json` (`checkedPhrases: 95`,
  `checkedRoutes: 28`, `checkedZhTechnicalHeaders: 33`,
  `nonEnglishRecords: 28`), `test:foundation` verde `321/321`.

## Tooling policy

- Codex resta executor/fixer.
- ChatGPT/Claude resta planner/reviewer.
- Figma puo essere usato per wireframe/UI se utile.
- Browser/Chrome possono essere usati per smoke test visivo.
- Vercel solo quando esistera una UI minima stabile e previa richiesta.
- Non sviluppare un CLI custom ora.
- Preferire npm scripts semplici e verificabili.
- Eventuale CLI/tooling dedicato va trattato come task futuro separato, non dentro `TASK-002`.

## Tracking corrente

- Stato globale attuale: `REVIEW`
- Ultimo task completato: `TASK-077B - Performance architecture fix: Products + Master Console lightweight read models`
- Stato TASK-015: `DONE`
- Fase TASK-015: `DONE_RECONCILED`
- Stato TASK-017: `DONE`
- Fase TASK-017: `DONE_RECONCILED`
- Stato TASK-016: `DONE`
- Fase TASK-016: `DONE_RECONCILED`
- Stato TASK-018: `DONE`
- Fase TASK-018: `DONE_RECONCILED`
- Stato TASK-019: `DONE`
- Fase TASK-019: `DONE_RECONCILED`
- Stato TASK-020: `DONE`
- Fase TASK-020: `DONE_RECONCILED`
- Stato TASK-021: `DONE`
- Fase TASK-021: `DONE_RECONCILED`
- Stato TASK-034: `DONE_RECONCILED_WITH_NOTES`
- Fase TASK-034: `DONE_RECONCILED`
- Stato TASK-036: `DONE`
- Fase TASK-036: `DONE`
- Stato TASK-037: `DONE`
- Fase TASK-037: `DONE`
- Stato TASK-038: `DONE`
- Fase TASK-038: `DONE`
- Stato TASK-039: `DONE`
- Fase TASK-039: `DONE_RECONCILED`
- Stato TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase TASK-040: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Stato TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase TASK-041: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Stato TASK-042: `READY_FOR_WIN7_MANUAL_TEST`
- Fase TASK-042: `REVIEW`
- Stato TASK-043: `DONE_RECONCILED`
- Fase TASK-043: `DONE_RECONCILED`
- Stato TASK-044: `DONE_RECONCILED`
- Fase TASK-044: `DONE_RECONCILED`
- Stato TASK-045: `DONE_RECONCILED`
- Fase TASK-045: `DONE_RECONCILED`
- Stato TASK-046: `DONE_RECONCILED`
- Fase TASK-046: `DONE_RECONCILED`
- Stato TASK-047: `DONE_RECONCILED`
- Fase TASK-047: `DONE_RECONCILED`
- Stato TASK-048: `DONE_RECONCILED`
- Fase TASK-048: `DONE_RECONCILED`
- Stato TASK-049: `DONE_RECONCILED`
- Fase TASK-049: `DONE_RECONCILED`
- Stato TASK-050: `DONE_RECONCILED`
- Fase TASK-050: `DONE_RECONCILED`
- Task TASK-051: `TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap`
- Stato TASK-051: `DONE`
- Fase TASK-051: `REVIEW`
- Stato TASK-052: `DONE`
- Fase TASK-052: `REVIEW`
- Stato TASK-053: `DONE`
- Fase TASK-053: `REVIEW`
- Stato TASK-054: `DONE`
- Fase TASK-054: `DONE`
- Stato TASK-055: `DONE_RECONCILED`
- Fase TASK-055: `DONE_RECONCILED`
- Stato TASK-056: `DONE_RECONCILED`
- Fase TASK-056: `DONE_RECONCILED`
- Stato TASK-057: `DONE_RECONCILED`
- Fase TASK-057: `DONE_RECONCILED`
- Stato TASK-058: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase TASK-058: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Stato TASK-059: `DONE_RECONCILED_WITH_NOTES`
- Fase TASK-059: `DONE_RECONCILED`
- Stato TASK-060: `DONE`
- Fase TASK-060: `DONE`
- Stato TASK-061: `DONE`
- Fase TASK-061: `DONE_RECONCILED`
- Stato TASK-063: `DONE`
- Fase TASK-063: `DONE_RECONCILED_INTEGRATION`
- Task TASK-063: `TASK-063 - History Sync Console cross-platform diagnostics`
- File task TASK-063: `docs/TASKS/TASK-063-history-sync-console-cross-platform.md`
- Evidence TASK-063: `docs/TASKS/EVIDENCE/history-sync-cross-platform-contract.md`
- Stato TASK-064: `DONE_RECONCILED`
- Fase TASK-064: `DONE_RECONCILED`
- Task TASK-064: `TASK-064 - Master Console Auth/Profile Parity e ricerca utenti Android/iOS`
- File task TASK-064: `docs/TASKS/TASK-064-master-console-auth-profile-parity.md`
- Evidence TASK-064: `docs/TASKS/EVIDENCE/TASK-064/README.md`
- Stato TASK-065: `REVIEW_WITH_SECURITY_BLOCKER`
- Fase TASK-065: `BLOCKED_SECURITY`
- Task TASK-065: `TASK-065 - Fix Master Console Google OAuth redirect`
- File task TASK-065: `docs/TASKS/TASK-065-fix-master-console-google-oauth-redirect.md`
- Evidence TASK-065: `docs/TASKS/EVIDENCE/TASK-065/README.md`
- Stato TASK-067: `DONE_RECONCILED`
- Fase TASK-067: `DONE_RECONCILED`
- Task TASK-067: `TASK-067 - Master Console lifecycle management, admin assignment, and safe cleanup`
- File task TASK-067: `docs/TASKS/TASK-067-master-console-lifecycle-management-admin-assignment-safe-cleanup.md`
- Evidence TASK-067: `docs/TASKS/EVIDENCE/TASK-067/README.md`
- Stato TASK-068Z: `DONE`
- Fase TASK-068Z: `DONE_RECONCILED`
- Task TASK-068Z: `TASK-068Z - CodeRabbit full review, hardening and reconciliation`
- File task TASK-068Z: `docs/TASKS/TASK-068Z-coderabbit-full-review-hardening-reconciliation.md`
- Evidence TASK-068Z: `docs/TASKS/EVIDENCE/TASK-068Z/README.md`
- Stato TASK-069: `DONE`
- Fase TASK-069: `DONE_RECONCILED`
- Task TASK-069: `TASK-069 - Full cross-platform audit Admin Web, Android and iOS sync readiness`
- File task TASK-069: `docs/TASKS/TASK-069-full-cross-platform-audit-admin-android-ios-sync-readiness.md`
- Evidence TASK-069: `docs/TASKS/EVIDENCE/TASK-069/README.md`
- Stato TASK-070: `DONE`
- Fase TASK-070: `DONE_RECONCILED`
- Task TASK-070: `TASK-070 - Full Win7POS audit and Admin Web alignment plan`
- File task TASK-070: `docs/TASKS/TASK-070-win7pos-audit-admin-web-alignment.md`
- Evidence TASK-070: `docs/TASKS/EVIDENCE/TASK-070/README.md`
- Stato TASK-071: `DONE`
- Fase TASK-071: `DONE_RECONCILED`
- Task TASK-071: `TASK-071 - Final closure and fix-all for TASK-068 / TASK-069 / TASK-070`
- File task TASK-071: `docs/TASKS/TASK-071-final-closure-task-068-069-070.md`
- Evidence TASK-071: `docs/TASKS/EVIDENCE/TASK-071/README.md`
- Stato TASK-072: `DONE`
- Fase TASK-072: `DONE_RECONCILED`
- Task TASK-072: `TASK-072 - Cross-platform catalog sync and History Entry write path for Admin Web, Android and iOS`
- File task TASK-072: `docs/TASKS/TASK-072-cross-platform-catalog-sync-history-entry-write-path.md`
- Evidence TASK-072: `docs/TASKS/EVIDENCE/TASK-072/README.md`
- Stato TASK-073: `DONE`
- Fase TASK-073: `DONE`
- Task TASK-073: `TASK-073 - Account identity display globale`
- File task TASK-073: `docs/TASKS/TASK-073-account-identity-display.md`
- Evidence TASK-073: `docs/TASKS/EVIDENCE/TASK-073/README.md`
- Stato TASK-074: `DONE`
- Fase TASK-074: `DONE_RECONCILED`
- Task TASK-074: `TASK-074 - Devices UX Polish / Owner-Friendly Device Registry`
- File task TASK-074: `docs/TASKS/TASK-074-devices-ux-polish.md`
- Evidence TASK-074: `docs/TASKS/EVIDENCE/TASK-074/README.md`
- Stato TASK-075: `DONE_RECONCILED_WITH_NOTES`
- Fase TASK-075: `DONE_RECONCILED`
- Task TASK-075: `TASK-075 - Admin Web performance audit e Products navigation latency fix`
- File task TASK-075: `docs/TASKS/TASK-075-admin-web-performance-audit-products-latency.md`
- Evidence TASK-075: `docs/TASKS/EVIDENCE/TASK-075/README.md`
- Stato TASK-076: `DONE_RECONCILED_WITH_NOTES`
- Fase TASK-076: `DONE_RECONCILED`
- Task TASK-076: `TASK-076 - Cloud Runtime Performance Fix: Admin Console tab latency, Staff, Products and full Shop navigation`
- File task TASK-076: `docs/TASKS/TASK-076-cloud-runtime-admin-console-performance.md`
- Evidence TASK-076: `docs/TASKS/EVIDENCE/TASK-076/README.md`
- Stato TASK-077: `DONE_RECONCILED`
- Fase TASK-077: `DONE_RECONCILED`
- Task TASK-077: `TASK-077 - Admin Console real-shop performance hardening`
- File task TASK-077: `docs/TASKS/TASK-077-admin-console-real-shop-performance-hardening.md`
- Evidence TASK-077: `docs/TASKS/EVIDENCE/TASK-077/README.md`
- Subtask TASK-077A: `Master Console performance audit`
- Stato TASK-077A: `DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`
- File subtask TASK-077A: `docs/TASKS/TASK-077A-master-console-performance-audit.md`
- Evidence TASK-077A: `docs/TASKS/EVIDENCE/TASK-077A/README.md`
- Subtask TASK-077B: `Performance architecture fix: Products + Master Console lightweight read models`
- Stato TASK-077B: `DONE_RECONCILED`
- File subtask TASK-077B: `docs/TASKS/TASK-077B-products-platform-lightweight-read-models.md`
- Evidence TASK-077B: `docs/TASKS/EVIDENCE/TASK-077B/README.md`
- Stato TASK-078: `DONE_RECONCILED`
- Fase TASK-078: `DONE_RECONCILED`
- Task TASK-078: `TASK-078 - Admin Console Product and History Entry detail modals`
- File task TASK-078: `docs/TASKS/TASK-078-admin-console-product-history-detail-modals.md`
- Evidence TASK-078: `docs/TASKS/EVIDENCE/TASK-078/README.md`
- Stato TASK-078B: `DONE_RECONCILED`
- Fase TASK-078B: `DONE_RECONCILED`
- Task TASK-078B: `TASK-078B - Product and History Detail Modal UI Polish`
- File task TASK-078B: `docs/TASKS/TASK-078B-product-history-detail-modal-ui-polish.md`
- Evidence TASK-078B: `docs/TASKS/EVIDENCE/TASK-078B/README.md`
- Stato TASK-078C: `DONE_RECONCILED`
- Fase TASK-078C: `DONE_RECONCILED`
- Task TASK-078C: `TASK-078C - Product Detail visual polish and History Entries month-grouped UX`
- File task TASK-078C: `docs/TASKS/TASK-078C-product-history-visual-polish-month-grouping.md`
- Evidence TASK-078C: `docs/TASKS/EVIDENCE/TASK-078C/README.md`
- Stato TASK-079: `DONE_RECONCILED`
- Fase TASK-079: `DONE_RECONCILED`
- Task TASK-079: `TASK-079 - History Entry and Catalog Pagination Unified Completion`
- File task TASK-079: `docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md`
- Evidence TASK-079: `docs/TASKS/EVIDENCE/TASK-079/README.md`
- Stato TASK-081: `REVIEW`
- Fase TASK-081: `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Task TASK-081: `TASK-081 - Win7POS Sales Sync, Daily/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`
- File task TASK-081: `docs/TASKS/TASK-081-win7pos-sales-revenue-stock-sync.md`
- Evidence TASK-081: `docs/TASKS/EVIDENCE/TASK-081/README.md`
- Stato TASK-062: `DONE`
- Fase TASK-062: `DONE_RECONCILED`
- Task attivo: `TASK-081 - Win7POS Sales Sync, Daily/Monthly Revenue, Stock Sync and Shop Admin POS Revenue`
- Task precedente: `TASK-079 - History Entry and Catalog Pagination Unified Completion`
- Ultimo task chiuso: `TASK-079 - History Entry and Catalog Pagination Unified Completion`
- Ultimo task completato: `TASK-079 - History Entry and Catalog Pagination Unified Completion`
- File task corrente: `docs/TASKS/TASK-081-win7pos-sales-revenue-stock-sync.md`
- Evidence task corrente: `docs/TASKS/EVIDENCE/TASK-081/README.md`
- Stato task: `ACTIVE`
- Fase: `REVIEW`
- Milestone interna: `TASK_081_READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`
- Responsabile: `CODEX_HANDOFF_TO_REVIEW`
- Branch previsto: `main` / no branch creation requested
- Task precedente non chiuso: `TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening`
- Stato task precedente: `REVIEW` / `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Task Vercel parcheggiato: `TASK-031 - Vercel Preview retry after environment docs`
- Task parcheggiato: `TASK-022_023 - POS live dashboard + Win7POS first login trusted device`
- Stato task parcheggiato: `PARKED_E2E_PENDING`
- Verdict TASK-026: `DONE_WITH_NOTES`
- Verdict TASK-027: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-028: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-029: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Verdict TASK-030: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-031: `BLOCKED_VERCEL_FORCES_FIRST_DEPLOYMENT_TO_PRODUCTION`
- Verdict TASK-032: `PASS_WITH_NOTES_PHASE_5_COMPLETE_PHASE_6_BLOCKED`
- Verdict TASK-033: `REVIEW_WITH_BLOCKERS`
- Verdict TASK-034: `DONE_WITH_NOTES`
- Verdict TASK-035: `DONE`
- Verdict TASK-036: `DONE`
- Verdict TASK-037: `DONE`
- Verdict TASK-038: `DONE`
- Verdict TASK-039: `DONE_RECONCILED`
- Verdict TASK-040: `PARTIAL_PASS_WITH_BLOCKERS`
- Verdict TASK-041: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Verdict finale review/fix TASK-041: `PASS_WITH_NOTES_DONE_ADMIN_WEB_RUNTIME_ONLY`
- Verdict TASK-042: `READY_FOR_WIN7_MANUAL_TEST`
- Verdict TASK-042C: `PASS_LOCAL_WIN7_MANUAL_SYNCED_WITH_NOTES` / `WIN7POS_PRODUCT_DIALOG_FIX_READY_FOR_PHYSICAL_RETEST`
- Verdict TASK-043: `AUTO_RECONCILED_TASK045`
- Verdict TASK-044: `AUTO_RECONCILED_TASK045`
- Verdict TASK-045: `AUTO_RECONCILED_TASK045`
- Verdict TASK-046: `DONE_RECONCILED`
- Verdict TASK-047: `DONE_RECONCILED`
- Verdict TASK-048: `DONE_RECONCILED`
- Verdict TASK-049: `DONE_RECONCILED`
- Verdict TASK-050: `DONE_RECONCILED`
- Verdict TASK-051: `DONE`
- Verdict TASK-052: `DONE`
- Verdict TASK-053: `DONE`
- Verdict TASK-054: `DONE_WITH_NOTES`
- Verdict TASK-055: `DONE_RECONCILED`
- Verdict TASK-056: `DONE_RECONCILED`
- Verdict TASK-057: `DONE_RECONCILED`
- Verdict TASK-058: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Verdict TASK-059: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-060: `DONE`
- Verdict TASK-061: `DONE`
- Verdict TASK-063: `HISTORY_SYNC_ALREADY_MERGED` / `TASK_TRACKING_NORMALIZED`
- Verdict TASK-065: `BLOCKED_SECURITY`
- Verdict TASK-072: `DONE_RECONCILED`
- Verdict TASK-074: `READY_FOR_REVIEW`
- Verdict TASK-067: `DONE_RECONCILED`
- Verdict TASK-079: `DONE`
- Review-fix TASK-065 2026-06-16/17: il 400 locale Supabase `Unsupported provider: provider is not enabled` e stato riprodotto su `127.0.0.1:54321/auth/v1/authorize`; `supabase/config.toml` ora abilita `[auth.external.google]` con placeholder env e `.env.example` dichiara le variabili vuote. Nella review-fix iniziale Docker e Supabase locale sono raggiungibili e il provider reindirizza a Google, ma il redirect locale contiene `client_id=env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` perche il runtime locale non ha un OAuth client reale. Review finale ha rafforzato repo-side: `next` rifiuta backslash/control chars, origin OAuth deriva da host/proxy prima di `Origin`, qualsiasi host Vercel nel flusso OAuth e bloccato, la probe server-side ha timeout 3s e client ID placeholder/invalid ha result dedicato `oauth_google_client_id_invalid`. Lo smoke `npm run smoke:oauth:local` classifica `PASS`, `BLOCKED_EXTERNAL_CONFIG` o `FAIL_CODE_REGRESSION`, controlla `/platform` e `/shop`, e blocca error page/HTTP error di Google. Un tentativo di unblock del 2026-06-17 ha caricato il Client ID Google reale in `.env` ignorato da git e GoTrue lo risolve (`*.apps.googleusercontent.com`), ma il Client Secret non e stato letto dal comando zsh e resta placeholder; Google classifica inoltre il callback locale `http://127.0.0.1:54321/auth/v1/callback` come `redirect_uri_mismatch`. Unblock finale 2026-06-17: Client Secret scritto solo in `.env` locale ignorato da git tramite prompt macOS nascosto, Supabase riavviato con output silenziato, GoTrue risolve client ID e secret reali senza placeholder, `npm run smoke:oauth:local` PASS per `/platform` e `/shop`, browser process-only locale `127.0.0.1:3055` porta Master/Admin account a `accounts.google.com/v3/signin/identifier` senza Vercel/JSON/Google error, shop-code non mostra Google. Check finali PASS: TASK-065 targeted 10/10, security scan, foundation 342/342, smoke OAuth, lint, typecheck, build con warning noti, browser smoke e git diff check. Codex non marca DONE; pronto per review e conferma esplicita utente. Follow-up: ruotare il Client Secret Google perche e stato incollato in chat durante l'unblock.
- Final DONE closure TASK-065 2026-06-17: chiusura `DONE` bloccata da sicurezza. Il Google Client Secret e stato incollato in chat dall'utente e non e possibile verificare da terminale la rotazione/revoca del secret nel Google Cloud OAuth client (`gcloud` non disponibile, screenshot non sufficiente come prova machine-readable). `~/.supabase/access-token` era presente; `supabase logout` non ha rimosso il file per profilo CLI mancante/non-interactive, quindi il file locale e stato rimosso manualmente e verificato assente. Revoca remota token Supabase non verificabile da questo runtime. Verdict finale `BLOCKED_SECURITY`; non eseguiti i gate DONE completi della closure perche il primo gate sicurezza e bloccante.
- Follow-up Win7POS TASK-029 2026-06-02: scanner legacy riconciliato e pushato in Win7POS commit `d2c3d4b`; hardening bootstrap response validation pushato in `5e35a37`; nessun cambio a Vercel, Supabase schema, catalogo Admin Web o sales sync.
- DONE reconciliation 2026-06-06: su conferma esplicita utente, TASK-046..TASK-050 chiusi a `DONE_RECONCILED`; TASK-040 e TASK-041 restano `REVIEW_WITH_EXTERNAL_BLOCKERS`, TASK-042 resta `READY_FOR_WIN7_MANUAL_TEST`. Commit/push finale su `main` richiesti dall'utente.
- TASK-051 aperto in execution il 2026-06-06 da brief allegato: provisioning fiscal identity, POS-first bootstrap, manager staff `1001`, Temporary PIN server-side, Admin Console fiscal identity read-only. `shop_code` resta tecnico e `company_rut` separato per compatibilita RUT cileno. Non applicare migration su production e non dichiarare PIN raw/audit/log/evidence.
- Handoff Codex TASK-051 2026-06-06: execution completata e pronta per `REVIEW`, senza marcare `DONE`. Migration TASK-051 applicata solo al database locale con `supabase migration up --local`; no production apply. Check freschi: TASK-051 targeted PASS, `security:scan` PASS, `test:foundation` PASS (`217/217`), `verify` PASS, `test:ui-smoke:ci` PASS (`43/43`), Supabase local migration/lint PASS, `git diff --check` PASS. `npm run db:local:status` resta `FAIL_CLOSED` per `.env.local` puntato a `supabase_cloud`.
- Review-fix Codex TASK-051 2026-06-06: `/platform/provisioning` semplificata in un unico `Create shop` form con owner setup mode interno (`POS-first`, owner personale esistente, pending owner email) e `Add POS manager` spostato in `Advanced recovery` collassato. Rimossi input editabili display name; default server-side `display_name = "manager"`. Nessuna nuova migration, nessun cambio schema, no commit/push/stage.
- Review-fix Codex TASK-051 2026-06-06: Company RUT resta formato fiscale leggibile e il `shop_code` tecnico puo essere derivato dal RUT senza separatori; recovery manager non mostra PIN esistenti e genera sempre un nuovo Temporary PIN one-time con reason/audit. Nessuna nuova migration, nessun cambio schema, no commit/push/stage.
- Review-fix Codex TASK-051 2026-06-06: visual fix su screenshot review; nel `Create shop` l'ordine e ora `Shop name`, `Company RUT`, toggle `Use Company RUT as Shop code`, `Shop code`, con `Shop name` come input single-line normale.
- Review-fix Codex TASK-051 2026-06-06: final UX/safety hardening; il copy ora dice che il Temporary PIN e mostrato una volta e dovrebbe essere cambiato dopo il primo accesso; success result include shop name, company RUT, shop code, owner mode, staff code `1001`, copy button e warning one-time. Force rotation resta follow-up perche i runtime staff web/POS correnti bloccano login con `must_change_credential = true` senza flusso first-access credential change.
- Review-fix Codex TASK-051 2026-06-06: recovery semplificata in `Emergency recovery: recover initial manager 1001`; il pannello standard mostra search/target shop, manager state read-only, reason e submit `Recover manager 1001`. Rimosse radio option multiple, `Advanced options` e staff code editabile dalla recovery principale. Il submit recovery/server boundary usano sempre `staff_code = 1001` e ignorano eventuali `staffCode` client. 1001 attivo viene resettato, sospeso/archiviato/disabled/non utilizzabile viene riattivato e resettato, mancante viene ricreato come manager `1001`; duplicati anomali falliscono chiuso senza generare credential. Guardrail ultimo manager full-access non trovato in Admin Console; follow-up: `Block removing the last full-access shop manager in Admin Console.`
- Review-fix Codex TASK-051 2026-06-06: entity pickers unificati in `/platform/provisioning` con componente `SearchableEntityPicker`; `Initial owner` e recovery `Target shop` usano search + lista selezionabile + selected summary + hidden input, senza select nativo per entita database. Owner mostra display name/short profile id/status e resta validato server-side come `shop_owner`; target shop mostra shop name/shop code/status e recovery resta sempre manager `1001`.
- Review-fix Codex TASK-051 2026-06-06: `Shop name` nel create-shop form viene normalizzato in maiuscolo alla fine dell'inserimento via blur client, e `normalizeShopName` forza comunque uppercase server-side prima delle RPC; il result banner usa il nome normalizzato.
- Review-fix Codex TASK-051 2026-06-06: form value preservation e RUT live formatting; il Route Handler provisioning restituisce `values` non sensibili su errore e non revalida la route quando fallisce, quindi i campi compilati non vengono cancellati. `Company RUT` e `Legal representative RUT` accettano digits-only e vengono formattati su blur; `shop_code` derivato resta compatto senza separatori. Audit altri form sensibili completato con follow-up separato per policy uniforme fuori provisioning.
- Review-fix Codex TASK-051 2026-06-06: provisioning layout polish; `Shop identity` mostra `Shop name` e `Company RUT` allineati nella prima riga, toggle RUT in riga dedicata e `Shop code` full width sotto. `Fiscal / Boleta identity` mette `City` e `Legal representative RUT` nella stessa riga desktop, con helper RUT lunghi rimossi/ridotti a una sola frase di sezione. Nessun cambio a schema, migration o recovery.
- Review-fix Codex TASK-051 2026-06-06: Temporary manager PIN; la credential lunga prefissata legacy e stata sostituita per bootstrap/recovery manager `1001` con un PIN temporaneo server-side a 5 cifre (`crypto.randomInt(10000, 100000)`), hashato con il meccanismo staff credential esistente e mostrato solo nella result card immediata. Copy UI aggiornato a `Temporary PIN`, `Copy PIN` e warning one-time; nessun cambio a schema, migration, Win7POS runtime, session token, device token o auth token.
- Review-hardening Codex TASK-051 2026-06-09: rimosso il path morto `src/app/platform/provisioning/actions.ts`; create-shop e recovery usano solo Route Handler same-origin. Aggiunto guard server-only condiviso per content type form, `Content-Length` obbligatorio e massimo 64 KiB, `Origin`/`Host`, `Sec-Fetch-Site: cross-site` e `no-store`; recovery manager `1001` ora usa lo stesso resolver server-only `resolvePlatformAdminForRequest` di create-shop. Latch client anti doppio POST rapido aggiunti.
- Review-completion Codex TASK-051 2026-06-09: blocker atomicita risolto con migration locale `20260609170549_task_051_transactional_provisioning_recovery.sql`; owner bootstrap, POS-first, pending owner fiscalizzato e recovery manager `1001` usano RPC transazionali user-scoped con JWT dell'utente verificato. Applicata solo a Supabase locale (`supabase migration up --local`), non production/cloud. Full local E2E TASK-051 PASS: crea shop POS-first, verifica Admin account e Shop code access, recupera manager `1001` e login con nuovo Temporary PIN. Check PASS: `supabase db lint --local --schema public,app_private --fail-on error`, TASK-051 targeted, guardrail TASK-006/016/038/054, `test:foundation` 228/228, `security:scan`, `verify`, `git diff --check`. `npm run db:local:status` resta `FAIL_CLOSED` per `.env.local` puntato a `supabase_cloud`, ma il runner E2E locale usa env Supabase CLI. TASK-051 pronto per `DONE`; Codex non marca `DONE`, no stage/commit/push.
- DONE confirmation TASK-051 2026-06-09: su conferma esplicita utente, final review senza blocker reali e check rieseguiti, TASK-051 e chiuso a `DONE`. Architettura finale confermata: client leggero -> Route Handler server-side -> resolver Platform Admin unico -> service server-only -> RPC DB transazionale/auditabile. Full local E2E TASK-051 PASS con wrapper local-only; vecchio PIN respinto e nuovo Temporary PIN accettato. `npm run db:local:status` resta `FAIL_CLOSED` per `.env.local` cloud, ma Supabase locale e disponibile e i comandi local-only passano. Nessun production/cloud apply, nessun dato reale, nessun commit, push o stage finale.
- Runtime auth regression TASK-051 2026-06-09: prova manuale utente con `platform.local@example.test` ha mostrato GET `/platform/provisioning` autorizzata ma POST create-shop/recovery `unauthorized`; il live browser Codex ha riprodotto e poi verificato recovery/create/recovery+old-PIN-rejected/new-PIN-accepted. Root cause completa: `bearer/cookie mismatch`, GET/POST auth-path mismatch tra read boundary cookie SSR/RLS e POST admin/service-role check, piu `platform:local:dev` senza env server-only locali per login staff/POS manuale. Fix applicato senza bypass RPC: submit provisioning cookie-only same-origin; `resolvePlatformAdminForRequest` autorizza cookie con lo stesso client SSR/RLS della GET, usa client user-scoped/RLS per bearer valido e fail-closed `auth_mismatch` se bearer/cookie sono utenti diversi; `platform:local:dev` carica service-role locale solo server-only, non `NEXT_PUBLIC_*`; `AuthForm` rimuove `method="post"` su server action. Boundary finale confermata: client leggero -> Route Handler same-origin -> resolver Platform Admin unico via cookie SSR/RLS -> service server-only -> RPC DB transazionale/auditabile (`platform_create_shop_with_owner_bootstrap`, `platform_create_pos_first_shop`, pending owner fiscalizzato, `platform_recover_initial_manager_1001`). Full E2E TASK-051 PASS 1/1 e manual-regression PASS 1/1 dopo il fix finale; check finali richiesti PASS/PASS_WITH_WARNINGS documentati in evidence. TASK-051 resta `DONE` in `REVIEW`; no production/cloud apply, no raw PIN/password/token in DB/log/audit/evidence, no commit/push/stage.
- Cloudflare hosting migration follow-up 2026-06-07: `wrangler.jsonc` aggiornato con ambienti `staging` e `production`, workflow separato `.github/workflows/cloudflare.yml` aggiunto, runbook `docs/DEPLOYMENT/CLOUDFLARE-MIGRATION.md` e `docs/DEPLOYMENT/CLOUDFLARE-ROLLBACK.md` creati. Decisione operativa aggiuntiva: prima fase obbligatoria solo Cloudflare staging remoto; production deploy e DNS cutover vietati finche staging remoto e smoke non sono `PASS` e l'utente non conferma esplicitamente. Nota storica: i blocker iniziali `BLOCKED_CLOUDFLARE_STAGING_IDENTITY_AND_TARGETS_NOT_VERIFIED`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` mancanti, `wrangler` non autenticato e GitHub environments non trovati sono stati superati dall'unblock TASK-058 del 2026-06-12. Restano attuali solo custom domain/DNS `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`, WAF/rate limit `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`, Supabase remote project-list `PARTIAL` e production deploy `NOT_RUN_PRODUCTION_FORBIDDEN`; Supabase Auth URLs e callback runtime cloud sono riconciliate in TASK-064C come `DONE_RECONCILED_REAL_ACCOUNT_VISIBLE`; Vercel resta parcheggiato con `git.deploymentEnabled=false`.
- TASK-052 recovery 2026-06-11: aperto per ripristinare stato compilabile dopo tentativo precedente di Shop/Admin UX polish non affidabile. Ripristinati da `HEAD` i pannelli operativi catalog/import-export/member/staff e le pagine contaminate dal tracking `actionsEnabled`; riapplicato solo polish piccolo su ShopShell, navigazione, Diagnostics e tracking. Non dichiarare `DONE`, non fare commit/push/stage e non creare dati locali o migration.
- TASK-052 final review 2026-06-11: regressione completa rieseguita dopo fix `ShopShell` `prefetch={false}` su nav protetta e logout; browser laterale autenticato su `127.0.0.1:3049` con fixture locale `TASK052_REVIEW_*`; cleanup locale completata con residui a zero. Stato resta `DONE`, non `DONE`. Rischio residuo tracciato: smoke legacy TASK-035 passa 2/3 e resta bloccato solo sulla safe view shop-owner `/shop/staff` (`Read blocked`), non su perdita sessione.
- TASK-053 aperto il 2026-06-11: fix architetturale del blocker `/shop/staff Read blocked`. La riproduzione locale ha confermato `42501 permission denied for table staff_accounts` su `staff_accounts_safe` per account personale autenticato, mentre la lettura diretta delle colonne safe gia grantate passava. Soluzione scelta: grant colonnare additivo `SELECT(web_access_revoked_at)` a `authenticated`, con RLS e `security_invoker=true` preservati; nessun service-role browser e nessun grant su `credential_hash`.
- TASK-054 aperto/allineato il 2026-06-11: stabilizzazione Shop Admin auth navigation e pulizia sidebar/diagnostics. Root cause: personal account failure/no-session poteva essere mascherato dal fallback staff-web con `No staff web session cookie is present.`; inoltre la sidebar propagava query param pagina-specifici tra sezioni. Fix: proxy Supabase passa a `getClaims()`, layout Shop usa `resolveShopAdminDataAccess()`, personal account valido vince sul fallback staff, staff-cookie missing non maschera il flusso Admin account, sidebar preserva solo `shop_id`, active state ottimistico, guardrail condivisi centralizzati in `Shop safety`, Diagnostics per-page rimossi, copy Shop Admin riallineato. Check eseguiti: targeted TASK-054 RED/GREEN, `test:foundation` 241/241, `security:scan`, `lint`, `typecheck`, `build`, `verify`, `test:shop:local` 4/4 con server esistente riusato, browser laterale e `cf:build` PASS_WITH_WARNINGS. Follow-up TASK-054C: processi Next stale su `3000`/`3049`/`3052`/`3053` fermati, host `localhost` e `127.0.0.1` testati separatamente, Safari reale verificato via `safaridriver` su `3054` con Supabase locale e cleanup sintetico a zero. Final review correttiva: drift guardrail `POS Live` corretto, Safari reale rieseguito su `3058`, E2E locale `test:shop:local` PASS 4/4, `verify` PASS_WITH_WARNINGS, `cf:build` PASS_WITH_WARNINGS, Supabase status locale/staging documentati come note ambientali. Final DONE confirmation: Safari reale rieseguito su `3059`, tutti i gate critici PASS/PASS_WITH_WARNINGS con warning non bloccanti, TASK-054 chiuso a `DONE` / `DONE_WITH_NOTES`. Commit/push finali autorizzati esplicitamente dall'utente; nessun migration, deploy production o cloud apply.
- TASK-057 aperto il 2026-06-11: Catalog Workspace su `/shop/products`,
  toolbar/dialog catalogo, import/export integrato e parser Excel intelligente.
  Stato `REVIEW`; Codex ha preparato handoff, non marca `DONE`. QA reale
  locale passato su Dingli e Database completo con prodotti, fornitori,
  categorie, `PriceHistory`, mobile history entry, export completo e cleanup
  sintetico. Nessun commit, push, stage, deploy production/cloud apply
  autorizzato.
- Review/fix finale TASK-057 2026-06-12: corretti guard same-origin/body/file
  sulle route import, detail prodotto archiviato, copy/no-store export e export
  PriceHistory completo paginato. Check finali: TASK-057 targeted `21/21`,
  TASK-028+057 targeted `27/27`, `test:foundation` `278/278`,
  `security:scan`, `typecheck`, `lint`, `build`, `verify`,
  `test:shop-admin-auth-smoke` `4/4` dopo riallineamento script al wrapper
  locale process-only, `test:platform:local` `1/1`,
  `test:platform:local-login` `PASS_WITH_SKIP` gated da conferma/password
  runtime, `db:local:status` `FAIL_CLOSED_EXPECTED` con output Supabase redatto,
  Supabase local migration/list/lint, QA Browser in-app fail-closed,
  preview redatta Dingli/Database e apply reale non rieseguito in review finale.
  Aggiunto fix di redazione per `scripts/dev-supabase-check.mjs`. Verdict TASK-057:
  `READY_FOR_DONE_CONFIRMATION`; resta `REVIEW`, non `DONE`, finche manca la
  conferma utente esplicita.
- TASK-060 resume/fix 2026-06-13: test manuale reale con workbook Dingli ha
  evidenziato falso preview `Sheet: Unknown`, errore authorization su Shop Code
  staff audit e supplier apply troppo conservativo. Fix: preview `ok:false`
  resta errore, audit staff-aware per import/export, supplier apply crea/aggiorna
  prodotti validi, quantity/retail manual-only e filtro summary Dingli piu
  conservativo. QA reale locale PASS_WITH_NOTE su
  `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx`: sheet `产品`, header
  row `10`, apply con `failed rows 0`, 101 prodotti importati e browser laterale
  lasciato sulla shop popolata. Nessun workbook reale copiato/committato,
  nessun production/cloud apply, nessun commit/push/stage.
- TASK-060 resume/fix 2 2026-06-13: aggiunti supporto `.xls`
  legacy/HTML-Excel con `@e965/xlsx`, mapping override server-side incluso nel
  digest, UI file selected/replace/upload collassabile, default/per-row
  supplier/category con suggerimenti shop-scoped e tabella preview piu ampia.
  E2E mutativo rieseguito solo su Supabase locale con workbook sintetico `.xls`
  e cleanup; dev server corrente `3000` resta cloud e non e stato usato per
  apply. Check finali: TASK-060 targeted `11/11`, `test:foundation` `295/295`,
  `lint`, `typecheck`, `security:scan`, `build` PASS_WITH_WARNINGS,
  `cf:build` PASS_WITH_WARNINGS, `npm audit` FAIL_WITH_EXISTING_WARNINGS su
  OpenNext/Wrangler/esbuild toolchain. Nessun commit/push/stage.
- TASK-060 resume/fix 3 2026-06-13: riprodotto il caso utente con Shop Code
  staff manager che vedeva `This account is not authorized for this shop
action` dopo file ready. Root cause: sessione staff scaduta/non attiva veniva
  rimappata in `unauthorized`, indistinguibile da permesso negato. Fix:
  `session_expired`/`no_active_session` tornano 401 con UX `Session expired.
Please sign in again.` e `next` preservato verso Shop Code login;
  `permission_denied` torna 403 e staff senza `catalog.import` non vede Import
  supplier Excel. Route preview/apply autorizzano prima di leggere i bytes
  workbook. E2E locale TASK-060 passa `4/4` su manager valido, sessione scaduta,
  sessione cancellata e staff senza import; targeted foundation `12/12`,
  `test:foundation` `296/296`, `typecheck`, `lint`, `security:scan`,
  `verify` e `cf:build` passano con warning noti dove gia tracciati.
  Nessun production/cloud apply,
  nessun commit/push/stage.
- TASK-060 resume/fix 5 2026-06-13: Step 1 resta l'unico punto con upload
  grande/replace/remove; Step 2 contiene default supplier/category,
  sample prodotto dalla header rilevata, contesto raw collassato e mapping
  tabellare con header Excel reali/sample values; Step 3 contiene solo
  preview/apply con tabella compatta `Product` / `Recognized` /
  `Import values`, senza default/card file e con back top-level
  Step3->Step2->Step1. Rifinitura browser review: back Step2/Step3 spostato
  nella barra titolo del dialog come freccia Android-style a sinistra del
  titolo. Stato resta `REVIEW` / `READY_FOR_REVIEW`; nessun commit/push/stage,
  nessun schema/migration/RLS/RPC.
- TASK-060 resume/fix 7 2026-06-13: corretta regressione mapping Dingli
  `purchasePrice -> 产品名2` con guardia numerica client/server piu severa
  (codici/testo con cifre non sono numeri), `Retail price` nascosto dal mapping
  supplier, `Line total` rinominato `Total price` come Android/iOS, Step 2 sample
  prima del mapping con massimo 5 righe prodotto e senza colonna Excel `Row`,
  Step 3 con `No.` prodotto invece del numero riga Excel. Check finali mirati:
  TASK-060 targeted `13/13`, `typecheck`, `lint`, `security:scan`, `build`
  PASS_WITH_WARNINGS, E2E locale `3060` `5/5`, browser laterale senza errori
  console. Stato resta `REVIEW` / `READY_FOR_REVIEW`; nessun commit/push/stage,
  nessun schema/migration/RLS/RPC.
- TASK-060 final gate 2026-06-14: usati i workbook reali richiesti dall'utente
  `/Users/minxiang/Downloads/Vs20260519-456(Dingli).xlsx` e
  `/Users/minxiang/Downloads/2604137549-Belina.xls` nella suite Playwright
  locale su browser Chromium (`7/7`). Il browser laterale in-app e stato reso
  visibile su `127.0.0.1:3060` durante la QA; il plugin non supporta
  `setInputFiles`, quindi upload/apply reali sono stati eseguiti con Playwright
  esterno sullo stesso server/Supabase locale. Corretto blocker boundary:
  preview/apply autorizzano prima di `request.formData()` e bytes workbook,
  usando `shop_id` in query validato server-side. Cleanup locale completato:
  fixture `TASK060_*`/`LIVE060_*` a zero. Check finali: TASK-060 targeted
  `13/13`, E2E real workbook `7/7` su `next start` locale, `test:foundation`
  `297/297`, `test:shop-admin-auth-smoke` `4/4`, `test:shop:local` `4/4`,
  `verify` PASS_WITH_WARNINGS e `cf:build` PASS_WITH_WARNINGS con warning
  noti. Stato resta `REVIEW`; verdict operativo
  `READY_FOR_DONE_CONFIRMATION`, non `DONE`, finche manca conferma utente
  esplicita. Nessun commit/push/stage, nessun production/cloud apply, nessun
  schema/migration/RLS/RPC.
- TASK-060 DONE confirmation 2026-06-14: conferma esplicita utente ricevuta
  con richiesta di mettere il task in `DONE`, merge su `main`, commit e push.
  Il repository era gia su `main`, quindi il merge locale e un no-op; commit e
  push finali su `main` sono autorizzati dopo rerun dei gate finali. TASK-060
  chiuso a `DONE`; stato globale torna `IDLE`.
- TASK-058 Cloudflare/OpenNext staging hardening 2026-06-12: il prompt TASK-058
  e stato trattato come conferma utente esplicita per riconciliare TASK-057
  dopo preflight reale positivo (`git status`, `git diff --check`, targeted
  TASK-057 `21/21`). Repo-controllabile completato: Vercel resta parcheggiato
  con `deploymentEnabled=false`; `wrangler.jsonc` separa staging/production e
  usa `compatibility_date` `2026-06-10`, massima data supportata dal workerd
  locale Wrangler `4.98.0`; workflow Cloudflare aggiunge smoke locale,
  staging deploy `--env staging --keep-vars`, smoke staging condizionato e
  production solo `workflow_dispatch`/branch `main`/conferme manuali; route
  import/export sensibili sono `nodejs`, dinamiche e `no-store`; runbook WAF e
  rollback aggiornati. Unblock esterno eseguito: Wrangler OAuth `PASS`,
  account Cloudflare verificato, workers.dev subdomain staging creato, Worker
  staging deployato su
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`,
  Worker staging secrets impostati per nome, GitHub environments
  `cloudflare-staging` e `cloudflare-production` creati, production environment
  con `required_reviewers`, secret GitHub `CLOUDFLARE_ACCOUNT_ID` e
  `CLOUDFLARE_API_TOKEN` configurati per staging/production senza stampare
  valori. Check reali: targeted TASK-058/legacy `65/65`, `security:scan`,
  `test:foundation` `284/284`, `typecheck`, `lint`, `build`,
  `verify` PASS*WITH_WARNINGS per warning noti Next/Node, `cf:build`
  PASS_WITH_WARNINGS con worker generato, `smoke:cloudflare:local` PASS,
  `wrangler deploy --dry-run --env staging` PASS_WITH_WARNINGS,
  `db:staging:status` PASS con env process-only, `wrangler deploy --env staging
--keep-vars` PASS, `smoke:staging` PASS `1/1`, `wrangler deployments
list/status --env staging` ROLLBACK_READ_ONLY_VERIFIED. GitHub Actions
  staging reale PASS nella run `27449125119` su commit `b9904ce`: auth
  diagnostic PASS (`cfut*`token presente, active via API),`Deploy Worker
  staging`PASS,`Smoke staging`PASS dopo install Chromium Playwright,
production skipped. La causa auth precedente era il salvataggio del comando`curl`wrapper invece del token puro nel secret staging.
Pre-merge 2026-06-13 UTC: token Cloudflare esposto ruotato senza stampare
valori, token vecchi`Edit Cloudflare Workers`revocati`2/2`, secret
`CLOUDFLARE_API_TOKEN`aggiornato negli environment GitHub`cloudflare-staging`e`cloudflare-production`, e nuova run staging
post-rotazione `27450388578` PASS (`Cloudflare build`, `Deploy staging`,
auth diagnostic, Worker deploy e smoke staging), production skipped.
Blocker residui: nessuna Cloudflare zone/custom domain per applicare WAF/rate-limit remoto,
`npx supabase projects list`non concluso per hang quindi Supabase remote
verification resta`PARTIAL`, rollback staging reale non eseguito per assenza
di precedente deployment safe noto. Deploy production, DNS cutover e Supabase
production apply `NOT_RUN_PRODUCTION_FORBIDDEN`; TASK-058 resta
`REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Snapshot storico TASK-058 pre-TASK-059: Task attivo: `TASK-058 - Cloudflare/OpenNext Staging Hardening and Deployment Governance`;
  stato globale `REVIEW_WITH_EXTERNAL_BLOCKERS`; milestone interna
  `TASK_058_REVIEW_WITH_EXTERNAL_BLOCKERS`.
- TASK-059 post-merge cleanup 2026-06-13: aperto da `main` dopo merge TASK-058
  (`b93a6e4`) su branch `codex/task-059-post-merge-supabase-readiness`.
  Cleanup documentale limita `Edit Cloudflare Workers` ai token storici
  pre-rotazione e mantiene come token CI corrente
  `TASK-058 GitHub Actions Cloudflare deploy 2026-06-13`, senza valori secret.
  Verifiche read-only: Supabase CLI `2.106.0`, GitHub `cloudflare-staging`
  metadata per nome/timestamp, `db:staging:status` PASS con env process-only;
  `npx supabase projects list --output-format json` resta
  `PARTIAL_TIMEOUT` dopo timeout controllato. Cloudflare account verificato,
  ma `zonesCount=0` e `workersDomainsCount=0`, quindi WAF/custom domain resta
  `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`. Deploy staging e production
  `NOT_RUN` in TASK-059; rollback reale non eseguito.
- Final review / DONE reconciliation TASK-059 2026-06-13: su richiesta
  esplicita dell'utente, TASK-059 riconciliato a
  `DONE_RECONCILED_WITH_NOTES` dopo verifica merge PR #1 su `main` con commit
  `d15e461` e review scope del diff. Note residue non bloccanti per TASK-059:
  Supabase remote verification `PARTIAL_TIMEOUT`, Cloudflare WAF/custom domain
  `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`, rollback staging reale non eseguito
  e production deploy `NOT_RUN`. TASK-058 resta
  `REVIEW_WITH_EXTERNAL_BLOCKERS`; TASK-040/TASK-041/TASK-042, Win7POS live,
  Sales Sync live, Cloudflare production, DNS e WAF non sono promossi.
- Snapshot pre-TASK-055 2026-06-11: Stato globale attuale: `IDLE`;
  Task attivo: `NESSUNO`.
- TASK-055 aperto il 2026-06-11: polish UI Shop Admin Console per menu laterale, header shop con nome/RUT/shop code, filtri products, card categories, card import/export e copy roles. Scope esplicitamente limitato a UI e piccolo arricchimento server-side di dati shop gia disponibili; vietati schema/migration/RLS/RPC, role editor, CRUD ruoli, nuove dipendenze, dati finti, service-role client/browser, commit/push/stage e deploy production. Handoff Codex pronto per `REVIEW`, non `DONE`. Check freschi: targeted TASK-055 RED/GREEN PASS 6/6, targeted legacy PASS 13/13, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `test:foundation` PASS 247/247, `build` e `verify` PASS_WITH_WARNINGS per warning noti Next/Node, `test:shop-admin-auth-smoke` PASS 4/4 con Supabase locale e env process-only, visual check via screenshot Playwright autenticato.
- Review-fix Codex TASK-055 2026-06-11: header `SHOP WORKSPACE` ora mostra il nome shop reale e `Company RUT` formattato (`12.345.678-9`) senza `Shop code:` nel topbar/header e senza fallback da `company_rut` a `shop_code`; Settings Shop Admin e read-only, con copy `Master Console only`, form/update rimossi e mutation server-only fail-closed `SHOP_SETTINGS_MANAGED_BY_MASTER_CONSOLE`. Fix screenshot utente: per staff manager `ShopLayout` usa ora `access.selectedShop` gia arricchito da `loadStaffShellShop`, non `principal.shop.shopCode`, quindi non mostra piu `Shop name not configured` / `Company RUT: Not configured` quando Settings ha i dati. Al momento del fix TASK-055 restava in `REVIEW`. Check finali: targeted TASK-055 RED review-fix/GREEN 7/7, targeted layout staff RED/GREEN 7/7, TASK-039 targeted 4/4, TASK-051 targeted 6/6, `test:foundation` 248/248, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS, `test:shop-admin-auth-smoke` PASS 4/4 con Supabase locale mappato process-only.
- Review-fix 2 Codex TASK-055 2026-06-11: Sync Center filter bar riallineata con input/select `h-10`, `w-full`, `min-w-0`, placeholder brevi e bottone `Apply filters` coerente; Devices e Members action cards riallineate allo stile Suppliers/Categories con card flex/min-width safe, input/select full-width, griglie responsive e bottoni `mt-auto` in basso. Nessun cambio a query param, action, permessi, device registry, members logic, schema/migration/RLS/RPC o service-role client. Al momento del fix TASK-055 restava in `REVIEW`. Check finali: targeted TASK-055 RED review-fix 2/GREEN 10/10, `test:foundation` 251/251, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS dopo rerun seriale, `test:shop-admin-auth-smoke` PASS 4/4 con Supabase locale mappato process-only.
- Review-fix 3 Codex TASK-055 2026-06-11: aggiunto frame condiviso `SHOP_ADMIN_CONTENT_FRAME_CLASS = "mx-auto w-full max-w-7xl"` per Shop Admin e rimosse le stringhe locali `mx-auto/max-w-7xl` da pagine/pannelli; `ShopSectionPage` usa lo stesso frame per PageHeader, metriche e SectionCard/table, con metriche a 4+ item su `md:grid-cols-2 xl:grid-cols-4` per evitare il desktop 3+1. Allineati Products/Categories/Suppliers filters, Sync/Audit filters, Settings card, ActionResultBanner, Catalog/ImportExport/Devices/Members/Staff action panels. Nessun cambio a business logic, auth, schema, RLS, RPC o service-role client. Check finali: targeted TASK-055 RED review-fix 3/GREEN 11/11, `test:foundation` 252/252, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS, `test:shop-admin-auth-smoke` PASS 4/4 con Supabase locale mappato process-only, `rg` frame locali PASS, Browser in-app guard locale PASS e screenshot autenticato smoke verificato.
- TASK-056 aperto e portato a `REVIEW` il 2026-06-11: Master Console shop detail editing e row navigation shortcut completati. Scope completato: single click su lista Shops mantiene selezione inspector, double click/Enter apre full detail, detail shop espone `Edit shop profile` per Shop name, Company RUT, Giro, Address, City, Legal representative RUT; update server-side Platform Admin tramite route no-store e RPC auditata `platform_update_shop_profile` con audit family `platform.shop.profile_update`. Esclusi shop_code, shop_id, owner/members, lifecycle, device state, staff/PIN/password e catalogo. No commit/push/stage, no service-role client/browser, no production/cloud apply. Check finali iniziali: targeted TASK-056 PASS 5/5, targeted tracking TASK-054/TASK-055 PASS 17/17, `test:foundation` PASS 257/257, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS, `supabase migration up --local` PASS, `supabase migration list --local` PASS con `20260611203000` allineata, `supabase db lint --local --schema public,app_private --fail-on error` PASS, `git diff --check` PASS. Il drift iniziale di `test:platform:local` e il gate skipped di `test:platform:local-login` sono stati corretti nel DONE gate finale.
- Review-fix Codex TASK-056 2026-06-11: nel primo review-fix il blocco grande inline `Edit shop profile` nel detail shop e stato sostituito da trigger `Edit` in una sezione detail e dialog accessibile. Il form esistente resta riusato dentro il dialog con reason/confirmation e preservazione valori su errore; server-side invariato con stessa route, stessa validazione, stesso resolver Platform Admin, stessa RPC auditata `platform_update_shop_profile` e nessuna nuova migration. Check review-fix: targeted TASK-056 PASS 5/5, `test:foundation` PASS 257/257, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS, `git diff --check` PASS. Browser in-app locale era bloccato da assenza sessione Master in questa fase; il DONE gate finale ha poi coperto il flusso autenticato con fixture Playwright locale.
- Review-fix 2 Codex TASK-056 2026-06-11: full detail shop completato con card read-only `Shop profile & fiscal identity` per Shop name, Shop code, Shop ID, Status, Company RUT, Giro, Address, City, Legal representative RUT, Created e Updated; valori mancanti mostrano `Not configured`. Il trigger `Edit` e stato spostato in quella card con aria-label `Edit shop profile and fiscal identity`, mentre il dialog continua a modificare solo campi gia visibili e `shop_code` resta non editabile. Aggiunta card `Operational summary` con soli aggregati boundary-safe; Products/Categories/Suppliers restano `Not available through current boundary` quando non disponibili. Nessuna nuova migration/RPC/schema, nessun dato finto, nessun service-role client/browser. Check review-fix 2: targeted TASK-056 PASS 5/5, `test:foundation` PASS 257/257, `lint` PASS, `typecheck` PASS, `security:scan` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS.
- DONE gate finale TASK-055/TASK-056 2026-06-11: su conferma esplicita utente nel brief `Final Review / DONE Gate - TASK-055 + TASK-056 Admin Web`, entrambi riconciliati a `DONE_RECONCILED`. Corretto drift E2E repo-controllabile: `test:platform:local` riallineato al provisioning TASK-051 e agli audit event transazionali; aggiunto `test:platform:local-shop-profile` con fixture sintetica Platform Admin/shop, edit dialog, update auditato, shop*code immutato e cleanup. Gate reali passati: TASK-055 targeted 11/11, TASK-056 targeted 5/5, `security:scan`, `test:foundation` 257/257, `lint`, `typecheck`, `build`, `verify`, `test:shop-admin-auth-smoke` 4/4, `test:platform:local` 1/1, `test:platform:local-login` 1/1, `test:platform:local-shop-profile` 1/1, `supabase migration list --local`, `supabase migration up --local`, `supabase db lint --local --schema public,app_private --fail-on error`, `git diff --check`. `npm run db:local:status` resta `FAIL_CLOSED` per `.env.local` puntato a `supabase_cloud`, ma container Supabase locale, RPC `platform_update_shop_profile`, migration e lint sono verificati. Cleanup locale: zero shop attivi/non archiviati `TASK035*%`, `TASK045*%`, `TASK056*%` e zero Platform Admin attivi TASK056; audit append-only e shop TASK056 archiviati possono restare. Nessun production/cloud apply, nessun dato reale, nessun commit/push/stage. Vercel/Cloudflare production, Win7POS live e Sales Sync live restano parcheggiati/non promossi.
- Prossima azione consigliata: selezionare un prossimo task esplicito da aprire in `PLANNING`/`EXECUTION`, mantenendo parcheggiati Vercel production, Win7POS live/Sales Sync live e Cloudflare production finche non esistono target, credenziali e conferma esplicita. Non marcare `TASK-041 DONE` o `TASK-040 DONE` e non dichiarare Win7POS live/Sales Sync live `PASS` finche mancano run reali/evidence.

- Final reconciliation TASK-067 2026-06-17: su review prodotto positiva e
  approvazione esplicita dell'utente, `TASK-067` e chiuso a
  `DONE_RECONCILED`. Stato tecnico riconciliato: `typecheck`, `lint`,
  `security:scan`, `test:foundation` `342/342`, `build`, `verify`,
  `git diff --check`, `supabase migration up --local`, QA autenticata e force
  purge test shop con snapshot globale/audit success tutti PASS. Production
  hard delete resta bloccato; user purge/auth.users resta fuori scope;
  TASK-065/OAuth resta task separato e non viene modificato da `TASK-067`.
  Questa reconciliation non modifica codice e non esegue commit/push/stage.
- Handoff Codex TASK-069 2026-06-19: audit cross-platform Admin Web, Android e
  iOS completato con subagenti specializzati, fix piccoli/medi applicati e
  evidence in `docs/TASKS/EVIDENCE/TASK-069/README.md`. Admin Web:
  `test:foundation` PASS 378/378, `verify` PASS, `test:shop:local` PASS 5/5,
  `git diff --check` PASS. Android: `assembleDebug` PASS,
  `lintDebug testDebugUnitTest` PASS con 524 test, `git diff --check` PASS.
  iOS: `build_sim` PASS e targeted sync/catalog `test_sim` PASS 200/200; full
  suite iOS precedente resta `FAIL_WITH_PREEXISTING_SUITE_DRIFT` 856 passed,
  25 failed, 29 skipped ed e' documentata come rischio residuo. Nessun stage,
  commit, push, merge, deploy, `db push` o migration apply eseguito. TASK-069
  passa a `REVIEW`, non `DONE`.
- Handoff Codex TASK-070 2026-06-19: audit Win7POS completato con subagenti
  specializzati e review CodeRabbit locale su diff non committato. Win7POS
  trovato in `/Users/minxiang/Projects/Win7POS`; stack reale C# WPF `.NET
Framework 4.8` x86, SQLite locale, Windows 7 first. Fix piccoli applicati:
  race SQLite supplier/category (`last_insert_rowid()`), bridge job newest,
  clean dist release, path normalization physical Win7, status strip POS,
  guardia `catalog.view` menu Prodotti, guardia `catalog.edit` creazione rapida,
  confronto PIN constant-time, HTTP Admin Web solo loopback, CSV formula
  sanitization e typo README guest. Check Win7POS: build WPF Release x86 PASS
  0 warnings/0 errors, dialog standards PASS, POS online bootstrap/client/catalog
  pull PASS, product dialog free-text PASS, bash syntax PASS, PowerShell parser
  PASS, `git diff --check` PASS. Residui: runtime fisico Win7/TLS/root certs e
  native SQLite drop non verificati; sales sync non pronto per mancanza queue,
  idempotency, client `/api/pos/sales/sync`, mapping pagamenti e policy
  refund/void; `ProductsViewModel` e `OpenCashDrawer` richiedono hardening
  dedicato. Evidence: `docs/TASKS/EVIDENCE/TASK-070/README.md`. Nessun stage,
  commit, push, merge, deploy, `db push` o migration apply eseguito. TASK-070
  passa a `REVIEW`, non `DONE`.
- Final closure TASK-071 2026-06-19: su richiesta esplicita utente, closure
  severa e fix-all di `TASK-068Z`, `TASK-069` e `TASK-070` completata.
  Riconciliazione finale: `TASK-068Z DONE`, `TASK-069 DONE`, `TASK-070 DONE`
  e `TASK-071 DONE`; evidence in
  `docs/TASKS/EVIDENCE/TASK-071/README.md`. Fix aggiuntivi: Admin Web staff
  login non enumera piu shop/staff via messaggi UI, path locali assoluti rimossi
  dai nuovi handoff/evidence, Android migration/dirty mask legacy backfill,
  Win7POS Products permission guards, CSV formula hardening, Change PIN cleanup
  in `finally`, bridge fisico `collect-logs` non maschera raccolte vuote.
  QA cleanup finale: metadata IDE Android sanificato da serial/path locali e
  backup iOS SwiftData `default.store*` spostato fuori repo in quarantena
  locale `.codex`.
  Gate critici passati: Admin Web `security:scan`, `test:foundation` 378/378 e
  `verify`; Android `assembleDebug`, targeted unit rerun e
  `lintDebug testDebugUnitTest`; iOS `build_sim` e targeted `test_sim` 200/200;
  Win7POS build Release x86 0 warnings/0 errors, static scripts e bash syntax.
  CodeRabbit Admin Web finale `BLOCKED_EXTERNAL_RATE_LIMIT`; Win7POS finale ha
  trovato 2 finding batch fisici, corretti e validati staticamente. Residui
  non bloccanti: Win7 fisico/runtime, sales sync completo, iOS full suite drift
  preesistente, Supabase migration non applicata. Dopo conferma esplicita
  successiva dell'utente, i repo gia su `main` vengono finalizzati con
  stage/commit/push; merge effettivo non necessario perche `main...origin/main`
  era gia il branch corrente.
- Avvio TASK-072 2026-06-19: aperto per override esplicito utente dal brief
  allegato `TASK-072 - Cross-platform catalog sync and History Entry write path
for Admin Web, Android and iOS`. Scope: Admin Web emette eventi sync catalogo
  e implementa History Entry write path v2; Android/iOS ricevono/applicano
  delta catalog/history con idempotenza; Sync Center mostra cursor/stato/errori
  tecnici senza confondere `sync_events` con `audit_logs`. Vietati commit,
  push, stage, production deploy/apply, dati reali, secret, service-role
  client/browser/mobile e Win7POS/POS runtime fuori lettura. Codex prepara
  handoff a `REVIEW`, non `DONE`.
- Handoff Codex TASK-072 2026-06-19: implementata la write path Admin Web per
  eventi tecnici `sync_events` catalogo/history e per History Entry v2
  server-side con audit amministrativo separato. Catalogo: le mutazioni
  prodotto/categoria/fornitore emettono eventi redatti `catalog_changed` /
  `catalog_tombstone` con `client_event_id` deterministico `admin_web:*` e
  `entity_ids` mobile-compatible. History: create/update/tombstone scrivono
  `shared_sheet_sessions` `payload_version=2`, `session_overlay.overlay_schema=1`,
  `remote_id` UUID lowercase, tombstone logico `deleted_at`, audit in
  `audit_logs` e segnale `history_changed` / `history_tombstone` con
  `session_ids`. Sync Center mostra cursor/client event e conteggio eventi
  Admin Web senza avviare sincronizzazione client. Check Admin Web PASS:
  `lint`, `typecheck`, `security:scan`, `test:foundation` 381/381 nella
  prima handoff,
  `build`, `verify`, targeted TASK-072 3/3, `test:shop:local` 5/5 e
  `git diff --check`; build/verify hanno solo warning noti Next middleware
  deprecato e Node `DEP0205`. Android PASS sullo stato corrente:
  `./gradlew assembleDebug lintDebug testDebugUnitTest`. iOS PASS:
  XcodeBuildMCP `build_sim` senza warning/errori e targeted
  `HistorySessionSyncServiceTests`, `SyncEventRecordingTests`,
  `SyncEventOutboxStateTests` 73/73; full `test_sim` non e gate per TASK-072
  perche resta `FAIL_WITH_PREEXISTING_SUITE_DRIFT` 858 passed, 23 failed,
  29 skipped su test storici non correlati. Computer Use read-only sui
  simulatori aperti conferma stato cloud collegato e conteggi locali visibili
  coerenti tra iOS/Android per prodotti 19.704, fornitori 66, categorie 35 e
  sessioni cronologia 35. Nessun commit, push, stage, deploy production/cloud
  o migration apply eseguito. In quella prima handoff lo scope device
  auto-registration era ancora separato; l'addendum successivo qui sotto lo
  include esplicitamente. TASK-072 passa a `REVIEW`, non `DONE`.
- Handoff addendum TASK-072 device auto-registration 2026-06-19: su override
  esplicito utente, completata registrazione automatica device per
  Android/iOS/POS login/sync senza commit/push/stage. Admin Web: migration
  additiva `20260619123000_task_072_device_auto_registration.sql` con
  `last_seen_profile_id`, `last_seen_staff_id`,
  `last_seen_principal_kind`, helper ricorsivo anti metadata sensibili e RPC
  `shop_device_register_current_owner` owner-scoped senza `shop_id` client;
  read model `/shop/devices` mostra registry autorizzato, ultimo account/staff
  visto, app version, last seen/sync e sezione read-only `Detected sync
clients` da `sync_events.source_device_id` come hint non autorizzativo.
  POS server: first login/heartbeat preservano o bloccano device
  `revoked`/`suspicious`; catalog pull e sales sync richiedono device active.
  Android: install id UUID stabile in Room tramite `SyncEventDeviceStateDao`,
  RPC best-effort dopo auth/foreground/network con metadata redatti. iOS:
  install id UUID stabile in `UserDefaults`, RPC best-effort dopo
  auth/foreground/sync trigger e stesso id come `sourceDeviceID`. Check PASS:
  Admin Web `lint`, `typecheck`, `security:scan`, `test:foundation` 385/385,
  `build`, `verify`, smoke `/shop/devices` 1/1, test device auto-reg 4/4;
  Android `./gradlew assembleDebug lintDebug testDebugUnitTest`; iOS
  XcodeBuildMCP `build_sim` 0 warning/errori e targeted sync/outbox `58/58`
  con warning solo in test storici non toccati. Nessuna migration/apply
  production/cloud. Residuo: Android/iOS non consumano ancora
  `shop_devices.status` per enforcement completo client-side; resta follow-up.
  TASK-072 resta `REVIEW`, non `DONE`.
- Addendum TASK-072 iOS Device Runtime Registration Live Gate 2026-06-19:
  verificato su cloud dev e iPhone 17 Pro Simulator che una sessione owner
  mappata registra `iOS arm64` in `shop_devices` e lo rende visibile in
  `/shop/devices`. Fix finale iOS: auth gate prima della RPC, logging redatto e
  decode `ok/code`; test negativo conferma che un device revocato non torna
  active con re-register. Stato `PASS_WITH_NOTES`; enforcement mobile completo
  di `shop_devices.status` resta follow-up.
- Final gap closure TASK-072 2026-06-19: chiusura richiesta esplicitamente
  dall'utente e riconciliata a `DONE_RECONCILED`. La RPC read-only
  `shop_device_status_current_owner` resta owner-scoped e non accetta
  `shop_id` client; register/heartbeat preservano device revoked/suspicious e
  metadata redatti. Android live auth gate ora passa sullo stesso install id:
  active -> revoked blocca manual/automatic/cloud write -> active ripristina
  can_write; nessun service-role in app/mobile e nessun token salvato. iOS live
  gate confermato con build/test/launch simulator. `/shop/devices` smoke
  autenticato PASS con fixture temporanea e screenshot evidence. Supabase
  harness deterministico PASS, incluso negativo revoked non riattivato e
  blocco metadata sensibili. `test:foundation` riallineato e PASS 390/390;
  TASK-049/TASK-073 targeted PASS. Nessun commit, push o stage.
- Avvio TASK-073 2026-06-19: aperto per override esplicito utente dal brief
  allegato `Account identity display globale: email, provider e icona`.
  Scope: modello e componente riusabile per account personali web/Supabase
  Auth, provider da fonte Auth reale quando disponibile, fallback Unknown senza
  deduzione da dominio email, applicazione a Shop Admin Console e Master
  Console dove compaiono profili/account/owner/manager/admin/actor. Shop Admin
  resta shop-scoped e Staff POS resta separato. Vietati nuove dipendenze,
  schema/migration, service-role client/browser, commit, push, stage e deploy.
  Stato iniziale: handoff a `REVIEW`; superato dalla closure review successiva
  che chiude TASK-073 a `DONE`.
- Closure review Codex TASK-073 2026-06-19: chiuso a `DONE` su richiesta
  esplicita utente e in base all'eccezione `GLOBAL-REVIEW-001`. Confermata
  review tecnica: provider solo da Supabase Auth server-side, nessuna deduzione
  da dominio email, Shop Admin bounded by profile id shop-scoped, Master Console
  tramite boundary platform autorizzato, Staff POS separato dagli account
  personali. Risolto `BLOCKED_TASK035_DEVICE_CREATE` applicando le migrazioni
  locali pendenti (`20260619044500`, `20260619123000`, `20260619173000`) e
  ricaricando la schema cache PostgREST nel runner locale. Aggiornato
  `test:platform:local-users` per le semantiche correnti della directory
  account personali. Check: `lint` PASS con 8 warning noti, `typecheck` PASS,
  targeted TASK-073 3/3 PASS, `test:foundation` 390/390 PASS,
  `test:shop:local` 5/5 PASS, `test:platform:local-users` 1/1 PASS, `verify`
  PASS, `git diff --check` PASS. Evidence visuale autenticata salvata in
  `docs/TASKS/EVIDENCE/TASK-073/` per Shop Members, Shop Audit, Master Users,
  Platform Admins, Shop Admins e Shop detail/ownership. Browser plugin tentato
  ma webview attach in timeout; fallback Playwright autenticato accettato come
  evidence equivalente. Nessun commit, push o stage.
- TASK-072D final bidirectional runtime E2E 2026-06-19: su nuovo brief utente,
  TASK-072 e stato riaperto operativamente per completare evidence runtime
  bidirezionale Admin Web <-> Android <-> iOS prima della conferma finale.
  Admin seed/verify/idempotency/negative RLS passano su cloud dev
  non-production con prefisso `TASK072D_ADMIN_20260619T185924Z_`.
  Android harness live passa con `adminReceiver=pass` e poi con
  `iosReceiver=pass`; iOS harness live passa con Android receive
  `applied_products_3_history_3` e Admin history receive `1`.
  Cleanup remoto `TASK072D_` tombstona solo righe sintetiche, post-verify
  products/categories/suppliers/history `active=0`; cleanup locale Android
  passa con tutti i contatori a `0`; iOS cleanup locale e dry-run only e rimanda
  al backend gia pulito. Computer Use tentato su Safari/Simulator/Android
  Studio ma `get_app_state` fallisce con `cgWindowNotFound`, quindi evidence
  primaria resta harness programmatica. Stato corrente:
  `READY_FOR_DONE_CONFIRMATION`, non `DONE`; serve conferma esplicita utente.
- Final DONE gate TASK-072 2026-06-19: su brief esplicito `TASK-072 Final
Review / DONE Gate / Commit Readiness`, completata la riconciliazione finale
  a `DONE_RECONCILED`. Evidence visuale sostitutiva salvata con
  browser/Playwright, `adb exec-out screencap` e `xcrun simctl` screenshot;
  iOS store query conferma active TASK072D `0` e outbox TASK072D `0` separando
  due `localOnly` preesistenti; Android DB query conferma active/refs/outbox
  TASK072D `0`; Admin read-only DB check conferma active direct rows `0` e
  duplicate keys `0`. Gate freschi passano: Admin security scan, targeted
  TASK-072 `5/5`, foundation `390/390`, typecheck, lint senza warning, build,
  verify, `test:shop:local` `5/5`; Android `assembleDebug`,
  `lintDebug testDebugUnitTest`, authorization unit e compile androidTest; iOS
  XcodeBuildMCP `build_sim` e selected sync/history/catalog/outbox tests
  `121/121`; `git diff --check` e cached empty nei tre repo. Nessun commit,
  push, stage, deploy o production migration apply.
- TASK-074 Devices UX Polish 2026-06-19: aperto come task UI owner-friendly
  sopra il registry TASK-072 gia enforced. `/shop/devices` passa da tabella
  generica a vista dedicata con header `Revocation enforced`, summary cards,
  filtri/search, card registry, separazione `Account personale usato` /
  `Staff POS usato`, diagnostic/test devices raggruppati, sync activity hints
  non autorizzativi e manual fallback chiuso in `Advanced manual actions`.
  Nessuna migration, nessuna modifica RPC/RLS/enforcement, nessuna service-role
  client-side. Final visual review richiesta dall'utente il 2026-06-19:
  corretto copy sync hints da mapped shop owner a mapped shop inventory source,
  reso robusto il copy button se la clipboard non e disponibile e preservato
  badge/kind diagnostico anche nel filtro `Diagnostics / Test`. Gate finali:
  in-app browser autenticato PASS, smoke `/shop/devices` local Supabase PASS,
  negative revoked-register PASS, security/foundation/typecheck/lint/build/verify
  PASS, `git diff --check` PASS e nessun file staged. Stato finale:
  `DONE`; fase: `DONE_RECONCILED`; verdict finale: `DONE`.
- Avvio TASK-075 2026-06-19: aperto per brief utente allegato
  `TASK-075 - Admin Web performance audit e Products navigation latency fix`.
  Scope: audit performance/rendering/navigation su Master Console e Admin
  Console, priorita `/shop/products`; loading skeleton Admin Console/Products;
  navigazione sidebar piu reattiva senza prefetch di azioni mutative; read
  model Products leggero per opzioni catalogo; instrumentation dev/test dietro
  `ADMIN_WEB_PERF_DEBUG=1`; evidence before/after e handoff a `REVIEW`.
  Vietati commit, push, stage, deploy production/cloud apply, nuove dipendenze,
  dati reali/secret e service-role lato client/browser. Stato iniziale:
  `EXECUTION`, non `DONE`.
- Handoff TASK-075 2026-06-19: fix completato e pronto per `REVIEW`.
  Products non carica piu il read model inventario completo al primo render:
  usa `getShopInventoryProductsPage` per count/range e
  `getShopCatalogOptionsReadModel` per sole opzioni categorie/fornitori,
  senza `inventory_product_prices` nel percorso opzioni. Permessi Products
  consolidati in `resolveShopPageAccessBundle`; loading segment aggiunti per
  `/shop` e `/shop/products`; sidebar Shop usa prefetch manuale su intento
  utente (`hover`/`focus`/`touch`) senza prefetchare logout o azioni mutative;
  instrumentation server opt-in con `ADMIN_WEB_PERF_DEBUG=1` e metadata
  redatti/troncati. Gate PASS: security scan, foundation `396/396`,
  typecheck, lint, build, verify, browser smoke non autenticato Products
  (`100` righe, filtri, paginazione top/bottom, zero console error),
  `curl -I` su `/shop/products` e `/auth/login` con security headers. Smoke
  autenticati locali `test:shop:local` / `test:shop-admin-auth-smoke`:
  `BLOCKED_ENV` per `.env.local` puntato a `supabase_cloud`, dev server
  preesistente e timeout Playwright/auth harness; nessun PASS inventato.
  Nessun commit, push, stage, deploy o production/cloud apply. Verdict
  operativo Codex: `DONE_READY`, attesa review/conferma utente per `DONE`.
- Avvio TASK-076 2026-06-19: aperto per brief utente allegato
  `TASK-076 - Cloud Runtime Performance Fix: Admin Console tab latency, Staff,
Products and full Shop navigation`. Scope: audit/fix performance cloud reale
  autenticata della Shop Admin Console, non solo Products; baseline e after su
  `/shop/products`, `/shop/staff` e route principali Shop; feedback immediato
  sidebar/pending/skeleton; tracing server-only opt-in; read model/data-access
  ottimizzati in modo piccolo e misurabile; nuovo harness cloud performance con
  dataset sintetico `TASK076_*` e cleanup. Vietati production deploy/apply,
  secret in repo/evidence, service-role client/browser/mobile, dati reali
  permanenti, grandi refactor non misurati, commit, push e stage. Stato
  iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-076 2026-06-19: stato operativo `REVIEW_WITH_NOTES`, non
  `DONE`. Aggiunto harness `npm run test:shop:cloud-performance` con fixture
  cloud/staging `TASK076_*`, service-role solo nel processo Playwright,
  cleanup verificato a zero residui e report JSON before/after. Deploy
  non-production completato su Cloudflare staging
  `merchandise-control-admin-web-staging`, Version ID
  `d266644d-78e0-4ccd-8da2-0844ab91a175`; nessun deploy/apply production.
  Baseline: pending/skeleton `not_observed` su tutte le route,
  `/shop/import-export` non presente in sidebar, History timeout. After:
  pending osservato entro `12-33ms` sulle route completate; Products `965ms`,
  Staff `887ms`, Import/Export navigabile `868ms`, Devices `901ms`, Members
  `875ms`, Settings `929ms`, Roles `130ms`; `/shop/history` mantiene TTFB
  `237ms` e pending `20ms` ma final marker in timeout nel click-flow cloud.
  Gate PASS: security scan, targeted foundation 11/11, typecheck, lint, build,
  verify, cloud authenticated performance baseline/after, staging deploy,
  `git diff --check`. Rischio residuo: follow-up mirato History read
  model/rendering prima di eventuale `DONE_READY`.
- Avvio TASK-077 2026-06-20: aperto per brief utente
  `TASK-077 - Admin Console real-shop performance hardening`. Scope: misurare
  cloud real-shop read-only oltre alla fixture sintetica; sostituire vecchio
  contenuto con skeleton target durante navigazione pending; alleggerire
  Categories/Suppliers senza full inventory read model; consolidare Staff in
  `resolveStaffPageBundle`; ottimizzare History list light e Overview
  progressiva; estendere harness a Products, Staff, History, Categories,
  Suppliers e Overview per fixture e real-shop. Vietati production deploy/apply,
  service-role client/browser, dati reali in log/evidence, dati finti nella
  modalita real-shop, modifiche Android/iOS/POS e `DONE` senza evidence
  cloud real-shop. Stato iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-077 2026-06-20: stato operativo `REVIEW_WITH_NOTES`, non
  `DONE`. Implementato skeleton target in `ShopShell` durante
  `pendingNavigation`, read model leggeri per Categories/Suppliers senza full
  inventory, `resolveStaffPageBundle` server-only, History list light senza
  `count exact`/diagnostics nel primo paint e Overview su card leggere.
  Harness aggiunto con `npm run test:shop:cloud-performance:task077`, dataset
  `fixture`, `real-shop` o `both`, app locale con Supabase cloud e report
  redatti. Fixture before: `/shop/history` in timeout. Fixture after su app
  locale TASK-077 + Supabase cloud: sostituzione visiva completa entro `40-69ms`
  su Overview, Products, Categories, Suppliers, Staff e History; History passa
  da timeout a `1425ms`. Real-shop read-only before/after resta
  `BLOCKED_NO_REAL_SHOP_CANDIDATE`: discovery redatta conferma candidati cloud
  solo sintetici per lo scope, quindi nessun dato finto usato. Gate eseguiti:
  security scan, foundation `406/406`, typecheck, lint, build, verify, cloud
  fixture after e `git diff --check`; build/verify con warning preesistenti su
  `middleware` deprecato e `[DEP0205]`. Nessun deploy production/staging,
  nessun Supabase apply, nessun commit/push/stage.
- Final review TASK-077 2026-06-20: verdict `CHANGES_REQUIRED`, non `DONE_READY`.
  Verifica Git: TASK-077 non e presente in `HEAD`/`main`; file task/evidence e
  harness restano nel worktree locale non committato/pushato. Verifica staging
  Cloudflare read-only: ultimo deploy staging precedente a TASK-077, quindi
  nessuna prova che lo staging contenga le modifiche. Real-shop read-only
  local-cloud su shop autorizzato e report redatti: visual replacement entro
  `35-59ms`; Staff `849ms`, History `842ms`, Sync `841ms`; Products resta sopra
  soglia con final marker `4419ms`. Gate finali rilanciati: `security:scan`
  PASS, `test:foundation` PASS `409/409`, `typecheck` PASS, `lint` PASS,
  `build`/`verify` PASS_WITH_WARNINGS per warning preesistenti, `git diff
  --check` PASS. Nessun commit, push, staging deploy, production deploy o
  Supabase apply eseguito.
- Subtask TASK-077A 2026-06-20: audit separato Master Console, senza mischiare
  il fix Products. Benchmark local-cloud production-like su Supabase
  cloud/staging env con `next build` + `next start`,
  `ADMIN_WEB_PERF_DEBUG=1` e report redatto in
  `docs/TASKS/EVIDENCE/TASK-077A/task-077a-platform-performance-local-cloud-before.json`.
  Pending visuale osservato su tutte le route (`24-49ms`), quindi lo skeleton
  non e il blocker. Route sopra soglia: `/platform/users` `2861ms`,
  `/platform/shop-admins` `2847ms`, `/platform/admins` `2835ms`,
  `/platform/shops` `2841ms`. Root cause: queste route caricano
  `getPlatformAdminReadModel` con Auth identities e mobile inventory count,
  `24` query/server render; count `inventory_product_prices` e
  `inventory_products` dominano i trace. Stato `CHANGES_REQUIRED`, non `DONE`.
- Avvio TASK-077B 2026-06-20: aperto subtask di execution mirata per correggere
  i due blocker architetturali rimasti senza audit generico: Products
  real-shop/local-cloud sopra soglia e Master Console ancora legata al read model
  Platform globale. Scope: misurare Products con `ADMIN_WEB_PERF_DEBUG=1`,
  eliminare count/render/payload non indispensabili dal primo paint Products,
  introdurre read model Platform leggeri per overview/users/shop-admins/admins/
  shops/audit/system e rieseguire benchmark Shop + Platform. Nessun
  commit/push/deploy senza conferma utente.
- Final review TASK-077B 2026-06-20: verdict tecnico `DONE_READY`, non `DONE`
  senza conferma utente. TASK-077 resta `REVIEW_WITH_DONE_READY_NOTES`;
  TASK-077A e `SUPERSEDED_BY_TASK_077B_DONE_READY`. Products real-shop dopo
  fix: final marker `95ms`, document `818ms`, query `5`, server trace
  `1150.2ms`, RSC `577B`. Fixture dopo fix: Products `55ms`, Categories
  `52ms`, Suppliers `68ms`, Staff `50ms`, History `49ms`, Sync `49ms`.
  Platform dopo read model leggeri: route finali `817-873ms`, query
  route-specifiche `3-11`. Gate finali rilanciati: `security:scan` PASS,
  `test:foundation` PASS `409/409`, `typecheck` PASS, `lint` PASS, `build`
  PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS, `git diff --check` PASS.
  Warning residui: convenzione Next.js `middleware` deprecata in favore di
  `proxy` e Node `[DEP0205]`. Nessun commit, staging, push, deploy o Supabase
  apply eseguito.
- DONE Seal TASK-077/TASK-077A/TASK-077B 2026-06-20: accettazione finale
  esplicita utente dopo review tecnica positiva. TASK-077 e TASK-077B chiusi
  in `DONE_RECONCILED`; TASK-077A chiuso in
  `DONE_RECONCILED_AS_SUPERSEDED_BY_TASK_077B`. Master Plan riportato a
  `IDLE` senza task attivo. Restano non eseguiti per scelta: commit, stage,
  push, deploy, production apply e Supabase apply.
- Final DONE reconciliation TASK-075/TASK-076/TASK-077/TASK-077A/TASK-077B
  2026-06-20: su richiesta esplicita utente, rieseguiti benchmark
  local-cloud/read-only con Supabase cloud/staging env e gate finali.
  TASK-075 e TASK-076 riconciliati a `DONE_RECONCILED_WITH_NOTES` perche i
  residui storici sono stati superati da TASK-077B. Products real-shop:
  `finalMs=94ms` nel run Products-only e `77ms` nel run Admin completa,
  `queryCount=5`, count exact differito. History real-shop: `finalMs=46ms`,
  fuori timeout. Fixture: Products `51ms`, History `46ms`. Platform:
  final marker `819-860ms`, Users/Admins/Shops/Shop Admins su read model
  leggeri senza mobile counts nel first paint. Gate freschi:
  `security:scan` PASS, `test:foundation` PASS `414/414`, `typecheck` PASS,
  `lint` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS,
  `git diff --check` PASS, redaction/temp cleanup PASS. Nessun commit, stage,
  push, deploy o Supabase apply eseguito.
- Handoff TASK-078 2026-06-20: aperto da brief utente per Product Detail
  Modal, Product Edit inline, History Entry Detail Modal e History Entries list
  piu leggibile. Stato operativo `REVIEW`, non `DONE`. Detail prodotto,
  storico prezzi, righe History e diagnostica sono lazy via route handler
  no-store, senza reintrodurre full read model nel primo render Products.
  Gate finali: targeted TASK-078 PASS 5/5, `typecheck` PASS, `lint` PASS,
  `security:scan` PASS, `test:foundation` PASS 414/414, `build` e `verify`
  PASS_WITH_WARNINGS per warning noti Next `middleware` deprecato e Node
  `[DEP0205]`, `git diff --check` PASS, probe HTTP locale `/shop/products`
  PASS su dev server esistente `127.0.0.1:3055`. Non eseguiti: commit, stage,
  push, deploy, Supabase apply, smoke browser autenticato su dataset reale.
- Handoff TASK-078B 2026-06-20: follow-up polish UI/UX su Product e History
  detail modals. Stato operativo `REVIEW`, non `DONE`. Product modal ora e piu
  compatto/mobile fullscreen, edit resta nello stesso modal con Save/Cancel in
  header sticky, Archive/Restore sono in Advanced/Danger, Prices mostra prezzi
  correnti e Inventory/Sync usa label owner-friendly. History list non usa piu
  `Open Detail` come valore dati; History detail ha summary reale, row filters
  client-side sul payload bounded, `-` per celle assenti, shortcut prodotto
  disabilitato se non risolto e diagnostics redatti collassati. Guardrail
  performance invariato: detail/storico/diagnostica solo lazy via route handler
  no-store, nessun full read model nel first render. Gate finali: targeted
  TASK-078 PASS 5/5, targeted i18n TASK-062/TASK-068 PASS, `typecheck` PASS,
  `lint` PASS, `security:scan` PASS, `test:foundation` PASS 414/414, `build`
  e `verify` PASS_WITH_WARNINGS per warning noti Next `middleware` deprecato e
  Node `[DEP0205]`, `git diff --check` PASS, probe HTTP locale
  `/shop/products` PASS su dev server esistente `127.0.0.1:3055`. Visual
  screenshot modali `NOT_RUN_AUTH_REQUIRED`; non eseguiti commit, stage, push,
  deploy o Supabase apply.
- Handoff TASK-078C 2026-06-20: follow-up visual polish e month-grouped UX per
  Product Detail, Product Edit, Product list, History Entries e History Entry
  Detail. Stato operativo `REVIEW`, non `DONE`. Product modal ora usa icone,
  chip barcode/item code copiabili, summary cards e sezioni Overview/Prices/
  Inventory piu leggibili; Product list mostra supplier/category e mantiene
  azioni Detail/Edit/Archive visibili senza caricare detail nel first render.
  History list usa client filters sulle righe visibili, default
  `Active + issues`, search, filtro periodo e grouping per mese; History detail
  mostra rows/missing/linked/sync con diagnostics redatti collassati e preview
  Excel header-aware per No., item code, barcode, product, quantity, purchase e
  retail. Guardrail performance invariato: `/shop/products` usa
  `includeExactTotals: false`, `/shop/history` usa il read model list light e i
  dettagli restano lazy/no-store. Gate finali: visual Playwright locale con
  fixture sintetica TASK078C `PASS`, `test:foundation` PASS 414/414, targeted
  TASK-078 PASS 5/5, targeted i18n TASK-062/TASK-068 PASS, `typecheck` PASS,
  `lint` PASS, `security:scan` PASS, `git diff --check` PASS. Nessun commit,
  stage, push, deploy, production apply o Supabase apply eseguito.
- Final Review / DONE Reconciliation TASK-078/TASK-078B/TASK-078C 2026-06-20:
  su richiesta esplicita utente, eseguita review completa e corretti i difetti
  repo-controllabili trovati. Stati finali: `TASK-078` `DONE_RECONCILED`,
  `TASK-078B` `DONE_RECONCILED`, `TASK-078C` `DONE_RECONCILED`. Correzioni:
  label i18n History list/detail mancanti, regressione `loadHistorySummary`
  nella History list light, test smoke locale ancora legato alla vecchia copia
  pagination `11+`, summary card History `Source` troppo alta con valori
  lunghi, guardrail statico TASK-054 non aggiornato al nuovo ultimo task
  chiuso. Guardrail confermati: `/shop/products` resta light con
  `includeExactTotals: false`; `/shop/history` usa il read model list bounded
  senza summary exact nel first render; Product/History detail sono lazy via
  route handler no-store; diagnostics redatti/collassati. Gate finali:
  targeted TASK-078 PASS 5/5, targeted History sync console PASS 6/6,
  targeted Product list readability PASS 6/6, targeted i18n TASK-062/TASK-068
  PASS, `security:scan` PASS, `test:foundation` PASS 414/414, `typecheck`
  PASS, `lint` PASS, `build` PASS_WITH_WARNINGS, `verify` PASS_WITH_WARNINGS,
  `test:shop:local` PASS 5/5, visual Playwright TASK-078C locale PASS,
  cleanup locale TASK078C PASS con count redatti a zero, `git diff --check`
  PASS. Warning residui: convenzione Next.js `middleware` deprecata in favore
  di `proxy` e Node `[DEP0205]`; nessun commit, stage, push, deploy,
  production apply o Supabase apply eseguito. Worktree note:
  `src/app/shop/_components/DeviceRegistryView.tsx` resta modifica fuori
  scope preesistente e non e inclusa nella riconciliazione TASK-078C.
- Avvio TASK-079 2026-06-21: aperto da brief utente allegato
  `TASK-0XX - History Entry list/detail mobile parity read-only`.
  File task legacy:
  `docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079-history-entry-read-only-mobile-parity.md`.
  Scope: allineare lista e Detail History Entries alla UX mobile Android/iOS in
  sola lettura; data primaria da timestamp/data sessione reale, `updated_at`
  solo secondario, titolo sessione centralizzato, summary/stati derivati solo
  da diagnostici/metadata/overlay/sync events reali, Detail read-only con
  quantita/prezzi estratti preservati e diagnostica redatta collassata. Vietati
  editing quantita/prezzi, realtime sync, migration, nuove colonne, nuove
  dipendenze, endpoint mutativi, service-role client/browser, Android/iOS/POS,
  commit, stage, push, deploy e Supabase apply. Stato iniziale: `EXECUTION`,
  non `DONE`.
- Handoff TASK-079 2026-06-21: stato operativo `REVIEW`, non `DONE`.
  Implementati helper server-side `buildHistorySessionDisplayTitle`,
  `resolveHistorySessionEntryDate` e `deriveHistorySessionSyncState`; lista
  History light usa `shared_sheet_session_diagnostics` quando disponibile,
  raggruppa/filtra su `timestamp`/`entryDate`, mantiene `updated_at` solo come
  `Updated`, mostra summary righe/completed/missing/overlay e sync-state solo da
  dati reali o fallback `Sync state not available`. Detail modal resta
  read-only/no-store, header sticky mostra supplier/category/source/date/status,
  diagnostica redatta resta collassata e `quantity`/`purchasePrice`/
  `retailPrice` estratti da `ShopHistoryTablePreviewRow` non vengono piu
  sovrascritti quando presenti. Check reali: targeted TASK-079 PASS 3/3,
  `typecheck` PASS, `lint` PASS, `build` PASS_WITH_WARNINGS per warning noti
  `middleware`/`DEP0205`, `verify` PASS_WITH_WARNINGS, `git diff --check`
  PASS. Guardrail extra TASK-078 eseguito e `FAIL_NON_GATE` 1/5 su Products
  page preesistente (`includeExactTotals: false` static check), non corretto in
  TASK-079 per evitare scope creep. Nessun commit, stage, push, deploy,
  migration o Supabase apply.
- Avvio TASK-079B 2026-06-21: aperto da brief utente allegato
  `TASK-079B - Supplier Import to Canonical History Entry + Mobile Sync`.
  File task legacy:
  `docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/TASK-079B-supplier-import-canonical-history-mobile-sync.md`.
  Scope: dopo Apply/import supplier confermato creare o aggiornare una History
  Entry canonica in `shared_sheet_sessions` compatibile Android/iOS, senza side
  effect in preview, con `remote_id` stabile/idempotente, data semantica in
  `timestamp`, overlay mobile-compatible, `shop_id` selezionato, owner mapping
  quando richiesto dal bridge, sync event solo se supportato dal contratto reale
  e UI successo con link History. Include fix diretto del guardrail Products
  `includeExactTotals: false` se ancora regressivo. Vietati migration/schema,
  nuove dependency, campi inventati, secret/client service-role, modifiche
  mobile/POS, commit, stage, push, deploy e Supabase apply. Stato iniziale:
  `EXECUTION`, non `DONE`.
- Handoff TASK-079B 2026-06-21: stato operativo `REVIEW`, non `DONE`.
  Implementato mapper canonico supplier import -> History Entry in
  `shared_sheet_sessions`: `remote_id` UUID lowercase deterministico da
  `shop_id` + `preview_digest`, `timestamp` UTC `yyyy-MM-dd HH:mm:ss`,
  `payload_version: 2`, `session_overlay.overlay_schema: 1`, `data` come
  `[[String]]`, `is_manual_entry: false`, supplier/category summary,
  `deleted_at: null`, `shop_id` e `owner_user_id`. Apply supplier confermato
  crea o aggiorna la stessa entry in modo idempotente, gestisce race `23505`,
  scrive audit e `sync_events` solo con contratto mobile reale
  `domain="history"`, `event_type="history_changed"`,
  `entity_ids.session_ids`. Preview resta side-effect-free. UI import avvisa
  che l'Apply creera/aggiornera una History Entry e dopo successo mostra link
  a `/shop/history/<remote_id>?shop_id=<shop_id>`. Corretto anche Products a
  `includeExactTotals: false`. Contratto Android/iOS verificato da source
  reale; smoke browser import->History e smoke Android/iOS non eseguiti per
  harness/credenziali locali mutative non pronti, documentati in evidence come
  `NOT_RUN`. Check reali: targeted TASK-079B PASS 3/3, targeted TASK-078 PASS
  5/5, targeted TASK-079 PASS 3/3, targeted TASK-077 PASS 8/8, `typecheck`
  PASS, `lint` PASS, `build` PASS_WITH_WARNINGS per warning noti
  `middleware`/`DEP0205`, `verify` PASS_WITH_WARNINGS, `test:foundation` PASS
  420/420, `git diff --check` PASS. Nessun commit, stage, push, deploy,
  migration, production apply o Supabase apply.
- Avvio TASK-079C 2026-06-21: aperto da brief utente allegato
  `TASK-079C - History Entry UX, Detail Performance, Editable Generated Screen
  Parity`. Scope: migliorare lista History Entries in stile mobile, rendere il
  Detail piu veloce e operativo in stile generated/import supplier, permettere
  modifica sicura di `quantity` e `retail/sale price`, aggiornare
  `shared_sheet_sessions.data`, `session_overlay`, audit e
  `sync_events.history_changed`, verificare browser/Admin Web e creare harness
  local-only per Android/iOS se non e disponibile un harness reale. Vietati
  nuove dependency, schema/migration/RLS/RPC, tabelle web-only, service-role
  client/browser, secret, commit, stage, push, deploy e Supabase apply. Stato
  iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-079C 2026-06-21: stato operativo
  `REVIEW_READY_FOR_DONE`, non `DONE`. Lista History Entries resa piu
  mobile-like con chip `Rows`/`Completed`/`Missing`/`Sync`, diagnostica fuori
  dalla card primaria e chip mese selezionato. Detail History Entry reso piu
  operativo con summary, tabs, tabella sticky, risoluzione prodotti batch via
  `getShopInventoryProductsByCodes` invece del lookup N+1 bounded precedente,
  e editing sicuro di `quantity` e `retail/sale price`; `purchasePrice` resta
  read-only. Save server-side aggiorna `shared_sheet_sessions.data`,
  `session_overlay.editable[row][0/1]`, `updated_at`, audit redatto e
  `sync_events.history_changed` con `entity_ids.session_ids`; no-op idempotente
  senza audit/sync duplicati e conflict check opzionale via `expectedUpdatedAt`.
  Browser locale Playwright PASS su fixture Supabase sintetica: login, Detail,
  modifica `4 -> 7` e `18.75 -> 21.5`, verifica DB `data` e overlay.
  Contratto Android/iOS verificato con harness source-based local-only su fonti
  reali mobile/Admin Web. Gate finali: TASK-079C 4/4 PASS, TASK-078 5/5 PASS,
  TASK-079B 3/3 PASS, suite mirata 15/15 PASS, browser Playwright locale PASS
  1/1, mobile contract smoke PASS, `lint` PASS, `typecheck` PASS,
  `test:foundation` PASS 424/424, `verify` PASS_WITH_WARNINGS per warning noti
  Next.js `middleware` deprecato e Node `[DEP0205]`, `git diff --check` PASS.
  Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito.
- Review blocker TASK-079C 2026-06-21: la review utente ha bloccato il passaggio
  a `DONE`. Il 079C confondeva la quantita sorgente del file con la quantita
  contata/modificata dall'utente, poteva usare il prezzo retail sorgente al posto
  del `RetailPrice` generato, lasciava la lista troppo tecnica e considerava
  completamento/diagnostica in modo non allineato ad Android/iOS. Stato 079C
  declassato a `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`.
- Avvio TASK-079D 2026-06-21: aperto da brief utente allegato
  `TASK-079D - History Entry Review Fix: Mobile Semantics, Counted Quantity,
  Sale Price, iOS-like UI`. Scope: documentare contratto Android/iOS reale,
  separare `quantity` sorgente da `realQuantity`/`session_overlay.editable[0]`,
  separare `purchasePrice` sorgente da `RetailPrice`/`session_overlay.editable[1]`,
  aggiornare `complete` via `session_overlay.complete`, rendere lista/detail
  business/mobile-like, aggiornare test e browser check locale. Stato iniziale:
  `EXECUTION`, non `DONE`.
- Handoff TASK-079D 2026-06-21: stato operativo
  `REVIEW_WITH_USER_VISUAL_CHECK_REQUIRED`, non `DONE`. Corretto il blocker di
  079C: supplier import emette generated mobile columns `realQuantity`,
  `RetailPrice`, `complete`; save generated scrive `realQuantity`,
  `RetailPrice`, `complete`, overlay `editable[0/1]` e `complete`, preservando
  source `quantity`, `purchasePrice` e campi prodotto/barcode/item. Lista
  History resa business/mobile-like con supplier title, category/source context,
  summary `Items`, `Total quantity`, `Order`, `Paid`, `Missing`; detail table
  separa `Recognized from file` (`Supplier Qty`, `Purchase`) da `Import values`
  (`Counted Qty`, `Sale Price`, `Status`) seguendo gli screenshot mobile/supplier
  forniti dall'utente. Browser locale Playwright PASS 1/1 e screenshot salvati
  in `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079D/`. Gate mirati History PASS; gate globali
  con blocker esterni fuori scope: `npm run lint`/`verify` falliscono su
  `src/app/shop/products/_components/ProductSearchCombobox.tsx`, e
  `test:foundation` resta 426/428 per guardrail Products/Catalog
  TASK-032/TASK-068M. `typecheck`, `security:scan`, `build` e `git diff --check`
  PASS/PASS_WITH_WARNINGS come da evidence. Nessun commit, stage, push, deploy,
  migration, production apply o Supabase apply eseguito.
- Avvio TASK-079E 2026-06-21: aperto da brief utente allegato
  `TASK-079E - History Entry Compact Layout, No Horizontal Scroll, Shared Sync Analysis`.
  Scope: polish visuale su 079D senza cambiare contratto mobile; lista History
  piu compatta; Detail desktop senza scroll orizzontale e con tabella compatta
  grouped `Recognized from file` / `Import values`; pannello condiviso
  Sync/Import Analysis per History Detail e Products -> Import Supplier Apply,
  usando solo dati bounded gia disponibili e `Not available` dove assenti.
  Stato iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-079E 2026-06-21: stato operativo
  `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`. Lista History resa piu
  compatta con metriche business in tile; Detail generated rimosso
  `min-w-[82rem]` e usa tabella `table-fixed` dentro frame
  `overflow-y-auto overflow-x-hidden`, preservando grouped headers
  `Recognized from file` / `Import values` e semantica mobile 079D
  (`quantity`/`purchasePrice` read-only, `realQuantity`/`RetailPrice`/`complete`
  generated editabili). Aggiunto `SyncAnalysisPanel` condiviso tra History
  Detail e Products -> Import Supplier Apply, con dati reali bounded,
  `Not available` per campi assenti e link `Open History Entry` post-apply.
  Evidence visuale salvata in
  `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079E/`. Check mirati
  079-079E PASS 18/18, smoke mobile PASS, browser History PASS 1/1, browser
  Products import PASS 7/7, `lint` PASS, `typecheck` PASS, `build`
  PASS_WITH_WARNINGS e `git diff --check` PASS. Gate globali residui fuori
  scope: `security:scan`/`verify` falliscono su
  `src/server/shop-admin/catalog-mutations.ts`; `test:foundation` 434/437 per
  TASK-015 catalog CRUD, Win7POS sibling guardrail e TASK-032
  category/supplier IDs. Nessun commit, stage, push, deploy, migration,
  production apply o Supabase apply eseguito.
- Avvio TASK-079F 2026-06-21: aperto da brief utente allegato
  `TASK-079F - History Entry Row State Colors, Vertical Scroll, Product Price Context`
  e screenshot mobile. Scope: rifinire History list/detail preservando il
  contratto 079D/079E, con `Missing products` rosso quando >0, scroll verticale
  interno del Detail rows table per 50+ righe, righe intere colorate secondo
  source iOS/Android, auto-complete visuale su `Counted Qty >= Supplier Qty`,
  contesto prodotto compatto con stato catalogo, vecchi prezzi solo se diversi,
  stock, totale riga e delta quantita. Vietati schema/migration/dependency,
  N+1/full catalog load, secret/service-role client, commit, stage, push,
  deploy e Supabase apply. Stato iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-079F 2026-06-21: stato operativo
  `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`. Regole mobile verificate
  da source iOS/Android: complete verde, partial/shortage amber, prodotto non
  risolto neutro, counted vuoto/inferiore incompleto e counted >= supplier
  completo salvo override manuale. Lista History aggiornata con label/valore
  `Missing products` rose/red solo quando >0. Detail rows ora usa preview
  bounded 200 righe, frame `overflow-y-auto overflow-x-hidden`, no horizontal
  scroll desktop, colori intera riga `complete` verde / `partial` amber /
  `unresolved` neutro. Auto-complete live aggiorna `session_overlay.complete`
  in base a `Counted Qty >= Supplier Qty`; source `quantity` e `purchasePrice`
  restano read-only, save tocca solo generated `realQuantity`, `RetailPrice`
  e overlay. Aggiunto contesto compatto per riga: stato catalogo, stock, old
  purchase/retail solo se disponibili e diversi, delta quantita e row total.
  Browser locale PASS su fixture 62 righe con screenshot in
  `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-079F/`. Check mirati 079-079F PASS 22/22,
  mobile source-contract smoke PASS, Playwright locale PASS 1/1, scoped ESLint
  079F PASS, `typecheck` PASS, `build` PASS_WITH_WARNINGS e `git diff --check`
  PASS. Gate globali residui fuori scope: `lint`/`verify` falliscono su
  `ProductDetailModalController.tsx`, `security:scan` su
  `catalog-mutations.ts`, `test:foundation` 437/441 per TASK-015, Win7POS
  sibling, TASK-032 e TASK-057. Nessun commit, stage, push, deploy, migration,
  production apply o Supabase apply eseguito.
- Handoff TASK-080 2026-06-21: stato operativo
  `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`. Categories e Suppliers
  ora usano read model paginato server-side con default 10 righe, search
  `q/query`, filtro `state`, count/range e `.range(...)`; le pagine preservano
  `shop_id`, `page`, `pageSize`, query e `state` tra filtri, pagination e
  action row. UI resa compatta con `CatalogEntityList` condiviso, stato
  Active/Archived e linked product count bounded sulla pagina corrente. Products
  e Import Supplier Wizard continuano a usare catalog options complete separate
  dal read model paginato. Evidence visuale legacy in
  `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/TASK-080/`: categories pagination/search/edit, suppliers
  pagination/search/edit e Products import supplier dialog. Check reali:
  History 079-079F PASS 23/23, TASK-080/regression statiche PASS 31/31,
  Playwright locale TASK-080 PASS 1/1, `npm run lint` PASS, `npm run typecheck`
  PASS, `npm run build` PASS_WITH_WARNINGS e `git diff --check` PASS. Gate
  globali residui fuori scope: `security:scan`/`verify` e `test:foundation`
  restano bloccati da `src/server/shop-admin/catalog-mutations.ts` guardrail.
  Category/Supplier restore resta follow-up per assenza di boundary restore
  audited dedicata. Nessun commit, stage, push, deploy, migration, production
  apply o Supabase apply eseguito.
- Riconciliazione governance TASK-079 2026-06-21: gli ex `TASK-079B`,
  `TASK-079C`, `TASK-079D`, `TASK-079E`, `TASK-079F` e l'ex `TASK-080` sono
  stati consolidati come sottosezioni del `TASK-079` canonico. Il solo file task
  corrente in root e
  `docs/TASKS/TASK-079-history-entry-catalog-pagination-unified.md`; i task
  legacy sono stati spostati in
  `docs/TASKS/EVIDENCE/TASK-079/legacy-task-files/` e le evidence legacy in
  `docs/TASKS/EVIDENCE/TASK-079/legacy-evidence/`. In quella fase il tracking
  era `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.
- Handoff TASK-079 unificato 2026-06-21: completate le correzioni finali
  richieste su governance, History pagination e row-state colori. `/shop/history`
  non usa piu il fallback `Read blocked` per `page > 1`, filtri attivi o pagine
  out-of-range leggibili; nel Detail History `Counted Qty` vuota o `0` resta
  neutra/bianca, `> 0 && < Supplier Qty` e amber, `>= Supplier Qty` e verde.
  Screenshot finali salvati in `docs/TASKS/EVIDENCE/TASK-079/browser/`.
  Check reali: mirati TASK-079/Catalog PASS 32/32, mirati con TASK-028 PASS
  38/38, `lint` PASS, `typecheck` PASS, `build` PASS_WITH_WARNINGS per warning
  noti `middleware`/`DEP0205`, smoke mobile PASS, Playwright Catalog PASS 1/1,
  Playwright History PASS 1/1, `git diff --check` PASS. Snapshot precedente
  prima del fix finale cloud: gate globali residui:
  `security:scan` FAIL_EXTERNAL su `src/server/shop-admin/catalog-mutations.ts`;
  `verify` FAIL_EXTERNAL per lo stesso security scan; `test:foundation`
  FAIL_EXTERNAL 2 fail derivati dallo stesso blocker. Nessun commit, stage,
  push, deploy, migration, production apply o Supabase apply eseguito.
- Handoff fix finale TASK-079 2026-06-21: riprodotto sul cloud dev richiesto
  (`PLATFORM_CLOUD_DEV_PORT=3055 npm run platform:cloud:dev`) il caso
  `/shop/history?page=2&pageSize=10` con top metric `Read blocked` e lista
  vuota. Root cause: la lista univa righe History dirette `shop_id` con legacy
  owner bridge; il codice chiedeva `range(10,19)` anche al bridge legacy con 6
  righe, riceveva `PGRST103 Requested range not satisfiable` e promuoveva
  l'errore a mapping/read blocked. Fix: per sorgenti miste si carica `0..to`,
  si fa merge ordinato e si taglia la pagina globale; `PGRST103` diventa pagina
  vuota leggibile, non blocco. Cloud smoke redatto: page 1, page 2,
  `status=active_with_issues`, `status=all`, `q=` e `month=` PASS 6/6,
  page 2 `11-20 of 45`, 10 righe, nessun `shop_inventory_sources gate`.
  Counted Qty zero verificato in cloud senza salvare: `unresolved` e complete
  unchecked. Check finali correnti: targeted TASK-079 pagination/row-colors
  PASS 9/9, `lint` PASS, `typecheck` PASS, `build` PASS_WITH_WARNINGS,
  `verify` PASS, `test:foundation` PASS 453/453, `git diff --check` PASS.
  Nessun commit, stage, push, deploy, migration, production apply o Supabase
  apply eseguito. Prima della riconciliazione finale lo stato restava
  `REVIEW_READY_FOR_USER_VISUAL_CHECK`, non `DONE`.
- DONE reconciliation TASK-079 2026-06-22: su richiesta esplicita utente,
  review orchestrata finale chiusa a `READY_FOR_DONE` su governance, History
  data/pagination, UX/mobile, catalog pagination e QA/security. Correzioni
  finali applicate prima della chiusura: draft vuoti Counted Qty/Sale Price
  restano vuoti invece di fare fallback al valore sorgente; Categories/Suppliers
  preservano `state` nei form GET; linked product counts della pagina corrente
  sono batch/bounded con fallback paginato, non N+1; staff-aware catalog
  assignment valida scope per riga e poi aggiorna per id verificati, senza
  filtro mutativo legacy su `owner_user_id`. Evidence cloud aggiunta per
  History page 2, Counted Qty zero non distruttivo e Catalog state/pagination.
  Check finali reali: `node scripts/i18n-hardcoded-ui-scan.mjs` PASS, targeted
  057/079/080 PASS 30/30, `npm run test:foundation` PASS 453/453,
  `npm run verify` PASS (`lint`, `typecheck`, `security:scan`, `build`),
  `git diff --check` PASS. Warning non bloccanti: Next `middleware` deprecato e
  Node `[DEP0205]`. Nessun commit, stage, push, deploy, migration, Supabase
  apply, History Save o import apply eseguito. Stato finale:
  `DONE_RECONCILED`.
- Avvio TASK-081 2026-06-22: aperto da brief utente e addendum
  `TASK-081 - Win7POS Sales Sync, Daily/Monthly Revenue, Stock Sync and Shop
  Admin Realtime Dashboard`. Scope: integrare Win7POS offline-first con Admin
  Web/Supabase per vendite, pagamenti, fiscal/document status, incasso
  giornaliero, registro mensile, stock decrement/reversal, outbox/retry,
  idempotenza, dashboard Shop Admin responsive e audit/security/performance.
  Admin Web e Win7POS baseline allineati a `origin/main` e clean prima delle
  modifiche. Stato iniziale: `EXECUTION`, non `DONE`.
- Handoff TASK-081 2026-06-23: implementati migration/read model/dashboard
  Admin Web, `pos-sales-ledger-v2`, stock RPC idempotente, Win7POS
  `sales_sync_outbox`, sync service con retry, stock locale e impostazioni shop
  read-only. Check reali: Admin Web `lint`, `typecheck`, `security:scan`,
  `test:foundation` 459/459 e `build` exit 0; Win7POS Data build exit 0, WPF
  x86 build exit 0, scanner PowerShell POS online/catalog/dialog/bootstrap
  `ALL PASS`. Nessun commit, stage, push, deploy o Supabase production apply.
  Residui: POS fisico Windows 7/stampante/rete reale non disponibili; deploy e
  apply vietati dallo scope. Stato handoff precedente: REVIEW_READY, poi
  superato dall'addendum E2E alignment closure; non `DONE`.
- Completion addendum TASK-081 2026-06-23: aggiunto E2E locale reale
  `tests/e2e/task-081-pos-revenue-e2e.spec.ts` con dataset sintetico
  `TASK081_E2E_*`, first-login POS, `/api/pos/sales/sync`, duplicate/conflict,
  negative auth/payload, API revenue autenticata, UI `/shop/pos`
  desktop/mobile screenshot fuori repo e cleanup zero-attivi. Aggiunto harness
  runtime Win7POS CLI `--task081-sales-sync-harness` per SQLite reale,
  sale/refund/void stock, outbox ack/retry/failed_blocked e protezione catalog
  stock con outbox pending. Check addendum reali: TASK-081 Playwright 1/1 PASS
  via `next start` locale; foundation mirato 2/2 PASS; Admin Web build PASS;
  Win7POS CLI harness PASS; Win7POS WPF x86 build PASS. Stato handoff:
  `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`, non `DONE`.
- Final alignment closure TASK-081 2026-06-23: aggiunto percorso Win7POS HTTP
  reale senza POST sintetico diretto: client/DTO/sessione spostati in Core,
  builder sales sync condiviso in Data, WPF e CLI allineati sullo stesso
  payload builder, CLI `--task081-sales-sync-http-harness` con SQLite/outbox,
  Admin Web local HTTP `/api/pos/sales/sync`, accepted=6,
  `pending_after_accept=0`, duplicate ok, conflict ok e auth denied retry.
  Aggiunto `test:task081:win7-http` con dataset `TASK081_WIN7HTTP_*`,
  verifica DB/API/UI `/shop/pos` desktop/mobile e cleanup. Creato release pack
  x86 win-x86 `dist/TASK-081/Win7POS-TASK081-HTTP-20260623-113808`
  con manifest/checksum/runbook, `e_sqlite3.dll`, zip e copie in
  `.win7pos-vm/drop/Win7POS`, `.win7pos-physical/bridge/drop/Win7POS` e
  `/Users/minxiang/Projects/Win7POSBridge/outbox/TASK-081-win7pos-http-release-20260623-113808`.
  `utmctl list` mostra due VM Windows 7 `stopped`; bridge fisico dry-run.
  Gate finali rieseguiti dopo la closure: Admin Web `lint`, `typecheck`,
  `security:scan`, `test:foundation` 461/461, `build`, `test:task081:e2e`
  1/1 e `test:task081:win7-http` 1/1 PASS.
  Stato resta `READY_FOR_DONE_CONFIRMATION_WITH_EXTERNAL_WIN7_PHYSICAL_NOTE`,
  non `DONE`.

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
- Eccezione registrata: `GLOBAL-REVIEW-001` contiene approvazione esplicita utente a chiudere `DONE` quando review tecnica, check ed evidence sono positivi. `DONE_AS_SUPERSEDED` e uno stato chiuso equivalente a `DONE` per task storici planning/blocker superati da execution successiva.

### TASK-052 Final Gate Review note - 2026-06-11

Status: `REVIEW`, not `DONE`.

Final gate verdict: `BLOCKED_SCHEMA_OR_RLS_FIX_REQUIRED`.

Summary:

- In-app browser QA confirmed Master Console provisioning, Admin account access, Shop code staff manager `1001` login, and `1001` recovery on local Supabase.
- A P0 prefetch/session issue in the Platform shell was fixed by disabling prefetch on protected Platform nav/logout links.
- `/shop/staff` remains blocked for authenticated personal Admin accounts because `public.staff_accounts_safe` selects `web_access_revoked_at` under `security_invoker=true`, while authenticated column grants on `public.staff_accounts` do not include that column.
- No schema/grant/RLS migration was applied during the review.
- TASK-052 must remain in review until the schema/grant/RLS blocker is explicitly fixed and the authenticated owner `/shop/staff` smoke passes.

### TASK-053 final local review note - 2026-06-11

- Verdict operativo Codex: `READY_FOR_REVIEW`; non marcato `DONE`.
- Fix applicato solo in locale con migration `20260611153437_task_053_staff_safe_read_boundary.sql`.
- Boundary confermato: `staff_accounts_safe` resta `security_invoker=true`, `credential_hash` resta non esposto, `authenticated` riceve solo la grant mancante su `web_access_revoked_at`, nessuna grant `anon`, nessuna grant mutativa.
- Browser QA autenticata completata con Master Console provisioning, owner Admin Console, staff manager Admin Console, denial Platform e recovery manager 1001.
- Gate locali completati: `git diff --check`, targeted TASK-053 foundation, `typecheck`, `lint`, `build`, `security:scan`, `test:foundation`, `verify`, `test:ui-smoke:ci`, TASK-035 Playwright authenticated smoke.
- Pulizia locale completata per fixture sintetiche `TASK053_*`, `TASK052_FINAL_*`, `TASK052_REVIEW_*`, `TASK035_*` e file temporanei credenziali/PIN.

### TASK-052/TASK-053 final professional review gate - 2026-06-11

- Verdict Codex: `DONE` for both TASK-052 and TASK-053.
- `DONE` not set by Codex; user confirmation received on 2026-06-11.
- TASK-052 UX shell parity passed after TASK-053 removed the `/shop/staff` safe read blocker.
- TASK-053 grant-only migration verified locally: `authenticated` has only the missing safe column grant on `web_access_revoked_at`; no `credential_hash`, no anon access, no mutative staff base-table grant.
- Additional P1 fixed in final review: logout controls now use native GET forms to server-side logout routes, avoiding new client-routed RSC logout errors.
- Browser QA passed for Master provisioning, owner Admin Console, staff manager Shop code login, platform denial, fake shop_id denial, recovery manager 1001, old/new PIN behavior, refresh and logout invalidation.
- Local cleanup completed with residual synthetic auth/profile/shop counts at zero.
- No cloud/production apply, no commit, no push, no stage finale, no global production-ready claim.
