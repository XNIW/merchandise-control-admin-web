# NEXT CODEX ASUS — WIN7POS PRODUCT IMAGE PHASE B

Questo è un prompt operativo completo, destinato al prossimo Codex sull'host
Asus. Eseguirlo dall'inizio alla fine. Non richiede all'utente di ricostruire
scope, contratto, test o cleanup.

## 0. Obiettivo e autorizzazione

Portare Win7POS dalla foundation immagini offline Phase A alla piena Phase B
online contro lo staging Admin già validato:

1. verificare l'handoff Admin `pos-product-image-v1`;
2. riconciliare, revisionare e unire normalmente la draft PR Win7POS `#72`;
3. creare una branch Phase B separata dalla `main` che include Phase A;
4. implementare catalogo, lettura, upload, finalize, replacement e remove
   online senza indebolire il trusted POS boundary;
5. introdurre prima di qualsiasi mutazione staging un boundary Admin
   provisioning/receipt/cleanup server-side, esatto e allowlistato per la
   Phase B Asus;
6. eseguire test locali, staging e, se disponibile, Windows 7 fisico;
7. correggere automaticamente difetti client, harness o Admin emersi durante
   l'esecuzione;
8. ottenere review indipendente, CI verde, PR non-draft e merge normali;
9. lasciare zero residui sintetici e consegnare evidence verificabili.

L'autorizzazione comprende modifiche Win7POS necessarie alla Phase B, una
eventuale modifica Admin strettamente necessaria al provisioning exact-template,
manifest, capability, terminal receipt e cleanup QA allowlistato, PR, CI,
merge normali, migration/deploy esclusivamente staging e fixture sintetiche
exact-ID. Non comprende production.

Le modifiche Admin autorizzate sono limitate a:

- boundary/provisioning fixture/manifest/capability/cleanup QA Phase B;
- correzioni di regressioni che riportano l'implementazione al contratto Admin
  pin esatto di questo prompt.

Qualsiasi cambiamento semantico a schema `pos-product-image-v1`, auth,
idempotenza, CAS, limiti, catalogo, Storage/RLS, receipt o comportamento del
server richiede una nuova autorizzazione esplicita. Non reinterpretare un
difetto semantico come remediation del cleanup.

Non fermarti a piano, implementazione locale, PR pronta, CI pendente, merge
pendente, test staging pendente o cleanup pendente. Fermati solo per un blocker
esterno reale dopo avere eseguito il cleanup possibile e sicuro. Sono blocker
esterni: assenza del target Windows 7 fisico, impossibilità di usare il profilo
DPAPI sotto l'utente Windows che lo ha creato, budget/quota esauriti, outage
staging/provider, permessi insufficienti, dipendenza necessaria non
disponibile/approvata, oppure necessità di cambiare la semantica del contratto
pin.

## 1. Divieti non negoziabili

- Nessun deploy o migration production.
- Nessun service-role key, database password o Supabase browser access token
  sull'host Asus, nel client Win7POS, negli script client o nelle evidence.
- Nessun accesso Supabase diretto dal POS.
- Nessuna credenziale, PIN, password, token device/session, materiale DPAPI,
  signed URL, Storage path, body sensibile, nome/barcode reale, raw run ID o
  array UUID privato in Git, log, console, screenshot, prompt, PR o evidence.
- Non esportare né copiare il profilo DPAPI `asus-staging`. È
  `CurrentUser`/machine-bound: usarlo soltanto tramite l'API trusted store già
  esistente, sotto il corretto utente Windows.
- Riutilizzare l'implementazione e le policy DPAPI esistenti, ma conservare le
  credenziali/sessioni dell'actor isolato in un contenitore CurrentUser QA
  separato e run-scoped. Il nome è
  `asus-staging-image-phase-b-` più i primi 24 hex lowercase del run HMAC,
  provisionato dal trusted login e mai copiato dal profilo shared. Se il
  trusted store non supporta multi-profile isolato, implementarlo e testarlo
  nella Phase B oppure fermarsi `BLOCKED_EXTERNAL` prima di mutare.
- Non stampare, decifrare a scopo diagnostico o trasferire il contenuto del
  profilo DPAPI. Caricare i token just-in-time in memoria e azzerare/rilasciare
  i riferimenti appena terminata la request.
- Non persistire signed upload/read URL. Non usarle come cache key,
  idempotency identity, receipt, outbox payload o telemetry.
- Non accettare path Storage forniti dal client e non cancellare oggetti da
  path derivati localmente. I path autorevoli sono sempre server/database
  derived.
- Non usare prodotti, immagini o attori reali. Non modificare immagini
  preesistenti.
- Non riusare
  `public.task_149_pos_product_image_fixture_cleanup_v1`: è confinata alla
  namespace fixture `TASK149_*` e non è un cleanup generico per Asus Phase B.
- Non usare reset, force-push, rebase distruttivo, squash merge, bypass CI,
  auto-merge non verificato o riscrittura della storia pubblicata.
- Non cancellare o alterare il profilo condiviso `asus-staging` durante il
  cleanup della fixture immagine.
- Non ampliare la Phase B a gallery, multiple immagini, HEIC Win7, WebP/AVIF,
  schema business nuovo o refactor non necessario.

## 2. Pin autorevoli TASK-149

Questi pin provengono dal closeout verificato TASK-149 e sono congelati per il
preflight Asus:

| Pin | Valore |
| --- | --- |
| Admin runtime/tooling ancestor | `d3c674ada8aa7abf0179355c09238472b9ff3023` |
| Docs closeout | `origin/main` corrente contenente questo prompt e l'handoff |
| SHA-256 handoff Admin | `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87` |
| Worker source | `1de2912419f6770ff1ef7c6819754f4439ab849f` |
| staging deployment/version evidence | `PASS; deployment sha256:abdb4d35a8e0013eb4a431d2eb265472ea24412f33eb0a72bf2e8aa3998c6f51; version sha256:39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817; active 100%; unchanged gate/recheck` |
| resource gate finale | `PASS task149-pos-product-image-resource-gate-v2; run sha256:e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c; tail sha256:1cc5c22235d39be88c8bf1c2362a0de6b73b5beb0216df05d59e440774820590; Tail/GraphQL 34/34; CASE46/48 2/2` |
| recheck cleanup/residui | `PASS; run sha256:e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c; residuals 0; active actors/Auth 0; audit 11; forbidden 0` |

Il preflight deve verificare tutti i valori esatti. Il checkout docs deve
essere l'`origin/main` corrente che contiene questo prompt e l'handoff con lo
SHA-256 indicato sopra, e deve discendere dall'ancestor runtime/tooling
`d3c674ad`. Lo SHA del commit che contiene il documento non è auto-pinnato nel
documento stesso. Qualunque mismatch blocca autenticazione e mutazioni.

## 3. Baseline note e fonti da leggere integralmente

### Admin

Repository:

`XNIW/merchandise-control-admin-web`

Leggere dall'`origin/main` corrente che contiene questo prompt e l'handoff,
dopo aver verificato ancestor runtime/tooling e SHA-256 dell'handoff:

- `docs/HANDOFFS/WIN7POS_POS_PRODUCT_IMAGE_V1_READY.md`;
- `docs/contracts/POS_PRODUCT_IMAGE_V1_SERVER_DELTA.md`;
- `contracts/product-image-v1.json`;
- `contracts/pos-product-image-v1/schema.json`;
- tutte le fixture in `contracts/pos-product-image-v1/`;
- `docs/TASKS/TASK-149-admin-trusted-pos-product-image-v1.md`;
- `docs/TASKS/EVIDENCE/TASK-149/README.md`;
- migration
  `supabase/migrations/20260730165557_task_149_trusted_pos_product_image_v1.sql`.

Pin stabili già verificati:

- contratto portabile:
  `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`;
- schema POS:
  `74bd4b7f86a05b6180c133c86a47ae70be99a6f8012c8bfb747d7b18c714ceb0`;
- migration TASK-149:
  `b4eb344f4bb73ae8cfbcb5ef10ed53f2959694caf814c53c78978d7c450d6511`;
- manifest fixture:
  `ebb67b47d1460fa6361aa0d06e490f39e3b4a74afcd0cafc9fa9decc19e1df05`.

SHA-256 fixture:

| File | SHA-256 |
| --- | --- |
| `intent.request.valid.json` | `80a137a02db03b9ffa72189189b80f6e0a819f6d0db226fec1c5efd14123989e` |
| `intent.response.valid.json` | `e10f767f82d15041c2dc42753acb335b837c0e36085dee309a5d802990a19779` |
| `intent.request.invalid-hash.json` | `08cf50062fb2343122e3406aba7d29bbf8cf849edfcd07dca8c70a8b1480f31e` |
| `finalize.request.valid.json` | `e5547e742969a7e2662fe44d111c4e3a3578a609cbfa5ab2c957f12ac8d2ab5d` |
| `finalize.response.valid.json` | `cd70ff1f6a83d223973af74366cd3faf23f3657c908439ba71a7b348363c51e1` |
| `read-urls.request.valid.json` | `a60b41dffb287f8cbeab7517ceb372c1591b41c3169079c28694e2580d22694a` |
| `read-urls.response.valid.json` | `88c725d9a200b61b9414b8da0526f3655f6cbe4fd4f6941d078a91ccfc5774c9` |
| `remove.request.valid.json` | `d5f2930c223b08f431a8fd82717e257287e913b081613b85b49618b05d566d1b` |
| `remove.response.valid.json` | `fc1d0455aca6eaeae185cd1a322e30ca725b11ac8b7b93436ee7cf9d973b650f` |
| `error.response.valid.json` | `8a4cc7627173133dc7c9171ea548b8c482768f4c96c0c02fc60781db47d00d3d` |

