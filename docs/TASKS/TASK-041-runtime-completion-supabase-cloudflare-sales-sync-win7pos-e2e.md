# TASK-041 - Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E

## Informazioni generali

- ID: `TASK-041`
- Titolo: `Runtime Completion: Supabase, Cloudflare/OpenNext Staging, Sales Sync and Win7POS E2E`
- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Fase attuale: `REVIEW_WITH_EXTERNAL_BLOCKERS`
- Responsabile attuale: `REVIEWER`
- Data apertura: `2026-06-04`
- Ultimo aggiornamento runtime: `2026-06-04`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-041/README.md`
- Branch Admin Web: `codex/task-041-runtime-completion`
- Milestone interna corrente: `PASS_WITH_NOTES_AND_EXTERNAL_BLOCKERS`
- Verdict corrente: `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION_ADMIN_WEB_RUNTIME_ONLY`
- Commit: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Push: `NOT_RUN`
- Stage: `NOT_STAGED`

## Obiettivo

Portare a review i gate runtime rimasti aperti da `TASK-040`, sbloccando automaticamente cio che e sicuro in ambiente non-production e lasciando bloccato solo cio che richiede runtime esterno reale.

`TASK-041` non marca `TASK-040` come `DONE`. `TASK-040` resta storico `REVIEW_WITH_EXTERNAL_BLOCKERS / SUPERSEDED_BY_TASK-041` finche una review futura non conferma esplicitamente la chiusura dei blocker.

## Decisione su TASK-040

- Decisione: `TASK-040_SHOULD_REMAIN_REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Tracking: `TASK-040_SUPERSEDED_BY_TASK-041`.
- Nota Master Plan: `SUPERSEDED_BY_TASK-041`.

Motivo: `TASK-041` ha sbloccato una parte sostanziale dei blocker runtime, ma restano ancora limiti reali su Win7POS live/manual E2E e sul final sweep linked senza password process-only. La chiusura `DONE` richiede review e conferma utente esplicita.

## Scope

- Supabase runtime unblock su local e Supabase Cloud dev non-production.
- Migration TASK-039 applicata/verificata e typegen refresh.
- Cloudflare/OpenNext validation con preview locale sicura, senza production deploy.
- Sales Sync foundation minima reale con schema idempotente e route server-side.
- Win7POS runtime package/checklist usando solo `WIN7POS_REPO_PATH`.
- Evidence, scanner, foundation test e Master Plan aggiornati.

## Out of scope

- No commit e no push.
- No Supabase production apply.
- No deploy Cloudflare/Vercel production.
- No cleanup dati remoto.
- No dashboard vendite fake.
- No modello `merchant -> stores`.
- No console POS separata: POS/Staff resta modulo Shop Admin.
- No service role, token, password, PIN o dati reali in browser, repo, log o evidence.

## Gate runtime aggiornati

### Gate 0 - Governance e preflight

- Stato: `PASS_WITH_NOTES`.
- Evidence:
  - branch `codex/task-041-runtime-completion` gia attivo;
  - task/evidence TASK-041 creati;
  - `TASK-040` resta `REVIEW_WITH_EXTERNAL_BLOCKERS / SUPERSEDED_BY_TASK-041`;
  - nessun `DONE` dichiarato da Codex.
- Nota: worktree volutamente dirty per modifiche TASK-041 non staged.

### Gate 1 - Supabase safety e migration

- Stato: `PASS_SUPABASE_DEV_APPLIED` con nota `PASS_LOCAL_CONTAINER_ALIGNMENT`.
- Target non-production verificato: progetto Supabase Cloud dev `merchandisecontrol-dev`.
- Production: `NOT_RUN_PRODUCTION_FORBIDDEN`.
- Migration applicate/verificate:
  - `20260601160000_task_028_catalog_restore_product.sql`;
  - `20260604035308_task_038_pos_manager_web_login.sql`;
  - `20260604120000_task_039_staff_aware_shop_admin.sql`;
  - `20260604214112_task_041_pos_sales_sync_foundation.sql`.
- Check passati:
  - `supabase/config.toml` allineato allo stack locale esistente con `project_id = "MerchandiseControlSupabase"`;
  - `supabase status` PASS dopo container alignment non distruttivo;
  - `scripts/dev-supabase-check.mjs` corretto per redigere anche il formato tabellare Supabase CLI (`Publishable`, `Secret`, DB URL, S3 access/secret);
  - local migration history allineata fino a `20260604214112`;
  - linked migration history allineata fino a `20260604214112`;
  - local dry-run `supabase db push --local --dry-run`: up to date;
  - linked dry-run `supabase db push --linked --dry-run`: up to date;
  - final sweep `supabase migration list --linked` senza password process-only: `BLOCKED_LINKED_PASSWORD_ENV_RETRY`; non riententato per evitare ulteriori auth retry/circuit breaker.
  - local lint `public,app_private`: `No schema errors found`;
  - linked lint `public,app_private`: `No schema errors found`;
  - local typegen probe verso `/tmp/task041-local-database.types.ts`: PASS dopo container alignment;
  - linked schema dump redatto in `/tmp`: tabelle Sales Sync, RLS forced, grants, unique constraints e indici confermati;
  - schema TASK-039 verificato: RLS/force RLS, grants, `staff_accounts_safe` security invoker, `write_staff_shop_admin_audit` security definer e `search_path`;
  - typegen refresh eseguito da linked dev in `src/lib/supabase/database.types.ts`.
