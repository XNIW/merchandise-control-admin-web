# Evidence TASK-150

## Stato

- Task: `TASK-150`
- Stato: `DRAFT`
- Fase: `PLANNING`
- Attivazione: `NOT_ACTIVE`
- Responsabile: `CLAUDE / ChatGPT / PLANNER`
- Executor previsto:
  `CODEX / ASUS (solo dopo attivazione esplicita)`
- Runtime/staging/physical run TASK-150:
  `NOT_RUN_NOT_ACTIVE`

Questo file è uno skeleton di evidence. Non contiene PASS Phase B, non
autorizza mutazioni e non porta TASK-150 a `DONE`.

## Dipendenza TASK-149

- TASK-149:
  `REVIEW_READY / REVIEW`.
- Risoluzione:
  `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`.
- Runtime/tooling Admin pin:
  `d3c674ada8aa7abf0179355c09238472b9ff3023`.
- Worker source:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`.
- Schema POS SHA-256:
  `74bd4b7f86a05b6180c133c86a47ae70be99a6f8012c8bfb747d7b18c714ceb0`.
- Contratto portabile SHA-256:
  `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`.
- Handoff Admin SHA-256:
  `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87`.
- Prompt Asus SHA-256:
  `f74c569bdba14259a1d7361189b4a6e987919e025c0ca4d97d78e30ec3466b8d`.

I due digest sono calcolati sui file finali congelati. Qualunque mismatch nel
preflight blocca l'attivazione prima di autenticazione o mutazioni.

## Baseline da acquisire all'attivazione

- Admin final docs merge e ancestry:
  `NOT_RUN_NOT_ACTIVE`.
- Win7POS `origin/main`:
  `NOT_RUN_NOT_ACTIVE`.
- Win7POS PR `#72` base/head/draft/checks:
  `NOT_RUN_NOT_ACTIVE`.
- Android/iOS revisioni read-only:
  `NOT_RUN_NOT_ACTIVE`.
- Staging deployment/version:
  `NOT_RUN_NOT_ACTIVE`.
- Production:
  `NOT_MODIFIED`.

## Matrice evidence pianificata

| Gate | Stato iniziale |
| --- | --- |
| Handoff/schema/fixture digest | `NOT_RUN_NOT_ACTIVE` |
| Phase A review/checks/normal merge | `NOT_RUN_NOT_ACTIVE` |
| Admin QA boundary RED/GREEN | `NOT_RUN_NOT_ACTIVE` |
| Admin PR/CI/normal merge | `NOT_RUN_NOT_ACTIVE` |
| Admin migration/deploy staging | `NOT_RUN_NOT_ACTIVE` |
| Phase B contract/golden | `NOT_RUN_NOT_ACTIVE` |
| Core/Data/WPF imaging/full build | `NOT_RUN_NOT_ACTIVE` |
| Security/Gitleaks/package | `NOT_RUN_NOT_ACTIVE` |
| Phase B PR/CI/normal merge | `NOT_RUN_NOT_ACTIVE` |
| Staging acceptance exact-ID | `NOT_RUN_NOT_ACTIVE` |
| Fence `2 h 05 min` | `NOT_RUN_NOT_ACTIVE` |
| Cleanup/residui run-scoped | `NOT_RUN_NOT_ACTIVE` |
| Windows 7 fisico | `NOT_RUN_NOT_ACTIVE` |
| Production/Android/iOS | `NOT_MODIFIED` |

## Guardrail evidence

- Nessun raw run marker, UUID, Auth ID, token, credential, DPAPI blob, signed
  URL, Storage path, body sensibile, nome/barcode reale o array exact-ID.
- Pubblicare soltanto run HMAC, digest, conteggi, safe code e timestamp
  bounded.
- Ogni `PASS` deve provenire da un comando o controllo realmente eseguito.
- `NOT_RUN` e `BLOCKED_EXTERNAL` non possono essere promossi.
- Zero residual indica soltanto il delta run-scoped rispetto allo snapshot
  pre-run, non l'intero staging globale.
- Immutable audit e terminal cleanup receipt non sono residui da eliminare.

## Condizione di attivazione

Un nuovo comando esplicito dell'utente deve:

1. attivare TASK-150;
2. impostare un solo task attivo;
3. passare stato/fase a `ACTIVE / EXECUTION`;
4. assegnare `CODEX / ASUS`;
5. verificare i digest congelati;
6. eseguire il preflight senza mutazioni.

Fino ad allora questo file resta `DRAFT / PLANNING / NOT_ACTIVE`.
