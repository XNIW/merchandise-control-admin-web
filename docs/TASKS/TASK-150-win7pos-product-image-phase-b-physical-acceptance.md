# TASK-150 - Win7POS Product Image Phase B / Physical Acceptance

## Informazioni generali

- ID: `TASK-150`
- Stato: `PAUSED_FOR_WECHAT_006_STAGING_HANDOFF`
- Fase attuale: `EXECUTION / PAUSED`
- Responsabile attuale: `NONE — EVIDENCE PRESERVED`
- Attivazione: `PAUSED_FOR_WECHAT_006_STAGING_HANDOFF`
- Executor: `NONE WHILE TASK-151 / WECHAT-006 IS ACTIVE`
- Data creazione: `2026-07-30`
- Task precedente:
  `TASK-149 - Trusted POS product image v1 server contract`
  (`REVIEW_READY / REVIEW`)
- Evidence:
  `docs/TASKS/EVIDENCE/TASK-150/README.md`
- Handoff Admin:
  `docs/HANDOFFS/WIN7POS_POS_PRODUCT_IMAGE_V1_READY.md`
- SHA-256 handoff Admin:
  `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87`
- Prompt operativo:
  `docs/HANDOFFS/NEXT-CODEX-ASUS-PRODUCT-IMAGE-PHASE-B.md`
- SHA-256 prompt Asus:
  `f74c569bdba14259a1d7361189b4a6e987919e025c0ca4d97d78e30ec3466b8d`

## Stato di attivazione

Attivato esplicitamente dall'utente il `2026-07-31`, dopo il merge normale
della Phase A Win7POS PR `#72` in
`9bc5b757b78fe7b9212bf5fae359a5559e3da7f9`. Era l'unico task Admin registrato
attivo. L'audit WECHAT-006 del 2026-08-13 non ha trovato writer/processo/lock/
PR/deploy vivo né lavoro non pubblicato fuori dalla evidence già registrata.
Il mandato utente autorizza l'handoff: TASK-150 è messo in pausa, non chiuso e
non riscritto, mentre TASK-151 / WECHAT-006 assume la singola lane Admin.

- Win7POS task coordinato: `ASUS-W7POS-015`.
- Win7POS branch:
  `codex/asus-product-image-phase-b-final-20260731`.
- Admin branch:
  `codex/task-150-win7pos-image-qa-boundary-20260731`.
- Windows 7 fisico: `NOT_RUN`.
- Riconciliazione evidence:
  `docs/TASKS/EVIDENCE/TASK-150/2026-08-08-REMOTE-RESIDUAL-RECONCILIATION.md`.

## Handoff WECHAT-006 — 2026-08-13

- Stato precedente preservato: `ACTIVE / EXECUTION` con limiti già documentati.
- Audit: branch/worktree storici puliti o non più presenti; nessun lock,
  processo Codex/CLI/deploy, PR aperta, workflow in corso o commit Admin non pubblicato.
- Evidence TASK-150 non cancellata, spostata, compressa o riscritta.
- Nuovo writer esclusivo: `TASK-151 / WECHAT-006` sul worktree isolato
  `codex/wechat-006-admin-staging` dall'attuale `origin/main`.
- La ripresa TASK-150 richiede una decisione successiva esplicita; questo
  handoff non autorizza un Run 5 Win7POS.

## Obiettivo

Portare Win7POS dalla foundation product-image offline Phase A alla Phase B
online trusted POS contro il solo staging Admin già consegnato da TASK-149,
con PR/merge normali, boundary cleanup Asus server-side predisposto prima
della prima mutazione, acceptance sintetica exact-ID, cleanup run-scoped a
zero e risultato fisico Windows 7 reale oppure blocker esterno preciso.

## Dipendenze

1. TASK-149 in `REVIEW_READY / REVIEW`, mai promosso implicitamente a `DONE`.
2. Handoff Admin finale con SHA-256 verificato.
3. Prompt Asus finale con SHA-256 verificato e registrato.
4. Win7POS PR `#72` ancora ispezionabile nella head/base dichiarate.
5. Target staging e Worker source/deployment/version verificati.
6. Production esclusa.

