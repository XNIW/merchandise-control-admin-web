# Riconciliazione remote residual evidence TASK-150

## Scope ed esito

Questo record riconcilia le evidence repository e GitHub rese disponibili dopo
il checkpoint TASK-150 pre-deploy originale. Non esegue staging, non modifica
codice runtime, non autorizza Run 5, non dimostra l'acceptance terminale e non
modifica production.

- Baseline evidence Admin: `origin/main` a
  `dfb6e8c179ad50b6e2b103742ee4accf641c43ac`.
- Baseline evidence Win7POS: `origin/main` a
  `eb89072f2726bd8d024b29b359d7034d1720d0df`.
- TASK-150 resta `ACTIVE / EXECUTION`.
- TASK-149 resta `REVIEW_READY / REVIEW`.
- Production, Android e iOS: `NOT_MODIFIED` da questa riconciliazione.

## Evidence di integrazione repository

### Admin

Le seguenti modifiche TASK-150 risultano unite normalmente in Admin `main`. I
check PR non skipped riportati da GitHub sono `SUCCESS` per database migration
e pgTAP, Verify e Cloudflare build.

| PR    | Head                                       | Merge                                      | Scopo                                      |
| ----- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| `#62` | `7e449032dc093c381e04c0216573958581547d43` | `cfeb9f4393370bb92be39ec1164f458141decfcb` | boundary QA staging-only                   |
| `#63` | `6375add122587903dcc456b530ba32cdff68e273` | `b63ef641d68e3074dd490251e20dfbf1ddf4ec7a` | remap migration staging                    |
| `#64` | `93ddef4462f1c1da932234b99d057482e5bcbeab` | `07714223693394e5c7d5fe6dffbaa84a9fd548d7` | verifier bounded della propagazione route  |
| `#65` | `5d2dfb523279fb4c7221b28c946b3f95144d7441` | `a176ff2642a3c0c5bd36754ba51b013ed6386db8` | compatibilità service role opaca           |
| `#66` | `51495e73b3b1dbee6af1fe15da11e9833f211634` | `f259e3e049bc31bce9a57afe466142109b081eec` | correzioni response contract               |
| `#68` | `76cbd1963b17cee5a1b9cba5a1a80ac346bc4feb` | `349fd51b1db00278fc23a218aea1d9bdcf8b7ef2` | recovery cleanup Storage Run 4             |
| `#69` | `c077d3c397ac46df0645d2aaef0bfcbeab0e1cfc` | `86d94d11ed4ee137dc47353fdb0fdc8e8c97dd37` | proiezione ledger migration shared staging |
| `#70` | `44fa6b385e582c08fbe7e102ddf62e77d93ef8d2` | `dfb6e8c179ad50b6e2b103742ee4accf641c43ac` | riconciliazione ledger staging più recente |

### Win7POS

La Phase B e le sue correzioni bounded risultano unite normalmente tramite le
PR da `#73` a `#83`. GitHub riporta `SUCCESS` per CI, Security Supply Chain e
CodeQL sulla head finale di ogni PR. La merge di delivery Phase B è
`976b71c8b91549f12dbdf091ed5a302fe9e789c3`; l'ultima merge di test correlata a
TASK-150 è `9986c676b23753381c63c99b363a7d253e356eeb`.

Questo prova che il vecchio marker `Phase B PR/CI/normal merge = NOT_RUN` è
obsoleto. Non prova staging acceptance, package o acceptance Windows 7 fisico.

## Evidence workflow staging

Qui vengono conservati soltanto identificatori bounded delle run ed esiti.

