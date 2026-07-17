# 09 - Security diff scan

## Stato

`READY_POST_FIX_SCAN`

Il Changes scan pre-fix ufficiale è conservato in `pre-fix/`: base
`38f02bd969e55df91ff41d3905661da8dfdb145a`, head vulnerabile
`2f166b51e7d3ff68f8f01593cb68845788e7be9a`, copertura `35/35`, quattro
finding Medium/high-confidence e PoC vulnerabile `9/9 PASS`. Non viene
riutilizzato come prova post-fix.

La migration di remediation, i test, i due E2E locali e la PoC post-fix sono
registrati in `post-fix/`. Runtime, regressioni ed evidence sono congelati nel
commit `8891ee20`; il commit successivo aggiorna soltanto questo stato e il
checkpoint di pubblicazione. Il nuovo scan deve usare lo SHA esatto del branch
clean risolto immediatamente prima dell'apertura del workspace.

Il nuovo scan obbligatorio e un **Changes scan** sul repository Admin Web con:

- base `origin/main`;
- head il branch committed e clean
  `validate/mac-final-admin-20260717T150455Z`;
- Deep scan disattivato;
- nessuna modifica del branch dopo il freeze.

Conseguenze finché il nuovo scan non viene completato:

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
