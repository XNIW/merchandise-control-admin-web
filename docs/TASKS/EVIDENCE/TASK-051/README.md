# Evidence TASK-051 - Platform Provisioning fiscal identity and POS-first bootstrap

## Stato

- Task: `TASK-051 - Platform Provisioning fiscal identity and POS-first shop bootstrap`
- Stato task: `REVIEW`
- Fase: `REVIEW`
- Data: `2026-06-06`
- Commit: `REQUESTED_BY_USER_2026-06-07`
- Push: `REQUESTED_BY_USER_2026-06-07`
- Stage finale: `REQUESTED_BY_USER_2026-06-07`
- Handoff Codex: `PASS_WITH_NOTES_READY_FOR_REVIEW`

Nota 2026-06-07: stage/commit/push sono stati richiesti esplicitamente
dall'utente dopo l'handoff `REVIEW`. Questo non marca TASK-051 come `DONE`.

## Schema reale verificato

- `shops` non aveva campi fiscal/boleta dedicati prima di questa task.
- `shop_code` resta tecnico: il vincolo schema accetta solo uppercase
  lettere/numeri/underscore/dash, quindi non e usato come RUT fiscale.
- `company_rut separato` viene introdotto come campo fiscale.
- RUT formatted for fiscal identity: la UI accetta e mostra esempi fiscali
  leggibili come `76.123.456-7`.
- shop_code derived without separators: con `Use Company RUT as Shop code`
  attivo, il form deriva `76.123.456-7 -> 761234567` e
  `76.123.456-K -> 76123456K` per il login tecnico.
- `staff_accounts`, `staff_role_permissions`, `staff_web_sessions`,
  `shop_members`, `platform_owner_invites`, `shop_inventory_sources` e
  `inventory_products` sono presenti nello schema/tipi/migration history.
- Shop Admin settings muta solo `shop_name`; i campi fiscali nuovi restano
  esclusi dalla mutation.
- Catalogo: `shop_inventory_sources` esiste, ma la copia automatica catalogo non
  viene implementata. Follow-up consigliato: `Catalog migration/import preview`.

## Implementazione registrata

- Migration additiva preparata:
  `supabase/migrations/20260606120000_task_051_platform_provisioning_fiscal_pos_first.sql`.
- Read model Platform esteso con campi fiscal safe e fallback se migration non
  applicata.
- Read model Shop Admin esteso con fiscal identity read-only.
- `/platform/provisioning` riorganizzato in `one create shop form + owner setup
  mode + advanced recovery`:
  - form principale `Create shop`;
  - owner setup mode per POS-first, owner personale esistente o pending owner
    email;
  - `Add POS manager` disponibile solo come recovery collassata.
- Owner profile e target shop recovery usano un picker entita condiviso senza
  nuove dipendenze.
- Guardrail statici TASK-016/TASK-044 aggiornati per il nuovo flusso
  `useActionState`, mantenendo vietati token/hash in read model e UI.

## Review Fix UI 2026-06-06

- Review-fix applicato senza cambiare schema o migration.
- Summary UX: `one create shop form + owner setup mode + advanced recovery`.
- Summary RUT/shop code: RUT formatted for fiscal identity, shop_code derived
  without separators.
- `/platform/provisioning` ora usa `one create shop form + owner setup mode +
  advanced recovery`:
  - titolo form `Create shop`;
  - sottotitolo `Create the shop, fiscal identity, initial manager access, and
    optional owner setup.`;
  - sezioni `Shop identity`, `Fiscal / Boleta identity`, `Initial manager
    access`, `Owner setup` e `Reason`;
  - `Shop identity` ordina i campi come `Shop name`, `Company RUT`, toggle
    `Use Company RUT as Shop code`, poi `Shop code`, cosi il codice login e
    chiaramente derivato dal RUT quando il toggle e attivo;
  - `Shop name` resta un normale input single-line; il campo `Company RUT` non
    e piu nascosto piu in basso nel fieldset fiscal;
  - toggle checked by default `Use Company RUT as Shop code`;
  - copy `Shop code is used for POS/Admin Console login. By default it uses
    Company RUT without dots or dash.`;
  - owner setup mode con `No personal owner now / POS-first`, `Link existing
    personal owner`, `Record pending owner email`;
  - pending owner email mostra la nota `This records a pending owner setup.
    Email delivery is not active yet.`;
  - result banner vicino al form con `Shop created`, shop name, company RUT,
    shop code, owner mode, staff code `1001`, Temporary PIN shown once, owner
    status, copy button e warning `Save this PIN now. It will not be shown
    again.`;
  - PIN copy: `Temporary PIN. It is shown once after creation and should be
    changed after first access.`
- `Add POS manager` e stato semplificato dentro `Emergency recovery: recover
  initial manager 1001` collassato, con copy: `Use this only when an existing
  shop lost manager access. The server will restore or recreate manager 1001
  and generate a new temporary PIN. The old PIN is never shown.`
- Recovery form button: `Recover manager 1001`.
- Recovery form order: `Search target shops`, `Target shop`, `Manager state`,
  `Reason`, poi submit `Recover manager 1001`.
