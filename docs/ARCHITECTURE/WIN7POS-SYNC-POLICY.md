# Win7POS sync policy

## Stato

- Task origine: `TASK-026`
- Ultimo aggiornamento: `TASK-084B`
- Stato: `REVIEW`
- Data: `2026-06-01`
- Ambito: catalogo prodotti Shop Admin verso Win7POS.

## Direzioni autorizzate

### Admin Web/Supabase -> Win7POS

- Il catalogo prodotti e autoritativo in Admin Web/Supabase.
- Win7POS comunica solo con Admin Web POS API HTTPS. Admin Web resta il backend/firewall boundary verso Supabase server-side.
- Win7POS puo fare pull read-only da `POST /api/pos/catalog/pull` dopo first login trusted device e heartbeat valido.
- Il pull usa `syncMode: "full_refresh"` senza cursor e `syncMode: "delta"` quando il client invia `updated_since`/`updatedSince` o `syncCursor`.
- La risposta espone `schemaVersion`, `catalogVersion`, `serverTime`, `syncCursor`, `hasMore` e `catalog.tombstones`. La policy documentale usa anche i nomi wire `schema_version` e `catalog_version` per indicare il contratto versione da mantenere quando si evolve il payload.
- La sorgente catalogo viene risolta solo tramite `shop_inventory_sources.shop_id -> owner_user_id`.
- Nel primo pull vengono inviate solo righe attive. Nel delta vengono inviate righe attive aggiornate e tombstone per righe con `deleted_at`.
- Il `sync cursor` e reale: timestamp ISO quando la pagina e completa, cursor opaco `catalog-v1:*` quando `hasMore = true`.
- Win7POS deve reinviare il cursor salvato nel campo `syncCursor`; `updated_since`/`updatedSince` resta solo input timestamp compatibile con client legacy o cursor timestamp.
- Il cursor opaco Admin Web e stateless e offset-based per entity, perche il server fonde righe shop-scoped e legacy `owner_user_id` prima del page slice. `TASK-089` ha misurato EXPLAIN locale e aggiunto indici catalog delta timestamp/id; un eventuale keyset cursor `catalog-v2` resta follow-up compatibile solo se metriche runtime piu grandi lo giustificano.
- TASK-028 consente a Win7POS di applicare tombstone prodotto come stato locale non distruttivo (`is_active = 0`, `remote_deleted_at`) usando `remote_product_id`; nessun purge o `DELETE` fisico e richiesto dal pull.

### Win7POS -> Supabase

- In TASK-026 Win7POS invia solo richieste di autenticazione/heartbeat/catalog pull usando i token trusted gia emessi da Admin Web.
- Win7POS non comunica direttamente con Supabase e non contiene Supabase URL, publishable/anon key, service-role o secret Admin Web.
- Win7POS non invia modifiche catalogo verso Supabase.
- Il futuro invio di vendite o eventi fiscali richiedera un task separato, payload dedicati e `idempotency key` obbligatoria per ogni batch/evento.

## Bootstrap online fresh install

- Da TASK-029, su DB SQLite vuoto Win7POS tenta il bootstrap online prima del wizard locale.
- Il flusso cliente normale usa `POST /api/pos/auth/first-login` con `shopCode`, `staffCode`, PIN/password e nome dispositivo verso Admin Web POS API.
- Da TASK-084B, il flusso operatore normale non mostra un campo URL e non chiede un nome dispositivo editabile. L'Admin Web Base URL arriva da `WIN7POS_ADMIN_WEB_BASE_URL`, da `C:\ProgramData\Win7POS\pos-admin-web.config` con `AdminWebBaseUrl=...`, oppure dal pannello avanzato `Impostazioni avanzate / Server` usato da supporto tecnico.
- Win7POS deve accettare come base URL solo HTTPS pubblico/staging o HTTP loopback locale. URL con path/query/fragment come `/auth/login` o `/shop` non sono validi. HTTP LAN non-loopback richiede solo override development `WIN7POS_ALLOW_INSECURE_LAN_ADMIN_WEB=1` e non va abilitato in release.
- Il nome dispositivo inviato nel first-login e generato automaticamente da hostname locale sanitizzato, senza username, MAC address, serial number o path locali.
- Il trusted device token e il session token sono salvati nel file trusted-device protetti con DPAPI Windows.
- Il PIN/password non viene salvato in chiaro; viene riusato solo per creare un hash/salt locale tramite il meccanismo PIN esistente, cosi il POS puo lavorare offline dopo il bootstrap.
- Il mirror locale staff salva solo mapping e metadata non segreti: shop/staff id/code, role key, credential version e sync metadata.
- `FirstRunSetupDialog` resta disponibile come recovery/dev, non come flusso cliente normale.
- Il client Win7POS limita la lettura del response body Admin Web per evitare memoria non bounded su risposte anomale.

## Editing catalogo da POS

- Editing catalogo da POS: `DEFERRED`.
- Il database SQLite locale Win7POS e una cache operativa del catalogo autorizzato, non la sorgente di verita.
- Creazione, modifica, archiviazione e restore di prodotti/categorie/fornitori restano in Admin Web tramite Server Actions e RPC auditabili `shop_catalog_*`.
- Conflitti: vince Admin Web/Supabase. Il POS deve applicare il pull successivo, non risolvere conflitti localmente.

## Cancellazioni e versioning

- Admin Web usa soft delete tramite `deleted_at` su prodotti/categorie/fornitori.
- Il pull full refresh esclude righe archiviate. Il pull delta include tombstone non distruttive per consentire al client di segnare/ignorare righe non piu attive senza svuotare il catalogo locale.
- Il restore Admin Web e un'azione esplicita e auditata. Non e una resurrezione implicita da import o pull POS.
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
