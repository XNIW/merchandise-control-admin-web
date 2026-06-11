# TASK-052 - Admin Console UX polish, shell parity and operational clarity

## Informazioni generali

- ID: `TASK-052`
- Titolo: `Admin Console UX polish, shell parity and operational clarity`
- Stato: `DONE`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-06-11`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-052/README.md`

## Contesto

Questo task nasce come recovery/safe redo dopo un tentativo precedente troppo
ampio di polish della Shop Admin Console. Il tentativo precedente aveva lasciato
il worktree in stato non compilabile con conflict marker dentro un pannello
operativo. La recovery ripristina i pannelli operativi da `HEAD` dove il rischio
era alto e riapplica solo polish P0/P1 piccoli.

## Scopo

- Allineare la Shop Admin shell alla shell Platform per sticky sidebar,
  navigazione desktop e logout.
- Rimuovere il chip globale `Read-only` fuorviante dalla Shop Admin shell.
- Rendere i guardrail `Safety rules` meno invasivi, mantenendoli disponibili in
  Diagnostics.
- Correggere il tracking del task e registrare evidence del recovery.

## Non incluso

- Nessun rewrite dei pannelli `CatalogActionPanel`,
  `ImportExportActionPanel`, `MemberActionPanel`, `StaffActionPanel`.
- Nessuna modifica schema Supabase, migration, RPC, RLS o endpoint.
- Nessun dato demo, utente locale, password, PIN o token creato o documentato.
- Nessun commit, push o stage finale.
- Nessuna modifica a Win7POS, Android, iOS, Cash Register o Sales Sync.
- Nessuna nuova dipendenza.

## File coinvolti

- `src/app/shop/layout.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/components/shop/shopSections.ts`
- `src/components/admin/AdminDataTable.tsx`
- `tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs`
- `docs/TASKS/TASK-052-admin-console-ux-polish-shell-parity.md`
- `docs/TASKS/EVIDENCE/TASK-052/README.md`
- `docs/MASTER-PLAN.md`

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | Shop shell espone logout per account personale e staff manager. | Foundation/typecheck/build/browser | `PASS_WITH_FIX` |
| CA-02 | Sidebar Shop desktop sticky, full height e scrollabile. | Foundation/typecheck/build/browser | `PASS` |
| CA-03 | Chip globale `Read-only` rimosso dalla Shop shell. | Foundation/static scan | `PASS` |
| CA-04 | `Safety rules` resta disponibile ma dentro Diagnostics collassabile. | Foundation/static scan | `PASS` |
| CA-05 | `Staff`, `POS Live` e `Devices` restano dentro `POS / Staff`. | Foundation/static scan/browser | `PASS` |
| CA-06 | Pannelli operativi ripristinati da `HEAD` se danneggiati o fuori scope. | Diff/evidence | `PASS` |
| CA-07 | Nessuna migration, commit, push, stage o dato demo locale aggiunto. | Git/status/evidence/cleanup | `PASS_WITH_NOTES` |

## Execution

- File controllati: vedere evidence TASK-052.
- Modifiche fatte:
  - ripristino mirato da `HEAD` dei pannelli operativi danneggiati o troppo
    rifattorizzati;
  - ShopShell con `principalKind`, logout, sticky sidebar, nav scrollabile e
    single-shop display compatto;
  - navigazione raggruppata con `Staff` nel gruppo `POS / Staff`;
  - Diagnostics collassabile per i guardrail;
  - test foundation mirati.
- Check eseguiti: vedere evidence TASK-052.
- Handoff: `REVIEW`; non marcare `DONE` senza conferma esplicita utente.

## Rischi residui

- Refactor UX più profondi dei pannelli catalog/staff/import sono rimandati a
  follow-up separato.
- Visual QA autenticata completa resta dipendente da runtime locale sicuro e
  sessione valida.

## Chiusura

- Stato finale: `NOT_DONE`
- Conferma utente: `PENDING`
- Data chiusura: `PENDING`

## Final review 2026-06-11

- Handoff: `DONE`, ma non `DONE` senza conferma esplicita utente.
- Fix aggiunta durante review: `src/components/shop/ShopShell.tsx` usa `prefetch={false}` sui link protetti della navigazione Admin Console e sul link `Logout`, per evitare prefetch SSR/background su route protette o state-changing logout.
- Regression completa rieseguita: `git diff --check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run security:scan`, `npm run test:foundation`, `npm run verify`, `npm run test:ui-smoke:ci`.
- Browser laterale autenticato completato su target locale `127.0.0.1:3049` con dati temporanei `TASK052_REVIEW_*`; tutte le sezioni primarie Admin Console risultano accessibili senza fallback `Admin Console access required`.
- Screenshot evidence salvati in `docs/TASKS/EVIDENCE/TASK-052/`.
- Cleanup locale completata: residui `TASK035_*` e `TASK052_REVIEW_*` a zero per shop, profili, auth user, audit e inventory.
- Rischio residuo esplicito: lo smoke legacy `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts` passa 2/3 dopo la fix auth; resta un fail contenutistico su shop-owner `/shop/staff`, dove la safe view mostra `Read blocked` invece della riga `TASK035_STAFF_*`. Non dichiarato PASS.

## Final Gate Review - 2026-06-11

Phase: `REVIEW`.

Verdict: `BLOCKED_SCHEMA_OR_RLS_FIX_REQUIRED`, not `DONE`.

Final gate outcome:
- Master Console provisioning was exercised through the in-app browser with an authenticated platform admin on local Supabase.
- A shop was created through the UI with an existing Admin account owner and generated staff manager `1001` temporary PIN.
- The Admin account could access Admin Console shell/routes, with shop code context retained.
- Shop code login for staff manager `1001` worked with the generated temporary PIN.
- Recovery for staff manager `1001` worked: old PIN rejected, new PIN accepted.
- Cross-access checks passed: staff manager did not gain Master Console access; fake `shop_id` did not authorize another shop.

Code change added during gate:
- Platform protected links now disable Next.js prefetch to avoid session-losing `/auth/logout` prefetch behavior:
  - `src/components/platform/AppShell.tsx`
  - `src/components/platform/PlatformSidebarNav.tsx`
- Foundation guardrail added:
  - `tests/foundation/task-052-admin-console-ux-polish-shell-parity.test.mjs`

Blocker:
- Personal Admin account `/shop/staff` still shows `Read blocked`.
- Root cause is schema/grant/RLS, not UI polish: `staff_accounts_safe` uses `security_invoker=true` and selects `web_access_revoked_at`, but the authenticated role lacks a matching column SELECT grant on `public.staff_accounts`.
- A migration/grant/RLS fix is required and was intentionally not applied in this task/review.

Final checks:
- PASS: `git diff --check`.
- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: `npm run build` with existing warnings.
- PASS: `npm run security:scan`.
- PASS: `npm run test:foundation`.
- PASS: `npm run verify` with existing warnings.
- PASS: `npm run test:ui-smoke:ci`.
- FAIL: TASK-035 authenticated Shop Admin owner smoke, due to `/shop/staff` safe read blocker described above.

Handoff:
- Do not mark TASK-052 as DONE.
- Next required action is an explicit schema/grant/RLS follow-up for `staff_accounts_safe`, then rerun the authenticated `/shop/staff` owner smoke.

## Final professional review gate - 2026-06-11

Verdict: `DONE`.

TASK-052 is ready for user confirmation after TASK-053 fixed the staff safe read blocker and the final review fixed the logout client-navigation noise by using native GET logout forms. The task is not marked `DONE` by Codex.
