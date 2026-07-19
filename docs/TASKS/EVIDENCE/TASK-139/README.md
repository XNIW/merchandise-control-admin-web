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

- Database staging/QA apply: `NOT_RUN` prima della review/CI del PR.
- Database production apply: `NOT_RUN` e non autorizzato.
- Deploy Cloudflare staging/production: `NOT_RUN`.

## Review cumulativa

- Review finale read-only: `P0=0`, `P1=0`.
- Finding P2 iniziale `raw legacy owner scope UUID in signed cursor`: `FIXED`.
- Finding P2 iniziale `valid count/revision domain could exceed 512`: `FIXED`.
- Finding P2 follow-up `UUID PostgreSQL v7/nil rejected at page boundary`:
  `FIXED`, con round-trip regressivo su entrambi.
- Limite client Win7POS osservato: `MaxBootstrapCatalogPullPages=120`; il
  catalogo da 100.000 prodotti con lane prezzi richiede un budget superiore.
  Correzione assegnata al PR client SYNC-1, senza mescolare repository/PR.
- Stato handoff: `REVIEW`; CI database/pgTAP e packaging Linux restano gate
  obbligatori sull'HEAD esatto prima del merge.
