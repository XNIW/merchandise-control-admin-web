# Win7POS POS article mutation v1 handoff

## Stato

- Contratto Admin: `pos-article-mutation-v1`
- Endpoint: `POST /api/pos/catalog/article-mutations`
- Task Admin: `TASK-145`
- Stato consegna: `EXECUTION` fino a merge, deploy staging e acceptance reale
- Win7POS: non modificato
- Android/iOS: non modificati
- Production: non modificata

Questa consegna abilita il successivo lavoro Win7POS. Non costituisce
accettazione finale e non porta il task a `DONE`.

## Boundary di fiducia

Ogni richiesta deve contenere:

- `schemaVersion = pos-article-mutation-v1`;
- `appVersion`;
- `shopId`, `shopDeviceId`, `staffId`, `staffCredentialVersion`;
- `posSessionId`;
- `deviceToken` e `sessionToken`;
- da 1 a 25 mutazioni.

Il Worker verifica entrambi i token contro il runtime lease. La RPC
`pos_article_mutation_apply_v1` riacquisisce nello stesso commit:

- shop, device, credential, session e staff attivi;
- credential version corrente;
- permesso `shop_admin.full_access`, `catalog.write` o `catalog.manage`;
- catalog scope autorizzato.

La route non espone il client service-role e non scrive direttamente tabelle.

## Identità immutabile

Ogni elemento di `mutations` usa:

- `mutationId`: identità logica immutabile;
- `idempotencyKey`: chiave immutabile e indipendente;
- `payloadHash`: SHA-256 canonico dell'intento immutabile;
- `attemptToken`: identifica solo il tentativo di trasporto corrente;
- `mutationKind`;
- `clientProductId`: identità locale stabile;
- `remoteProductId`: obbligatorio per ogni mutazione non-create;
- `baseRevision`: obbligatoria per ogni mutazione non-create;
- `localSequence`: monotona per `clientProductId`;
- `fieldMask`: solo per `product_update`;
- `changes`: solo i valori intenzionalmente modificati;
- `createdAt` e `occurredAt`.

`attemptToken` è escluso dal payload canonico. Un retry può quindi usare un
nuovo attempt token senza cambiare l'identità della mutazione. Il server
restituisce comunque l'ACK originario persistito, incluso l'originale
`attemptToken`.

Il payload canonico, nell'ordine sotto, è:

```json
{
  "baseRevision": null,
  "changes": {},
  "clientProductId": "...",
  "createdAt": "...",
  "fieldMask": [],
  "idempotencyKey": "...",
  "localSequence": 1,
  "mutationId": "...",
  "mutationKind": "...",
  "occurredAt": "...",
  "remoteProductId": null
}
```

La serializzazione usa JSON compatto UTF-8, proprietà nell'ordine mostrato e
`fieldMask` ordinata lessicograficamente. `payloadHash` è
`sha256:` seguito da 64 caratteri esadecimali minuscoli.

## Operazioni supportate

| `mutationKind` | Target/base | `changes` |
| --- | --- | --- |
| `product_create` | target e base `null`; sequence `1` | barcode e primaryName obbligatori; itemNumber, secondaryName, categoryId, supplierId, prezzi e stock opzionali |
| `product_duplicate` | sorgente remota + base; nuovo clientProductId sequence `1` | nuovo barcode obbligatorio; override descrittivi/relazioni opzionali |
| `product_update` | target remoto + base | chiavi esattamente uguali a `fieldMask` |
| `product_activate` | target remoto tombstonato + base | oggetto vuoto |
| `product_deactivate` | target remoto attivo + base | oggetto vuoto |
| `product_retail_price_change` | target attivo + base | `{ "price": number }` |
| `product_purchase_price_change` | target attivo + base | `{ "price": number }` |
| `product_manual_stock_adjustment` | target attivo + base | delta non-zero e reason code bounded |

Campi ammessi in `product_update`:

- `barcode`;
- `itemNumber`;
- `primaryName`;
- `secondaryName`;
- `categoryId`;
- `supplierId`.

Un valore `null` su item number, secondary name, category o supplier significa
clear esplicito. Un campo omesso resta invariato. Prezzi e stock usano le
operazioni dedicate.

Reason stock:

- `count_correction`;
- `damage`;
- `loss`;
- `found`;
- `return_to_stock`;
- `transfer`;
- `other`.

## Concorrenza e risoluzione identità

`baseRevision` è la revisione prodotto UTC a sei cifre frazionarie restituita
dall'ACK precedente, per esempio `2026-07-28T06:45:00.123456Z`.

- Base corrente: mutazione applicabile.
- Base stale: `failed_conflict`, senza last-write-wins.
- Target assente: `target_not_found`.
- Barcode duplicato o client/remote identity incoerente:
  `identity_conflict`.
- Non esiste fallback barcode per una mutazione che dichiara un target remoto.
- `product_duplicate` restituisce sempre un nuovo `remoteProductId`.

