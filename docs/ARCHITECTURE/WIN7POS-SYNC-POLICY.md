# Win7POS sync policy

## Stato

- Task origine: `TASK-026`
- Stato: `DONE_WITH_NOTES`
- Data: `2026-06-01`
- Ambito: catalogo prodotti Shop Admin verso Win7POS.

## Direzioni autorizzate

### Admin Web/Supabase -> Win7POS

- Il catalogo prodotti e autoritativo in Admin Web/Supabase.
- Win7POS puo fare pull read-only da `POST /api/pos/catalog/pull` dopo first login trusted device e heartbeat valido.
- Il pull usa `syncMode: "full_refresh"` e `schemaVersion` nella risposta JSON. La policy documentale usa il nome wire `schema_version` per indicare il contratto versione schema da mantenere quando si evolvera il payload.
- La sorgente catalogo viene risolta solo tramite `shop_inventory_sources.shop_id -> owner_user_id`.
- Le righe con `deleted_at` non vengono inviate: il catalogo applica soft delete lato Admin Web.
- Il `sync cursor` iniziale e il massimo `updated_at` del catalogo inviato; serve come base per un futuro delta sync, non come garanzia di incremental sync gia attiva.

### Win7POS -> Supabase

- In TASK-026 Win7POS invia solo richieste di autenticazione/heartbeat/catalog pull usando i token trusted gia emessi da Admin Web.
- Win7POS non invia modifiche catalogo verso Supabase.
- Il futuro invio di vendite o eventi fiscali richiedera un task separato, payload dedicati e `idempotency key` obbligatoria per ogni batch/evento.

## Editing catalogo da POS

- Editing catalogo da POS: `DEFERRED`.
- Il database SQLite locale Win7POS e una cache operativa del catalogo autorizzato, non la sorgente di verita.
- Creazione, modifica e archiviazione di prodotti/categorie/fornitori restano in Admin Web tramite Server Actions e RPC auditabili `shop_catalog_*`.
- Conflitti: vince Admin Web/Supabase. Il POS deve applicare il pull successivo, non risolvere conflitti localmente.

## Cancellazioni e versioning

- Admin Web usa soft delete tramite `deleted_at` su prodotti/categorie/fornitori.
- Il pull full refresh esclude righe archiviate; Win7POS non riceve istruzioni distruttive separate in TASK-026.
- Ogni evoluzione payload dovra incrementare `schema_version`/`schemaVersion` e mantenere compatibilita Win7POS o un percorso di migrazione.
- Il `sync cursor` non deve essere usato per saltare righe se il server dichiara `full_refresh`.

## Esclusioni

- TASK-024 sales sync resta deferred.
- Non esistono in TASK-026 sync vendite, pagamenti, chiusure cassa, import vendite o dashboard vendite.
- Nessuna service role key o chiave segreta deve essere presente in Win7POS o nel browser.
- Nessun dato reale, token o password deve essere hardcoded.

## Audit e sicurezza

- L'endpoint catalog pull scrive audit `pos.catalog.pull.success` o `pos.catalog.pull.failure`.
- I metadata audit sono redatti e non includono token.
- Le verifiche trusted device restano server-side: sessione POS, device credential, staff, shop attivo e mapping inventory devono essere coerenti.
