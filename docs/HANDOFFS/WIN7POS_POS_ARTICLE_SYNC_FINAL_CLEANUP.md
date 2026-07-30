# Win7POS POS article-sync final cleanup

## Stato

- Coordinamento Admin: `TASK-148`.
- Stato: `REVIEW_READY`.
- Fase: `REVIEW`.
- Risoluzione proposta:
  `REVIEW_READY_FOR_USER_CONFIRMED_CLOSURE`.
- Win7POS final acceptance: `PASS`.
- Cleanup consolidato staging: `PASS`.
- Windows 7 fisico: `EXTERNAL_PENDING`.

Il brief utente autorizza il closeout completo. La governance del repository
richiede però che Codex consegni a `REVIEW` e non registri direttamente
`DONE`; questo handoff contiene tutte le evidence necessarie alla conferma
finale del reviewer.

## Baseline autorevoli

- Admin `origin/main` iniziale:
  `e1783f57509c8011902c1f076d3b1f5ee2e56309`.
- Runtime Admin:
  `9fb54f50999b8587bc37f5e2040743df20df8f08`.
- Win7POS main read-only:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`.
- Fonte acceptance Win7POS:
  `docs/HANDOFFS/WIN7POS_POS_ARTICLE_SYNC_FINAL_ACCEPTANCE.md` nel
  repository Win7POS.
- Win7POS PR `#72`: draft, non merged e non modificata.
- Manifest SHA-256:
  `ECA9F9158BF5B026FF6CD59C875CEE1FBB158E6608EE0E915C5AA70ABFDEE892`.
- Win7POS final acceptance run: `PASS`, identificatore non pubblicato.

Il repository privato, il manifest con gli identificatori esatti, il cleanup
SQL e l'evidence operativa completa non sono inclusi né collegati da questo
documento pubblico.

## Authority e preflight

- Database time finale prima del DML:
  `2026-07-30T15:22:42.730140Z`.
- Lease storicamente bloccante e safety margin: scaduti.
- Authority check A/B:
  `2026-07-30T14:50:18.136298Z` /
  `2026-07-30T14:51:04.456172Z`.
- Intervallo A/B: `46,319874s`.
- Rinnovi, nuove sessioni, autorità offline, lease attive e mutation
  in-flight: `0`.
- Preflight fresco:
  `2026-07-30T15:22:56.671337Z`, `PASS`.
- Ownership ambigua, sale-origin movement, relazioni inattese e overlap
  non-target: `0`.
- Staging identity, migration parity e Worker identity: `PASS`.

## Cleanup staging

Una sola transazione `SERIALIZABLE` exact-ID ha acquisito lock fail-fast,
rivalidato authority, ownership, lineage e cardinalità, applicato soltanto
guard transaction-local e raggiunto `COMMIT` il
`2026-07-30T15:25:34.623701Z`.

| Entità | Eliminati | Residui |
| --- | ---: | ---: |
| Prodotti | 18 | 0 |
| Price history | 28 | 0 |
| Movimenti manuali | 21 | 0 |
| Mutation receipt | 94 | 0 |
| Conflict receipt | 4 | 0 |
| Sync event disposable | 118 | 0 |

- Gruppi logici: `7`.
- Sync event generati dal cleanup: `0`.
- Catalog revision: `144 -> 146`, delta atteso `+2`.
- Retry: `0`.
- Rollback attempt: `0`.
- Cleanup audit bounded: `1`.
- Audit storici immutabili: `PRESERVED`.

## Verifica post-cleanup

- Post-check:
  `2026-07-30T15:28:33.368699Z`, `PASS`.
- Residui sintetici target complessivi: `0`.
- Baseline e fingerprint non-target pre/post: `UNCHANGED`.
- Sales, sale lines, revenue, categorie e fornitori condivisi:
  `UNCHANGED`.
- Audit storici esclusa la nuova row di cleanup: `UNCHANGED`.
- Scan globale shape-aware e case-insensitive: nessun valore non-array
  rilevante e nessun overlap target.
- Review piano e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.

## Privacy

- Occorrenze private trovate nei documenti pubblici storici: `11`.
- Occorrenze rimediate con hash bounded: `11`.
- Exact private identifiers dopo la remediation: `0`.
- Manifest arrays e cleanup SQL nel repository pubblico: `0`.
- Il risultato delle scansioni finali è registrato nell'evidence privata e
  nella evidence pubblica `TASK-148` senza riportare i valori cercati.

## Reconciliation task

| Task | Risultato tecnico | Stato governance |
| --- | --- | --- |
| TASK-143 | Acceptance finale e cleanup `PASS` | `REVIEW_READY` |
| TASK-144 | Offline authorization preservata | `REVIEW_READY` |
| TASK-145 | Article mutation v1 e cleanup `PASS` | `REVIEW_READY` |
| TASK-146 | Revisioni canoniche e acceptance `PASS` | `REVIEW_READY` |
| TASK-147 | CPU remediation e acceptance `PASS` | `REVIEW_READY` |
| TASK-148 | Cleanup consolidato e residui `0` | `REVIEW_READY` |

