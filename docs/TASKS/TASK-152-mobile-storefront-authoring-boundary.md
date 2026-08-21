# TASK-152 - Mobile Storefront Authoring Boundary

## Informazioni generali

- ID: `TASK-152`
- Coordination key: `MOBILE_STOREFRONT_PRODUCT_CONTROL`
- Stato: `ACTIVE`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX_RE_REVIEWER`
- Data creazione: `2026-08-21`
- Branch: `codex/mobile-storefront-product-control-admin-20260821`
- Planning authority: Client `TASK-046`

## Scopo

Estendere il contratto Storefront esistente con authoring condiviso Admin/Android/iOS:
identita prodotto remota shop-scoped, lettura bounded, optimistic version,
idempotency, RBAC per edit/publish/pricing/images/promotions, audit source derivato e
adozione sicura dell'immagine operativa nella pipeline pubblica corrente.

## Non incluso

- nuovo schema Storefront parallelo, direct-table mobile write o service role client;
- modifiche POS/WeChat/delivery tracking/release validator non causate dal diff;
- apply production, public store release, dati reali o deep security scan repository-wide.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-152-01 | Migration additive, history pulita e contratto backwards-compatible | `PASS` |
| CA-152-02 | Read/save/publish/schedule/hide/archive con stable product id | `PASS` |
| CA-152-03 | expectedVersion stale-deny e idempotency duplicate-safe | `PASS` |
| CA-152-04 | RBAC separa read/edit/publish/pricing/images/promotions e shop | `PASS` |
| CA-152-05 | Audit safe espone source Admin/Android/iOS/System e changed fields | `PASS` |
| CA-152-06 | Public payload esclude esplicitamente tutti i campi interni vietati | `PASS` |
| CA-152-07 | Pipeline immagini corrente genera/verifica/finalizza varianti pubbliche | `PASS` |
| CA-152-08 | Test mirati, suite canonica, review/fix e CI exact-SHA verdi | `NOT_RUN` |

## Planning

Il planning unico e nel coordinator Client TASK-046. Questo task non introduce un
secondo planning e ne applica architecture map, file map e contract map gia autorizzati.

## Execution

- Baseline `59668348e4c728b44b998c80f1aded61e6114a3f`; worktree linked pulito.
- Audit schema concluso: publication/projection/category/promotion/image pipeline
  esistenti saranno estesi; gli stati DB correnti restano canonici.
- Aggiunta migration `20260821144753_mobile_storefront_authoring_v1.sql`: read
  bounded, mutazioni versionate/idempotenti, permission pricing separata, source
  derivato, audit safe e guard soft-delete dopo archive.
- Admin usa il boundary condiviso v1; la vecchia mutazione non versionata non e piu
  eseguibile. La UI mostra versione/source e applica i permessi pricing.
- L'adozione dell'immagine operativa riusa intent/storage/finalize esistenti e genera
  varianti WebP server-side con validazione, orientamento normalizzato e cleanup.
- Gate reali:
  - `supabase db reset --local`: `PASS`, exit `0`;
  - `supabase test db supabase/tests`: `PASS`, 47 file / 2551 test, exit `0`;
  - `supabase db lint --local --schema public,app_private --fail-on error`:
    `PASS`, exit `0`, soli warning storici;
  - `npm run test:foundation`: `PASS`, 984 pass / 0 fail / 2 skip, exit `0`;
  - `npm run verify`: `PASS`, lint/typecheck/security/build, exit `0`;
  - `git diff --check`: `PASS`, exit `0`.
- CI exact-SHA resta `NOT_RUN` fino alla Pull Request.

## Review / Fix

- Review indipendente diff-scoped: `CHANGES_REQUIRED`, copertura 18/18 file
  source; nessun P0/P1, tre P2 e un P3:
  - hard delete non intercettata dal solo trigger soft-delete;
  - race della prima creazione concorrente con `expectedVersion=0`;
  - rimozione immagine/promozione senza capability dedicata;
  - audit source derivata da `x-client-info` falsificabile.
- Fix batch unico:
  - trigger `BEFORE DELETE` dedicato e regressione pre/post archive;
  - advisory transaction lock su `(shop, sourceProduct)` prima della lettura;
  - permission check su ogni transizione image/promotion, incluse le rimozioni;
  - source autorevole da claim `app_metadata.storefront_mutation_source`
    server-signed; l'header client non governa piu l'audit.
- Gate post-fix:
  - pgTAP authoring mirato 46/46 e customer cart 98/98: `PASS`;
  - pgTAP completo 47 file/2561 test: `PASS`;
  - foundation 984 pass/0 fail/2 skip: `PASS`;
  - schema lint senza errori e `npm run verify`: `PASS`.
- Re-review indipendente: `APPROVED`; 4/4 finding chiusi, nessuna nuova
  regressione P0/P1/P2 causata dal fix. Verifica reviewer: pgTAP authoring 46/46,
  foundation mirato 8/8 e `git diff --check` `PASS`.

## Handoff

- `CODEX_REVIEW_APPROVED_AWAITING_CI_AND_AUTHORIZED_MERGE`.
