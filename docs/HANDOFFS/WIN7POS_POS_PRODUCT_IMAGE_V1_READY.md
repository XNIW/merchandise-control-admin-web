# Win7POS — POS product image v1 ready handoff

## Stato e uso del documento

- Task Admin: `TASK-149`
- Contratto trusted POS:
  `merchandise-control.pos-product-image.v1`
- Schema wire:
  `pos-product-image-v1`
- Contratto immagini portabile riusato:
  `merchandise-control.product-image.v1`, versione `1`
- Stato target Admin:
  `REVIEW_READY`
- Stato target handoff:
  `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`
- Task Admin successivo pianificato:
  `TASK-150 — Win7POS Product Image Phase B / Physical Acceptance`
- File task pianificato:
  `docs/TASKS/TASK-150-win7pos-product-image-phase-b-physical-acceptance.md`
- Evidence pianificata:
  `docs/TASKS/EVIDENCE/TASK-150/README.md`
- Stato `TASK-150`:
  `DRAFT / PLANNING / NOT_ACTIVE`, non `DONE`, fino all’apertura del
  prossimo ciclo
- Windows 7 fisico e client Phase B:
  `EXTERNAL_PENDING`
- Production, Win7POS, Win7POS PR `#72`, Android e iOS:
  `NOT_MODIFIED`

Questa consegna abilita esclusivamente la successiva implementazione e
acceptance Win7POS Phase B. Non costituisce acceptance del client, non
autorizza production e non porta `TASK-149` a `DONE`.

I gate server-side, il cleanup indipendente e la provenienza del deployment
sono congelati con evidence redatta verificata. Questo handoff è pubblicabile
come `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`; TASK-150 resta
`DRAFT / PLANNING / NOT_ACTIVE` fino a una nuova attivazione esplicita.

## Catena di delivery Admin

Baseline runtime TASK-149:

`710ff981f7bb0381159724ec02bbfec39a27eedf`

Runtime trusted POS immagini:

- PR non-draft:
  `#59 — feat: add trusted POS product image contract`
- feature SHA:
  `d7fe4eced2b8bcd015dd66b38baa30bc4619182f`
- merge normale:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`
- required CI:
  `PASS`

Hardening del gate Tail, solo tooling di acceptance:

- PR non-draft:
  `#60 — test: harden TASK-149 live Tail readiness`
- feature SHA:
  `a3347120d8686afe24c68ed9c1318f2c3e9647eb`
- merge normale:
  `d3c674ada8aa7abf0179355c09238472b9ff3023`
- required CI:
  `PASS`
- Worker runtime modificato:
  `NO`
- nuovo deploy Worker:
  `NO`

Admin main runtime/tooling congelato:

`d3c674ada8aa7abf0179355c09238472b9ff3023`

Il successivo merge esclusivamente documentale non cambia il runtime o
l’artifact Worker. Sarà attestato soltanto nel record GitHub/CI della PR
documentale e nella final response, non nel README versionato TASK-149.

Il Worker staging resta costruito dal runtime merge `1de29124`, non dal merge
tooling `d3c674ad` né dal futuro commit documentale.

Win7POS resta read-only:

- main verificato:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`
- PR `#72` head verificato:
  `b43473f9c959a86403fa0f0a012f798d15af553e`
- stato PR `#72`:
  `OPEN / DRAFT / UNMERGED / UNTOUCHED`

Android e iOS non sono stati modificati. Nessuna migration o distribuzione
production è stata eseguita.

## Migration, database e Worker staging

Migration repository:

`supabase/migrations/20260730165557_task_149_trusted_pos_product_image_v1.sql`

SHA-256 migration:

`b4eb344f4bb73ae8cfbcb5ef10ed53f2959694caf814c53c78978d7c450d6511`

La migration è stata applicata una sola volta al progetto staging
allowlisted:

- apply staging:
  `PASS`
- righe migration confrontate:
  `97`
- mismatch repository/staging:
  `0`
- repair/reset/revert:
  `NO`
- lint linked `public,app_private` con livello `error`:
  `PASS`, zero errori
- apply production:
  `NO`

La migration:

- aggiunge a `inventory_product_image_versions` l’attribuzione POS trusted per
  staff, device e sessione, sia in richiesta sia in finalize;
- aggiunge la scadenza autorevole della capability upload POS;
- distingue `pos_staff` dagli attori personali/platform senza creare un
  profilo web fittizio;
- crea budget mutativi privati per shop e staff;
- crea receipt mutative durevoli, shop-scoped e service-role-only;
- abilita e forza RLS sulle receipt e revoca accesso diretto a `anon` e
  `authenticated`;
- aggiunge RPC service-role per authorization, intent, finalize, read,
  remove, cleanup QA e audit redatto;
- pubblica versione immagine, timestamp e catalog revision nella stessa
  boundary transazionale;
- estende `pos_catalog_pull_page_v2` con i due campi immagine additivi,
  preservandone firma, paging e revision fence;