Un mismatch blocca l'attivazione prima di autenticazione o DML.

## Sequenza obbligatoria

### Phase A

- Verificare base/head/checks e contenuto della PR Win7POS `#72`.
- Riconciliare l'eventuale avanzamento di `main` tramite merge normale.
- Rieseguire test Core/Data/WPF imaging, build Release/x86/net48, scanner,
  dialog, architecture, package, diff e secret scan.
- Correggere P0/P1/P2, rendere la PR non-draft e unirla normalmente.
- Non inserire Phase B nella PR `#72`.

### Boundary Admin Asus

- Creare task/branch/PR Admin separati e minimi per provisioning exact-template,
  manifest, capability QA, receipt terminale e cleanup run-scoped.
- Usare capability provisioning e cleanup indipendenti, almeno 128 bit
  CSPRNG, digest/HMAC-only server-side, binding staging/run/manifest/actor/
  action, TTL/re-auth/revoca/rate limit verificati.
- Il marker non è una capability.
- Shop, staff, device, sessioni, budget row e data directory devono essere
  isolati e run-owned.
- Snapshot pre-run, enrollment atomico, CAS, expiry/fence e confronto
  post-run devono impedire la cancellazione di righe shared o preesistenti.
- Service role soltanto server-side/off-device, mai sull'Asus.
- PR non-draft, CI verde, merge normale, migration/deploy solo staging.

Stato verificato al `2026-08-08`: boundary e remediation Admin sono presenti su
`main` fino a `dfb6e8c179ad50b6e2b103742ee4accf641c43ac`; le PR `#62`-`#66` e
`#68`-`#70` risultano unite normalmente con database/pgTAP, Verify e build
Cloudflare verdi. I workflow guarded hanno applicato e riverificato le tre
migration TASK-150 registrate. Tre workflow hanno raggiunto il deploy Worker
staging: il primo ha fallito solo la probe immediata durante la propagazione,
i due successivi hanno completato route verification e smoke; production è
rimasta `SKIPPED`.

La Phase B Win7POS e le remediation limitate sono unite normalmente tramite PR
`#73`-`#83`, con CI, Supply Chain e CodeQL verdi. L'acceptance non è però
conclusa: Run 1 è documentata terminal-clean; Run 3 ha prodotto un errore client
poi corretto; per Run 4 manca l'evidence canonica della failure. Il workflow
Admin `30732082208` ha provato l'assenza degli Storage object Run 4 ma, per
design, non ha chiamato il cleanup commit. Mancano quindi receipt terminale,
matrice exact-ID completa, snapshot shared equivalente, package e Windows 7
fisico. Run 5 non è stata autorizzata. TASK-150 resta `ACTIVE / EXECUTION`, non
`REVIEW_READY` e non `DONE`.

### Phase B Win7POS

- Creare branch separata dalla `main` che contiene Phase A.
- Vendorizzare schema/fixture e verificarne gli SHA.
- Implementare envelope trusted, payload hash canonico, idempotenza, CAS,
  intent/upload/finalize/read/replace/remove e catalog fields additivi.
- Preservare default Win7/x86 `16 MP`; il ceiling portabile resta `64 MP`.
- Signed URL e Storage path restano memory-only e fuori SQLite/log/cache key.
- Cache progressiva, offline/retry/response-loss/conflict e UI devono restare
  bounded e fail-closed.
- Nessun cambiamento Android/iOS, production o article/sales scope estraneo.

## Scope

- verifica e merge normale Phase A PR `#72`;
- branch/PR Phase B separata;
- client trusted POS product-image v1;
- cache/UI Phase A online;
- Admin QA provisioning/cleanup minimo e reviewabile;
- staging synthetic acceptance exact-ID;
- packaging e acceptance Windows 7, se l'ambiente è disponibile;
- handoff esterno preciso se il solo hardware resta indisponibile.

## Fuori scope