## ACK e replay

Ogni risultato contiene:

- `deliveryStatus`;
- l'oggetto `ack` con mutation/idempotency/hash/attempt;
- `status` e `code`;
- `terminal` e `retryable`;
- `remoteProductId`;
- eventuale `priceHistoryId` o `stockMovementId`;
- `authoritativeRevision`;
- `catalogRevision`;
- `serverTimestamp`.

Codici:

- `applied`;
- `duplicate_replay` come delivery status, con ACK originario invariato;
- `failed_validation`;
- `failed_conflict`;
- `failed_auth`;
- `retryable_upstream`;
- `target_not_found`;
- `identity_conflict`;
- `idempotency_payload_mismatch`.

`retryable_upstream` non è un receipt terminale: Win7POS può ritentare la stessa
mutazione con un nuovo `attemptToken`. Validation e conflict deterministici
restano terminali; una fence lease SQLSTATE `42501` è `failed_auth`, mai un
errore transitorio. Per tutti i codici terminali una modifica successiva
richiede nuovo `mutationId`, nuovo `idempotencyKey`, hash aggiornato e sequence
successiva.

Le collisioni `identity_conflict` e `idempotency_payload_mismatch` non
modificano la receipt applicata originaria. Hanno una receipt di conflitto
append-only separata, indicizzata da fingerprint SHA-256 dell'intento rifiutato:
un replay con un nuovo `attemptToken` restituisce lo stesso ACK originario e
non duplica l'audit redatto né può applicare tardivamente la mutazione.

## Prezzi, stock e publication

Una price mutation aggiorna il prezzo autoritativo e inserisce esattamente una
riga in `inventory_product_prices`. `effective_at`/`created_at` conservano il
formato legacy canonico `YYYY-MM-DD HH:mm:ss`; mutazioni distinte nello stesso
secondo ricevono, sotto lock prodotto, il primo slot libero bounded successivo.
Replay e collisioni non duplicano history e il preflight catalogo resta
leggibile.

Lo stock manuale riusa `pos_sale_stock_movements` con:

- `movement_kind = manual_adjustment`;
- `pos_article_mutation_id`;
- `pos_sale_id = null`;
- `pos_sale_line_id = null`.

Non viene creata alcuna vendita, sale line o revenue-ledger entry.

Catalog DML, history/movement, trigger `sync_events`, catalog revision, receipt,
audit e ACK sono nella stessa transazione. Una revoca o scadenza prima della
publication finale fa rollback dell'intera mutazione.

## Cleanup QA staging

`pos_article_mutation_cleanup_synthetic_v1(shopId, runId)` è eseguibile solo
dal service role ed esclusivamente quando codice e nome shop sono esattamente
`TASK145QA_<RUN_ID>`. Fallisce se rileva catalog identities fuori marker,
movement sales-origin, vendite o revenue. In una sola transazione elimina
receipt applicate e di conflitto, movement manuali, price history, prodotti,
category/supplier, eventi sync e revisioni del solo shop sintetico. Le righe
audit non vengono eliminate: viene aggiunto un audit con run ID hashato e soli
conteggi bounded.

## Fixture

- Request:
  `contracts/pos/article-mutation-v1.request.json`
- Response:
  `contracts/pos/article-mutation-v1.response.json`
- Request SHA-256:
  `deaf2948dd65bfc84da93957b571097cb967ab0023c923b6dc389ee74ebcc137`
- Response SHA-256:
  `8b03c0a6110c752feaec86c45c8f4fc22dcc6e2d3dfcf629d894e444e01dc02f`

Le fixture contengono esclusivamente identificativi e token sintetici non
validi.

## Indicazioni per Win7POS

1. Conservare durable outbox e `clientProductId`.
2. Creare mutation/idempotency identity una sola volta per edit.
3. Ricalcolare il payload hash solo per una nuova mutazione.
4. Generare un nuovo attempt token per ogni invio/retry.
5. Applicare il mapping remoto dall'ACK, mai da una ricerca barcode locale.
6. Aggiornare la base revision solo da ACK autoritativo o catalog pull.
7. Su `failed_conflict`, eseguire pull/merge esplicito e generare una nuova
   mutazione; non rispedire un overwrite cieco.
8. Su `duplicate_replay`, trattare l'ACK originario come definitivo.
9. Su `retryable_upstream`, conservare mutation ID, idempotency key e hash.

## Gate prima dell'implementazione Win7POS

Il via libera arriva solo dopo:

- PR Admin non-draft con CI verde e merge normale;
- migrazione applicata solo a staging;
- un solo deploy Worker staging successivo al merge di entrambe le PR Admin;
- acceptance sintetica reale con cleanup verificato;
- handoff finale `READY_FOR_ASUS_ARTICLE_SYNC_AND_FINAL_ACCEPTANCE`.
