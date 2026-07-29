# TASK-147 - Admin staging Worker CPU remediation

## Informazioni generali

- ID: `TASK-147`
- Stato: `EXECUTION`
- Fase attuale: `EXECUTION`
- Responsabile attuale: `CODEX / EXECUTOR`
- Data apertura: `2026-07-29`
- Branch: `codex/admin-staging-worker-cpu-remediation-20260729`
- Baseline Admin: `293b067f54723ef8e9811a078f9f9f40ae34d33b`
- Baseline Win7POS read-only:
  `e47981f6dccbee86150b01f526e0ec6bf484afcc`
- Evidence: `docs/TASKS/EVIDENCE/TASK-147/README.md`

## Obiettivo

Eliminare gli `exceededCpu` del Worker Admin staging sul limite effettivo
osservato di 10 ms, isolando i cold path POS e preservando catalogo completo,
mutazioni articolo, offline authorization, audit, RLS e fail-closed.

## Scope

- discovery read-only del piano/limiti Cloudflare disponibili;
- correlazione temporale dell'incidente Asus e delle probe vuote;
- confronto tra ultimo Worker noto funzionante e runtime corrente;
- rimozione degli import pesanti eager dalle route POS;
- boundary leggero e bounded prima del dominio specifico;
- chunk dinamici route-local verificati sull'output Next/OpenNext;
- test di regressione TASK-139/141/142/143/144/145/146;
- review indipendente, PR non-draft, CI e merge normale;
- massimo tre deploy Worker staging, uno per correzione distinta;
- probe, catalog drain, mutation acceptance, cleanup e osservabilità;
- handoff Admin e Asus finale.

## Fuori scope

- billing o cambio piano Cloudflare;
- deploy production;
- modifica Win7POS, Android o iOS;
- riduzione di righe/pagine catalogo;
- timeout Supabase più ampi;
- indebolimento di lease, validazione, audit, RLS o grants;
- dati reali non-QA;
- secret, token o identificatori privati in repository/evidence.

## Criteri di accettazione

1. Piano Cloudflare e limiti dichiarati con evidenza o `UNKNOWN`.
2. Root cause CPU correlata a invocazioni e grafo d'import.
3. POST catalogo vuoto/malformed restituisce 400 tipizzato, mai 503.
4. Metodi non supportati restituiscono 405 senza caricare il dominio.
5. Auth denial strutturalmente valido resta 401 tipizzato.
6. First-login e mutation caricano il dominio solo dopo envelope leggero.
7. Catalog read non importa policy catalog write o Admin access principal.
8. Bundle emesso dimostra chunk route-local e cold graph ridotto.
9. Full drain reale o current-manifest con conteggi esatti e zero skip.
10. Timestamp canonici e TASK-146 preservati.
11. Mutation create/update/price/stock/lifecycle/replay/conflict preservate.
12. Zero secret/raw body nei log e zero residuali sintetici dopo cleanup.
13. Review finale `P0/P1/P2 = 0`.
14. CI richiesta verde, merge normale e main fast-forward.
15. Post-deploy: `exceededCpu=0`, `exceededMemory=0`, HTTP 503=0.
16. Production e client non Admin `NOT_MODIFIED`.
17. Handoff finale a `REVIEW_READY`, mai `DONE`.

## Evidence iniziale

- Admin `main` locale/remoto allineato alla baseline `293b067f`.
- Win7POS PR `#55` verificata merged; main read-only `e47981f6`.
- Checkout Win7POS dirty dell'utente preservato; test eseguiti su worktree
  detached.
- Worker staging attivo: deployment `25d2dd12`, version `edd39bb4`.
- Worker noto buono: deployment `bbdc35a8`, version `66eeda7f`, Admin
  `7ff0f6a0`.