Ricalcolare tutti gli hash dai file della revisione pin. Un mismatch è
fail-closed: non adattare il client a un contratto non identificato.

### Win7POS

Repository:

`XNIW/Win7POS`

Baseline Phase A:

- `main` originaria della PR:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`;
- draft PR: `#72`, `feat: prepare Win7-safe product image foundation`;
- branch:
  `codex/asus-product-image-foundation-offline-20260730`;
- head Phase A atteso:
  `b43473f9c959a86403fa0f0a012f798d15af553e`;
- implementation commit:
  `b03d8aaa860cce9ddfc5b38431b5059a90cab35a`.

Leggere dalla head effettiva della PR `#72`:

- `docs/plans/WIN7POS_PRODUCT_IMAGE_CROSS_PLATFORM_AUDIT.md`;
- `docs/HANDOFFS/WIN7POS_PRODUCT_IMAGE_PHASE_A_READY.md`;
- `docs/HANDOFFS/WIN7POS_PRODUCT_IMAGE_PHASE_B_PROMPT.md`;
- `docs/DIALOG_STANDARD.md` prima di cambiare dialog;
- `AGENTS.md`;
- implementazione e test Phase A elencati nella PR.

La PR `#72` era deliberatamente draft e intatta durante TASK-149. Il prossimo
Codex Asus è autorizzato a riconciliarla e unirla, ma soltanto dopo aver
verificato l'handoff Admin finale e aver rieseguito i gate Phase A.

### Android e iOS

Rileggere, senza modificare:

- `XNIW/MerchandiseControlSplitView`;
- `XNIW/iOSMerchandiseControl`;
- rispettivi `contracts/product-image-v1.json`;
- ultime implementazioni product-image e relative fixture.

Il contratto portabile deve restare byte-identico. Registrare revisioni e
digest correnti; non fidarsi soltanto delle revisioni congelate nel vecchio
audit Phase A.

## 4. Preflight repository e ambiente

Prima di editare:

1. controllare lo stato Git delle repo Admin e Win7POS;
2. preservare qualsiasi lavoro utente non correlato con patch e bundle
   verificati, senza stash automatico, reset o clean;
3. fare fetch/prune;
4. leggere gli ultimi 15 commit di entrambe le `main`;
5. verificare stato, head, base, draft/mergeability e checks della PR `#72`;
6. verificare che il pin Admin finale sia antenato di `origin/main`;
7. verificare che handoff, Worker source, deployment/version e migration
   staging coincidano con i pin;
8. verificare read-only che production non sia stata toccata;
9. verificare che non esista un cleanup/destructive worker attivo;
10. verificare che il target configurato dal profilo sia staging, senza
    stampare URL, account o token.

Il preflight può leggere GitHub, file pubblici e metadata redatti. Prima che
esista il nuovo boundary provisioning/receipt/cleanup Phase B non deve
eseguire first-login, registrazione device, creazione prodotto, intent,
upload, finalize, remove o qualunque altra mutazione staging.

Usare worktree isolati. Non lavorare nella directory sporca dell'utente.

## 5. Riconciliare e unire la PR Phase A `#72`

Non copiare i file Phase A manualmente su una nuova branch.

1. Confrontare la head effettiva di `#72` con
   `b43473f9c959a86403fa0f0a012f798d15af553e`.
2. Se la head è diversa, ispezionare ogni commit aggiuntivo e documentarne
   provenienza e intento prima di procedere.
3. Confrontare la branch con la `main` Win7POS corrente.
4. Se la `main` è avanzata, integrare la `main` nella branch Phase A con un
   merge normale, senza rebase/force-push. Risolvere solo conflitti reali,
   preservando sia i fix `main` sia gli invarianti Phase A.
5. Aggiornare l'audit Phase A soltanto per revisioni o fatti realmente
   cambiati. Non trasformare test Mac/sintetici in evidence Windows 7.
6. Ricalcolare i gate:
   - Core/Data image tests;
   - WPF imaging tests Release/x86/net48;
   - intero `Win7POS.Core.Tests`;
   - build WPF Release/x86/net48;
   - build solution Release;
   - `scripts/check-product-image-phase-a.ps1`;
   - `scripts/check-architecture-boundaries.ps1`;
   - `scripts/check-dialog-standards.ps1`;
   - tutti i checker richiesti dalla repo;
   - `git diff --check`;
   - secret/Gitleaks scan.
7. Eseguire review indipendente su cache, path hardening, WIC/x86,
   concorrenza, dialog e regressioni catalogo. Correggere tutti i P0/P1/P2 e
   rieseguire i gate.
8. Togliere il draft soltanto quando checks e review sono verdi.
9. Unire la PR `#72` normalmente. Nessun squash, rebase merge, bypass o
   auto-merge non sorvegliato.
10. Fast-forward della `main` locale e verifica working tree pulito.

La Phase A va registrata come chiusa soltanto dopo il merge reale. Non
aggiungere la Phase B alla PR `#72`.

## 6. Branch Phase B separata

Dalla `origin/main` Win7POS che contiene il merge Phase A creare:

`codex/asus-product-image-phase-b-20260730`

Titolo PR finale:

`feat: add Win7POS online product image Phase B`

Prima del codice, creare o aggiornare il task Win7POS secondo la governance
della repo. Scope rigoroso:

- trusted POS product image v1;
- catalog image fields/tombstone;
- cache/UI Phase A abilitate in modo sicuro;
- retry/offline/conflict;
- test, staging, cleanup ed evidence.

Non includere refactor generici, article-sync non correlato, sales, schema
SQLite estraneo o nuove dipendenze senza necessità dimostrata.

## 7. Contratto online da implementare

Schema:

`pos-product-image-v1`

Endpoint, tutti `POST`, JSON bounded e `Cache-Control: no-store`:

| Operazione | Path | Permesso |
| --- | --- | --- |
| intent | `/api/pos/catalog/product-images/intent` | `products.write` |
| finalize | `/api/pos/catalog/product-images/finalize` | `products.write` |
| read | `/api/pos/catalog/product-images/read-urls` | `products.read` |
| remove | `/api/pos/catalog/product-images/remove` | `products.write` |

Envelope trusted:

- `schemaVersion`;
- `appVersion`;
- `shopId`;
- `shopDeviceId`;
- `staffId`;
- `staffCredentialVersion`;
- `posSessionId`;
- `deviceToken`;
- `sessionToken`.

Mutazioni:

- `operation`;
- `operationId`;
- `idempotencyKey`;
- `payloadHash`;
- `productId`;
- `expectedCurrentVersionId`;
- metadata operazione-specifici.

`read-urls` usa `refs` e non crea receipt durevole.

Il client deve usare il trusted store DPAPI esistente con il contenitore QA
run-scoped definito sopra. Non deve simulare un profilo web, usare bearer
Supabase o creare una seconda implementazione/store credenziali.

### Payload hash

Implementare la serializzazione canonica definita dallo schema Admin:

- UTF-8;
- JSON compatto;
- ordine chiavi fisso;
- UUID lowercase;
- numeri interi invariant-culture;
- formato digest `sha256:` più 64 hex lowercase;
- esclusione tassativa di operation/idempotency identity, app/device/staff/
  session identity, token, URL e path secondo lo schema.

Usare le fixture Admin come golden vectors. Non calcolare il digest
serializzando l'intera request in ordine accidentale.

### Idempotenza

- Dopo un errore di trasporto ambiguo, ripetere la stessa operazione con gli
  stessi `operationId`, `idempotencyKey` e `payloadHash`.
- Same operation/same hash deve riprodurre l'outcome originario.
- Same operation/different hash e riuso incompatibile di idempotency key sono
  terminali; non generare automaticamente un nuovo ID per nascondere il
  conflitto.
- Un replay finalize non deve promuovere due volte.
- Un replay remove non deve cancellare una replacement più nuova.
- Le URL non sono identità idempotenti.

Gli UUID/idempotency key devono essere generati con CSPRNG/UUID sicuri, mai
derivati da nomi prodotto, barcode, timestamp solo o token.

### Limiti wire e immagini

- body JSON massimo: 16 KiB;
- read batch: 1–16 refs;
- response read massima: 64 KiB;
- signed read URL: 300 secondi, con safety window client di 30 secondi;
- capability upload provider: massimo 7200 secondi;
- main: JPEG, lato massimo 1600 px, massimo 1 MiB;
- thumb: JPEG, lato massimo 384 px, massimo 90 KiB;
- read-request concurrency portabile: 2;
- download concurrency portabile: 4.

