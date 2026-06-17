# TASK-067 Evidence - Master Console lifecycle, ownership, safe cleanup

## Stato

- Stato corrente: `DONE_RECONCILED`
- Verdict finale: `DONE_RECONCILED`
- Data: 2026-06-17

## Evidence aggiornate review-fix

Runtime locale:

- `PLATFORM_LOCAL_DEV_PORT=3055 npm run platform:local:dev`
- Supabase local; login sintetico preparato con `npm run platform:local:seed`.
- Migration locali applicate con `supabase migration up --local`.

Check:

- `npm run typecheck` PASS.
- `npm run lint` PASS.
- `npm run security:scan` PASS.
- `npm run build` PASS.
- `npm run verify` PASS.
- `npm run test:foundation` PASS, `341/341`.
- `git diff --check` PASS.

QA autenticata:

- `/platform/shops` PASS.
- `/platform/shops/85f08d09-459e-440a-8137-8b0aeac3cd9b` PASS, archived detail con lifecycle select, ownership compatta, Danger Zone e purge blocked per membership.
- `/platform/shops/f1a20a04-1387-4cfc-a0cd-bd5f43a772fb` PASS, `pending_setup -> active` via lifecycle UI con `operation=activate&result=success`.
- `/platform/shops/472809a0-dd8c-4ef5-bfe3-04204020226a` PASS, purge reale su shop sintetico isolato con `operation=purge&result=success`; DB verificato `shop_count=0`, audit globale `platform.shop.purge.success=1`.
- `/platform/users` PASS.
- `/platform/users/7501e558-9d6d-4920-85e8-d785d8a791ae` PASS.

Screenshot:

- `qa-shops-list.png`
- `qa-shop-detail-archived-top.png`
- `qa-shop-detail-archived-full.png`
- `qa-lifecycle-pending-before.png`
- `qa-lifecycle-pending-activated.png`
- `qa-ownership-compact.png`
- `qa-danger-zone-blocked-preview.png`
- `qa-danger-zone-purge-preview.png`
- `qa-danger-zone-purge-result.png`
- `qa-users-list.png`
- `qa-user-detail.png`

Note:

- Detail archived verificato con lifecycle form non tagliato.
- Diagnostics secondario/collassabile.
- Danger Zone con purge reale dove sicuro e dependency preview; purge bloccato con ragioni specifiche quando membership/audit/dipendenze visibili non sono pulite.
- Nessun copy misto `Record archiviato` / `soft-deleted` nella UI inglese.

## Evidence follow-up safe force purge

Data: 2026-06-17

Implementazione:

- Aggiunta migration `20260616235502_task_067_safe_force_purge_test_shop.sql`.
- Aggiunta RPC `platform_force_purge_test_shop` per soli shop archived
  sintetici/test/local/staging.
- `platform_preview_shop_purge` ora espone conteggi completi e distingue
  normal purge da force purge.
- Prima del delete fisico viene scritto audit globale
  `platform.shop.purge.snapshot` con snapshot shop, membership, audit,
  dipendenze e actor/reason.
- Le audit rows shop-scoped vengono cancellate solo dopo snapshot, tramite
  guard server-side `app.platform_allow_test_audit_delete`.
- Audit globale finale `platform.shop.purge.success` resta scollegato dalla FK
  dello shop eliminato.

Check:

- `npm run typecheck` PASS.
- `npm run lint` PASS.
- `npm run security:scan` PASS.
- `npm run test:foundation` PASS, `342/342`.
- `npm run build` PASS.
- `npm run verify` PASS.
- `git diff --check` PASS.
- `supabase migration up --local` PASS.
- `supabase migration list --local` include `20260616235502`.

Query DB force purge:

- Preview fixture `TASK067_FORCE_FINAL`:
  `preview_code=force_purge_available`,
  `normal_safe_to_purge=false`, `force_safe_to_purge=true`,
  `members_before=1`, `audit_before=1`.
- Dopo `platform_force_purge_test_shop`:
  `purge_code=success`.
- Verifica post purge:
  `shop_count=0`, `member_count=0`, `shop_audit_count=0`,
  `snapshot_count=1`, `success_count=1`.
- Guardrail non-test:
  `REAL067_FORCE_BLOCK` restituisce `unsafe_purge_target` e la row shop resta
  presente prima del cleanup locale della fixture.

QA autenticata follow-up:

- Runtime ufficiale:
  `PLATFORM_LOCAL_DEV_PORT=3055 npm run platform:local:dev`.
- `/platform/shops` PASS.
- `/platform/shops/f161d957-6ac5-440b-9d3e-7bb0156a5916` PASS prima della
  purge: Danger Zone mostra `Safe force purge test shop`, preview completa,
  membership/audit force-managed, nessun testo italiano/inglese misto.
- Force purge via UI PASS:
  reason + `DELETE TASK067_UI_FORCE2`, redirect a
  `/platform/shops?operation=force_purge&result=success`.
- Verifica DB post UI purge:
  `shop_count=0`, `member_count=0`, `shop_audit_count=0`,
  `snapshot_count=1`, `success_count=1`.
- `/platform/users` PASS.
- `/platform/users/9abd6961-fa12-4cd2-9d95-075f7f5eb3fe` PASS, nessun secret
  leak visibile e nessun overlay di errore.

Screenshot follow-up:

- `qa-force-shops-list.png`
- `qa-force-shop-detail-full.png`
- `qa-force-danger-zone-viewport.png`
- `qa-force-purge-result.png`
- `qa-force-purge-shops-result.png`
- `qa-force-users-list.png`
- `qa-force-user-detail.png`

## Final reconciliation

Data: 2026-06-17

Stato finale: `DONE_RECONCILED`.

La review prodotto dell'utente ha approvato la chiusura di `TASK-067`. Questa
reconciliation e solo documentale: nessun codice, OAuth/TASK-065, migration o
superficie runtime viene modificata.

Risultati tecnici riconciliati:

- `npm run typecheck` PASS.
- `npm run lint` PASS.
- `npm run security:scan` PASS.
- `npm run test:foundation` PASS, `342/342`.
- `npm run build` PASS.
- `npm run verify` PASS.
- `git diff --check` PASS.
- `supabase migration up --local` PASS.
- QA autenticata PASS.
- Force purge test shop PASS con snapshot globale
  `platform.shop.purge.snapshot` e success audit globale
  `platform.shop.purge.success`.

Rischi residui non bloccanti:

- Production hard delete resta bloccato; usare Archive.
- User purge/auth.users resta fuori scope.
- TASK-065/OAuth resta task separato e non viene modificato da `TASK-067`.
- Nuove tabelle future con FK verso `shops` dovranno essere aggiunte
  esplicitamente alla preview/RPC safe force purge.
