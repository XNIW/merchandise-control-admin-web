# TASK-017 - Shop Business Completion

## Informazioni generali

- ID: `TASK-017`
- Titolo: `Shop Business Completion`
- Stato: `DONE`
- Fase attuale: `DONE_RECONCILED`
- Responsabile attuale: `USER_CONFIRMED_RECONCILIATION`
- Data apertura execution: 2026-05-31
- File Master Plan: `docs/MASTER-PLAN.md`
- File task: `docs/TASKS/TASK-017-shop-business-completion.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-017/README.md`
- Fonte brief: messaggio utente `TASK-017 - Shop Business Completion`
- Branch execution: `codex/task-015-complete-shop-admin-console`
- Commit: `NOT_ALLOWED_BY_TASK`
- Git push: `NOT_ALLOWED_BY_TASK`
- Stato massimo consentito a Codex: `DONE_RECONCILED` per questa review finale su conferma esplicita utente
- Execution: `COMPLETED`
- Review: `COMPLETED`
- Verdict corrente: `DONE`

## Scopo

Completare la `Shop Admin Console` come gestionale operativo shop-scoped, senza trasformarla in Platform Admin e senza integrare Android/iOS/POS reali.

`Platform Admin` controlla l'ecosistema globale.

`Shop Admin` controlla un singolo shop.

`POS Staff` resta un modulo dello Shop Admin, non una console separata.

## Ambito implementato

- Dashboard shop con statistiche principali, overview, card operative, stato dati, ultimi eventi sync/history e ultimi audit shop.
- Catalogo shop con lista, detail route, ricerca/filtro prodotti, create/update/archive gia basati sulle RPC TASK-015.
- Categorie con lista, dettaglio, create/update/archive gia basati sulle RPC TASK-015.
- Fornitori con lista, dettaglio, create/update/archive gia basati sulle RPC TASK-015.
- Excel import foundation con upload, analisi, preview, validazione e import gia basati sul workflow TASK-015.
- Excel export foundation per categorie, fornitori e prodotti gia basato sul workflow TASK-015.
- Shop members con lista, dettaglio, invito profilo esistente, cambio ruolo e rimozione/sospensione via RPC auditabili.
- Roles & permissions shop con enforcement server-side tramite `resolveShopActionContext` e nuovo permesso `members.manage`.
- POS Staff module come parte di `/shop/staff`, con lista, dettaglio, stato, staff code e azioni gia basate sulle RPC TASK-015.
- Devices module come parte di `/shop/devices`, con lista, dettaglio, revoke/reactivate e audit collegato.
- Shop audit log con lista, filtri, dettaglio evento, metadata redatti e navigazione cronologica.
- Sync Center read-only su `/shop/sync`, con stati `pending`, `success`, `failed` derivati dagli eventi sync/history.

## Dati reali, mock e gap

- Dati reali: i nuovi moduli usano read model server-only esistenti (`inventory`, `staff`, `devices`, `history`) e il nuovo read model audit shop-scoped.
- Dati reali: le mutazioni membri usano RPC Supabase additive e auditano su `audit_logs`.
- Mock: nessun nuovo dato mock inserito nel codice TASK-017.
- Gap dichiarati: invito membro supporta solo profili gia esistenti; non implementa email delivery, provider auth o magic link.
- Gap dichiarati: Sync Center e sola vista amministrativa; non implementa sincronizzazione reale.
- Gap dichiarati: POS Staff prepara la struttura amministrativa; non implementa autenticazione POS reale, PIN/password o device binding client.
- Gap dichiarati: Android/iOS/POS non sono stati modificati.

## Sicurezza e boundary

- Nessun accesso cross-shop intenzionale: i read model passano da `resolveCurrentShopAdminShellAccess` o `resolveShopActionContext`.
- Nessuna autorizzazione basata solo su client-side.
- Nessuna service-role key lato client/browser.
- Nessun token, PIN, password o hash credenziale esposto in UI.
- Audit shop-scoped con metadata redatti per gli eventi visualizzati.
- Member management limitato a `shop_owner` tramite `members.manage` e tramite helper DB owner-only.
- Review finale: corretto un gap reale in cui gli RPC membri erano piu larghi del policy server-side e accettavano anche `shop_manager` se chiamati direttamente. La migration di hardening ridefinisce gli RPC con controllo owner-only nel database.
- Review finale: `shop_member_remove` ora richiede una reason anche a livello UI/server/RPC e registra solo metadata redatti (`reason_provided`, `reason_length`), non il testo raw.

## Migration

- Migration creata: `supabase/migrations/20260531230000_task_017_shop_business_completion.sql`
- Migration creata in review: `supabase/migrations/20260531233000_task_017_member_owner_enforcement.sql`
- Stato applicazione: `APPLIED_LINKED_DEV`
- Tabelle coinvolte: `profiles`, `shop_members`, `audit_logs`
- Funzioni/RPC aggiunte:
  - `public.shop_member_invite_profile`
  - `public.shop_member_update_role`
  - `public.shop_member_remove`
- Helper aggiunto:
  - `app_private.is_active_shop_owner_member`

## Test e gate richiesti

Eseguiti durante la review finale:

- `npm run verify`: `PASS_WITH_WARNINGS`, warning Node `DEP0205`.
- `npm run typecheck`: `PASS`.
- `npm run lint`: `PASS`.
- `npm run build`: `PASS_WITH_WARNINGS`, warning Node `DEP0205`.
- `npm run test:foundation`: `PASS`, 89/89.
- `npm run test:ui-smoke`: `PASS_WITH_WARNINGS`, 86/86, warning Node `DEP0205` e Playwright `NO_COLOR`/`FORCE_COLOR`.
- `git diff --check`: `PASS`.
- `git status`: `PASS_WITH_NOTES`, worktree dirty preesistente da TASK-015/TASK-016 piu TASK-017, nessun commit/push/stage finale.
- Supabase linked checks: `PASS_WITH_NOTES`; un primo retry ha incontrato `ECIRCUITBREAKER`, poi push e check post-push sono passati. `migration list` allineata fino a `20260531233000`, dry-run `Remote database is up to date`, lint exit 0, advisors `No issues found`.

## Criteri di accettazione

- Shop Dashboard mostra dati operativi shop-scoped reali o stati safe dichiarati.
- Catalogo, categorie e fornitori hanno lista, dettaglio e azioni CRUD/archive coerenti con TASK-015.
- Import/export Excel rimane dentro i limiti reali del progetto, senza inventare schema.
- Members supporta lista, dettaglio, invito profilo esistente, cambio ruolo e rimozione/sospensione via RPC auditabili.
- Roles & Permissions resta separato da Platform Admin e applicato server-side.
- POS Staff resta dentro Shop Admin, senza autenticazione POS reale.
- Devices resta shop-scoped e auditato.
- Audit log shop redige dati sensibili.
- Sync Center resta read-only.
- Evidence finale include file toccati, test reali, parti mock/reali, rischi residui e prossimo passo.

## Reconciliation finale

`DONE_RECONCILED` e stato assegnato solo dopo:

- richiesta esplicita dell'utente di review finale e reconciliation a `DONE` per `TASK-017`;
- correzione del gap owner-only sugli RPC membri;
- migration di hardening applicata al linked dev;
- gate locali, Supabase e UI passati con evidence verificabile;
- nessun commit, push git o stage finale;
- `TASK-016` lasciato invariato in review separata.
