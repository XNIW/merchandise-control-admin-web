# TASK-015 - Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices

## Informazioni generali

- ID: `TASK-015`
- Titolo: `Complete Shop Admin Console: Inventory, Excel, Mobile History, Staff and Devices`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED / CODEX_RECONCILIATION`
- Data apertura planning: 2026-05-31
- Data avvio execution: 2026-05-31
- Data handoff review: 2026-05-31
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-015/README.md`
- Fonte brief: allegato utente `Testo incollato.txt`
- Branch execution previsto: `codex/task-015-complete-shop-admin-console`
- Commit: `NOT_ALLOWED_BY_TASK`
- Git push: `NOT_ALLOWED_BY_TASK`
- Stato massimo consentito a Codex: `READY_FOR_DONE_CONFIRMATION`
- Planning review integrata: 2026-05-31
- Final hardening planning integrato: 2026-05-31
- Planning freeze audit integrato: 2026-05-31
- Verdict planning: `READY_FOR_EXECUTION_WITH_NOTES`
- Verdict execution: `REVIEW_WITH_BLOCKERS`
- Verdict final review: `PASS_WITH_NOTES`
- Verdict final completion: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Verdict finale: `DONE_WITH_NOTES`

## Scopo

Trasformare la `Shop Admin Console` da shell/read-only parziale a console operativa principale del negozio, mantenendo tutto shop-scoped, server-authorized e verificabile.

Il task deve coprire in un unico tracking ufficiale:

1. prodotti;
2. categorie;
3. fornitori;
4. import/export Excel;
5. history entry mobile;
6. staff POS shop-scoped;
7. ruoli/permessi shop-scoped;
8. dispositivi mobile/POS autorizzati;
9. audit e sicurezza;
10. documentazione, evidence e test.

## Contesto

Il progetto distingue:

- `Platform Admin Console`: controllo globale ecosistema.
- `Shop Admin Console`: gestione operativa del singolo negozio.

`POS/Staff` non e una console separata: e un modulo interno della `Shop Admin Console`, perche staff, PIN, ruoli, permessi e dispositivi appartengono sempre a uno specifico shop.

Stato corrente rilevante:

- `TASK-008` ha creato la shell protetta Shop Admin con route candidate, ma senza CRUD o import/export reali.
- `TASK-010` ha collegato letture reali shop-scoped per `shops`, `shop_members` e `audit_logs`, lasciando molte sezioni come placeholder dichiarati.
- `TASK-014` ha preparato la foundation POS Staff, ma `/shop/staff` resta read-only: nessun form mutativo, nessun login POS e nessuna creazione staff reale.
- Le route candidate esistenti includono `/shop/products`, `/shop/categories`, `/shop/suppliers`, `/shop/import-export`, `/shop/members`, `/shop/roles`, `/shop/staff`, `/shop/devices`, `/shop/settings` e `/shop/audit`.

## Regola principale

Questo task e grande, ma deve restare shop-scoped e sicuro.

Tutte le query, mutazioni, import/export, history entry, staff e dispositivi devono essere filtrati e autorizzati tramite lo shop selezionato e verificato server-side.

Il query param `shop_id` puo restare stato di navigazione, ma non deve mai essere usato come autorizzazione unica.

## Review planning repo-grounded - 2026-05-31

Questa review rafforza il piano in modalita planning-only. Non sono stati eseguiti build, test runtime, Playwright, Supabase live, migration, seed o cleanup.

### Esito planning

- Verdict: `READY_FOR_EXECUTION_WITH_NOTES`.
- Stato task: resta `DRAFT` / `PLANNING`.
- Execution: `NOT_STARTED`.
- Master Plan: resta `IDLE`, con `TASK-015` come task candidato.

### Lacune individuate nel piano originale

- Mancavano milestone interne con gate e stop condition per rendere eseguibile un task volutamente enorme.
- Mancavano definizioni esplicite di `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED`, `NOT_RUN`, `CHANGES_REQUIRED`, `READY_FOR_EXECUTION`, `REVIEW` e `DONE`.
- Il piano citava prodotti/categorie/fornitori ma non evidenziava abbastanza il rischio principale: le migration statiche inventory esistenti sono `owner_user_id`-scoped, non direttamente `shop_id`-scoped.
- Import/export Excel aveva preview/apply, ma non richiedeva ancora formula-injection hardening, limiti righe/file, report per riga/cella, template e idempotenza.
- History entry non distingueva abbastanza tra `sync_events` owner-scoped, possibili history mobile e `audit_logs` web/server.
- Staff POS non richiamava in modo esplicito che `TASK-014` ha gia introdotto `staff_accounts`, `staff_accounts_safe` e hashing server-only, ma non azioni mutative.
- Devices non chiariva che `source_device_id` nei sync event non equivale a una tabella dispositivi autorizzativi.
- Ruoli/permessi non separava abbastanza membership web (`shop_members`) da ruoli staff POS (`staff_accounts.role_key`).
- Mancavano requisiti performance espliciti per paginazione server-side, filtri server-side, limiti import/export e prevenzione N+1.
- Evidence non era ancora un template operativo con matrici discovery/schema/mobile/security/test data/final verdict.

### Finding statici da verificare in execution

Questi finding derivano da lettura statica del repository e devono essere riverificati durante execution con discovery reale e, dove autorizzato, Supabase linked checks:

- `src/app/shop` contiene route candidate per overview, products, categories, suppliers, import-export, members, roles, staff, devices, settings e audit.
- `src/server/shop-admin/read-model.ts` legge oggi solo `shops`, `shop_members` e `audit_logs`, sempre server-only e filtrati da `selectedShop.shopId`.
- `src/server/shop-admin/staff-read-model.ts` legge `staff_accounts_safe`, filtrando `shop_id = selectedShop.shopId`, e non seleziona `credential_hash`.
- `supabase/migrations/20260417120000_task013_inventory_catalog_rls.sql` definisce `inventory_suppliers`, `inventory_categories` e `inventory_products` con `owner_user_id`, non `shop_id`.
- `supabase/migrations/20260417200000_task016_inventory_product_prices.sql` definisce prezzi prodotto sempre `owner_user_id`-scoped.
- `supabase/migrations/20260418200000_task019_inventory_catalog_tombstone.sql` aggiunge `deleted_at` e unique parziali per soft delete inventory.
- `supabase/migrations/20260424145010_task045_sync_events.sql` e `20260522032909_task114_sync_events_history.sql` indicano `sync_events` owner-scoped con `store_id`, `source_device_id`, domini catalog/prices/history e metadata redatti.
- `supabase/migrations/20260531050837_task_014_pos_staff_foundation.sql` introduce `staff_accounts`, `staff_accounts_safe`, RLS e grants read-only, ma nessuna mutazione staff diretta per `authenticated`.
- Non risulta una tabella dispositivi autorizzativi dedicata nella scan statica; `sync_events.source_device_id` e solo un identificatore sorgente evento finche non viene verificato diversamente.
- Non risultano repo Android/iOS/Cash Register sotto `/Users/minxiang/Projects`; `Win7POS` e disponibile come riferimento statico. L'execution deve ricontrollare disponibilita e documentare `NOT_AVAILABLE` senza inventare dettagli.
- `package.json` non mostra una dipendenza Excel dedicata; l'execution deve decidere tra libreria minima motivata, CSV fallback esplicitamente approvato, o blocker.

### Final hardening planning - 2026-05-31

