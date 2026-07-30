# TASK-149 - Trusted POS product image v1 server contract

## Informazioni generali

- ID: `TASK-149`
- Stato: `EXECUTION`
- Fase attuale: `EXECUTION`
- Responsabile attuale: `CODEX / EXECUTOR`
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

## Obiettivo

Completare, integrare e distribuire esclusivamente su staging il contratto
server `pos-product-image-v1` necessario alla Phase B Win7POS, riusando senza
fork il dominio portabile `product-image-v1`, il trusted POS runtime boundary
e le semantiche atomiche di catalog publication.

La task termina in `REVIEW_READY`, in attesa dell'acceptance client Asus. Non
passa a `DONE` durante questa esecuzione.

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

## Gate iniziali

- Implementazione: `PASS_LOCAL`.
- Test locali: `PASS`.
- Review: `PASS`, `P0/P1/P2/P3 = 0/0/0/0`.
- PR/CI/merge: `NOT_RUN`.
- Migration staging: `NOT_RUN`.
- Deploy staging: `NOT_RUN`.
- Acceptance server-side: `NOT_RUN`.
- Production: `NOT_MODIFIED`.
- Win7POS PR `#72`: `NOT_MODIFIED`.

## Checkpoint pre-merge

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
- Migration, deploy, acceptance, cleanup e osservabilità restano
  `NOT_RUN` finché la runtime non è passata tramite PR/CI/merge normale.
- Stato invariato: `EXECUTION`; la task non passa a `DONE` e produzione,
  Win7POS PR `#72`, Android e iOS restano `NOT_MODIFIED`.
