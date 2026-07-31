# TASK-149 - Trusted POS product image v1 server contract

## Informazioni generali

- ID: `TASK-149`
- Stato: `REVIEW_READY`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CLAUDE / ChatGPT / REVIEWER`
- Risoluzione: `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`
- Data apertura: `2026-07-30`
- Branch: `codex/admin-pos-product-image-v1-20260730`
- Baseline Admin:
  `710ff981f7bb0381159724ec02bbfec39a27eedf`
- Win7POS main read-only:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`
- Win7POS PR `#72` head read-only:
  `b43473f9c959a86403fa0f0a012f798d15af553e`
- Evidence:
  `docs/TASKS/EVIDENCE/TASK-149/README.md`
- Runtime merge Admin:
  `1de2912419f6770ff1ef7c6819754f4439ab849f`
- Runtime/tooling main:
  `d3c674ada8aa7abf0179355c09238472b9ff3023`
- Handoff Win7POS:
  `docs/HANDOFFS/WIN7POS_POS_PRODUCT_IMAGE_V1_READY.md`
- SHA-256 handoff Win7POS:
  `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87`
- Prompt operativo Asus:
  `docs/HANDOFFS/NEXT-CODEX-ASUS-PRODUCT-IMAGE-PHASE-B.md`
- SHA-256 prompt Asus:
  `f74c569bdba14259a1d7361189b4a6e987919e025c0ca4d97d78e30ec3466b8d`

## Obiettivo

Completare, integrare e distribuire esclusivamente su staging il contratto
server `pos-product-image-v1` necessario alla Phase B Win7POS, riusando senza
fork il dominio portabile `product-image-v1`, il trusted POS runtime boundary
e le semantiche atomiche di catalog publication.

La task è consegnata a `REVIEW_READY`, con risoluzione
`READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`, in attesa dell'acceptance client Asus.
Non passa a `DONE` durante questa esecuzione e richiede conferma esplicita
dell'utente per qualunque chiusura successiva.

## Baseline contratto

- Contract ID portabile:
  `merchandise-control.product-image.v1`.
- SHA-256 Admin/Android/iOS:
  `b6212f36f27a6dc294713ca7345a29ff8d1a73733b9edb5d8e1a5c3b8ec14672`.
- Admin, Android e iOS: contratto byte-identico.
- Win7POS PR `#72`: JSON portabile assente; implementazione offline Phase A
  compatibile e read-only per questa task.
- Contratto portabile, route Shop Admin e comportamento mobile:
  `UNCHANGED`.

## Scope

- delta documentale server/POS rispetto al contratto portabile;
- endpoint dedicati:
  - `POST /api/pos/catalog/product-images/intent`;
  - `POST /api/pos/catalog/product-images/finalize`;
  - `POST /api/pos/catalog/product-images/read-urls`;
  - `POST /api/pos/catalog/product-images/remove`;
- envelope `pos-product-image-v1` con trusted device/session/staff/shop lease;
- permessi equivalenti `products.read` / `products.write`;
- operation ID, idempotency key e payload hash con replay durevole;
- compare-and-swap su replacement e remove;
- validazione JPEG server-side indipendente prima della promotion;
- riuso del dominio immagini, path canonici, Storage privata e pending cleanup;
- campi catalogo additivi:
  `primaryImageVersionId` e `primaryImageUpdatedAt`;
- full refresh, delta e publication revision atomica;
- fixture machine-readable, test route/foundation/pgTAP/security/bundle;
- review zero-gate, PR non-draft, CI e merge normale;
- migration additiva minima su staging, se necessaria;
- fino a tre deploy staging evidence-backed;
- acceptance server-side sintetica exact-ID e cleanup a residuo zero;
- handoff Win7POS Phase B e prompt Asus completo.

## Fuori scope

- modifiche a Win7POS o alla PR `#72`;
- modifiche Android o iOS;
- deploy o migration production;
- billing Cloudflare;
- dati immagini reali o prodotti preesistenti non-QA;
- token, credenziali, URL firmati, request body o identificatori privati in
  log, audit, evidence o GitHub;
- dipendenze nuove salvo necessità esplicita e dimostrata.

## Criteri di accettazione

1. I quattro endpoint POS usano envelope bounded e import dinamico del dominio
   solo dopo method/body/light guard.
2. Browser Supabase access token non è accettato come autenticazione POS.
3. Shop, device, session, staff, credential version, lease e permesso sono
   verificati fail-closed e rifermati dentro le mutazioni autoritative.
4. Attore POS è attribuito a staff/device/session espliciti, senza profilo
   web fittizio.
5. Same operation ID e same payload hash riproducono l'outcome originario;
   hash diverso fallisce senza DML.
