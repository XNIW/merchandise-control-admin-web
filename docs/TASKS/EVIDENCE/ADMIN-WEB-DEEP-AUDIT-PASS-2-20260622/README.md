# Admin Web Deep Audit Pass 2 - 2026-06-22

Status: `READY_FOR_FINAL_REVIEW`

Questo passaggio e un audit dell'audit precedente. Non marca task come `DONE`, non ha fatto stage/commit/push e non ha toccato Android, iOS o Win7POS. Il worktree era gia sporco all'avvio per il primo audit Admin Web e per il task Mobile Shop Context/Switcher; questa evidence separa quindi stato iniziale, fix Pass 2 e rischi residui.

## 1. Stato iniziale

- Repository: `/Users/minxiang/Projects/merchandise-control-admin-web`.
- Data: 2026-06-22.
- `docs/MASTER-PLAN.md` letto prima delle modifiche. Nessun task attivo in `EXECUTION` da marcare `DONE`; audit trattato come handoff a review.
- Primo audit gia presente come evidence non tracciata: `docs/TASKS/EVIDENCE/ADMIN-WEB-DEEP-AUDIT-20260622/README.md`.
- Worktree iniziale gia sporco con fix del primo audit e cambi del task mobile; nessun revert eseguito.
- Subagent read-only usati per review indipendente: Security, Architecture, UI/UX, Performance, Cleanup.

## 2. Cosa aveva fatto il primo audit

Il primo audit aveva gia applicato e/o lasciato in worktree:

- redirect staff login verso login unificata `mode=shop-code`;
- staff-aware import/export e catalog writes piu shop-scoped;
- hook focus trap per dialog/modal shop;
- correzioni combobox e ARIA minime;
- cancellazione degli SVG scaffold Next/Vercel in `public/`;
- prima evidence in `docs/TASKS/EVIDENCE/ADMIN-WEB-DEEP-AUDIT-20260622/`.

## 3. Cosa era incompleto o dubbio

Pass 2 ha confermato questi punti come incompleti/dubbi del primo audit:

- Audit identity: `actor_staff_id` non veniva preservato in modo completo nei read model/UI Shop e Platform.
- Staff web login: dopo creazione sessione/cookie il login poteva riuscire anche se audit success falliva.
- History legacy owner bridge: fallback legacy `shop_id IS NULL + owner_user_id` era troppo permissivo.
- UI dialog Platform shop profile: mancava focus trap e chiusura durante pending non era abbastanza bloccata.
- Tab ARIA: alcuni controlli erano link/button con `role=tab` senza modello tastiera completo.
- Performance: Product/History detail e import/export hanno ancora letture pesanti non risolvibili in modo sicuro dentro questo audit.

## 4. Matrice coverage

