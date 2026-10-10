# Risposta persa dopo retirement di un child

Il client recupera il fence completo ripetendo il retirement esplicito con lo
stesso `planId` e `partIndex`, mantenendo il journal immutabile e usando la trust
POS corrente. La lettura `receipt` resta priva di effetti: dopo il fence restituisce
`conflict` con `reason: identity_retired`, senza `retiredAt` o
`oldIdentityBlocked`. Questi campi sono assenti, non `null`.

Il primo `retire` e il retry esplicito qui catturati restituiscono HTTP 200,
`status: retired`, `oldIdentityBlocked: true` e lo stesso `retiredAt` persistito:
`2026-10-10T00:00:56.190895+00:00`. I due file di risposta sono identici byte per
byte. Anche la lettura intermedia usa HTTP 200; lo stato tipizzato del body è
`conflict`.

## File e limiti delle catture

- `first-retire.response.json`: risposta trattenuta intenzionalmente al client sintetico.
- `receipt-conflict.response.json`: lettura successiva al fence.
- `exact-retry.response.json`: retry esplicito della stessa identità, con timestamp e byte invariati.
- `child.selector.request.json`: solo selettore, derivato dalle richieste sintetiche; non è un body HTTP completo. Aggiungere la trust POS standard corrente senza alterare il selettore.
- `wire.rule.json`: percorsi, campi presenti/assenti, binding, hash, regola del journal e fonti.
- `sha256-manifest.json`: hash dei file e locator delle tre catture originali.

Le risposte sono copie esatte dei wrapper JSON salvati `{status, body}`: `status`
è lo stato HTTP e `body` contiene il payload di risposta. Non sono state
riserializzate. Shop, device, identità e dataset sono sintetici; nessuna credenziale
è inclusa nei file pubblicati. I request originali, non copiati, hanno SHA256
`d0a2131f5d7c67a4115d5bbdb826be4bb1b49d09fb3e74264c8f98e51b9e4751`
identico per tutte e tre le chiamate. Il selettore è uguale per receipt e retire;
i due percorsi distinguono lettura e mutazione esplicita.

Le chiamate provengono dall'actor `/root/interop_finish`, database isolato
`pos_interop_current_mr9_skipped`, handler congelato `08c6759e...`, parser
`3fd82ff2...`. La perdita della consegna è simulata trattenendo la risposta:
non è una perdita di rete osservata. L'autenticazione esterna è sintetica,
mentre handler e RPC SQL sono reali. Il report finale stretto
`lost-retirement-response-final/multipart-real-db-receipt.json` riporta
`PASS_PLANNED_CHILD_RETIREMENT_LOST_REPLY_EXACT_RETRY`, 24 controlli, concluso
`2026-10-10T00:07:56.692Z`, SHA256
`560c812c85a80069f0ec0d5d88b6de67e44b9f4f34ed73395b34cec75e55e1f3`.
I precedenti report `IN_PROGRESS` restano conservati nelle evidenze private.
Questo risultato riguarda soltanto il caso isolato; non attesta autenticazione
live, caller distribuito, protocollo superiore, rollout o READY.

## Binding e comportamento del client

Confrontare i binding `shopId`, `shopDeviceId`, `planId`, `partIndex`,
`originalSchemaVersion`, `clientImportId`, `idempotencyKey`, `payloadHash` e
`canonicalPayloadHash` con la propria identità immutabile verificata. Il hash
client dichiarato e il hash canonico server hanno ruoli distinti. I child non
aggiungono `verifiedOriginalId` o `parentStatus` a queste risposte.

Non ricavare un fence completo da `not_found`, da un errore HTTP o da un
`conflict` generico. La regola per questa risposta persa è il retry esplicito del
medesimo retirement, senza nuove identità, cancellazione del journal o completion
del parent parziale. Se apply ha già vinto, retire restituisce invece la ricevuta
`accepted` autorevole: riconciliare quel risultato, senza ripetere l'economia.

La funzione base di retirement rilegge la riga del fence esistente sotto gli
stessi lock e restituisce il suo timestamp. Il wrapper multipart deriva
l'identità dal child immutabile dello shop/device corrente, applica root/plan lock
e riautorizza dopo l'attesa. Il selettore non concede permessi e non sostituisce
trust, sessione o `catalog.import` correnti.

## Provenienza SQL

`wire.rule.json` conserva i source pin riportati dal collector: il file SQL nel
loader immutabile è `4b7965d9...`. La guardia del child è stata anche letta
staticamente nel successore SQL `bf274d32...`; il delta MR11 riguarda soltanto
la bijezione del piano. Una ricevuta di caricamento riferita a un database diverso
non viene usata per attribuire il runtime di queste catture.

Il successivo fingerprint read-only dello stesso database, osservato
`2026-10-10T00:09:29.181184+00:00`, conferma che il corpo della funzione corrisponde
al delta congelato bf: source SHA256
`669c5710735e7abc85b1d1dcacce3df32330d1441f1daa38622c142be627526b`.
La ricevuta `lost-retirement-response-final/actual-function-fingerprint.json`
ha SHA256 `977648236b84371ede16275b220c702eaa4bf91b04ca94162a5c83e44de71b5e`.
È un'osservazione dopo le catture, senza invocazione della funzione; non è la
ricevuta originale di caricamento né una provenienza di build o deploy.
