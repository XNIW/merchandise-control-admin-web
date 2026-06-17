# TASK-067 - Master Console lifecycle management, admin assignment, and safe cleanup

- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Evidence: `docs/TASKS/EVIDENCE/TASK-067/README.md`
- Owner execution: Codex

## Scope

Implementare nel detail shop della Master Console:

- lifecycle management professionale con stati visibili e transizioni controllate;
- gestione account personali web collegati come `shop_owner` / `shop_manager`;
- Danger Zone separata per archive e purge bloccato;
- audit per azioni sensibili;
- nessun hard delete generico di shop, profili o audit.

## Vincoli

- Nessun commit/push/stage.
- Nessuna nuova dipendenza.
- Nessun service-role lato client/browser.
- Nessuna fusione tra account personale web e staff POS.
- Purge fisico non eseguito senza RPC auditata e dependency handling verificato.
- TASK-065/OAuth fuori scope salvo blocker dei check.

## Handoff

Stato finale riconciliato: `DONE_RECONCILED`.

La review prodotto dell'utente ha approvato la chiusura finale di `TASK-067`.
La reconciliation non modifica codice, schema, OAuth/TASK-065 o superfici fuori
scope.

### File e superfici principali

- Detail shop Master Console aggiornato con pannelli separati:
  `Shop lifecycle management`, `Admin access / Ownership`, `Danger Zone`.
- Aggiunte Server Actions e RPC auditati per assegnare/revocare membership
  personali web `shop_owner` / `shop_manager`.
- Purge fisico lasciato bloccato: nessuna hard delete generica implementata.
- Diagnostics spostati in sezione secondaria/collassabile.
- Copy inglese del detail ripulito da testo misto italiano/inglese.

### Check finali

- `npm run verify` PASS.
- `npm run test:foundation` PASS, `338/338`.
- `git diff --check` PASS.
- Supabase local: migration `20260616120000` presente in `supabase migration list --local`.

### QA autenticata locale

Runtime ufficiale usato:

- `PLATFORM_LOCAL_DEV_PORT=3055 npm run platform:local:dev`
- Supabase local attivo; account sintetico locale preparato con
  `npm run platform:local:seed`.

Percorsi verificati:

- `/platform/shops` PASS.
- `/platform/shops/e4034418-c0eb-471b-bda3-a76f5789dd45` PASS.
- `/platform/users` PASS.
- `/platform/users/9abd6961-fa12-4cd2-9d95-075f7f5eb3fe` PASS.

Note QA:

- Detail archived mostra `Status: Archived`,
  `Operational access: Disabled`, lifecycle con quattro stati visibili e
  transizioni controllate.
- Form lifecycle non tagliato nel viewport desktop verificato.
- Ownership mostra ricerca profilo, `Assign as`, opzioni `shop_owner` /
  `shop_manager`, reason e conferma shop code.
- Danger Zone mostra Archive reversibile, purge/delete bloccati, preview
  dipendenze e conferma futura `DELETE <shop_code>`.
- Nessun testo `Record archiviato` / `soft-deleted` visibile nella UI inglese.
- Nessuna vecchia card `Visible` / `RLS detail lookup` nel detail shop.

### Evidence

Screenshot salvati in `docs/TASKS/EVIDENCE/TASK-067/`.

### Rischi residui

- QA Playwright su Next dev ha richiesto reload controllato quando una
  navigazione client lasciava temporaneamente una shell RSC vuota; il reload
  produceva la pagina corretta e i check visivi passavano.

## Follow-up safe force purge - 2026-06-17

Stato finale riconciliato: `DONE_RECONCILED`.

Aggiornamento:

- Aggiunta RPC `platform_force_purge_test_shop` per soli shop archived con
  codice sintetico/test/local/staging.
- La preview purge mostra conteggi server-side completi e distingue normal
  purge dependency-free da force purge test shop.
- Prima della cancellazione viene scritto audit globale
  `platform.shop.purge.snapshot` con snapshot shop, membership, audit e
  dipendenze.
- Le membership vengono gestite come `delete_after_global_snapshot` solo per
  shop test/synthetic.
- Le audit rows shop-scoped vengono salvate nello snapshot globale e poi
  rimosse tramite guard server-side per liberare la FK verso `shops`.
- Audit globale finale `platform.shop.purge.success` resta consultabile anche
  dopo la delete dello shop.
- Production/non-test hard delete resta bloccato con `unsafe_purge_target`.

Check follow-up:

- `npm run typecheck` PASS.
- `npm run lint` PASS.
- `npm run security:scan` PASS.
- `npm run test:foundation` PASS, `342/342`.
- `npm run build` PASS.
- `npm run verify` PASS.
- `git diff --check` PASS.
- `supabase migration up --local` PASS.

QA autenticata follow-up:

- Runtime ufficiale: `PLATFORM_LOCAL_DEV_PORT=3055 npm run platform:local:dev`.
- `/platform/shops`, detail shop force purge, `/platform/users` e user detail
  verificati.
- Force purge via UI su shop sintetico archived con 1 membership e 1 audit row:
  PASS, con snapshot/success globali verificati via query DB.

Rischi residui follow-up:

- Hard delete production resta non disponibile; usare Archive.
- User purge/auth.users resta fuori scope.
- Force purge gestisce le FK shop note al momento; nuove tabelle future con FK
  verso `shops` richiederanno aggiornamento esplicito della preview/RPC.
- TASK-065/OAuth resta task separato e non e stato modificato in questa
  reconciliation.

## Final reconciliation - 2026-06-17

Stato finale: `DONE_RECONCILED`.

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
  `platform.shop.purge.snapshot` e audit globale finale
  `platform.shop.purge.success`.

Decisioni residue esplicite:

- Production hard delete resta bloccato; usare Archive.
- User purge/auth.users resta fuori scope.
- TASK-065/OAuth resta separato e non viene modificato da `TASK-067`.