- chiude il race CAS del finalize Shop Admin legacy senza cambiare il relativo
  contratto client;
- include una RPC di cleanup QA exact-scope non utilizzabile dal client.

Worker staging:

- source commit:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`
- deploy TASK-149 eseguiti:
  `1` su massimo `3` autorizzati
- deploy successivi al tooling PR `#60`:
  `0`
- digest SHA-256 redatto dell’identificatore versione registrato al deploy:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`
- identificatori raw di account, deployment e versione:
  omessi intenzionalmente; restano nell’evidence privata
- produzione:
  `NOT_MODIFIED`

Il recheck definitivo source/deployment/version, con soli digest redatti, è
registrato qui:

`PASS`, recheck indipendente source/deployment/version.

- Worker source:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`;
- deployment digest SHA-256:
  `abdb4d35a8e0013eb4a431d2eb265472ea24412f33eb0a72bf2e8aa3998c6f51`;
- version digest SHA-256:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`;
- versione attiva: `100%`;
- deployment/version invariati durante il gate e nel recheck indipendente;
- deploy Worker dopo PR `#60`: `0`;
- production: `NOT_MODIFIED`.

## Contratto congelato

Schema machine-readable:

`contracts/pos-product-image-v1/schema.json`

- JSON Schema:
  draft `2020-12`
- `$id`:
  `urn:merchandise-control:contract:pos-product-image-v1`
- contract ID:
  `merchandise-control.pos-product-image.v1`
- `schemaVersion`:
  `pos-product-image-v1`
- SHA-256:
  `74bd4b7f86a05b6180c133c86a47ae70be99a6f8012c8bfb747d7b18c714ceb0`

Contratto portabile riusato byte-per-byte:

`contracts/product-image-v1.json`

- ID:
  `merchandise-control.product-image.v1`
- versione:
  `1`
- SHA-256:
  `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`

Il delta trusted POS non modifica:

- il contratto portabile;
- le route `/api/shop/product-images/*`;
- l’UX immagini Admin Web;
- Android o iOS;
- Win7POS Phase A o PR `#72`.

## Endpoint POS

Tutti gli endpoint:

- accettano soltanto `POST`;
- accettano JSON exact-shape bounded;
- restituiscono `Cache-Control: no-store`;
- usano `schemaVersion = pos-product-image-v1`;
- non accettano un bearer token Supabase browser come autenticazione POS;
- eseguono method/body/light guard prima di importare il dominio immagini.

| Operazione | Endpoint | Permesso prodotto | Permesso runtime |
| --- | --- | --- | --- |
| `intent` | `POST /api/pos/catalog/product-images/intent` | `products.write` | `catalog.write` |
| `finalize` | `POST /api/pos/catalog/product-images/finalize` | `products.write` | `catalog.write` |
| `read-urls` | `POST /api/pos/catalog/product-images/read-urls` | `products.read` | `catalog.read` |
| `remove` | `POST /api/pos/catalog/product-images/remove` | `products.write` | `catalog.write` |

Il server conserva le equivalenze di permesso già previste dal dominio,
incluse `shop_admin.full_access`, `catalog.manage`, `catalog.write` e
`catalog.read`/`catalog.view`, in base all’operazione richiesta.

## Trusted runtime envelope

Ogni request contiene esattamente:

- `schemaVersion`;
- `appVersion`;
- `shopId`;
- `shopDeviceId`;
- `staffId`;
- `staffCredentialVersion`;
- `posSessionId`;
- `deviceToken`;
- `sessionToken`.

Limiti envelope:

- `schemaVersion`: esattamente `pos-product-image-v1`;
- `appVersion`: `1..80` caratteri, senza control character;
- `deviceToken` e `sessionToken`: `1..512` caratteri, senza control
  character;
- `staffCredentialVersion`: intero `1..2147483647`;
- UUID: forma canonica lowercase nella proiezione del payload hash;
- request JSON: massimo `16384` byte.

`appVersion` è un contesto telemetry/capability forward-compatible, non una
versione semantica imposta dal server. Una stringa nuova ma valida non viene
rifiutata perché sconosciuta. Il comportamento wire è governato da
`schemaVersion`; `appVersion` non entra nel payload hash né nell’outcome
durevole.

Le mutazioni `intent`, `finalize` e `remove` aggiungono:

- `operation`, coerente con il path;
- `operationId`;
- `idempotencyKey`;
- `payloadHash`;
- `productId`;
- `expectedCurrentVersionId`.

`finalize` aggiunge `versionId`. `intent` aggiunge i metadata `main` e
`thumb`.

`read-urls` è una lettura effimera: usa `refs`, non contiene `operation`,
`operationId`, `idempotencyKey` o `payloadHash` e non crea receipt.

### Verifica fail-closed

Prima di importare il dominio immagini, il Worker verifica:

1. metodo;
2. dimensione body;
3. JSON ed exact shape;
4. schema e limiti;
5. active runtime lease;
6. device, session e relativi token;
7. shop esatto;
8. staff attivo;
9. credential version esatta su staff, sessione e credential;
10. permesso read/write richiesto.