La review finale planning conferma il verdict `READY_FOR_EXECUTION_WITH_NOTES` e aggiunge gli ultimi vincoli operativi per ridurre rischio durante una execution lunga:

- Prima di modificare codice Next.js/App Router, Server Actions, Route Handlers, forms o data loading, Codex deve leggere la guida locale pertinente in `node_modules/next/dist/docs/` e citare i file letti in evidence.
- Ogni milestone deve aggiornare l'evidence mentre procede, non solo alla fine, cosi un eventuale stop lascia uno stato revisionabile.
- Ogni operazione lunga o potenzialmente costosa deve avere timeout/fallback documentato: import apply, export, history detail/raw JSON, bulk mutations, migration checks e browser/live gates.
- Ogni nuova migration deve avere strategia di rollback/fallback documentata prima dell'applicazione; niente rollback distruttivi, niente raw SQL non tracciato se la migration history e divergente.
- Ogni nuovo harness TASK-015 deve fallire chiuso sui rischi critici: authz client-only, service-role browser, secret in evidence, cross-shop leak, payload non redatti, grants mutative dirette non motivate, `.select("*")` nei read model.
- Se l'execution non puo completare una feature promessa, deve produrre UI safe (`not_configured`, `blocked schema`, `read-only activity`, o `follow-up`) e non un placeholder ambiguo spacciato per live.

### Planning freeze / execution readiness audit - 2026-05-31

Audit finale eseguito in modalita planning-only e read-only. Non sono stati avviati execution, build, test runtime, Playwright runtime, Supabase live, migration, seed, cleanup, generation types, commit, push o stage.

- Verdict freeze: `READY_FOR_EXECUTION_WITH_NOTES_CONFIRMED`.
- Stato documentale confermato: `TASK-015` resta `DRAFT` / `PLANNING`, execution `NOT_STARTED`, review `NOT_STARTED`, Master Plan `IDLE`, task attivo `NONE`.
- Nessuna contraddizione bloccante trovata tra task, Master Plan, evidence e stato statico repo.
- Rischi residui confermati e non bloccanti per partire: Excel dependency assente, inventory legacy owner-scoped, device authorization schema non rilevato staticamente, Android/iOS/Cash Register non disponibili localmente.
- Harness futuro da mantenere scoped: i gate TASK-015 devono controllare i nuovi moduli e i moduli Shop Admin toccati dal task. Baseline gia esistenti fuori scope, come eventuali `.select("*")` in read model Platform Admin, devono essere documentate come eccezioni esistenti oppure trattate in task separato; non devono mascherare regressioni nei read model Shop Admin/TASK-015.
- I gate per Shop Admin/TASK-015 restano fail-closed: nessun `.select("*")` nei nuovi read model Shop Admin, nessuna authz client-only, nessun service-role browser, nessun secret o hash in UI/DTO/log/evidence, nessun cross-shop leak.

## Definizioni esiti

- `PASS`: verifica eseguita e superata con evidence concreta.
- `PASS_WITH_NOTES`: verifica superata con warning non bloccante, rischio residuo e motivazione documentati.
- `FAIL`: verifica eseguita e fallita; il task non puo avanzare senza fix o decisione esplicita.
- `BLOCKED`: impossibile procedere per blocker reale esterno o prerequisito mancante.
- `NOT_RUN`: verifica non eseguita perche fuori scope, non disponibile o non autorizzata, con motivo documentato.
- `CHANGES_REQUIRED`: piano o execution non pronto senza modifiche specifiche.
- `READY_FOR_EXECUTION`: piano pronto per execution futura, senza avviare execution.
- `READY_FOR_EXECUTION_WITH_NOTES`: piano pronto per execution futura con rischi residui noti e accettabili per partire.
- `REVIEW`: stato massimo dopo una futura execution Codex, non stato finale della pianificazione.
- `DONE`: vietato in planning e vietato a Codex senza review positiva e conferma esplicita utente.

## Dipendenze

### Documenti da leggere prima dell'execution

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/TASK-008-shop-admin-console-shell.md`
- `docs/TASKS/TASK-009-shop-switcher.md`
- `docs/TASKS/TASK-010-shop-read-model-real-data.md`
- `docs/TASKS/TASK-011-shop-onboarding-live-gate.md`
- `docs/TASKS/TASK-012-pos-staff-credential-planning.md`
- `docs/TASKS/TASK-014-integrated-auth-qa-design-pos-staff-foundation.md`
- `docs/TASKS/EVIDENCE/TASK-010/README.md`
- `docs/TASKS/EVIDENCE/TASK-011/README.md`
- `docs/TASKS/EVIDENCE/TASK-014/README.md`

### Codice e directory da ispezionare prima dell'execution

- `src/app/shop`
- `src/components/shop`
- `src/components/admin`
- `src/server/shop-admin`
- `src/lib/supabase`
- `supabase/migrations`
- `tests`
- `scripts/security-checks.mjs`

### Next.js docs locali da leggere prima di codice framework

Leggere solo i file pertinenti allo scope che si tocca, ma documentarli in evidence. Candidate guide:

- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md`
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

### Repo sibling da verificare se disponibili

- Android MerchandiseControl: modello prodotti, import/export Excel, history entry, database locale/remoto, DTO e repository.
- iOS MerchandiseControl: modello prodotti, import/export, UX e coerenza dati.
- Win7POS: login POS, shop code, staff/device context e compatibilita futura.

Se Android/iOS/POS non sono disponibili, l'execution deve dichiararlo nell'evidence e non inventare dettagli.

## Scope incluso

- Discovery schema reale Admin Web, Supabase linked e, se disponibili, repo mobile/POS.
- Tipi dominio Shop Admin completi.
- Products CRUD shop-scoped con soft delete, validazione, detail e audit.
- Categories CRUD shop-scoped con conteggio prodotti se disponibile e audit.
- Suppliers CRUD shop-scoped con contatti, dettaglio e audit.
- Import Excel con upload, parsing server-side, preview, validazione, apply confermato e report errori.
- Export Excel prodotti/categorie/fornitori/inventory, compatibile con mobile se possibile.
- History entry mobile con lista, filtri, dettaglio, tabelle coinvolte e payload/snapshot safe.
- Staff POS management dentro `/shop/staff`, incluse mutazioni controllate e credential handling safe.
- Ruoli/permessi shop-scoped minimi, con enforcement server-side.
- Devices mobile/POS autorizzati con lista, dettaglio, stato, revoca/riattivazione se supportata e audit.
- Shop settings sicure se schema e policy lo permettono.
- Audit Shop Admin completo e filtrabile.
- UI/UX usando componenti condivisi esistenti.
- Read model, server actions/RPC/helper, mapper DB -> DTO UI e test separati.
- Migration Supabase additive solo se necessarie e verificate.
- Evidence completa e handoff finale verso `REVIEW`.

## Non incluso

- Commit.
- Git push.
- Stage finale.
- Funzioni fuori scope.
- Schema mobile inventato se Android/iOS non sono leggibili.
- Dati mock spacciati per live.
- Uso di `shop_id` query param come autorizzazione unica.
- Esposizione di `credential_hash`.
- Esposizione, salvataggio o logging di PIN/password in chiaro.
- Logging di token o magic link.
- Service-role key nel client/browser.
- Lettura o stampa di `.env` reali.
- Nuove dipendenze senza motivo forte documentato.
- Hard delete di prodotti, categorie, fornitori, staff, devices, history o audit.
- Modifiche Android/iOS/POS senza richiesta esplicita.
- Trasformare POS/Staff in console separata.
- Introdurre un modello `merchant -> stores`.
- Cancellare documentazione utile.
- Marcare il task `DONE`.