- `CONFIGURED_CPU_MS=ABSENT`.
- `CLOUDFLARE_PLAN=UNKNOWN`: OAuth senza permesso billing; nessuna inferenza.
- `EFFECTIVE_CPU_LIMIT_CLASS=10ms Free-compatible`, derivato dagli
  `exceededResources` esattamente a 10.000 microsecondi.
- Incident page fisica 135: CPU 11.993 microsecondi, due subrequest, memoria
  circa 53 MB.
- Probe vuote: CPU 10.000 microsecondi, zero subrequest, memoria circa 28 MB.
- Workers Observability logs storici non leggibili con l'OAuth disponibile;
  path/method/request ID storici restano `UNKNOWN`, senza guessing.

## Diagnosi e correzione in corso

- Bundle noto buono: upload minificato `8.980.641 byte`.
- Bundle baseline corrente: upload minificato `9.029.044 byte`.
- La crescita globale di circa 48 KiB non spiega da sola l'incidente.
- Prima del fix, la route catalogo caricava staticamente circa 402 KiB di
  chunk applicativi, incluso Supabase e l'intero access principal Shop Admin.
- First-login e article mutation importavano staticamente i servizi completi
  prima di leggere o rifiutare il body.
- Correzione:
  - envelope POS compatto, bounded e privo di dipendenze dominio;
  - validazione leggera di UUID, codici, schema e struttura mutation per
    trattenere anche i malformed non vuoti sul cold path;
  - audit operativo strutturato e bounded per ogni rejection anticipata,
    senza raw body, token o client-supplied identifier;
  - import dinamico dopo il light guard;
  - helper lock credential estratto dal grafo Shop Admin;
  - contratti 400/401/405 e request ID preservati.
- Dopo il fix, il catalog cold path emesso carica circa 91 KiB di chunk
  iniziali; il dominio catalogo/Supabase è un chunk dinamico separato.
- Bundle finale dopo il fix: upload minificato `9.021.253 byte`, handler
  OpenNext `9.385.765 byte`, gzip `2.448,18 KiB`.
- Il profilo startup locale Wrangler è stato generato, ma il campionamento
  alpha è troppo sparso e hardware-dependent per attribuire CPU per sorgente;
  resta evidence di supporto, non misura di acceptance.

## Check correnti

- focused TASK-147: `9/9 PASS`.
- focused TASK-143/145/146: `30/30 PASS`.
- full foundation con Win7POS detached: `PASS`.
- verify consecutivo 1: `PASS`.
- verify consecutivo 2: `PASS`.
- typecheck: `PASS`.
- lint: `PASS`.
- security scan locale: `PASS`.
- Codex Security diff scan sul feature SHA iniziale: `PASS`, coverage runtime
  `10/10`, finding `0`; rerun finale dopo fix review `PENDING`.
- Cloudflare/OpenNext build: `PASS`.
- Worker locale: `PASS`; catalog, first-login e article mutation restituiscono
  `400`, i metodi non supportati `405`, senza `503` sulle route corrette.
- `git diff --check`: `PASS`.
- migration parity linked: `PASS` con Supabase CLI `2.109.1`.
- SQL/pgTAP: `NOT_RUN_NOT_APPLICABLE`; nessuna modifica SQL.

## Review indipendente

- Feature SHA iniziale: `247e3217`.
- Prima review:
  - `P0=0`;
  - `P1=1`: envelope non vuoti ma manifestamente invalidi caricavano ancora
    il dominio;
  - `P2=1`: i `400` anticipati non emettevano audit/log;
  - `P3=0`.
- Correzioni applicate:
  - guard strutturali più stretti senza import dominio;
  - audit operativo bounded sulle rejection anticipate;
  - allowlist del logger limitata alla singola funzione e protetta dal
    security scanner contro body, token, client request ID e altri campi
    sensibili;
  - regressione esplicita su tre envelope non vuoti invalidi e zero heavy
    load.
- Review finale: `PENDING`.

## Stato operativo

`EXECUTION_IN_PROGRESS`