I guardrail server correnti sono 300 mutazioni per shop/ora e 60 per
staff/15 minuti. Sono limiti di protezione server, non un rate garantito, una
quota da consumare o una policy di scheduling client. Il client deve restare
ben al di sotto, serializzare le mutazioni per prodotto e usare backoff
bounded con jitter.

### Distinzione 16 MP / 64 MP

Il contratto portabile accetta sorgenti fino a 64.000.000 pixel. Win7POS
Release/x86 deve conservare il default locale più prudente di 16.000.000 pixel
già introdotto in Phase A, perché WIC legacy/x86 può allocare l'intera
sorgente. Non alzare il default Win7POS a 64 MP.

Il ceiling 64 MP resta una proprietà del contratto portabile e delle altre
piattaforme, non un requisito di accettazione locale Win7. Un futuro aumento
Win7 richiede task separato, profiling memoria x86 e evidence fisica. La UI
Phase B deve spiegare in modo sicuro il rifiuto locale >16 MP senza mostrare
path completi.

## 8. Architettura client Phase B

### Trasporto

- Riutilizzare il client HTTPS trusted POS, TLS 1.2 e le guard base-URL
  esistenti.
- Vietare downgrade HTTP, host non allowlistato, userinfo, query/path base
  inattesi e redirect verso origin diversa.
- Non seguire redirect delle signed URL verso scheme/origin non consentiti.
- Applicare timeout bounded e cancellation.
- Redigere header/body/error prima di log o telemetry.
- Non leggere l'intero payload non bounded in memoria senza i limiti del
  contratto.

### Lettura e cache

- Il catalogo full e delta deve acquisire
  `primaryImageVersionId` e `primaryImageUpdatedAt`.
- Stati:
  - mai avuta immagine: entrambi null;
  - immagine corrente: version UUID + timestamp;
  - rimossa: version null + timestamp nuovo;
  - UUID con timestamp null: invalid/fail-closed.
- Nessuna URL, path, hash o metadata binaria entra nel catalogo o SQLite
  prodotto.
- La cache identity resta account/shop/product/version/variant.
- Preservare il fallback precedente finché la nuova variante non è scaricata,
  validata e decodificata.
- Main e thumb si promuovono indipendentemente come in Phase A.
- Non ordinare versioni tramite UUID o timestamp locale; usare catalog
  revision e stage sequence.
- Replacement/remove devono invalidare solo scope e versioni corretti.
- Read batch massimo 16, coalescing same-key, cancellation per consumer,
  concorrenza bounded e nessuna decode full-resolution nella lista.
- Le signed URL vivono soltanto nella singola lease in memoria. Alla scadenza
  o entro la safety window richiedere una nuova `read-urls`.

### Choose, preprocess, upload e finalize

- Accettare localmente JPEG/PNG rilevati dai byte, non dall'estensione.
- Non aggiungere HEIC su Windows 7.
- Normalizzare orientamento affidabile, alpha su bianco, sRGB, metadata
  rimossi e output JPEG strict main/thumb.
- Non sovrascrivere la sorgente scelta.
- Calcolare byte, dimensioni e SHA-256 sui file esatti che saranno caricati.
- Chiedere intent solo quando online e quando il CAS locale è ancora
  compatibile con l'ultimo catalogo autorevole.
- Caricare main/thumb con `Content-Type: image/jpeg` sulle due capability
  restituite, senza persisterle.
- Conservare localmente i candidati bounded finché finalize ha outcome
  autorevole.
- Finalize soltanto dopo il successo di entrambi gli upload.
- In caso di risposta finalize persa, replay con la stessa identity; non
  emettere una seconda replacement.
- Un finalize fallito non deve rimuovere l'immagine precedente né promuovere
  localmente la candidata.

### Remove

- Richiedere conferma UI conforme a `docs/DIALOG_STANDARD.md`.
- Usare la versione corrente esatta come `expectedCurrentVersionId`.
- Su response persa, replay della stessa operation.
- Purge locale soltanto dopo outcome autorevole/catalog delta coerente.
- Un conflitto CAS deve preservare la versione nuova e forzare refresh, mai
  ripetere con expected version aggiornata senza nuova decisione utente.

### Offline e retry

Separare l'intento utente dalla capability online:

- offline può preparare e conservare in cache bounded una candidata locale;
- l'outbox può conservare solo operation identity, payload hash/proiezione
  safe, expected version e riferimenti locali scope-safe;
- l'outbox non conserva token, signed URL, Storage path o body raw;
- al reconnect rifare trust/lease e catalog refresh prima di intent;
- se expected version è invariata, proseguire una volta;
- se è cambiata, passare a stato conflict/blocked con scelta esplicita;
- `intent_expired`: nuovo intent con nuova operation/idempotency identity;
- signed read URL scaduta: nuova `read-urls`;
- `rate_limited`, `storage_unavailable`, `backend_unavailable` e 5xx
  transitori: retry bounded con exponential backoff, jitter e limite tentativi;
- `auth_denied`/lease scaduta: una sola remediation tramite il trusted login/
  heartbeat esistente, poi blocco sicuro;
- `permission_denied`, malformed, JPEG/metadata validation e idempotency
  conflict: terminali finché operatore o input non cambia;
- `expected_version_conflict`: catalog refresh e conflitto visibile;
- nessun loop infinito o retry storm.

### UI

- Abilitare la feature flag Phase A soltanto quando la pipeline online e i
  fallback sono completi.
- Lista: thumb progressiva, placeholder no-image/loading/offline/invalid/error,
  retry accessibile, nessun focus sull'immagine decorativa.
- Editor: preview locale, choose/replace/remove, stato upload/finalize,
  cancellazione sicura e precedente immagine preservata.
- Usare le risorse condivise dialog e le traduzioni English/Spanish/Italian/
  Simplified Chinese già predisposte; aggiungere solo copy realmente usata.
- Non bloccare il thread UI con decode, hash, upload o download.
- Non cambiare semantica product save/article-sync se non per il binding
  immagine esplicitamente richiesto.

## 9. Cleanup Admin obbligatorio prima dello staging

### Perché serve

La RPC TASK-149 è deliberatamente vincolata a `TASK149_*`; usarla per Asus
Phase B deve fallire. Il client Asus non può e non deve ricevere il service
role. Prima della prima mutazione staging, creare un nuovo boundary Admin
staging-only dedicato a questa acceptance.

Branch Admin:

`codex/admin-asus-product-image-phase-b-cleanup-20260730`

Titolo PR Admin:

`test: add allowlisted Asus image Phase B cleanup`

### Proprietà minime del nuovo meccanismo

- Server-side; il service role, se necessario, resta soltanto nel Worker/
  boundary Admin.
- Staging-only e fail-closed in production.
- Namespace distinta e bounded:
  `ASUSPIB_` più 32 caratteri esadecimali uppercase generati da 128 bit
  CSPRNG.
- Il marker identifica il run ma non autorizza azioni distruttive. Input
  pubblico minimo: marker/digest di correlazione e capability QA indipendente;
  nessun array di UUID o path arbitrario.
- Manifest autorevole creato server-side prima delle mutazioni, con run,
  contesto QA isolato validato ed exact IDs delle risorse run-owned già
  preallocate; nessuna scansione broad per prefisso come unica prova.
- La mutating acceptance deve usare shop e staff QA totalmente isolati da
  operatori, test o processi concorrenti. Anche device e data directory
  devono essere dedicati al run. Riutilizzare il trusted-store DPAPI esistente
  tramite il contenitore QA run-scoped derivato dal run HMAC; il profilo
  shared `asus-staging` resta byte/semanticamente intatto. Se non è possibile
  provisionare identity isolate nel contenitore QA attraverso un flusso
  trusted, il run è `BLOCKED_EXTERNAL` prima della prima mutazione.
- Shop, device e staff QA sono identity anchor stabili del manifest. La
  credential version deve essere quella trusted corrente a ogni request.
- La sessione è rotabile: first-login, heartbeat o reauth possono
  creare un nuovo `posSessionId`. Ogni transizione deve essere validata dal
  trusted boundary e iscritta atomicamente nel manifest/audit come sessione
  osservata. Una rotazione che cambia
  shop/device/staff scope fallisce prima della mutazione.
- Lo snapshot pre-run registra le sessioni preesistenti dell'actor isolato,
  che devono essere assenti o revocate e non diventano run-owned. Ogni
  sessione creata/ruotata durante il run è enrolled exact-ID come run-owned;
  dopo aver fermato heartbeat/reauth il cleanup deve revocarla/eliminarla
  fail-closed e verificare `active run-owned sessions = 0`. Una cascade è
  ammessa solo con prova FK exact-ID e count post-cleanup equivalente.
- Collision-reject su tutte e sole le risorse run-owned: product ID,
  name/barcode sintetici e ogni artefatto preallocato non devono esistere né
  appartenere a un altro run.
