# TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap

## Stato

- Stato: `REVIEW`
- Fase: `REVIEW`
- Responsabile corrente: `CLAUDE_REVIEW`
- Data apertura: `2026-06-06`
- Evidence: `docs/TASKS/EVIDENCE/TASK-051/README.md`
- Branch Admin Web: `main`
- Commit: `REQUESTED_BY_USER_2026-06-07`
- Push: `REQUESTED_BY_USER_2026-06-07`
- Stage finale: `REQUESTED_BY_USER_2026-06-07`
- Handoff Codex: `PASS_WITH_NOTES_READY_FOR_REVIEW`

## Obiettivo

Evolvere `/platform/provisioning` per creare shop con identita fiscale/boleta,
supportare bootstrap POS-first senza account personale e creare il primo manager
POS/Admin Console con `staff_code = 1001` e Temporary PIN generato
server-side.

## Scope

- Creazione shop con owner personale esistente.
- Creazione shop POS-first senza owner personale.
- Dati fiscali/boleta shop: `company_rut`, `business_giro`,
  `business_address`, `business_city`, `legal_representative_rut`.
- `shop_code resta tecnico` per login POS/Admin Console, perche il vincolo
  schema accetta solo `^[A-Z0-9][A-Z0-9_-]{2,31}$`.
- `company_rut separato` per supportare RUT cileno con formato fiscalizzato.
- Company RUT puo essere inserito in formato fiscale leggibile, esempio
  `76.123.456-7`; il form deriva `shop_code` tecnico rimuovendo punti,
  trattino e spazi, esempio `761234567` o `76123456K`.
- Staff manager iniziale `1001`, role `manager`, permission
  `shop_admin.full_access`.
- Temporary manager PIN generato e hashato server-side; raw mostrato solo nella
  risposta immediata della Server Action.
- Temporary PIN e mostrato una sola volta; la UI indica che dovrebbe essere
  cambiato dopo il primo accesso.
- Temporary manager PIN e una scelta UX per primo accesso Admin Console /
  Win7POS: formato esatto 5 cifre numeriche, generato server-side con
  `crypto.randomInt(10000, 100000)`, hashato con il meccanismo staff credential
  esistente e mai salvato raw.
- Force rotation resta follow-up: i runtime staff web/POS correnti richiedono
  `credential_status = active` e `must_change_credential = false` per il login,
  quindi abilitarlo nel bootstrap bloccherebbe accesso senza flusso cambio
  credenziale first-access.
- Recovery non mostra mai PIN/password esistenti: genera un nuovo Temporary PIN
  one-time con reason/audit.
- Pending owner invite chiarito come setup secondario senza email delivery.
- Admin Console settings mostra fiscal identity read-only.

## Fuori Scope

- No commit.
- No push.
- No stage finale.
- Nota 2026-06-07: questi tre vincoli erano il perimetro originale di
  execution/review; sono superati solo per stage/commit/push da richiesta
  esplicita successiva dell'utente. TASK-051 resta in `REVIEW`, non `DONE`.
- No production apply.
- No service-role o secret nel client/browser.
- No raw credential, PIN, password o token in repository, audit, log o evidence.
- No platform_admin concesso a shop owner.
- No merchant/store layer.
- No email delivery reale.
- No Win7POS runtime change.
- No copia cataloghi automatica.
- No Sales Sync live.

## Discovery schema reale

- `shops` prima di TASK-051 contiene `shop_id`, `shop_code`, `shop_name`,
  `shop_status`, lifecycle/status fields e audit linkage; non contiene campi
  fiscali/boleta.
- `shop_code` e tecnico, uppercase e vincolato a lettere/numeri/underscore/dash.
  Non e adatto a RUT cileno con punti e trattino come sorgente unica fiscale.
- Non esiste una tabella dedicata gia adatta a fiscal/boleta identity.
- Shop Admin settings oggi aggiorna solo `shop_name` tramite server boundary e
  service-role server-side, con reason/audit. I nuovi campi fiscali restano
  fuori da quella mutation.
- `platform_create_shop` e `platform_create_shop_with_pending_owner_invite`
  sono RPC auditati esistenti per i flussi legacy.
- `staff_accounts`, `staff_role_permissions` e `staff_web_sessions` esistono.
  La credential staff usa hash Node-side `scrypt-v1`.
- Esiste generazione one-time nel flusso POS manager web access; TASK-051 la
  riusa come modello.
- `shop_inventory_sources` mappa owner mobile a shop, ma non basta per copiare
  cataloghi in modo sicuro.

## Decisioni implementative

- Migration additiva minima:
  `supabase/migrations/20260606120000_task_051_platform_provisioning_fiscal_pos_first.sql`.
- Campi fiscali nullable per compatibilita con shop esistenti.
- Unique guard su `company_rut` quando presente.
- Trigger `shops_task051_fiscal_identity_platform_only` blocca update fiscali
  non-platform solo quando quei campi cambiano.
