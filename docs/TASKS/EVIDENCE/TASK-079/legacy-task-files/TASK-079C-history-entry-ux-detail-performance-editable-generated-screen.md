# TASK-079C - History Entry UX, Detail Performance, Editable Generated Screen Parity

## Informazioni generali

- ID: `TASK-079C`
- Titolo: `History Entry UX, Detail Performance, Editable Generated Screen Parity`
- Stato: `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-079C - History Entry UX, Detail Performance, Editable Generated Screen Parity`
- Task base: `TASK-079`, `TASK-079B`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079C/README.md`

## Scopo

Migliorare History Entries Admin Web per avvicinarla a iOS/Android: lista piu
leggibile e meno tecnica, Detail piu veloce e operativo in stile generated
supplier import, modifica sicura di quantita e retail/sale price, salvataggio in
`shared_sheet_sessions` compatibile mobile e sync event reale.

## Non incluso

- Nessun commit, stage, push, deploy, production apply o Supabase apply.
- Nessuna nuova dependency.
- Nessuna tabella, colonna, migration, RLS/RPC nuova.
- Nessun service-role key lato client/browser.
- Nessun secret o dato reale hardcoded.
- Nessun campo inventato tipo `exported_at` o `synced_at`.
- Nessuna duplicazione web-only della History Entry.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Lista History piu chiara/mobile-like, card compatte, diagnostica tecnica fuori dalla card principale. | Review UI + test statico | `PASS` |
| CA-02 | Detail simile a generated/import supplier screen con header, summary, tabella righe e diagnostica collassata. | Review UI + test statico/browser | `PASS` |
| CA-03 | Detail usa resolving prodotto batch/bounded senza N+1 ovvio. | Test foundation/static | `PASS` |
| CA-04 | Quantita e retail/sale price editabili con validazione numerica e purchase read-only. | Test foundation + browser | `PASS` |
| CA-05 | Save aggiorna `shared_sheet_sessions.data`, `session_overlay`, `updated_at`, audit e `sync_events.history_changed`. | Test foundation/static | `PASS` |
| CA-06 | Salvataggio idempotente/ritentabile e autorizzato shop-scoped. | Test foundation/static | `PASS` |
| CA-07 | Import supplier apre il nuovo Detail operativo con righe coerenti. | Test/static + browser local | `PASS` |
| CA-08 | Browser Admin Web, Android e iOS coperti da harness reale o local-only verificabile, senza `NOT_RUN_HARNESS_NOT_AVAILABLE`. | Harness/smoke | `PASS_LOCAL_BROWSER_AND_MOBILE_CONTRACT` |
| CA-09 | Gate progetto eseguiti con risultati reali. | Comandi reali | `PASS` |

## Decisioni iniziali

- Il salvataggio resta sulla stessa `shared_sheet_sessions` creata da Android,
  iOS o Admin Web supplier import.
- Il Detail mutativo passa da Route Handler server-side, non da service-role
  client/browser.
- Le modifiche aggiornano le celle canoniche `quantity` e `retailPrice` /
  `sale price` individuate da header; `purchasePrice` resta read-only.
- `session_overlay.complete` resta allineato a `data`; `editable` conserva il
  formato mobile `[[String]]`.
- Il contratto sync resta `domain="history"`, `event_type="history_changed"`,
  `entity_ids.session_ids`.

## Execution

- File controllati: `PASS`
- Modifiche fatte: `PASS`
- Check eseguiti: `PASS`
- Browser/mobile harness: `PASS`
- Rischi rimasti: `SEE_EVIDENCE`
- Handoff: `READY_FOR_REVIEW`

## Review

- Decisione: `REVIEW_WITH_BLOCKERS_SUPERSEDED_BY_TASK_079D`
- Evidence verificata: `BLOCKED_BY_USER_REVIEW`
- Problemi: `MOBILE_SEMANTICS_BLOCKERS`
- Condizioni per passare a `DONE`: non applicabile finche `TASK-079D` non
  corregge e rivalida i blocker.

### Blocker rilevati in review

- Lista History ancora troppo tecnica e non abbastanza iOS/Android-like.
- Detail confondeva `quantity` sorgente del file con quantita contata/importata
  dall'utente.
- Sale price non era modellato come `RetailPrice` generated/overlay editable.
- Completed/missing poteva essere inferito da product match o diagnostica,
  invece del contratto mobile `session_overlay.complete[row]`.
- Test e browser check del 079C non fallivano sul bug source qty vs counted qty.
