# DEC-002 — Mini Program Excel import decision gate

- Stato: `DEFERRED`
- Decisione: `EXCEL_IMPORT_DEFERRED_BY_DECISION_GATE`
- Ambito: WECHAT-003 / WMP-021
- Data verifica: 2026-08-12
- Owner del boundary: MerchandiseControl Admin Web

## Decisione

WECHAT-003 non espone import Excel nel WeChat Mini Program. Non devono essere
aggiunti route/API Mini, pulsanti, wizard parziali, placeholder o flussi simulati
per Excel.

Il parser e il flusso preview/apply Admin sono canonici e maturi, ma allo stato
attuale non sono riutilizzabili tramite un adapter Mini piccolo e sottile. La
causa principale non e il parsing del workbook: sono il boundary di
autenticazione, l'iniezione del contesto autorizzato, l'envelope di risorse per
un upload pubblico e il recupero dopo apply parziali o indeterminati.

Questa decisione non riduce lo scope CRUD catalogo di WECHAT-003 e non autorizza
un parser alternativo nel client Mini.

## Componenti canonici riutilizzabili in futuro

| Capacita | Implementazione canonica |
| --- | --- |
| Parsing server-side `.xlsx`, BIFF `.xls` e HTML-Excel | `src/server/shop-admin/import-export-workbook.ts` con `@e965/xlsx`, `read-excel-file`, fallback OOXML e `unzipper-esm` |
| Alias, rilevamento header, normalizzazione e validazione righe | `src/server/shop-admin/catalog-import-contract.ts` e `src/lib/catalog-text-policy.ts` |
| Preview e apply | `parseCatalogWorkbookPreview` e `applyCatalogWorkbookImport` in `src/server/shop-admin/import-export-workbook.ts` |
| Guard upload Admin | `src/server/shop-admin/import-export-route-guard.ts` e route `src/app/shop/import-export/{preview,apply}/route.ts` |
| Permesso | `catalog.import` in `src/server/shop-admin/permissions.ts`; owner e manager autorizzati, viewer escluso |
| Digest e protezione preview/apply | digest SHA-256 legato a shop e mapping, fingerprint righe, `previewDigest` e `syncPreviewDigest` |
| Concorrenza prodotti esistenti | update con `expectedUpdatedAt` attraverso il boundary revision-guarded |
| Idempotenza apply | receipt lookup/claim/complete in `supabase/migrations/20260812010000_cross_platform_product_revision_guard.sql` e wrapper server-only in `src/server/shop-admin/staff-web-lease-bound-rpc.ts` |
| Audit e History Entry | audit preview/apply e `upsertSupplierImportHistoryEntry` in `src/server/shop-admin/history-mutations.ts` |
| Convergenza sync | trigger statement-level e aggregazione canonica in `supabase/migrations/20260722013109_cross_platform_sync_event_completeness.sql`; `src/server/shop-admin/sync-event-writer.ts` resta una facade compatibile intenzionalmente no-op |

I limiti applicativi correnti includono 5 MiB per upload, 80.000 righe
importabili, massimo 5.000 righe complessive supplier/category, 500 righe di
preview/modifica, 64 KiB per gli adjustment e 8 KiB per il mapping override. Gli
apply bulk sono suddivisi in chunk da 500 prodotti e 1.000 prezzi.

## Perche il gate non passa

### 1. Boundary Auth non compatibile con un adapter sottile

Le API Mini correnti ricevono un bearer token e lo inoltrano a RPC WeChat
allowlisted tramite `src/server/wechat/user-rpc.ts`. Il flusso Excel, invece,
risolve cookie SSR o sessioni staff tramite `resolveShopActionContext`.

La differenza non e limitata alla route iniziale. Preview/apply, audit e ogni
mutazione annidata di prodotto, supplier o categoria risolvono nuovamente il
contesto Admin. Una route Mini che invocasse direttamente le funzioni esistenti
non avrebbe una sessione cookie valida e fallirebbe chiusa con
`no_active_session`/`session_expired`.

### 2. Il receipt privilegiato richiede un actor risolto dal server

Le RPC `admin_catalog_import_receipt_lookup_v1`,
`admin_catalog_import_receipt_claim_v1` e
`admin_catalog_import_receipt_complete_v1` sono service-role-only. Il loro
contratto si fida di `actor_id`, `actor_kind` e `shop_id` forniti dal boundary
server gia autorizzato.

Un endpoint Mini non puo copiare questi campi dal client. Deve prima validare il
bearer token e ricalcolare server-side profilo personale, shop attivo,
membership, ruolo e permesso `catalog.import`, senza concedere accesso shop
implicito a un platform admin.

