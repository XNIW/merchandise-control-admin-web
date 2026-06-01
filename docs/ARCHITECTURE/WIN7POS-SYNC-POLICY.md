# Win7POS sync policy

## Stato

- Task origine: `TASK-026`
- Ultimo aggiornamento: `TASK-027`
- Stato: `DONE_RECONCILED`
- Data: `2026-06-01`
- Ambito: catalogo prodotti Shop Admin verso Win7POS.

## Direzioni autorizzate

### Admin Web/Supabase -> Win7POS

- Il catalogo prodotti e autoritativo in Admin Web/Supabase.
- Win7POS puo fare pull read-only da `POST /api/pos/catalog/pull` dopo first login trusted device e heartbeat valido.
- Il pull usa `syncMode: "full_refresh"` senza cursor e `syncMode: "delta"` quando il client invia `updated_since`/`updatedSince` o `syncCursor`.
- La risposta espone `schemaVersion`, `catalogVersion`, `serverTime`, `syncCursor`, `hasMore` e `catalog.tombstones`. La policy documentale usa anche i nomi wire `schema_version` e `catalog_version` per indicare il contratto versione da mantenere quando si evolve il payload.
- La sorgente catalogo viene risolta solo tramite `shop_inventory_sources.shop_id -> owner_user_id`.
- Nel primo pull vengono inviate solo righe attive. Nel delta vengono inviate righe attive aggiornate e tombstone per righe con `deleted_at`.
- Il `sync cursor` e reale: timestamp ISO quando la pagina e completa, cursor opaco `catalog-v1:*` quando `hasMore = true`.
- Win7POS deve reinviare il cursor salvato nel campo `syncCursor`; `updated_since`/`updatedSince` resta solo input timestamp compatibile con client legacy o cursor timestamp.

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
- Il pull full refresh esclude righe archiviate. Il pull delta include tombstone non distruttive per consentire al client di segnare/ignorare righe non piu attive senza svuotare il catalogo locale.
- Ogni evoluzione payload dovra incrementare `schema_version`/`schemaVersion` e mantenere compatibilita Win7POS o un percorso di migrazione.
- Il `sync cursor` non deve essere usato per saltare righe se il server dichiara `full_refresh`; in `delta` il lower bound e inclusivo per tollerare collisioni timestamp con upsert idempotente.

## Esclusioni

- TASK-024 sales sync resta deferred.
- Non esistono in TASK-026 sync vendite, pagamenti, chiusure cassa, import vendite o dashboard vendite.
- Nessuna service role key o chiave segreta deve essere presente in Win7POS o nel browser.
- Nessun dato reale, token o password deve essere hardcoded.

## Audit e sicurezza

- L'endpoint catalog pull scrive audit `pos.catalog.pull.success` o `pos.catalog.pull.failure`.
- I metadata audit sono redatti e non includono token o cursor opachi completi; la diagnostica puo esporre solo una preview.
- Le verifiche trusted device restano server-side: sessione POS, device credential, staff, shop attivo e mapping inventory devono essere coerenti.
