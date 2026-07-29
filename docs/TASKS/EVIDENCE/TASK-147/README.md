# TASK-147 Evidence

## Regole

- Nessun secret, token, email account o identificatore privato.
- Gli ID Cloudflare pubblicabili sono abbreviati nella documentazione
  operativa; i valori completi restano nelle risposte CLI locali.
- Nessun raw request/response body di business.
- Ogni `PASS` deriva da un comando realmente eseguito.

## Baseline

- Admin: `293b067f54723ef8e9811a078f9f9f40ae34d33b`.
- Win7POS read-only: `e47981f6dccbee86150b01f526e0ec6bf484afcc`.
- Worker attivo pre-fix: deployment `25d2dd12`, version `edd39bb4`.
- Worker noto buono: deployment `bbdc35a8`, version `66eeda7f`.

## Limiti Cloudflare

- `CLOUDFLARE_PLAN=UNKNOWN`.
- `CONFIGURED_CPU_MS=ABSENT`.
- `EFFECTIVE_CPU_LIMIT_CLASS=10ms Free-compatible`.
- Motivo `UNKNOWN`: il token OAuth Wrangler non autorizza letture billing e
  la dashboard browser richiede login.
- Billing: `NOT_MODIFIED`.

## Incident window

- Invocazione catalogo compatibile con pagina fisica 135:
  `exceededResources`, CPU 11.993 microsecondi, due subrequest, memoria circa
  53 MB.
- Tre invocazioni probe vuote:
  `exceededResources`, CPU 10.000 microsecondi ciascuna, zero subrequest,
  memoria circa 28 MB.
- Workers Observability REST: `403 Authentication error`; path/method/request
  ID storico non disponibile.

## Grafo e profilo

- Noto buono:
  - upload minificato `8.980.641 byte`;
  - handler OpenNext `9.344.124 byte`.
- Baseline corrente:
  - upload minificato `9.029.044 byte`;
  - handler OpenNext `9.393.559 byte`;
  - catalog cold graph statico circa 402 KiB.
- Dopo route isolation:
  - upload minificato `9.021.253 byte`;
  - handler OpenNext `9.385.765 byte`;
  - upload gzip `2.448,18 KiB`;
  - catalog cold graph iniziale circa 91 KiB;
  - dominio catalogo/Supabase in chunk dinamici.
- Profili startup Wrangler generati prima/dopo. Il comando è alpha e i profili
  locali sono troppo sparsi per una lettura causale affidabile.

## Check eseguiti

- `npm ci`: `PASS`; audit segnala 9 advisory preesistenti
  (1 low, 8 high), nessun auto-fix eseguito.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run cf:build`: `PASS`.
- `npm run test:cloudflare:local`: `PASS`; le route catalog pull, first-login
  e article mutation restituiscono i contratti leggeri `400/405`, senza `503`.
- TASK-147 focused: `8/8 PASS`.
- TASK-143/145/146 focused: `30/30 PASS`.
- foundation completa con
  `WIN7POS_REPO_PATH=<detached-e47981f> REQUIRE_WIN7POS_REPO=1`: `PASS`.
- `npm run verify` consecutivo 1: `PASS`.
- `npm run verify` consecutivo 2: `PASS`.
- `npm run security:scan`: `PASS`.
- Codex Security diff scan:
  - coverage runtime: `10/10`;
  - finding: `0`;
  - rinvii: `0`;
  - manifest canonico sigillato e report generato.
- `git diff --check`: `PASS`.
- `npm run supabase:check`: `PASS`; CLI `2.109.1` e migration list linked
  completata.
- SQL/pgTAP: `NOT_RUN_NOT_APPLICABLE`.

## Pending

- review indipendente;
- PR/CI/merge;
- staging deploy e acceptance completa;
- handoff finale.
