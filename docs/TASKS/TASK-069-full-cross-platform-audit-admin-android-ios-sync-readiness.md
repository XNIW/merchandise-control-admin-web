# TASK-069 - Full cross-platform audit Admin Web, Android and iOS sync readiness

## Informazioni generali

- ID: `TASK-069`
- Titolo: Full cross-platform audit Admin Web + Android + iOS sync readiness, security, UI/UX, performance and CodeRabbit review
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER_CONFIRMED_CLOSURE`
- Data apertura: 2026-06-19
- File Master Plan: `docs/MASTER-PLAN.md`

## Scope

Audit professionale e repo-grounded dell'ecosistema:

- Admin Web: `${ADMIN_WEB_REPO_PATH}`
- Android: `${ANDROID_REPO_PATH}`
- iOS: `${IOS_REPO_PATH}`

Admin Web resta repo principale. Android e' riferimento funzionale piu completo; iOS e' riferimento UX/coerenza moderna.

## Non incluso

- Nessun commit, push o stage.
- Nessun deploy, `db push`, migration apply o scrittura production.
- Nessuna nuova dipendenza.
- Nessun refactor massivo.
- Nessun merge tra account personale e staff/POS.
- Nessun dato reale, token, password, PIN o hash in evidence.

## Metodo

- Preflight git per ogni repo accessibile.
- CodeRabbit CLI/GitHub PR check quando disponibile; fallback review locale equivalente se non ci sono diff/commenti.
- Subagenti specializzati per security, UI/UX, catalog/import, Android, iOS, sync matrix, tooling e reviewer gate.
- Fix diretti solo per problemi piccoli, sicuri e verificabili.
- Handoff finale con evidence, check reali, rischi residui e prossima fase.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Preflight git completato per Admin Web, Android e iOS o repo missing motivato | `PASS` |
| CA-02 | CodeRabbit status documentato per ogni repo senza inventare commenti | `PASS_WITH_NOTES` |
| CA-03 | Audit Security/Supabase/Auth/RLS Admin Web completato | `PASS_WITH_NOTES` |
| CA-04 | Audit UI/UX Admin Web completato | `PASS_WITH_NOTES` |
| CA-05 | Audit Products/Import/Sync readiness Admin Web completato | `PASS_WITH_NOTES` |
| CA-06 | Audit Android statico/build-tooling completato | `PASS_WITH_NOTES` |
| CA-07 | Audit iOS statico/build-tooling completato | `PASS_WITH_NOTES` |
| CA-08 | Matrice cross-platform sync compilata | `PASS_WITH_NOTES` |
| CA-09 | Check disponibili eseguiti o `NOT_RUN`/`BLOCKED` motivato | `PASS_WITH_NOTES` |
| CA-10 | Nessun commit, push, stage, deploy, db push o secret exposure | `PASS` |

## Execution

Evidence operativa: `docs/TASKS/EVIDENCE/TASK-069/README.md`.

## Handoff

Codex ha completato audit, fix piccoli/medi e verifica locale. TASK-071 ha poi
riconciliato il task a `DONE` su conferma esplicita utente.

Evidence completa: `docs/TASKS/EVIDENCE/TASK-069/README.md`.

Sintesi fix:

- Admin Web: clamp paginazione prodotti, detail prodotto con lookup esatto oltre
  la prima pagina, parser numerico localizzato condiviso e piu restrittivo,
  azioni vuote nascoste in read-only, copy/aria parzialmente localizzati.
- Supabase/Admin sync: aggiunta migration non applicata per alzare il budget
  `record_sync_event.changed_count` da 1.000 a 100.000 mantenendo limiti su
  metadata/entity_ids.
- Android: merge dei dirty fields prodotto, dirty marker coerenti per supplier e
  category, test migration aggiornati a `MIGRATION_17_18`.
- iOS: supplier/category delete trasformate in remote tombstone dove possibile,
  alias `supplierName`/`categoryName` normalizzati, budget sync-event 100.000
  allineato tra mapper/validator/outbox/preflight/tests.

Check principali:

- Admin Web: `npm run test:foundation` PASS 378/378; `npm run verify` PASS;
  `test:shop:local` PASS 5/5 via `next start`; `git diff --check` PASS.
- Android: `./gradlew lintDebug testDebugUnitTest` PASS; `assembleDebug` PASS;
  `git diff --check` PASS.
- iOS: build simulator PASS; targeted test suite sync/catalog PASS 200/200;
  full suite iOS precedente `FAIL_WITH_PREEXISTING_SUITE_DRIFT` 856 passed,
  25 failed, 29 skipped, documentata in evidence; `git diff --check` PASS.

Rischi residui principali:

- Contratto owner-scoped compatibile; shop-scoped non ancora completo/canonico.
- Android non ha ancora tombstone locali catalogo allineate end-to-end.
- iOS conserva residui storici su adozione pending anonima/log debug IDs e full
  suite non tutta verde.
- Alcuni copy/i18n e ritorno lista filtrata Admin Web restano candidati follow-up.

Azioni vietate rispettate: nessun stage, commit, push, merge, deploy, `db push`
o migration apply.

## Chiusura TASK-071

TASK-071 ha riconciliato questo task a `DONE` su conferma esplicita
utente. Gate critici disponibili verdi; residui limitati a iOS full suite drift
preesistente, migration Supabase non applicata, CodeRabbit Admin Web finale
rate-limited e roadmap cross-platform.
