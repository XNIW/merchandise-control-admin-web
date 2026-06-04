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
- Nota: chiuso su conferma esplicita dell'utente dopo review/fix con verdict `READY_FOR_DONE_CONFIRMATION`; nessun blocker reale.

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
- Execution: `COMPLETED_READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Verdict execution: `REVIEW_WITH_BLOCKERS`
- Verdict final review: `PASS_WITH_NOTES`
- Verdict final completion: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
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
- Completion finale avviata da Codex il 2026-05-31 e portata a `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`: applicata migration additiva `20260531171726_task_015_shop_admin_completion.sql`, rigenerati i tipi Supabase, implementati CRUD catalogo via RPC auditabili, import/export Excel reale con `read-excel-file`/`write-excel-file`, mutazioni staff POS auditabili, registry `shop_devices` con revoke/reactivate server-side, Server Actions e pannelli UI reali, harness TASK-015 e security scan aggiornati. Supabase linked checks pre/post migration passano in sequenza; check finali locali passano, con build/verify solo `DEP0205`, UI smoke `48 passed` e live auth riusato su `localhost:3000` con `2 passed`, `1 skipped`. Resta solo nota `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`: Android/iOS/POS devono consumare `shop_devices.status` per enforcement client della revoca. Nessun commit, push o stage finale.
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
- Execution completata da Codex il 2026-05-31 e poi sbloccata nella completion finale a `READY_FOR_DONE_CONFIRMATION_WITH_NOTES` / `REVIEW_READY_FOR_DONE_CONFIRMATION`: implementate route Platform globali, read model server-only con select esplicite, provisioning owner esistente e pending owner invite redatto, detail users/shops/audit, grant/revoke Platform Admin con anti self-lockout e audit, system/data health, global devices, sync/history, support diagnostics, Safe Operations Center con restore shop e migration additive `20260531190000_task_016_platform_admin_console.sql` + `20260531210000_task_016_platform_completion.sql`. Supabase linked push applicato e tipi rigenerati. Gate locali, Supabase e Playwright passano; live auth nominale ora usa `next start` su porta 3002 e passa `2 passed`, `1 skipped`. Resta nota non bloccante `PASS_WITH_NOTES_EMAIL_DELIVERY` per collegare delivery esterna del pending owner invite senza secret. Nessun commit, push o stage finale.
- Review/fix finale 2026-05-31: confermato `READY_FOR_DONE_CONFIRMATION_WITH_NOTES` senza marcare `DONE`. Fixati copy obsoleti nella superficie Platform che descrivevano grant/revoke Platform Admin e restore shop come bloccati, aggiunto link sidebar `/platform/history`, rimosso fallback empty-state ambiguo e rafforzato harness `task-016-platform-admins`. Check freschi passati: security scan, foundation `83/83`, typecheck, lint, build, verify, UI smoke `70/70`, TASK-016 smoke `24/24`, live auth `2 passed`/`1 skipped`, Supabase linked checks sequenziali, `git diff --check` e no stage. Resta solo `PASS_WITH_NOTES_EMAIL_DELIVERY`.
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
- Nota: task aperto in execution dal brief utente del 2026-05-31 mentre `TASK-016` era ancora `READY_FOR_DONE_CONFIRMATION_WITH_NOTES` e non era stato marcato `DONE`. Codex ha completato implementation e check, applicato la migration additiva `20260531230000_task_017_shop_business_completion.sql` al linked dev, rigenerato i tipi Supabase e preparato handoff a `REVIEW`. Review finale/reconciliation richiesta esplicitamente dall'utente il 2026-05-31: trovato e corretto un gap reale sugli RPC membri, che erano owner-only nel server web ma piu larghi nel DB; aggiunta e applicata `20260531233000_task_017_member_owner_enforcement.sql` con helper `app_private.is_active_shop_owner_member`, reason obbligatoria per remove e audit reason redatto. Gate finali: foundation `89/89`, typecheck, lint, build, verify, UI smoke `86/86`, security scan, Supabase linked checks post-push, `git diff --check`; warning non bloccanti Node `DEP0205` e Playwright colori. Residui: invito membri solo per profili esistenti, niente email/magic link, niente auth POS reale, Sync Center read-only. Stato finale: `DONE_RECONCILED`. `TASK-016` e stato poi riconciliato separatamente a `DONE_RECONCILED`.

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
- Review/fix 2026-06-01: corretti audit import/export con permessi `catalog.import`/`catalog.export` e controllo esplicito esito audit, guard `Content-Length` prima di `formData()` su preview/apply, tabella prodotti con `Product id`, `State`, `Archived at` e righe archiviate visibili. Gate finali: `npm run test:foundation` PASS (`128/128`), `npm run verify` PASS con warning toolchain `[DEP0205]`, `npm run security:scan` PASS, Win7POS scanner ALL PASS, build WPF x86 PASS (`Avvisi: 0`, `Errori: 0`). Supabase migration non applicata su DB locale/live per container locale assente; no apply remoto. Codex Security diff scan Admin Web/Win7POS senza finding reportable, report in `/tmp/codex-security-scans/.../report.md`. Verdict tecnico aggiornato a `READY_FOR_DONE_CONFIRMATION`, mantenendo fase `REVIEW`.
- Review live Supabase + Win7POS E2E 2026-06-01: produzione/remoto `NOT_USED`; `.env.local` remota esclusa. Stack locale gia attivo ispezionato ma non modificato per migration history divergente; E2E eseguito su stack Supabase isolato `/tmp/mc-task028-supabase.6OZZEG` (`mc-task028-e2e`, API `127.0.0.1:55431`, DB `127.0.0.1:55432`). Migration complete fino a `20260601160000_task_028_catalog_restore_product.sql`; file SQL TASK-028 originale rieseguito con `psql` senza errori. E2E sintetico PASS: import `.xlsx` preview/apply Admin Web, POS first-login, catalog full pull, archive via UI/Server Action, delta tombstone, soft tombstone Win7POS SQLite (`isActive 1 -> 0`), restore via UI/Server Action, delta restore e re-activate Win7POS (`isActive 0 -> 1`). Check rieseguiti: Admin Web `test:foundation` PASS (`128/128`), `verify` PASS con warning `[DEP0205]`, `security:scan` PASS, `git diff --check` PASS; Win7POS scanner ALL PASS, build WPF x86 PASS (`Avvisi: 0`, `Errori: 0`), `git diff --check` PASS. Residuo: fresh reset Supabase non patchato resta bloccato prima di TASK-028 dalla migration storica `20260515161500_task110_history_tombstone_grants.sql` su `public.product_prices` assente; workaround applicato solo alla copia `/tmp`, non alla repo.
- DONE reconciliation 2026-06-01: su conferma esplicita dell'utente nel brief `TASK-029`, TASK-028 chiuso a `DONE_RECONCILED_WITH_NOTES`. Note residue mantenute: drift storico TASK-110 trattato in TASK-029, `.xls` legacy fuori scope, Android/iOS non toccati, TASK-024 sales sync deferred. Nessuna dichiarazione di readiness globale.

### TASK-029 - Production path: staging, Win7POS bootstrap, POS API hardening

- Stato: `REVIEW`
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

- Stato: `REVIEW`
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
- Nota: execution avviata da Codex il 2026-06-02 da allegato utente. Baseline iniziale: Admin Web `main` pulito e allineato a `origin/main` su `18116bc`; Win7POS `main` pulito e allineato a `origin/main` su `5e35a37`; Vercel Git Integration scollegata (`link=null`, `gitRepository=null`), nessun deployment, nessun alias, `vercel.json` con `git.deploymentEnabled=false`. Branch Admin Web creato per l'execution: `codex/task-032-full-project-progression`. Fase 1 gate base passati dopo fix mirato delle whitelist governance per riconoscere TASK-032: Admin Web `security:scan`, `test:foundation` (`134/134`) e `git diff --check` PASS; Win7POS `git diff --check` e scanner bootstrap/client/catalog PASS. Fase 2 Shop Admin polish passata con note: `test:foundation` `137/137`, `security:scan`, `typecheck`, `lint`, `build`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING; browser smoke autenticato `BLOCKED_NO_AUTH_SESSION` su route shop locali. Fase 3 Excel hardening passata con note: validazione `duplicate_product_sku`, test sintetici header spostati/alias cinesi-spagnoli/formula injection/numeri, Drive discovery read-only dei campioni fornitori, `test:foundation` `140/140`, `security:scan`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING. Fase 4 permissions hardening passata con note: `resolveShopActionContext` nega `shop_id` non autorizzati invece di fallback, test matrix owner/manager/viewer/POS staff, `test:foundation` `144/144`, `security:scan`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING. Fase 5 Local POS E2E passata con cleanup: stack Supabase temporaneo isolato, migration locali applicate, dataset sintetico `TASK032_*`, POS first-login/trusted device/heartbeat/catalog full/tombstone/restore passati, cleanup verificato con zero residui attivi, Admin Web `test:foundation` `147/147`, `security:scan`, `verify` e `git diff --check` PASS/PASS_WITH_WARNING; Win7POS scanner bootstrap/client/catalog e `git diff --check` PASS. Review/fix finale Codex: diff security scan completato in `/tmp/codex-security-scans/merchandise-control-admin-web/18116bc_20260601235207/report.md`, trovato e corretto finding locale `TASK032-URL-CREDS-LEAK` nel harness POS (`TASK032_POS_E2E_BASE_URL` con userinfo non viene piu stampato su startup failure), regression test dedicato aggiunto. Check finali freschi: Admin Web `security:scan` PASS, `test:foundation` PASS (`148/148`), `verify` PASS con warning `[DEP0205]`, `git diff --check` PASS; browser smoke locale conferma blocco auth su prodotti/categorie/fornitori; Win7POS `git diff --check` e scanner bootstrap/client/catalog PASS; Vercel read-only conferma zero deployment, zero alias, Git Integration scollegata e env solo come `Encrypted`. TASK-032 passa a handoff `REVIEW` con Fase 6 bloccata; TASK-029, TASK-031 e TASK-022_023 restano non chiusi finche i relativi gate HTTPS/non-production e Win7POS live non passano. TASK-033 ha poi integrato il commit TASK-032 `2fa1feb` sul branch `codex/task-033-https-pos-sales-mega-task` per review controllata e prosecuzione del gate HTTPS.

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
  - commit, push o stage finale;
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
- Review DONE-readiness 2026-06-02: review repo-grounded completata senza dichiarare `DONE`. Fix documentali scoped applicati a TASK-034/evidence/Master Plan e planning sales sync normalizzato. Supabase check classificato `SUPABASE_CHECK_PASS_WITH_NOTES`: CLI/local/linked migration list disponibili, con divergenza remota nota su `20260601160000` non peggiorata e nessuna migration/tipo modificato da TASK-034. UI autenticata resta `BLOCKED_NO_AUTH_SESSION`; smoke non-auth su `/shop/devices` e `/shop/import-export` conferma guardia auth e screenshot review salvato in evidence. VM/UTM/Win7 live E2E resta `PAUSED_VM_SETUP_REQUIRED`; iOS/Android `NOT_RUN_NOT_IN_SCOPE`; Vercel resta parcheggiato con `git.deploymentEnabled=false`. Verdict aggiornato a `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION`.
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
- Completion Codex 2026-06-03: gate autenticato Shop Admin eseguito su Supabase locale/non-production `127.0.0.1:54321` con key locali solo come env di processo e nessun secret stampato/salvato. Stack locale `MerchandiseControlSupabase` ispezionato direttamente; history locale riparata da `20260417` a `20260417000000`, pending migrations applicate fino a `schema_migrations_count=32`, nessuna migration repo nuova. Harness corretto per schema reale staff/device, attesa login su pathname, audit append-only senza fixture non ripulibile, redaction su materiale sensibile reale. `npm run test:shop-admin-auth-smoke` passa `2 passed`, route Shop Admin autenticate coperte, no cross-shop leak, screenshot autenticato salvato e cleanup verificato con zero residui `TASK035_*`, `shop_members`, `shop_inventory_sources`, auth e audit. Verdict: `READY_FOR_DONE_CONFIRMATION`; task resta `REVIEW`, non `DONE`.
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
- Review finale Codex 2026-06-03: hard review su diff TASK-036 con Codex Security diff-scan in `/tmp/codex-security-scans/merchandise-control-admin-web/9586993_20260603_task036/`, verdict no findings. Fix scoped applicati: cap render-side/server-side 160 sui filtri Sync Center, status filter normalizzato, reason catalog trim/cap server-side e hint audit UI, check Supabase CLI senza `which`, guardrail TASK-036 rafforzato. `npm run dev:db:check` resta `PASS_FAIL_CLOSED` su `.env.local` cloud e mismatch container, come guardrail. Smoke autenticato Shop Admin eseguito con Supabase locale `127.0.0.1:54321`, key generate solo come env di processo da `GOTRUE_JWT_SECRET` del container Auth locale e nessun secret stampato/salvato; primo probe con secret PostgREST fallisce `bad_jwt` come diagnostica, probe corretto GoTrue passa. Build con env locali process-only passa con warning noto `[DEP0205]`; `npm run test:shop-admin-auth-smoke` passa `2 passed`; cleanup DB post-smoke zero su `TASK035_*` e auth user. Production-ready globale non dichiarato, Cloudflared resta temporaneo, Vercel resta parcheggiato, Sales Sync resta `DEFERRED`, Win7POS live E2E resta parked. TASK-036 resta `REVIEW` e passa a `READY_FOR_DONE_CONFIRMATION`; Codex non marca `DONE` senza conferma utente.
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
- Review finale Codex 2026-06-03: hard review sul modello TASK-037 e security diff scan locale in `/tmp/codex-security-scans/merchandise-control-admin-web/ea1f0b8_20260604_task037_final/`, no findings reportable dopo fix. Corretto il guardrail staff web per non accettare `admin` come ruolo corrente quando lo schema verifica solo `manager`; `POS_STAFF_WEB_FUTURE_ADMIN_ROLE_KEY = admin` resta target/follow-up. Rimossi helper autorizzativi staff web non integrati e rafforzati foundation test/security scanner contro il pattern permissivo `manager/admin`. Check finali freschi passano: `security:scan`, `test:foundation` (`167/167`), `typecheck`, `lint`, `build`, `verify`, `test:shop-admin-auth-smoke`, `git diff --check`, `git status` e `git diff --cached --name-status`; solo warning noto `[DEP0205]`, smoke autenticato `PASS_WITH_SKIP` su ambiente non locale/sicuro, `dev:db:check` fail-closed su `.env.local` cloud/mismatch container. In quella fase TASK-037 restava `REVIEW` e passava a `READY_FOR_DONE_CONFIRMATION`; Codex non marcava `DONE` senza conferma utente.
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
  - code scope TASK-039 arriva a `READY_FOR_DONE_CONFIRMATION`, non `DONE`;
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
  - Fase 1 staff-aware mutations: `PASS_READY_FOR_DONE_CONFIRMATION`;
  - Fase 2 permission tree granulare: `PASS_READY_FOR_DONE_CONFIRMATION`;
  - Fase 3 lifecycle: `PASS_READY_FOR_DONE_CONFIRMATION_WITH_NOTE`;
  - Fase 4 account/profile UX: `PASS_READY_FOR_DONE_CONFIRMATION`;
  - Fase 5 staging stabile: `SPLIT_TO_TASK-043_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 6 Win7POS live E2E: `SPLIT_TO_TASK-044_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 7 Sales Sync foundation: `SPLIT_TO_TASK-045_NOT_BLOCKING_TASK_039_CODE_SCOPE`;
  - Fase 8 UI/UX cleanup: `PASS_READY_FOR_DONE_CONFIRMATION`;
  - Fase 9 test/security: `PASS_READY_FOR_DONE_CONFIRMATION`.
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
  - Docker espone stack `supabase_db_MerchandiseControlSupabase`, ma il progetto corrente attende `supabase_db_merchandise-control-admin-web`: `BLOCKED_SUPABASE_CONTAINER_MISMATCH`;
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
  - default CI Admin Web: `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE` per i controlli esterni, con scanner ancora `PASS` per lo scope self-contained.
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

- Stato globale attuale: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Ultimo task completato: `TASK-039 - Staff-aware Shop Admin completion, permission tree, lifecycle, staging, Win7POS gate and sales foundation`
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
- Task attivo: `TASK-040 - Runtime Readiness: Supabase Apply, Non-Production Staging, Win7POS Live E2E and Sales Sync Foundation`
- File task: `docs/TASKS/TASK-040-runtime-readiness-supabase-staging-win7pos-sales-sync.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-040/README.md`
- Stato task: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Milestone interna: `PARTIAL_PASS_WITH_BLOCKERS`
- Responsabile: `REVIEWER`
- Branch previsto: Admin Web su `main` o branch dedicato se autorizzato in execution
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
- Follow-up Win7POS TASK-029 2026-06-02: scanner legacy riconciliato e pushato in Win7POS commit `d2c3d4b`; hardening bootstrap response validation pushato in `5e35a37`; nessun cambio a Vercel, Supabase schema, catalogo Admin Web o sales sync.
- Prossima azione consigliata: review umana/Claude su TASK-040. Non aprire Sales Sync runtime finche schema/API/apply Supabase/staging stabile/Win7POS live restano bloccati. TASK-029, TASK-031, TASK-032, TASK-033 e TASK-022_023 restano non chiusi secondo i rispettivi blocker; ex `TASK-043`, ex `TASK-044`, ex `TASK-045` ed ex `TASK-046` sono `FOLDED_INTO_TASK-040`.

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
- Eccezione registrata: `GLOBAL-REVIEW-001` contiene approvazione esplicita utente a chiudere `DONE` quando review tecnica, check ed evidence sono positivi. `DONE_AS_SUPERSEDED` e uno stato chiuso equivalente a `DONE` per task storici planning/blocker superati da execution successiva.
