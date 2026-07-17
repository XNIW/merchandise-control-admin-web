# 09 - Security diff scan

## Stato

`BLOCKED_SETUP_NOT_STARTED`

La precedente selezione working-tree e stale e non deve essere riutilizzata.
Non copreva in modo immutabile i file untracked e precede le patch minime del
consolidamento Mac.

Il nuovo scan obbligatorio e un **Changes scan** sul repository Admin Web con:

- base `origin/main`;
- head il branch committed e clean
  `validate/mac-final-admin-20260717T150455Z`;
- Deep scan disattivato;
- nessuna modifica del branch dopo il freeze.

Conseguenze finche l'utente non avvia il nuovo scan:

- preflight, threat model, discovery, validation e attack-path ufficiali non
  sono conclusi;
- non esiste un report finale e non viene dichiarato `PASS` o zero nuovi
  finding;
- gli scanner repository-native e i gate funzionali restano controlli
  distinti, non sostitutivi;
- nessun Deep Security Scan e stato avviato.

Base/head SHA, numero file e gate finali vengono comunicati nel checkpoint
`ACTION_REQUIRED_SECURITY_SCAN_READY` soltanto dopo commit, worktree clean e
gate verdi sul branch validate.
