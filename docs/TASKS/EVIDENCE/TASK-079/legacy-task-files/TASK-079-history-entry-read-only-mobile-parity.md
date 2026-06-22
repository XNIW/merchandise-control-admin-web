# TASK-079 - History Entry list/detail mobile parity read-only

## Informazioni generali

- ID: `TASK-079`
- Titolo: `History Entry list/detail mobile parity read-only`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-21`
- Origine: brief utente allegato `TASK-0XX - History Entry list/detail mobile parity read-only`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-079/README.md`

## Contesto

La pagina `/shop/history` mostra History Entries reali, ma lista e detail non
sono ancora allineati alla UX mobile Android/iOS: la lista puo usare `updated_at`
come data principale, alcuni titoli reali cadono su label generiche, summary e
stati sync/export non distinguono sempre dati disponibili da dati assenti, e il
Detail read-only perde quantita/prezzi gia estratti.

Il progetto era `IDLE`; questo task apre una execution piccola e verificabile,
senza mescolare il futuro editing delle righe History.

## Scope

- Usare timestamp/data reale della sessione come data primaria della History
  Entry e del raggruppamento mensile.
- Mantenere `updated_at` solo come informazione secondaria `Updated`.
- Centralizzare il display title delle sessioni History con fallback leggibili:
  `display_name`, entry manuale, supplier/category, remote id troncato.
- Migliorare la summary lista usando solo dati reali disponibili da diagnostici,
  overlay/session metadata e sync events.
- Mostrare sync/export status solo se derivabile da dati reali; altrimenti usare
  una label esplicita di stato non disponibile.
- Correggere il Detail read-only per preservare `quantity`, `purchasePrice` e
  `retailPrice` estratti da `ShopHistoryTablePreviewRow`.
- Rifinire UI/UX Detail in modal larga con header sticky, summary leggibili,
  righe chiare, stato riga `Completed`/`Missing`/`Ignored`, informazioni
  supplier/category/source/date/status visibili e diagnostica redatta collassata.
- Aggiungere test mirati per helper/mapping dove possibile.

## Non incluso

- Nessuna modifica quantita/prezzo salvabile.
- Nessun realtime sync.
- Nessuna migration, colonna Supabase, RLS/RPC nuova o dependency nuova.
- Nessun campo inventato tipo `exported_at` / `synced_at`.
- Nessun service-role key lato client/browser.
- Nessuna modifica Android/iOS/POS/Win7POS.
- Nessun commit, push, stage, deploy, production apply o Supabase apply.

## File potenzialmente coinvolti

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-079-history-entry-read-only-mobile-parity.md`
- `docs/TASKS/EVIDENCE/TASK-079/README.md`
- `src/app/shop/history/page.tsx`
- `src/app/shop/_components/HistoryEntriesClientList.tsx`
- `src/app/shop/_components/HistoryDetailModalController.tsx`
- `src/app/shop/history/detail/route.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/detail-modal-read-model.ts`
- `src/lib/supabase/database.types.ts`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `tests/foundation/*.test.mjs`

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | La data primaria lista/grouping usa la data sessione reale, con `updated_at` solo secondario. | Test/static + review codice | `PASS` |
| CA-02 | Il titolo History e centralizzato e non produce fallback generico per righe reali quando sono disponibili alternative. | Test helper | `PASS` |
| CA-03 | Summary lista usa diagnostici/metadata/sync events reali e fallback leggero quando assenti. | Test helper + review codice | `PASS` |
| CA-04 | Sync/export status non inventa stati: mostra not available quando non derivabile. | Test helper | `PASS` |
| CA-05 | Detail preserva quantity/purchase/retail estratti dalle preview rows. | Test helper | `PASS` |
| CA-06 | Detail resta read-only e migliora leggibilita di summary, righe e diagnostica redatta collassata. | Review codice + eventuale smoke | `PASS_WITH_NOTES` |
| CA-07 | Check richiesti eseguiti o motivati come `NOT_RUN`/`BLOCKED`. | Comandi reali | `PASS_WITH_WARNINGS` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01..05 | Test helper/foundation | `node --test tests/foundation/<task-079>.test.mjs` | `PASS` | Output comando sintetizzato |
| CA-06 | Static review / smoke | Review diff, eventuale probe locale | `PASS` / `NOT_RUN_AUTH_REQUIRED` | Note evidence |
| CA-07 | Gate progetto | `npm run lint`, `npm run typecheck`, `npm run build`, `npm run verify`, `git diff --check`, `git status` | `PASS` / `PASS_WITH_WARNINGS` / `NOT_RUN` | Output comando sintetizzato |

## Decisioni

- La parita mobile di questo task e read-only: gli elementi UI possono essere
  preparati per editing futuro, ma non devono introdurre input salvabili o
  endpoint mutativi.
- Data primaria e titolo devono vivere in helper riusabili/testabili, non come
  logica duplicata nei componenti.
- `updated_at` e solo freshness tecnica, non data semantica della History Entry.
- Lo stato sync/export puo essere mostrato solo se letto da dati reali gia
  disponibili; in caso contrario deve essere esplicitamente non disponibile.

## Execution

- File controllati: `AGENTS.md`, `docs/MASTER-PLAN.md`,
  `docs/TASKS/TASK-079-history-entry-read-only-mobile-parity.md`,
  `src/app/shop/history/page.tsx`,
  `src/app/shop/_components/HistoryEntriesClientList.tsx`,
  `src/app/shop/_components/HistoryDetailModalController.tsx`,
  `src/app/shop/history/detail/route.ts`,
  `src/server/shop-admin/history-read-model.ts`,
  `src/server/shop-admin/detail-modal-read-model.ts`,
  `src/server/shop-admin/shop-section-data.ts`,
  `src/lib/supabase/database.types.ts`,
  `src/app/shop/_components/ImportExportActionPanel.tsx`,
  `src/app/shop/_components/CatalogActionPanel.tsx`,
  `tests/foundation/task-078-product-history-detail-modals.test.mjs`.
- Modifiche fatte: helper centralizzati per `displayTitle`, `entryDate` e
  `syncState`; lista light basata su diagnostici quando disponibili; fallback
  espliciti `Diagnostics not available` / `Sync state not available`; detail
  read-only con header sticky piu informativo e quantity/purchase/retail
  preservati dal preview row.
- Check eseguiti: `node --test tests/foundation/task-079-history-entry-read-only-parity.test.mjs`
  PASS 3/3; `npm run typecheck` PASS dopo fix timestamp opzionale; `npm run lint`
  PASS; `npm run build` PASS_WITH_WARNINGS; `npm run verify`
  PASS_WITH_WARNINGS; `git diff --check` PASS; `git status --short`
  PASS_WITH_NOTES.
- Rischi rimasti: stato sync resta non disponibile se i `sync_events` non
  referenziano il `remote_id`; fallback manuale server-side resta in inglese
  per assenza locale nel read model; worktree contiene modifiche preesistenti
  fuori scope.
- Handoff: `REVIEW`, non `DONE`. Evidence in
  `docs/TASKS/EVIDENCE/TASK-079/README.md`.

## Review

- Decisione: `PENDING`
- Evidence verificata: `PENDING`
- Problemi: `PENDING`
- Condizioni per passare a `DONE`: review positiva e conferma esplicita
  dell'utente.

## Chiusura

- Stato finale: `PENDING`
- Conferma utente: `PENDING`
- Data chiusura: `PENDING`
- Follow-up aperti: `TASK-079B - Supplier Import to Canonical History Entry + Mobile Sync`