- Nuove RPC auditabili:
  - `platform_create_shop_with_owner_bootstrap`;
  - `platform_create_pos_first_shop`;
  - overload fiscalizzato di `platform_create_shop_with_pending_owner_invite`.
- Credential raw non passa mai in SQL: il server genera raw, calcola hash
  `scrypt-v1`, invia alla RPC solo `credential_hash`.
- `Catalog migration/import preview` resta follow-up separato: prima serve
  preview, reason, audit e test no cross-shop leak.

## Criteri di accettazione

- `/platform/provisioning` mostra un unico form principale `Create shop` con
  sezioni shop identity, fiscal/boleta identity, initial manager access e owner
  setup mode.
- Owner setup mode gestisce internamente:
  `No personal owner now / POS-first`, `Link existing personal owner` e
  `Record pending owner email`.
- `Add POS manager` resta disponibile solo come `Advanced recovery` collassato
  per recuperare accesso manager su shop attivi esistenti.
- Company RUT display resta leggibile; quando `Use Company RUT as Shop code` e
  attivo, `shop_code` viene derivato senza separatori per login POS/Admin
  Console.
- Owner picker usa ricerca locale senza nuove dipendenze e hidden
  `ownerProfileId`; il server valida comunque il profilo.
- POS-first crea shop senza `shop_members` owner personale.
- Owner bootstrap collega solo `shop_owner`, non `platform_admin`.
- Entrambi i bootstrap iniziali creano staff manager `1001` con
  `shop_admin.full_access`.
- Temporary PIN e mostrato una sola volta nello stato della Server Action.
- Temporary PIN copy chiarisce che e mostrato una volta e dovrebbe essere
  cambiato dopo il primo accesso.
- Recovery manager genera un nuovo Temporary PIN one-time; non mostra mai quello
  vecchia.
- Audit registra solo `credential_generated`, staff code/ID e permission safe.
- Admin Console mostra fiscal identity read-only e dice che e gestita dalla
  Master Console.
- Devices/Sync restano fuori dalla sidebar primaria.

## Check richiesti