- Nota residua:
  - `npm run dev:db:status` resta fail-closed quando `.env.local` punta a `supabase_cloud` in mode local; il container check e `PASS`, e `supabase status` passa con output redatto dal wrapper.
  - Un run diretto di `supabase status` puo stampare key locali generate dalla CLI: per evidence usare `npm run dev:db:status` dopo la correzione di redazione o comandi mirati non-secret.

### Gate 2 - Cloudflare/OpenNext staging

- Stato: `PASS_CLOUDFLARE_OPENNEXT_PREVIEW`.
- Implementato:
  - dev deps `@opennextjs/cloudflare` e `wrangler`;
  - script `cf:build` e `cf:preview`;
  - `open-next.config.ts`;
  - `wrangler.jsonc` staging-only con `nodejs_compat`;
  - output generati `.open-next/` e `.wrangler/` ignorati.
- Compatibility audit:
  - Next.js 16 App Router e route handlers verificati;
  - route POS server-side mantengono `runtime = "nodejs"`;
  - Supabase SSR passa tramite middleware;
  - `src/proxy.ts` rimosso per evitare Next 16 Node Proxy non supportato da OpenNext Cloudflare;
  - `src/middleware.ts` mantiene il flusso Supabase SSR, con warning deprecation noto.
- Preview/smoke:
  - `npm run cf:build`: PASS con warning OpenNext non bloccanti;
  - `npx opennextjs-cloudflare preview -- --ip 127.0.0.1 --port 8788`: PASS locale;
  - `GET /`: HTTP 200;
  - `GET /shop`: HTTP 200 con auth guard;
  - `GET /api/pos/sales/sync`: HTTP 405 atteso.
- Production deploy: `NOT_RUN_PRODUCTION_FORBIDDEN`.

### Gate 3 - Sales Sync readiness/foundation

- Stato: `PASS_SALES_SYNC_FOUNDATION`.
- Migration creata/applicata in local e linked dev:
  - `supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql`.
- Tabelle create:
  - `public.pos_sales_sync_batches`;
  - `public.pos_sales`;
  - `public.pos_sale_lines`.
- Sicurezza e data model:
  - RLS abilitata e forzata;
  - grant revocati da `public`, `anon`, `authenticated`;
  - grant solo a `service_role`;
  - idempotency DB-level per batch e sale;
  - duplicate/conflict handling;
  - `metadata_redacted` per audit;
  - niente payments/receipts runtime in v1;
  - No dashboard vendite fake.
- Route implementata:
  - `POST /api/pos/sales/sync`;
  - file `src/app/api/pos/sales/sync/route.ts`;
  - `runtime = "nodejs"`;
  - `dynamic = "force-dynamic"`;
  - POST-only;
  - body bounded via `MAX_POS_SALES_SYNC_JSON_BODY_BYTES`;
  - auth POS riusata tramite session/device/staff/shop;
  - `shop_id/shop_code` server-side;
  - service role solo server-side.
- Review/fix finale:
  - duplicate `clientSaleId` e `idempotencyKey` intra-payload respinti;
  - duplicate `clientLineId` e `linePosition` intra-sale respinti;
  - `lineTotal` deve combaciare con `quantity * unitPrice`;
  - `subtotal`, `discountTotal`, `taxTotal` e `total` devono essere coerenti;
  - `businessDate` presente ma invalida viene respinta;
  - parsing numerico stringa limitato a decimali finiti, niente hex/exponential form;
  - testo normalizzato senza control characters;
  - batch cleanup best-effort su fallimento insert vendite/righe;
  - audit success/duplicate reso fail-closed se non scrivibile.
- Limite residuo:
  - E2E live con vendita reale/sintetica da Win7POS non eseguito per assenza runtime Windows 7 e `WIN7POS_REPO_PATH`.

### Gate 4 - Win7POS live/manual E2E

- Stato: `PASS_WITH_MANUAL_WIN7_STEPS`.
- `WIN7POS_REPO_PATH`: `NOT_SET` nel runtime corrente.
- Path hardcoded Win7POS nei nuovi artefatti TASK-041: `FORBIDDEN` e non presenti.
- Host check:
  - `dotnet --version`: `10.0.300`;
  - `pwsh`: `7.6.2`;
  - host: `Darwin arm64`.
