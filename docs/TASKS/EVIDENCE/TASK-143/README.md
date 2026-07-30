# TASK-143 Evidence

## Baseline

- Admin main iniziale:
  `96e9dc52e4c558099762d70e93357b33ec17c20c`.
- Branch:
  `codex/admin-staging-catalog-pull-503-20260727`.
- Worktree:
  `/Users/minxiang/.codex/worktrees/admin-staging-catalog-pull-503-20260727`.
- TASK-142: `DONE`, non riaperta.
- Win7POS PR #49: merged, merge SHA
  `218752a86a884d6f3cb15040b69f9a029f82329d`.
- Win7POS handoff SHA:
  `9fe3fa718b16289438f0a19ea77733396eb8866d`.
- Production/Win7POS/Android/iOS: `NOT_MODIFIED`.

## Incidente

- Timestamp UTC: `2026-07-27T19:31:27.9819345Z`.
- Edge correlation hash: `sha256:c24e0c989466`.
- Client request hash: `sha256:081732bebab8`.
- HTTP/stage: `503` / `catalog_pull`.
- Request reached server: `true`.
- Server request ID: assente.
- Pagine catalogo ricevute: `0`.
- Audit Win7POS `±3 minuti`: first login e device trust `success`; nessun
  catalog request/success/failure.

## Diagnosi

`CONFIRMED`.

- Worker staging attivo durante l'incidente:
  `c5ae7e81-ded9-43ec-996a-199f7cfa540b`, creato
  `2026-07-27T08:45:17.790214Z`.
- Correlazione esatta: `2026-07-27T19:31:27Z`, colo `EZE`, status
  `exceededResources`.
- Metriche bounded: CPU `10.000µs`, wall `12.633µs`, memoria
  `30.965.825` byte, body `0`, errori `1`, richieste `1`, subrequest `0`.
- La stessa versione registra sei `exceededResources` nel periodo osservato;
  il caso incidente è uno dei casi senza alcun subrequest.