Le mutazioni rifermano lease, identità, credential version e permesso dentro
la transazione autorevole finale. Dopo l’autorizzazione, `deviceToken` e
`sessionToken` non vengono propagati al dominio immagini.

Win7POS deve usare esclusivamente il trusted runtime già ottenuto dal login
POS. Le credenziali locali restano protette dal profilo DPAPI esistente.
Nessuna service-role key può essere installata, letta o usata sul computer
Asus o su qualunque client.

## Operation ID, idempotency key e payload hash

`operationId` e `idempotencyKey`:

- hanno lunghezza massima `120`;
- rispettano
  `^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$`;
- non possono contenere i token correnti;
- vengono respinti se sembrano contenere bearer, token, secret, password,
  credential, PIN o altro materiale sensibile.

Formato hash:

```text
sha256:<64 caratteri esadecimali minuscoli>
```

Il digest è SHA-256 dell’UTF-8 di JSON compatto, senza whitespace e con ordine
fisso. Non si serializza direttamente l’intera request ricevuta.

Proiezione `intent`:

```text
schemaVersion
operation
shopId
productId
expectedCurrentVersionId
main
thumb
```

Ordine interno di `main` e `thumb`:

```text
bytes
height
mimeType
sha256
width
```

Proiezione `finalize`:

```text
schemaVersion
operation
shopId
productId
expectedCurrentVersionId
versionId
```

Proiezione `remove`:

```text
schemaVersion
operation
shopId
productId
expectedCurrentVersionId
```

Sono esclusi dal digest:

- `operationId`;
- `idempotencyKey`;
- `payloadHash`;
- `appVersion`;
- identità device/staff/session;
- credential version;
- token;
- URL, capability e Storage path.

`mimeType` è esattamente `image/jpeg`; gli SHA immagine sono 64 caratteri
esadecimali minuscoli. Gli UUID sono lowercase nella proiezione.

## Idempotenza durevole

Le receipt esistono soltanto per `intent`, `finalize` e `remove`.

- stesso scope, stesso `operationId` e stesso `payloadHash`:
  replay dell’outcome durevole originario;
- stesso `operationId` e hash diverso:
  failure fail-closed senza DML;
- riuso incompatibile di `idempotencyKey`:
  failure fail-closed senza DML;
- finalize replay:
  nessuna seconda promotion o supersede;
- remove replay:
  nessuna rimozione della versione successiva;
- il confronto receipt precede ogni nuova mutazione autorevole.

Lo scope della receipt include schema, operation, shop e identità trusted
staff/device/session. L’attore autorevole resta lo staff POS reale: il server
non crea un profilo web fittizio.

La response mutativa include l’identità mutativa ricevuta, `replayed` e
l’outcome originario.

Un replay di `intent` può rifirmare la stessa versione solo quando l’intent DB
originario è ancora valido e dopo una nuova verifica trusted. Dopo la
scadenza occorrono un nuovo `operationId`, un nuovo `idempotencyKey` e un
nuovo intent.

Receipt, audit e log non contengono:

- token o credential;
- signed upload/read URL;
- Storage object path;
- request body raw;
- eccezioni non redatte.

Le receipt sono append-only in esercizio ordinario, con RLS forced e accesso
tabella limitato al boundary service-role.

## Compare-and-swap

- Primo inserimento:
  `expectedCurrentVersionId = null`, ammesso soltanto quando il prodotto non
  ha una versione corrente.
- Replacement:
  `intent.expectedCurrentVersionId` deve essere la versione corrente esatta.
- Finalize:
  ripete l’expected version dell’intent; la versione pending conserva questo
  fence.
- Remove:
  `expectedCurrentVersionId` è obbligatorio e identifica la versione corrente
  da rimuovere.

Versione, riferimento prodotto, `primaryImageUpdatedAt` e catalog revision
sono pubblicati nella stessa transazione. Un conflitto non cancella oggetti
appartenenti a una versione più nuova.

Su `expected_version_conflict` Win7POS deve eseguire un nuovo catalog pull e
ricostruire esplicitamente l’operazione; non deve applicare last-write-wins.

## Limiti immagine, capability e lettura

| Risorsa | Limite |
| --- | ---: |
| Request JSON | `16384` byte |
| Ceiling portabile pre-preprocessing | `26214400` byte / `64000000` pixel |
| Default operativo Win7/x86 Phase B | `16000000` pixel |
| `main.bytes` accettati dal server | `1..1048576` |
| `main.width` / `main.height` | `1..1600` |
| `thumb.bytes` accettati dal server | `1..92160` |
| `thumb.width` / `thumb.height` | `1..384` |
| Read refs | `1..16`, uniche |
| Response `read-urls` | massimo `65536` byte |
| Signed read URL TTL | esattamente `300` secondi |
| Safety window read client | `30000` ms |
| Signed upload capability | massimo `7200` secondi |
| Read request concurrency portabile | `2` |
| Download concurrency portabile | `4` |
| Guardrail server corrente per staff | `60` mutazioni ogni `15` minuti |
| Guardrail server corrente per shop | `300` mutazioni ogni ora |