## File potenzialmente coinvolti

- Documentazione:
  - `docs/MASTER-PLAN.md`
  - `docs/TASKS/TASK-015-complete-shop-admin-console.md`
  - `docs/TASKS/EVIDENCE/TASK-015/README.md`
  - documenti dominio/ADR/SKILLS se serve aggiornare decisioni approvate
- Codice Shop Admin:
  - `src/app/shop/**`
  - `src/components/shop/**`
  - `src/components/admin/**`
  - `src/server/shop-admin/**`
  - `src/lib/supabase/database.types.ts`
- Supabase:
  - `supabase/migrations/**`
- Test e harness:
  - `tests/foundation/**`
  - `tests/e2e/**`
  - `scripts/security-checks.mjs`
  - `playwright.config.ts` solo se serve e con motivazione

## Piano execution

### Milestone interne e stop condition

Il tracking ufficiale resta unico: `TASK-015`. Le fasi sotto sono milestone interne, non nuovi task.

Ogni milestone deve produrre evidence con stato `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` o `NOT_RUN`.

Stop condition obbligatorie:

- Se discovery Supabase/schema fallisce su oggetti necessari e non esiste fallback safe, fermare le mutazioni dell'area interessata e classificare `BLOCKED`.
- Se una tabella esistente e owner-scoped (`owner_user_id`) ma manca mapping approvato da `shop_id`, non mostrare o mutare quei dati come shop-scoped; usare stato `not_configured` / `BLOCKED_SCHEMA_MAPPING`.
- Se una feature richiede nuova dipendenza, migration mutativa o service-role runtime non previsti, fermarsi e documentare decisione richiesta.
- Se un gate security rileva secret leakage, `credential_hash` in UI/DTO, PIN/password/token in log/evidence o service-role client/browser, il task entra in `FAIL` finche corretto.
- Se una milestone indipendente e bloccata ma altre possono avanzare senza violare scope/sicurezza, si puo continuare solo documentando il blocker e mantenendo invariati i confini di autorizzazione.

Criterio per handoff finale:

- `REVIEW` e ammesso solo se i gate critici sicurezza/authz/no cross-shop leak passano e le aree bloccate hanno fallback safe esplicito.
- Se prodotti/categorie/fornitori, import/export, staff o devices restano non funzionali senza fallback approvato, l'handoff deve essere `CHANGES_REQUIRED` o `BLOCKED`, non `PASS`.
- `PASS_WITH_NOTES` e ammesso solo per warning non bloccanti, non per mancanza silenziosa di una funzionalita promessa.

Condizioni future per `REVIEW`:

- Master Plan aggiornato a `TASK_ACTIVE` / `REVIEW`, mai `DONE`.
- Evidence completa con check reali o motivazioni `NOT_RUN`/`BLOCKED`.
- Gate critici sicurezza, server-side authorization e no cross-shop leak passati.
- Prodotti/categorie/fornitori/import-export/history/staff/devices/roles/settings/audit completati oppure bloccati con blocker reale, fallback safe e impatto utente dichiarato.
- Nessun commit, nessun push, nessuno stage finale.
- Nessun secret, token, PIN/password, magic link o `credential_hash` esposto.

Condizioni future per `DONE`:

- Review positiva (`APPROVED`) su file task, evidence e Master Plan.
- Eventuali warning classificati come `PASS_WITH_NOTES` e non bloccanti.
- Eventuali blocker accettati come follow-up separati o risolti.
- Conferma esplicita dell'utente dopo review positiva.
- Codex non marca `DONE` autonomamente.

### Fase 0 - Pre-flight e apertura execution

Quando l'utente autorizza l'execution, Codex deve:

1. Verificare stato repository:
   - `git status --short`
   - `git branch --show-current`
   - `git log --oneline --decorate -n 12`
   - `git diff --stat`
   - `git diff --check`
2. Verificare che si parta da `main` aggiornato oppure da branch dedicato.
3. Creare branch dedicato:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b codex/task-015-complete-shop-admin-console
```

4. Aggiornare `docs/MASTER-PLAN.md` solo dopo autorizzazione execution:
   - Stato globale: `TASK_ACTIVE`
   - Task attivo: `TASK-015 - Complete Shop Admin Console`
   - Fase: `EXECUTION`
   - Responsabile: `CODEX`
   - Ultimo task completato: mantenere `TASK-014`

### Fase 1 - Discovery schema reale Admin Web, Supabase e mobile

Prima di scrivere codice business, Codex deve verificare:

- tabelle prodotti esistenti;
- tabelle categorie;
- tabelle fornitori;
- tabelle inventory mobile;
- tabelle barcode/SKU;
- tabelle import/export se esistono;
- tabelle history entry mobile;
- tabelle devices;
- tabelle staff;
- tabelle roles/permissions;
- audit logs esistenti;
- RLS e grants;
- relazioni con `shop_id`, `shop_code`, `owner_user_id` o mapping gia esistente.

Comandi consigliati:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db lint --linked --schema public,app_private --level error --fail-on error
supabase db advisors --linked --type security --level error --fail-on error
```

Produrre in evidence una matrice con area, tabella/view reale, shop scope, RLS, mapping Admin Web, mapping Android/iOS e azione `use/create/adapt`.

La discovery deve includere una decisione esplicita per ogni famiglia dati:

- usare schema esistente;
- creare migration additiva;
- creare read model sopra schema owner-scoped solo tramite mapping `shop_id`;
- lasciare `BLOCKED_SCHEMA_MAPPING`;
- lasciare `NOT_AVAILABLE` se la fonte mobile/POS non esiste.

Per inventory esistente, non basta trovare `inventory_products`, `inventory_categories`, `inventory_suppliers` o `inventory_product_prices`: l'execution deve verificare e documentare come `owner_user_id` si collega allo shop selezionato tramite `shop_inventory_sources` o altro mapping approvato. Senza mapping server-side verificato, la UI deve restare `not_configured` o `blocked`, non mostrare dati owner-scoped come dati shop.

Se una tabella non esiste, Codex puo proporre e creare migration solo se:

- e additiva;
- e coerente con `shop_id` / `shop_code`;
- non rompe Android/iOS/POS;
- e protetta da RLS;
- e documentata;
- viene verificata con lint/advisors;
- non inventa campi mobile senza confronto o fallback dichiarato.

### Fase 2 - Modello dominio Shop Admin completo

Creare o aggiornare tipi TypeScript per:

- `ShopProduct`
- `ShopProductVariant` se necessario
- `ShopCategory`
- `ShopSupplier`
- `ShopInventoryRecord`
- `ShopExcelImportJob`
- `ShopExcelImportPreview`
- `ShopExcelExportJob`
- `MobileHistoryEntry`
- `MobileHistoryEntryDetail`
- `MobileHistoryEntryTableSnapshot`
- `ShopDevice`
- `ShopStaffAccount`
- `ShopRole`
- `ShopPermission`
- `ShopAuditEvent`

Regole:

- niente `any` se evitabile;
- niente dati mock spacciati per live;
- separare DTO UI da righe database;
- non esporre `credential_hash`, token, PIN/password o secret;
- mappare sempre `shop_id`;
- usare `shop_code` come identificatore business, non come unico controllo di sicurezza.