- Bindings `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e
  self-service presenti nella versione attiva: missing binding escluso.
- Versione precedente:
  `87430495-6b28-429d-9f40-40240b5793c4`; nessun
  `exceededResources` nel periodo osservato e drain reale riuscito, inclusa
  invocazione con body `548.585` byte e `18` subrequest.
- Diff TASK-142: aggiunto l'import della policy completa
  `src/lib/catalog-text-policy.ts` alla route catalog pull.
- Failure layer: Cloudflare Worker resource boundary, prima di Supabase e
  prima dell'audit.
- Root cause: costo di parsing/inizializzazione della policy di
  normalizzazione/scrittura nel cold path della route read-only.

## Fix locale

- Validatore canonical read-only compatto, provato equivalente alla golden
  policy TASK-142.
- Nessuna rimozione o indebolimento della canonical validation.
- Failure response typed con `stage`, `root` e server request ID.
- Audit failure per errori attesi e fallback log Worker strutturato, bounded e
  senza secret quando binding/audit non sono disponibili.
- Manifest realmente vuoto bloccato come `catalog_v2_empty_manifest`, senza
  success body né publication fence. È valido quando il `catalogSummary` è
  nonzero oppure quando una delta contiene righe nella window: restano quindi
  validi sia un delta idempotente con catalogo globale non vuoto sia un delta
  tombstone-only che converge il catalogo a zero.
- SQLSTATE/PostgREST upstream classificati senza copiare messaggi o payload.
- Nessun timeout aumentato; nessuna migration necessaria.

### Request trace e audit

- La request trace bounded è il support ID server in `X-Request-Id` e nel body
  failure, correlato alla Worker invocation e all'edge hash redatto.
- Il success audit `pos.catalog.pull.success` resta atomico nella publication
  fence lease-bound.
- Il failure audit `pos.catalog.pull.failure` è atteso prima della risposta;
  se l'audit non è disponibile, il fallback Worker contiene soltanto
  code/root/stage/support ID e correlation hash redatto.
- Non viene aggiunto un terzo audit DB `request`: evitata una write prima
  della validazione/publication e un subrequest aggiuntivo per ogni pagina.

## Evidence build iniziale

- `node --test tests/foundation/task-143-admin-staging-catalog-pull-503.test.mjs`:
  `14/14 PASS`.
- `npm run cf:build`: `PASS`, Next.js `16.2.6`, OpenNext Cloudflare `1.19.11`.
- Route dependency pre-fix con policy completa: `17.986` byte.
- Route dependency post-fix senza policy di scrittura: `15.101` byte,
  riduzione `2.885` byte (`16,0%`) nonostante la diagnostica aggiunta.
- `npm run test:cloudflare:local`: `PASS`; guard catalog pull `503` typed e
  no-store nel runtime locale privo intenzionalmente dei binding.

## Gate

- `git diff --check`: `PASS`.
- `node --test tests/foundation/task-143-admin-staging-catalog-pull-503.test.mjs`:
  `15/15 PASS` dopo la remediation CI.
- `npm run test:foundation` nel profilo CI senza repository esterno Win7POS:
  `PASS`.
- regressioni TASK-139/TASK-141/TASK-142:
  `34/34 PASS`.
- regressioni catalog/audit/governance TASK-027/TASK-079:
  `13/13 PASS`.
- `npm run check:pos-catalog-paging`: `PASS`.
- `npm run verify`: `PASS`; include type generation, lint/typecheck, security
  scan e build Next.js `16.2.6`.
- `npm run cf:build`: `PASS`.
- `npm run test:cloudflare:local`: `PASS`.
- reset Supabase isolato locale: `NOT_APPLICABLE`, nessuna migration o
  modifica DB; job PR `Database migrations and pgTAP`: `PASS`.
- CodeQL manuale: `NOT_RUN` come richiesto; nessun check CodeQL separato è
  configurato nella check suite. Security scan automatico: `PASS` nei job
  Verify e Cloudflare.

## Review indipendente

Prima review sul feature SHA `ae54c834d73c6381cd1eda9594a30efa79ee664d`:

- P0: `0`;
- P1: `2`;
- P2: `2`;
- P3: `1`;
- verdict iniziale: `CHANGES_REQUIRED_PRE_MERGE`.

Remediation locale:

- empty manifest ora fail-closed e non pubblicato;
- full drain attraversa `handlePosCatalogPull`, quattro lane, continuation
  keyset, cursori e una publication fence per pagina; i conteggi sono
  verificati contro il manifest restituito dalla prima pagina;
- error codes testati attraverso `loadCatalogPageV2`;
- eccezione testata attraverso il vero `POST` Route Handler;
- semantica request trace/audit formalizzata;
- stato gate del report incidente aggiornato.

Il follow-up sullo SHA
`7dabab6e2aa231734e02f664152ac89763e914ba` ha chiuso i due P2 e il P3,
ma ha rilevato:

- P1 `1`: empty-window delta confusa con catalogo globale vuoto;
- P2 `1`: harness senza i clamp RPC reali per lane;
- P0/P3 `0`.

Remediation locale aggiuntiva:

- il guard usa `catalogSummary`, mantenendo valida una delta idempotente con
  catalogo globale nonzero e `windowCounts=0`;
- il full drain usa i clamp RPC reali
  categories/suppliers/products/prices `240/240/60/120` e asserisce `676`
  pagine/publication fence, valore derivato dal manifest fixture.

Il follow-up sullo SHA
`f876f169b29b4406c756083c3f365707bf0121bc` ha chiuso clamp e delta
idempotente, ma ha rilevato un ultimo P1: una delta tombstone-only che elimina
gli ultimi record ha summary zero e window nonzero. Correzione locale:

- validità manifest = summary globale nonzero oppure delta window nonzero;
- regressione tombstone-only pubblicata con catalogSummary finale zero;
- regressione summary e window entrambi zero ancora fail-closed.

Follow-up sullo SHA
`2d848e7d1eb805d67da890b65df99b062e553fec`:

- verdict: `APPROVED_PRE_MERGE_WITH_P3`;
- P0/P1/P2: `0/0/0`;
- P3 `1`: sola frase storica inesatta su tombstone/window, corretta prima
  della PR.

Conteggi aperti dopo la correzione documentale: `P0=0/P1=0/P2=0/P3=0`.

La prima esecuzione CI della PR ha rilevato due guard foundation: allowlist
esatta del log server bounded e marker statici dell'ultimo fallback route.
Remediation su tre file, con fallback typed aggiuntivo e una nuova regressione.
Follow-up indipendente sul delta:

- verdict: `APPROVED_PRE_MERGE / PR_READY`;
- P0/P1/P2/P3: `0/0/0/0`;
- TASK-068 + TASK-143: `21/21 PASS`;
- foundation completa profilo CI, typecheck, `verify`, `cf:build` e
  `git diff --check`: `PASS`.

## PR, CI e merge

- PR: `#45`, non draft, merge normale.
- Feature SHA remoto finale:
  `92de5c27d88d640f72a535a7412e535caa3c5b89`.
