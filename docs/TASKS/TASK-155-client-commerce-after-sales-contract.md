# TASK-155 - Client Commerce After-sales Contract and Admin Queue

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `DONE`
- Fase: `REVIEW`
- Handoff: `CODEX_REVIEW_APPROVED_USER_AUTHORIZATION_SATISFIED`
- Dipende da: `TASK-154`
- Planning authority: Client `TASK-050`

Introdurre case/line/event/mutation/evidence private, RLS owner e staff shop-scoped,
state machine bounded, refund authority provider/manual-attested e coda Admin. Le prove
usano storage privato e una pipeline server-side validata, mai URL pubbliche permanenti.

Review indipendente `APPROVED`, `P0=0/P1=0/P2=0`. Upload massimo tre, claim cleanup
service-only, rimozione fisica tramite Storage API e ACK/retry sono verificati; lo
Storage E2E locale è 1/1 `PASS`. `refunded` resta provider/service-authoritative.
