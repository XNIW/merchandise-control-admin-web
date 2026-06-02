# TASK-033 - Controlled TASK-032 review + HTTPS non-production + Win7POS live E2E + POS reconciliation + sales sync foundation

## Informazioni generali

- ID: `TASK-033`
- Titolo: `Controlled TASK-032 review + HTTPS non-production + Win7POS live E2E + POS reconciliation + sales sync foundation`
- Stato: `REVIEW_WITH_BLOCKERS`
- Fase attuale: `REVIEW_WITH_BLOCKERS`
- Milestone interna: `HANDOFF_REVIEW_WITH_BLOCKERS`
- Responsabile attuale: `USER_REVIEW`
- Data apertura progetto: `2026-06-02`
- Branch Admin Web: `codex/task-033-https-pos-sales-mega-task`
- Evidence: `docs/TASKS/EVIDENCE/TASK-033/README.md`
- Verdict corrente: `REVIEW_WITH_BLOCKERS`
- Stage: `NOT_STAGED`
- Commit: `NOT_COMMITTED`
- Push: `NOT_PUSHED`

## Contesto

TASK-033 continua il blocco lasciato da `TASK-032`, che e in `REVIEW` con milestone `FASE_6_HTTPS_NON_PRODUCTION_BLOCKED`. Il task resta unico, senza creare task ufficiali separati `TASK-033A`, `TASK-033B`, `TASK-024A` o `TASK-024B`; le parti interne sono milestone e gate.

Vincoli confermati:

- Vercel resta parcheggiato: Git Integration scollegata, zero deployment, zero alias e `vercel.json` con `git.deploymentEnabled=false`.
- Win7POS deve comunicare solo con Admin Web POS API, mai direttamente con Supabase.
- POS/Staff resta modulo della Shop Admin Console.
- Il dominio resta `shops`, `shop_id`, `shop_code`; non introdurre `merchant -> stores`.
- Nessun secret, dato cliente reale, token, credential o service-role nel repository, nel browser o in Win7POS.
- `DONE` resta decisione dell'utente dopo review.

## Scope

Fasi interne autorizzate:

1. Controlled TASK-032 review e integrazione su branch TASK-033.
2. Ambiente HTTPS non-production alternativo, senza Vercel Production e senza ricollegare Git Integration.
3. Admin Web POS API smoke su HTTPS non-production con dati sintetici.
4. Win7POS live E2E contro Admin Web HTTPS non-production.
5. Dashboard POS Shop Admin read-only con dati reali sintetici, non mock.
6. POS reconciliation per `TASK-029` e `TASK-022_023` solo se i gate reali passano.
7. Sales sync planning completo.
8. Sales sync foundation solo se schema, endpoint, idempotency, offline strategy e test strategy sono sicuri e verificati.
9. Dashboard vendite Shop Admin read-only solo se esiste foundation verificata con dati sintetici reali.
10. Handoff finale massimo a `REVIEW`, `REVIEW_WITH_BLOCKERS` o `BLOCKED_*`.

## Fuori scope e stop condition

- Non usare Vercel Production come staging.
- Non ricollegare Git Integration Vercel corrente.
- Non dichiarare produzione, staging, E2E o sales sync pronti senza gate reali.
- Non chiudere `TASK-029` o `TASK-022_023` se manca una URL HTTPS non-production reale e un run Win7POS live.
- Non implementare sales sync foundation se planning, schema, idempotency, offline strategy o test strategy restano incerti.
- Non aggiungere dipendenze runtime senza motivo esplicito e verificato.
- Non marcare `DONE`.

## Stato fasi

| Fase | Stato corrente | Note |
| --- | --- | --- |
| 0 - Pre-flight | `PASS` | Branch TASK-033 creato da `main`; TASK-032 integrato via fast-forward controllato. |
| 1 - Controlled TASK-032 review | `PASS_WITH_NOTES` | Diff e task/evidence TASK-032 letti; check base Admin Web `security:scan` e `test:foundation` passano sul branch TASK-033. |
| 2 - HTTPS non-production | `PASS_WITH_NOTES_CLOUDFLARE_QUICK_TUNNEL` | `cloudflared` installato via Homebrew; Quick Tunnel HTTPS `trycloudflare.com` ottenuto senza Vercel. |
| 3 - POS API smoke HTTPS | `PASS_HTTPS_POS_API_WITH_CLEANUP` | Root HTTPS 200, malformed POS API 400/no-store, harness POS API positivo con dataset sintetico e cleanup verificato. |
| 4 - Win7POS live E2E | `BLOCKED_WIN7POS_RUNTIME_UNAVAILABLE` | Scanner Win7POS passano e build x86 passa; esecuzione live WPF net48 non disponibile su macOS senza runner Windows/Wine/Mono. |
| 5 - Dashboard POS Shop Admin | `NOT_RUN_DEPENDS_ON_WIN7POS_LIVE` | Non dichiarata: manca run Win7POS live reale e sessione Shop Admin autenticata per verifica UI con dati sintetici reali. |
| 6 - TASK-029/TASK-022_023 reconciliation | `NOT_RUN_DEPENDS_ON_WIN7POS_LIVE` | Nessuna riconciliazione perche il gate Win7POS live resta bloccato. |
| 7 - Sales sync planning | `SALES_SYNC_PLANNED_ONLY` | Planning completo in `docs/TASKS/EVIDENCE/TASK-033/sales-sync-planning.md`. |
| 8 - Sales sync foundation | `BLOCKED_WIN7POS_RUNTIME_UNAVAILABLE` | Non implementata: schema/endpoint/idempotency/offline/test sono pianificati ma non verificati con Win7POS live. |
| 9 - Dashboard vendite Shop Admin | `NOT_RUN_DEPENDS_ON_SALES_SYNC_FOUNDATION` | Vietata senza foundation verificata e dati sintetici reali. |
| 10 - Handoff | `REVIEW_WITH_BLOCKERS` | Handoff preparato; Codex non marca `DONE`. |

