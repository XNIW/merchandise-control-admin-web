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

- Stato: `REVIEW`
- File task: `docs/TASKS/TASK-022-023-pos-dashboard-win7pos-client.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-022-023/README.md`
- Fase: `REVIEW`
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
- Review finale 2026-06-02: TASK-030 riconciliato a `DONE_RECONCILED_WITH_NOTES` dopo verifica repo-grounded post-push. Check pre-review documentale su `main` e `origin/main` allineati a `71316e7`, working tree Admin Web pulito, Vercel ancora scollegato da Git (`link=null`, `gitRepository=null`), nessun deployment/alias, `vercel.json` con `git.deploymentEnabled=false`. Check freschi: Admin Web `security:scan` PASS, `test:foundation` PASS (`134/134`), `verify` PASS con warning `[DEP0205]`, `git diff --check` PASS; Win7POS `git diff --check`, scanner bootstrap/catalog e build x86 PASS. Scanner legacy `check-pos-online-client.ps1` resta da riconciliare con il flusso TASK-029 `PosOnlineBootstrapService`.

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
- Ultimo task completato: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`
- Stato TASK-015: `DONE`
- Fase TASK-015: `DONE_RECONCILED`
- Stato TASK-017: `DONE`
- Fase TASK-017: `DONE_RECONCILED`
- Task parcheggiato non chiuso: `TASK-022_023 - POS live dashboard + Win7POS first login trusted device`
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
- Task attivo: `TASK-030 - Vercel deployment configuration diagnosis and safe main reconciliation`
- File task: `docs/TASKS/TASK-030-vercel-deployment-configuration-diagnosis-main-reconciliation.md`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Responsabile: `USER_REVIEW`
- Branch execution: `main`
- Task parcheggiato: `TASK-022_023 - POS live dashboard + Win7POS first login trusted device`
- Stato task parcheggiato: `PARKED_E2E_PENDING`
- Verdict TASK-026: `DONE_WITH_NOTES`
- Verdict TASK-027: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-028: `DONE_RECONCILED_WITH_NOTES`
- Verdict TASK-029: `BLOCKED_VERCEL_NON_MAIN_BRANCH_GENERATES_PRODUCTION_DEPLOYMENT`
- Verdict TASK-030: `DONE_RECONCILED_WITH_NOTES`
- Prossima azione consigliata: aprire un task dedicato per ottenere una vera URL Preview/non-production o hosting HTTPS alternativo se si vuole sbloccare TASK-029; altrimenti riprendere sviluppo Admin Web non-deploy. TASK-024 sales sync resta differito e non va implementato senza nuovo handoff esplicito.

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
- Eccezione registrata: `GLOBAL-REVIEW-001` contiene approvazione esplicita utente a chiudere `DONE` quando review tecnica, check ed evidence sono positivi. `DONE_AS_SUPERSEDED` e uno stato chiuso equivalente a `DONE` per task storici planning/blocker superati da execution successiva.