Il ceiling portabile di `64000000` pixel non è il target operativo Win7POS.
Per la Phase B Win7/x86 il default da preservare è `16000000` pixel. Non va
aumentato finché evidence ripetibile sul dispositivo fisico non dimostra che
decode, normalizzazione, memoria e durata restano sicuri.

I guardrail `60/15m` e `300/h` descrivono la policy server corrente. Non sono
limiti wire da hardcodare nel client e possono evolvere senza una nuova
versione schema. Win7POS deve trattare HTTP `429` e il campo `retryable` come
segnale per un backoff bounded.

Pipeline portabile:

| Variante | Lato massimo | Clamp pipeline | Target byte | Hard max | Qualità |
| --- | ---: | ---: | ---: | ---: | --- |
| `main` | `1600` | `640` | `768000` | `1048576` | `0.82`, `0.76`, `0.70` |
| `thumb` | `384` | `128` | `92160` | `92160` | `0.75`, `0.68`, `0.60`, `0.52` |

Il clamp è una regola della pipeline di compressione, non il minimo schema
dei metadata. `thumb` deriva dal `main` normalizzato.

Wire format e validazione:

- output `image/jpeg`;
- originale non persistito;
- orientamento normalizzato;
- spazio colore sRGB;
- alpha compositata su bianco;
- SOI obbligatorio;
- EOI terminale obbligatorio;
- trailing bytes vietati;
- APP0 ammesso soltanto come JFIF;
- COM e APP1–APP15 vietati;
- parser bounded single-pass;
- differenza fra aspect ratio `main` e `thumb` non superiore a `0.02`.

Finalize riscarica entrambi gli oggetti e verifica indipendentemente MIME,
numero byte, SHA-256, dimensioni, struttura JPEG e aspect ratio. I metadata
dichiarati dal client non sono sufficienti alla promotion.

## Flusso operazioni

### `intent`

Il client invia metadata strict di `main` e `thumb`; non invia Storage path.

Il server:

1. verifica trusted runtime e permesso write;
2. verifica prodotto/shop e CAS;
3. crea o recupera la versione immutabile;
4. deriva i path dal database;
5. registra intent e receipt;
6. genera due capability upload effimere;
7. rifirma l’autorizzazione prima della response.

Response:

- `status = noop` quando non serve upload;
- `status = upload_required` con `versionId`, `expiresAt`,
  `mainUploadUrl` e `thumbUploadUrl`;
- nuova versione upload: HTTP `201`;
- noop o replay: HTTP `200`.

Le URL sono capability opache. Win7POS non deve analizzarle, ricostruirle,
persistirle o ricavarne un path.

### Upload

Caricare entrambi i JPEG sulle rispettive capability prima di `expiresAt`.
Un upload riuscito non pubblica l’immagine. Non chiamare finalize finché
entrambi gli oggetti non sono presenti.

### `finalize`

Inviare `versionId` e lo stesso fence `expectedCurrentVersionId` dell’intent.

Successo HTTP `200`:

- `status = finalized`; oppure
- `status = already_finalized` su replay;
- `versionId`;
- `imageUpdatedAt`;
- `replayed`.

La promotion è atomica con il supersede della versione precedente e la
catalog revision. Un errore di validazione preserva l’immagine valida
precedente.

### `read-urls`

Ogni ref contiene:

- `productId`;
- `versionId`;
- `variant = main | thumb`.

La response preserva l’ordine request. Ogni item è:

- `ready`, con `signedUrl`, `expiresAt` e metadata verificati; oppure
- `not_found`, senza URL.

Le URL sono soltanto HTTPS/no-store, memory-only e hanno TTL esatto di 300
secondi. Un prodotto mai fotografato ha i campi catalogo null e non richiede
una URL da firmare.

### `remove`

Inviare la versione corrente in `expectedCurrentVersionId`.

Successo HTTP `200`:

- `status = removed`, con:
  - `currentImageVersionId = null`;
  - `imageUpdatedAt`;
  - `cleanupStatus = complete | pending`; oppure
- `status = already_removed` su replay.

La rimozione del riferimento catalogo e la publication revision sono
atomiche. `cleanupStatus = pending` indica cleanup Storage server-side: non
annulla la rimozione catalogo e non autorizza il client a costruire o
cancellare path.

## Catalogo POS

Ogni prodotto full/delta aggiunge:

```text
primaryImageVersionId: string | null
primaryImageUpdatedAt: canonical timestamp | null
```

| Stato | `primaryImageVersionId` | `primaryImageUpdatedAt` |
| --- | --- | --- |
| Mai fotografato | `null` | `null` |
| Immagine corrente | UUID versione | timestamp canonico |
| Immagine rimossa | `null` | nuovo timestamp canonico |

