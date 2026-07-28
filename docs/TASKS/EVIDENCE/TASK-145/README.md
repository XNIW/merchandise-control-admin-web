# Evidence TASK-145

## Baseline

- Admin `origin/main`: `6ae562c83a6ebcecad93bf53141a13fbcdf0a080`
- PR A: `#47`, CI/Cloudflare verdi, merge normale.
- Win7POS `origin/main` read-only:
  `fb6dbe670ae1a646268331e7288d6e6b07b5500d`
- Capability matrix Win7POS letta dal worktree detached.
- Production: `NOT_MODIFIED`.

## Contratto target

- Endpoint: `POST /api/pos/catalog/article-mutations`
- Schema: `pos-article-mutation-v1`
- Boundary: trusted POS device/session/staff/shop lease.
- Supplier import: `UNCHANGED / NOT_REUSED`.

## Check

Eseguiti nel worktree
`/Users/minxiang/.codex/worktrees/admin-pos-contract-20260728/article-mutations`
contro la baseline `6ae562c8`:

- `git diff --check`: `PASS`.
- `npm run typecheck`: `PASS`.
- focused route/foundation TASK-145: `6/6 PASS`.
- regressioni foundation TASK-139/141/142/143 + TASK-145:
  `54/54 PASS`.
- `WIN7POS_REPO_PATH=... npm run test:foundation`: `PASS`.
- `npm run security:scan`: `PASS`.
- `npm run verify`: `PASS` (Next.js `16.2.6`, build production incluso).
- `npm run cf:build`: `PASS`, artefatto `.open-next/worker.js` creato.
- `npm run test:cloudflare:local`: `PASS`, incluse route
  `article-mutations` POST `400`, GET `405`, `no-store`.
- reset Supabase isolato con tutte le migrazioni: `PASS`.
- pgTAP TASK-145 iniziale: `46/46 PASS`.
- regressione pgTAP TASK-144: `41/41 PASS`.
- regressioni pgTAP TASK-139/141/142: `134/134 PASS`.
- intera suite pgTAP iniziale: `16` file, `1062` test, `PASS`.
- `supabase db lint --level error`: `PASS`, zero risultati.

## Fixture

- request SHA-256:
  `deaf2948dd65bfc84da93957b571097cb967ab0023c923b6dc389ee74ebcc137`
- response SHA-256:
  `8b03c0a6110c752feaec86c45c8f4fc22dcc6e2d3dfcf629d894e444e01dc02f`
- dati/tokens: sintetici e non validi.

## Review indipendente iniziale e fix

- Head congelata: `ad992a72c3985e6e87e3e2f7a603ec301ab03eb8`.
- Conteggi reviewer: `P0=0`, `P1=1`, `P2=2`, `P3=1`.
- P1 price publication: corretto il formato history al legacy canonico a
  secondi e aggiunta allocazione bounded di slot distinti per mutazioni nello
  stesso secondo; il revision pull immediato resta `ok`.
- P2 terminal mapping: validation server-time diventa receipt terminale,
  i codici DB restano tipizzati e SQLSTATE `42501` viene auditato/mappato a
  `failed_auth`; `retryable_upstream` resta riservato agli errori transitori.
- P2 cleanup: aggiunta
  `pos_article_mutation_cleanup_synthetic_v1`, service-role only, vincolata a
  `TASK145QA_<RUN_ID>`, fail-closed su dati non sintetici/sales e senza
  cancellare audit immutabile.
- P3 field mask: non vuota è ora rifiutata per ogni kind non-update in parser e
  RPC.
- Check post-fix: focused foundation `7/7 PASS`, typecheck `PASS`, security
  `PASS`, foundation completa `PASS`, `npm run verify` `PASS`,
  `npm run cf:build` `PASS`, Worker smoke locale `PASS`, reset isolato
  `PASS`, SQL lint zero errori, TASK-144 `41/41 PASS`, pgTAP TASK-145
  `59/59 PASS`, intera suite pgTAP `16` file / `1075` test / `PASS`.
- Rereview sulla head `41c132d0`: `P0=0`, `P1=0`, `P2=1`, `P3=0`.
  L'unico finding residuo era l'assenza di receipt/audit durevoli per collisioni
  identity/idempotency/sequence, che produceva un ACK terminale solo in memoria.
- Fix rereview: aggiunta receipt di conflitto separata, append-only e
  service-role-only, con fingerprint SHA-256, ACK originale stabile su replay,
  audit redatto una sola volta e cleanup QA FK-safe. La receipt applicata
  originale resta immutata.
- Check post-rereview-fix: focused foundation `7/7 PASS`, typecheck `PASS`,
  security `PASS`, reset Supabase isolato `PASS`, SQL lint zero errori, pgTAP
  TASK-145 `71/71 PASS`, intera suite pgTAP `16` file / `1087` test / `PASS`.