- Tree remoto finale, identico byte-per-byte alla tree revisionata:
  `cc4cd9a7816322f3c443db149aa42a7a6fe8958d`.
- CI run `212`: `PASS`, inclusi Verify, database migrations e pgTAP.
- Cloudflare run `209`: `PASS`, incluso OpenNext build e Worker smoke.
- Merge SHA: `75113502a824461dce8487c93383fde3122774c1`.
- Admin main locale e `origin/main`:
  `75113502a824461dce8487c93383fde3122774c1`.

## Staging deploy e migration parity

- Migration TASK-143: nessuna.
- Staging ledger: `94` migration remote / `94` migration locali.
- Ultima migration logica: `task_142_catalog_text_policy_v1`; versione locale
  `20260727055520`, remap remoto già documentato `20260727084040`.
- Deploy Worker staging eseguiti da TASK-143: `1`.
- Deployment ID: `bbdc35a8-14b8-4201-8144-c4c6d060bc7c`.
- Worker version ID: `66eeda7f-003b-4b61-9fbd-b4222896c048`.
- Timestamp deploy: `2026-07-27T22:14:27.319282Z`.
- Production: `NOT_MODIFIED`.

## Acceptance server-side staging

Percorso HTTPS reale con sessione dedicata sullo shop Asus correlato
all'incidente; nessun avvio del dispositivo Asus. La sessione, la credenziale
e il device dedicati sono stati revocati nel cleanup.

- First page: `HTTP 200`, app code `success`, elapsed `4.879,2ms`.
- Support ID first page: presente e bounded; hash
  `sha256:254439bbf7d4`.
- Full drain: `676/676` pagine, elapsed `205.616,7ms`, massimo pagina
  `4.879,2ms`, budget `900.000ms`.
- Conteggi drenati e manifest:
  - categorie `71`;
  - fornitori `102`;
  - prodotti totali/attivi `19.763/19.763`;
  - prezzi `41.228`.
- Record duplicati o saltati: `0`.
- Catalog text validator: `PASS`.
- Request trace: `676` support ID univoci.
- Audit `pos.catalog.pull.success`: `676`.
- Audit `pos.catalog.pull.failure`: `0`.
- Dati catalogo creati o modificati: `NO`.
- Cleanup sessione dedicata: `PASS_REVOKED`.
- Verifica cleanup DB: device/credential/session attivi residui `0/0/0`;
  device dedicato revocato `1`.

Tre tentativi iniziali di setup della sola sessione sono stati respinti prima
di creare record con SQLSTATE `22023`: il marker metadata aggiuntivo non era
ammesso dal trigger canonico. Corretto il setup usando soltanto
`app_version_present` e `source`; non è stata necessaria alcuna modifica al
repository o al Worker.