La combinazione UUID + timestamp nullo è invalida.

Replacement e remove aggiornano la revision prodotto/catalogo e compaiono nel
delta. I campi sono additivi: i client storici possono ignorarli.

Il catalogo non contiene:

- signed/upload URL;
- Storage path;
- SHA;
- byte;
- width/height;
- metadata JPEG.

Paging, manifest, summary, exactness e assenza di business cap restano quelli
di `pos-catalog-v2`.

## Errori e retry

La response errore contiene:

- `schemaVersion`;
- operazione determinata dal path;
- `ok = false`;
- safe `code`;
- `retryable`;
- `serverTime`;
- safe `requestId`;
- opzionale safe `clientRequestId`;
- identità mutativa soltanto quando già validata.

Nessun errore contiene body, URL, path, token o identificatori privati non
necessari.

| Classe | HTTP tipico | Retry | Azione Win7POS |
| --- | ---: | --- | --- |
| `validation_failed`, `payload_hash_mismatch` | `400` | No | Correggere request/hash |
| `auth_denied` | `401` | No | Rinnovare trusted login/session |
| `permission_denied` | `403` | No | Non ritentare senza cambio permesso |
| `product_not_found`, `version_not_found` | `404` | No | Riconciliare catalogo |
| `expected_version_conflict`, `stale_conflict` | `409` | No | Pull e nuova operazione |
| `idempotency_conflict`, `idempotency_payload_mismatch` | `409` | No | Non riusare l’identità |
| `intent_expired` | `409` | No | Nuovo intent e nuovi ID |
| `storage_object_missing`, `invalid_state` | `409` | No | Ricostruire il flusso |
| `jpeg_*` validation code | `422` | No | Rigenerare JPEG/metadata |
| `rate_limited` | `429` | Sì | Backoff bounded |
| `storage_unavailable` | `503` | Sì | Retry bounded, stessa identità logica |
| `backend_unavailable`, `backend_contract_invalid`, `not_configured` | `503` | Sì | Retry bounded o blocco operativo |
| `db_failure` inatteso al boundary route | `500` | Sì | Retry bounded |

Il campo `retryable` della response è autorevole.

Policy portabile:

- upload: massimo un retry per rete transitoria o HTTP 5xx;
- download: massimo un refresh signed URL per HTTP 401/403;
- decode/validation: zero retry automatici;
- read UI: retry esplicito dell’utente;
- URL read scaduta: nuova `read-urls`, mai riuso della capability scaduta.

## Storage, RLS, receipt e cleanup runtime

- Bucket `product-images` privato.
- MIME Storage: `image/jpeg`.
- Limite bucket hard: 1 MiB per oggetto.
- Path derivati esclusivamente dal database.
- Il client non invia, memorizza o cancella path.
- Versioni con RLS forced.
- Nessuna grant tabella immagini/receipt a `anon` o `authenticated`.
- Mutation e receipt attraversano esclusivamente il boundary service-role.
- Signed URL assenti da database, catalogo, receipt, audit, log ed evidence.

Se finalize si interrompe per un errore Storage/transient prima del commit
autorevole:

- la versione valida precedente resta corrente;
- non vengono pubblicati promotion, supersede o catalog revision;
- la versione/intent resta pending e retryable;
- il client ritenta con la stessa identità logica:
  `operationId`, `idempotencyKey`, `payloadHash` e `versionId` invariati.

Se una validation failure terminale viene commit-tata:

- la versione valida precedente resta corrente;
- la versione candidata passa a `failed`;
- l’outcome terminale resta durevole;
- il cleanup dei soli oggetti canonici della versione fallita resta
  `pending`.

Se remove non riesce a cancellare Storage:

- catalogo e CAS restano già pubblicati;
- `cleanupStatus = pending`;
- il cleanup server riprova soltanto i path canonici della versione rimossa;
- una versione successiva non viene alterata.

Il cleanup runtime ordinario è eseguito da un runner server-side/off-device,
mai dal computer Asus. Win7POS non riceve service role e non richiama
direttamente RPC private.

## Fixture e integrità

Tutti gli identificatori e token nelle fixture sono sintetici e non validi.

