# TASK-151 - WECHAT-006 Shared Public Staging Activation and Closeout

## Informazioni generali

- ID: `TASK-151`
- Coordination key: `WECHAT-006`
- Stato: `PAUSED_FOR_MOBILE_STOREFRONT_PRODUCT_CONTROL`
- Fase attuale: `REVIEW / PAUSED_EXTERNAL_ACTIVATION`
- Responsabile attuale: `NONE`
- Attivazione: `PAUSED_FOR_MOBILE_STOREFRONT_PRODUCT_CONTROL`
- Data creazione: `2026-08-13`
- Branch applicativa/merge: `codex/wechat-006-admin-staging` / `728f413d740913145be550e1ffdbf4091dba3676`
- Branch documentale corrente: `codex/wechat-006-admin-closeout`
- Parent coordination: Mini Program `WECHAT-006`, WMP-039…WMP-046
- Evidence locale non versionata:
  `/Users/minxiang/Projects/_codex-evidence/wechat-006-shared-staging-closeout-20260813T234745Z/`

## Dipendenze

- Mandato WECHAT-006, repository guides, ADR/contratti WeChat e WECHAT-004.
- Target autorizzato `merchandisecontrol-dev` / `jpgoimipbothfgkokyvm`.
- Worker `merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`.
- Handoff TASK-150 preservato, senza writer/processo/deploy vivo.

## Scopo

Assumere la singola lane writer Admin per verificare target e backup manuale,
applicare le migration canoniche necessarie, distribuire l'Admin boundary
corrente sul solo staging, supportare provider/E2E e integrare repair mirati.

## Contesto

L'utente classifica il target esatto come `SHARED_PUBLIC_STAGING`; il badge
Supabase `main / Production` non è un blocco. TASK-150 risultava ACTIVE ma
l'audit corrente non trova writer, processi, lock, PR, deploy o lavoro non
pubblicato vivo. La sua evidence resta intatta e il task viene messo in pausa.

## Non incluso

- Qualunque ambiente diverso o produzione reale; deploy production o pubblicazione app.
- Pagamento/contratto/2FA/dichiarazioni legali; staff/PIN/POS login; Excel import.
- Service role/AppSecret nei client, provider improvvisato o JWT artigianale.
- Source changes in ClientMerchandiseControl, Win7POS or cashregistersystem.
- Deep Security Scan generale.

## File potenzialmente coinvolti

- `supabase/migrations/`, `supabase/tests/`, script DB e runbook correlati.
- Runtime/config/test Admin Auth, Mini API, sync e Cloudflare staging.
- Il presente task, TASK-150 e `docs/MASTER-PLAN.md`.
- Evidence sensibile solo nel bundle locale ristretto, mai in Git.

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-151-01 | Target/ref/region/Worker binding coincidono con lo staging autorizzato | CLI/connector/config | `PASS` |
| CA-151-02 | Backup ristretto, manifest SHA-256 e restore scratch verificati prima dell'apply | PostgreSQL/Supabase | `PASS` |
| CA-151-03 | Local reset, pgTAP, lint, RLS/performance e dry-run remoto passano | repository/CLI | `PASS_WITH_NOTES` — targeted advisor findings nonblocking documented |
| CA-151-04 | Migration canoniche applicate in ordine e history/oggetti/grant/RLS verificati | staging DB | `PASS` |
| CA-151-05 | Admin verify/build/cf:build/readiness/smoke passano | repository gates | `PASS` |
| CA-151-06 | Worker staging deployato con Version ID/commit e rollback registrati | Wrangler/smoke | `PASS` |
| CA-151-07 | Provider/flag restano fail-closed e secret server-only | config/security tests | `PASS` — tutte le flag OFF, nessun secret WeChat configurato |
| CA-151-08 | Fix testati e uniti normalmente; nessun P0/P1 resta | GitHub/review | `PASS` |
| CA-151-09 | Produzione e repository fuori scope restano invariati | final audit | `PASS` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-151-01/02 | target/backup | CLI/connector, dump/restore/checksum | `PASS` / `FAIL` | bundle ristretto |
| CA-151-03/04 | schema | reset/test/lint/list/dry-run/apply/postcheck | `PASS` / `FAIL` | log redatti |
| CA-151-05/06 | server | npm gates, Wrangler deploy/version, smoke | `PASS` / `FAIL` | deploy ledger |
| CA-151-07/08 | Auth/integration | focused tests, PR/CI/merge | `PASS` / `BLOCKED_EXTERNAL` / `FAIL` | test/GitHub ledger |
| CA-151-09 | boundary | Git/environment inventory | `PASS` / `FAIL` | closeout |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| Backup restore | safety | prima migration | restore scratch verde | dump invalido | credenziale ufficiale assente | non avviato |
| Local schema gate | DB | prima dry-run/apply | reset/test/lint verdi | regressione | runtime indisponibile | non avviato |
| Remote dry-run/apply | DB | dopo backup | history/oggetti verdi | mismatch/failure | target mismatch | non avviato |
| Admin/Worker gate | runtime | dopo schema | build/smoke/version verdi | rollback Worker | secret/config esterno | non avviato |