### Fase 3 - Products

Implementare `/shop/products` con:

- lista prodotti shop-scoped;
- ricerca;
- filtro categoria;
- filtro fornitore;
- stato prodotto attivo/disattivato/eliminato logicamente;
- dettaglio prodotto cliccabile;
- creazione prodotto;
- modifica prodotto;
- soft delete;
- validazione campi obbligatori;
- audit log per create/update/delete;
- empty state reale;
- error state chiaro;
- no dati di altri shop.

Requisiti di validazione e mapping:

- barcode/codice normalizzato server-side con regola documentata;
- duplicati gestiti con unique effettiva coerente con soft delete;
- nomi trim/collapse whitespace e case handling documentato;
- prezzi non negativi, finiti e con precisione coerente con il modello reale;
- quantita non negativa, finita e con unita di misura controllata se disponibile;
- valuta o currency policy dichiarata se il modello mobile la prevede;
- nessuna query `.select("*")` nei read model;
- paginazione server-side obbligatoria;
- filtri ricerca/categoria/fornitore server-side per dataset grandi;
- mutation protette da owner/manager shop-scoped, non solo dalla UI.

Campi minimi se compatibili con schema/mobile:

- nome prodotto;
- barcode/codice;
- categoria;
- fornitore;
- prezzo acquisto;
- prezzo vendita;
- stock/quantita se previsto;
- unita/misura se prevista;
- note;
- stato;
- timestamps.

Se Android/iOS hanno campi diversi, l'execution deve allinearsi al modello mobile reale, non inventare un modello parallelo.

### Fase 4 - Categories

Implementare `/shop/categories` con:

- lista categorie shop-scoped;
- conteggio prodotti collegati se disponibile;
- creazione categoria;
- modifica categoria;
- soft delete o disattivazione;
- blocco delete se categoria usata, oppure soft delete sicuro;
- audit;
- cross-shop leak test.

Requisiti aggiuntivi:

- normalizzazione nome categoria coerente con unique active rows;
- gestione categoria usata da prodotti senza hard delete;
- decisione esplicita su restore da tombstone se il modello lo permette;
- conteggio prodotti ottenuto senza N+1 query.

### Fase 5 - Suppliers

Implementare `/shop/suppliers` con:

- lista fornitori shop-scoped;
- dettaglio fornitore;
- creazione fornitore;
- modifica fornitore;
- soft delete/disattivazione;
- campi contatto compatibili con schema: nome, telefono, email, indirizzo, note;
- audit;
- collegamento prodotti-fornitore se supportato.

Requisiti aggiuntivi:

- normalizzazione nome fornitore coerente con unique active rows;
- validazione formato email/telefono solo se non degrada dati mobile esistenti;
- contatti e note redatti nei log/audit quando contengono dati sensibili;
- conteggio prodotti/collegamenti senza N+1 query.

### Fase 6 - Import/Export Excel

Import Excel:

- upload file Excel;
- parsing server-side;
- validazione colonne;
- preview prima di scrivere nel database;
- riepilogo righe valide, righe con errori, prodotti nuovi, prodotti da aggiornare e categorie/fornitori nuovi se consentiti;
- conferma finale;
- scrittura controllata server-side;
- audit log;
- report errori scaricabile o visibile;
- nessun dato scritto se preview non confermata;
- nessun file Excel salvato con dati sensibili fuori scope;
- limite dimensione file ragionevole;
- protezione da file non Excel;
- gestione duplicati barcode/codice;
- rollback o transazione se possibile.

Hardening import:

- limite dimensione file e numero righe massimo documentati;
- verifica estensione e MIME, senza fidarsi solo del nome file;
- protezione formula injection per celle che iniziano con `=`, `+`, `-`, `@`, tab o carriage return;
- report errori per riga/cella con valori redatti quando sensibili;
- template scaricabile se il formato atteso non e autoevidente;
- idempotenza o strategia duplicati per barcode/codice;
- preview persistita solo quanto serve e senza salvare file sorgente sensibile fuori scope;
- apply finale atomico o con partial failure esplicitamente documentato e auditato;
- nessuna scrittura se preview non confermata.

Export Excel:

- export prodotti;
- export categorie;
- export fornitori;
- export combinato inventory se coerente con mobile;
- file Excel compatibile con import Android/iOS se possibile;
- colonne documentate;
- audit log export;
- nessuna esportazione di dati di altri shop.

Non aggiungere dipendenze se il progetto ne ha gia una utile. Se serve una libreria Excel nuova, Codex deve motivarla chiaramente e scegliere la minima necessaria.

Il repo attuale non dichiara una libreria Excel dedicata in `package.json`. Durante execution, se la richiesta resta "Excel" e non basta un CSV fallback approvato, Codex deve proporre la dipendenza minima e motivarla nel task/evidence prima di usarla.

### Fase 7 - Mobile History Entry

Aggiungere una sezione Shop Admin per history entry mobile.

Route suggerite:

```text
/shop/history
/shop/history/[entryId]
```

Usare `/shop/audit` solo se il modello reale mostra che history entry e audit sono la stessa cosa. Se sono concetti diversi, mantenerli separati:

- audit = azioni amministrative web/server;
- history entry = dati storici/sync/import/modifiche provenienti dai dispositivi mobile.

Lista history entry:

- elenco shop-scoped;
- filtri per dispositivo, tipo evento, data e origine;
- stato sync se disponibile;
- numero tabelle/record coinvolti;
- utente/staff/dispositivo sorgente se disponibile;
- link al dettaglio.

Discovery history:

- verificare se esistono vere `history_entries` mobile oppure se il modello reale e `sync_events`;
- se si usa `sync_events`, documentare che oggi sono owner-scoped con `store_id`/`source_device_id` e richiedono mapping shop-safe;
- separare sempre `audit_logs` web/server da history/sync mobile salvo prova contraria.

Dettaglio history entry:

- metadata entry;
- dispositivo sorgente;
- shop;
- timestamp;
- tipo operazione;
- tabelle coinvolte;
- record coinvolti;
- payload o snapshot leggibile;
- differenze before/after se disponibili;
- errori sync se presenti;
- raw JSON solo se safe e utile;
- nessun token/secret/PIN/password;
- nessun dato di altri shop.

Redazione payload:

- redazione ricorsiva di token, secret, auth metadata, PIN/password, credential hash, device secret, email se non necessaria, path locali e payload Excel grezzi;
- limiti dimensione raw JSON e fallback a summary;
- test no cross-shop leak anche su payload annidati, record detail e route `[entryId]`.

Il dettaglio deve mostrare le tabelle dentro la history entry con tabella, operazione, record count, stato e link di apertura. Cliccando una tabella coinvolta, mostrare campi, valori safe, before/after se disponibile, record id e identificatori utili come barcode/product id/category id/supplier id.

Se la struttura reale mobile usa nomi diversi da `history entry`, mantenere il nome reale nei mapper e usare label UI `History Entry`.

### Fase 8 - Staff POS Management

Completare `/shop/staff` con azioni mutative controllate:

- lista staff;
- dettaglio staff;
- creazione staff;
- assegnazione ruolo operativo;
- staff code univoco per shop;
- impostazione PIN/password temporanea;
- obbligo cambio PIN/password se supportato;
- reset PIN/password;
- sospensione staff;
- riattivazione staff;
- soft delete se previsto;
- audit obbligatorio;
- nessuna esposizione di `credential_hash`;
- nessun plaintext salvato in database;
- nessun PIN/password in log;
- nessun service-role lato client/browser.

