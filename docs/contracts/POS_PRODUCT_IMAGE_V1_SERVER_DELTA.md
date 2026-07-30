# POS product image v1 — delta server

Versione schema POS: `pos-product-image-v1`

Contratto portabile riusato:
`merchandise-control.product-image.v1`, versione `1`.

SHA-256 canonico del contratto portabile:
`b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`.

Questo documento definisce esclusivamente il delta trusted server/POS
necessario alla Phase B Win7POS. Non modifica il contratto portabile
`contracts/product-image-v1.json`, le route Shop Admin, il comportamento Admin
o mobile, né la foundation offline Phase A di Win7POS.

La definizione machine-readable e le fixture sintetiche sono in
`contracts/pos-product-image-v1/`.

## Endpoint

Tutti gli endpoint accettano soltanto `POST` JSON bounded e rispondono con
`Cache-Control: no-store`.

Anche gli errori di trasporto, envelope, autenticazione e dominio usano
`schemaVersion`, l'operazione determinata dal path, un timestamp server
canonico e un `requestId` safe. Un `clientRequestId` safe viene riflesso solo
quando fornito; nessun token, URL, path o body entra nell'errore.

| Operazione | Endpoint | Permesso equivalente |
|---|---|---|
| `intent` | `/api/pos/catalog/product-images/intent` | `products.write` |
| `finalize` | `/api/pos/catalog/product-images/finalize` | `products.write` |
| `read-urls` | `/api/pos/catalog/product-images/read-urls` | `products.read` |
| `remove` | `/api/pos/catalog/product-images/remove` | `products.write` |

Un bearer token Supabase browser non è un'autenticazione valida per questi
endpoint.

## Trusted runtime envelope

Ogni request contiene:

- `schemaVersion`, esattamente `pos-product-image-v1`;
- `appVersion`, stringa non vuota senza control character, massimo 80
  caratteri;
- `shopId`;
- `shopDeviceId`;
- `staffId`;
- `staffCredentialVersion`, intero positivo bounded;
- `posSessionId`;
- `deviceToken`;
- `sessionToken`.

Le mutazioni `intent`, `finalize` e `remove` contengono inoltre:

- `operation`, coerente con l'endpoint;
- `operationId`;
- `idempotencyKey`;
- `payloadHash`;
- `productId`;
- `expectedCurrentVersionId`.

`read-urls` è una lettura effimera: il path determina l'operazione, usa `refs`
e non contiene `operation`, `operationId`, `idempotencyKey` o `payloadHash`.
Non crea una receipt durevole.

Il server verifica fail-closed, prima di importare il dominio immagini:

1. metodo, dimensione body, JSON ed exact shape;
2. schema e limiti dell'envelope;
3. device, session, token e active runtime lease;
4. shop esatto;
5. staff attivo e credential version esatta;
6. permesso read/write richiesto.

Le mutazioni rifermano lease, identità e permesso nella transazione
autoritative finale. Nessun dato validato soltanto dal client decide shop,
attore o path Storage.

### Compatibilità `appVersion`

`appVersion` è telemetry/capability context bounded, non una chiave
idempotente e non una versione semantica imposta dal server. Una nuova stringa
client conforme ai limiti non viene rifiutata soltanto perché sconosciuta.
Il comportamento wire è determinato da `schemaVersion`. Un cambiamento
incompatibile richiede una nuova versione schema.

`appVersion` non entra nel payload hash, nelle URL firmate o nell'outcome
durevole. Audit e metriche possono registrare soltanto la sua presenza o una
classe redatta.

## Payload hash canonico

Il formato è:

```text
sha256:<64 caratteri esadecimali minuscoli>
```

L'input del digest è UTF-8 di un oggetto JSON compatto, senza whitespace,
costruito dal server con l'ordine di chiavi definito sotto. Non si calcola il
digest serializzando direttamente l'intera request ricevuta.

Campi sempre esclusi:

- `operationId`;
- `idempotencyKey`;
- `payloadHash`;
- `appVersion`;
- `shopDeviceId`;
- `staffId`;
- `staffCredentialVersion`;
- `posSessionId`;
- `deviceToken`;
- `sessionToken`;
- qualsiasi URL, capability o path.

