# Manifest consolidamento finale Mac — Admin Web

Data: 2026-07-17
Repository: Admin Web canonico
Stato iniziale: `main` @ `20f430f8c6e73865a94f4ceba7d5719f82746dfe`; `origin/main` @ `38f02bd969e55df91ff41d3905661da8dfdb145a`; ahead/behind `0/5`; worktree sporco.
Branch di separazione: `integrate/mac-final-admin-20260717T150455Z`.
Branch di validazione previsto: `validate/mac-final-admin-20260717T150455Z`.

Commit locali già creati:

- `1aadd76d` — freeze TASK-088B/K125 (`H. TASK088_PRESERVE`);
- `40d1c445` — runtime TASK-137 iniziale;
- `205da0a6` — verifica TASK-137 iniziale;
- `cf76fe36` — hardening lifecycle Storage/signed read;
- `cfd101b7` — UI thumbnail/placeholder;
- `96051fc6` — regressioni finali;
- `bfec822e` — merge locale TASK-088B/TASK-137;
- `2f166b51` — riconciliazione clean-merge;
- `8891ee20` — fix denied-audit cross-shop;
- `3bd380c6` — checkpoint scan consolidato;
- `SELF` — remediation release, gate CI e freeze per il nuovo scan.

Metadati comuni: repository Admin canonico; ogni path nelle sezioni include ha
`include=yes`, motivo/evidence/dipendenze assegnati dalla sezione. I path `A`
nei receipt Git erano untracked al recovery, i path `M` erano tracked. Per la
governance TASK-137 solo `docs/MASTER-PLAN.md` era tracked; gli altri path erano
untracked. Le regole di esclusione in coda classificano deterministicamente
ogni altro path del worktree senza includere file sconosciuti.

La whitelist seguente è esaustiva. Tutti i path non elencati restano esclusi dal consolidamento.

## TASK-088B — runtime e migrazioni (`H. TASK088_PRESERVE`)

- `scripts/run-with-env.mjs`
- `scripts/testing/task-088-bootstrap-session.mjs`
- `scripts/testing/task-088-refresh-session.py`
- `src/app/api/shop/pos/revenue/sale-detail/route.ts`
- `src/app/shop/qa-sync-fixture/route.ts`
- `src/server/pos-auth/sales-sync.ts`
- `supabase/migrations/20260715120000_dsc_008_072_073_inventory_product_dml_rls.sql`
- `supabase/migrations/20260715130000_dsc_093_094_134_pos_sales_security.sql`
- `supabase/migrations/20260715223000_task_088_mobile_atomic_sync_event_triggers.sql`

## TASK-088B — test (`H. TASK088_PRESERVE`)

- `supabase/tests/dsc_008_072_073_inventory_product_dml_rls.sql`
- `supabase/tests/dsc_093_094_134_pos_sales_security.sql`
- `supabase/tests/task_088_mobile_atomic_sync_events.sql`
- `tests/e2e/staging/task-088-final-sync-qa-fixture.spec.ts`
- `tests/foundation/task-088-final-sync-qa-fixture.test.mjs`
- `tests/foundation/task-088-final-sync-session-bootstrap.test.mjs`
- `tests/foundation/task-088-final-sync-session-refresh.test.mjs`
- `tests/foundation/task-088-pos-sales-reversal-parser.test.mjs`
- `tests/foundation/task-088-pos-sales-security-regressions.test.mjs`

## TASK-088B — governance, diagnosi ed evidence congelata (`H. TASK088_PRESERVE`)

- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/.gitattributes`
- `docs/TASKS/TASK-088-final-multiplatform-p1-security-remediation.md`
- `docs/TASKS/EVIDENCE/TASK-088/README.md`
- `docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json`
- `docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.sql`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/baseline_receipts.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/delta_manifest.tsv`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/scope_manifest.tsv`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/security_guidance.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/seed_research.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/snapshot_canonical.tsv`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/snapshot_inventory.tsv`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/target_resolution.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/01_context/threat_model.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/02_discovery/deep_review_input.jsonl`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/02_discovery/finding_discovery_report.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/02_discovery/rank_input.jsonl`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/02_discovery/work_ledger.jsonl`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/03_coverage/repository_coverage_ledger.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/artifacts/03_coverage/reviewed_surfaces.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/coverage.json`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/exports/results.sarif`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/findings.json`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/report.md`
- `docs/TASKS/EVIDENCE/TASK-088/security-diff-scan-LOCALK125/scan-manifest.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260716T193151Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK84_-environment-local-p4547.md`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T011202Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK97T_-environment-local-mode-admin-ios-product-update-warm-32-p62200-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T011202Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK97T_-environment-local-mode-admin-ios-product-update-warm-32-p62200.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T011202Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK97T_-environment-local-mode-admin-ios-product-update-warm-32-p62200.md`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T012728Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK99T_-environment-local-mode-admin-ios-product-update-warm-32-p7125-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T012728Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK99T_-environment-local-mode-admin-ios-product-update-warm-32-p7125.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T012728Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK99T_-environment-local-mode-admin-ios-product-update-warm-32-p7125.md`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053132Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK123_-environment-local-mode-ios-admin-product-create-warm-32-p19066-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053132Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK123_-environment-local-mode-ios-admin-product-create-warm-32-p19066.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053132Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK123_-environment-local-mode-ios-admin-product-create-warm-32-p19066.md`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053732Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK124_-environment-local-mode-ios-admin-product-create-warm-32-p44070-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053732Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK124_-environment-local-mode-ios-admin-product-create-warm-32-p44070.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T053732Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK124_-environment-local-mode-ios-admin-product-create-warm-32-p44070.md`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T054430Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK125_-environment-local-mode-full-p69539-final-sync-ledger.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T054430Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK125_-environment-local-mode-full-p69539.json`
- `docs/TASKS/EVIDENCE/TASK-088/ios-coordinator/agent-runs/20260717T054430Z-live-final-sync-matrix-task-TASK-088-prefix-TASK_SYNC_FINAL_20260714_LOCALK125_-environment-local-mode-full-p69539.md`

## TASK-137 — backend source (`A. TASK137_BACKEND_SOURCE`)

- `package.json`
- `scripts/security-checks.mjs`
- `scripts/admin/task-137-product-image-cleanup.mjs`
- `scripts/admin/task-137-product-image-report.mjs`
- `src/app/api/shop/product-images/finalize/route.ts`
- `src/app/api/shop/product-images/intent/route.ts`
- `src/app/api/shop/product-images/read-urls/route.ts`
- `src/app/api/shop/product-images/remove/route.ts`
- `src/server/shop-admin/product-images/auth.ts`
- `src/server/shop-admin/product-images/cache-scope.ts`
- `src/server/shop-admin/product-images/contract.ts`
- `src/server/shop-admin/product-images/jpeg-validator.ts`
- `src/server/shop-admin/product-images/service.ts`
- `src/lib/supabase/database.types.ts`
- `src/server/shop-admin/inventory-read-model.ts`
- `src/server/shop-admin/page-access.ts`
- `src/server/shop-admin/detail-modal-read-model.ts`

`scripts/security-checks.mjs` contiene anche il solo hunk `H` necessario a
verificare la RPC atomica e i pgTAP TASK-088 gia congelati, sostituendo le
asserzioni obsolete sulle scritture finanziarie dirette.

## TASK-137 — Admin UI (`B. TASK137_ADMIN_UI`)

- `src/lib/product-images/browser-client.ts`
- `src/app/shop/_components/ProductDetailModalController.tsx`
- `src/app/shop/_components/ProductImageControls.tsx`
- `src/app/shop/products/page.tsx`
- `src/i18n/dictionaries.ts`

## TASK-137 — migration contract (`F. TASK137_MIGRATION_CONTRACT`)

- `supabase/migrations/20260717072959_task_137_product_catalog_images.sql`
- `supabase/migrations/20260717073607_task_137_product_catalog_images_sync_fix.sql`
- `supabase/migrations/20260717170000_task_137_product_image_cleanup_hardening.sql`
- `supabase/migrations/20260717200129_task_137_product_image_denied_audit_guard.sql`
- `supabase/migrations/20260717235400_task_137_release_catalog_security_hardening.sql`
- `supabase/migrations/20260717235500_task_137_release_pos_financial_hardening.sql`

## TASK-137 — test (`E. TASK137_TEST`)

- `supabase/tests/task_137_product_catalog_images.sql`
- `supabase/tests/task_137_product_image_denied_audit_regression.sql`
- `tests/e2e/task-137-cross-shop-denied-audit.spec.ts`
- `tests/foundation/task-137-product-catalog-images.test.mjs`
- `tests/e2e/task-137-product-catalog-images-local.spec.ts`
- `supabase/tests/task_137_release_catalog_security.sql`
- `tests/foundation/task-137-release-security-hardening.test.mjs`

## TASK-137 — release Security e compatibilita CI (`N. TASK137_RELEASE_SECURITY`)

- `src/app/shop/qa-sync-fixture/route.ts`
- `src/server/pos-auth/sales-sync.ts`
- `supabase/tests/dsc_008_072_073_inventory_product_dml_rls.sql`
- `supabase/tests/dsc_093_094_134_pos_sales_security.sql`
- `tests/foundation/task-088-final-sync-qa-fixture.test.mjs`
- `tests/foundation/task-088-pos-sales-reversal-parser.test.mjs`
- `tests/foundation/task-041-runtime-completion.test.mjs`
- `tests/foundation/task-054-shop-admin-auth-navigation.test.mjs`
- `tests/foundation/task-055-shop-admin-ui-polish.test.mjs`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `tests/foundation/task-079-catalog-pagination-unified.test.mjs`
- `tests/foundation/task-081-pos-sales-revenue-stock-sync.test.mjs`
- `tests/foundation/task-087-pos-p1-hardening.test.mjs`
- `tests/foundation/task-089-sync-architecture-excellence.test.mjs`

La route QA e attribuita congiuntamente al freeze TASK-088 e alla compatibilita
TASK-137: valida il prezzo target shop-scoped e appende una versione, senza
riaprire la matrice 1024/K125. I test storici elencati sono cambiati soltanto
per riflettere la singola RPC POS atomica, lo stato `imageBusy` e TASK-137 come
task corrente; nessun runtime storico aggiuntivo e stato rifattorizzato.

## Dipendenza validata emersa nel clean merge (`I. OTHER_VALIDATED_PROJECT_WORK`)

- `src/server/shop-admin/data-access.ts`
- `src/server/shop-admin/permissions.ts`
- `src/server/shop-admin/staff-web-permissions.ts`
- `scripts/i18n-contract-scan.mjs`

Inclusione limitata agli hunk che rendono effettivo `requiredPermission` per le
letture prodotto TASK-137 e per la route POS TASK-088 già congelata. Sono
escluse le altre modifiche locali presenti sugli stessi file; la regressione è
coperta dal test foundation TASK-137 e dai gate del worktree pulito. I due soli
path i18n `OperatorSwitchDialog` riallineano il gate al checkout Win7POS
read-only corrente senza modificarlo; il prefisso dinamico whitelisted
`notice.` evita di trattare una concatenazione runtime come chiave letterale,
senza allargare la whitelist ad altre famiglie.

## TASK-137 — governance ed evidence (`G. TASK137_DOCUMENTATION`)

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-137-product-catalog-images-cross-platform.md`
- `docs/TASKS/EVIDENCE/TASK-137/00-contract-and-baseline.md`
- `docs/TASKS/EVIDENCE/TASK-137/01-schema-rls-and-grants.md`
- `docs/TASKS/EVIDENCE/TASK-137/02-api-and-security-tests.md`
- `docs/TASKS/EVIDENCE/TASK-137/03-admin-web.md`
- `docs/TASKS/EVIDENCE/TASK-137/04-android.md`
- `docs/TASKS/EVIDENCE/TASK-137/05-ios.md`
- `docs/TASKS/EVIDENCE/TASK-137/06-cross-platform-runtime.md`
- `docs/TASKS/EVIDENCE/TASK-137/07-cleanup-and-baseline.md`
- `docs/TASKS/EVIDENCE/TASK-137/08-storage-cost-and-operations.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/README.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/README.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/coverage.json`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/findings.json`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/report.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/scan-manifest.json`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/findings/cross-shop-denied-audit-injection/poc/README.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/findings/cross-shop-denied-audit-injection/poc/cross-shop-denied-audit.sql`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/findings/cross-shop-denied-audit-injection/poc/representative-output.txt`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/hardening/hardening.json`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/pre-fix/hardening/hardening.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/post-fix/README.md`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/post-fix/poc-original-post-fix.txt`
- `docs/TASKS/EVIDENCE/TASK-137/09-security-diff-scan/post-fix/regression-results.txt`
- `docs/TASKS/EVIDENCE/TASK-137/10-final-handoff.md`
- `docs/TASKS/EVIDENCE/TASK-137/README.md`
- `docs/TASKS/EVIDENCE/TASK-137/admin-web-local-e2e.json`
- `docs/TASKS/EVIDENCE/TASK-137/admin-web-performance.json`
- `docs/TASKS/EVIDENCE/TASK-137/admin-web-product-image-local.png`
- `docs/TASKS/EVIDENCE/TASK-137/11-mac-final-manifest.md`
- `docs/TASKS/EVIDENCE/TASK-137/12-publish-checkpoint.md`
- `docs/TASKS/EVIDENCE/TASK-137/13-release-security-remediation.md`

## Esclusioni esplicite

- Ogni modifica preesistente o non riconducibile a TASK-088B/TASK-137 non inclusa sopra.
- `artifacts/`, `docs/AUDITS/`, evidence TASK-076 e migrazioni/test di task diversi.
- Nessun segreto, output grezzo, dipendenza generata, deploy o migrazione remota.
- La vecchia selezione Codex Security è stale e non sarà riutilizzata.
- Tutti i tracked dirty non elencati sono `L. UNRELATED_PRESERVE`; `artifacts/`,
  build/cache/log/xcresult e altri output sono `J. GENERATED_EXCLUDE`; config
  locali, database, token/sessioni/cookie/secret/signed URL sono
  `K. SENSITIVE_EXCLUDE`. Nessun `M. UNKNOWN_BLOCK` viene incluso; la sola
  categoria `I. OTHER_VALIDATED_PROJECT_WORK` ammessa comprende soltanto i
  quattro path elencati sopra.
- La `.gitattributes` TASK-088 resta confinata agli artifact byte-preserved già
  congelati; non copre sorgenti e non viene estesa da TASK-137.