Baseline repo-grounded:

- `TASK-014` ha gia introdotto `staff_accounts`, `staff_accounts_safe`, `src/server/shop-admin/staff-read-model.ts` e `src/server/shop-admin/staff-credentials.ts`.
- La futura execution deve riusare quel boundary, non duplicare hashing o leggere la base table in UI.
- Le mutazioni devono essere server-side e usare helper/RPC/action controllate; non aggiungere grant dirette `insert/update/delete/all` a `authenticated` su `public.staff_accounts`.
- Il plaintext temporaneo, se generato, puo essere mostrato una sola volta come `<TEMP_CREDENTIAL_SHOWN_ONCE>`, mai salvato, mai loggato, mai scritto in evidence.
- `must_change_credential` deve essere impostato quando si crea/resetta una credenziale temporanea, se supportato dallo schema.
- Ogni create/reset/suspend/reactivate/archive deve scrivere audit redatto.

Non implementare login POS completo salvo sia strettamente necessario, verificato e documentato. Se resta fuori, classificarlo come `FOLLOW_UP_POS_LOGIN`.

### Fase 9 - Ruoli e permessi shop-scoped

Implementare o completare `/shop/roles` con:

- lista ruoli shop;
- permessi base per products, categories, suppliers, import/export, staff management, devices management, history read, audit read e settings;
- assegnazione ruolo a shop member o staff se schema lo permette;
- enforcement server-side;
- audit.

Se lo schema reale non supporta ruoli granulari:

1. documentare lo stato;
2. implementare i ruoli minimi gia previsti;
3. creare migration additiva solo se sicura;
4. lasciare follow-up dichiarato per granularita avanzata.

Separazione obbligatoria:

- `shop_members.role_key` governa account personali web (`shop_owner`, `shop_manager`, `viewer`).
- `staff_accounts.role_key` governa staff POS (`cashier`, `manager`, `viewer`) e non deve concedere automaticamente accesso web.
- La baseline puo essere una permission matrix server-side hardcoded e testata se non esistono tabelle `roles` / `permissions` sicure.
- Enforcement deve stare nel boundary server/action/RPC, non solo nel rendering dei bottoni.

### Fase 10 - Devices mobile/POS autorizzati

Implementare `/shop/devices` con:

- lista dispositivi shop-scoped;
- tipo dispositivo: Android, iOS, Windows POS, Web, Unknown;
- ultimo accesso;
- app version;
- device name;
- device identifier safe;
- stato active/pending/revoked/suspicious;
- dettaglio dispositivo;
- history entry collegate al dispositivo;
- revoca dispositivo;
- riattivazione se consentita;
- rinomina dispositivo;
- audit obbligatorio.

Platform Admin puo ricevere solo una vista globale read-only/emergency se semplice e coerente: conteggio dispositivi per shop, dispositivi sospetti/revocati e ultimi accessi. Le azioni normali restano nello Shop Admin.

Nota repo-grounded:

- La scan statica trova `source_device_id` in `sync_events`, ma questo non e una tabella dispositivi autorizzativi.
- Se non esiste una tabella devices reale, l'execution puo mostrare solo attivita dispositivo read-only derivata da history/sync e deve classificare revoca/riattivazione come `BLOCKED_SCHEMA`.
- Una migration devices e ammessa solo se additiva, shop-scoped, con RLS/grants severi, audit e compatibilita mobile/POS documentata.

### Fase 11 - Shop Settings

Implementare o completare `/shop/settings` con:

- visualizzazione dati shop;
- modifica impostazioni sicure se consentito: nome shop, contatti, preferenze import/export e impostazioni display;
- nessun cambio arbitrario di `shop_id`;
- cambio `shop_code` solo se gia previsto e sicuro, altrimenti read-only;
- audit per modifiche.

### Fase 12 - Audit Shop Admin

Completare `/shop/audit` con:

- lista audit eventi shop-scoped;
- filtri per products, categories, suppliers, import/export, staff, devices, settings, history;
- dettaglio evento;
- actor sicuro;
- target;
- timestamp;
- metadata safe;
- nessun secret/token/PIN/password/hash.

### Fase 13 - UI/UX

Applicare i componenti Admin Web condivisi introdotti da `TASK-014`:

- `PageHeader`
- `SectionCard`
- `EmptyState`
- `StatusBadge`
- `AdminDataTable`
- `GuardrailNotice`

Regole UI:

- niente dashboard finte;
- niente dati mock spacciati per live;
- empty state chiari;
- loading/error state chiari;
- tabelle leggibili;
- responsive desktop/tablet/mobile;
- azioni pericolose con conferma;
- risultati azione redatti, senza secret;
- stile semplice, professionale e moderno.

Requisiti operator UX:

- navigazione coerente da Shop Admin e preservazione sicura dello shop selezionato;
- tabelle con ricerca/filtro/paginazione quando i dati possono crescere;
- loading/error/empty state distinti da `blocked schema` e `not configured`;
- conferme esplicite per soft delete, suspend, revoke, reset credential e apply import;
- feedback post-azione redatto, senza mostrare secret, hash, token o payload sensibili;
- label accessibili, focus visibile, keyboard path, contrasto e responsive desktop/tablet/mobile.

### Fase 13B - Performance e data loading

- Usare paginazione server-side per products, categories, suppliers, history, devices e audit.
- Evitare query globali non filtrate e caricamenti completi di cataloghi grandi.
- Applicare filtri server-side per ricerca, stato, categoria, fornitore, device, origine, tipo e date.
- Evitare N+1 query con join/view/RPC/read model aggregati o query batch motivate.
- Se si usa cache/memoization Next.js, motivarla rispetto a dati sensibili e invalidazione.
- Definire limiti import/export, timeout, fallback e size budget in evidence.
- Per raw JSON history e import preview, definire budget massimo renderizzato e fallback summary/redacted.

### Fase 13C - Agent execution UX

- Aggiornare `docs/TASKS/EVIDENCE/TASK-015/README.md` dopo ogni milestone significativa.
- Mantenere una tabella `Milestone status` con `PASS`, `PASS_WITH_NOTES`, `FAIL`, `BLOCKED` o `NOT_RUN`.
- Annotare subito decisioni su dipendenze, schema, mapping e blocker; non lasciarle implicite nel codice.
- Non lasciare processi/dev server/sessioni Playwright attive a fine turno se avviati in execution.
- Ogni handoff intermedio deve indicare cosa puo proseguire in sicurezza e cosa deve fermarsi.

### Fase 14 - Server Actions, RPC e Read Models

Per ogni area separare:

- read model server-only;
- mutation server-side;
- autorizzazione;
- mapper DB -> DTO UI;
- componenti UI;
- test.

Pattern desiderato:

```text
src/server/shop-admin/products-read-model.ts
src/server/shop-admin/products-actions.ts
src/server/shop-admin/categories-read-model.ts
src/server/shop-admin/categories-actions.ts
src/server/shop-admin/suppliers-read-model.ts
src/server/shop-admin/suppliers-actions.ts
src/server/shop-admin/import-export-actions.ts
src/server/shop-admin/history-read-model.ts
src/server/shop-admin/devices-read-model.ts
src/server/shop-admin/devices-actions.ts
src/server/shop-admin/staff-actions.ts
src/server/shop-admin/roles-actions.ts
```