- `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs`
- `npm run security:scan`
- `npm run test:foundation`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run verify`
- `npm run test:ui-smoke:ci`, se runtime locale sicuro disponibile
- `npm run db:local:status`, se disponibile
- `supabase migration list --local`, se CLI/local disponibile
- `supabase db lint --local --schema public,app_private --fail-on error`, se locale disponibile
- `git diff --check`
- `git diff --cached --name-status`
- `git status --short --branch --untracked-files=all`

## Handoff atteso

Codex prepara handoff a `REVIEW`, con file toccati, evidence reale, rischi
residui, cleanup, conferma no raw credential/no service-role client/no
platform_admin a shop owner, e prossimi passi per catalog import preview e
Win7POS uso dei dati boleta.

## Handoff Codex 2026-06-06

- Execution completata e pronta per review; task non marcato `DONE`.
- Migration applicata solo al database locale con
  `supabase migration up --local`; nessun apply production.
- Check locali principali passati: TASK-051 targeted, `security:scan`,
  `test:foundation`, `verify`, smoke Playwright CI non autenticato,
  Supabase local migration/lint e `git diff --check`.
- `npm run db:local:status` resta `FAIL_CLOSED` perche `.env.local` punta a
  `supabase_cloud`; questo non blocca l'handoff ma va considerato prima di
  dichiarare un runtime locale sicuro con env corrente.

## Review Fix Codex 2026-06-06

- Review-fix UI completato su `/platform/provisioning`; task resta in `REVIEW`.
- La pagina ora usa `one create shop form + owner setup mode + advanced
  recovery`: un solo form principale `Create shop`, con scelta interna per
  POS-first, owner personale esistente o pending owner email.
- Company RUT puo essere inserito come `76.123.456-7`; con `Use Company RUT as
  Shop code` attivo il form deriva `761234567` per il login tecnico.
- Visual review fix: nel form `Create shop`, `Company RUT` e stato spostato
  sopra `Shop code` dentro `Shop identity`; l'ordine e `Shop name`, `Company
  RUT`, toggle `Use Company RUT as Shop code`, `Shop code`. `Shop name` resta un
  normale input single-line.
- Il form mostra summary read-only per initial manager: staff code `1001`,
  display name `manager`, full Admin Console access e Temporary PIN mostrato
  una sola volta dopo la creazione; il copy dice `Temporary PIN. It is shown
  once after creation and should be changed after first access.`
- Il success result mostra shop name, company RUT, shop code, owner mode, staff
  code `1001`, Temporary PIN shown once, copy button e warning `Save this PIN
  now. It will not be shown again.`
- `Add POS manager` e stato semplificato in `Emergency recovery: recover
  initial manager 1001` collassato. La recovery genera una nuova temporary
  credential e non mostra credenziali esistenti.
- Recovery standard non espone piu recovery action multiple o staff code
  editabile: mostra search shop, target shop, manager state read-only, reason e
  submit `Recover manager 1001`.
- La Server Action `recoverInitialManager1001Action` e il server boundary
  `recoverInitialManager1001` usano sempre `staff_code = 1001`; qualsiasi
  `staffCode` inviato dal client viene ignorato.
- 1001 active/suspended/archived/missing recovery case: se manager `1001` esiste
  e utilizzabile, resetta la credential; se e sospeso, archiviato, disabled o
  non utilizzabile, viene riportato `active` e resettato; se manca, viene
  ricreato manager `1001` con display name server-side `manager`.
- Se il server trova piu righe anomale per `staff_code = 1001` nello stesso
  shop, fallisce chiuso, non genera credential e scrive audit redatto con
  follow-up manuale.
- Il result card recovery mostra shop name, shop code, staff code `1001`,
  operation result, Temporary PIN one-time, copy button e warning `Save this
  PIN now. It will not be shown again.`
- Custom manager code resta follow-up documentato; non viene implementato nella
  recovery principale per evitare una UI che il server non supporta come flusso
  operativo primario.
- Entity picker unification: `Initial owner` e `Target shop` recovery usano lo
  stesso componente client `SearchableEntityPicker`, senza nuove dipendenze.
- Il picker usa search input, lista scrollabile, row selezionabile con stato
  visuale, summary selezionato e hidden input per la Server Action.
- `Initial owner` mostra display name, short profile id, status e full profile
  id nel title; il server continua a validare `ownerProfileId` e il bootstrap
  collega solo `shop_owner`, non `platform_admin`.
- `Target shop` recovery non usa piu `<select>` nativo: mostra shop name, shop
  code, status e full shop id/shop code nel title; il server continua a
  validare `shopId` e la recovery resta sempre su manager `1001`.
- I select nativi restano fuori dai picker di entita database in
  `/platform/provisioning`; possono restare solo per liste piccole/statiche.
- Shop name uppercase normalization: alla fine dell'inserimento il campo
  `Shop name` normalizza il valore in maiuscolo nel client; le validazioni
  server-side normalizzano comunque `shopName` in maiuscolo prima delle RPC,
  cosi il dato salvato e il result banner restano coerenti anche se il client
  viene bypassato.
- Form value preservation/RUT review-fix: gli errori server-side del form
  provisioning restituiscono `values` non sensibili e non forzano revalidate,
  quindi `Shop name`, RUT, fiscal fields, owner mode/target e reason non vengono
  cancellati; `Company RUT` e `Legal representative RUT` accettano digits-only e
  vengono formattati su blur, mentre `shop_code` resta il RUT compatto tecnico.
- Provisioning layout polish: `Shop identity` ora mostra `Shop name` e
  `Company RUT` nella stessa riga logica desktop, toggle RUT in riga dedicata e
  `Shop code` full width sotto; `Fiscal / Boleta identity` mostra `Business
  giro`/`Address` e poi `City`/`Legal representative RUT` in due righe compatte.
  Gli helper lunghi sotto i singoli RUT sono stati rimossi/ridotti a una sola
  frase di sezione; gli errori field-level restano vicini ai campi.
- Gli input editabili per manager display name sono stati rimossi dai bootstrap
  iniziali e dal provisioning manager su shop esistente.
- Default server-side: `display_name = "manager"`; staff code, role e permission
  restano `1001`, `manager`, `shop_admin.full_access`.
- Master Console recovery resta globale/emergency con reason obbligatoria e
  audit; Admin Console recovery shop-scoped staff credential reset resta
  follow-up ordinario se non gia coperto da task precedenti.
- Verifica last manager guard: non risulta un blocco esplicito esistente per
  suspend/archive/revoke dell'ultimo manager full-access nella Admin Console.
  Follow-up: `Block removing the last full-access shop manager in Admin
  Console.`
- Nessuna migration nuova, nessun cambio schema e nessun apply production.

## Review Fix Temporary Manager PIN 2026-06-06

- Il valore temporaneo lungo prefissato legacy e stato sostituito per
  provisioning manager `1001` con `Temporary PIN`.
- Generazione server-side: `generateTemporaryManagerPin()` usa
  `crypto.randomInt(10000, 100000)` e restituisce sempre una stringa numerica di
  5 cifre.
- Scope applicato a creazione shop con owner, POS-first shop e recovery
  `Recover manager 1001`; pending owner setup non crea manager iniziale nel
  backend corrente e quindi non inventa PIN.
- Il PIN raw viene hashato con `hashStaffCredential` prima delle RPC/update
  staff e non viene scritto in DB, audit, log, evidence, URL o storage client.
- UI/result card aggiornate a `Temporary PIN shown once`, copy `Copy PIN` e
  warning `Save this PIN now. It will not be shown again.`
- Copy first-access: `Use this PIN with shop code and staff code 1001 for the
  first Admin Console / Win7POS access. The shop should change it after first
  access.`
- Nessuna modifica a Win7POS runtime, session token, device token, auth token,
  schema o migration.
