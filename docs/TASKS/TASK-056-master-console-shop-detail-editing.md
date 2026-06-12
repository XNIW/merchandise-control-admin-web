# TASK-056 - Master Console shop detail editing and row navigation shortcut

## Informazioni generali

- ID: `TASK-056`
- Titolo: `Master Console shop detail editing and row navigation shortcut`
- Stato: `DONE_RECONCILED`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `REVIEWER_DONE_GATE`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-056/README.md`
- Nota governance: TASK-055 e TASK-056 sono stati riconciliati a `DONE_RECONCILED`
  dalla final review / DONE gate richiesta dall'utente il 2026-06-11.

## Scope

Implementare in Master Console:

- scorciatoia row navigation da `/platform/shops` al dettaglio shop;
- sezione `Edit shop profile` nel full detail shop;
- update server-side dei dati principali shop, autorizzato `platform_admin` e auditato.

## Campi modificabili

- `Shop name`
- `Company RUT`
- `Giro`
- `Address`
- `City`
- `Legal representative RUT`

## Esclusioni

- Nessun update da Shop Admin Settings.
- Nessun cambio `shop_code`, `shop_id`, owner/members, lifecycle, device state,
  staff/PIN/password o catalogo.
- Nessuna nuova dipendenza.
- Nessun dato finto o secret hardcoded.
- Nessun service-role client/browser.
- Nessun deploy production/cloud apply.
- Nessun commit, push o stage finale.
- Nessun commit, push o stage finale.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | TASK-056 aperto con evidence dedicata; TASK-055 e TASK-056 chiusi solo dopo DONE gate finale reale. | `PASS` |
| CA-02 | In `/platform/shops`, single click seleziona la riga/inspector; double click apre il full detail; Enter apre il full detail; Copy non naviga. | `PASS` |
| CA-03 | `/platform/shops/[shopId]` espone card `Edit shop profile` con i campi approvati, reason e confirmation. | `PASS` |
| CA-04 | Il form non permette edit di `shop_code`, `shop_id`, owner/members, lifecycle, staff/PIN/password/device/catalogo. | `PASS` |
| CA-05 | Company RUT e Legal representative RUT accettano input compatto/formattato e vengono normalizzati per storage. | `PASS` |
| CA-06 | Update server-side autorizzato solo da Platform Admin attivo tramite resolver server-side. | `PASS` |
| CA-07 | Update + audit sono atomici tramite RPC; evento `platform.shop.profile_update`; audit fallisce chiuso. | `PASS` |
| CA-08 | Nessun service-role client/browser e nessun secret in UI/test/evidence. | `PASS` |
| CA-09 | Review fix: il blocco edit inline e sostituito da trigger `Edit` in una sezione detail con dialog accessibile. | `PASS` |
| CA-10 | Review fix 2: il full detail mostra `Shop profile & fiscal identity` read-only con campi profilo/fiscali completi, fallback `Not configured` e trigger `Edit` vicino ai dati che modifica. | `PASS` |
| CA-11 | Review fix 2: `Operational summary` mostra solo aggregati disponibili o `Not available through current boundary`, senza inventare catalog/staff data e senza nuova migration. | `PASS` |

## Matrice test/check

| Check | Stato |
|---|---|
| `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs` | `PASS` |
| `npm run test:foundation` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run typecheck` | `PASS` |
| `npm run security:scan` | `PASS` |
| `npm run build` | `PASS_WITH_WARNINGS` |
| `npm run verify` | `PASS_WITH_WARNINGS` |
| `npm run test:platform:local` se Supabase locale disponibile | `PASS` |
| `npm run test:platform:local-login` se coerente con harness locale | `PASS` |
| `npm run test:platform:local-shop-profile` | `PASS` |
| `supabase db lint --local --schema public,app_private --fail-on error` | `PASS` |
| `supabase migration list --local` | `PASS` |
| `git diff --check` | `PASS` |
| `git status --short --untracked-files=all` | `PASS_WITH_EXISTING_DIRTY_WORKTREE` |

## Execution

- RED iniziale:
  - `node --test tests/foundation/task-056-master-console-shop-detail-editing.test.mjs`:
    `FAIL` atteso, 0/5 PASS e 5/5 FAIL.
- Modifiche previste:
  - tracking task/evidence;
  - row shortcut in `PlatformMasterDetail`;
  - edit card in shop detail;
  - route/form submit server-side;
  - service server-only + validation;
  - migration RPC auditabile;
  - update tipi Supabase;
  - check e handoff.
- GREEN implementazione:
  - row selection preservata e full detail aperto via double click/Enter;
  - form `Edit shop profile` aggiunto nel full detail shop;
  - update server-side via route no-store, resolver Platform Admin e RPC `platform_update_shop_profile`;
  - audit `platform.shop.profile_update` scritto nello stesso RPC;
  - migration applicata solo al DB locale per lint/list.
- Check finali:
  - `npm run verify` PASS_WITH_WARNINGS per warning noti Next/Node;
  - `npm run test:platform:local` riallineato al provisioning TASK-051 e
    rieseguito con env locale: `PASS`, 1/1;
  - `npm run test:platform:local-login` eseguito con gate/env sicuri e cleanup:
    `PASS`, 1/1;
  - `npm run test:platform:local-shop-profile`: `PASS`, 1/1.
- Review fix dialog:
  - il form non e piu una card sempre visibile sotto le sezioni informative;
  - `SectionCard` supporta azioni opzionali e il trigger `Edit` viene
    agganciato alla sezione detail che contiene i dati modificati;
  - il dialog usa `role="dialog"`, `aria-modal="true"`, titolo,
    descrizione, Close, Cancel e submit;
  - route POST, validazione, RPC auditata e migration restano invariati;
  - nessuna nuova migration aggiunta per il review-fix.
- Review fix 2 detail read-only:
  - `Overview` resta pulita con Shop name, Shop code, Shop ID e Status;
  - nuova card `Shop profile & fiscal identity` mostra anche Company RUT,
    Giro, Address, City, Legal representative RUT, Created e Updated;
  - il trigger `Edit` ora e nella card `Shop profile & fiscal identity` con
    `aria-label="Edit shop profile and fiscal identity"`;
  - il dialog edit continua a modificare solo campi gia visibili nella card
    read-only e non rende `shop_code` editabile;
  - nuova card `Operational summary` mostra membri, owner, manager, device,
    audit e sync come aggregati; catalog counts non disponibili restano
    `Not available through current boundary`;
  - nessuna nuova migration, nessun cambio RPC/schema e nessun dato finto.

## Review

- Handoff Codex: `DONE_RECONCILED`.
- Conferma esplicita utente: brief `Final Review / DONE Gate - TASK-055 + TASK-056 Admin Web` del 2026-06-11.
- Problemi trovati e corretti durante review:
  - E2E legacy TASK-045 riallineato al form provisioning unificato post-TASK-051,
    agli event key audit transazionali e al logout button reale.
  - Aggiunto E2E locale TASK-056 con fixture sintetica Platform Admin/shop,
    update profilo auditato e cleanup non mutabile.
  - Corretto tipo del helper Supabase nel nuovo E2E per `PostgrestSingleResponse`
    con `data` nullable su failure.
- Warning residui non bloccanti:
  - Next `middleware` deprecato verso `proxy`.
  - Node `[DEP0205] module.register()`.
- Nessun commit, push o stage finale.