6. Finalize replay non supersede due volte e remove replay non elimina una
   versione più nuova.
7. Intent e remove usano expected-version compare-and-swap.
8. Main/thumb sono JPEG canonici entro limiti di byte, pixel e dimensioni e
   sono verificati server-side prima della promotion.
9. Path Storage sono derivati dal database e non accettati dal client.
10. Signed URL non entra in database, audit, log, eccezioni, catalogo o
    evidence.
11. Il bucket resta privato, JPEG-only, 1 MiB per oggetto; RLS/grants restano
    fail-closed e le receipt sono service-role-only.
12. Failed object cleanup resta pending e tracciato senza perdere la versione
    valida precedente.
13. Catalogo full/delta include i due campi immagine; remove pubblica versione
    nulla e timestamp aggiornato.
14. Client storici ignorano i campi additivi e paginazione/exactness restano
    bounded senza nuovo cap business.
15. I 48 casi server richiesti sono coperti da test o evidence reale
    equivalente, senza test disabilitati.
16. Foundation, `verify`, `cf:build`, Worker smoke, reset isolato, pgTAP,
    migration parity, security e import graph risultano `PASS`.
17. Review finale: `P0/P1/P2/P3 = 0/0/0/0`.
18. CI verde, merge normale, migration solo staging e massimo tre deploy
    staging; production `NOT_MODIFIED`.
19. Acceptance sintetica intent/finalize/read/replace/remove/replay/conflict/
    catalog/full-drain è `PASS` con zero 503/resource failure.
20. Cleanup exact-ID lascia zero residui immagine/storage/receipt/eventi,
    preserva audit immutabile e produce handoff Phase B completo.

## Gate di delivery

- Implementazione runtime: `PASS`.
- Test locali: `PASS`.
- Review runtime/tooling: `PASS`, `P0/P1/P2/P3 = 0/0/0/0`.
- PR runtime `#59`: `PASS / MERGED_NORMAL`.
- Required CI PR `#59`: `PASS`.
- Migration staging: `PASS`, applicata una sola volta; parity `97/97`.
- DB lint linked `public,app_private`: `PASS`, zero errori.
- Deploy Worker staging: `PASS`, `1/3`; deploy production `0`.
- PR tooling `#60`: `PASS / MERGED_NORMAL`.
- Required CI PR `#60`: `PASS`.
- Deploy successivi alla PR tooling: `0`.
- Primo live gate: `BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE`, fail-closed,
  non usato come PASS.
- Recheck cleanup primo run: `PASS`, residui run-scoped `0`.
- Secondo live gate:
  `PASS`, schema `task149-pos-product-image-resource-gate-v2`, Tail/GraphQL `34/34`, cold/warm/full-drain `1/32/1`,
  CASE46/CASE48 `2/2`, errori e forbidden match `0`.
- Postcheck finale count-only:
  `PASS`, candidate group `1`, shop archiviato `1`, Auth inattivi/attivi `2/0`, righe attore attive `0`,
  tutti i residui DB/Storage/budget `0`, audit preservati `11`, forbidden `0`.
- Deployment/source/version recheck:
  `PASS`, Worker source `1de2912419f6770ff1ef7c6819754f4439ab849f`, versione attiva `100%`,
  deployment/version invariati durante gate e recheck indipendente, nessun deploy dopo PR `#60`.
- Production: `NOT_MODIFIED`.
- Win7POS PR `#72`, Android e iOS: `NOT_MODIFIED`.

## Checkpoint storico pre-merge

- Route e dominio trusted POS immagini implementati con envelope dedicato,
  import auth/domain a due stadi e `route-envelope.ts` legacy byte-identico
  alla baseline.
- Focused TASK-149 `28/28`, foundation, lint, typecheck, security, `verify`,
  `cf:build`, Worker smoke e bundle graph `7/7`: `PASS`.
- Supabase locale: replay migration isolato `PASS`; pgTAP TASK-149 `162/162`;
  full pgTAP `1251/1251`; DB lint senza errori.
- CASE24 “zero image” è documentato come prova composita: tri-state catalogo
  never-imaged con campi null, baseline staging senza immagine e ref read
  mancante/non firmabile che restituisce `not_found` senza signed URL.
- Il gate staging prova full-drain contro un manifest DB autorevole
  snapshot-bound, recupera e disabilita anche gli attori Auth dopo risposte
  perse, scandisce chiavi/valori e path Storage, isola gli env Wrangler/harness
  e converte la CPU Tail da millisecondi a microsecondi con test numerico.
- Recheck indipendenti finali su matrice/acceptance e security:
  `P0/P1/P2/P3 = 0/0/0/0`.
