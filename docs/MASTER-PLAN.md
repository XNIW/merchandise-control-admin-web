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

- Stato: `PLANNED_NEXT`
- File task: `TODO`
- Evidence: `TODO`
- Fase: `LONG_GOAL_MILESTONE_4`
- Scopo: creare read model shop-scoped server-only per mostrare dati reali autorizzati del negozio selezionato.
- Include previsto:
  - selezione shop verificata server-side;
  - lettura `shops`, `shop_members` e audit shop-scoped se disponibili;
  - tutte le query filtrate per `shop_id`;
  - stati `not_configured`, empty/error e no data;
  - nessun dato finto spacciato per live.
- Non include previsto:
  - CRUD;
  - prodotti/categorie/fornitori se schema non verificato;
  - migration non necessarie;
  - nuove dipendenze;
  - commit o push.
- Nota: non aperto in questa tranche per mantenere il diff Long Goal revisionabile dopo milestone 0-3.

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

- Stato globale attuale: `LONG_GOAL_MILESTONE_3_DONE_RECONCILED`
- Ultimo candidate completato: `TASK-009 - Shop Switcher`
- Task attivo: `NONE`
- File task: `docs/TASKS/TASK-009-shop-switcher.md`
- Stato task: `DONE`
- Fase: `LONG_GOAL_MILESTONE_3_DONE_RECONCILED`
- Responsabile: `CODEX / DONE_RECONCILIATION`
- Prossima azione consigliata: aprire `TASK-010 - Shop Read Model Real Data` come task separato; non aprirlo o implementarlo dentro questa reconciliation.

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
- Eccezione registrata: `GLOBAL-REVIEW-001` contiene approvazione esplicita utente a chiudere `DONE` quando review tecnica, check ed evidence sono positivi. `DONE_AS_SUPERSEDED` e uno stato chiuso equivalente a `DONE` per task storici planning/blocker superati da execution successiva.
