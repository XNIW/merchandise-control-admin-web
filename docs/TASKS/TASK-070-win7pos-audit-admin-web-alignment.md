# TASK-070 - Full Win7POS audit and Admin Web alignment plan

## Informazioni generali

- ID: `TASK-070`
- Titolo: Full Win7POS audit and Admin Web alignment plan
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER_CONFIRMED_CLOSURE`
- Data apertura: 2026-06-19
- File Master Plan: `docs/MASTER-PLAN.md`

## Scope

Audit completo e repo-grounded del progetto Win7POS come riferimento legacy per
POS Windows 7/offline, con piano progressivo di allineamento ad Admin Web,
Android e iOS.

Repo coinvolti:

- Win7POS: `${WIN7POS_REPO_PATH}`
- Admin Web: `${ADMIN_WEB_REPO_PATH}`
- Android riferimento: `${ANDROID_REPO_PATH}`
- iOS riferimento: `${IOS_REPO_PATH}`

## Non incluso

- Nessun commit, push, stage o merge.
- Nessun deploy, `db push`, migration apply o scrittura production.
- Nessuna nuova dipendenza senza motivo esplicito.
- Nessun cambio database locale o migrazione dati senza approvazione.
- Nessun cambio framework/tecnologia POS.
- Nessuna sostituzione dell'offline mode.
- Nessuna unificazione tra account personali e staff POS.
- Nessun dominio `merchant/stores`: il dominio resta `shops`, `shop_code`,
  `shop_id`.
- Nessun secret, PIN, password o token hardcoded o stampato in evidence.

## Metodo

- Preflight git e CodeRabbit status Win7POS senza push/PR forzati.
- Lettura codice/documentazione reali prima di conclusioni.
- Subagenti specializzati per architettura, database, staff/security, sales,
  sync readiness, UI/UX, security/secrets e QA/tooling.
- Fix diretti solo per problemi piccoli, sicuri e verificabili.
- Problemi architetturali grandi documentati come roadmap progressiva.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Repo Win7POS trovato o `REPO_NOT_FOUND` motivato | `PASS` |
| CA-02 | Preflight git Win7POS completato | `PASS_WITH_NOTES` |
| CA-03 | CodeRabbit Win7POS documentato senza inventare commenti | `PASS` |
| CA-04 | Stack/build/runtime/Windows 7 compatibility audit completato | `PASS_WITH_NOTES` |
| CA-05 | Database locale e data model audit completato | `PASS_WITH_NOTES` |
| CA-06 | Staff/login/PIN/permissions/security audit completato | `PASS_WITH_NOTES` |
| CA-07 | Sales/cash register/offline flow audit completato | `PASS_WITH_NOTES` |
| CA-08 | Sync readiness/Admin Web compatibility matrix compilata | `PASS_WITH_NOTES` |
| CA-09 | UI/UX Win7POS audit completato | `PASS_WITH_NOTES` |
| CA-10 | Security/secrets/static scan completato | `PASS_WITH_NOTES` |
| CA-11 | Build/test/lint disponibili eseguiti o motivati | `PASS_WITH_NOTES` |
| CA-12 | Roadmap TASK-071+ proposta senza implementare sync completo | `PASS` |
| CA-13 | Nessun commit, push, stage, deploy, db push o secret exposure | `PASS` |

## Evidence

Evidence operativa: `docs/TASKS/EVIDENCE/TASK-070/README.md`.

## Handoff

Codex ha completato audit, review CodeRabbit locale, fix piccoli/sicuri e
verifiche. TASK-071 ha poi riconciliato il task a `DONE` su conferma
esplicita utente.

Evidence completa: `docs/TASKS/EVIDENCE/TASK-070/README.md`.

Sintesi:

- Win7POS trovato in `${WIN7POS_REPO_PATH}`.
- Stack reale: C# WPF, `.NET Framework 4.8`, x86, SQLite locale,
  Windows 7 first.
- Online POS gia' presente per first-login, heartbeat, trusted device DPAPI e
  catalog pull da Admin Web.
- Offline POS vendita locale supportata; sales upload/sales queue non presenti.
- Staff POS resta separato da account personali: online
  `shop_code + staff_code + PIN/password`, mirror locale offline.
- Database locale mappato a Admin Web/Android/iOS; mismatch principali su
  pagamenti, refund/void, barcode canonicalization, stock frazionario,
  supplier/category tombstone e remote IDs.

Fix applicati:

- CodeRabbit: supplier/category creation non usa piu `MAX(id)+1`, bridge builder
  prende il job piu recente, dist release viene pulita, script physical Win7
  gestiscono parent path mancante, typo README guest corretto.
- Security/UX: status strip POS visibile, accesso menu Prodotti richiede
  `catalog.view`, creazione rapida prodotto richiede `catalog.edit`/override,
  confronto PIN constant-time, Change PIN pulisce i campi dopo successo.
- Security/network/export: Admin Web POS accetta `http` solo loopback; export CSV
  neutralizza celle formula-like.

Check principali Win7POS:

- `dotnet build src/Win7POS.Wpf/Win7POS.Wpf.csproj -c Release -p:Platform=x86 -p:PlatformTarget=x86`
  PASS, 0 warnings, 0 errors.
- `pwsh -File scripts/check-dialog-standards.ps1` PASS.
- `pwsh -File scripts/check-pos-online-bootstrap.ps1` PASS.
- `pwsh -File scripts/check-pos-online-client.ps1` PASS.
- `pwsh -File scripts/check-pos-catalog-pull.ps1` PASS.
- `pwsh -File scripts/check-product-dialog-free-text.ps1` PASS.
- `bash -n ...` bridge scripts PASS.
- PowerShell parser bridge/build scripts PASS.
- `git diff --check` PASS.

Rischi residui:

- Runtime fisico Windows 7/TLS/root certificates/drop native SQLite non verificati
  in questo task.
- `Win7POS.slnx` e' vuoto; build reale passa dal `.csproj` WPF.
- Sales sync non pronto: mancano queue locale, idempotency, client
  `/api/pos/sales/sync`, mapping pagamenti e policy refund/void.
- `ProductsViewModel` richiede hardening interno completo dei permessi, oltre
  alla guardia menu/quick-create applicata qui.
- `OpenCashDrawer` richiede una policy permesso dedicata o mapping approvato.

Azioni vietate rispettate: nessun stage, commit, push, merge, deploy, `db push`
o migration apply.

## Chiusura TASK-071

TASK-071 ha riconciliato questo task a `DONE` su conferma esplicita
utente. I finding Win7POS ancora correggibili sono stati chiusi; restano Win7
fisico/runtime, sales sync e roadmap catalog/device come note non bloccanti.