Non mettere logica business pesante nei componenti React.

### Fase 15 - Migration Supabase

Se servono migration:

- crearle in `supabase/migrations`;
- devono essere additive;
- niente drop distruttivi;
- niente hard delete;
- niente bypass RLS non motivati;
- RLS obbligatoria;
- grants espliciti;
- helper in `app_private` se necessario;
- audit trigger/RPC se necessario;
- view safe per dati sensibili;
- tipi `Database` rigenerati solo dopo schema verificato/applicato.

Comandi richiesti:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase db lint --linked --schema public,app_private --level error --fail-on error
supabase db advisors --linked --type security --level error --fail-on error
```

Se Codex applica migration al linked dev, deve documentare dry-run prima, migration applicata, post-push migration list, post-push dry-run, lint/advisors post-push e rigenerazione tipi.

Ogni migration deve inoltre documentare:

- perche una migration e necessaria invece di usare schema esistente;
- se tocca oggetti owner-scoped legacy o solo nuovi oggetti shop-scoped;
- piano rollback/fallback non distruttivo;
- verifica che non vengano aggiunte grant mutative dirette a `authenticated` su tabelle sensibili senza RPC/helper autorizzativi;
- impatto su Android/iOS/POS o motivo `NOT_AVAILABLE`.

### Fase 16 - Test obbligatori

Aggiungere o aggiornare test per:

- no cross-shop leak;
- prodotti CRUD;
- categorie CRUD;
- fornitori CRUD;
- import preview;
- import apply;
- export;
- history list/detail;
- device list/revoke;
- staff create/reset/suspend;
- ruoli/permessi se implementati;
- audit log;
- no secret leakage;
- no `credential_hash` in UI/DTO;
- no service-role client/browser;
- no client-side-only auth guard.
- import Excel formula injection;
- history payload redaction;
- server actions authorization;
- audit coverage per mutazioni sensibili;
- paginazione/limit enforcement;
- owner_user_id -> shop_id mapping se si usano tabelle inventory legacy;
- staff temporary credential one-time display senza persistenza plaintext.

Check minimi:

```bash
npm run typecheck
npm run lint
npm run test:foundation
npm run security:scan
npm run build
npm run verify
npm run test:ui-smoke
git diff --check
git status --short
```

Se disponibili e sicuri:

```bash
CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth
```

Aggiungere Playwright smoke per:

- `/shop/products`
- `/shop/categories`
- `/shop/suppliers`
- `/shop/import-export`
- `/shop/history`
- `/shop/staff`
- `/shop/devices`
- `/shop/roles`
- `/shop/settings`
- `/shop/audit`

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
| --- | --- | --- | --- |
| CA-01 | `/shop/products` e funzionale con dati reali shop-scoped. | Browser/test/read model | `PASS_WITH_NOTES_READ_ONLY` |
| CA-02 | `/shop/categories` e funzionale. | Browser/test/read model | `PASS_WITH_NOTES_READ_ONLY` |
| CA-03 | `/shop/suppliers` e funzionale. | Browser/test/read model | `PASS_WITH_NOTES_READ_ONLY` |
| CA-04 | `/shop/import-export` permette import preview, apply controllato ed export Excel. | Test server/browser | `BLOCKED_SCHEMA_DEPENDENCY` |
| CA-05 | `/shop/history` mostra history entry mobile shop-scoped. | Browser/test/read model | `PASS_WITH_NOTES_READ_ONLY` |
| CA-06 | Il dettaglio history entry mostra metadata, tabelle coinvolte e dati safe. | Browser/test | `PASS` |
| CA-07 | `/shop/staff` permette gestione staff POS shop-scoped senza esporre hash/PIN/password. | Browser/test/security scan | `PASS_WITH_NOTES_ACTIONS_BLOCKED` |
| CA-08 | `/shop/devices` mostra dispositivi mobile/POS e permette revoca se schema lo consente. | Browser/test/read model | `PASS_WITH_NOTES_ACTIVITY_ONLY` |
| CA-09 | `/shop/roles` implementa almeno ruoli/permessi minimi o documenta blocker reali. | Test/documentazione | `PASS` |
| CA-10 | `/shop/audit` mostra eventi shop-scoped completi. | Browser/test/read model | `PASS_WITH_NOTES_EXISTING_READ_MODEL` |
| CA-11 | Tutte le mutazioni sono server-side e autorizzate. | Code review/security scan | `PASS_WITH_NOTES_NO_NEW_MUTATIONS` |
| CA-12 | Tutte le operazioni sensibili scrivono audit log. | Test/database evidence | `BLOCKED_NO_MUTATIONS` |
| CA-13 | Nessun dato di altri shop e visibile. | Cross-shop tests | `PASS_WITH_NOTES_STATIC` |
| CA-14 | Security scan passa. | `npm run security:scan` | `PASS` |
| CA-15 | Typecheck/lint/build/verify passano. | npm scripts | `PASS` |
| CA-16 | Evidence e completa. | Review documentale | `PASS` |
| CA-17 | Master Plan e aggiornato a `REVIEW`, non `DONE`. | Review documentale | `PASS` |
| CA-18 | Mapping inventory owner-scoped verso shop selezionato e verificato, oppure blocco safe documentato. | Discovery/test/security review | `PASS_WITH_NOTES_READ_ONLY` |
| CA-19 | Import/export protegge da formula injection, file oversized e report non redatti. | Test import/export/security review | `PASS_WITH_NOTES_CONTRACT_ONLY` |
| CA-20 | History/sync payload e dettagli annidati sono redatti e shop-safe. | Test history/security review | `PASS` |
| CA-21 | Devices non confonde `source_device_id` sync con autorizzazione dispositivo senza schema verificato. | Discovery/test/documentazione | `PASS` |
| CA-22 | Paginazione e limiti server-side sono presenti sulle tabelle grandi. | Code review/test | `PASS_WITH_NOTES_LIMITED_READS` |

## Esito execution 2026-05-31

Codex ha completato una execution prudente e shop-scoped portando il task a `REVIEW`, non `DONE`.

Consegnato:

- read model server-only per products/categories/suppliers/prezzi su inventory legacy, solo tramite mapping `shop_inventory_sources.shop_id -> owner_user_id`;
- route Shop Admin products, categories, suppliers, import-export, roles, devices, settings e nuova `/shop/history` servite da `getShopSectionForRequest`;
- readiness import/export Excel con workbook contract, limiti file/righe e hardening formula injection;
- history/sync mobile read-only con lista e dettaglio `/shop/history/[entryId]`, redazione ricorsiva payload e separazione da `audit_logs`;
- staff action policy server-only che blocca mutazioni finche manca RPC auditata;
- permission matrix server-only distinta tra web shop members e staff POS;
- devices activity-only derivata da `sync_events.source_device_id`, senza confonderla con autorizzazione device;
- harness TASK-015 foundation e gate `security:scan` dedicato;
- smoke Playwright aggiornato con `/shop/history` e `/shop/history/[entryId]`.

Bloccato intenzionalmente:

- CRUD catalogo e audit mutazioni per assenza di boundary RPC/migration verificabile;
- apply/export Excel reale per assenza libreria workbook dedicata e mutation boundary sicura;
- staff create/reset/suspend/reactivate/archive per assenza RPC auditata sopra `staff_accounts`;
- device revoke/reactivate per assenza tabella devices autorizzativa;
- cross-shop live TASK-015 per assenza fixture/live gate dedicati;
- Supabase `db push --linked --dry-run` e `db lint --linked` inizialmente bloccati da pooler/login role, poi sbloccati con esecuzione sequenziale; `migration list`, `dry-run`, `lint` e `advisors` ora passano.

Check finali passati:

- `npm run test:foundation`: `68 passed`;
- `npm run verify`: lint, typecheck, security scan e build passati;
- `npm run test:ui-smoke`: `48 passed`, incluse `/shop/history` e `/shop/history/sync:1` desktop/tablet;
- `git diff --check`: `PASS` dopo l'ultimo aggiornamento documentale.

## Esito review-fix/unblock 2026-05-31

Codex ha eseguito una fase mirata di unblock senza rifare TASK-015 da zero, senza migration, senza commit, senza push e senza stage finale.

Sbloccato:

- `/shop/history/[entryId]` con route dinamica `force-dynamic`;
- read model detail server-only per `sync_events` e `shared_sheet_sessions`, filtrato da `shop_inventory_sources.shop_id -> owner_user_id`;
- detail UI tramite `getShopHistoryDetailSectionForRequest`, con metadata, source/device, tipo evento, tabelle coinvolte, record count, summary e JSON redatto/limitato;
- harness history e security gate TASK-015 aggiornati per il detail.

Rimasto bloccato con causa tecnica reale:

- CRUD catalogo: serve RPC/helper auditato shop-scoped; le tabelle legacy restano `owner_user_id`-scoped e i linked dry-run/lint devono essere eseguiti in sequenza;
- import apply/export Excel reale: manca libreria workbook e manca boundary mutativa catalogo;
- staff POS mutations: TASK-014 offre read model safe ma nessuna RPC mutativa auditata;
- device revoke/reactivate: non esiste tabella dispositivi autorizzativa; `source_device_id` resta activity;
- live cross-shop TASK-015: nessuna fixture sintetica/cleanup live creata.

Verdict dopo unblock: `REVIEW_WITH_BLOCKERS`, non `DONE`.

## Esito unblock Supabase linked e review RPC/migration - 2026-05-31

La connessione Supabase linked e stata rivalidata eseguendo i comandi in sequenza, non in parallelo:

- `supabase migration list --linked --log-level error`: `PASS`;
- `supabase db push --linked --dry-run --log-level error`: `PASS`, remoto gia aggiornato;
- `supabase db lint --linked --schema public,app_private --level error --fail-on error --log-level error`: `PASS`;
- `supabase db advisors --linked --type security --level error --fail-on error --log-level error`: `PASS`.

La root cause operativa era la combinazione tra env shell senza `SUPABASE_DB_PASSWORD` e inizializzazione login role temporanea non affidabile quando i comandi linked venivano avviati in parallelo. La password DB fornita dall'utente in chat non e stata salvata o riportata in evidence.

Review mirata:

- Catalogo: pronto per design/implementazione di RPC additive shop-scoped sopra `shop_inventory_sources -> owner_user_id`, senza grant mutativi diretti aggiuntivi e con soft delete/audit.
- Staff: schema TASK-014 sufficiente per RPC additive create/reset/suspend/reactivate/archive, a patto che hash/credential restino server-side e mai restituiti.
- Excel: export/apply resta parzialmente pronto; serve dependency workbook e completamento RPC catalogo. Eventuale migration import batch deve salvare solo report redatti, non workbook grezzi.
- Devices: migration `shop_devices` possibile, ma revoca effettiva resta bloccata finche mobile/POS non consultano uno stato autorizzativo; altrimenti UI deve restare activity/registry-only.

## Esito review finale 2026-05-31

Codex ha eseguito una review completa repo-grounded su `TASK-015`, senza commit, senza push, senza stage finale e senza marcare `DONE`.

Fix mirati applicati:

- history detail: `parseHistoryEntryId` ora tratta percent-encoding malformato come `invalid_entry`, evitando errori 500 su route detail;
- history detail: la query detail `sync_events` mantiene la stessa allowlist domain della lista (`history`, `catalog`, `prices`);
- harness: `tests/foundation/task-015-history.test.mjs` e `scripts/security-checks.mjs` verificano entrambi i guardrail.

Verdict finale review: `PASS_WITH_NOTES`.

Motivazione: i gate critici locali, security e Supabase linked risultano verdi in esecuzione sequenziale, e le superfici consegnate sono safe/read-only dove manca un boundary mutativo sicuro. Restano pero limiti importanti non risolti nel task corrente: CRUD catalogo, Excel apply/export reale, mutazioni staff e revoca devices richiedono RPC/migration additive o contratto mobile/POS prima di essere dichiarati completi.

Stato task dopo review: `REVIEW`, non `DONE`. Questo stato e stato superato dalla completion finale sotto.

## Esito completion finale 2026-05-31

Codex ha eseguito una fase finale di completion, senza commit, senza push, senza stage finale e senza marcare `DONE`.

Implementato:

- migration additiva `20260531171726_task_015_shop_admin_completion.sql`, applicata al linked dev dopo dry-run/lint/advisors verdi;
- helper/RPC catalogo shop-scoped per create/update/archive prodotti, categorie e fornitori, con mapping `shop_inventory_sources`, soft delete e audit;
- import/export Excel reale con `read-excel-file` e `write-excel-file`, preview obbligatoria, digest, conferma apply, limiti file/righe, formula hardening, export e template;
- staff mutations create/reset/suspend/reactivate/archive tramite RPC auditabili, hash server-side e one-time display redatto;
- `shop_devices` server registry con RLS/grants severi, rename/revoke/reactivate e audit;
- Server Actions e pannelli UI reali per catalogo, import/export, staff e devices;
- history detail, roles/permissions, settings/audit/read model mantenuti shop-scoped e con stati safe;
- harness TASK-015, e2e smoke e `scripts/security-checks.mjs` aggiornati;
- check finali passati: security scan, foundation (`69` test), typecheck, lint, build/verify con solo warning Node `DEP0205`, UI smoke (`48 passed`), Supabase linked checks sequenziali e live auth riusato in sicurezza su `localhost:3000` (`2 passed`, `1 skipped`).

Verdict completion finale: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`.

