# Evidence - TASK-005G

## Sintesi

- Stato task: `DONE`
- Verdict tecnico: `PASS_WITH_NOTES`
- `TASK-005`: resta `PLANNED_BLOCKED`
- Commit: `PENDING_USER_APPROVED_MAIN_MERGE`

## Evidence principale

- Migration Admin Web creata e applicata:
  - `supabase/migrations/20260530041048_task_005g_admin_web_schema_rls.sql`
- Tipi generati:
  - `src/lib/supabase/database.types.ts`
- Boundary SSR:
  - `src/lib/supabase/server.ts`
  - `src/server/platform-admin/authz.ts`
  - `src/server/platform-admin/read-model.ts`
- UI read-only:
  - `src/server/platform-admin/platform-section-data.ts`
  - `src/app/platform/*/page.tsx`

## Comandi con esito PASS

- `supabase --version`
- `supabase init`
- `supabase link`
- `supabase migration new task_005g_admin_web_schema_rls`
- validazione migration remota in transazione con rollback
- applicazione migration remota via `supabase db query --linked --file ...`
- verifiche remote RLS/grants/policy
- test RLS sintetici in transazione con rollback
- `supabase gen types --linked --lang=typescript --schema public`
- `supabase db lint --linked --schema public,app_private --level error --fail-on error`
- `npm run test:foundation`
- `npm run security:scan`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run verify`
- `npm run test:ui-smoke`

## Output sintetici

- `npm run test:foundation`: 8 test passati.
- `npm run security:scan`: `Security scan passed.`
- `npm run build`: compilazione riuscita; warning Node `DEP0205` non bloccante.
- `npm run verify`: PASS; include lint, typecheck, security scan e build.
- `npm run test:ui-smoke`: 20 test passati.
- `supabase db lint`: nessun schema error.

## BLOCKED / NOT_RUN

- `supabase db push --linked --dry-run`: bloccato da migration history remota preesistente fuori repo.
- `supabase db advisors --linked`: bloccato da circuit breaker temporaneo del pooler dopo comandi remoti paralleli.
- `supabase migration list --linked` finale: bloccato dallo stesso circuit breaker temporaneo.
- `supabase start` locale: abortito per download Docker non necessario.
- Seed permanente: non eseguito.
- CRUD/mutazioni UI: non eseguite.
- iOS/Android/POS build: fuori perimetro.

## Sicurezza

- Nessun secret salvato in repo.
- `.env.example` contiene solo nomi variabile e valori vuoti.
- Nessuna service-role key nel browser.
- Nessuna autorizzazione da `user_metadata` o `raw_user_meta_data`.
- Nessun dato sintetico RLS persistito fuori dalle transazioni rollback.

## Review addendum

- Fix review: le route Platform Admin e `/` sono state forzate a rendering dinamico per non prerenderizzare dati auth/session scoped.
- Harness aggiornati: `security:scan` e `test:foundation` verificano `dynamic = "force-dynamic"` sulle route Platform Admin.
- Check review: `supabase db advisors --linked --type security --level error --fail-on error` rieseguito con esito `PASS`.
- User approval: conferma esplicita ricevuta il 2026-05-30 con review tecnica `PASS_WITH_NOTES`; `TASK-005H` autorizzato.
- Stato governance: `TASK-005G` chiuso come `DONE` per conferma utente; `TASK-005` resta `PLANNED_BLOCKED`.