- Non eseguito:
  - build WPF x86;
  - copia artefatto via bridge/cartella condivisa;
  - run fisico/VM Windows 7;
  - sync live POS -> Admin Web.
- Checklist manuale:
  1. Impostare `WIN7POS_REPO_PATH`.
  2. Eseguire scanner PowerShell del repo Win7POS.
  3. Costruire WPF Release x86.
  4. Validare artefatto e log redatti.
  5. Copiare artefatto via bridge/cartella condivisa su Windows 7.
  6. Configurare URL Admin Web non-production.
  7. Eseguire first login, heartbeat e catalog pull.
  8. Creare vendita sintetica.
  9. Eseguire Sales Sync contro `POST /api/pos/sales/sync`.
  10. Raccogliere log/screenshot redatti.
  11. Verificare batch/sale/line in Admin Web/Supabase non-production.

### Gate 5 - Evidence, safety e handoff

- Stato: `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Condizione `REVIEW`: soddisfatta quando i final checks freschi passano o sono marcati con blocker motivato in evidence.
- Condizione `DONE`: non dichiarata da Codex. Richiede review approvata e conferma esplicita utente. Se Win7POS live resta esterno, `DONE` puo essere solo limitato a `Admin Web runtime completion`, non a production-ready globale.

## Comandi runtime usati o previsti

Preflight:

```bash
git status --short --branch
git branch --show-current
git log --oneline -n 5
```

Supabase:

```bash
SUPABASE_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 supabase --version
supabase projects list
supabase migration list --local
supabase migration list --linked
supabase db push --local
supabase db push --linked --yes
supabase db push --local --dry-run
supabase db push --linked --dry-run
supabase db lint --local --schema public,app_private --fail-on error
supabase db lint --linked --schema public,app_private --fail-on error
supabase gen types typescript --linked --schema public,app_private,graphql_public
```

Cloudflare/OpenNext:

```bash
npm install --save-dev @opennextjs/cloudflare@latest wrangler@latest
npm run cf:build
npx opennextjs-cloudflare preview -- --ip 127.0.0.1 --port 8788
```

Win7POS:

```bash
echo "${WIN7POS_REPO_PATH:-WIN7POS_REPO_PATH_NOT_SET}"
dotnet --version
pwsh --version
```

Final checks:

```bash
npm run security:scan
npm run test:foundation
npm run typecheck
npm run lint
npm run build
npm run verify
npm run cf:build
git diff --check
git status --short --branch
```

## Dati test e redazione

- Nessun dato reale clienti/operatori inserito.
- Nessuna password o service role salvata in repo/evidence.
- La password Supabase fornita dall'utente e stata usata solo process-local per lo sblocco non-production e non viene stampata o persistita.
- Output CLI con segreti: solo stato sintetico e redatto.
- Evidence Sales Sync live: `NOT_RUN_WIN7_RUNTIME_NOT_AVAILABLE`.
- Production Supabase/Cloudflare: `NOT_RUN_PRODUCTION_FORBIDDEN`.

## File toccati

- `.gitignore`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-041-runtime-completion-supabase-cloudflare-sales-sync-win7pos-e2e.md`
- `docs/TASKS/EVIDENCE/TASK-041/README.md`
- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `open-next.config.ts`
- `wrangler.jsonc`
- `src/middleware.ts`
- `src/proxy.ts` rimosso
- `src/app/api/pos/_shared/pos-route-security.ts`
- `src/app/api/pos/sales/sync/route.ts`
- `src/server/pos-auth/sales-sync.ts`
- `src/lib/supabase/database.types.ts`
- `supabase/migrations/20260604214112_task_041_pos_sales_sync_foundation.sql`
- `scripts/dev-supabase-check.mjs`
- `scripts/security-checks.mjs`
- `tests/foundation/task-041-runtime-completion.test.mjs`
- foundation legacy tests aggiornati per accettare TASK-041 come successore runtime attivo.

## Rischi residui

- Win7POS live/manual E2E richiede ambiente esterno Windows 7 e `WIN7POS_REPO_PATH`.
- `src/middleware.ts` e compatibile con OpenNext Cloudflare preview, ma Next.js 16 segnala deprecation e raccomanda `proxy`; `proxy` e pero Node-only e non supportato in questo gate OpenNext.
- OpenNext build passa ma segnala warning/copy warning non bloccanti su pacchetti zip generati.
- Sales Sync e foundation reale, ma non ancora validata end-to-end da Win7POS live.
- Supabase production non e stata toccata per policy.

## Prossima fase

`REVIEW`: validare evidence e decidere se accettare `PASS_WITH_NOTES_READY_FOR_DONE_CONFIRMATION_ADMIN_WEB_RUNTIME_ONLY` oppure autorizzare il run manuale Win7POS con `WIN7POS_REPO_PATH`. Non marcare `TASK-040 DONE`; mantenerlo `REVIEW_WITH_EXTERNAL_BLOCKERS / SUPERSEDED_BY_TASK-041`.
