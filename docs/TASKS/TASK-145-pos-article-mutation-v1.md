# TASK-145 - Versioned POS article mutation contract

## Informazioni generali

- ID: `TASK-145`
- Stato: `REVIEW_READY`
- Fase attuale: `REVIEW_READY`
- Responsabile attuale: `CLAUDE/CHATGPT / REVIEWER`
- Data apertura: `2026-07-28`
- Branch: `codex/admin-pos-article-mutation-v1-20260728`
- Baseline Admin: `6ae562c83a6ebcecad93bf53141a13fbcdf0a080`
- Baseline Win7POS read-only: `fb6dbe670ae1a646268331e7288d6e6b07b5500d`
- Evidence: `docs/TASKS/EVIDENCE/TASK-145/README.md`
- PR: `#48`
- Feature SHA remoto: `6eb3e1571eab71f5dd6e91abeef3b3b4efbd69e6`
- Merge/deployed main SHA: `fca4013c7e92f1a9f82968cc8d64946bf2363112`

## Obiettivo

Esporre `POST /api/pos/catalog/article-mutations` con schema
`pos-article-mutation-v1`, usando il trusted POS runtime boundary e senza
riutilizzare le semantiche `supplier_excel`.

## Scope

- create, duplicate, field-mask update, activate/deactivate;
- retail e purchase price change con una history row per mutazione;
- manual stock signed delta sul dominio ledger esistente;
- receipt immutabile per mutation ID/idempotency key/payload hash;
- replay dell'ACK originario e mismatch fail-closed;
- optimistic concurrency su revisione autoritativa;
- publication catalog revision/sync event atomica;
- batch tecnico bounded;
- audit metadata bounded e secret-free;
- fixture machine-readable, test foundation/route/pgTAP;
- review indipendente, PR non-draft, CI e merge normale.

## Fuori scope

- semantiche supplier Excel, sales stock movement o sale recreation;
- Win7POS, Android e iOS;
- production database e Worker;
- dati reali o modifica di articoli preesistenti in acceptance;
- deploy staging prima del merge di questa task.

## Criteri di accettazione

1. Ogni mutazione usa identità immutabile e ACK persistito atomicamente.
2. Replay same-ID/same-hash restituisce l'ACK originario; hash diverso fallisce.
3. Le mutazioni non-create richiedono remote product ID e base revision.
4. `product_update` usa field mask; omitted non sovrascrive.
5. Duplicate crea una nuova identità remota.
6. Price change crea esattamente una history row, replay-safe.
7. Stock delta usa il ledger/movement esistente e non il sales ledger.
8. Conflitti e failure sono tipizzati e non mutano il catalogo.
9. Publication e ACK sono nella stessa transazione.
10. Auth/lease/grants/RLS restano fail-closed.
11. Review finale: `P0=0`, `P1=0`, `P2=0`.
12. Dopo merge: migration staging, unico deploy Worker, acceptance e cleanup
    sintetico reale; task consegnata a `REVIEW_READY`, mai `DONE`.

## Delivery

- PR `#48` non-draft, CI run `218` e Cloudflare run `215`: `PASS`.
- Review indipendente finale: `P0/P1/P2/P3 = 0/0/0/0`.
- Merge normale: `fca4013c7e92f1a9f82968cc8d64946bf2363112`.
- Migration staging remote:
  `20260728055123 task_144_pos_offline_authorization_attestation`,
  `20260728055127 task_145_pos_article_mutation_v1`.
- Unico deploy Worker post-merge: deployment
  `f0129552-d815-49fb-a2a3-f38c61aaa84f`, version
  `56ec23b1-a5b7-4635-94ff-b2ebaa682d0f`, 100% attiva.
- Acceptance staging: `STGFE91FF04C`, `PASS`.
- Cleanup sintetico: `PASS`, residui catalogo/runtime attivi `0`, audit
  immutabile preservato e baseline ripristinata.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Stato operativo:
  `READY_FOR_ASUS_ARTICLE_SYNC_AND_FINAL_ACCEPTANCE`.