Motivazione: tutti i blocker implementabili target sono risolti. Resta una sola nota prodotto, `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`: la revoca dispositivi e persistita e auditata lato Admin Web/server, ma Android/iOS/POS devono consultare `shop_devices.status` per enforcement client.

Stato task: `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`, non `DONE`. Prossimo passo consigliato: review utente e conferma esplicita per marcare `DONE`; pianificare update client mobile/POS per enforcement device.

## Matrice test/check

| Test | Tipo | Quando eseguirlo | Esito atteso |
| --- | --- | --- | --- |
| `git status --short` | Git | Pre-flight e finale | Scope chiaro, nessun file staged finale |
| `git diff --check` | Git | Pre-flight e finale | Nessun whitespace error |
| `supabase migration list --linked` | Supabase | Discovery e post-migration | Local/remoto coerenti o divergence documentata |
| `supabase db push --linked --dry-run` | Supabase | Prima di applicare migration e post-push | Dry-run coerente |
| `supabase db lint --linked --schema public,app_private --level error --fail-on error` | Supabase | Prima e dopo migration | Nessun schema error |
| `supabase db advisors --linked --type security --level error --fail-on error` | Supabase | Prima e dopo migration | Nessun issue security error |
| `npm run typecheck` | Locale | Finale | `PASS` |
| `npm run lint` | Locale | Finale | `PASS` |
| `npm run test:foundation` | Locale | Finale | `PASS` |
| `npm run security:scan` | Locale | Finale | `PASS` |
| `npm run build` | Locale | Finale | `PASS` o `PASS_WITH_WARNINGS` motivato |
| `npm run verify` | Locale | Finale | `PASS` o `PASS_WITH_WARNINGS` motivato |
| `npm run test:ui-smoke` | Playwright | Finale | `PASS` o blocker reale |
| `CONFIRM_PLATFORM_ADMIN_LIVE_BROWSER_TEST=yes npm run test:ui-live-auth` | Live opt-in | Se disponibile e sicuro | `PASS`, `PASS_WITH_NOTES`, `BLOCKED` o `NOT_RUN` motivato |

