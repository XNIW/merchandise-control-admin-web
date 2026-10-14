# TASK-154 - Client Commerce Notification Inbox and Reorder Contract

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `DONE`
- Fase: `REVIEW`
- Handoff: `CODEX_REVIEW_APPROVED_USER_AUTHORIZATION_SATISFIED`
- Dipende da: `TASK-153`
- Planning authority: Client `TASK-050`

Estendere il ledger notifiche esistente con inbox owner-scoped, read/read-all,
pagination/dedup e destinazioni allow-listed. Aggiungere reorder preview/apply
idempotente su prezzo/disponibilità correnti e senza order auto-create.

Review indipendente `APPROVED`, `P0=0/P1=0/P2=0`. Gli eventi payment e after-sales
sono persistiti nella inbox autorevole ma restano inbox-only finché il trasporto push
esterno non viene attivato con policy dedicata; il dispatcher ordine legacy resta
invariato e il milestone regressione è 40/40 `PASS`.