| # | Area | Esito Pass 2 | Evidence / note |
|---|---|---|---|
| 1 | Master Plan/task protocol | PASS | Letti Master Plan, evidence precedente e file rilevanti prima delle patch. |
| 2 | Auth routing root/login | FIXED | Login mode selector convertito da falso tab a nav link con `aria-current`; smoke 48/48. |
| 3 | Supabase SSR/session boundary | PASS | `verify` e foundation confermano proxy/session guard; nessun client service-role introdotto. |
| 4 | Platform Admin authz | PASS | Route protette da UI smoke; no controlled operations senza accesso. |
| 5 | Shop Admin personal account | PASS | Foundation TASK-010/TASK-073 pass; identity personali restano account identities. |
| 6 | Staff web login | FIXED | Audit success fail-closed prima del cookie; sessione revocata se audit fallisce. |
| 7 | Staff/POS actor identity | FIXED | `actor_staff_id` preservato in Shop Audit, Platform Audit e success login staff. |
| 8 | Staff-aware mutations | PARTIAL / DEFERRED | Actor staff e scoping presenti; audit atomicity cross mutation+audit resta task dedicato. |
| 9 | Shop audit read model/UI | FIXED | Actor provider distingue personal account, POS staff, system. |
| 10 | Platform audit read model/UI | FIXED | `actor_staff_id` selezionato/mappato/renderizzato con fallback POS staff. |
| 11 | History legacy bridge | FIXED | Owner bridge legacy consentito solo con `catalogScope === "legacy_owner_bridge"`. |
| 12 | POS catalog pull | PASS | Gia in worktree; scanner/foundation passano e non e stato ampliato scope. |
| 13 | POS sales sync | PASS_WITH_DEFERRED_DB_INVARIANT | Server-side validation presente; manca vincolo DB prodotto/shop dedicato. |
| 14 | Mobile shop context Admin Web contract | PASS | Test mobile-shop-context in foundation passano; nessun cambio mobile runtime. |
| 15 | Import/export | PASS_WITH_PERF_DEBT | Staff-aware e shop-scoped; rimane full catalog materialization per task performance. |
| 16 | Product/History modals | FIXED | Ruoli `tab*` rimossi dai button; focus trap mantenuto; foundation TASK-078 pass. |
| 17 | Combobox/search a11y | FIXED | No-results/loading sono `role=option`, `aria-disabled`, `aria-selected=false`; lint clean. |
| 18 | Auth form a11y | FIXED | Error/status collegati a input con `aria-describedby`, `role=status/alert`. |
| 19 | Platform shop profile dialog | FIXED | Focus trap, Escape/backdrop/cancel disabilitati durante pending. |
| 20 | History detail table semantics | FIXED | Header multi-level con `scope=col/colgroup`. |
| 21 | Cleanup assets | PASS | SVG scaffold cancellati; `rg` source-only senza riferimenti. |
| 22 | Performance | DEFERRED | Carichi full-history/full-catalog confermati e documentati come next task. |
| 23 | Dead code/docs cleanup | DEFERRED | Candidati morti non rimossi per non rompere test storici e task non in scope. |
| 24 | Security scanner/guardrail | FIXED | Guardrail aggiornati per audit staff identity e staff login fail-closed. |

## 5. Fix verificati dal primo audit

- Staff login redirect: verificato da `tests/e2e/platform-admin.spec.ts` e foundation TASK-038.
- Focus trap modal shop: verificato tramite hook `useModalFocusTrap` e foundation TASK-078.
- Combobox: verificato da lint finale senza warning e dai test TASK-068E/TASK-078.
- Staff-aware import/export: verificato da foundation TASK-061 e guardrail scanner.
- SVG scaffold: `rg -n 'file\.svg|globe\.svg|next\.svg|vercel\.svg|window\.svg' src public tests scripts docs --glob '!docs/TASKS/EVIDENCE/**'` ha exit `1`, nessun riferimento source.

## 6. Fix nuovi Pass 2

Security e audit:

- `src/server/shop-admin/staff-web-auth.ts`: audit success staff login scritto prima del cookie; se audit fallisce, sessione revocata con motivo `staff_web_login_audit_failed`, cookie pulito e risultato `database_error`.
- `src/server/shop-admin/audit-read-model.ts`, `src/server/shop-admin/read-model.ts`, `src/server/shop-admin/shop-section-data.ts`: `actor_staff_id`, `actorKind`, `actorStaffId` e render POS staff/personale/system.
- `src/server/platform-admin/read-model.ts`, `src/server/platform-admin/mappers.ts`, `src/server/platform-admin/platform-section-data.ts`, `src/domain/platform-admin/types.ts`: Platform Audit preserva/renderizza `actor_staff_id`.
- `src/server/shop-admin/history-mutations.ts`: fallback legacy owner bridge bloccato se non esplicitamente `legacy_owner_bridge`.
- `scripts/security-checks.mjs`: guardrail statici aggiunti/rafforzati per audit staff identity e staff login fail-closed.

UI/UX:

- `src/app/auth/login/page.tsx`: nav modalita login usa link + `aria-current`, non piu falso tab widget.
- `src/app/platform/shops/[shopId]/ShopProfileEditForm.tsx`: dialog con focus trap, close/backdrop/Escape bloccati mentre `pending`.
- `src/app/shop/_components/ProductDetailModalController.tsx` e `src/app/shop/_components/HistoryDetailModalController.tsx`: rimossi ruoli `tablist/tab/tabpanel` dai button.
- `src/app/shop/_components/CreatableCatalogCombobox.tsx` e `src/app/shop/products/_components/ProductSearchCombobox.tsx`: fallback opzioni disabilitate complete.
- `src/components/auth/AuthForm.tsx`: messaggi collegati a input e annunciati correttamente.
- `src/app/shop/_components/HistoryDetailModalController.tsx`: scope semantico per header tabella.

