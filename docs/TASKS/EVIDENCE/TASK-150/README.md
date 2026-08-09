# Evidence TASK-150

## Stato

- Task: `TASK-150`
- Stato: `ACTIVE`
- Fase: `EXECUTION`
- Attivazione: `ACTIVE`
- Responsabile: `CODEX / ASUS`
- Executor: `CODEX / ASUS`
- Runtime/staging/physical run TASK-150:
  `BLOCKED / NOT_ACCEPTED`

TASK-150 è stato attivato esplicitamente dall'utente il `2026-07-31`. Questo
file registra solo evidence realmente osservata; l'attivazione non costituisce
un PASS e non porta TASK-150 a `DONE`.

La riconciliazione read-only del `2026-08-08` è registrata in
`docs/TASKS/EVIDENCE/TASK-150/2026-08-08-REMOTE-RESIDUAL-RECONCILIATION.md`.
Corregge i precedenti marker PR/CI/merge/staging ormai obsoleti, ma non promuove
l'acceptance incompleta.

## Attivazione 2026-07-31

- Win7POS Phase A PR `#72`: `MERGED_NORMAL`.
- Phase A head:
  `7042d88bb4d2d30e38ef48e5f5ff83ced39db9a2`.
- Phase A merge:
  `9bc5b757b78fe7b9212bf5fae359a5559e3da7f9`.
- Phase A required checks: `PASS` (`CI`, `CodeQL`, Supply Chain).
- Win7POS task coordinato: `ASUS-W7POS-015`.
- Win7POS branch:
  `codex/asus-product-image-phase-b-final-20260731`.
- Admin baseline/branch:
  `d2689f15f0291670bbc2713967368521e3f3a7fe` /
  `codex/task-150-win7pos-image-qa-boundary-20260731`.
- Android pin read-only:
  `4b2b4a93dd5d4db7d1cfb83e897aa5cbac40366e`.
- iOS pin read-only:
  `c1b7b706c5f05cd7e8dda74cea1122f6483df7ec`.
- Windows 7 fisico: `NOT_RUN`.
- Production: `NOT_MODIFIED`.

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

## Baseline acquisita all'attivazione

- Admin final docs merge e ancestry:
  `PASS` su `d2689f15f0291670bbc2713967368521e3f3a7fe`.
- Win7POS `origin/main`:
  `9bc5b757b78fe7b9212bf5fae359a5559e3da7f9`.