| Artifact | SHA-256 |
| --- | --- |
| `contracts/pos-product-image-v1/schema.json` | `74bd4b7f86a05b6180c133c86a47ae70be99a6f8012c8bfb747d7b18c714ceb0` |
| `contracts/pos-product-image-v1/intent.request.valid.json` | `80a137a02db03b9ffa72189189b80f6e0a819f6d0db226fec1c5efd14123989e` |
| `contracts/pos-product-image-v1/intent.request.invalid-hash.json` | `08cf50062fb2343122e3406aba7d29bbf8cf849edfcd07dca8c70a8b1480f31e` |
| `contracts/pos-product-image-v1/intent.response.valid.json` | `e10f767f82d15041c2dc42753acb335b837c0e36085dee309a5d802990a19779` |
| `contracts/pos-product-image-v1/finalize.request.valid.json` | `e5547e742969a7e2662fe44d111c4e3a3578a609cbfa5ab2c957f12ac8d2ab5d` |
| `contracts/pos-product-image-v1/finalize.response.valid.json` | `cd70ff1f6a83d223973af74366cd3faf23f3657c908439ba71a7b348363c51e1` |
| `contracts/pos-product-image-v1/read-urls.request.valid.json` | `a60b41dffb287f8cbeab7517ceb372c1591b41c3169079c28694e2580d22694a` |
| `contracts/pos-product-image-v1/read-urls.response.valid.json` | `88c725d9a200b61b9414b8da0526f3655f6cbe4fd4f6941d078a91ccfc5774c9` |
| `contracts/pos-product-image-v1/remove.request.valid.json` | `d5f2930c223b08f431a8fd82717e257287e913b081613b85b49618b05d566d1b` |
| `contracts/pos-product-image-v1/remove.response.valid.json` | `fc1d0455aca6eaeae185cd1a322e30ca725b11ac8b7b93436ee7cf9d973b650f` |
| `contracts/pos-product-image-v1/error.response.valid.json` | `8a4cc7627173133dc7c9171ea548b8c482768f4c96c0c02fc60781db47d00d3d` |

Digest del manifest fixture, ottenuto applicando SHA-256 alle righe
`sha256sum` ordinate per path:

`ebb67b47d1460fa6361aa0d06e490f39e3b4a74afcd0cafc9fa9decc19e1df05`

Artifact aggiuntivi:

| Artifact | SHA-256 |
| --- | --- |
| `contracts/product-image-v1.json` | `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672` |
| `docs/contracts/POS_PRODUCT_IMAGE_V1_SERVER_DELTA.md` | `5941f02def1992f4d9d16f4c787a4cabf3e736d740de5bce767f7f990b4b832e` |
| Migration TASK-149 | `b4eb344f4bb73ae8cfbcb5ef10ed53f2959694caf814c53c78978d7c450d6511` |
| pgTAP TASK-149 | `b4bef250f16009eae87325c97dcf438014adb9384e6f6a6eac71e56377a0af1b` |
| Harness staging post-PR `#60` | `2d364afaacfa5e0bc6ea02445fd8ea09938ce11516941eb35465614d8440d9b1` |
| Resource gate post-PR `#60` | `04442d32d71149904d4453dfbf371d55856785ce8efd14f6af6a5831dfb43415` |
| Focused test post-PR `#60` | `c9a3186b55a5a442b0182747f766ee692884268ca67f86927f94c33c0cd0fff6` |

Win7POS deve vendorizzare schema e fixture byte-per-byte e verificarne gli SHA
prima dell’implementazione.

## Evidence test e review

Runtime pre-merge:

- focused TASK-149:
  `28/28 PASS`
- foundation completa:
  `PASS`
- lint, typecheck e security scan:
  `PASS`
- `npm run verify`:
  `PASS`
- `npm run cf:build`:
  `PASS`
- Worker smoke locale sulle quattro route:
  `PASS`
- bundle/import graph:
  `7/7 PASS`
- pgTAP TASK-149:
  `162/162 PASS`
- pgTAP completo:
  `1251/1251 PASS`
- migration replay locale isolato:
  `PASS`
- DB lint:
  zero errori
- review indipendente:
  `P0/P1/P2/P3 = 0/0/0/0`

Tooling post-PR `#60`:

- self-test resource gate:
  `PASS`
- focused TASK-149:
  `28/28 PASS`
- foundation completa con Win7POS main pinned:
  `PASS`
- lint, typecheck, security, verify e Cloudflare build:
  `PASS`
- Gitleaks changed-files/diff:
  zero finding
- `git diff --check`:
  `PASS`

Il test delle 676 pagine resta evidence foundation per CASE40. Non deve essere
descritto come un drain staging live. Il live full drain viene invece
confrontato con il manifest DB autorevole dello stesso snapshot.

## Primo live gate e remediation osservabilità

Il primo gate live è terminato fail-closed con:

`BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE`

Il risultato non è stato promosso a PASS e non viene usato come evidence di
copertura Tail. Non si dichiara alcun conteggio osservato speculativo.

Root cause:

- la readiness era stata attestata su un processo `wrangler tail --format
  pretty` separato;
- quel processo veniva chiuso prima di avviare il Tail JSON;
- il gate attendeva poi un delay cieco di due secondi;
- il Tail JSON può quindi aver perso la sequenza iniziale pur senza generare
  un falso PASS.

La PR `#60` ha corretto il gate con:

- creazione diretta e bounded della sessione Tail control-plane;
- filtri esatti per header run marker e versione Worker, senza sampling;
- protocollo WebSocket `trace-v1`;
- listener registrati prima dell’open;
- pong effettivo prima di avviare l’harness;
- heartbeat/pong per tutta la request phase;
- validazione dell’expiry sufficiente;
- delete della sessione Tail exactly-once;
- timeout lifecycle bounded e stop cooperativo/escalation del child;
- validazione output e cleanup dell’harness anche quando esiste un errore di
  fase.