Test:

- `tests/foundation/shop-read-model.test.mjs`
- `tests/foundation/task-016-platform-audit.test.mjs`
- `tests/foundation/task-038-pos-manager-web-login.test.mjs`
- `tests/foundation/task-052-hide-public-master-entrypoint.test.mjs`
- `tests/foundation/task-053-unified-admin-console-login-tabs.test.mjs`
- `tests/foundation/task-078-product-history-detail-modals.test.mjs`
- `tests/foundation/task-079c-history-generated-edit.test.mjs`
- `tests/e2e/platform-admin.spec.ts`

## 7. Residual risks del primo audit

| Rischio | Esito Pass 2 |
|---|---|
| Staff/POS actor identity perso in audit | RESOLVED: Shop e Platform audit leggono/renderizzano `actor_staff_id`. |
| Staff web login audit fail-open | RESOLVED: cookie solo dopo audit success; revoke sessione se audit fallisce. |
| History legacy fallback troppo largo | RESOLVED: fallback legacy solo con mapping esplicito `legacy_owner_bridge`. |
| POS sales `productId` cross-shop | PARTIAL: server valida; DB invariant cross-table resta task. |
| Mutazioni staff-aware senza audit atomico | DEFERRED: serve RPC/transaction DB o compensation sicura. |
| Performance full-history/full-catalog | DEFERRED: serve refactor read-model/endpoints bounded. |
| Cleanup dead code | DEFERRED: candidati confermati, ma rimozione impatta test/guardrail storici. |

## 8. Security findings

- HIGH fixed: staff web login non puo piu completare con cookie se audit success fallisce.
- HIGH fixed: bridge legacy History non puo piu pescare owner-only rows senza mapping catalog scope esplicito.
- MED fixed: Shop/Platform audit non perdono piu `actor_staff_id`.
- MED deferred: audit atomicity per staff-aware catalog/history mutations richiede transazione DB o RPC dedicata.
- MED deferred: POS sales product/shop invariant va spostato anche a livello DB.
- Source search sensibile:
  - `rg` su app/components/lib trova solo generated DB types e `src/lib/supabase/admin.ts` server-only per `SUPABASE_SERVICE_ROLE_KEY`/hash names.
  - `npm run security:scan` PASS.

## 9. Architecture findings

- Separazione principal confermata: personal account, POS staff/shop-code e system restano distinguibili.
- `actor_staff_id` ora e parte del DTO Platform/Shop dove serve, senza fonderlo con account identities.
- Staff web usa ancora admin/server-side read path per alcuni read model; e server-only e shop-filtered, ma merita wrapper/contract piu stretto in task dedicato.
- Next segnala ancora convenzione `middleware` deprecata: non e stato cambiato perche richiede task framework/convenzione separato.

## 10. UI/UX findings

- Fixed: login mode selector non usa piu ruoli tab impropri.
- Fixed: dialog shop profile intrappola focus e non si chiude accidentalmente durante submit.
- Fixed: modali product/history non espongono piu falso tab pattern.
- Fixed: errori login sono associati ai campi e annunciati.
- Fixed: no-results/loading combobox sono opzioni disabilitate complete per ARIA.
- Deferred: `src/components/platform/PlatformMasterDetail.tsx` usa ancora alcune semantiche row/action legacy; non toccato perche fuori dal fix diretto e coperto da test storici.

## 11. Performance findings

Rimangono task concreti:

- `src/server/shop-admin/shop-section-data.ts` / product detail: evitare caricamento completo History per aprire un singolo prodotto.
- `src/server/shop-admin/import-export-workbook.ts` e read model correlati: evitare materializzazione catalogo completo per preview/export quando basta subset/paginazione.
- Catalog options categoria/supplier: aggiungere query bounded/search server-side per opzioni lunghe.
- History list metrics: evitare ricarichi pesanti di session detail per ogni riga visibile.