## Decisioni

- Target business: `SHARED_PUBLIC_STAGING`.
- Rollback primario: flags OFF + prior Worker Version ID; repair DB solo additivo.
- Nessuna riscrittura migration applicata e nessun backup esterno/committato.
- Azioni persistenti di portale/secret richiedono conferma utente al momento dell'azione.

## Planning

1. Verificare target/link/inventari senza stampare segreti.
2. Creare e restaurare il backup ristretto.
3. Eseguire preflight locale e dry-run remoto.
4. Applicare/verificare migration; repair additivo solo se necessario.
5. Eseguire gate Admin e deploy staging con rollback pronto.
6. Supportare provider/E2E progressivi e integrare fix normali.
7. Riconciliare evidence/GitHub senza auto-approvare test non eseguiti.

## Execution

- Baseline Git/GitHub e audit writer TASK-150 completati.
- Worktree isolato dall'attuale `origin/main` `4265272637aa0f96881d3f21929b999f89f45779`.
- Target `jpgoimipbothfgkokyvm` / `sa-east-1` e Worker staging esatto verificati;
  nessun altro ambiente coinvolto.
- Backup logico locale ristretto completato fuori repository con manifest SHA-256,
  schema/history, dati business necessari, drift remoto e 26 oggetti Storage.
- Restore scratch finale su stack Supabase/PostgreSQL 17.6 isolato: schema
  pre-activation a 130 migration, dati e catalogo remote-only equivalenti.
- Full-head locale: sette migration applicate da zero, sei suite WECHAT pgTAP
  `260/260`, DB lint senza errori.
- Admin: Verify, security, TypeScript, ESLint, Next build, Cloudflare build,
  i18n e foundation `969/969` non-skipped verdi.
- Delta auditabile: remote `130`, local `137`, pending esclusivamente le sette
  migration WECHAT checksum-pinned; CLI dry-run locale contro la ricostruzione
  pre-activation elenca esattamente le sette versioni.
- Workflow GitHub guardato `31759004095`: apply delle sette migration canoniche
  sul solo ref autorizzato, remote history `137` con head esatta
  `20260813160233_wechat_004_identity_link_saga`; pgTAP remoto `260/260`, DB
  lint e invarianti indipendenti post-apply verdi.
- PR Admin `#86` unita normalmente con merge commit
  `728f413d740913145be550e1ffdbf4091dba3676`.
- Worker staging distribuito dall'albero unito: Version ID
  `f797c513-f617-4941-acf1-6c2062b40fbd`, deployment
  `aea2ee57-b6c3-4364-a2ef-0e17b9dd3e7f`, traffico `100%`; rollback pronto alla versione precedente
  `83ffe585-8cfe-4c64-bccc-47a482b2397d`.
- Smoke pubblico: status WeChat `200` con tutte le superfici disabilitate;
  account Mini `503 provider_not_configured` fail-closed; Auth/Google sani e
  tail Wrangler senza errori osservati.
- Inventory secret/flag: nessun secret WeChat presente e tutte le flag restano
  `OFF`. Nessuna configurazione provider persistente è stata improvvisata.
- I finding dello schema advisor mirato restano registrati come nonblocking;
  questa esecuzione non dichiara né sostituisce un deep security scan.
- Produzione reale e repository fuori scope non sono stati modificati.

## Review

- Decisione: `READY_FOR_DESIGNATED_REVIEW`.
- I criteri tecnici Admin/staging sono passati; l'attivazione provider e l'E2E
  reale dipendono ancora da configurazione ufficiale e azioni fisiche esterne.
- `DONE` richiede conferma esplicita dell'utente o del reviewer designato.

## Fix

- Nessun finding ancora aperto.

## Chiusura

- Stato finale: `REVIEW_READY / EXTERNAL_ACTIVATION_PENDING`.
- Pausa governance 2026-08-21: il mandato USER_APPROVER attiva TASK-152 come unico
  task writer; evidence, branch e handoff WECHAT-006 restano intatti e non `DONE`.
- Follow-up: inventario/configurazione ufficiale del portale WeChat, domini e
  callback; quindi E2E reale progressivo con flag ancora fail-closed fino alla
  validazione live. Nessuna pubblicazione/review dello store è autorizzata.