La correzione è solo tooling: non ha richiesto né prodotto un secondo deploy
Worker.

Recheck count-only dopo il primo run:

- fixture complete individuate:
  `1`
- attori Auth sintetici:
  `2`
- shop sintetici archiviati:
  `1`
- righe attore/runtime attive:
  `0`
- attori Auth attivi:
  `0`
- prodotti residui:
  `0`
- versioni immagine residue:
  `0`
- receipt residue:
  `0`
- sync/catalog event residui:
  `0`
- write-budget residui:
  `0`
- Storage object residui:
  `0`
- audit immutabili preservati:
  `11`
- forbidden audit matches:
  `0`
- cleanup audit:
  `1`

Questo recheck prova che il primo tentativo non ha lasciato residui. Non
sostituisce il secondo live gate né il suo cleanup indipendente.

## Secondo live gate

Il secondo run ha usato un nuovo run marker sintetico. Nel documento e
nell’evidence pubblica il marker compare soltanto come digest SHA-256, mai
come valore raw.

L’evidence congelata include:

- schema evidence `task149-pos-product-image-resource-gate-v2`;
- stato `PASS`;
- digest del run marker;
- `19/19` acceptance step;
- `19/19` marker harness;
- CASE46/CASE48 `2/2`;
- copertura Tail esatta `1..N`;
- primo request Worker uguale a `cold_candidate_intent`, sequenza `1`;
- full drain e confronto manifest DB snapshot-bound;
- deployment/version invariati durante il run;
- versione attiva al 100%;
- conteggi HTTP 503, server error, exception e resource failure tutti a zero;
- forbidden matches in log, diagnostics, audit e durable state a zero;
- GraphQL correlato alla stessa versione e finestra;
- CPU Tail in microsecondi e memoria Cloudflare nei limiti;
- nessun secret, URL firmato, token o path privato.

Outcome redatto del secondo live gate:

`PASS`, schema `task149-pos-product-image-resource-gate-v2`.

- marker finali: `TASK149_CASE_46`, `TASK149_CASE_48` (`2/2`);
- acceptance step e marker harness: `19/19 PASS`;
- deployment digest SHA-256:
  `abdb4d35a8e0013eb4a431d2eb265472ea24412f33eb0a72bf2e8aa3998c6f51`;
- run marker digest SHA-256:
  `e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c`;
- Tail coverage digest SHA-256:
  `1cc5c22235d39be88c8bf1c2362a0de6b73b5beb0216df05d59e440774820590`;
