# TASK-062 - Global i18n locale

## Informazioni generali

- ID: `TASK-062`
- Titolo: `Global i18n locale`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `NONE`
- Verdict tecnico: `DONE`
- Data apertura: `2026-06-15`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-062/README.md`

## Contesto

Admin Web deve supportare una UI globale localizzabile senza duplicare copy in
componenti client e senza spostare dati business nel dizionario. Il locale e
risolto server-side tramite cookie `mc_admin_locale`, con fallback sicuro a
`en`; il client espone solo il language switcher e forza il refresh RSC dopo la
scelta.

## Scope

- Definire `en`, `it`, `es`, `zh-CN` e fallback `en`.
- Risolvere il locale via cookie `mc_admin_locale`.
- Aggiornare `html lang`.
- Localizzare shell, navigazione e guardrail principali Shop/Platform.
- Localizzare le superfici critiche import/export, Database transfer e Catalog
  action panel tramite `dictionary.exact`.
- Aggiungere scanner statico per copy hardcoded UI critica.
- Coprire il contratto con test foundation dedicato.

## Non incluso

- Nessuna nuova dipendenza.
- Nessuna traduzione di dati business o righe database.
- Nessun secret, env, token, password o service-role key.
- Nessun cambio schema/RLS/RPC.
- Nessun workbook reale o dato reale nel repository.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | `mc_admin_locale` governa il locale globale con fallback `en`. | `PASS` |
| CA-02 | `en`, `it`, `es`, `zh-CN` sono esposti con label nel language switcher. | `PASS` |
| CA-03 | Shell Platform/Shop e sezioni principali usano dizionari/translator. | `PASS` |
| CA-04 | Import/export, Database transfer e Catalog action panel non restano hardcoded nelle frasi critiche. | `PASS` |
| CA-05 | Scanner i18n e test foundation TASK-062 passano. | `PASS` |
| CA-06 | Browser QA copre route principali con UI renderizzata. | `PASS_WITH_AUTH_RUNTIME_NOTE` |

## File principali

- `src/i18n/locales.ts`
- `src/i18n/get-locale.ts`
- `src/i18n/dictionaries.ts`
- `src/i18n/translate-sections.ts`
- `src/components/language-switcher.tsx`
- `src/app/layout.tsx`
- `src/app/shop/layout.tsx`
- `src/components/platform/AppShell.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/import-export/page.tsx`
- `scripts/i18n-hardcoded-ui-scan.mjs`
- `tests/foundation/task-062-global-i18n-locale.test.mjs`

## Handoff

- Fase corrente: `DONE_RECONCILED`.
- Gate finali completati nel worktree di integrazione; commit/push finale resta
  subordinato alla review orchestrata read-only richiesta dall'utente.