- deploy/apply production;
- service role, DB password o bearer Supabase sul client;
- dati, prodotti o immagini reali;
- modifiche Android/iOS;
- gallery, multiple image, HEIC Win7, WebP/AVIF;
- refactor generici, sales sync o article-sync non correlato;
- cambi semantici al contratto TASK-149 senza nuova autorizzazione;
- uso della RPC cleanup TASK-149 come cleanup generico Asus.

## Budget di remediation

- massimo `3` cicli di remediation complessivi;
- massimo `3` run staging mutativi complessivi;
- massimo `3` deploy Admin staging complessivi.

Ogni run deve raggiungere cleanup verificato prima del successivo. Fix solo
client non autorizzano un deploy Admin. Budget, outage, permessi, dipendenza o
hardware mancanti producono cleanup sicuro e `BLOCKED_EXTERNAL`, non scope
creep o PASS inventato.

La riconciliazione del `2026-08-08` osserva tre workflow che hanno raggiunto il
deploy Admin staging, incluso il primo terminato in failure dopo l'upload del
Worker. Il budget deploy registrato è quindi consumato. Nessun nuovo deploy o
Run 5 è autorizzato senza una decisione esplicita dell'utente. Le evidence
pubbliche nominano inoltre una Run 4 mentre il budget registra al massimo tre
run mutative: non è possibile ricostruire in modo canonico se ogni tentativo
numerato abbia superato il confine mutativo. L'ambiguità resta fail-closed e
blocca ulteriori run.

## Criteri di accettazione

1. Handoff Admin TASK-149, schema, fixture e digest verificati.
2. PR Win7POS `#72` revisionata, required checks verdi e merge normale
   registrato come Phase A.
3. Branch/PR Phase B separata, review indipendente
   `P0/P1/P2/P3 = 0/0/0/0`, CI verde e merge normale.
4. Boundary Admin cleanup/provisioning exact-template merged e validato prima
   della prima mutazione staging.
5. Capability provision/cleanup/result indipendenti, bounded, digest-only e
   fail-closed su guessed/stale/cross-binding/replay.
6. Nessuna riga budget, sessione o attore shared/preesistente cancellata o
   riusata come run-owned.
7. Contract/golden, Core/Data, WPF imaging, full tests/build Release x86,
   scanner, security, Gitleaks e package gate realmente PASS.
8. Fixture staging exact-ID completa intent/upload/finalize/read/replay/
   response-loss/replacement/conflict/remove/catalog/full-drain.
9. HTTP 503, exceeded resource, server error, exception, secret/URL/path
   match e retry loop: `0`.
10. Fence autorevole di almeno `2 h 05 min` rispettato prima del cleanup.
11. Products, versions, Storage objects, receipts, events, run-owned budgets,
    sessioni e attori attivi residui: `0`; immutable audit e receipt terminale
    preservati; snapshot shared invariato.
12. Windows 7 fisico:
    - `PASS` con evidence reale; oppure
    - `EXTERNAL_PENDING` / `REVIEW_READY_EXTERNAL_WIN7_PHYSICAL` con handoff,
      package e blocker preciso.
13. Production, Android e iOS:
    `NOT_MODIFIED`.
14. TASK-150 resta fuori da `DONE` finché manca review positiva e conferma
    esplicita dell'utente.

## Evidence richiesta

- revisioni/ancestry/PR/CI/merge;
- digest contract/schema/fixture/package;
- comandi test realmente eseguiti con conteggi;
- review indipendente;
- run HMAC e soli conteggi redatti;
- deployment/version staging senza raw account/URL/segreti;
- receipt cleanup terminale e retrieval response-loss zero-DML;
- snapshot pre/post shared equivalente;
- ownership/ACL del contenitore DPAPI QA e profilo shared invariato;
- physical PASS o handoff esterno.

## Esiti ammessi

- `REVIEW_READY`
- `REVIEW_READY_EXTERNAL_WIN7_PHYSICAL`
- `BLOCKED_EXTERNAL`
- `BLOCKED_EXTERNAL_AUTHORIZATION_REQUIRED`
- `BLOCKED_EXTERNAL_REMEDIATION_BUDGET_EXHAUSTED`

`DONE` non è un esito executor. Richiede review positiva e conferma esplicita
dell'utente.