## 12. Cleanup eseguito

- Nessun nuovo package.
- Nessun file mobile/iOS/Android modificato in Pass 2.
- SVG scaffold gia cancellati e riverificati.
- Lint warning introdotti durante Pass 2 corretti prima dell'evidence.
- Non rimossi dead-code candidates perche la rimozione richiede task dedicato con aggiornamento test/guardrail.

## 13. File eliminati e prova rg

File eliminati gia nel worktree:

- `public/file.svg`
- `public/globe.svg`
- `public/next.svg`
- `public/vercel.svg`
- `public/window.svg`

Comando:

```bash
rg -n 'file\.svg|globe\.svg|next\.svg|vercel\.svg|window\.svg' src public tests scripts docs --glob '!docs/TASKS/EVIDENCE/**'
```

Esito: exit `1`, nessun riferimento source fuori dalle evidence.

## 14. Checks

| Comando | Esito |
|---|---|
| `node --test tests/foundation/task-052-hide-public-master-entrypoint.test.mjs tests/foundation/task-053-unified-admin-console-login-tabs.test.mjs tests/foundation/task-038-pos-manager-web-login.test.mjs tests/foundation/task-016-platform-audit.test.mjs tests/foundation/shop-read-model.test.mjs tests/foundation/task-078-product-history-detail-modals.test.mjs tests/foundation/task-079c-history-generated-edit.test.mjs` | PASS, 32/32 |
| `npx tsc --noEmit --pretty false` | PASS |
| `npm run lint` | PASS, rerun finale senza warning |
| `npm run typecheck` | PASS |
| `npm run security:scan` | PASS, `Security scan passed.` |
| `npm run test:foundation` prima esecuzione | FAIL 456/457: guardrail TASK-073 ha trovato regressione statica account identity; corretto. |
| `node --test tests/foundation/task-073-account-identity-display.test.mjs` | PASS, 3/3 dopo fix |
| `npm run test:foundation` rerun | PASS, 457/457 |
| `npm run build` | PASS_WITH_WARNINGS: Next `middleware` deprecato, Node `DEP0205`. |
| `npm run verify` finale | PASS_WITH_WARNINGS: stessi warning build. |
| `npm run test:ui-smoke:ci` prima esecuzione | FAIL 47/48: test stale cercava `getByRole("tab")`; corretto a link. |
| `npm run test:ui-smoke:ci` rerun | PASS, 48/48 |
| `git diff --check` | PASS |
| `rg role="tablist"/"tab"/"tabpanel"` runtime | PASS: nessun runtime match; restano solo negative assertions nei test. |

Check valutati ma non eseguiti:

- `npm run test`: script assente.
- `npm run e2e`: script assente.
- `npm run test:ui`: script assente.
- `npm run analyze`: script assente.
- `npm run test:e2e`: non eseguito in questo audit perche il broad Playwright suite include local/staging/live opt-in non configurati in modo sicuro nel contesto corrente; eseguito invece il gate dedicato `test:ui-smoke:ci`.

## 15. Stato git finale osservato

`git status --short` finale include cambi Pass 2 e cambi preesistenti del primo audit/mobile:

```text
 D public/file.svg
 D public/globe.svg
 D public/next.svg
 D public/vercel.svg
 D public/window.svg
 M scripts/security-checks.mjs
 M src/app/(staff-auth)/shop/staff-login/actions.ts
 M src/app/auth/login/page.tsx
 M src/app/platform/shops/[shopId]/ShopProfileEditForm.tsx
 M src/app/shop/_components/CatalogActionPanel.tsx
 M src/app/shop/_components/CreatableCatalogCombobox.tsx
 M src/app/shop/_components/HistoryDetailModalController.tsx
 M src/app/shop/_components/ProductDetailModalController.tsx
 M src/app/shop/history/detail/route.ts
 M src/app/shop/products/_components/ProductSearchCombobox.tsx
 M src/app/shop/products/page.tsx
 M src/components/auth/AuthForm.tsx
 M src/domain/platform-admin/types.ts
 M src/lib/supabase/database.types.ts
 M src/server/platform-admin/mappers.ts
 M src/server/platform-admin/platform-section-data.ts
 M src/server/platform-admin/read-model.ts
 M src/server/pos-auth/catalog-pull.ts
 M src/server/pos-auth/sales-sync.ts
 M src/server/shop-admin/audit-read-model.ts
 M src/server/shop-admin/history-mutations.ts
 M src/server/shop-admin/history-read-model.ts
 M src/server/shop-admin/import-export-workbook.ts
 M src/server/shop-admin/inventory-read-model.ts
 M src/server/shop-admin/read-model.ts
 M src/server/shop-admin/shop-section-data.ts
 M src/server/shop-admin/staff-aware-mutations.ts
 M src/server/shop-admin/staff-web-auth.ts
 M tests/e2e/platform-admin.spec.ts
 M tests/foundation/shop-read-model.test.mjs
 M tests/foundation/task-016-platform-audit.test.mjs
 M tests/foundation/task-016-platform-devices.test.mjs
 M tests/foundation/task-038-pos-manager-web-login.test.mjs
 M tests/foundation/task-041-runtime-completion.test.mjs
 M tests/foundation/task-052-hide-public-master-entrypoint.test.mjs
 M tests/foundation/task-053-unified-admin-console-login-tabs.test.mjs
 M tests/foundation/task-061-android-database-export-transfer.test.mjs
 M tests/foundation/task-068e-ui-rehearsal-database-parity.test.mjs
 M tests/foundation/task-078-product-history-detail-modals.test.mjs
 M tests/foundation/task-079b-supplier-import-canonical-history.test.mjs
 M tests/foundation/task-079c-history-generated-edit.test.mjs
?? docs/TASKS/EVIDENCE/ADMIN-WEB-DEEP-AUDIT-20260622/
?? docs/TASKS/EVIDENCE/ADMIN-WEB-DEEP-AUDIT-PASS-2-20260622/
?? docs/TASKS/EVIDENCE/MOBILE-SHOP-CONTEXT-SWITCHER-20260622/
?? src/app/shop/_components/useModalFocusTrap.ts
?? supabase/migrations/20260622160000_mobile_shop_context_switcher.sql
?? tests/foundation/mobile-shop-context-switcher.test.mjs
```

## 16. Residual risks concreti

1. `src/server/shop-admin/staff-aware-mutations.ts` e `src/server/shop-admin/history-mutations.ts`: mutation + audit non sono sempre una singola transazione DB fail-closed. Serve task RPC/transaction o compensation per ogni write sensibile.
2. `src/server/pos-auth/sales-sync.ts`: server valida shop/product, ma manca invariant DB per impedire product cross-shop anche se un futuro path bypassa il server helper.
3. Performance product/history/import: servono read model bounded e query dedicate per detail/import/export su dataset grandi.
4. Cleanup: `src/proxy.ts` vs `src/middleware.ts` resta debito Next 16; il build avvisa deprecazione `middleware`.
5. Candidati dead code (`src/components/platform/components/DataTable.tsx`, `PageHeader.tsx`, alcuni barrel/mock) non rimossi in questo pass per evitare scope creep.

## 17. Next recommended task

Aprire un task unico e limitato per:

1. trasformare staff-aware catalog/history writes in RPC/transaction audited fail-closed;
2. aggiungere invariant DB POS sales product/shop con migration e test;
3. introdurre read model bounded per Product detail, History detail, import/export e catalog options;
4. migrare `middleware` verso `proxy` leggendo prima la guida Next in `node_modules/next/dist/docs/`;
5. solo dopo, rimuovere dead code con test aggiornati.

## 18. Handoff

- Stato consigliato: `READY_FOR_FINAL_REVIEW`.
- Criteri accettazione audit: copertura Pass 2 documentata, fix critici applicati, rischi residui concreti e non nascosti, check reali passati o motivati.
- No `DONE`: serve conferma esplicita utente secondo protocollo del repository.
- No stage/commit/push.