Gli UUID della proiezione sono canonicalizzati in lowercase prima del digest.
I numeri metadata devono essere interi validati. `mimeType` è esattamente
`image/jpeg`; gli SHA dei JPEG sono 64 caratteri esadecimali minuscoli.

### `intent`

Ordine top-level:

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

Proiezione:

```json
{"schemaVersion":"pos-product-image-v1","operation":"intent","shopId":"...","productId":"...","expectedCurrentVersionId":"... oppure null","main":{"bytes":0,"height":0,"mimeType":"image/jpeg","sha256":"...","width":0},"thumb":{"bytes":0,"height":0,"mimeType":"image/jpeg","sha256":"...","width":0}}
```

### `finalize`

Ordine:

```text
schemaVersion
operation
shopId
productId
expectedCurrentVersionId
versionId
```

### `remove`

Ordine:

```text
schemaVersion
operation
shopId
productId
expectedCurrentVersionId
```

Per `remove`, `expectedCurrentVersionId` è la versione da rimuovere.

### `read-urls`

`read-urls` non ha un payload hash normativo. L'ordine dei `refs` viene
preservato nella risposta. Ogni ref usa le chiavi
`productId`, `versionId`, `variant`.

## Idempotenza e receipt

La receipt mutativa è privata, shop-scoped e accessibile soltanto al boundary
server service-role.

- stesso scope + stesso `operationId` + stesso `payloadHash`: restituisce
  l'outcome durevole originario;
- stesso scope + stesso `operationId` + hash diverso: fallisce closed senza
  DML;
- riuso incompatibile di `idempotencyKey`: fallisce closed senza DML;
- finalize replay non promuove o supersede una seconda volta;
- remove replay non elimina una versione successiva;
- il confronto avviene prima di qualunque nuova mutazione autorevole.

Lo scope della receipt comprende almeno schema, operation, shop e identità
trusted staff/device/session. Il support/audit identity può essere
fingerprinted, ma l'attore autorevole resta lo staff POS reale: non viene
creato o simulato un profilo web.

Una receipt può conservare soltanto fatti bounded necessari al replay, per
esempio:

- operation kind e identità idempotente;
- payload hash;
- shop/product/version identity;
- expected/current version identity;
- status e safe code;
- image/catalog timestamp;
- cleanup status;
- timestamp server.

Una receipt non conserva mai:

- `deviceToken` o `sessionToken`;
- credential material;
- signed upload/read URL;
- Storage object path;
- request body raw;
- exception text non redatto.

Le URL sono capability effimere e non fanno parte dell'identità o
dell'outcome persistito. Un replay `intent` può rifirmare la stessa versione
soltanto mentre l'intent DB originario è ancora valido e dopo una nuova
verifica trusted. Dopo la scadenza, il client deve inviare un nuovo intent con
nuovi `operationId` e `idempotencyKey`. Ogni `read-urls` autorizzata genera
una nuova read lease.

## Compare-and-swap

- `intent` accetta `expectedCurrentVersionId: null` soltanto quando il
  prodotto non ha un'immagine corrente; per replacement richiede la versione
  corrente esatta.
- `finalize` ripete l'expected version dell'intent. La versione pending
  conserva il fence autorevole; la promotion fallisce se l'immagine corrente
  è cambiata.
- `remove` richiede come `expectedCurrentVersionId` la versione corrente da
  rimuovere.

Il CAS è verificato nello stesso boundary transazionale che pubblica
versione, riferimento prodotto, image timestamp e catalog revision.
Un conflitto non elimina oggetti appartenenti a una versione più nuova.

## Operazioni

### Intent

Il client invia soltanto metadata JPEG strict per `main` e `thumb`; non invia
path. Il server:

1. verifica trusted runtime e `products.write`;
2. verifica prodotto/shop e CAS;
3. deriva versione immutabile e path canonici dal database;
4. registra un intent DB bounded;
5. crea capability upload per i due path;
6. rifirma autorizzazione prima della risposta.

`main` è `image/jpeg`, massimo 1 MiB e lato massimo 1600. `thumb` è
`image/jpeg`, massimo 90 KiB e lato massimo 384. I restanti vincoli JPEG,
pixel, metadata, rapporto e compressione sono quelli invariati di
`product-image-v1`.

