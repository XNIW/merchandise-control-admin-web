# TASK-059 - Post-merge Supabase Staging Readiness

## Informazioni generali

- ID: `TASK-059`
- Titolo: `Post-merge Supabase Staging Readiness`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `REVIEWER`
- Branch previsto: `codex/task-059-post-merge-supabase-readiness`
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
| CA-04 | Supabase staging remote verification classificata con timeout o pass reale. | `PARTIAL_TIMEOUT` |
| CA-05 | Cloudflare WAF/custom domain readiness verificata read-only. | `BLOCKED_CLOUDFLARE_ZONE_NOT_CONFIGURED` |
| CA-06 | Production e staging deploy non rilanciati in TASK-059. | `NOT_RUN` |
| CA-07 | Check locali eseguiti e registrati con esito reale. | `PASS_WITH_WARNINGS` |
| CA-08 | PR aperta verso `main`, senza merge diretto. | `PENDING_PR` |

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

- `npm run test:foundation` ha inizialmente segnalato una whitelist storica
  TASK-035 che non includeva `TASK-057` come ultimo task completato. Fix mirato:
  aggiornata solo la whitelist del test legacy, poi full foundation `284/284`
  PASS.
- `npm run build` e `npm run verify` passano con warning noti Next
  `middleware` -> `proxy` e Node `DEP0205`.

## Stop condition

- Non eseguire production deploy.
- Non eseguire Supabase production apply.
- Non applicare migration o reset Supabase.
- Non stampare secret o dati reali.
- Non dichiarare TASK-059 o TASK-058 `DONE`; handoff a `REVIEW`.
