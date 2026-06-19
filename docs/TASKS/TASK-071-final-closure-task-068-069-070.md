# TASK-071 - Final closure and fix-all for TASK-068 / TASK-069 / TASK-070

## Informazioni generali

- ID: `TASK-071`
- Titolo: Final closure and fix-all for TASK-068 / TASK-069 / TASK-070
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER_CONFIRMED_CLOSURE`
- Data apertura: 2026-06-19
- File Master Plan: `docs/MASTER-PLAN.md`

## Scope

Closure severa dei task `TASK-068Z`, `TASK-069` e `TASK-070`, includendo
review multi-repo, fix di finding correggibili, gate reali e separazione dei
soli limiti esterni/non locali come note non bloccanti.

Repo inclusi:

- Admin Web: `${ADMIN_WEB_REPO_PATH}`
- Android: `${ANDROID_REPO_PATH}`
- iOS: `${IOS_REPO_PATH}`
- Win7POS: `${WIN7POS_REPO_PATH}`

## Non incluso

- Nessun commit, push, stage o merge durante la closure iniziale; la
  finalizzazione successiva e' stata autorizzata esplicitamente dall'utente.
- Nessun deploy, `db push`, migration apply o scrittura production.
- Nessun secret, PIN, password, token o hash stampato in evidence.
- Nessuna nuova dipendenza.
- Nessun refactor gigante.
- Nessuna implementazione sales sync completa.
- Nessuna modifica al runtime/offline mode Win7POS fuori dai fix mirati.

## Fix applicati in TASK-071

- Admin Web: staff shop-code login non enumera piu shop/staff validi tramite
  messaggi UI; i codici granulari restano server/audit-side, mentre UI e redirect
  legacy usano `sign_in_blocked` pubblico.
- Admin Web docs: rimossi path locali assoluti dai nuovi handoff/evidence
  `TASK-069`/`TASK-070`, sostituiti con placeholder repo-agnostic.
- Android: migration `17 -> 18` backfill dei `product_remote_refs` gia dirty a
  `localChangedFields='__all__'`; guard runtime per ref legacy dirty con mask
  `NULL`; test migration/repository aggiunti; metadata IDE
  `.idea/deploymentTargetSelector.xml` sanificato da serial/path locali.
- iOS: backup SwiftData `default.store*` rimosso dalle evidence del repo e
  spostato in quarantena locale `.codex`.
- Win7POS: guard `CatalogEdit`, `CatalogImport` e `CatalogPriceEdit` su comandi
  Products e storico prezzi; serializzazione/re-read supplier/category; CSV
  formula sanitization prima di CR/LF stripping e whitespace bypass; Change PIN
  pulisce i PasswordBox in `finally`; bridge fisico `collect-logs` fallisce se
  non raccoglie nulla e documenta assenza timeout per job.

## Verdict task

| Task | Stato finale TASK-071 | Note |
|---|---|---|
| `TASK-068Z` | `DONE` | Gate Admin Web verdi; CodeRabbit finale Admin Web non rieseguito per rate limit CLI, ma finding documentale precedente corretto e verificato localmente. |
| `TASK-069` | `DONE` | Admin/Android/iOS gate mirati verdi; iOS full suite resta drift preesistente/non bloccante; migration Supabase `changed_count` non applicata. |
| `TASK-070` | `DONE` | Win7POS build/static gates verdi; sales sync e Win7 fisico restano roadmap/non-locali. |

## Evidence

Evidence operativa: `docs/TASKS/EVIDENCE/TASK-071/README.md`.

## Chiusura

I gate critici disponibili sono passati. I residui rimasti sono esterni,
preesistenti o roadmap dichiarata. I repo erano gia su `main`; la successiva
richiesta utente ha autorizzato stage/commit/push senza merge effettivo.