- version digest SHA-256:
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`;
- eventi Tail correlati / richieste GraphQL: `34/34`;
- invocazioni cold / warm / full-drain: `1/32/1`;
- log records / diagnostics channel events: `13/0`;
- errori, eccezioni, forbidden log e forbidden diagnostic match: `0/0/0/0`;
- Tail CPU µs overall:
  `p50 10000`, `p90 38000`, `p99/p999/max 368000`;
- Tail CPU µs cold: `368000`;
- Tail CPU µs warm:
  `p50 9000`, `p90 18000`, `p99/p999/max 319000`;
- Tail CPU µs full-drain: `16000`;
- GraphQL CPU µs:
  `p50 10964`, `p90 38219`, `p99/p999/max 368575`;
- GraphQL memory bytes:
  `p50 32224684`, `p90 36520496`, `p99/p999 37648956`,
  `max 37648957`;
- versione attiva: `100%`;
- deployment/version invariati durante il gate.

## Cleanup finale e residui

Il recheck finale è exact-scope e count-only. Non pubblica run marker raw,
UUID, Auth ID, path Storage o array di cleanup.

Prova:

- `sync_events = 0`;
- mutation receipt `= 0`;
- image version `= 0`;
- prodotto sintetico `= 0`;
- write-budget row `= 0`;
- Storage object esatti `= 0`;
- righe attore/runtime attive `= 0`;
- attori Auth attivi `= 0`;
- audit immutabili preservati;
- forbidden audit matches `= 0`;
- invarianti non-target immutate.

Recheck cleanup finale:

`PASS`, recheck indipendente exact-scope e count-only.

- run marker digest SHA-256:
  `e6086bf1108733017cc7ad2206959c29e0a2434f8561dbc739e790a89868b27c`;
- candidate run groups / shop archiviati: `1/1`;
- attori Auth totali / inattivi / attivi: `2/2/0`;
- righe attore attive: `0`;
- residui image versions / products / receipts / sync events / Storage objects /
  write-budget rows: `0/0/0/0/0/0`;
- cleanup RPC verificata / cleanup audit rows: `1/1`;
- audit rows preservate / forbidden audit match: `11/0`;
- eliminati sync events / receipts / image versions / products /
  write-budget rows: `4/8/3/1/2`.

## Cleanup staging Phase B — runner server-side fuori Asus

La RPC corrente
`task_149_pos_product_image_fixture_cleanup_v1` accetta soltanto la fixture e
il namespace allowlisted di TASK-149. Non è una cleanup API generale e non
deve essere aggirata, allargata implicitamente o invocata dal client.

Prima che il computer Asus invii qualsiasi mutazione staging della Phase B,
un runner separato server-side/off-device deve:

1. definire un namespace sintetico Phase B distinto;
2. predisporre e revieware un meccanismo cleanup exact-ID allowlisted per quel
   namespace;
3. verificare `preflight`/`apply`/`verify` fail-closed;
4. dimostrare che non può selezionare dati preesistenti o non-QA;
5. usare le credenziali server-side soltanto nell’ambiente runner
   autorizzato, mai sul computer Asus o nel client Win7POS;
6. fermarsi prima delle mutazioni se il cleanup non è già dimostrabile.

Il runner non viene eseguito sull’Asus. Sul computer Asus non deve essere
presente alcuna service-role key; il client usa soltanto le capability trusted
POS previste dal contratto.

Il cleanup non può iniziare finché esiste una upload capability potenzialmente
valida. La Phase B deve rispettare il fence massimo di `2 h 05 min`:

- capability upload massima:
  `2 h`;
- fence operativa:
  `5 min`.

Gli attori sintetici devono essere revocati/disabilitati prima dell’attesa.
Dopo il fence, il runner server-side/off-device risolve i soli path canonici
dai record autorevoli, rimuove la fixture exact-ID e verifica residui zero.
L’audit immutabile resta preservato.

## Indicazioni implementative per Win7POS Phase B

1. Vendorizzare schema e fixture byte-per-byte e verificarne gli SHA.
2. Riusare il contratto portabile `product-image-v1` senza fork.
3. Conservare il default Win7/x86 a `16000000` pixel; non promuovere il
   ceiling portabile `64000000` a default operativo.
4. Produrre soltanto `main` e `thumb` JPEG conformi ai budget.
5. Usare esclusivamente trusted device/session/staff runtime protetto dal
   profilo DPAPI esistente.
6. Non installare service role, database password o bearer Supabase sul
   client.
7. Aggiungere i due campi immagine al DTO catalogo come campi additivi.
8. Conservare durable `operationId`, `idempotencyKey`, proiezione canonica e
   hash per tutta la vita della stessa operazione.
9. Sul retry della stessa operazione non cambiare ID o hash.
10. Dopo `intent_expired`, creare una nuova identità mutativa.
11. Per replacement e remove partire sempre dalla versione corrente del
    catalogo.
12. Trattare `expected_version_conflict` come richiesta di pull/merge, mai
    come overwrite.
13. Trattare signed upload/read URL come capability opache e memory-only.
14. Non inserire URL o Storage path in SQLite, log, crash report, telemetry o
    cache key.
15. Usare come cache identity almeno account scope, shop, product, version e
    variant.
16. Invalidare cache su account/shop change, remove o replacement.
17. Dopo upload di entrambi i JPEG chiamare finalize; non assumere publication
    dal solo upload.
18. Trattare `cleanupStatus = pending` come cleanup server-side, non come
    autorizzazione a costruire o cancellare path.
19. Usare backoff bounded soltanto quando `retryable = true`.
20. Eseguire staging acceptance soltanto dopo il preflight del cleanup Phase B
    e soltanto su fixture sintetiche exact-ID.
21. Non modificare production, Android/iOS o la precedente PR Phase A come
    effetto implicito del handoff.

## Gate di rilascio handoff

Per lo stato pubblicato
`READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B` risultano:

- PR `#59` mergiata normalmente e CI verde;
- PR `#60` mergiata normalmente e CI verde;
- migration applicata soltanto a staging;
- migration parity e DB validation `PASS`;
- un solo deploy Worker staging;
- source Worker attestata a `1de29124`;
- deployment/version invariati nel recheck finale;
- versione Worker attiva al 100%;
- acceptance secondo run `19/19 PASS`;
- CASE46/CASE48 live `2/2 PASS`;
- HTTP 503, resource failure, server error ed exception `0`;
- forbidden log/diagnostic/audit/durable matches `0`;
- cleanup exact-scope e tutti i residui `0`;
- audit immutabile preservato;
- review `P0/P1/P2/P3 = 0/0/0/0`;
- Admin runtime/tooling main congelato a `d3c674ad`;
- merge documentale finale attestato soltanto nel record GitHub/CI della PR
  documentale e nella final response, non nel README versionato;
- file task ed evidence `TASK-150` indicati con stato
  `DRAFT / PLANNING / NOT_ACTIVE`, non `DONE`, fino al prossimo ciclo;
- production, Win7POS PR `#72`, Android e iOS `NOT_MODIFIED`.

Stato verificato del handoff:

`READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`

Tutti i gate elencati sopra risultano congelati con evidence redatta; la
successiva esecuzione resta subordinata all'attivazione esplicita di TASK-150.