- Ogni image version, canonical object, receipt, sync event e budget row
  creato durante intent/finalize/remove deve essere iscritto atomicamente nel
  manifest nello stesso commit server-side, oppure derivato tramite una
  closure di foreign key esatte e integrity-checked dal product/run ID. Prima
  del cleanup, una reconciliation DB/Storage fail-closed deve dimostrare che
  non esistono artefatti owned fuori manifest/closure né artefatti non-owned
  dentro il target.
- Prima del run acquisire uno snapshot server-side count-only/HMAC delle righe
  `pos_product_image_mutation_budgets` per tutte le chiavi shop/staff/
  node-audit coinvolte. Per il nuovo actor isolato le righe devono essere
  assenti; se esistono, provisionare un nuovo actor invece di cancellarle o
  riusarle.
- Ogni budget row creata dal run deve essere enrolled atomicamente nel
  manifest con identity, finestra, count e versione/CAS attesi. Nessun altro
  traffico può aggiornare quelle chiavi. Cleanup e verifica richiedono CAS
  esatto, assenza di drift concorrente e scadenza delle finestre server
  (shop/node-audit 1 ora, staff 15 minuti).
- Non cancellare, ripristinare o conteggiare come residuo una budget row
  shared o preesistente. Una row si può eliminare soltanto se lo snapshot ne
  provava l'assenza, il run l'ha creata/enrolled, la finestra è scaduta e il
  CAS coincide. Drift o concorrenza fanno fallire closed il cleanup.
- Allowlist strutturale su nomi sintetici, environment, actor e run; nessun
  target reale può soddisfarla accidentalmente.
- Canonical Storage paths sempre letti dal database.
- Operazione idempotente e auditata con run HMAC, counts e safe codes.
- Risposta count-only/redatta. Nessuna URL, path, token, UUID raw, nome o
  barcode.
- Cleanup di soli dati sintetici owned:
  product, image versions, canonical objects, image receipts, disposable sync
  events e budget rows creati dal run. Non cancellare audit immutabile.
- Non cancellare profilo DPAPI o qualsiasi attore/row staging shared o
  preesistente. Gli attori QA dedicati creati dal meccanismo sono run-owned:
  registrarli nel manifest e disabilitarli/eliminarli exact-ID al termine.
- Verifica indipendente count-only a residuo zero per il delta run-scoped e
  confronto post-run byte/count-equivalente con lo snapshot pre-run. Non
  dichiarare che l'intero staging globale è vuoto.
- Rifiuto del cleanup finché esiste una upload capability/fence attiva.

### Provisioning Admin-controlled

Il server Admin crea le identity QA isolate. Asus non riceve service role e
non invia INSERT/RPC amministrative dirette. Usare una capability separata
`provision`, distinta da marker e capability `cleanup`:

- prima di invocare `provision`, un bootstrap actor Admin-controlled crea il
  manifest e ottiene una cleanup capability già bound a
  staging/run/manifest/bootstrap actor; così anche una response provisioning
  persa resta exact-cleanable;
- almeno 128 bit CSPRNG, preferibilmente 256 bit;
- raw restituito una sola volta via HTTPS/no-store; server conserva soltanto
  HMAC-SHA-256/digest;
- binding immutabile a `staging`, run HMAC, manifest ID, bootstrap actor
  autenticato, action `provision` e exact template
  `asus-product-image-phase-b-fixture-v1`;
- TTL massimo 10 minuti, one-shot, consumo atomico nella stessa transazione
  del provisioning;
- massimo 3 tentativi provision per bootstrap actor/run in 15 minuti, con una
  sola DML terminale consentita;
- request exact-shape senza ruoli, permission list, shop/staff/device IDs,
  nomi, codici, password, path o campi arbitrari;
- template server-side deriva exact shop/staff/device QA, namespace, expiry e
  permission bundle minimo necessario a `products.read`/`products.write`;
- risposta può consegnare una sola bootstrap envelope trusted/no-store,
  trasferita direttamente al contenitore DPAPI QA senza log, clipboard,
  console, file temporanei o evidence;
- capability `cleanup` non autorizza provisioning; capability `provision` non
  autorizza cleanup, status broad, altro template/run/actor/environment o una
  seconda fixture;
- un replay exact dello stesso request fingerprint e degli stessi binding,
  causato da response persa dopo il commit, non crea nuovi actor e restituisce
  la stessa receipt safe/durevole con zero DML; non riemette credential
  material;
- replay con request fingerprint o binding diverso, stale replay e secondo
  provisioning sono negati con zero DML.

Test negativi obbligatori: production, guessed/stale/expired, replay con
request o binding diverso, cross-run, cross-manifest, cross-actor, action
swap, template diverso, unknown/additional field, ruolo/permission arbitrari,
ID/nome/codice fornito dal client, cleanup capability usata per provision e
provision capability usata per cleanup. Ogni caso fallisce senza DML. Il
replay exact same-request/same-binding è invece il solo caso idempotente
receipt-only descritto sopra.

Il service role resta esclusivamente nel boundary server Admin. Nessun valore
service-role, database password o Supabase token arriva all'host Asus.

### Capability QA distruttiva

Il marker, il suo digest e l'accesso al profilo POS non sono una capability di
cleanup. Il boundary Admin deve emettere una capability distruttiva separata
con queste proprietà:

- almeno 128 bit CSPRNG indipendenti dal marker; usare 256 bit quando
  disponibile;
- raw capability restituita una sola volta su HTTPS/no-store e conservata
  soltanto in memoria o, per recovery, DPAPI CurrentUser fuori repo/evidence;
- server conserva soltanto HMAC-SHA-256/digest della capability, mai il raw;
- binding immutabile a environment `staging`, run HMAC, manifest ID,
  bootstrap actor Admin-controlled, exact fixture template e singola action
  allowlistata; i target distruttivi sono esclusivamente la closure exact-ID
  enrolled atomicamente sotto quel manifest, anche se il provisioning commit
  avviene dopo l'issue della capability;
- una capability `cleanup` non autorizza manifest creation, provisioning,
  fixture mutation, status broad, altro run o altra action;
- prima di consentire un intent, capability pre-armed server-side con expiry
  almeno `now + 2h20`; la durata di ogni singola capability non supera mai
  3 ore. Il target di ogni issue/rotation è
  `min(now + 3h, max(now + 2h20, authoritative fence + 15 minuti))`;
- se `authoritative fence + 15 minuti` supera il target della capability
  corrente, mantenere copertura continua con il numero minimo e finito di
  rolling rotation necessarie, ricalcolato a ogni nuovo fence. Preparare ogni
  rotation non oltre `current expiry - 15 minuti`, soltanto dopo fresh trusted
  authentication dello stesso bootstrap actor scope;
- la rotation è loss-safe in due fasi: `prepare` crea con nuova entropia una
  capability pending non utilizzabile e lascia attiva la precedente; dopo che
  il raw pending è stato salvato nel contenitore DPAPI QA, un `ack` autenticato
  attiva atomicamente la nuova e revoca la precedente. Una response `prepare`
  persa lascia valida la precedente e il pending scade entro 10 minuti; una
  response `ack` persa lascia utilizzabile il nuovo raw già salvato. Non
  esistono mai due capability cleanup attive;
- prima di qualsiasi nuova mutazione image il boundary deve provare sia la
  copertura corrente `now + 2h20`, sia un percorso di rolling rotation
  autenticato e schedulato fino all'ultimo fence già noto. Se tale percorso
  non è disponibile, rifiutare prima della mutazione. Un fence successivo
  restituito dal server che eccede la copertura corrente sospende uso delle
  upload URL e ogni nuova mutazione finché il piano non è esteso; se
  l'estensione non riesce, conservare capability/manifest e chiudere
  `BLOCKED_EXTERNAL_CLEANUP_CAPABILITY`, senza dichiarare cleanup o PASS;
- immediatamente prima di ogni intent non-replay il harness deve ottenere o
  verificare il pre-arm `now + 2h20`; se la capability corrente non lo copre,
  completa una rotation autenticata prima di inviare l'intent. Dopo la
  risposta aggiorna il piano fino al nuovo `authoritative fence + 15 minuti`
  prima di usare le upload URL. Un replay con fence già coperto non consuma un
  renewal. Questo non modifica il contratto pin dell'endpoint image;
- rate limit server-side separato dai budget immagine: una sola capability
  attiva per run/action, massimo 3 tentativi issue/renew per 15 minuti e
  massimo 5 tentativi cleanup per run/ora;
- revoca/consumo nella stessa transazione che registra l'outcome cleanup
  terminale, anche in caso di outcome già pulito;
- replay post-cleanup, capability stale, guessed, cross-run, cross-manifest,
  cross-actor, cross-action o non-staging falliscono senza DML e senza
  rivelare quale binding non coincide.

Il run HMAC è solo correlazione redatta. Non deve essere possibile ottenere,
rinnovare o usare la capability conoscendo marker, HMAC, manifest ID o
qualunque loro combinazione.

Il meccanismo può essere esposto ad Asus soltanto come endpoint/capability QA
bounded. Se l'implementazione usa una RPC service-role-only, deve essere
invocata dal Worker/harness Admin controllato; il service role non attraversa
mai la rete verso Asus e non è presente sull'host.