- Manager state copy non inventa dati client-side: indica che la disponibilita
  manager viene risolta al server boundary dopo la selezione shop, perche la
  read model dinamica dei manager non e disponibile in questo pannello.
- Recovery standard espone una sola azione principale: `Recover initial manager
  1001`.
- Il client non espone piu `recoveryAction`, radio option multiple o
  `name="staffCode"` nella recovery standard.
- `Reset credential for selected manager` e stato rimosso perche la read model
  dinamica dei manager non e disponibile in questo pannello.
- `recoverInitialManager1001Action` e `recoverInitialManager1001` usano sempre
  `staff_code = 1001`; eventuali valori `staffCode` inviati dal client vengono
  ignorati.
- Custom manager code resta follow-up documentato; non viene implementato nella
  recovery principale perche non deve diventare una seconda opzione ambigua.
- Result card recovery mostra `Shop name`, `Shop code`, `Staff code: 1001`,
  `Operation result`, `Temporary PIN`, copy button e warning `Save this PIN
  now. It will not be shown again.`
- Layout verificabile dal sorgente:
  - contenitore principale `max-w-5xl`;
  - form principale single-column;
  - shop identity con due input normali in riga su desktop (`Shop name` e
    `Company RUT`) e shop code sotto;
  - owner/profile picker e target shop picker con ricerca locale, lista
    scrollabile `max-h-72`, selected state evidente, summary e hidden input;
  - fiscal identity in fieldset compatto con helper text e campi giro/address/
    city/legal representative RUT;
  - bottoni submit allineati a destra e non full-width su desktop.
- Gli input editabili `staffDisplayName` e `displayName` sono stati rimossi da
  provisioning bootstrap e dal pannello manager su shop esistente.
- Default server-side: `display_name = "manager"`. Il form mostra solo summary
  read-only per `Staff code: 1001`, `Display name: manager`, full Admin Console
  access e `Temporary PIN. It is shown once after creation and should be
  changed after first access.`

## Sicurezza credential

- Temporary manager PIN generato server-side con crypto sicuro tramite
  `crypto.randomInt(10000, 100000)`, quindi mostrato come esattamente 5 cifre
  numeriche senza zero iniziale.
- La UI non promette piu validita permissiva della credential temporanea:
  indica che e mostrata una sola volta e dovrebbe essere cambiata dopo il primo
  accesso.
- Force rotation follow-up: i runtime staff web/POS attuali richiedono
  `credential_status = active` e `must_change_credential = false` per il login;
  impostare `must_change_credential = true` nel bootstrap bloccherebbe
  l'accesso senza un flusso cambio credenziale pronto. Follow-up consigliato:
  implementare cambio credenziale first-access e poi abilitare force rotation
  per la credential iniziale.
- Hash staff calcolato server-side con `scrypt-v1`.
- La RPC riceve solo `credential_hash`.
- Audit registra `credential_generated`, `staff_code`, `staff_id`,
  `permission_key`; non registra il PIN raw.
- temporary manager PIN raw non presente in DB/audit/log/evidence.
- Nessun valore PIN/password/token e salvato in repository.
- Recovery policy: Never show existing PINs. Recovery always generates a new one-time temporary manager PIN.
- Never show existing PINs. Recovery always generates a new one-time temporary
  manager PIN.
- 1001 active/suspended/archived/missing recovery case: se manager `1001` esiste
  e utilizzabile, Master Console recovery resetta hash/sessioni e genera nuova
  credential; se era sospeso, archiviato, disabled o non utilizzabile, lo
  riporta `active` e resetta la credential; se non esiste, ricrea manager `1001`
  con display name server-side `manager`.
- Duplicate 1001 anomaly: se il server trova piu righe per `staff_code = 1001`
  nello stesso shop, fallisce chiuso, non genera credential e scrive audit
  failure redatto con `operation_result = duplicate_initial_manager`.
- Audit recovery iniziale: success event
  `platform.staff_manager.initial_recovery.success` con metadata redatto
  `shop_id`, `staff_code: 1001`, `operation_result` e
  `credential_generated: true`; nessuna credential raw.
- Reset existing manager non aggiorna `display_name`; il default `manager` e
  usato solo nel branch di creazione nuovo manager.
- Master Console recovery: global/emergency, reason obbligatoria, audit e nuova
  credential one-time.
- Admin Console recovery: shop-scoped staff credential reset resta follow-up
  ordinario se non gia completo nei task staff precedenti.
- Last manager guard: ricerca su `staff-mutations.ts`,
  `staff-aware-mutations.ts`, UI StaffActionPanel e test TASK-039 non mostra un
  guardrail esplicito che blocchi suspend/archive/revoke web access dell'ultimo
  manager full-access dello shop. Follow-up richiesto: `Block removing the last
  full-access shop manager in Admin Console.`
- Follow-up: `Block removing the last full-access shop manager in Admin Console.`

## Boundary confermati

