# Evidence - TASK-017 Shop Business Completion

## Stato

- Task: `TASK-017 - Shop Business Completion`
- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Data apertura execution: 2026-05-31
- File task: `docs/TASKS/TASK-017-shop-business-completion.md`
- Master Plan: `docs/MASTER-PLAN.md`
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Commit: `NOT_RUN`
- Git push: `NOT_RUN`
- Stage finale: `NONE`
- Fonte brief: messaggio utente `TASK-017 - Shop Business Completion`
- Verdict corrente: `DONE`

## Letture obbligatorie

| Area | Esito | Evidence |
| --- | --- | --- |
| `AGENTS.md` | `PASS` | Letto dal contesto utente e regole locali. Lingua italiana, task attivo, no `DONE` autonomo, handoff a review. |
| `CLAUDE.md` | `PASS` | Letto prima delle modifiche. Confermati ruoli planner/reviewer vs executor/fixer e protocolli task. |
| `README.md` | `PASS` | Letto prima delle modifiche. Confermato stack Next.js App Router, TypeScript, Tailwind CSS e Supabase SSR. |
| `docs/MASTER-PLAN.md` | `PASS_WITH_NOTES` | Letto prima delle modifiche. Tracking iniziale ancora su `TASK-016` in review; execution `TASK-017` aperta dal brief utente senza marcare `TASK-016` DONE. |
| Task/evidence completate | `PASS` | Letti TASK-006, TASK-007, TASK-008, TASK-009, TASK-015, TASK-016 e relative evidence rilevanti. |
| Next.js docs locali | `PASS` | Letti `layouts-and-pages`, `server-and-client-components`, `mutating-data`, `data-security`, `use-server` da `node_modules/next/dist/docs/`. |

## TDD e discovery

| Check | Esito | Evidence |
| --- | --- | --- |
| Discovery struttura Shop Admin | `PASS` | Ispezionati `src/app/shop`, `src/components/shop`, `src/server/shop-admin`, `src/lib/supabase`, migrations, package scripts e security scanner. |
| Test failing-first | `PASS_RED` | `node --test tests/foundation/task-017-shop-business-completion.test.mjs` iniziale: 6 test, 0 pass, 6 fail; mancano dashboard completata, detail route, member actions, audit/sync e docs. |
| Test dopo implementazione parziale | `PASS_WITH_NOTES` | Stesso comando dopo implementazione codice: 6 test, 5 pass, 1 fail; failure solo su Master Plan/task/evidence non ancora creati. |

## Review finale e fix applicati

| Area | Esito | Evidence |
| --- | --- | --- |
| RPC member authorization | `FIXED` | Trovato gap reale: UI/server richiedevano `members.manage` owner-only, ma gli RPC `shop_member_*` accettavano anche `shop_manager` tramite `is_active_shop_staff_admin_member`. Aggiunta migration `20260531233000_task_017_member_owner_enforcement.sql` con helper `app_private.is_active_shop_owner_member` e ridefinizione RPC owner-only. |
| Member removal reason | `FIXED` | `shop_member_remove` ora richiede `reason` in UI, Server Action e RPC; audit registra solo `reason_provided` e `reason_length`, non il testo raw. |
| Harness TASK-017 | `FIXED` | Aggiornati `tests/foundation/task-017-shop-business-completion.test.mjs` e `scripts/security-checks.mjs` per bloccare regressioni su owner-only DB e reason obbligatoria. |
| TASK-016 boundary | `PASS` | `TASK-016` lasciato a `READY_FOR_DONE_CONFIRMATION_WITH_NOTES`; nessuna marcatura `DONE` da questa reconciliation. |

## Implementazione

