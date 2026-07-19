# TASK-139 Evidence

Evidence incrementale per paginazione e snapshot catalogo POS v2.

- Baseline branch: `c30cf3f2b44e1bf67a2c3bcbdcd0b2cc6a9328a4`.
- Root cause: richiesta `limit + 1` troncata da PostgREST `api.max_rows = 1000`.
- Stato iniziale: `EXECUTION`.
- Production apply/deploy: `NOT_RUN` e non autorizzato.

## Root cause riprodotta dal contratto precedente

- Page size richiesta: `1000`.
- Range precedente: inclusivo `from .. from + limit`, quindi richiesta interna
  di `1001` righe.
- Cap Data API: `api.max_rows = 1000`.
- Risultato precedente: `1000` righe visibili al route handler,
  `hasMore = false`, summary authoritative assente e versione calcolata sulla
  sola pagina.

## Implementazione

- Una RPC `STABLE` restituisce una sola riga JSON e applica `LIMIT p_limit + 1`
  dentro PostgreSQL.
- Revisione monotona per shop aggiornata una sola volta per statement tramite
  transition table su catalogo e mapping.
- Snapshot, scope, revisione e manifest sono pin del cursore `catalog-v2`
  firmato HMAC e legato a sessione, device e shop.
- Lo scope usa una chiave hash opaca, mentre la row identity usa una codifica
  binaria compatta; l'UUID owner del bridge legacy non e decodificabile dal
  cursore.
- Conteggi, revisioni, timestamp e UUID usano una codifica wire compatta e
  lossless: anche conteggi `Number.MAX_SAFE_INTEGER` e revisione PostgreSQL
  `9223372036854775807` restano entro il cap client di 512 caratteri.
- Lane keyset deterministiche:
  `categories -> suppliers -> products -> prices`.
- `catalogVersion`/`catalogRevision` sono opachi e stabili per l'intero run;
  `catalogSummary` e conteggi finestra sono authoritative.
- Continuation con revisione/scope mutati risponde senza righe e viene tradotta
  in `catalog_cursor_rejected`.
- Prezzi cross-scope/orfani e prezzi di prodotti eliminati sono esclusi.
- Il backfill `inventory_product_prices.updated_at` distingue timestamp Room UTC
  e ISO con offset, valida prima di mutare e sospende/riattiva soltanto i due
  trigger TASK-088 che altrimenti bloccherebbero o emetterebbero eventi fittizi.
- Heartbeat: hint revisionale opzionale; un errore di lookup non rende invalido
  un heartbeat autenticato.
- CI: nuovo job Linux `Database migrations and pgTAP`, Supabase CLI `2.109.0`,
  `supabase start` e `supabase test db`.

## Gate locali eseguiti