- No service-role nel client/browser.
- No platform_admin concesso a shop owner.
- Personal account e POS staff restano separati.
- POS/Staff resta modulo della Admin Console.
- Devices/Sync restano fuori dalla sidebar primaria.
- Email delivery reale non implementata.
- Win7POS uso dei dati boleta resta follow-up: usare questi campi come sorgente
  futura per boleta/scontrino, senza modificare runtime Win7POS in questa task.

## Review Fix Recovery 1001 2026-06-06

- Recovery standard semplificata in una sola azione:
  `Emergency recovery: recover initial manager 1001`.
- Copy recovery: `Use this only when an existing shop lost manager access. The
  server will restore or recreate manager 1001 and generate a new temporary
  PIN. The old PIN is never shown.`
- Campi recovery standard visibili: `Search target shops`, `Target shop`,
  `Manager state`, `Reason`, submit `Recover manager 1001`.
- Rimosse dalla recovery principale le radio option multiple:
  `Reset credential for manager 1001`,
  `Reactivate and reset manager 1001`,
  `Create new manager access`.
- Rimosso `Advanced options / Staff code` dalla recovery principale.
- La Server Action `recoverInitialManager1001Action` non legge `staffCode` dal
  form; chiama il server boundary con `staffCode: "1001"`.
- Il server boundary `recoverInitialManager1001` sovrascrive comunque il target
  con `INITIAL_MANAGER_RECOVERY_STAFF_CODE = "1001"`, quindi eventuali valori
  client-injected non possono cambiare il target recovery.
- Comportamento idempotente:
  - manager `1001` active/usable -> `credential_reset`;
  - manager `1001` sospeso, archiviato, disabled o non utilizzabile ->
    `reactivated_reset`;
  - manager `1001` mancante -> `recreated`.
- Se vengono trovate piu righe per `staff_code = 1001` nello stesso shop,
  recovery fallisce chiuso con `duplicate_initial_manager`, non genera
  credential e scrive audit failure redatto.
- Success audit event: `platform.staff_manager.initial_recovery.success`.
- Audit metadata redatto: `shop_id`, `staff_code: 1001`,
  `operation_result`, `credential_generated`, permission/role safe metadata e
  lunghezze reason/display; nessuna credential raw.
- Result card recovery mostra shop name, shop code, staff code `1001`,
  operation result, Temporary PIN, copy button e warning `Save this PIN now. It
  will not be shown again.`
- Custom manager code resta follow-up; non implementato nella recovery standard
  per non creare una seconda opzione ambigua non richiesta.

## Review Fix Entity Pickers 2026-06-06

- `Initial owner` e `Emergency recovery / Target shop` usano lo stesso pattern
  `SearchableEntityPicker`.
- `SearchableEntityPicker` e un componente client piccolo, tipizzato e senza
  nuove dipendenze.
- Pattern comune:
  - search input;
  - lista risultati scrollabile `max-h-72`;
  - righe selezionabili via button, con `role="option"` e selected state;
  - empty state chiaro;
  - selected summary;
  - hidden input per la Server Action.
- `Initial owner` mostra display name, short profile id, status e full profile
  id nel `title`; il server continua a validare `ownerProfileId`.
- Owner bootstrap resta server-side `shop_owner`; non concede
  `platform_admin`.
- Recovery `Target shop` non usa piu select nativo `Select active shop`; mostra
  shop name, shop code, status e full shop id/shop code nel `title`.
- Recovery invia `shopId` tramite hidden input e il server valida sempre target
  shop/status prima di generare credential.
- Recovery manager resta semplificata: nessuna radio option multipla, nessun
  `Advanced options / Staff code`, target staff sempre `1001`.
- I select nativi restano ammessi solo per liste piccole/statiche; non sono piu
  usati come picker principale per profili/shop database in provisioning.

## Review Fix Shop Name Uppercase 2026-06-06

- `Shop name` nel form `Create shop` resta un input single-line controllato.
- Alla fine dell'inserimento, sul blur, il client applica trim, collapse degli
  spazi interni e uppercase al valore mostrato.
- Le validazioni server-side usano `normalizeShopName` per trasformare
  comunque `shopName` in maiuscolo prima di chiamare le RPC di creazione shop.
- I result dei flussi provisioning includono `shopName` normalizzato, quindi il
  banner success non mostra il valore raw inserito dall'utente.
- Nessuna nuova dipendenza, nessuna migration nuova, nessun cambio schema.

## Review Fix Form Value Preservation / RUT 2026-06-06

- Form value preservation: il form `Create shop` ora usa un unico state
  controllato `formValues`; se la Server Action fallisce con `fieldErrors`,
  restituisce `values` non sensibili e non esegue `revalidatePath`, cosi i dati
  gia inseriti restano visibili.
- RUT digits-only live formatting: `Company RUT` e `Legal representative RUT`
  accettano input come `123456789`; su blur vengono formattati come
  `12.345.678-9`. Il `shopCode` derivato continua a usare il RUT compatto senza
  separatori, per esempio `761234567`.
- Il server continua a validare e normalizzare `shopName`, fiscal fields, RUT,
  `shopCode`, owner mode/owner target e reason. Il client non e fonte
  autorevole.
