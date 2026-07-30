# TASK-148 - Final POS article-sync staging cleanup

## Informazioni generali

- ID: `TASK-148`
- Stato: `DONE`
- Fase attuale: `DONE / USER_CONFIRMED_CLOSURE`
- Responsabile attuale: `USER / CONFIRMED CLOSURE`
- Risoluzione finale: `USER_CONFIRMED_CLOSURE`
- Data apertura: `2026-07-30`
- Branch:
  `codex/final-pos-article-sync-cleanup-20260730`
- Evidence pubblica:
  `docs/TASKS/EVIDENCE/TASK-148/README.md`

## Obiettivo

Riprendere in modo fail-closed la pulizia finale delle fixture sintetiche
dell'article sync POS su Supabase staging dopo la scadenza della lease che
aveva bloccato il tentativo precedente, verificando residui zero e invarianti
non-target prima del closeout documentale cross-repository.

## Scope

- validazione byte-per-byte del manifest privato e del suo scope aggregato;
- doppia verifica live di lease, sessioni, autorita offline e attivita
  concorrente;
- preflight read-only fresco di ownership, lineage, relazioni e cardinalita;
- remediation degli identificatori privati eventualmente presenti nei
  documenti pubblici;
- una transazione staging `SERIALIZABLE`, exact-ID, con lock e assertion;
- verifica post-commit di residui zero, audit immutabile e invarianti
  non-target;
- closeout esclusivamente documentale, review indipendente e delivery GitHub
  normale.

## Scope escluso

- modifiche a Win7POS o alla PR `#72`;
- codice runtime Admin, migration o schema Supabase;
- Android, iOS, produzione, Worker Cloudflare e billing;
- deploy di qualunque tipo;
- cancellazioni per prefisso, wildcard, `LIKE` o shop-wide;
- eliminazione o modifica degli audit storici immutabili.

## Guardrail

- Il manifest e gli exact ID privati di manifest/run restano privati; nei
  documenti pubblici sono ammessi soltanto SHA, conteggi aggregati,
  riferimenti di delivery pubblici e hash redatti.
- Ogni mismatch di staging, manifest, ownership, autorita o relazione
  non-target blocca il DML.
- Un eventuale secondo tentativo e ammesso soltanto dopo rollback completo
  provato, correzione privata del piano e nuova review indipendente.
- Nessun `PASS` viene dichiarato senza un comando realmente eseguito.

## Criteri di accettazione

1. Staging allowlisted e sano; migration parity e Worker invariati.
2. Due authority check stabili ad almeno 30 secondi con lease, sessioni,
   autorita offline e mutation in-flight a zero.
3. Preflight fresco con 7 gruppi, 18 prodotti, 28 prezzi, 21 movimenti
   manuali, 94 receipt, 4 conflict receipt e 118 sync event.
4. Ownership ambigua, sale-origin, relazioni inattese e overlap non-target
   tutti zero.
5. Review del piano exact-ID:
   `P0/P1/P2/P3 = 0/0/0/0`.
6. Delete count esatti, audit storici preservati e una sola audit row di
   cleanup bounded.
7. Residui target zero e baseline non-target invariata dopo il commit.
8. Scan privacy e secret finali senza finding.
9. Diff pubblico esclusivamente documentale; gate locali e CI verdi.
10. Handoff finale pronto per review, con Windows 7 fisico ancora
    `EXTERNAL_PENDING`.

## Stato esecuzione

La transazione staging guarded exact-ID è terminata con `COMMIT` e tutti i
conteggi attesi. Il post-check ha verificato residui target `0`, baseline
non-target invariata, audit storici preservati e una sola audit row bounded
di cleanup.

- Manifest SHA-256:
  `ECA9F9158BF5B026FF6CD59C875CEE1FBB158E6608EE0E915C5AA70ABFDEE892`.
- Authority check stabili: `PASS`; lease, sessioni, autorità offline e
  mutation in-flight `0`.
- Eliminati: 18 prodotti, 28 prezzi, 21 movimenti manuali, 94 receipt,
  4 conflict receipt e 118 sync event.
- Catalog revision: `144 -> 146`, delta atteso `+2`.
- Residui target: `0`.
- Audit immutabile: `PRESERVED`; audit cleanup bounded: `1`.
- Invarianti non-target: `UNCHANGED`.
- Review piano e outcome: `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti: `0`.
- Runtime Admin, migration/schema, Worker, Win7POS, PR `#72`, Android, iOS,
  produzione e billing: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Conferma esplicita finale dell'utente: `RECEIVED`.
- Stato governance: `DONE / USER_CONFIRMED_CLOSURE`.
