# Evidence TASK-148

## Regole

- Nessun UUID o exact ID privato del manifest/run, array del manifest, token
  o credenziale privata.
- Il package di handoff e il cleanup SQL restano fuori dal repository
  pubblico.
- Ogni `PASS` deriva da un comando o controllo realmente eseguito.
- Le evidence operative complete restano nel percorso privato locale.

## Baseline di apertura

- Admin `origin/main` iniziale:
  `e1783f57509c8011902c1f076d3b1f5ee2e56309`.
- Runtime Admin richiesto:
  `9fb54f50999b8587bc37f5e2040743df20df8f08`.
- Win7POS main read-only:
  `f34308b24fd30d0b85845429f1ece97cc5106c6d`.
- Manifest SHA-256:
  `ECA9F9158BF5B026FF6CD59C875CEE1FBB158E6608EE0E915C5AA70ABFDEE892`.
- Scope aggregato:
  7 gruppi, 18 prodotti, 28 prezzi, 21 movimenti manuali, 94 receipt,
  4 conflict receipt e 118 sync event.
- Worker staging:
  deployment `5ad3652d`, version `57af0535`.
- Produzione, Worker, billing, Win7POS, Android e iOS:
  `NOT_MODIFIED`.

## Authority e preflight

- Lease storicamente bloccante oltre la safety boundary: `PASS`.
- Check authority A:
  `2026-07-30T14:50:18.136298Z`.
- Check authority B:
  `2026-07-30T14:51:04.456172Z`.
- Intervallo: `46,319874s`; rinnovi, nuove sessioni e nuove mutation: `0`.
- Final pre-transaction authority sample:
  `2026-07-30T15:22:42.730140Z`, `PASS`.
- Manifest strict validation, ownership, lineage, migration parity, staging
  identity e Worker identity: `PASS`.
- Preflight fresco:
  `2026-07-30T15:22:56.671337Z`.
- Scope: 7 gruppi, 18 prodotti, 28 prezzi, 21 movimenti manuali, 94 receipt,
  4 conflict receipt e 118 sync event.
- Ownership ambigua, sale-origin, relazioni inattese e overlap non-target:
  `0`.
- Lease, sessioni, autorità offline e mutation in-flight: `0`.

## Privacy remediation

- Occorrenze pubbliche private precedenti: `11`.
- Occorrenze sostituite con hash bounded: `11`.
- Rescan exact-ID dopo remediation iniziale: `0`.
- Manifest, SQL ed evidence operative: assenti dal repository pubblico.

## Transazione

- SQL eseguito con isolamento `SERIALIZABLE`, lock fail-fast, advisory lock,
  assertion di cardinalità e guard fixture transaction-local.
- Review statica indipendente prima del DML:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Commit completato:
  `2026-07-30T15:25:34.623701Z`.
- Retry e rollback attempt: `0`.
- Eliminati: 18 prodotti, 28 prezzi, 21 movimenti manuali, 94 receipt,
  4 conflict receipt e 118 sync event.
- Sync event generati dalla cleanup: `0`.
- Catalog revision: `144 -> 146`, delta atteso `+2`.
- Audit cleanup bounded: `1`.

## Post-cleanup

- Post-check:
  `2026-07-30T15:28:33.368699Z`, `PASS`.
- Residui prodotti/prezzi/movimenti/receipt/conflict/sync:
  `0/0/0/0/0/0`.
- Baseline non-target pre/post: `UNCHANGED`.
- Audit storici immutabili: `PRESERVED`.
- Scan globale shape-aware e case-insensitive:
  valori non-array e overlap target `0`.
- Secondo DML: `NOT_AUTHORIZED_NOT_NEEDED`.
- Worker deploy aggiunti: `0`; produzione `NOT_MODIFIED`.

## Handoff

- Runtime Admin, migration/schema, Worker, Win7POS, PR `#72`, Android, iOS,
  produzione e billing: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- `docs/AI_WORKLOG.md`:
  `NOT_APPLICABLE_FILE_ABSENT`.
- Closeout:
  `REVIEW_READY_FOR_USER_CONFIRMED_CLOSURE`, non `DONE`.

## Gate locali e privacy finali

- Diff pubblico: `18/18` file sotto `docs/`, Markdown o JSON; symlink `0`.
- `git diff --check`: `PASS`.
- `npm run test:foundation`: `PASS` con Win7POS final main detached
  read-only. Il primo tentativo senza dipendenze nel worktree è registrato
  come `NOT_VALID_ENVIRONMENT`.
- `npm run verify`: `PASS`. Il primo tentativo con `node_modules` symlink è
  `NOT_VALID_ENVIRONMENT`, rifiutato fail-closed da Turbopack.
- `npm run cf:build`: `PASS`; deploy eseguiti `0`.
- `npm run security:scan`: `PASS`.
- Supabase CLI `2.110.0` e migration list linked dal checkout principale già
  collegato: `PASS`; versioni TASK-144/TASK-145 allineate e remap TASK-142
  invariato.
- Exact manifest identifier scan pubblico: `0` occorrenze su `1.277` file.
- Raw UUID e firme credenziali nelle sole aggiunte pubbliche: `0/0`.
- JSON/Markdown: `1/17` file, failure `0/0`.
- Evidence privata ricorsiva: firme secret e numeric-secret bounded `0/0`.
- Gitleaks `8.30.1` sul delta pubblico completo, valori redatti:
  finding `0`.
- Review documentale finale:
  `PASS`, `P0/P1/P2/P3 = 0/0/0/0`.
- PR `#57` non-draft: Database migrations/pgTAP, Verify e Cloudflare build
  `PASS`; deploy staging e production `SKIPPED`. Il merge resta subordinato
  alla CI verde della head finale dopo questo aggiornamento documentale.