- Errori field-level: `shopName`, `companyRut`, `shopCode`, `businessGiro`,
  `businessAddress`, `businessCity`, `legalRepresentativeRut`,
  `ownerProfileId`, `ownerContact`, `ownerSetupMode` e `reason` restano
  mappati al campo; gli input critici usano `aria-invalid`,
  `aria-describedby` e focus sul primo campo invalido dopo errore server-side.
- No password/PIN/token is preserved after validation errors: lo state `values`
  include solo dati non sensibili del form shop/fiscal/owner/reason; credential
  raw continua a essere restituita solo su success immediato e mai in error
  state, URL, query o storage.
- Audit altri form sensibili: controllati `/platform/admins`,
  `/platform/operations`, `/shop/settings`, `/shop/staff`, `/shop/devices`,
  `/shop/products`, `/shop/categories`, `/shop/suppliers`,
  `/shop/import-export`, `/shop/members`, `/shop/roles`, `/shop/staff-login`
  e `/auth/login`. I flussi non provisioning usano redirect/query, form semplici
  o credenziali sensibili che non vanno preservate; follow-up separato se si
  vuole una policy uniforme di value preservation per tutti i catalog/member
  form.
- Runtime autenticato non eseguito in questa review: `AUTHENTICATED_RUNTIME_NOT_RUN`
  per assenza di sessione Master Console/browser fixture sicura e per
  `db:local:status` fail-closed su `.env.local` cloud.

## Review Fix Provisioning Layout Polish 2026-06-06

- Layout polish applicato solo a `/platform/provisioning`, senza cambiare
  Server Actions, validazione server-side, schema, migration, recovery o
  credential handling.
- `Shop identity` ora e compatta e ordinata in tre righe logiche:
  - prima riga: `Shop name` e `Company RUT`, entrambi input single-line con
    altezza coerente e griglia `items-start`;
  - seconda riga: toggle `Use Company RUT as Shop code` full width;
  - terza riga: `Shop code` full width.
- `Shop name` non viene piu allungato da helper text nella cella accanto:
  l'helper RUT/shop code e stato spostato a livello sezione e ridotto a una
  sola frase: `RUT can be typed with or without dots/dash. Shop code uses the
  compact RUT for login.`
- Rimossi dal form visibile gli helper lunghi e ripetuti sotto `Company RUT`,
  `Shop code` e `Legal representative RUT`; gli errori field-level restano
  vicini ai rispettivi campi e appaiono solo quando presenti.
- `Fiscal / Boleta identity` ora usa due righe desktop compatte:
  - prima riga: `Business giro` e `Address`;
  - seconda riga: `City` e `Legal representative RUT`.
- Guardrail foundation aggiornato senza snapshot visuali: verifica marker
  semantici `data-layout`, ordine dei campi, assenza degli helper lunghi
  precedenti, helper RUT non duplicato e preservazione delle coperture gia
  presenti su RUT digits-only, form value preservation e uppercase shop name.
- Visual QA autenticata non eseguita: `AUTHENTICATED_VISUAL_QA_NOT_RUN`.
  La pagina resta protetta da sessione Master Console; la verifica browser
  autenticata richiede fixture/sessione sicura separata.

## Review Fix Temporary Manager PIN 2026-06-06

- Decisione UX applicata: il valore mostrato al cliente per manager iniziale
  `staff_code = 1001` e recovery `Recover manager 1001` e ora `Temporary PIN`,
  non una credential lunga.
- Formato: esattamente 5 cifre numeriche, generate nel range `10000`-`99999` per
  evitare zero iniziale. L'evidence non registra esempi runtime reali.
- Generazione server-side: helper `generateTemporaryManagerPin()` in
  `src/server/platform-admin/temporary-manager-pin.ts`, con
  `crypto.randomInt(10000, 100000)`. Nessun `Math.random` e nessun prefisso
  legacy lungo nei generatori TASK-051.
- Scope runtime: creazione shop con owner personale esistente, creazione
  POS-first shop e emergency recovery `Recover manager 1001`. Pending owner
  setup non crea manager iniziale nel backend corrente e non inventa PIN.
- Sicurezza: il PIN raw viene passato solo al result immediato della Server
  Action per visualizzazione one-time; prima della persistenza viene hashato con
  il meccanismo staff credential esistente (`scrypt-v1`).
- Il PIN raw non viene salvato in DB, audit, log, evidence, URL,
  `localStorage`, `sessionStorage` o query string; `credential_hash` non viene
  esposto alla UI.
- UI provisioning e recovery aggiornate a `Temporary PIN shown once`, `Copy PIN`
  e `Save this PIN now. It will not be shown again.`
- Copy first-access: `Use this PIN with shop code and staff code 1001 for the
  first Admin Console / Win7POS access. The shop should change it after first
  access.`
- Nessuna modifica a Win7POS runtime, schema, migration, session token, device
  token o auth token.

## Check