### 3. Envelope risorse insufficiente per un nuovo upload pubblico

Le route Admin verificano origine, multipart, `Content-Length`, dimensione file
e tipo prima di leggere i byte. Mancano tuttavia, per una nuova superficie Mini
esposta a Internet:

- limite sull'espansione non compressa ZIP e sul numero/dimensione delle entry;
- limiti autorevoli su sheet, celle e testo materializzato prima del parsing;
- deadline/cancellazione applicativa per preview e apply;
- rate limit applicativo verificato per actor/shop/IP;
- contratto bounded per correlation ID e telemetria privacy-safe.

Il limite di 80.000 righe viene applicato dopo decompressione e materializzazione
del workbook. Il runbook Cloudflare propone 6 POST/min/IP per preview/apply, ma
documenta anche che nessuna regola WAF/rate-limit e attiva per assenza di una
zone configurata. Quel suggerimento non costituisce un controllo runtime.

### 4. Apply idempotente ma non atomico end-to-end

Il receipt impedisce il doppio apply concorrente della stessa richiesta e
consente il replay di un risultato completato. L'orchestrazione completa resta
pero composta da piu transazioni: supplier/category, chunk prodotti, chunk
prezzi, audit finale e History Entry.

Un arresto dopo il claim e prima del complete puo lasciare
`import_indeterminate`. Un errore tardivo puo inoltre produrre un risultato
parziale gia mutato. La History Entry supplier ha un envelope JSON di 512 KiB e
puo fallire dopo l'applicazione del catalogo. Prima di esporre questo flusso al
Mini serve una policy esplicita e testata di recovery, non un semplice retry UI.

### 5. UX canonica non riducibile a un pulsante upload

Il contratto in `docs/import-supplier-excel-contract.md` richiede selezione file,
analisi/mapping colonne, preview modificabile, revisione Sync DB e conferma
apply. Sono inoltre obbligatori errori recuperabili, blocco doppio submit e
gestione di preview stale/offline. Un wizard incompleto o una preview fittizia
non soddisfa il gate.

## Prerequisiti per una futura rivalutazione

Il gate puo essere riaperto solo dopo avere completato e verificato tutti i
seguenti punti nel repository Admin Web:

1. Estrarre un servizio preview/apply che accetti un contesto personale
   prevalidato e lo propaghi fino alle mutazioni, all'audit, ai receipt e alla
   History Entry, senza risolvere cookie Admin durante il flusso Mini.
2. Aggiungere un resolver bearer server-side che verifichi JWT/sessione,
   profilo, shop attivo, membership, ruolo e permesso al preview e nuovamente
   immediatamente prima di claim/apply/pubblicazione del risultato.
3. Rendere impossibile al client scegliere `actor_id`, `actor_kind`, membership
   o shop scope privilegiati.
4. Introdurre limiti compressi e decompressi, entry/sheet/cell bounds,
   deadline, concorrenza, rate limit e correlation ID privacy-safe.
5. Definire recovery per apply parziali, receipt indeterminati e failure della
   History Entry, includendo una procedura operativa deterministica.
6. Verificare il comportamento upload ufficiale del Mini Program e realizzare
   l'intero wizard localizzato senza parser o secret nel client.
7. Aggiungere test per owner/manager/viewer/platform admin, revoca durante
   apply, cross-shop, replay/concorrenza, ZIP bomb, timeout, payload oversized,
   audit e convergenza sync Admin/Android/iOS.

## Evidence verificata

Comando mirato eseguito in locale:

```text
node --test \
  tests/foundation/task-015-import-export.test.mjs \
  tests/foundation/task-032-excel-hardening.test.mjs \
  tests/foundation/task-057-shop-catalog-workspace-import-intelligence.test.mjs \
  tests/foundation/task-060-supplier-excel-android-style-preview-import.test.mjs \
  tests/foundation/task-079b-supplier-import-canonical-history.test.mjs \
  tests/foundation/cross-platform-reliability-admin.test.mjs
```

Risultato: `63/63 PASS`, `0 FAIL`, durata `1.089 s`.

Questa evidence valida i contratti mirati del pipeline Admin esistente. Non e
un test live di upload dal Mini Program e non modifica la decisione di defer.

## Effetto su WECHAT-003

- Nessuna API Mini Excel.
- Nessun pulsante o voce di menu Excel nel Mini.
- Nessun parser workbook nel client.
- Nessuna simulazione o fixture presentata come import live.
- Il catalogo CRUD controllato puo procedere indipendentemente.
- La classificazione resta `EXCEL_IMPORT_DEFERRED_BY_DECISION_GATE` finche i
  prerequisiti sopra non sono soddisfatti e riesaminati.
