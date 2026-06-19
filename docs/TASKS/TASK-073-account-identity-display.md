# TASK-073 - Account identity display globale

## Informazioni generali

- ID: `TASK-073`
- Titolo: `Account identity display globale: email, provider e icona`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `CODEX_CLOSURE_REVIEW`
- Data apertura: `2026-06-19`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-073/README.md`

## Decisione di apertura

TASK-072 resta in `REVIEW`. Questo task viene aperto per override esplicito
dell'utente dal brief allegato su identita account globale. Codex lavora come
executor/fixer.

Closure review 2026-06-19: l'utente ha richiesto esplicitamente di non lasciare
TASK-073 in `REVIEW` e di correggere fixture/test/harness interni fino a
`DONE` reale. La chiusura usa l'eccezione `GLOBAL-REVIEW-001` del Master Plan:
`DONE` e consentito quando review tecnica, check ed evidence sono positivi.

## Scopo

Mostrare account personali web/Supabase Auth in modo leggibile e riusabile in
Admin Web, sostituendo UUID/profile id come informazione primaria quando sono
disponibili email o display name.

Include:

- modello TypeScript riusabile per identita account;
- componente UI riusabile con provider e icona senza nuove dipendenze;
- Shop Admin Console Members e audit actor/profile personali;
- Master Console Users, Shop Admins, Platform Admins, ownership/shop detail e
  audit globale dove compaiono profili/account personali;
- normalizzazione provider da origine Supabase/Auth reale quando disponibile;
- fallback chiaro quando email/provider mancano;
- test foundation mirati e check richiesti.

## Non incluso

- Commit, push, stage o deploy.
- Nuove dipendenze per icone.
- Migration, tabelle o colonne Supabase nuove.
- Service-role key lato client/browser.
- Esposizione globale di Auth users nella Shop Admin Console.
- Deduzione provider da dominio email.
- Fusione tra account personale e Staff POS.
- Modifiche a login, auth flow, POS sync o schema fuori scope.

## Criteri di accettazione

| CA | Descrizione | Stato |
|---|---|---|
| CA-01 | Modello e normalizzazione provider riusabili coprono google/email/apple/wechat/weixin/unknown. | `PASS` |
| CA-02 | Componente Account Identity mostra email/display name, provider con icona e profile id secondario. | `PASS` |
| CA-03 | Shop Admin Members mostra Account/Utente leggibile e resta shop-scoped. | `PASS` |
| CA-04 | Master Console Users/Admins/ownership/audit usano la stessa logica/fallback. | `PASS` |
| CA-05 | Nessun provider inventato da dominio email; provider mancante resta Unknown/Origine non disponibile. | `PASS` |
| CA-06 | Staff POS puro resta separato da account personale. | `PASS` |
| CA-07 | Check richiesti eseguiti o marcati `NOT_RUN`/`BLOCKED` con motivo reale. | `PASS` |

## Check richiesti

- `npm run lint`
- `npm run typecheck`
- `npm run test:foundation`
- `npm run test:shop:local`, se ambiente locale disponibile
- `npm run test:platform:local-users`, se ambiente locale disponibile
- `npm run verify`
- `git diff --check`
- `git status`

## Note schema/Auth

`profiles` contiene `profile_id`, `display_name`, `profile_status` e timestamp,
ma non contiene email/provider. Email/provider devono derivare da Supabase Auth
attraverso boundary server-side gia esistente, restituendo solo DTO minimi.

## Closure Review Codex - 2026-06-19

Fase chiusa: `DONE`.

Implementato:

- `src/lib/account-identity.ts`: modello serializzabile `AccountIdentitySummary`,
  normalizzazione provider e fallback profile id.
- `src/components/account/AccountIdentity.tsx`: renderer riusabile email/display
  name + provider label/icona + profile id secondario, senza nuove dipendenze.
- `src/server/platform-admin/auth-identities.ts`: provider solo da
  `app_metadata.provider` / `user.identities`; aggiunto lookup server-only
  bounded by profile id con `getUserById`.
- `src/server/platform-admin/platform-section-data.ts` e
  `src/app/platform/admins/page.tsx`: Master Console Users, Shop Admins,
  Platform Admins, ownership e audit usano account identity dove disponibile.
- `src/server/shop-admin/read-model.ts`,
  `src/server/shop-admin/audit-read-model.ts` e
  `src/server/shop-admin/shop-section-data.ts`: Shop Admin Members/audit actor
  mostrano account identity tramite lookup Auth limitato ai profile id gia
  visibili nello shop selezionato.
- `src/components/admin/AdminDataTable.tsx`,
  `src/components/platform/PlatformMasterDetail.tsx`,
  `src/components/platform/components/DataTable.tsx`,
  `src/components/platform/platformData.ts`,
  `src/components/shop/shopSections.ts` e `src/i18n/translate-sections.ts`:
  tabelle compatibili con celle strutturate senza tradurre gli oggetti identity.
- `src/i18n/dictionaries.ts`: label provider/fallback tradotte per it/es/zh-CN.
- `tests/foundation/task-073-account-identity-display.test.mjs`: test mirato su
  modello, boundary, integrazione e separazione Staff POS.

Provider determination:

- `google`, `email`, `apple`/`apple_id`/`appleid`, `wechat`/`weixin` sono letti
  solo dal provider Auth reale normalizzato.
- Provider assente o non riconosciuto resta `unknown` / `Origin unavailable`
  localizzato.
- Nessuna deduzione da dominio email.

Fallback:

- Primario: email Auth sicura.
- Secondario: display name Auth/profile.
- Ultimo fallback: account sconosciuto + short profile id.
- Profile id resta sempre visibile come informazione secondaria.

Fix closure:

- `scripts/testing/run-playwright-target.mjs`: per target locali ricarica la
  schema cache PostgREST dopo il caricamento env Supabase, evitando drift tra
  migration locali e REST.
- Migrazioni locali pendenti applicate con `supabase migration up --local`:
  `20260619044500_task_069_sync_events_compacted_changed_count.sql`,
  `20260619123000_task_072_device_auto_registration.sql`,
  `20260619173000_task_072_device_authorization_status.sql`. Questo ha risolto
  `BLOCKED_TASK035_DEVICE_CREATE` causato da schema locale `shop_devices`
  incompleto/stale.
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`: fixture device
  e audit stabilizzate; cleanup locale audit via `psql` con trigger utente
  disabilitati solo nel teardown, mantenendo il runtime append-only.