| Comando | Esito | Note |
| --- | --- | --- |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` red iniziale | `FAIL_EXPECTED` | 5 test falliti per migration, UI, server actions, read model e docs mancanti. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` finale | `PASS` | 5 test, 5 pass. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` review-fix entity picker | `PASS` | 5 test, 5 pass; copre picker condiviso profile/shop, hidden input, niente select nativo target shop, `shop_owner`, recovery `1001` e no raw credential in source/evidence/log. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `node --test tests/foundation/task-016-platform-security.test.mjs` | `PASS` | 3 test, 3 pass dopo riallineamento guardrail server-only hash. |
| `npm run test:foundation` | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` | `PASS` | `eslint` passato. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next.js passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run test:ui-smoke:ci` | `PASS` | 43 test Playwright non autenticati, 43 pass. |
| `npm run db:local:status` | `FAIL_CLOSED` | Supabase CLI e container locali rilevati, ma `.env.local` punta a `supabase_cloud`; il check locale fallisce chiuso. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration up --local` | `PASS` | Migration `20260606120000_task_051_platform_provisioning_fiscal_pos_first.sql` applicata solo al database locale; nessun apply production. NOTICE attesi su drop-if-exists iniziali. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase migration list --local` | `PASS` | Migration `20260606120000` presente nella storia locale dopo apply. |
| `SUPABASE_TELEMETRY_DISABLED=1 supabase db lint --local --schema public,app_private --fail-on error` | `PASS` | `No schema errors found`. |
| `git diff --check` | `PASS` | Nessun output. |
| `git diff --cached --name-status` | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` | `PASS_WITH_NOTES` | Worktree modificato su `main...origin/main`; nuovi file TASK-051 non staged. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` review-fix | `PASS` | 5 test, 5 pass. Verifica selector guidato, no display name input e default `manager`. |
| `node --test tests/foundation/task-038-pos-manager-web-login.test.mjs` review-fix | `PASS` | 6 test, 6 pass. Guardrail aggiornato su display name read-only/default. |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` review-fix | `PASS` | 5 test, 5 pass. Layout provisioning aggiornato a `max-w-5xl`. |
| `npm run lint` review-fix | `PASS` | Nessun output di errore. |
| `npm run typecheck` review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run security:scan` review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` review-fix | `PASS` | 217 test, 217 pass. |
| `npm run build` review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` review-fix | `PASS` | 43 test Playwright non autenticati, 43 pass. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` unified-form review-fix | `PASS` | 5 test, 5 pass. Verifica one create shop form, owner setup mode, advanced recovery, no display name input editabile e default server-side `manager`. |
| `node --test tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs tests/foundation/task-049-master-console-admins-ui-polish.test.mjs tests/foundation/task-016-platform-provisioning.test.mjs tests/foundation/task-038-pos-manager-web-login.test.mjs` unified-form review-fix | `PASS` | 18 test, 18 pass. Guardrail statici vicini riallineati. |
| `npm run security:scan` unified-form review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` unified-form review-fix | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` unified-form review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` unified-form review-fix | `PASS` | Nessun output di errore. |
| `npm run build` unified-form review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` unified-form review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` unified-form review-fix | `PASS` | 43 test Playwright non autenticati, 43 pass. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `git diff --check` unified-form review-fix | `PASS` | Nessun output. |
| `git diff --cached --name-status` unified-form review-fix | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` unified-form review-fix | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche/non tracciati TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` RUT/recovery review-fix | `PASS` | 5 test, 5 pass. Verifica `Use Company RUT as Shop code`, esempi `76.123.456-7 -> 761234567`, temporary PIN practical policy, recovery one-time reset e no display name input. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs tests/foundation/task-049-master-console-admins-ui-polish.test.mjs tests/foundation/task-038-pos-manager-web-login.test.mjs` RUT/recovery review-fix | `PASS` | 21 test, 21 pass. Guardrail vicini riallineati su placeholder RUT/shop code e recovery button. |
| `npm run security:scan` RUT/recovery review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` RUT/recovery review-fix | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` RUT/recovery review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` RUT/recovery review-fix | `PASS` | Nessun output di errore. |
| `npm run build` RUT/recovery review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` RUT/recovery review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` RUT/recovery review-fix | `PASS` | 43 test Playwright non autenticati, 43 pass. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `git diff --check` RUT/recovery review-fix | `PASS` | Nessun output. |
| `git diff --cached --name-status` RUT/recovery review-fix | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` RUT/recovery review-fix | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche/non tracciati TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` visual-order review-fix | `PASS` | 10 test, 10 pass. Verifica ordine `Shop name`, `Company RUT`, toggle RUT, `Shop code` e input shop name single-line. |
| `npm run security:scan` visual-order review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` visual-order review-fix | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` visual-order review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` visual-order review-fix | `PASS` | Nessun output di errore. |
| `npm run build` visual-order review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` visual-order review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` visual-order review-fix | `PASS` | 43 test Playwright non autenticati, 43 pass. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` final UX/safety hardening | `PASS` | 5 test, 5 pass. Verifica credential copy one-time, result card con shop/name/RUT/mode/staff code/copy warning, pending owner copy, emergency recovery e no selected-manager reset. |
| `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` final UX/safety hardening | `PASS` | 8 test, 8 pass. Guardrail vicini aggiornati per copy credential e secondary sidebar. |
| `npm run security:scan` final UX/safety hardening | `PASS` | `Security scan passed.` |
| `npm run test:foundation` final UX/safety hardening | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` final UX/safety hardening | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` final UX/safety hardening | `PASS` | Nessun output di errore. |
| `npm run build` final UX/safety hardening | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` final UX/safety hardening | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` final UX/safety hardening | `PASS` | 43 test Playwright non autenticati, 43 pass. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` final evidence refresh | `PASS` | 5 test, 5 pass dopo aggiornamento evidence. |
| `npm run security:scan` final evidence refresh | `PASS` | `Security scan passed.` dopo aggiornamento evidence. |
| `git diff --check` final evidence refresh | `PASS` | Nessun output. |
| `git diff --cached --name-status` final evidence refresh | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` final evidence refresh | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche/non tracciati TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` shop-name uppercase review-fix | `PASS` | 5 test, 5 pass. Verifica uppercase su blur client, normalizzazione server-side `shopName`, result banner normalizzato e guardrail TASK-051 esistenti. |
| `npm run typecheck` shop-name uppercase review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` shop-name uppercase review-fix | `PASS` | `eslint` passato senza errori. |
| `npm run security:scan` shop-name uppercase review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` shop-name uppercase review-fix | `PASS` | 217 test, 217 pass. |
| `npm run build` shop-name uppercase review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `git diff --check` shop-name uppercase review-fix | `PASS` | Nessun output. |
| `git status --short --branch --untracked-files=all` shop-name uppercase review-fix | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche non staged per il review-fix; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` form value/RUT review-fix | `PASS` | 5 test, 5 pass. Copre `values` su errore, RUT digits-only/blur formatting, field-level errors, no raw credential in error state e recovery `1001` invariata. |
| `node --test tests/foundation/task-048-master-console-secondary-sections-ux-polish.test.mjs` form value/RUT review-fix | `PASS` | 3 test, 3 pass. |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` form value/RUT review-fix | `PASS` | 5 test, 5 pass. |
| `node --test tests/foundation/platform-admin-actions.test.mjs tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` form value/RUT review-fix | `PASS` | 8 test, 8 pass. Conferma anche il guardrail storico TASK-006: `action-types.ts` resta privo di parole sensibili `email/password/token/secret`. |
| `npm run lint` form value/RUT review-fix | `PASS` | `eslint` passato senza errori. |
| `npm run typecheck` form value/RUT review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run security:scan` form value/RUT review-fix | `PASS` | `Security scan passed.` |
| `npm run test:foundation` form value/RUT review-fix | `PASS` | 217 test, 217 pass. |
| `npm run build` form value/RUT review-fix | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` form value/RUT review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` form value/RUT review-fix | `PASS_WITH_WARNINGS` | 43 test Playwright, 43 pass; include `/platform/provisioning` protetto senza overlay client-side. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `npm run db:local:status` form value/RUT review-fix | `FAIL_CLOSED` | Supabase CLI/container locali presenti, ma `.env.local:NEXT_PUBLIC_SUPABASE_URL_TARGET=supabase_cloud`; runtime autenticato/dataset TASK051 non eseguito. Output redatto. |
| `git diff --check` form value/RUT review-fix | `PASS` | Nessun output dopo rimozione riga vuota EOF generata in `database.types.ts`. |
| `git diff --cached --name-status` form value/RUT review-fix | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` form value/RUT review-fix | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche TASK-051 non staged; no commit, no push, no stage. |
| Browser in-app local `/platform/provisioning` final UX/safety hardening | `PASS_WITH_BOUNDARY` | Avviato `npm run start -- --hostname 127.0.0.1 --port 3004`, aperto `http://127.0.0.1:3004/platform/provisioning`; DOM mostra `Master Console access required`, `No active session`, link `Sign in`. Verificato boundary auth read-only; nessun submit. Server spento e porta `3004` liberata. |
| Browser/Chrome authenticated visual QA visual-order review-fix | `NOT_RUN` | Nessuna sessione Master Console autenticata disponibile nel Browser in-app; non dichiaro PASS visuale autenticato dalle screenshot. |
| `git diff --check` visual-order review-fix | `PASS` | Nessun output. |
| `git diff --cached --name-status` visual-order review-fix | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` visual-order review-fix | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche/non tracciati TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` recovery-1001 simplification | `PASS` | 5 test, 5 pass. Test scritto prima ha fallito su titolo/action server mancanti; dopo fix passa. |
| `node --test tests/foundation/task-038-pos-manager-web-login.test.mjs tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` recovery-1001 simplification | `PASS` | 11 test, 11 pass. Guardrail TASK-038 aggiornato a `recoverInitialManager1001Action`. |
| `npm run security:scan` recovery-1001 simplification | `PASS` | `Security scan passed.` |
| `npm run test:foundation` recovery-1001 simplification | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` recovery-1001 simplification | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` recovery-1001 simplification | `PASS` | Nessun output di errore. |
| `npm run build` recovery-1001 simplification | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` recovery-1001 simplification | `PASS_WITH_WARNINGS` | Rilanciato isolato dopo un tentativo parallelo con `npm run build` che aveva colpito il lock Next `Another next build process is already running`; rerun isolato passa con stessi warning non bloccanti. |
| `npm run test:ui-smoke:ci` recovery-1001 simplification | `PASS_WITH_WARNINGS` | Rilanciato isolato dopo un tentativo parallelo con `verify` che aveva letto `.next` durante rebuild; rerun isolato passa 43/43. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `npm run db:local:status` recovery-1001 simplification | `FAIL_CLOSED` | Supabase CLI/container locali presenti, ma `.env.local:NEXT_PUBLIC_SUPABASE_URL_TARGET=supabase_cloud`; runtime/local dataset recovery non eseguito. Output redatto. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` recovery-1001 evidence refresh | `PASS` | 5 test, 5 pass dopo aggiornamento evidence. |
| `npm run test:foundation` recovery-1001 evidence refresh | `PASS` | 217 test, 217 pass dopo aggiornamento evidence. |
| `npm run security:scan` recovery-1001 evidence refresh | `PASS` | `Security scan passed.` dopo aggiornamento evidence. |
| `git diff --check` recovery-1001 evidence refresh | `PASS` | Nessun output. |
| `git diff --cached --name-status` recovery-1001 evidence refresh | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` recovery-1001 evidence refresh | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche/non tracciati TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` layout-polish red | `FAIL_EXPECTED` | Test TDD scritto prima: falliva su helper compatto/layout marker mancanti. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` layout-polish | `PASS` | 5 test, 5 pass. Copre righe logiche `Shop name`/`Company RUT`, toggle separato, `Shop code` full width, `City`/`Legal representative RUT` nella stessa riga e helper RUT non duplicato. |
| `npm run security:scan` layout-polish | `PASS` | `Security scan passed.` |
| `npm run test:foundation` layout-polish | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` layout-polish | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` layout-polish | `PASS` | `eslint` passato senza errori. |
| `npm run build` layout-polish | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` layout-polish | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` layout-polish | `PASS_WITH_WARNINGS` | 43 test Playwright, 43 pass; include `/platform/provisioning` protetto. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| Browser in-app local `/platform/provisioning` layout-polish | `PASS_WITH_BOUNDARY` | Avviato `npm run start -- --hostname 127.0.0.1 --port 3004`, aperto `http://127.0.0.1:3004/platform/provisioning`; title `Provisioning | MerchandiseControl Admin Web`, DOM con `Master Console access required` e `No active session`, nessun `fieldErrorId`/runtime overlay e zero console error. Server spento e porta `3004` liberata. |
| `git diff --check` layout-polish | `PASS` | Nessun output. |
| `git diff --cached --name-status` layout-polish | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` layout-polish | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche TASK-051 non staged; no commit, no push, no stage. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` temporary-manager-PIN red | `FAIL_EXPECTED` | Test TDD scritto prima: falliva su copy `Temporary PIN`, helper `temporary-manager-pin.ts` e docs/evidence mancanti. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` temporary-manager-PIN | `PASS` | 5 test, 5 pass. Copre helper `generateTemporaryManagerPin`, `crypto.randomInt(10000, 100000)`, no long prefixed manager credential, UI `Temporary PIN`, no PIN raw in audit metadata e recovery sempre staff code `1001`. |
| `node --test tests/foundation/task-049-master-console-admins-ui-polish.test.mjs` temporary-manager-PIN | `PASS` | 5 test, 5 pass. Guardrail vicino aggiornato a `Temporary PIN`. |
| `node --test tests/foundation/task-044-platform-provisioning-ux-runtime.test.mjs` temporary-manager-PIN | `PASS` | 5 test, 5 pass. |
| `node --test tests/foundation/task-038-pos-manager-web-login.test.mjs` temporary-manager-PIN | `PASS` | 6 test, 6 pass. |
| `npm run security:scan` temporary-manager-PIN | `PASS` | `Security scan passed.` Guardrail E2E aggiornati a copy `Temporary PIN` e pattern PIN numerico. |
| `npm run test:foundation` temporary-manager-PIN | `PASS` | 217 test, 217 pass. |
| `npm run typecheck` temporary-manager-PIN | `PASS` | `next typegen` e `tsc --noEmit` passati. |
| `npm run lint` temporary-manager-PIN | `PASS` | `eslint` passato senza errori. |
| `npm run build` temporary-manager-PIN | `PASS_WITH_WARNINGS` | Build passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` temporary-manager-PIN | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` temporary-manager-PIN | `PASS_WITH_WARNINGS` | 43 test Playwright, 43 pass; include `/platform/provisioning` protetto. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `git diff --check` temporary-manager-PIN | `PASS` | Nessun output. |
| `git diff --cached --name-status` temporary-manager-PIN | `PASS` | Nessun output; nulla staged. |
| `git status --short --branch --untracked-files=all` temporary-manager-PIN | `PASS_WITH_NOTES` | Worktree su `main...origin/main` con modifiche TASK-051 non staged; no commit, no push, no stage. |
| `node scripts/platform/task-051-runtime-parity-check.mjs --shop-code=123456789 --staff-code=1001` manual-runtime parity review-fix | `PASS_WITH_NOTES` | Read-only; target redatto `cloud:jpgo...kyvm`; env browser/admin presenti, ma `shop_code_present=false`, `staff_1001_present=false`, `full_access_permission_present=false`. Conferma mismatch tra manual browser runtime `.env.local` e harness locale/process-only. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs` manual-runtime parity review-fix | `PASS` | 6 test, 6 pass. Copre nuovi codici redatti `server_admin_not_configured`, `shop_lookup_database_error`, `staff_lookup_database_error`, `credential_update_database_error`, `audit_database_error`, diagnostica `shopIdPresent/shopCodePresent/selectedShopCodePreview` e harness parity TASK-051. |
| `node --test tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs tests/foundation/task-054-shop-code-recovery-diagnostics.test.mjs` manual-runtime parity review-fix | `PASS` | 11 test, 11 pass. Conferma che il fix TASK-051 resta compatibile con diagnostica TASK-054 e non espone service-role, hash, token o PIN raw. |
| `npm run typecheck` manual-runtime parity review-fix | `PASS` | `next typegen` e `tsc --noEmit` passati dopo i nuovi codici e diagnostica tipizzata. |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3054 PLAYWRIGHT_WEB_SERVER_COMMAND='npm run build && npm run start -- --hostname 127.0.0.1 --port 3054' node scripts/testing/run-playwright-target.mjs local tests/e2e/task-054-shop-code-recovery-runtime.spec.ts --project=chromium-desktop` manual-runtime parity review-fix | `PASS_WITH_WARNINGS` | 1 test Playwright, 1 pass su Supabase locale/process-only. Verifica login Admin Console shop-code: PIN errato diagnosticato, Shop/Staff code preservati, PIN temporaneo a 5 cifre accettato, nessun PIN nel body. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205]`, `NO_COLOR` ignorato per `FORCE_COLOR`. |
| Master Console UI create shop + Admin Console login + reset manager 1001 local attempt | `BLOCKED_HARNESS_NOT_COMMITTED` | Tentato con Playwright su `next start` locale e Supabase locale/process-only. La GET `/platform/provisioning` risultava autorizzata, ma il POST server action da cookie SSR seminati nel test tornava `You are not authorized to perform this operation.` Il test sperimentale non e stato lasciato nel repo per evitare un rosso non affidabile. Nessuna scrittura cloud; dati locali sintetici ripuliti dal finally/cleanup del test. |
| `npm run build` final manual-runtime parity review-fix | `PASS_WITH_WARNINGS` | Build standalone passato. Warning non bloccanti: convenzione `middleware` deprecata, `[DEP0205] module.register()`. |
| `npm run verify` final manual-runtime parity review-fix | `PASS_WITH_WARNINGS` | `lint`, `typecheck`, `security:scan`, `build` passati. Stessi warning non bloccanti del build. |
| `npm run test:ui-smoke:ci` final manual-runtime parity review-fix | `PASS_WITH_WARNINGS` | 47 test Playwright, 47 pass; include root entrypoint Admin Console, direct bookmark Master Console su `/auth/login?next=/platform`, Admin Console su `/auth/login?next=/shop` e fallback `/auth/login`. Warning non bloccanti: `[DEP0205]` e `NO_COLOR` ignorato per `FORCE_COLOR`. |
| `npm run lint` final evidence pass | `PASS` | `eslint` passato senza errori dopo aggiornamento evidence. |
| `npm run typecheck` final evidence pass | `PASS` | `next typegen` e `tsc --noEmit` passati dopo aggiornamento evidence. |
| `npm run test:foundation` final evidence pass | `PASS` | 228 test, 228 pass dopo aggiornamento evidence. |
| `npm run security:scan` final evidence pass | `PASS` | `Security scan passed.` dopo aggiornamento evidence. |
| `git diff --check` final evidence pass | `PASS` | Nessun output. |

## Rischi residui

- Migration preparata source-controlled e applicata al DB locale; applicazione
  dev/staging/production resta separata e richiede approvazione esplicita.
- Runtime create shop richiede che le nuove RPC siano applicate al target usato
  dall'app.
- `Record pending owner email` conserva l'RPC pending setup esistente: registra
  owner setup pending e fiscal identity, ma non inventa un Temporary PIN se il
  backend non lo restituisce. Il result banner mostra il valore raw solo quando
  viene generato e restituito dal server.
- Recovery manager su Master Console resetta/genera un nuovo Temporary PIN per
  lo staff code selezionato; non recupera ne mostra il precedente.
- `.env.local` corrente punta a `supabase_cloud`; evitare di trattarlo come
  runtime locale sicuro senza override/cleanup env. La verifica parity read-only
  ha mostrato che lo shop manuale `123456789` e manager `1001` non esistono su
  quel target redatto.
- La prova Playwright completa con create/reset via Master Console UI richiede
  una sessione SSR reale o un harness login locale dedicato; il tentativo con
  cookie seminati dal test non e affidabile per i POST server action.
- Catalog import preview resta separato per evitare leak/duplicazioni cross-shop.
