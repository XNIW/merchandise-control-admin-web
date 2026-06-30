# TASK-062 - Global i18n locale

## Informazioni generali

- ID: `TASK-062`
- Titolo: `Global i18n locale`
- Stato: `DONE_CODE_READY`
- Fase attuale: `DONE_CODE_READY`
- Responsabile attuale: `NONE`
- Verdict tecnico: `DONE_CODE_READY`
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
- Localizzare il provisioning Platform e gli access gate globali senza spostare
  dati business nel dizionario.
- Formattare date/ore visibili con helper centrale locale-aware:
  `zh-CN` con `YYYY年M月D日 HH:mm`, `it` con mese breve italiano,
  `es` tramite `es-CL`; `en` resta compatibile con formato inglese.
- Localizzare label tecniche visibili in tabelle/metriche/dettagli senza
  tradurre valori business dinamici, ID, UUID, nomi shop/fornitori o dati
  provenienti dal database.
- Aggiungere scanner statico per copy hardcoded UI critica.
- Aggiungere scanner rendered che blocca date inglesi/AM-PM/slash date in
  `zh-CN` e header tecnici inglesi rimasti nel DOM.
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
| CA-07 | Date/ore e label tecniche sono localizzate senza cambiare number/price/quantity formatting o valori business. | `PASS` |

## File principali

- `src/i18n/locales.ts`
- `src/i18n/get-locale.ts`
- `src/i18n/dictionaries.ts`
- `src/i18n/format.ts`
- `src/i18n/translate-sections.ts`
- `src/components/language-switcher.tsx`
- `src/components/admin/AdminDataTable.tsx`
- `src/components/platform/displayFormat.ts`
- `src/components/platform/PlatformMasterDetail.tsx`
- `src/app/layout.tsx`
- `src/app/shop/layout.tsx`
- `src/components/platform/AppShell.tsx`
- `src/components/shop/ShopShell.tsx`
- `src/components/shop/ShopSectionPage.tsx`
- `src/app/shop/_components/ImportExportActionPanel.tsx`
- `src/app/shop/_components/CatalogActionPanel.tsx`
- `src/app/shop/import-export/page.tsx`
- `src/app/platform/provisioning/page.tsx`
- `src/app/platform/provisioning/provisioningLabels.ts`
- `src/components/auth/AccessState.tsx`
- `scripts/i18n-hardcoded-ui-scan.mjs`
- `scripts/i18n-rendered-text-scan.mjs`
- `tests/foundation/task-062-global-i18n-locale.test.mjs`

## Handoff

- Fase corrente: `DONE_CODE_READY`.
- Gate finali completati nel worktree di integrazione; closure finale
  autorizzata dal prompt utente con review A/B/C, staging selettivo, commit e
  push su `main`.

## Addendum finale Admin Web + Win7POS i18n - 2026-06-30

- Stato operativo finale: `DONE_CODE_READY`, non `VERIFIED_RUNTIME`.
- i18n Admin Web + Win7POS completato per `en`, `es`, `it`, `zh-CN`.
- Gate completati: Admin runtime smoke locale, scanner statici, test
  foundation, lint, typecheck, security scan, Next build, Win7POS Release x86
  build, dialog standards e package di validazione runtime Win7POS.
- Nota runtime: Windows 7 physical/VM runtime validation unavailable; code,
  build, static scanner, Admin runtime smoke, POS x86 build and validation
  package are complete. Runtime WPF validation remains documented as
  external/manual evidence only if environment becomes available.