La capability signed-upload del provider può durare fino a 7200 secondi.
`expiresAt` è il limite autorevole dell'intent DB, non autorizza finalize oltre
la sua scadenza e non può superare la capability. Il server verifica
nuovamente l'expiry DB durante finalize.

### Finalize

Il server scarica entrambi gli oggetti dai path DB e verifica
indipendentemente MIME, byte, hash, dimensioni, JPEG canonico e rapporto.
Soltanto dopo la verifica promuove atomicamente la versione, supersede la
precedente, aggiorna i campi immagine prodotto e pubblica la catalog revision.
Un errore preserva la precedente immagine valida e lascia cleanup failed
tracciabile.

### Read URLs

- batch da 1 a 16 ref;
- ref bound a shop/product/version/variant;
- soltanto versioni leggibili secondo stato e policy;
- response JSON massima 64 KiB;
- signed read URL TTL esatto: 300 secondi;
- ordine response uguale all'ordine request;
- URL soltanto nella risposta HTTPS no-store.

Una URL read non entra in log, audit, receipt, catalogo, eccezione o cache key.

### Remove

Il server esegue CAS, azzera il riferimento corrente, aggiorna
`primary_image_updated_at`, marca la versione rimossa e pubblica la catalog
revision nella stessa mutazione autorevole. Elimina esclusivamente path
canonici ritornati dal database. Un delete Storage fallito produce cleanup
`pending` senza alterare una versione successiva.

## Catalogo POS

Il prodotto attivo full e delta aggiunge:

```text
primaryImageVersionId: string | null
primaryImageUpdatedAt: canonical timestamp | null
```

Semantica:

| Stato | `primaryImageVersionId` | `primaryImageUpdatedAt` |
|---|---|---|
| mai avuta immagine | `null` | `null` |
| immagine corrente | UUID versione | timestamp canonico |
| immagine rimossa | `null` | nuovo timestamp canonico |

La combinazione UUID + timestamp nullo è invalida. Replacement e remove
aggiornano la revision prodotto/catalogo, quindi compaiono nel delta.

Il payload catalogo non contiene URL, object path, hash, byte, dimensioni o
metadata immagine. I campi sono additivi: i client storici che non li
conoscono continuano a elaborare il prodotto. Paging, summary, exactness e
assenza di business cap restano quelli di `pos-catalog-v2`.

## Storage, audit e cold path

- bucket `product-images` privato;
- MIME oggetto `image/jpeg`;
- limite hard 1 MiB per oggetto;
- path derivati dal database;
- RLS forced sulle versioni;
- nessuna grant tabella a `anon` o `authenticated`;
- mutation e receipt soltanto via server service-role;
- nessun secret, URL o path in log/audit/evidence.

Method denial, JSON malformed, envelope denial e auth denial non caricano
Storage o validazione JPEG. Le route usano una guardia leggera, poi il trusted
runtime boundary bounded; il dominio immagini viene importato dinamicamente
soltanto dopo autorizzazione.

Il catalog pull non importa Storage, JPEG o librerie immagine e continua a
usare il client RPC bounded quando sufficiente.

## Errori e retry

Classi principali:

- malformed/schema: `validation_failed`, non retryable senza correzione;
- auth/lease: `auth_denied` o `permission_denied`;
- CAS: `expected_version_conflict`, richiede nuovo catalog pull;
- idempotenza: `idempotency_conflict`, non retryable con lo stesso ID;
- intent scaduto: `intent_expired`, richiede un nuovo intent;
- oggetto/metadata/JPEG: safe validation code, nessuna promotion;
- Storage transient: `storage_unavailable`, retry bounded senza commit;
- backend transient: `backend_unavailable`, retry bounded;
- signed read URL scaduta: nuova `read-urls`.

I messaggi non includono request body, URL, path, token o identificatori
privati non necessari.

## Compatibilità congelata

- `contracts/product-image-v1.json`: byte-identico e SHA invariato;
- route `/api/shop/product-images/*`: autenticazione e comportamento
  invariati;
- Admin Web image UX: invariata;
- Android: invariato;
- iOS: invariato;
- Win7POS main e draft PR `#72` Phase A: invariati e read-only per TASK-149;
- production: non modificata.

Questo delta abilita soltanto il server staging necessario al successivo
client Win7POS Phase B.