- `git diff --check`: `PASS`.
- `npm run check:pos-catalog-paging`: `PASS`.
- `npm run i18n:check`: `PASS`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run security:scan` con `WIN7POS_REPO_PATH=C:\Dev\Win7POS` e
  `REQUIRE_WIN7POS_REPO=1`: `PASS`.
- `npm run test:foundation` con lo stesso boundary Win7POS obbligatorio:
  `PASS`.
- `npm run verify`: `PASS`, incluso `next build` production.
- Test TASK-139 sintetici: `PASS` per `0`, `1`, `999`, `1000`, `1001`,
  `19763` e `100000`, inclusi microsecondi, no duplicati/skip, cursore alterato,
  scaduto e cross-session/device/shop.
- Regressione cursore massimo, privacy scope UUID e row UUID compatta: `PASS`,
  lunghezza bounded `<=512` e round-trip della precisione PostgreSQL a
  microsecondi.
- `npm run cf:build`: `BLOCKED_ENV_WINDOWS_SYMLINK` durante il packaging
  OpenNext (`EPERM`); il `next build` interno è terminato `PASS`. Gate completo
  demandato alla CI Linux.
- `supabase start` / `supabase test db` locali: `BLOCKED_ENV_NO_DOCKER`; nessun
  motore Docker/Podman/WSL disponibile. Gate reale demandato al nuovo job CI.

## Operazioni esterne

- Tentativo di preview branch sul progetto dev: `BLOCKED_EXTERNAL_402`, perche
  Supabase Branching richiede un piano Pro; nessun branch e stato creato e
  nessuna modifica e stata applicata al progetto dev.
- Fallback autorizzato: progetto cloud QA nano isolato
  `merchandisecontrol-task139-qa` (`qglljgyhflcbtzlsbqkq`, `sa-east-1`), con
  soli utenti/shop/cataloghi sintetici e nessun dato production.
- `supabase db push --linked --dry-run --include-all`: `PASS` sul progetto QA.
- Apply ordinato dell'intero stack migration, inclusa TASK-139: `PASS` sul
  progetto QA.
- `supabase test db --linked task139.sql` da Windows:
  `BLOCKED_ENV_NO_DOCKER`; il comando pgTAP della CLI usa comunque il runner
  Docker locale. Lo stesso stack migration e pgTAP e passato nel job CI Linux.
- Regressione Data API reale: richiesta `Range: 0-1000` sulla fixture da
  100.000 prodotti ha restituito HTTP `206`, `1000` righe e
  `Content-Range: 0-999/100000`, riproducendo il cap senza modificarlo.
- Drain RPC cloud da `19763`: `PASS`, `20` pagine, ultima pagina `763`,
  `0` duplicati e replay deterministico.
- Drain RPC cloud da `100000`: `PASS`, `100` pagine, ultima pagina `1000`,
  `0` duplicati e replay deterministico.
- Mutazione tra pagina 1 e continuation: revisione `1 -> 2`; risposta
  `snapshot_changed`, senza proprieta `rows`: `PASS_FAIL_CLOSED`.
- Advisor Supabase dopo DDL: `0` rilievi TASK-139 tra `85` security e `140`
  performance; gli avvisi presenti riguardano oggetti dello stack storico.
- Cleanup: progetto QA eliminato definitivamente dopo i test; elenco progetti
  nuovamente limitato a `merchandisecontrol-dev`, con link locale ripristinato.
- Database production apply: `NOT_RUN` e non autorizzato.
- Deploy Cloudflare staging/production: `NOT_RUN`.

## CI sull'HEAD pubblicato

HEAD `53b9f47286b994af65c71b4e93d0a05be505e161`:

- `Database migrations and pgTAP`: `PASS`, intero stack migration e test SQL.
- `Verify`: `PASS`.
- `Cloudflare build`: `PASS`, incluso packaging OpenNext e smoke locale Linux.
- `TASK-094 staging E2E`, `Deploy staging` e `Deploy production`: `SKIPPED`
  come previsto dalle condizioni workflow; nessun deploy e stato eseguito.

Questa evidence genera una nuova HEAD documentale: prima del merge restano
obbligatori i check verdi anche su tale commit esatto.

## Review cumulativa

- Review finale read-only: `P0=0`, `P1=0`.
- Finding P2 iniziale `raw legacy owner scope UUID in signed cursor`: `FIXED`.
- Finding P2 iniziale `valid count/revision domain could exceed 512`: `FIXED`.
- Finding P2 follow-up `UUID PostgreSQL v7/nil rejected at page boundary`:
  `FIXED`, con round-trip regressivo su entrambi.
- Limite client Win7POS osservato: `MaxBootstrapCatalogPullPages=120`; il
  catalogo da 100.000 prodotti con lane prezzi richiede un budget superiore.
  Correzione assegnata al PR client SYNC-1, senza mescolare repository/PR.
- Stato handoff: `REVIEW`; P0/P1/P2 aperti `0`. Migration, pgTAP, packaging
  Linux e QA cloud isolata sono verdi; resta il rerun CI sull'HEAD documentale
  esatta prima del merge normale.