Tutte sono pronte per `USER_CONFIRMED_CLOSURE`; Codex non le marca `DONE`.

## Invarianti di scope

- Win7POS modificato: `NO`.
- Win7POS PR `#72` modificata: `NO`.
- Admin runtime modificato: `NO`.
- Migration o schema Supabase modificati: `NO`.
- Worker deploy aggiunti: `0`.
- Worker staging modificato: `NO`.
- Production modificata: `NO`.
- Android/iOS modificati: `NO`.
- Billing modificato: `NO`.
- Audit immutabile eliminato o modificato: `NO`.
- `docs/AI_WORKLOG.md`:
  `NOT_APPLICABLE_FILE_ABSENT`.

## Gate finali

- Diff pubblico: docs-only.
- `git diff --check`: `PASS`.
- `npm run test:foundation`: `PASS` con Win7POS final main detached
  read-only. Il primo tentativo, prima del collegamento delle dipendenze nel
  worktree, è `NOT_VALID_ENVIRONMENT`.
- `npm run verify`: `PASS`. Un primo tentativo con `node_modules` symlink è
  `NOT_VALID_ENVIRONMENT` perché Turbopack non accetta symlink fuori root.
- `npm run cf:build`: `PASS`; nessun deploy.
- `npm run security:scan`: `PASS`.
- Supabase CLI e migration list linked dal checkout principale già collegato:
  `PASS`; il worktree isolato non contiene deliberatamente il project link.
- Exact-ID, JSON/Markdown, UUID/credential, anti-symlink e Gitleaks `8.30.1`:
  `PASS`, finding `0`.
- Review indipendente del closeout:
  `PASS`, `P0/P1/P2/P3 = 0/0/0/0`.

## Matrice criteri TASK-148

| # | Criterio | Esito |
| ---: | --- | --- |
| 1 | Staging allowlisted, migration parity e Worker invariati | `PASS` |
| 2 | Authority A/B stabile con attività concorrente zero | `PASS` |
| 3 | Cardinalità aggregate esatte | `PASS` |
| 4 | Ownership/relazioni/overlap non-target zero | `PASS` |
| 5 | Review tecnica zero-gate prima del DML | `PASS` |
| 6 | Delete esatte, audit storici preservati, cleanup audit unica | `PASS` |
| 7 | Residui target zero e baseline non-target invariata | `PASS` |
| 8 | Privacy e secret scan finali | `PASS` |
| 9 | Diff docs-only, gate locali e CI | `PENDING_PR_CI` |
| 10 | Handoff review-ready, Windows 7 fisico esterno | `PASS_WITH_EXTERNAL_NOTE` |

## File pubblici toccati

- `docs/MASTER-PLAN.md`;
- `docs/HANDOFFS/WIN7POS_FINAL_ARTICLE_SYNC_CPU_REMEDIATION_READY.md`;
- `docs/HANDOFFS/WIN7POS_POS_ARTICLE_SYNC_FINAL_CLEANUP.md`;
- `docs/TASKS/TASK-143-admin-staging-catalog-pull-503.md`;
- `docs/TASKS/TASK-144-pos-offline-authorization-attestation.md`;
- `docs/TASKS/TASK-145-pos-article-mutation-v1.md`;
- `docs/TASKS/TASK-146-pos-revision-canonicalization-asus-cleanup.md`;
- `docs/TASKS/TASK-147-admin-staging-worker-cpu-remediation.md`;
- `docs/TASKS/TASK-148-final-pos-article-sync-cleanup.md`;
- `docs/TASKS/EVIDENCE/TASK-143/README.md`;
- `docs/TASKS/EVIDENCE/TASK-144/README.md`;
- `docs/TASKS/EVIDENCE/TASK-145/README.md`;
- `docs/TASKS/EVIDENCE/TASK-146/README.md`;
- `docs/TASKS/EVIDENCE/TASK-147/README.md`;
- `docs/TASKS/EVIDENCE/TASK-148/README.md`;
- `docs/TASKS/EVIDENCE/FIX-MOBILE-SHOP-CONTEXT-VISIBLE-RUNTIME-20260622/README.md`;
- `docs/TASKS/EVIDENCE/TASK-072/README.md`;
- `docs/TASKS/EVIDENCE/TASK-072/task072d-final-admin-visual-dom-check.json`.

## Rischi residui e prossima fase

- Windows 7 fisico resta `EXTERNAL_PENDING`; non è un failure del cleanup e
  non viene dichiarato `PASS`.
- Nessun rischio noto P0/P1/P2/P3 resta aperto sull'outcome staging.
- Fonte consolidata:
  `docs/TASKS/EVIDENCE/TASK-148/README.md`.
- Prossima fase: review del closeout, CI PR e conferma esplicita finale
  dell'utente/reviewer.
