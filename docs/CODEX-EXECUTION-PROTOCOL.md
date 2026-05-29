# Protocollo Execution Codex - Admin Web

## Scopo

Questo protocollo guida Codex quando esegue task Admin Web in fase `EXECUTION` o `FIX`.

## Tipi verifica

- `STATIC`: lettura file, lint, typecheck, scansioni locali, controllo git.
- `BUILD`: build locale del progetto.
- `RUNTIME_LOCAL`: verifica manuale o automatizzata su server locale, solo se richiesta dal task.
- `MANUAL`: review documentale o funzionale con evidence scritta.

## Check minimi

Per task che toccano codice, config o governance eseguire:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git status --short`
- secret scan repository richiesto dal task o dal reviewer

Per task solo planning, i check runtime possono restare `NOT_RUN` se vietati dal task.

## Regole evidence

- Nessun `PASS` inventato.
- `NOT_RUN` richiede motivo.
- `BLOCKED` richiede causa, tentativo e cosa serve per sbloccare.
- `PASS_WITH_NOTES` richiede nota chiara.
- Copiare solo output sintetico, sufficiente a verificare il risultato.
- Non registrare secret, token, project ref sensibili, email reali o path personali non necessari.

## Task UI futuri

- Browser smoke manuale solo se richiesto dal task UI.
- Playwright solo se presente e configurato, oppure pianificato come task separato.
- Screenshot o video solo se richiesti dal task e senza dati reali.

## Handoff obbligatorio

Ogni handoff Codex deve includere:

- file toccati;
- comando build e check eseguiti;
- tabella CA -> evidence aggiornata;
- rischi residui;
- prossima fase;
- prossimo agente;
- azione consigliata.

Codex non marca mai `DONE`.