| Area | Esito | Evidence |
| --- | --- | --- |
| Dashboard shop | `DONE` | `buildShopDashboardSection` aggrega inventory, staff, devices, history/sync e audit shop-scoped. |
| Categories | `DONE` | Lista e mutazioni esistenti TASK-015 mantenute; aggiunta route detail `/shop/categories/[categoryId]`. |
| Suppliers | `DONE` | Lista e mutazioni esistenti TASK-015 mantenute; aggiunta route detail `/shop/suppliers/[supplierId]`. |
| Products | `DONE` | Lista e mutazioni esistenti TASK-015 mantenute; aggiunti filtri `query`, `category_id`, `supplier_id` e route detail `/shop/products/[productId]`. |
| Excel import/export | `DONE_WITH_SCOPE_LIMITS` | Workflow TASK-015 riusato: upload/analyze/preview/validate/import e export reali nei limiti dello schema esistente. |
| Shop members | `DONE` | Aggiunti `member-mutations.ts`, `MemberActionPanel`, route detail e Server Actions invite/update/remove; RPC hardenati owner-only in DB. |
| Roles & permissions | `DONE` | Aggiunto `members.manage` owner-only e enforcement server-side/DB tramite `resolveShopActionContext` e `app_private.is_active_shop_owner_member`. |
| POS Staff | `DONE_WITH_SCOPE_LIMITS` | Route detail `/shop/staff/[staffId]`; nessuna autenticazione POS reale introdotta. |
| Devices | `DONE` | Route detail `/shop/devices/[deviceId]`; registry e azioni TASK-015 restano shop-scoped. |
| Shop Audit Log | `DONE` | Nuovo `audit-read-model.ts`, filtri lista e route detail `/shop/audit/[eventId]`; metadata redatti. |
| Sync Center | `DONE_WITH_SCOPE_LIMITS` | Nuova route `/shop/sync`, nav Shop Admin e builder read-only con stati `pending`, `success`, `failed`; nessuna sync reale. |
| Security scanner | `DONE` | Aggiunto `checkTask017ShopBusinessCompletionArtifacts`, allowlist RPC membri e gate owner-only/reason. |

## Migration e schema

| Area | Esito | Evidence |
| --- | --- | --- |
| Migration TASK-017 | `APPLIED_LINKED_DEV` | Creata e applicata `supabase/migrations/20260531230000_task_017_shop_business_completion.sql`. |
| Migration hardening review | `APPLIED_LINKED_DEV` | Creata e applicata `supabase/migrations/20260531233000_task_017_member_owner_enforcement.sql`. |
| Tabelle coinvolte | `PASS_WITH_NOTES` | `profiles`, `shop_members`, `audit_logs`; nessuna nuova tabella creata. |
| RPC aggiunte | `APPLIED_LINKED_DEV` | `shop_member_invite_profile`, `shop_member_update_role`, `shop_member_remove`. |
| Helper privato | `APPLIED_LINKED_DEV` | `app_private.is_active_shop_owner_member` con execute revocato a `public`, `anon`, `authenticated`; usato dagli RPC security definer. |
| Tipi Supabase | `PASS` | `supabase gen types typescript --linked --schema public,app_private,graphql_public > src/lib/supabase/database.types.ts`. |

## File TASK-017 toccati

- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-017-shop-business-completion.md`
- `docs/TASKS/EVIDENCE/TASK-017/README.md`
- `scripts/security-checks.mjs`
- `src/app/shop/actions.ts`
- `src/app/shop/_components/MemberActionPanel.tsx`
- `src/app/shop/audit/page.tsx`
- `src/app/shop/audit/[eventId]/page.tsx`
- `src/app/shop/categories/[categoryId]/page.tsx`
- `src/app/shop/devices/[deviceId]/page.tsx`
- `src/app/shop/members/page.tsx`
- `src/app/shop/members/[memberId]/page.tsx`
- `src/app/shop/products/page.tsx`
- `src/app/shop/products/[productId]/page.tsx`
- `src/app/shop/staff/[staffId]/page.tsx`
- `src/app/shop/suppliers/[supplierId]/page.tsx`
- `src/app/shop/sync/page.tsx`
- `src/components/shop/shopSections.ts`
- `src/server/shop-admin/audit-read-model.ts`
- `src/server/shop-admin/history-read-model.ts`
- `src/server/shop-admin/member-mutations.ts`
- `src/server/shop-admin/permissions.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260531230000_task_017_shop_business_completion.sql`
- `supabase/migrations/20260531233000_task_017_member_owner_enforcement.sql`
- `tests/e2e/platform-admin.spec.ts`
- `tests/foundation/admin-web-ui-polish.test.mjs`
- `tests/foundation/task-014-pos-staff-foundation.test.mjs`
- `tests/foundation/task-016-platform-security.test.mjs`
- `tests/foundation/task-017-shop-business-completion.test.mjs`

Nota: `git status` mostra anche molte modifiche/untracked preesistenti di TASK-015/TASK-016. Non sono state revertite.

## Dati reali, mock e fuori scope

| Area | Stato | Note |
| --- | --- | --- |
| Dati reali | `YES` | Read model server-only e RPC Supabase; nessuna tabella inventata. |
| Mock | `NONE_INTRODUCED` | Nessun nuovo mock TASK-017 inserito. |
| Android | `NOT_MODIFIED` | Fuori scope. |
| iOS | `NOT_MODIFIED` | Fuori scope. |
| POS | `NOT_MODIFIED` | Fuori scope; nessuna autenticazione POS reale implementata. |
| Realtime | `NOT_IMPLEMENTED` | Fuori scope. |
| Impersonation | `NOT_IMPLEMENTED` | Fuori scope. |

## Check finali richiesti

| Check | Esito | Evidence |
| --- | --- | --- |
| `node --test tests/foundation/task-017-shop-business-completion.test.mjs` | `PASS` | `tests 6`, `pass 6`, `fail 0`. |
| `npm run security:scan` | `PASS` | `Security scan passed.` |
| `npm run test:foundation` | `PASS` | `tests 89`, `pass 89`, `fail 0`. |
| `npm run typecheck` | `PASS` | `next typegen && tsc --noEmit` completato. |
| `npm run lint` | `PASS` | `eslint` completato senza errori. |
| `npm run build` | `PASS_WITH_WARNINGS` | Build Next completata; warning Node `DEP0205` non bloccante. |
| `npm run verify` | `PASS_WITH_WARNINGS` | lint/typecheck/security/build passati; warning Node `DEP0205` non bloccante. |
| `npm run test:ui-smoke` | `PASS_WITH_WARNINGS` | `86 passed`; warning Node `DEP0205` e Playwright `NO_COLOR`/`FORCE_COLOR` non bloccanti. |
| `git diff --check` | `PASS` | Nessun output. |
| `git status` | `PASS_WITH_NOTES` | Worktree dirty con TASK-015/TASK-016 preesistenti e TASK-017; nessun commit/push/stage finale. |
| Supabase dry-run hardening | `PASS` | Pre-push review: avrebbe applicato solo `20260531233000_task_017_member_owner_enforcement.sql`. |
| Supabase push hardening | `PASS_WITH_WARNINGS` | Primo retry con `ECIRCUITBREAKER`, poi applicata `20260531233000_task_017_member_owner_enforcement.sql`. |
| Supabase types generation | `PASS` | Tipi rigenerati dal linked schema dopo hardening. |
| Supabase migration list post-push | `PASS` | Local/remote allineati fino a `20260531233000`. |
| Supabase dry-run post-push | `PASS` | `Remote database is up to date.` |
| Supabase lint post-push | `PASS` | `Linting schema: public` e `Linting schema: app_private`, exit 0. |
| Supabase advisors post-push | `PASS` | `No issues found`. |

## Rischi residui

- `TASK-017` e stato chiuso a `DONE_RECONCILED` su richiesta esplicita dell'utente; `TASK-016` resta in review separata e non e stato marcato `DONE`.
- Invito membro usa profili esistenti e non invia email o magic link.
- POS Staff resta modulo amministrativo; PIN/password/device binding client non sono implementati.
- Sync Center visualizza eventi esistenti e stato derivato; non sincronizza dati.
- Supabase pooler ha mostrato un errore transiente `ECIRCUITBREAKER` durante la review; il push finale e i check post-push sono passati.