### Receipt terminale e recovery response-loss

Il boundary deve scrivere una receipt cleanup terminale durevole, privata e
immutabile nella stessa transazione che registra l'outcome finale e consuma la
capability `cleanup`. Una sola receipt per environment/run HMAC/manifest/
action. Tutte le cancellazioni exact e la riconciliazione DB/Storage/Auth
devono terminare prima di questa transazione terminale; nessun conteggio
terminale può essere committato in anticipo. Contenuto esclusivamente
count-only:

- schema/version e safe terminal code;
- run HMAC e manifest HMAC/receipt, mai raw marker o manifest IDs pubblici;
- conteggi run-scoped eliminati/residui;
- `activeRunOwnedSessions`;
- `sharedSnapshotUnchanged`;
- `immutableAuditPreserved`;
- `cleanupCapabilityRevoked`;
- server timestamp e receipt HMAC.

Vietati UUID raw, path, URL, credential, nomi/codici fixture, body, exception
text e service-role material. La receipt non viene eliminata dal cleanup e non
è un residuo sintetico: è evidence server-side prevista.

Se la response cleanup si perde o scade, non assumere né commit né abort e non
riusare la capability distruttiva finché lo stato non è autorevole. Recuperare
lo stato/receipt count-only tramite:

- fresh trusted authentication del bootstrap actor Admin-controlled; oppure
- capability separata read-only `cleanup-result`, almeno 128 bit CSPRNG,
  server digest/HMAC-only, bound a staging/run HMAC/manifest/bootstrap actor/
  action, emessa o ruotata subito prima del cleanup con TTL 60 minuti.

`cleanup-result` non abilita provision, cleanup, renewal image, actor mutation
o letture broad. Retrieval ripetuto è read-only e produce zero DML. Il boundary
deve persistere prima delle delete uno state record single-flight, legato allo
stesso cleanup request fingerprint, con `ownerDigest`, `generation` monotona
mai riusata e lease server-side bounded di massimo 10 minuti. L'acquire iniziale
e ogni takeover sono un unico CAS atomico sul record autorevole: verificano
receipt assente, capability attiva, lease assente/scaduta e generation attesa,
assegnano un owner nuovo e incrementano generation. Owner raw e generation
costituiscono il fencing token del worker; il server conserva l'owner solo come
digest/HMAC.

Il fencing deve essere applicato al mutation sink, non come controllo
check-then-act:

- ogni fase e ogni DML DB usa una condizione owner/generation/lease corrente
  nella stessa transazione;
- ogni delete Storage/Auth o altra mutation esterna passa soltanto dal boundary
  Admin, che acquisisce lo stesso lock/fence manifest-scoped richiesto dal CAS
  di takeover, rilegge owner/generation/lease dentro il lock e mantiene il lock
  fino alla conclusione della chiamata e alla registrazione dell'esito; in
  alternativa il sink deve supportare una conditional mutation atomica sulla
  generation;
- il takeover non può incrementare generation mentre una mutation esterna
  fenced detiene quel lock;
- se non è possibile imporre il fence al sink, non è consentito il takeover:
  restituire l'invariant blocker senza ulteriori mutation.

Una receipt non ancora terminale restituisce soltanto safe state enum
(`not_started`, `in_progress`, `aborted_recoverable` oppure
`invariant_blocked`), `retryAfterAt` bounded e stato della capability, senza
owner, generation, ID, path o error text.

Una response cleanup ambigua segue obbligatoriamente questa state machine:

1. `terminal` con receipt: non ritentare alcuna mutazione;
2. `in_progress` con lease valida: fare solo polling read-only bounded; nessun
   secondo invocatore o retry concorrente;
3. `not_started`, oppure `aborted_recoverable` dopo lease scaduta con receipt
   assente e capability ancora attiva: acquisire/takeover con CAS, owner nuovo e
   generation incrementata, quindi ripetere esclusivamente lo stesso request
   fingerprint con la stessa capability. Il boundary riprende e riconcilia
   idempotentemente le exact delete già eventualmente completate;
4. capability consumata/revocata senza receipt terminale, lease oltre il limite
   o stato incoerente: zero DML e
   `BLOCKED_EXTERNAL_CLEANUP_RECEIPT_INVARIANT`, preservando manifest/evidence
   per recovery Admin;
5. se il polling non raggiunge uno stato autorevole entro lease più grace
   bounded, non inventare l'esito e usare lo stesso invariant blocker.

Dopo retrieval terminale la capability read-only resta invariata per consentire
retry zero-DML; solo un'azione revoke autenticata separata, eseguita dopo le
verifiche, oppure la scadenza entro il TTL la disabilita, senza cancellare la
receipt.

Fault injection obbligatoria ai checkpoint `pre-record`, `in-flight`,
`partial external DML/delete`, `abort pre-commit` e `post-commit`: provare
rispettivamente exact retry sicuro, nessun retry concorrente, riconciliazione
idempotente delle delete parziali, transizione `aborted_recoverable` soltanto
dopo lease scaduta e terminal receipt senza doppia mutazione. Provare inoltre
un worker sospeso prima di una mutation che riparte dopo expiry e takeover:
owner/generation stale devono essere rifiutati al sink, con zero ulteriori DML,
delete esterne, receipt commit o capability revoke. Il nuovo owner deve poter
riconciliare e completare una sola volta. Provare inoltre
che capability consumata senza receipt porta all'invariant blocker, che il
retry con la vecchia cleanup capability dopo commit fallisce senza DML, e che
la stessa receipt è recuperabile via fresh auth/read-only capability con HMAC/
counts invariati. Retrieval ripetuti non cambiano DB, Storage, audit o receipt.
Includere anche guessed/stale/cross-run/cross-manifest/cross-actor/
cross-action per `cleanup-result`, tutti fail-closed senza DML.

### Fence temporale obbligatorio

La capability upload può durare 7200 secondi e il server conserva un fence
cleanup fino a 2 ore e 5 minuti. Il cleanup distruttivo finale deve attendere
il più tardo tra:

- 2 ore e 5 minuti dall'ultimo intent/capability emesso per il run;
- l'authoritative `pos_upload_capability_expires_at`;
- qualsiasi `retry_after_at` server successivo.

Non abbreviare il wait in base al fatto che upload/finalize/remove sembrano
completati. Un URL upload ancora valido potrebbe ricreare un oggetto dopo una
cancellazione prematura.

Usare un'attesa monitorata e comunicare avanzamento almeno ogni 60 secondi.
Non creare nuove capability image/upload durante il fence. Rinnovare la sola
capability QA cleanup, quando necessario, tramite trusted authentication e
rotation come sopra. Attendere anche la scadenza delle finestre budget
run-scoped; la finestra massima di 1 ora è inclusa nel fence 2h05 salvo un
`retry_after_at` successivo. Alla scadenza, eseguire cleanup esatto e poi una
seconda verifica Storage/DB indipendente.

### Delivery Admin

1. Leggere `AGENTS.md`, Master Plan e `TASK-150`; verificare che un comando
   esplicito dell'utente l'abbia attivata come unico task attivo.
2. Usare `TASK-150` già attivata per la delivery minima; se resta
   `DRAFT / PLANNING / NOT_ACTIVE`, fermarsi prima di autenticazione o
   mutazioni. Non creare un task concorrente e non riaprire TASK-149 come
   `DONE`.
3. Scrivere test RED prima del boundary:
   - namespace errata;
   - marker sotto 128 bit, marker guessed e marker usato come authorization;
   - production;
   - provision capability one-shot/digest-only/exact-template e negativi su
     guessed/stale/replay con request o binding diverso/cross-run/
     cross-manifest/cross-actor/action swap/additional fields/
     ruoli-permessi-ID arbitrari;
   - response provision persa dopo commit, replay exact same-request/
     same-binding con la stessa receipt safe, zero DML, nessuna nuova
     credential/actor e cleanup exact tramite capability preesistente;
   - cleanup capability su provision e provision capability su cleanup,
     entrambe senza DML;
   - run/manifest non corrispondenti;
   - exact target con riga extra;
   - path client;
   - fence attivo;
   - actor shared o budget row preesistente;
   - snapshot budget assente/mismatch, update concorrente, CAS drift, finestra
     non scaduta e delete di row non-run-owned;
   - session renewal/rotation nello stesso trusted scope, enrollment exact e
     nessun cleanup di sessioni non create dal run;
   - capability indipendente dal marker, entropia, storage digest-only,
     environment/run/manifest/actor/action binding, TTL individuale massimo
     3 ore e rolling coverage fino a fence+15;
   - capability guessed, stale, expired, cross-run, cross-manifest,
     cross-actor, cross-action, renewal non autenticato, rate limit, revoca e
     replay post-cleanup;
   - intent iniziale, replay e replacement entro 15 minuti con il numero
     minimo di rotation richieste dal fence e senza auto-rate-limit;
   - response loss dopo intent con baseline pre-arm intatto; response
     `prepare`/`ack` persa durante rotation con una capability attiva e
     cleanup ancora recuperabile;
   - `retry_after_at` oltre `now + 2h45`: rolling rotation loss-safe fino a
     fence+15 senza gap o doppia capability attiva; se il percorso
     prepare/ack/auth non è disponibile prima della mutazione, diniego
     zero-DML; se fallisce soltanto dopo un nuovo fence inatteso, preservare
     capability/manifest e chiudere con blocker esplicito senza falso PASS;
   - response cleanup persa con fault injection `pre-record`, `in-flight`,
     `partial external DML/delete`, `abort pre-commit` e `post-commit`;
     state/lease/retry/recovery autorevoli, durable terminal receipt recuperata
     count-only con fresh auth o `cleanup-result`, destructive retry e
     retrieval ripetuti a zero DML;
   - acquire/takeover CAS con owner digest e generation monotona; worker sospeso
     che riparte dopo expiry/takeover viene respinto dal fence al mutation sink
     con zero DML/delete esterne/receipt commit/capability revoke;
   - receipt/capability read-only guessed/stale/cross-binding e forbidden-field
     scan;
   - audit immutable;
   - zero-residual run-scoped count-only e snapshot pre/post equivalente.