- In questo snapshot storico, migration, deploy, acceptance, cleanup e
  osservabilità erano `NOT_RUN` finché la runtime non fosse passata tramite
  PR/CI/merge normale.
- Lo snapshot storico terminava in `EXECUTION`; è superato dalla delivery e
  dall'handoff a review registrati di seguito. La task non passa a `DONE` e
  produzione, Win7POS PR `#72`, Android e iOS restano `NOT_MODIFIED`.

## Handoff a review

### Delivery verificata

- Runtime PR `#59`, feature
  `d7fe4eced2b8bcd015dd66b38baa30bc4619182f`, merge normale
  `1de2912419f6770ff1ef7c6819754f4439ab849f`, required checks verdi.
- Tooling PR `#60`, feature
  `a3347120d8686afe24c68ed9c1318f2c3e9647eb`, merge normale
  `d3c674ada8aa7abf0179355c09238472b9ff3023`, required checks verdi.
- La PR `#60` modifica soltanto il gate di acceptance Tail: non modifica il
  Worker runtime e non ha richiesto un nuovo deploy.
- Worker staging costruito dal runtime merge `1de29124`; identificatore
  versione pubblicato solo come digest SHA-256
  `39df9056b5c8c01bd6e5526bd03f1d936a619f2f52160b261b728062a1834817`.
- Migration SHA-256:
  `b4eb344f4bb73ae8cfbcb5ef10ed53f2959694caf814c53c78978d7c450d6511`.
- pgTAP TASK-149 `162/162`, full `1251/1251`, migration parity `97/97`,
  DB lint linked zero errori.

### Primo gate live, fail-closed

Il primo gate non è evidence di acceptance completa. È terminato
`BLOCKED_TASK149_TAIL_COVERAGE_INCOMPLETE` perché la readiness era stata
provata su un processo Tail pretty separato, chiuso prima del Tail JSON; il
delay cieco successivo non provava l'open/pong del WebSocket che doveva
osservare il run. Il gate può quindi aver perso sequenze iniziali. Non si
pubblica né si deduce alcun conteggio Tail osservato.

Il recheck indipendente count-only successivo ha trovato una sola fixture
completa, due attori Auth sintetici, un solo shop sintetico archiviato, zero
righe attore/runtime attive e zero attori Auth attivi. Residui prodotto,
versioni immagine, receipt, eventi catalogo/sync, budget e oggetti Storage:
`0`; audit immutabili preservati: `11`; forbidden audit match: `0`; cleanup
audit bounded: `1`.

### Correzione tooling

Il gate successivo usa sessione Tail control-plane diretta, filtri esatti per
header/versione e nessun sampling; WebSocket `trace-v1` deve essere open con
pong prima di avviare l'harness. Heartbeat, expiry, teardown exactly-once,
stop cooperativo del child, completion bounded e cleanup dell'harness sono
fail-closed. Nessun Tail error può bypassare la validazione dell'output child.

Nel rerun authoritative della foundation il repository Win7POS è stato
pinned al main read-only
`f34308b24fd30d0b85845429f1ece97cc5106c6d`. Un tentativo precedente non
pinned aveva selezionato un clone/ambiente Win7POS incompleto e falliva cinque
check esterni: è classificato `NOT_VALID_ENVIRONMENT`, non PASS e non
regressione TASK-149. Il rerun pinned è `PASS`.

### Freeze documentale verificato

- Secondo live gate: `PASS`;
- postcheck indipendente: `PASS`;
- deployment/source/version recheck: `PASS`;
- SHA-256 handoff Win7POS:
  `605d400b0074166991c185b0120aea78bc3a2924c447e7112796f680c88d7d87`;
- SHA-256 prompt Asus:
  `f74c569bdba14259a1d7361189b4a6e987919e025c0ca4d97d78e30ec3466b8d`.

Il merge documentale finale non può auto-attestare il proprio SHA dentro lo
stesso commit: il runtime/tooling pin resta `d3c674ad`; PR, CI e merge docs
sono attestati nel record GitHub e nella risposta finale.

TASK-149 resta `REVIEW_READY / REVIEW`, mai `DONE`. TASK-150 resta
`DRAFT / PLANNING / NOT_ACTIVE` e può diventare attiva soltanto su
autorizzazione esplicita del ciclo Asus successivo.

### Invarianti finali

- Production deploy/apply: `NO`.
- Win7POS PR `#72`: `OPEN / DRAFT / UNMERGED / UNTOUCHED`.
- Android/iOS: `NOT_MODIFIED`.
- Service-role, token, URL firmate, path Storage e raw run marker nelle
  evidence pubbliche: `0`.
- Handoff target:
  `READY_FOR_ASUS_PRODUCT_IMAGE_PHASE_B`.
