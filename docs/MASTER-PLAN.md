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
- Nota: execution aperta da Codex il 2026-05-31 dopo commit/push TASK-018 su `main`. Codex ha creato e applicato la migration additiva `20260531235900_task_019_pos_auth_foundation.sql`, esteso le RPC staff credential management con reason obbligatoria, audit metadata redatto e marker `session_invalidated_at`, aggiornato Shop Admin `/shop/staff`, scanner, foundation test e documentazione. Final review/reconciliation richiesta esplicitamente dall'utente il 2026-05-31: trovato e corretto un gap reale di grant colonnari per `staff_accounts_safe` con `security_invoker`, aggiunta e applicata `20260601000500_task_019_staff_safe_view_grants.sql`, riallineato `credential_status` su lockout per reactivate/force rotation, normalizzati `staffId`/`reason` server-side e rafforzati harness. Gate locali, UI smoke e Supabase linked passano; residui non bloccanti: warning advisors su RPC `SECURITY DEFINER` intenzionali e Auth leaked-password protection provider-side. Nessun commit, push o stage.

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

- Stato globale attuale: `IDLE`
- Ultimo task completato: `TASK-019 - POS Auth Foundation Implementation`
- Stato TASK-015: `DONE`
- Fase TASK-015: `DONE_RECONCILED`
- Stato TASK-017: `DONE`
- Fase TASK-017: `DONE_RECONCILED`
- Task in review non chiuso: `NONE`
- Stato TASK-016: `DONE`
- Fase TASK-016: `DONE_RECONCILED`
- Stato TASK-018: `DONE`
- Fase TASK-018: `DONE_RECONCILED`
- Stato TASK-019: `DONE`
- Fase TASK-019: `DONE_RECONCILED`
- Task attivo: `NONE`
- File task: `NOT_APPLICABLE`
- Stato task: `NOT_APPLICABLE`
- Fase: `IDLE`
- Responsabile: `NONE`
- Branch execution: `main`
- Prossimo task candidato: `NONE`
- File task candidato: `NOT_APPLICABLE`
- Stato task candidato: `NOT_APPLICABLE`
- Verdict planning candidato: `NOT_APPLICABLE`
- Task planning successivo gia creato: `NONE`
- File task planning successivo: `NOT_APPLICABLE`
- Stato task planning successivo: `NOT_APPLICABLE`
- Verdict planning task successivo: `NOT_APPLICABLE`
- Prossima azione consigliata: decidere esplicitamente se committare/pushare TASK-019, oppure aprire task separato per POS auth runtime reale, client Android/iOS/POS enforcement, email delivery o hardening Auth provider. Non dichiarare production-ready globale senza release task dedicata.

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
- Eccezione registrata: `GLOBAL-REVIEW-001` contiene approvazione esplicita utente a chiudere `DONE` quando review tecnica, check ed evidence sono positivi. `DONE_AS_SUPERSEDED` e uno stato chiuso equivalente a `DONE` per task storici planning/blocker superati da execution successiva.