4. Migration additiva minima, RLS/grants fail-closed e nessuna grant a
   `anon`/`authenticated`.
5. Foundation, pgTAP, DB lint/parity, security, bundle, Worker smoke e
   Gitleaks.
6. Review indipendente P0/P1/P2/P3 = 0/0/0/0.
7. PR non-draft, CI verde, merge normale.
8. Applicare migration/deploy esclusivamente staging, registrando source/
   deployment/version redatti.
9. Provare il boundary con una fixture innocua senza aprire capability image,
   poi verificarne cleanup zero.
10. Solo dopo questo PASS consentire il primo login/mutazione Phase B.

## 10. Run identity e manifest privato

Generare il run ID con CSPRNG; non hardcodarlo:

```powershell
$bytes = New-Object byte[] 16
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$runId = 'ASUSPIB_' + (($bytes | ForEach-Object { $_.ToString('X2') }) -join '')
```

Non stampare `$runId`. Il server calcola un HMAC-SHA-256 domain-separated del
marker con una chiave server-only e restituisce soltanto il run HMAC per
correlazione redatta. Non usare un semplice hash di marker corti, timestamp,
contatori, nomi o barcode. Raw run ID e exact IDs possono vivere soltanto:

- in memoria;
- nel manifest server-side;
- se indispensabile per recovery client, in un file DPAPI CurrentUser fuori
  repo/evidence con ACL ristrette.

La capability QA distruttiva è generata separatamente dal marker e non è
derivabile dal run HMAC. Le evidence pubblicano solo HMAC, counts e safe
status. Lo script di cleanup deve recuperare gli exact IDs dal manifest
server, non da UUID copiati in una PR.

### Ownership del contenitore DPAPI QA

Il contenitore QA è run-scoped:

`asus-staging-image-phase-b-` più i primi 24 hex lowercase del run HMAC.

Crearlo con semantica create-new, mai overwrite. Prima di scrivere:

- verificare che nome/path sia sotto la root trusted-store prevista;
- rifiutare link/reparse/junction e ACL non CurrentUser-only;
- verificare che nessun file/entry con quel nome esista;
- registrare nel payload DPAPI protetto full run HMAC, manifest ID, environment
  `staging`, template version e owner SID;
- registrare nel manifest server soltanto nome safe, HMAC/receipt e stato, mai
  credenziali o contenuto DPAPI.

Una collisione preesistente non autorizza open, overwrite, import, reuse o
delete. Preservare l'entry, non tentare di decifrarla per diagnostica e
fermarsi prima della mutazione, salvo che l'API trusted-store possa provare
esattamente CurrentUser ownership, ACL, full run HMAC e manifest receipt dello
stesso run. Anche con prova esatta, non sovrascrivere: riaprire solo in
recovery dello stesso run.

Al cleanup eliminare il contenitore QA soltanto dopo receipt terminale server
e soltanto se name, full run HMAC, manifest ID, owner SID e ACL coincidono.
Qualsiasi mismatch preserva il contenitore e produce
`BLOCKED_EXTERNAL_DPAPI_OWNERSHIP_UNPROVEN`. Il profilo preesistente
`asus-staging` non entra mai in questo flusso.

Ogni retry completo dopo un run ambiguo usa un nuovo run ID. Prima si porta a
zero il run fallito, rispettando il fence.

## 11. Test locali obbligatori

### Contratto e dominio

- Hash pin Admin/portable/fixture.
- Parsing exact-shape di request/response/error.
- Golden payload hash per intent/finalize/remove.
- UUID lowercase, invariant culture e ordine chiavi.
- Unknown `appVersion` bounded accettata come capability context.
- Rejection body >16 KiB e read batch >16.
- Nessun URL/token/path in serializer, error, log, cache key o outbox.

### Trasporto e retry con fake HTTP

- trusted envelope completo;
- token DPAPI caricati just-in-time e mai loggati;
- multi-profile DPAPI CurrentUser: nome run-scoped, create-new, collision
  preesistente, wrong manifest/HMAC/owner SID/ACL, reparse/link e rifiuto di
  overwrite/delete senza prova exact;
- session rotation/heartbeat/reauth confinati al contenitore QA, profilo
  shared byte-invariato e delete locale exact del solo contenitore QA dopo
  receipt terminale;
- expired/revoked/wrong-shop/read-only;
- TLS/base URL/redirect guard;
- response persa dopo intent/finalize/remove;
- same ID/same hash replay;
- same ID/different hash terminale;
- intent expiry -> nuovo intent;
- read expiry -> nuova lease;
- CAS -> refresh e blocked conflict;
- 408/429/5xx bounded retry con jitter;
- cancellation, timeout e restart outbox;
- nessun doppio finalize/remove.

### Immagini/cache/UI

- Tutti i test Phase A ancora verdi.
- JPEG/PNG byte detection, orientation, white alpha, sRGB e metadata removal.
- >16 MP rifiutato sul profilo x86 default.
- 64 MP non presentato come capacità Win7.
- main/thumb entro byte/dimension limits.
- corrupt/metadata/hash/dimension mismatch.
- bounded WIC decode e no file lock.
- progressive thumb/main, 120 richieste concorrenti entro i bound Phase A.
- replacement conserva fallback; variant promotion indipendente.
- tombstone remove; restart; stale cache; cancel/retry.
- dialog, accessibilità e quattro lingue.
- product save/article-sync regressioni invariate.

### Gate repo

Eseguire i comandi correnti della repo, includendo almeno:

- restore/build Release;
- `Win7POS.Core.Tests` completo;
- WPF imaging Release/x86/net48;
- WPF Release/x86/net48;
- solution Release;
- tutti i `scripts/check-*.ps1` richiesti;
- dialog standards;
- architecture boundaries;
- package/release completeness;
- `git diff --check`;
- Gitleaks/secret scan.

Nessun test disabilitato. Ogni `PASS` deve derivare da un comando realmente
eseguito; altrimenti usare `NOT_RUN` o `BLOCKED` con causa.

## 12. Acceptance staging Phase B

Prerequisiti:

- Admin handoff pin verificato;
- PR `#72` unita;
- Phase B locale verde;
- provisioning/cleanup Admin Phase B merged, migrated, deployed e testato;
- target staging e name/root/ACL ownership preflight del contenitore DPAPI QA
  run-scoped verificati senza mostrare dati; nessuna collisione e profilo
  shared `asus-staging` invariato;
- nessuna lease cleanup/destructive attiva;
- run marker CSPRNG 128-bit fresco, run HMAC e manifest server-side creati;
- capability `provision` one-shot exact-template pronta e distinta dalla
  cleanup capability;
- shop/staff/device QA isolati, nessun traffico concorrente e snapshot
  pre-run che prova assenza delle budget rows target;
- capability QA cleanup indipendente, bootstrap-actor/action-bound, emessa
  prima di `provision`, pre-armed per almeno 2h20 e con rolling plan
  autenticato attivo fino a fence autorevole+15;
- data directory QA separata da dati POS reali.

Eseguire in un unico run sintetico controllato:

1. invocare `provision` one-shot con
   `asus-product-image-phase-b-fixture-v1`, creare exact gli actor isolati e
   trasferire la bootstrap envelope direttamente nel contenitore DPAPI
   run-scoped create-new;
2. trusted first-login/session verso l'actor QA isolato, senza mostrare token
   e senza leggere/scrivere il profilo shared;
3. creazione/identificazione exact-ID di un solo prodotto sintetico dedicato;
4. full/delta catalog iniziale: `primaryImageVersionId=null` e
   `primaryImageUpdatedAt=null`;
5. scelta JPEG o PNG sintetico locale entro 16 MP;
6. preprocess strict JPEG main/thumb e verifica locale indipendente;
7. intent con expected version null;
8. upload main/thumb;
9. finalize;
10. replay intent e finalize con stessi ID/hash;
11. catalog delta con nuova version/timestamp, nessun path/URL/metadata;
12. read URLs, download main/thumb e validazione indipendente di byte, hash,
    dimensioni, MIME e JPEG strict;
