# TASK-059 - Post-merge Supabase Staging Readiness

## Informazioni generali

- ID: `TASK-059`
- Titolo: `Post-merge Supabase Staging Readiness`
- Stato: `DONE_RECONCILED_WITH_NOTES`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED_RECONCILIATION`
- Branch previsto: `main`
- Base branch: `main`
- Data apertura: `2026-06-13`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-059/README.md`
- Task precedente: `TASK-058`, mergeato su `main` con commit `b93a6e4`
  e ancora `REVIEW_WITH_EXTERNAL_BLOCKERS`.

## Contesto

TASK-058 ha portato Cloudflare/OpenNext staging a un deploy verificato e
mergeato. Dopo il merge restavano note da chiarire: wording storico sui token
Cloudflare precedenti, Supabase staging remote verification ancora parziale,
rollback reale non eseguito, WAF/rate-limit bloccati da assenza di zona/custom
domain e production intenzionalmente non toccata.

TASK-059 e un task piccolo di cleanup e readiness: aggiorna lo stato reale
post-merge, prova solo verifiche read-only sicure e prepara i prossimi gate
senza applicare modifiche remote distruttive.

## Obiettivo

- Chiarire la documentazione post-merge di TASK-058 distinguendo token storici
  e token CI corrente.
- Verificare Supabase staging in modo read-only, con timeout esplicito e senza
  stampare valori sensibili.
- Verificare readiness Cloudflare custom domain/WAF solo in read-only.
- Aggiornare Master Plan, runbook ed evidence con risultati reali.
- Aprire PR verso `main`; non fare merge diretto.

## Scope incluso

- Cleanup wording documentale di TASK-058/evidence.
- Nuova evidence TASK-059.
- Verifica Supabase CLI presente/versione.
- Verifica Supabase `projects list` read-only con timeout controllato.
- Verifica guardrail staging `npm run db:staging:status` con env process-only
  e output redatto.
- Verifica GitHub environment variables per nome/timestamp, senza valori.
- Verifica Cloudflare zone/custom domain solo tramite metadata/count.
- Aggiornamento readiness checklist per WAF/custom domain/rollback.
- Check repo locali e PR verso `main`.

## Scope escluso

- Deploy production.
- Deploy staging, salvo esplicita nuova necessita documentata.
- Supabase production apply.
- Supabase migration apply, reset, dump o query dati reali.
- Lettura o stampa di secret, token, JWT, service-role key o password.
- Creazione/rotazione di token Cloudflare.
- Creazione di zone, DNS, custom domain, WAF o rate-limit remoti.
- Modifiche Android/iOS/POS.
- Refactor applicativo o nuove dipendenze.

## Criteri di accettazione

| CA | Descrizione | Stato |
| --- | --- | --- |
| CA-01 | Branch TASK-059 creato da `main` post-merge TASK-058. | `PASS` |
| CA-02 | TASK-058 wording distingue token storici `Edit Cloudflare Workers` e token CI corrente. | `PASS` |
| CA-03 | Evidence TASK-059 registra verifiche senza valori sensibili. | `PASS` |
| CA-04 | Supabase staging remote verification classificata con timeout o pass reale. | `PASS_CLASSIFIED_PARTIAL_TIMEOUT` |
| CA-05 | Cloudflare WAF/custom domain readiness verificata read-only. | `PASS_CLASSIFIED_BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED` |
| CA-06 | Production e staging deploy non rilanciati in TASK-059. | `PASS_NOT_RUN_IN_SCOPE` |
| CA-07 | Check locali eseguiti e registrati con esito reale. | `PASS_WITH_WARNINGS` |
| CA-08 | PR aperta verso `main`, senza merge diretto. | `PASS`, PR #1 mergeata su `main` con commit `d15e461` |

## Stato Supabase staging

- Supabase CLI presente: `2.106.0`.
- GitHub environment `cloudflare-staging` contiene per nome le variabili
  staging richieste, senza leggere i valori.
- `.env.local` locale contiene valori staging/dev come presenza e shape, ma
  non viene tracciato e i valori non sono stati stampati.
- `npm run db:staging:status` passa con env process-only redatto.
- `npx supabase projects list --output-format json` resta in timeout controllato
  dopo 20 secondi senza output: verdict `PARTIAL_TIMEOUT`.

## Stato Cloudflare WAF/custom domain

- Cloudflare account read-only: account presente.
- Zone Cloudflare: `0`.
- Workers custom domains: `0`.
- `wrangler.jsonc` non contiene `routes` o custom domain.
- Verdict: `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`.

## Rischi residui

- Supabase remote project-list non e pienamente verificato per timeout CLI.
- WAF/rate-limit non possono essere applicati finche manca una zona/custom
  domain Cloudflare.
- Rollback staging reale resta non eseguito; solo runbook/read-only e
  deployments status sono disponibili.
- Production resta non deployata e richiede approval esplicita futura.

## Note di verifica

- `npm run test:foundation` ha inizialmente segnalato whitelist storiche di
  governance non aggiornate per lo stato finale TASK-059. Fix mirato: aggiornate
  solo le whitelist TASK-028/TASK-035/TASK-054/TASK-055 per accettare
  `DONE_RECONCILED_WITH_NOTES`, `IDLE`, `NESSUNO` e ultimo task TASK-059, poi
  full foundation `284/284` PASS.
- `npm run build` e `npm run verify` passano con warning noti Next
  `middleware` -> `proxy` e Node `DEP0205`.

## Final review / DONE reconciliation 2026-06-13

- Conferma utente: ricevuta richiesta esplicita di final review e
  reconciliation a `DONE` per TASK-059.
- PR: #1, `https://github.com/XNIW/merchandise-control-admin-web/pull/1`,
  mergeata su `main`.
- Merge commit: `d15e461`.
- Diff review: solo runbook/evidence/tracking documentale e whitelist
  foundation governance mirate; nessun runtime applicativo, workflow deploy,
  schema, migration, secret o configurazione production modificati.
- Check finali richiesti: `git diff --check`, `npm run security:scan`,
  `npm run test:foundation`, `npm run typecheck`, `npm run lint`,
  `npm run build`, `npm run verify` e
  `CF_SMOKE_SKIP_BUILD=1 npm run smoke:cloudflare:local`.
- Supabase staging resta `PARTIAL_TIMEOUT`: e una nota residua attesa per lo
  scope TASK-059, non blocker, perche il task chiedeva classificazione
  read-only con timeout e non creazione token/progetti.
- Cloudflare WAF/custom domain resta
  `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED`: e una nota residua attesa per lo
  scope TASK-059, non blocker, perche il task chiedeva readiness read-only e
  non creazione di zone, DNS, custom domain, WAF o rate-limit.
- Staging deploy in TASK-059: `NOT_RUN`.
- Production deploy: `NOT_RUN`.
- Supabase migration/apply/reset/dump/query dati reali: `NOT_RUN`.
- TASK-058 resta `REVIEW_WITH_EXTERNAL_BLOCKERS`.
- Verdict finale TASK-059: `DONE_RECONCILED_WITH_NOTES`.

## Stop condition

- Non eseguire production deploy.
- Non eseguire Supabase production apply.
- Non applicare migration o reset Supabase.
- Non stampare secret o dati reali.
- TASK-059 puo essere riconciliato a `DONE_RECONCILED_WITH_NOTES` per lo scope
  readiness/read-only; TASK-058 resta `REVIEW_WITH_EXTERNAL_BLOCKERS`.