| Workflow run  | Head esatta                                | Esito  | Scope provato                                                                      |
| ------------- | ------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| `30673601050` | `b63ef641d68e3074dd490251e20dfbf1ddf4ec7a` | `PASS` | dry-run guarded; step apply skipped                                                |
| `30673642803` | `b63ef641d68e3074dd490251e20dfbf1ddf4ec7a` | `PASS` | apply migration TASK-150 base e verifica schema/grant                              |
| `30701976316` | `a176ff2642a3c0c5bd36754ba51b013ed6386db8` | `PASS` | dry-run compatibility guarded; step apply skipped                                  |
| `30702026325` | `a176ff2642a3c0c5bd36754ba51b013ed6386db8` | `PASS` | apply migration compatibility e verifica schema/grant                              |
| `30731902516` | `dfb6e8c179ad50b6e2b103742ee4accf641c43ac` | `PASS` | dry-run recovery guarded; step apply skipped                                       |
| `30731931483` | `dfb6e8c179ad50b6e2b103742ee4accf641c43ac` | `PASS` | apply migration recovery, ledger esatto e verifica schema/grant                    |
| `30732082208` | `dfb6e8c179ad50b6e2b103742ee4accf641c43ac` | `PASS` | recovery assenza exact Storage Run 4; cleanup commit intenzionalmente non chiamato |

Il workflow Cloudflare `30673697424` ha eseguito il deploy Worker staging ma ha
fallito la verifica route immediata durante la propagazione. I deploy bounded
corretti `30674704194` a
`07714223693394e5c7d5fe6dffbaa84a9fd548d7` e `30713577326` a
`f259e3e049bc31bce9a57afe466142109b081eec` hanno completato con successo
route verification e staging smoke. I job production sono rimasti skipped in
tutti e tre i workflow.

Tutti e tre i workflow hanno raggiunto lo step `Deploy Worker staging` e
consumano il massimo registrato di tre deploy Admin staging. Il budget esistente
non autorizza un ulteriore deploy TASK-150.

Le evidence pubbliche usano inoltre il numero Run 4, mentre il task registra un
massimo di tre run staging mutative. Non è possibile determinare dalle evidence
canoniche disponibili se ogni tentativo numerato abbia oltrepassato il confine
mutativo. Questa ambiguità non viene risolta per inferenza: il budget run resta
fail-closed e nessuna ulteriore run è autorizzata.

## Evidence acceptance e gate residui

- La PR Win7POS `#78` registra Run 1 terminal-clean dopo il fence autorevole,
  con zero residui run-owned.
- La PR Win7POS `#81` registra Run 3 arrivata alla prima risposta `intent`
  positiva prima di un `corrupt_response` client fail-closed; il difetto del
  parser è stato successivamente corretto e unito.
- La PR Win7POS `#82` dichiara esplicitamente indisponibile l'evidence canonica
  di Run 4 necessaria a provare eccezione reale e controlli completati/mancanti.
  Dichiara inoltre Run 5 non autorizzata e non avviata.
- La recovery Admin `30732082208` prova solo l'assenza bounded dello Storage di
  Run 4. Per design non chiama il cleanup commit, quindi non prova receipt
  terminale, tutti i residui a zero o snapshot shared invariato.

I seguenti gate restano quindi non verdi:

- matrice staging exact-ID: `FAIL` sull'ultimo tentativo evidenziato e nessun
  rerun finale riuscito;
- fence finale, cleanup terminale, receipt ed equivalenza snapshot shared:
  `BLOCKED`;
- evidence installer/package: `NOT_RUN` nel ledger canonico TASK-150;
- acceptance Windows 7 fisico: `NOT_RUN`;
- transizione a `REVIEW_READY` o `DONE`: non permessa.

Ulteriori mutazioni staging, Run 5 o un nuovo deploy Admin richiedono
autorizzazione esplicita e una nuova decisione di budget. Questa
riconciliazione non costituisce tale autorizzazione.

## Comandi di audit

La riconciliazione ha usato soltanto ispezioni Git e GitHub read-only:

- `git fetch --prune origin`
- `git show origin/main:<authoritative-document>`
- `gh pr view <number> --json ...`
- `gh run list --workflow <workflow> --json ...`
- `gh run view <run-id> --json ...`

Nessun workflow è stato rieseguito e non è stata invocata alcuna azione staging
o production.