- Seconda rereview sulla head `83af8358`: `P0=0`, `P1=0`, `P2=1`, `P3=0`.
  Il fingerprint includeva ancora `attemptToken`, quindi un retry con nuovo
  attempt non riproduceva l'ACK di conflitto originario.
- Fix seconda rereview: fingerprint derivato solo dall'intento immutabile,
  lock transazionale sul fingerprint e lookup/replay della conflict receipt
  prima di ogni nuova valutazione o DML. Test con nuovo attempt prova ACK
  byte-equivalente, una sola receipt/audit e nessuna applicazione tardiva.
- Check post-seconda-rereview-fix: pgTAP TASK-145 `73/73 PASS`, intera suite
  pgTAP `16` file / `1089` test / `PASS`, lint SQL zero errori.
- Terza rereview sulla head `bd53c083`: `P0=0`, `P1=0`, `P2=1`, `P3=0`.
  Il replay di una receipt applicata poteva attendere un identity lock e
  restituire l'ACK dopo la scadenza wall-clock della lease.
- Fix terza rereview: aggiunta la stessa fence lease finale già presente su
  publication e conflict replay prima di `duplicate_replay`; SQLSTATE `42501`
  resta mappato dalla route a failure auth auditata e non retryable.
- Check post-terza-rereview-fix: focused foundation `7/7 PASS`, reset isolato
  `PASS`, suite pgTAP `16` file / `1089` test / `PASS`.
- Rereview indipendente finale sulla head `58cedd79`:
  `P0=0`, `P1=0`, `P2=0`, `P3=0`, verdict `ZERO-GATE PASS`.
- Gate freschi sulla head finale: `npm run verify` `PASS`,
  `npm run cf:build` `PASS`, worktree pulito.

## Delivery e acceptance finali

- Head locale revisionata: `302695a8ad6c9651c98b5521c4df2595e4d5abe6`.
- Feature SHA remoto: `6eb3e1571eab71f5dd6e91abeef3b3b4efbd69e6`;
  tree `202f7db3503c654d655708f149ad79ab6397dac1`, identica alla tree
  revisionata.
- PR B `#48`: non-draft; CI run `218` e Cloudflare run `215` `PASS`.
- Merge normale: `fca4013c7e92f1a9f82968cc8d64946bf2363112`.
- Main locale e `origin/main`: allineati prima della riconciliazione
  documentale post-deploy.
- Progetto staging: `jpgoimipbothfgkokyvm`,
  `merchandisecontrol-dev`, `ACTIVE_HEALTHY`, `sa-east-1`.
- Migration remote, nell'ordine:
  `20260728055123 task_144_pos_offline_authorization_attestation`;
  `20260728055127 task_145_pos_article_mutation_v1`.
- Unico deploy Worker dopo entrambi i merge:
  deployment `f0129552-d815-49fb-a2a3-f38c61aaa84f`;
  version `56ec23b1-a5b7-4635-94ff-b2ebaa682d0f`, 100% attiva dal
  `2026-07-28T05:52:29.417853Z`.
- Staging URL:
  `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.

### Acceptance staging

- Tentativo 1 `STGBF87F86D6`: fixture update respinta per ordine hash canonico;
  cleanup `PASS`, residui `0`, baseline ripristinata.
- Tentativo 2 `STG97A609110`: fixture stock respinta per enum non canonico;
  cleanup `PASS`, residui `0`, baseline ripristinata.
- Tentativo 3 corretto `STGFE91FF04C`: `PASS`.
- First-login: trusted device/session `PASS`;
  `effectiveOfflineAuthorizationExpiresAt` persistita in sessione e
  credential, maggiore di server time e bounded a `43.200s`.
- Mutazioni: create, replay identico, payload mismatch e relativo replay,
  update nomi/codice/categoria/fornitore, retail, purchase, stock `+5/-2`,
  stale conflict, duplicate remoto distinto, deactivate/reactivate: `PASS`.
- Pull canonico: `4` pagine, entrambi i prodotti e stato finale osservati.
- Receipt applicative `10`; conflict receipt `1`; replay ACK byte-equivalente.
- Price history per le due mutation esplicite `2`; stock movement `2`;
  sales e revenue rows create `0`.
- Audit article mutation controllati `11`; PIN/password/token/credential
  esatti assenti dalle metadata.

### Cleanup

- RPC: `pos_article_mutation_cleanup_synthetic_v1`.
- Eliminati: prodotti `2`, prezzi `2`, stock movement `2`, receipt applicative
  `10`, conflict receipt `1`, categorie `1`, fornitori `1`, sync event `13`,
  catalog revision `1`.
- Residui sintetici in prodotti/prezzi/stock/receipt/conflitti/categorie/
  fornitori/sync/sales/revenue: `0`.
- Residui runtime attivi in credential/device/mapping/member/session/shop/
  staff: `0`.
- Audit cleanup immutabile preservato: `1`.
- Conteggi catalogo/accounting preesistenti: ripristinati esattamente.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Stato finale: `REVIEW_READY`, mai `DONE`.