- Win7POS PR `#72` base/head/draft/checks:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d` /
  `7042d88bb4d2d30e38ef48e5f5ff83ced39db9a2` / `READY` / `PASS`, poi
  merge normale `9bc5b757b78fe7b9212bf5fae359a5559e3da7f9`.
- Android/iOS revisioni read-only:
  `4b2b4a93dd5d4db7d1cfb83e897aa5cbac40366e` /
  `c1b7b706c5f05cd7e8dda74cea1122f6483df7ec`.
- Staging deployment/version:
  `NOT_RUN_NOT_ACTIVE`.
- Production:
  `NOT_MODIFIED`.

## Boundary QA staging-only — checkpoint storico pre-deploy

- Migration additiva:
  `20260731162000_task_150_win7pos_product_image_qa_boundary.sql`.
- Route server-only/no-store:
  `POST /api/qa/win7pos-product-image`; il route limita e decodifica al massimo
  `16 KiB`, poi host e progetto Supabase devono corrispondere esattamente allo
  staging pin dichiarato prima di autenticazione, RPC o DML.
- Template unico:
  `asus-product-image-phase-b-fixture-v1`; marker namespace da `128 bit`,
  capability separate da `256 bit` derivate con HMAC dal marker CSPRNG e dal
  request binding. Sono ricostruibili soltanto dal server per rendere loss-safe
  begin/rotation/result e persistite esclusivamente come digest/HMAC.
- Codici legacy:
  `shop_code` e `staff_code` sono derivazioni HMAC separate e bounded a `32`
  caratteri; il namespace completo da `128 bit` resta nei nomi, barcode e
  device identity che lo supportano.
- Actor binding:
  ogni management action resta legata allo shop/staff trusted bootstrap
  originale con UUID normalizzati; quota cross-run serializzata limita a una
  run non terminale e tre start ogni sei ore per bootstrap actor.
- Provisioning:
  una RPC admission capability-bound e rate-limited precede il KDF scrypt;
  capability errate non possono consumare CPU/memoria KDF. Il catalog owner
  della run è un Auth/profile sintetico distinto, così il mapping shared già
  attivo del bootstrap non viene riusato né modificato.
- Prearm/HTTP:
  fence massimo `created_at + 3 h`, coverage verificata prima del DML ed exact
  replay non scorrevole; la route legge lo stream a blocchi e lo interrompe
  oltre `16 KiB` anche senza `Content-Length`.
- Cleanup:
  acquire/commit con generation monotona, owner digest, lease, safety fence e
  CAS. Il boundary non esegue I/O Storage esterno non transazionale: acquire
  verifica prima che gli exact Storage object run-owned siano già assenti e
  risponde `storage_cleanup_incomplete` senza chiudere il run se non lo sono.
- Commit:
  revoca/archivia gli exact attori, sessioni, device credential e budget
  run-owned nella stessa transazione fenced; receipt terminale count-only,
  content-bound HMAC e immutabile; result retrieval `STABLE` e read-only.
  Dopo `cleaned`, il bootstrap actor può ottenere una nuova capability result
  short-lived e recuperare la stessa receipt anche dopo response loss/expiry.
- Tabelle private:
  `service_role` ha accesso diretto `SELECT` soltanto; tutte le mutazioni
  passano dalle funzioni `SECURITY DEFINER` con grant service-role-only.
- Test statico/foundation mirato:
  `PASS 13/13`; il gate aggiuntivo vincola migration workflow exact-delta,
  staging-only, conferma esplicita e secret HMAC Worker dedicato.
- TypeScript:
  `next typegen PASS`, `tsc --noEmit PASS`, ESLint focused `PASS`.
- Parser PostgreSQL:
  `pglast PASS`, migration e pgTAP entrambi parse-validi (`81` statement nella
  migration corrente).
- Review indipendente iniziale:
  `P0/P1/P2/P3 = 0/4/6/2`; tutti i finding sono stati corretti e la re-review
  finale è `PASS`, con `P0/P1/P2/P3 = 0/0/0/0`.
- pgTAP runtime/container:
  `NOT_RUN`; Docker Desktop non è installabile in questa sessione non elevata
  e la virtualizzazione firmware della macchina risulta disabilitata. È il
  risultato locale storico; il successivo pgTAP CI è `PASS` come registrato
  nella matrice corrente.
- Deploy/migration staging:
  questo marker appartiene al checkpoint pre-PR ed è superato dalla
  riconciliazione del `2026-08-08`; non usarlo come stato corrente.
- Deploy path predisposto:
  workflow migration TASK-150 guarded `dry-run/apply`, exact single pending
  migration e post-verifica schema/grant; deploy Worker `staging` installa la
  chiave HMAC da GitHub environment secret tramite stdin e verifica il route
  con una probe non autenticata/non mutativa. Nessun job production è stato
  aggiunto o modificato.
- Primo run CI database/pgTAP sul commit boundary:
  `FAIL` perché l'archiviazione dello shop QA lasciava nullo l'actor richiesto
  da `shops_archived_actor_required`. Correzione: il bootstrap profile shared,
  già autorizzato e non mutato, resta soltanto come actor audit obbligatorio;
  owner Auth sintetico e altri riferimenti lifecycle run-owned continuano a
  essere rimossi. pgTAP e foundation ora verificano questa shape; il rerun CI
  sul commit corretto era richiesto prima del merge ed è poi risultato `PASS`
  nella PR `#62`.
- Review indipendente incrementale del deploy path:
  corretti fail-fast HMAC, header probe, stdin Docker, scope step-only dei
  secret, hard-pin del project ref staging e exact set/grant post-verifica.
  Esito finale `PASS`, `P0/P1/P2/P3 = 0/0/0/0`.

## Matrice evidence corrente — riconciliazione 2026-08-08

| Gate | Stato verificato |
| --- | --- |
| Handoff/schema/fixture digest | `PASS` |
| Phase A review/checks/normal merge | `PASS` |
| Admin QA boundary RED/GREEN | `PASS` — PR `#62` DB/pgTAP, Verify e build verdi |
| Admin PR/CI/normal merge | `PASS` — PR `#62`-`#66`, `#68`-`#70` merged |
| Admin migration/deploy staging | `PASS` per gli artifact registrati; tre deploy consumati |
| Phase B contract/golden | `PASS` |
| Core/Data/WPF imaging/full build | `PASS` — evidence più recente `873/873`, `19/19`, build verde |
| Security/Gitleaks | `PASS` sui PR TASK-150 registrati |
| Installer/package | `NOT_RUN` |
| Phase B PR/CI/normal merge | `PASS` — PR Win7POS `#73`-`#83` merged |
| Staging acceptance exact-ID | `FAIL` — ultima acceptance evidenziata non completa |
| Fence `2 h 05 min` | `BLOCKED` — manca closure terminale dell'ultima run |
| Cleanup/residui run-scoped | `BLOCKED` — Run 4 Storage assente, commit/receipt/snapshot non provati |
| Windows 7 fisico | `NOT_RUN` |
| Production/Android/iOS | `NOT_MODIFIED` |

La validazione Win7POS è proseguita oltre il checkpoint iniziale fino a
`873/873` Core/Data e alle PR `#73`-`#83` con CI, Supply Chain e CodeQL verdi.
Questi risultati non promuovono staging, cleanup terminale, package o Windows 7
fisico. Run 5 e ulteriori deploy non sono autorizzati dal budget registrato.

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

Soddisfatta dal comando esplicito dell'utente del `2026-07-31`. TASK-150 resta
`ACTIVE / EXECUTION`: la prossima mutazione staging richiede autorizzazione e
budget espliciti; nessun gate incompleto è rappresentato come `PASS`.