## Harness da aggiungere o rafforzare in execution

- `tests/foundation/task-015-shop-inventory.test.mjs`: mapping `owner_user_id`/`shop_inventory_sources`, no direct `shop_id` query param authz, no `.select("*")`, server-only read/action modules.
- `tests/foundation/task-015-import-export.test.mjs`: formula injection, file size/row limits, preview-before-apply, no write without confirmation, redacted reports.
- `tests/foundation/task-015-history.test.mjs`: history/sync mapping, recursive redaction, no cross-shop detail leak, no raw sensitive payload.
- `tests/foundation/task-015-staff-actions.test.mjs`: no direct grants, one-time credential display, no plaintext/hash in UI/DTO/log/evidence, audit for reset/suspend/reactivate.
- `tests/foundation/task-015-devices.test.mjs`: device schema distinction from `sync_events.source_device_id`, revocation only with real authorization model.
- `tests/foundation/task-015-permissions.test.mjs`: server-side permission matrix for shop members vs staff roles.
- `tests/e2e/task-015-shop-admin-live.spec.ts` o estensione sicura del live auth harness: synthetic shop, synthetic catalog/staff/device data, cross-shop negative checks e cleanup safe.
- `scripts/security-checks.mjs`: gate TASK-015 per service-role client/browser, credential/hash leakage, formula injection protections, history redaction, server-only actions e no client-only auth guard.
- I gate TASK-015 devono essere scoped ai file nuovi o modificati dal task e ai moduli `src/server/shop-admin/**`, `src/app/shop/**`, `src/components/shop/**` coinvolti. Baseline fuori scope rilevate staticamente vanno dichiarate in evidence come eccezioni esistenti o follow-up separati, non usate per degradare silenziosamente i gate Shop Admin.

## Strategia dati test

- Usare solo dati sintetici con prefisso `TASK015_TEST_`.
- Non usare dati reali sensibili, email reali non necessarie, password/PIN reali o token.
- Ogni dato creato deve avere cleanup plan prima della creazione.
- Preferire soft delete/archive/tombstone quando il dominio lo prevede.
- Non cancellare audit log.
- Il cleanup deve essere verificabile e documentato con query/output redatti.
- Se cleanup non riesce, classificare `PASS_WITH_NOTES` o `BLOCKED_CLEANUP` in base al rischio e lasciare evidenza puntuale.

## Template evidence richiesto

`docs/TASKS/EVIDENCE/TASK-015/README.md` deve essere mantenuto come registro operativo con almeno:

- pre-flight;
- letture obbligatorie;
- milestone status;
- discovery matrix schema;
- schema decision matrix;
- mobile/POS mapping matrix;
- route/UI evidence;
- Supabase migration/lint/advisors evidence;
- security redaction evidence;
- test data strategy e cleanup evidence;
- cross-shop leak evidence;
- import/export evidence;
- history/detail payload evidence;
- staff credential evidence;
- device authorization evidence;
- check finali;
- known blockers;
- final verdict.

## Decisioni

- Il task resta unico: non creare `TASK-015A`, `TASK-016`, `TASK-017` per spezzare questo scope.
- Le fasi interne sono ammesse, ma il tracking ufficiale resta `TASK-015`.
- POS/Staff resta modulo della `Shop Admin Console`.
- Login POS completo e integrazione POS Windows possono restare follow-up se richiedono scope separato.
- La granularita avanzata ruoli/permessi puo restare follow-up solo se lo schema reale o i gate di sicurezza bloccano una versione sicura nel task.
- Device Security Overview Platform resta read-only/emergency-only e non sostituisce la gestione quotidiana Shop Admin.
- CSV fallback per import/export non soddisfa automaticamente la richiesta Excel: serve approvazione o motivazione esplicita se Excel reale resta bloccato.

## Handoff execution richiesto a Codex

La risposta finale di execution deve includere:

- branch corrente;
- file modificati;
- migration create/applicate;
- tabelle/view/RPC/helper toccati;
- funzionalita completate;
- funzionalita bloccate e motivo reale;
- check eseguiti e risultati;
- Supabase linked checks;
- browser/Playwright checks;
- rischi residui;
- cosa resta fuori scope;
- prossimo passo consigliato;
- conferma di nessun commit, nessun git push, nessuno stage finale e nessun secret esposto.

## Planning

- Obiettivo compreso: completare operativamente la Shop Admin Console senza perdere boundary shop-scoped e sicurezza server-side.
- Piano minimo: discovery reale, schema/migration solo se necessario, read model e azioni per area, UI sicura, test/evidence e handoff a `REVIEW`.
- Safety gates: Supabase lint/advisors, no secret leakage, no service-role client/browser, no `credential_hash` in UI/DTO, no cross-shop leak.
- Follow-up candidati separati: login POS completo, integrazione Win7POS runtime, granularita ruoli avanzata se non supportata dallo schema, device authorization avanzata se manca schema sicuro, automazioni/deploy non richieste.
- Planning review verdict: `READY_FOR_EXECUTION_WITH_NOTES`.

## Execution

- Stato: `COMPLETED_READY_FOR_DONE_CONFIRMATION_WITH_NOTES`
- Branch: `codex/task-015-complete-shop-admin-console`
- Note: completion finale avviata da Codex il 2026-05-31 su richiesta utente. Il tracking ufficiale resta `TASK-015`; il task e in `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`, senza essere marcato `DONE`. Sono stati implementati migration/RPC additivi, CRUD catalogo, import/export Excel, mutazioni staff, registry dispositivi server-side, Server Actions, route/pannelli UI e harness/security gate aggiornati. Resta nota di prodotto `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`: la revoca dispositivi e registrata lato server, ma Android/iOS/POS devono consumare `shop_devices.status` per enforcement client.

## Review

- Stato: `REVIEW_READY_FOR_DONE_CONFIRMATION`
- Condizione per passare a `DONE`: review positiva piu conferma esplicita dell'utente.

## Chiusura

- Stato finale: `DONE_WITH_NOTES`
- Conferma utente: `RECEIVED`
- Data chiusura: 2026-05-31
- Follow-up aperti: `MOBILE_POS_ENFORCEMENT_FOLLOW_UP`
- Note: TASK-015 chiuso a DONE su conferma esplicita dell'utente. Nota residua accettata: MOBILE_POS_ENFORCEMENT_FOLLOW_UP per enforcement client Android/iOS/POS di shop_devices.status. Admin Web/Supabase/server-side completati e verificati.