13. scadenza reale della read lease e rinnovo con nuova `read-urls`;
14. UI lista/editor carica dalla cache e continua a funzionare dopo restart;
15. replacement con seconda immagine/versione;
16. prima versione superseded e fallback preservato finché la seconda è
    validata;
17. stale finalize e stale remove producono conflict senza cancellare la
    versione nuova;
18. response-loss/reconnect usa replay e non duplica;
19. read-only staff, auth denial o sessione invalida falliscono closed senza
    mutazione;
20. offline prepare/reconnect rispetta CAS e outbox safe;
21. remove della versione corrente;
22. replay remove;
23. catalog delta con version null e timestamp aggiornato;
24. full catalog drain completo, paging/exactness invariati;
25. zero 503, exceededCpu, exceededMemory, timeout o loop retry;
26. log/audit/evidence scan senza secret, URL, path o raw ID.

Non usare nomi/barcode reali. Non riutilizzare il run server TASK-149. Non
considerare una fixture fake HTTP come staging PASS.

## 13. Cleanup e prova zero residui

Il client deve eseguire `remove`, ma questo non sostituisce il cleanup fixture
finale.

Nel `finally` del run:

1. impedire nuovi intent/upload;
2. terminare in modo bounded le attività client;
3. registrare il tempo/fence autorevole più tardo;
4. fermare heartbeat/reauth dell'actor POS run-owned e non creare nuove
   sessioni o capability image; mantenere il contenitore DPAPI QA intatto fino
   alla receipt terminale. Rinnovare/ruotare la capability QA cleanup soltanto
   con fresh trusted authentication del bootstrap actor Admin-controlled;
5. attendere integralmente il fence massimo di 2h05, ogni
   `retry_after_at` successivo e la scadenza delle finestre budget come
   definito sopra;
6. con fresh trusted auth del bootstrap actor, emettere/ruotare una capability
   read-only `cleanup-result` bound al run/manifest e valida 60 minuti;
7. verificare che environment/run/manifest/actor/action/expiry della
   capability QA coincidano e invocare il boundary Admin con un cleanup request
   fingerprint stabile, mai un service role locale. Prima delle delete il
   boundary acquisisce con CAS atomico owner/generation/lease sullo state record
   manifest-scoped; ogni takeover incrementa generation e usa lo stesso lock
   richiesto dalle mutation esterne. Non committa ancora receipt terminale né
   consumo della capability;
8. all'interno della stessa invocazione boundary, eliminare exact-ID soltanto:
   - prodotto sintetico;
   - versioni immagine;
   - oggetti main/thumb canonici;
   - receipt mutative POS image;
   - sync events disposable;
   - budget rows che lo snapshot provava assenti, create/enrolled dal run e
     ancora identiche al CAS atteso dopo expiry;
   - sessioni create/ruotate dal run, dopo stop di heartbeat/reauth;
   - eventuali attori QA creati esclusivamente dal run;
   Le budget rows run-owned vanno eliminate con CAS prima degli actor/shop
   run-owned, così un cascade non può sostituire la prova exact-ID. Prima di
   ogni fase e di ciascuna delete DB/Storage/Auth verificare al relativo
   mutation sink owner, generation e lease correnti. Ogni chiamata esterna
   mantiene il lock manifest-scoped condiviso col takeover fino a esito
   registrato; owner/generation stale falliscono prima della mutation;
9. non cancellare né ripristinare attori, sessioni o budget rows shared/
   preesistenti; preservare audit immutabile;
10. completate tutte le cancellazioni server-side, riconciliare DB, Storage,
    Auth, sessioni e snapshot shared con una verifica count-only indipendente:
   - products `0`;
   - image versions `0`;
   - Storage objects `0`;
   - POS image mutation receipts `0`;
   - disposable sync events `0`;
   - run-owned budget rows `0`;
   - active run-owned sessions `0`;
   - active Auth actors creati dal run `0`;
   - audit rows preservate `>0`;
   - forbidden audit/log matches `0`;
   - snapshot shared/preesistente invariato;
   - durable QA cleanup terminal receipts pre-commit `0`;
11. soltanto se gli step 8-10 passano, nella stessa transazione terminale
    scrivere l'unica immutable receipt con quei conteggi, registrare l'outcome
    finale e consumare/revocare la capability cleanup, con CAS obbligatorio su
    owner/generation/lease ancora correnti. Il commit deve produrre durable QA
    cleanup terminal receipts `1` e nessuna finestra
    post-cleanup riutilizzabile. Se la response si perde dopo il commit, non
    ritentare la mutazione: passare al retrieval della receipt;
12. se la response è ambigua, interrogare `cleanup-result` e applicare la state
    machine terminal/in-progress/not-started/aborted-recoverable/
    invariant-blocked definita sopra: polling solo read-only durante la lease,
    acquire/takeover CAS e exact same-fingerprint replay soltanto quando
    autorevolmente retry-safe, mai un secondo cleanup concorrente. Un worker
    stale che riparte dopo takeover deve terminare fail-closed prima di ogni
    ulteriore DML/delete esterna/receipt commit/capability revoke;
13. recuperata la receipt con fresh auth/`cleanup-result`, verificare
    capability cleanup consumata/revocata, ripetere una verifica count-only
    indipendente, confrontare HMAC/counts e provare che destructive replay,
    capability revocata e retrieval ripetuto producono zero DML;
14. revocare con azione autenticata separata la capability read-only
    `cleanup-result` e verificarne il diniego successivo senza cancellare la
    receipt;
15. dopo receipt terminale e revoca delle sessioni server, eliminare exact il
    contenitore DPAPI QA e la data directory del run soltanto con ownership
    proof manifest/HMAC/owner SID/ACL, quindi verificare che il profilo shared
    `asus-staging` sia invariato.

Il profilo `asus-staging` e qualsiasi attore, sessione o budget row non creati
dal run non fanno parte del cleanup. `Zero residuals` indica soltanto zero
delta run-scoped rispetto allo snapshot pre-run, non zero righe globali nello
staging. La singola immutable terminal cleanup receipt prevista è evidence
durevole, non residuo sintetico.

Se il run fallisce prima del cleanup, non dichiarare residui zero. Continuare
con lo stesso `finally`, attendere il fence e usare il manifest server-side.
Se il cleanup resta bloccato, non aprire un altro run staging finché il
precedente non è a zero.

## 14. Remediation automatica

Budget massimi per questa esecuzione:

- massimo 3 cicli di remediation complessivi;
- massimo 3 run staging mutativi complessivi, incluso il primo;
- massimo 3 deploy Admin staging complessivi per cleanup/regression fix,
  incluso il primo deploy del boundary QA;
- una sola PR Phase B finale; i commit correttivi restano reviewabili senza
  riscrivere la storia pubblicata.

Incrementare il contatore prima di iniziare ogni ciclo, run o deploy e
registrare soltanto i counts redatti. Ogni run deve essere completamente
pulito prima del successivo. Un fix solo Win7POS/client non autorizza né
consuma un nuovo deploy Admin.

Per ogni failure:

1. classificare con evidence redatta: client, harness, Admin contract,
   infrastruttura, credenziale/DPAPI o hardware;
2. mettere in sicurezza e pulire il run corrente;
3. correggere il difetto nel repository responsabile;
4. aggiungere test RED/GREEN che lo riproduce;
5. rieseguire tutti i gate proporzionati;
6. review indipendente;
7. commit/PR/CI/merge normale;
8. ripetere staging con un nuovo run ID.

Regole:

- difetto Win7POS/client/harness: correggere sulla branch Phase B senza
  chiedere all'utente di fare il fixer;
- difetto Admin: correggere soltanto provisioning exact-template, manifest,
  capability, terminal receipt/cleanup QA o una regressione dimostrata
  rispetto ai pin immutabili di contratto/schema/fixture; branch e PR Admin
  separata, migration/deploy staging-only, mai mescolare la patch nella repo
  Win7POS;
- se il fix Admin cambierebbe semantica wire, auth, idempotenza, CAS, limiti,
  catalogo, Storage/RLS, receipt o comportamento server pin, non
  implementarlo: cleanup sicuro e
  `BLOCKED_EXTERNAL_AUTHORIZATION_REQUIRED`;
- nessun secondo deploy se la correzione è solo client;
- nessun timeout aumentato per nascondere CPU, deadlock o retry loop;
- nessun test allentato per far passare il risultato;
- non pubblicare output grezzo per diagnosticare un secret;
- non riusare fixture/residui di un run fallito.

Se uno dei tre massimi è raggiunto, non iniziare un altro ciclo/run/deploy:
eseguire il cleanup possibile e sicuro, revocare la capability QA e consegnare
`BLOCKED_EXTERNAL_REMEDIATION_BUDGET_EXHAUSTED`.