## Criteri di accettazione

- Ogni gate contiene evidence da comandi realmente eseguiti o motivazioni `NOT_RUN`/`BLOCKED`.
- `TASK-032` viene integrato solo se i check base restano verdi o i fix/revert mirati sono documentati.
- HTTPS non-production deve essere una URL reale, non Vercel Production e non Git Integration ricollegata.
- POS API smoke e Win7POS live usano dati sintetici e cleanup verificabile.
- Dashboard POS e dashboard vendite non usano mock o metriche inventate.
- Sales sync foundation richiede planning verificato su schema, endpoint, idempotency, offline strategy e test strategy.
- Handoff finale include file toccati, criteri, evidence, rischi residui, stato Git e prossima fase.

## Rischi residui iniziali

- L'ambiente HTTPS non-production e stato ottenuto come Quick Tunnel effimero, non come staging stabile.
- Win7POS live E2E resta bloccato su questa macchina per assenza di runtime Windows/Wine/Mono per eseguire WPF net48.
- `TASK-024` non ha ancora file ufficiale dedicato: la fonte corrente e la sezione `TASK-024` del Master Plan.

## Handoff finale

- TASK-032 e stato integrato nel branch TASK-033 via fast-forward controllato e i check base Admin Web restano verdi.
- `cloudflared` e stato installato e usato solo per Quick Tunnel HTTPS non-production; Vercel resta parcheggiato.
- Admin Web POS API smoke HTTPS e harness positivo sono passati con dati sintetici e cleanup verificato.
- Win7POS scanner e build x86 passano, ma il live client WPF non e eseguibile su questa macchina macOS senza Windows/Wine/Mono.
- `TASK-029`, `TASK-022_023` e `TASK-024` non vengono riconciliati o avanzati perche manca il gate Win7POS live reale.
- Sales sync resta planning-only; foundation e dashboard vendite non sono state implementate.
- Check finali Admin Web: `security:scan` PASS, `test:foundation` PASS (`153/153` dopo fix regex governance), `verify` PASS con warning noto `[DEP0205]`, `git diff --check` PASS.
- Check finali Win7POS: repo pulito, scanner bootstrap/client/catalog PASS, build WPF x86 PASS con `Avvisi: 0`, `Errori: 0`.

## Review/fix Codex 2026-06-02

- Verdict review: `PASS_WITH_NOTES_HTTPS_POS_API_COMPLETE_WIN7POS_LIVE_BLOCKED`.
- Security diff scan: `PASS_NO_FINDINGS`, report in `/tmp/codex-security-scans/merchandise-control-admin-web/2fa1feb_20260602051839/report.md` e `report.html`.
- Browser smoke `/shop/pos`: `PARTIAL_PASS_UNAUTH_GUARD_ONLY`; route raggiunta via `next start` locale, guardia auth confermata con `Shop Admin access required` / `No active session`.
- Vercel: `PASS_READ_ONLY`, zero deployment, zero alias, Git Integration scollegata e `git.deploymentEnabled=false`.
- Cloudflare/runtime cleanup: `PASS`, nessun tunnel/server/container temporaneo residuo.
- Admin Web check freschi: `security:scan`, test TASK-033, `test:foundation`, `typecheck`, `lint`, `build`, `verify` e `git diff --check` passano; build/verify mantengono solo warning noto `[DEP0205]`.
- Win7POS check freschi: scanner bootstrap/client/catalog, build WPF x86 e `git diff --check` passano.
- Win7POS live E2E: `BLOCKED_WIN7POS_LIVE_ENV_NOT_AVAILABLE`, perche questa macchina e macOS arm64 e non dispone di Windows/Wine/Mono per avviare il client WPF `net48`.
- Decisione: non dichiarare `DONE`, non riconciliare `TASK-029` o `TASK-022_023`, non implementare sales sync foundation/dashboard vendite.
