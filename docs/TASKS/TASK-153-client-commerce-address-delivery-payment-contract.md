# TASK-153 - Client Commerce Address, Delivery and Payment Contract

## Informazioni generali

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `DONE`
- Fase: `REVIEW`
- Responsabile: `NONE`
- Data creazione: `2026-08-22`
- Planning authority: Client `TASK-050`
- Handoff: `CODEX_REVIEW_APPROVED_USER_AUTHORIZATION_SATISFIED`

## Scope

Estendere additivamente Address V2 e delivery context, riusare fulfillment/fee/slot e
payment aggregate esistenti, aggiungere preview server-authoritative, context version e
recovery read-only. Aggiungere RLS/grants/pgTAP e i read model Admin strettamente
necessari. Nessuna migration production o nuovo provider.

## Criteri

- E.164, coordinate opzionali bounded, legacy/default/delete/version conflict;
- owner/cross-owner/shop scope e context stale-deny;
- fee/slot/zone derivati dalle authority correnti;
- payment replay/timeout e online `notConfigured` fail-closed;
- suite database, foundation, verify e security diff-scoped.

## Planning

Si applicano l’unica architecture map e l’unica file map in Client TASK-050. Nessun
secondo piano è prodotto nel repository Admin.

## Execution e review

- Migration additiva Address V2, delivery context, quote v2 e payment recovery
  implementata senza apply production e senza nuovo provider.
- Review indipendente diff-scoped conclusa `APPROVED`; finding finali
  `P0=0`, `P1=0`, `P2=0` dopo i fix batch bounded autorizzati.
- Il gate regressione ha spostato l'arricchimento telefono/versione dalla quote allo
  snapshot ordine immutabile, preservando il contratto checkout v1.
- Online payment resta `notConfigured` fail-closed; nessun successo simulato.
- L'autorizzazione `USER_APPROVER` del 2026-08-22 copre la chiusura tecnica e il merge
  normale dopo CI exact-SHA verde.

## Evidence finale locale

- `supabase db reset`: `PASS`.
- `supabase test db`: `PASS`, 48 file / 2618 test.
- `supabase db lint --local --level warning`: exit `0`; soli warning legacy fuori diff.
- `npm run verify`: `PASS`, inclusi security scan, Next build e typecheck.
- `npm run lint`: `PASS`.
- Test mirati checkout 57/57, payment 37/37, address 64/64 e milestone 40/40: `PASS`.
- Foundation pertinente 15/15 e commerce 8/8: `PASS`.
- Foundation completa: 985 pass, 8 skip, 2 `BLOCKED_ENV` per checkout Win7POS
  read-only assente; boundary invariato ed evidence precedente riutilizzata.
