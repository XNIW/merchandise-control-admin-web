# Creazione indirizzo con intento durevole — v3

Delta aggiuntivo autorizzato dal mandato Client TASK-054 dell'8 ottobre 2026.
Non modifica le tre migration commerce canoniche né il contratto v2 di modifica,
lettura, default o cancellazione. Gli indirizzi appartengono all'account e non a
uno shop; il Client mantiene separatamente il proprio fence account/shop.

## Contratto

- `customer_address_create_v3(p_intent_id uuid, p_payload jsonb)` crea o recupera
  un indirizzo. Il Client genera l'UUID una sola volta e lo conserva prima di
  inviare la prima richiesta; conserva anche il payload immutabile protetto.
- `customer_address_create_reconcile_v3(p_intent_id uuid)` recupera l'esito senza
  ripetere il payload. Nessun replay automatico con un nuovo UUID è ammesso.
- Entrambe restituiscono `apiVersion: customer-address.v3`. `ok` include
  `address`, con il DTO corrente `customer-address.v2`, e `serverTime`.
- `not_found` nella riconciliazione significa nessun commit visibile per
  quell'account/intento dopo avere acquisito lo stesso lock della creazione.
  Un invio ritardato può ancora arrivare: ogni successivo invio conserva lo stesso
  UUID, quindi non genera un secondo indirizzo.
- `intent_conflict` significa che un intento già completato ha un payload
  JSONB diverso. Ordine delle chiavi e spazi sintattici JSON non contano; i valori
  non sono normalizzati dal deduplicatore. Il Client ripete gli stessi valori.
  Nessuna modifica, default o nuova creazione segue questo esito.
- `deleted` significa che l'intento completato punta a un indirizzo poi rimosso.
  Nessun replay lo ricrea; non viene restituito uno snapshot storico con PII.
- `invalid` rifiuta una richiesta malformata. Un payload rifiutato prima della
  creazione non riserva l'intento.

Le risposte `ok` recuperano l'indirizzo corrente: una modifica v2 successiva può
cambiare versione e contenuto, ma il canonical ID dell'intento resta lo stesso.
Due UUID diversi possono creare due indirizzi con campi uguali.

## Atomicità, autorizzazione e privacy

La chiave privata `(owner_user_id, intent_id)` e il lock transazionale
`customer-address:<owner>` serializzano creazione, replay e riconciliazione.
Il lock è quello già usato dalla mutazione v2; il record intento e l'indirizzo
sono confermati nella stessa transazione. Il replay non aggiorna versione,
`updated_at` o default e non ripete gli effetti della creazione.

Ogni richiesta richiede un account non anonimo, non eliminato, non sospeso e
una riga `auth.sessions` appartenente all'account e non scaduta, riconosciuta
tramite `session_id` del JWT. Una sessione revocata non può recuperare PII dal
ledger. Non si accettano owner o shop dal payload.

Il ledger vive in `app_private`, con RLS abilitata e forzata e nessuna grant
client. Contiene solo owner, UUID intento, hash SHA-256 del JSONB, canonical UUID
indirizzo e data di creazione. Non duplica campi indirizzo, telefono o payload.
Il canonical UUID resta come tombstone dopo la cancellazione dell'indirizzo;
la cancellazione dell'account elimina anche il ledger tramite FK cascade.

Il Client protegge la bozza secondo il proprio journal cifrato; una risposta
tardiva non può aggiornare una sessione o un contesto shop successivo. Dopo un
esito ambiguo la bozza non viene trasformata in una nuova creazione alla cieca.
Una modifica del contenuto richiede prima la riconciliazione e, se confermata,
la modifica v2 del canonical ID con la versione corrente.

## Gate

La regressione SQL copre risposta persa, replay, payload diverso, intenti distinti,
modifica successiva, cancellazione, account, sessioni, grants e privacy. Il runner
`scripts/testing/customer-address-create-intent-v3.py` verifica due connessioni
realmente concorrenti, osservando l'attesa sul lock prima del commit iniziale.
Accetta solo un container locale `network=none` e un database dedicato
`task054_address_*`; non opera sul target condiviso.

Il deploy TEST richiede review indipendente, apply coordinato del delta aggiuntivo
dopo le tre canoniche, readback firme/grants e smoke Client autenticato. Le prove
locali non stabiliscono questi gate live.