Budget/quota account o provider esauriti, outage staging/provider, permessi
insufficienti, dipendenza necessaria non disponibile/approvata, identità DPAPI
CurrentUser inutilizzabile o hardware Windows 7 assente non sono autorizzazioni
per ampliare scope o tentativi. Eseguire il cleanup possibile e sicuro, non
inventare PASS e consegnare `BLOCKED_EXTERNAL` con causa, counts run-scoped,
capability revocation state e prossimo passo esatto. Per il solo hardware
Windows 7 usare anche l'handoff della sezione 17.

## 15. Review indipendente

Congelare la SHA Phase B e far revisionare separatamente:

1. trusted auth/DPAPI/token lifetime;
2. canonical payload hash/idempotenza/replay;
3. upload/finalize/replacement/remove atomicity;
4. catalog full/delta/tombstone/exactness;
5. cache/path traversal/reparse/junction e filesystem;
6. WIC/x86/memory/concorrenza;
7. offline/retry/CAS/response-loss;
8. UI/accessibilità/dialog/i18n;
9. privacy/log/evidence;
10. provisioning/cleanup Admin, capability separation, durable receipt
    recovery, budget CAS/fence e zero residuals run-scoped;
11. compatibilità Admin/Android/iOS e regressioni article-sync;
12. packaging/Windows 7.

Richiedere:

`P0/P1/P2/P3 = 0/0/0/0`

Correggere ogni finding prima del PR finale e rieseguire la review sul diff
aggiornato.

## 16. PR, CI e merge

### Admin cleanup

- PR separata non-draft;
- scope limitato a provisioning exact-template, manifest, capability,
  terminal receipt/cleanup QA e regressioni verso il contratto pin;
- migration additiva;
- checks e review verdi;
- merge normale;
- staging migration/deploy soltanto, entro il massimo complessivo di 3;
- production `NOT_MODIFIED`;
- source/deployment/version registrati senza account/URL/segreti.

### Win7POS Phase B

Il PR deve riportare:

- baseline Phase A merge;
- Admin contract/schema/fixture digests;
- trasporto trusted/DPAPI;
- catalog fields e tombstone;
- cache/UI/offline/retry;
- x86 default 16 MP distinto dal ceiling portabile 64 MP;
- test locali e staging realmente eseguiti;
- cleanup zero;
- Windows 7 fisico PASS oppure `EXTERNAL_PENDING` preciso;
- Admin/Android/iOS/production non modificati salvo la PR Admin cleanup
  dichiarata.

Attendere tutti i required checks. Merge normale, niente squash/rebase/force/
bypass. Fast-forward locale e working tree pulito.

Chiudere il task Win7POS Phase B solo se tutti i gate richiesti, incluso
Windows 7 fisico quando disponibile/obbligatorio dalla governance, sono
realmente PASS. Se il solo gate residuo è hardware non disponibile, usare
`REVIEW_READY_EXTERNAL_WIN7_PHYSICAL`, mai `DONE` inventato.

## 17. Windows 7 fisico o handoff esterno

### Se il target è disponibile

Produrre un package Release `net48`/x86 dalla SHA merged, verificare SHA-256 e
testare su Windows 7 SP1 reale sotto un utente QA:

- prerequisiti .NET 4.8 e TLS 1.2;
- processo PE x86 e cold start;
- WIC decode JPEG main/thumb;
- input JPEG/PNG e orientamento;
- rifiuto >16 MP senza OOM/crash;
- lista 120 thumb bounded e UI responsive;
- choose/replace/remove;
- restart/cache corruption recovery;
- DPAPI CurrentUser/restart, senza esportare materiale;
- offline/reconnect/CAS;
- staging read/upload/finalize/remove se l'identità QA viene provisionata
  interattivamente su quel target;
- log/ACL/cache cleanup e secret scan.

Non copiare il blob DPAPI Asus sul Win7. Provisionare l'identità sul target
tramite il flusso trusted approvato.

### Se il target non è disponibile

Creare:

`docs/QA/WIN7POS_PRODUCT_IMAGE_PHASE_B_PHYSICAL_HANDOFF.md`

Deve contenere:

- motivo concreto `BLOCKED_EXTERNAL`;
- SHA merged e ancestry;
- SHA-256 package/installer/manifest;
- toolchain e prerequisiti;
- directory dati QA nuova;
- comandi PowerShell esatti, non distruttivi e senza placeholder;
- matrice test fisica sopra;
- expected result e criterio PASS/FAIL per ogni test;
- istruzioni per evidence redatte;
- divieto di trasferire DPAPI;
- cleanup locale e staging;
- stato software/staging già completato.

Creare inoltre un bundle fuori Git con manifest/hash, senza source, DB reale,
PDB, token, config privata o profilo DPAPI. Non dichiarare Windows 7 PASS.

## 18. Documentazione finale

Aggiornare nella repo Win7POS:

- `docs/plans/WIN7POS_PRODUCT_IMAGE_CROSS_PLATFORM_AUDIT.md`;
- `docs/HANDOFFS/WIN7POS_PRODUCT_IMAGE_PHASE_A_READY.md` con merge reale;
- `docs/HANDOFFS/WIN7POS_PRODUCT_IMAGE_PHASE_B_READY.md`;
- task/evidence/AI worklog richiesti dalla governance;
- handoff fisico della sezione 17, se necessario.

L'handoff Phase B deve includere:

- revisioni iniziali/finali e PR/merge;
- contract/schema/fixture digests;
- endpoint/envelope/payload-hash;
- DPAPI/privacy, inclusa separazione contenitore QA/profilo shared;
- catalog/cache/UI/offline policy;
- limiti;
- 16 MP Win7 contro 64 MP portable;
- risultati test con conteggi;
- Admin cleanup PR/migration/deploy staging;
- run HMAC e counts, mai raw IDs;
- provisioning capability one-shot exact-template e service role server-only;
- capability QA distruttiva: entropy, digest-only, binding, TTL, renewal,
  rate limit, revoca e fencing owner/generation al mutation sink;
- durable terminal cleanup receipt e response-loss retrieval count-only a
  zero DML;
- actor QA isolati e budget snapshot/CAS/expiry;
- DPAPI QA run-scoped con ownership/collision/ACL proof;
- attesa fence 2h05;
- residuals run-scoped zero, snapshot shared invariato e audit preservato;
- cicli/run/deploy usati rispetto ai massimi 3/3/3;
- physical evidence o blocker esterno;
- production `NOT_MODIFIED`;
- working trees puliti.

## 19. Output finale obbligatorio

Restituire:

```text
WIN7POS_PRODUCT_IMAGE_PHASE_B_RESULT

BASELINES
- Admin initial/final main
- Admin handoff/schema/fixture digests
- Worker source/deployment/version verified
- Win7POS initial/final main
- PR #72 initial state/head
- Android/iOS revisions inspected

PHASE_A
- reconciliation
- gates
- review P0/P1/P2/P3
- PR #72 normal merge SHA

ADMIN_CLEANUP
- cleanup mechanism PR/merge
- migration
- staging deployment/version
- allowlist/fence tests
- provision capability one-shot/exact-template/negative tests
- destructive capability entropy/HMAC/binding/TTL/renewal/revocation/rate limit
- cleanup owner/generation CAS, takeover fencing and stale-worker zero-mutation
- durable terminal receipt and cleanup-result zero-DML recovery
- isolated shop/staff and budget snapshot/CAS/expiry result
- production deploy: NO
- service role on Asus: NO

PHASE_B
- branch/PR/merge
- trusted DPAPI transport
- endpoints
- catalog fields/tombstone
- offline/retry/CAS
- cache/UI
- Win7 x86 source default: 16 MP
- portable contract ceiling: 64 MP

TESTS
- contract/golden hashes
- Core/Data
- WPF imaging x86/net48
- full Win7POS tests/build
- static/security/Gitleaks
- staging scenarios
- independent review P0/P1/P2/P3

STAGING
- run HMAC
- intent/upload/finalize/read
- replay/response loss/conflicts
- replacement/remove/catalog
- full drain/resource result
- fence waited: 2h05 or later authoritative expiry
- cleanup counts
- run-scoped residual rows/objects: 0
- active run-owned sessions: 0
- shared/preexisting snapshot: UNCHANGED
- capability post-cleanup: REVOKED
- durable QA cleanup terminal receipts: 1
- lost-response receipt retrieval/retry DML: 0
- stale worker after generation takeover mutations/terminal commits: 0
- immutable audit: PRESERVED
- secret/URL/path scan: PASS

WINDOWS_7
- physical result
- evidence path
- or exact external handoff with BLOCKED_EXTERNAL

DELIVERY
- handoff path
- evidence digest
- remediation cycles/runs/Admin deploys used versus max 3/3/3
- run-scoped QA DPAPI ownership proof: PASS; container: REMOVED
- shared asus-staging profile: UNCHANGED
- working trees clean
- production: NOT_MODIFIED

STATUS:
READY_FOR_USER_REVIEW
```

Usare `STATUS: READY_FOR_USER_REVIEW` solo se software, staging, cleanup, CI e
merge sono realmente completati. Se manca esclusivamente il target Windows 7
fisico, usare:

`STATUS: REVIEW_READY_EXTERNAL_WIN7_PHYSICAL`

Non usare `DONE`, `PASS` o `zero residuals` senza evidence reale.
