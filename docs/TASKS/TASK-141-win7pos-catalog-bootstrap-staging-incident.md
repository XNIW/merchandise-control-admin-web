# TASK-141 - Win7POS catalog bootstrap staging incident

## Informazioni generali

- ID: `TASK-141`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-07-26`
- Branch: `codex/fix-win7pos-catalog-bootstrap-db-failure-20260726`
- Baseline: `8d7907a22af21b0be52638512549d97faeb6330a`
- Evidence: `docs/TASKS/EVIDENCE/TASK-141/README.md`

## Autorizzazione

L'utente ha autorizzato esplicitamente execution/fix, review, transizione a
`DONE` dopo gate reali, commit, push, PR, merge normale su `main`, apply di
eventuali migration esclusivamente sul target staging verificato e un solo
deploy Worker staging quando richiesto dal codice runtime.

Restano vietati production apply/deploy, force push, modifica Win7POS,
Android/iOS, secret nel repository e nuove scansioni Codex Security.

## Incidente

Il client fisico Win7POS Asus ha completato login, device approval e operatore,
ma il primo catalog pull ha ricevuto HTTP `500` con `code=db_failure`.

La correlazione read-only ha isolato:

- lease RPC: HTTP `200`;
- audit writer: HTTP `200`;
- `pos_catalog_pull_page_for_lease_v3`: HTTP `500`;
- SQLSTATE: `57014`;
- errore: `canceling statement due to statement timeout`;
- timeout Data API `authenticator`: `8s`;
- scope redatto: `bc01ea8e...5b8d`, `authorized_shop_plus_legacy`;
- volume reale: `100` categorie, `131` fornitori, `19.823` prodotti,
  `41.323` prezzi;
- `95` prezzi storici appartenenti a `41` prodotti soft-deleted dello stesso
  scope sono classificati impropriamente come orfani dal preflight;
- le quattro lane lease-bound, eseguite senza manifest preflight, rispondono
  `ok`.

## Root cause

Il manifest first-page esegue
`app_private.pos_catalog_integrity_violation_count_v2` in modo sincrono.
L'implementazione serializza e valida l'intero catalogo reale prima di
restituire il manifest e supera gli `8s` del Data API. Inoltre il controllo
prezzi richiede un prodotto attivo e tratta come corruzione prezzi storici di
prodotti soft-deleted, mentre il contratto catalogo li esclude già dalle
pagine.

Il synthetic harness precedente non copriva né questo volume né prezzi
storici collegati a prodotti soft-deleted.

## Obiettivo

Correggere il first-page catalog bootstrap senza alzare il timeout, senza
restituire cataloghi vuoti, senza indebolire lease/RLS/grant e senza
nascondere corruzione reale.

## Scope

- migration additiva per un preflight catalogo bounded;
- prezzi di prodotti soft-deleted nello stesso scope esclusi, non bloccanti;
- prezzi con prodotto mancante o cross-scope ancora bloccanti;
- failure metadata bounded con stage/reason/lane/count dove disponibile;
- pgTAP e foundation regressivi;
- test su volume equivalente allo scope reale;
- apply e deploy solo staging verificato;
- verifica server-side dello scope Asus prima del retry fisico.

## Non incluso

- modifica o patch Win7POS;
- catalogo vuoto come successo;
- aumento del timeout Data API come sostituto del fix;
- modifica production;
- modifica Android/iOS;
- remediation massiva o per prefisso;
- nuova scansione Codex Security o CodeQL manuale.

## Criteri di accettazione

1. Il preflight equivalente al dataset reale termina entro il timeout Data API.
2. Il primo page call dello scope Asus non restituisce `db_failure`.
3. Prezzi dello stesso scope riferiti a prodotti soft-deleted sono esclusi.
4. Prezzi mancanti/cross-scope restano `integrity_blocked`.
5. Manifest, revisione, scope e lane restano snapshot-safe.
6. RLS, grant, `search_path` e lease non sono indeboliti.
7. Test locali, pgTAP/CI, build Next/OpenNext e verify passano realmente.
8. Migration e Worker sono applicati solo staging.
9. PR e CI sono verdi, merge normale completato e `main` riconciliato.
10. Production, Win7POS, Android e iOS restano intatti.

## Handoff

Il fix locale e i gate Admin/DB scoped sono in `REVIEW`. L'utente ha già
autorizzato nello stesso prompt la review finale e la transizione a `DONE`
soltanto dopo CI, merge, apply/deploy staging e verifica server-side dello
scope reale.