- `tests/e2e/task-064-platform-users-auth-profile-parity.spec.ts`: aspettative
  legacy aggiornate al comportamento corrente della directory account personali,
  che include Normal, Shop Admin, Platform Admin e profili incompleti.
- `src/components/platform/PlatformPage.tsx`,
  `src/components/platform/PlatformMasterDetail.tsx`,
  `src/components/platform/platformData.ts`,
  `src/i18n/translate-sections.ts` e
  `src/server/platform-admin/platform-section-data.ts`: ownership/detail render
  supporta `AccountIdentitySummary` strutturato senza mostrare `[object Object]`
  e senza perdere search/filter testuale.

Evidence:

- `npm run lint`: `PASS_WITH_WARNINGS`, 0 errori e 8 warning preesistenti in
  file TASK-072/history.
- `npm run typecheck`: `PASS`.
- `node --test tests/foundation/task-073-account-identity-display.test.mjs`:
  `PASS`, 3/3.
- `npm run test:foundation`: `PASS`, 390/390.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3061 PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3061" npm run test:shop:local`:
  `PASS`, 5/5.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3060 PLAYWRIGHT_REUSE_SERVER=0 PLAYWRIGHT_WEB_SERVER_COMMAND="npm run start -- --hostname 127.0.0.1 --port 3060" npm run test:platform:local-users`:
  `PASS`, 1/1.
- `npm run verify`: `PASS` (`lint`, `typecheck`, `security:scan`, `build`).
- `git diff --check`: `PASS`.
- `git status --short`: worktree dirty atteso; include modifiche TASK-073 e
  modifiche TASK-072 preesistenti/non correlate. Nessuno stage, commit o push.
- Browser plugin: setup tentato, ma il webview attach e andato in timeout.
  Fallback a Playwright autenticato, con screenshot reali salvati.

Screenshot evidence:

- `docs/TASKS/EVIDENCE/TASK-073/browser-shop-members-account-identity.png`
- `docs/TASKS/EVIDENCE/TASK-073/browser-shop-audit-account-identity.png`
- `docs/TASKS/EVIDENCE/TASK-073/browser-platform-users-account-identity.png`
- `docs/TASKS/EVIDENCE/TASK-073/browser-platform-admins-account-identity.png`
- `docs/TASKS/EVIDENCE/TASK-073/browser-platform-shop-admins-account-identity.png`
- `docs/TASKS/EVIDENCE/TASK-073/browser-platform-shop-detail-ownership-account-identity.png`

Rischi residui:

- Browser plugin non disponibile per attach timeout nel desktop webview; non
  blocca `DONE` perche Playwright ha prodotto evidence autenticata equivalente.
- Worktree contiene modifiche TASK-072 preesistenti/non correlate; non sono
  state revertite, staged o committate.

Verdict finale:

- `DONE`. Shop Members/Audit e Master Console Users/Admins/Shop ownership
  mostrano email/display name come informazione primaria, provider/icon visibili
  e profile id secondario. Staff POS resta separato dagli account personali.