Cloudflare GraphQL dalla timestamp di deploy a
`2026-07-27T22:24:00.121Z`:

- invocazioni `823`, tutte status `success`;
- errori `0`;
- `exceededResources=0`;
- exception `0`;
- subrequest `2.627`.

## File modificati

- `docs/MASTER-PLAN.md`
- `docs/HANDOFFS/2026-07-27_ADMIN_STAGING_CATALOG_PULL_503.md`
- `docs/TASKS/EVIDENCE/TASK-143/README.md`
- `docs/TASKS/TASK-143-admin-staging-catalog-pull-503.md`
- `scripts/security-checks.mjs`
- `src/app/api/pos/_shared/pos-route-security.ts`
- `src/app/api/pos/catalog/pull/route.ts`
- `src/server/pos-auth/catalog-pull.ts`
- `src/server/pos-auth/catalog-revision.ts`
- `src/server/pos-auth/catalog-text-read-validation.ts`
- `tests/foundation/task-068-security-i18n-audit.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- `tests/foundation/task-141-win7pos-catalog-bootstrap.test.mjs`
- `tests/foundation/task-143-admin-staging-catalog-pull-503.test.mjs`

## AI_WORKLOG

- `2026-07-27 / INCIDENT_DIAGNOSIS`: correlati handoff Win7POS, deployment
  Worker, binding e metriche GraphQL senza copiare token, payload o ID
  completi.
- `2026-07-27 / ROOT_CAUSE_CONFIRMED`: isolato
  `exceededResources` prima del primo subrequest e confrontata la versione
  pre-TASK-142 che aveva drenato il catalogo reale.
- `2026-07-27 / FIX_VALIDATION`: sostituito il solo boundary di validazione
  read con implementazione compatta equivalente; aggiunti error mapping,
  audit/fallback log bounded e regressioni.
- `2026-07-27 / PRE_REVIEW`: tutti i gate locali applicabili verdi; nessuna
  migration, nessun deploy e nessuna modifica client/production.
- `2026-07-27 / REVIEW_FINDINGS`: prima review
  `P0=0/P1=2/P2=2/P3=1`; finding corretti localmente e gate toccati verdi.
- `2026-07-27 / REVIEW_FOLLOW_UP`: sullo SHA `7dabab6e` chiusi P2 boundary e
  P3, rilevati `P1=1/P2=1` su delta vuota e clamp di lane; corretti
  localmente.
- `2026-07-27 / REVIEW_FOLLOW_UP_2`: sullo SHA `f876f169` rilevato
  `P1=1` su delta tombstone-only; corretto senza indebolire il fail-closed
  empty-catalog, regressioni TASK-143 `14/14 PASS`.
- `2026-07-27 / REVIEW_APPROVED`: sullo SHA `2d848e7d`
  `P0=0/P1=0/P2=0`, unico P3 documentale corretto; branch pronta per PR.
- `2026-07-27 / CI_REMEDIATION`: chiusi i due guard foundation della prima
  esecuzione PR; follow-up indipendente `P0/P1/P2/P3=0/0/0/0`; CI run `212`
  e Cloudflare run `209` verdi.
- `2026-07-27 / MERGE_DEPLOY`: PR `#45` unita normalmente, main riconciliata;
  migration parity `94/94`; un solo deploy Worker staging versione
  `66eeda7f`.
- `2026-07-27 / SERVER_ACCEPTANCE`: scope Asus reale con sessione dedicata;
  first page e drain `676/676` verdi, manifest esatto, audit success `676`,
  failure `0`, cleanup revocato e zero failure Worker post-deploy. Task
  consegnata a `REVIEW_READY`, mai `DONE`.

## Closeout consolidato 2026-07-30

- Win7POS final acceptance: `PASS`.
- Cleanup staging exact-ID: `PASS`; residui sintetici target `0`.
- Audit immutabile: `PRESERVED`; baseline non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti: `0`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Stato: `REVIEW_READY_FOR_USER_CONFIRMED_CLOSURE`, non `DONE`.
