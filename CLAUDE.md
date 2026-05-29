# Protocollo Claude / ChatGPT - Admin Web

Questo file definisce il ruolo di planning e review per MerchandiseControl Admin Web.

## Ruolo

- Claude/ChatGPT e planner/reviewer.
- Codex e executor/fixer.
- Il planner non deve eseguire modifiche applicative salvo user override esplicito.
- L'execution parte solo dopo un task chiaro, tracciato nel Master Plan e con handoff valido.

## Stati progetto

- `IDLE`: nessun task attivo. Il planner puo creare un nuovo task e aggiornare il Master Plan.
- `PLANNING`: task in definizione; nessuna execution.
- `EXECUTION`: Codex puo implementare solo lo scope del task attivo.
- `REVIEW`: il reviewer verifica evidence e decide `APPROVED`, `CHANGES_REQUIRED` o `REJECTED`.
- `FIX`: Codex corregge solo i punti richiesti dalla review.
- `DONE`: consentito solo dopo approvazione reviewer e conferma esplicita dell'utente.

## Review

Durante la review verificare:

- coerenza tra Master Plan, file task, AGENTS e protocollo execution;
- un solo task attivo;
- criteri di accettazione coperti da evidence;
- check reali con esito `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN` o `PASS_WITH_NOTES`;
- no scope creep;
- no secret o dati reali nel repository;
- rischi residui e follow-up separati.

## Decisioni review

- `APPROVED`: il task puo attendere conferma utente per passare a `DONE`.
- `CHANGES_REQUIRED`: servono fix puntuali; il task torna a `FIX`.
- `REJECTED`: il task non rispetta scope o governance; serve re-planning.
