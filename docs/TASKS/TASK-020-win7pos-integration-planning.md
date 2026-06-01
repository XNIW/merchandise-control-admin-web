# TASK-020 - Win7POS Integration Planning

## Stato

- Stato: `DONE`
- Fase: `DONE_RECONCILED`
- Responsabile corrente: `CODEX_FINAL_REVIEW`
- Execution: `COMPLETED_PLANNING_ONLY`
- Review: `COMPLETED`
- Verdict planning: `APPROVED`
- Verdict finale: `DONE`
- Data apertura: `2026-06-01`
- File Master Plan: `docs/MASTER-PLAN.md`
- Evidence: `docs/TASKS/EVIDENCE/TASK-020/README.md`
- Commit TASK-019 precedente: `73042d6`
- Commit TASK-020: `NOT_RUN_USER_REQUESTED_NO_COMMIT`
- Git push TASK-020: `NOT_RUN_USER_REQUESTED_NO_PUSH`

TASK-020 e un task di pianificazione repo-grounded. Non implementa login POS reale, endpoint pubblici, dashboard live, sync vendite o migration applicate.

## Obiettivo

Definire un piano tecnico implementabile per collegare Win7POS ad Admin Web/Supabase, coprendo:

- primo accesso POS con `shop_code + staff_code + PIN/password`;
- registrazione e trusted device;
- accesso quotidiano senza login completo ripetuto;
- revoca dispositivo;
- sospensione staff;
- sospensione shop;
- comportamento online/offline;
- sync vendite;
- riepilogo vendite per dispositivo;
- riepilogo vendite totale negozio;
- audit e sicurezza;
- roadmap implementativa successiva.

## Scope incluso

- Discovery Admin Web reale su documentazione, migration e read model Shop Admin.
- Discovery Win7POS reale dalla copia locale `/Users/minxiang/Projects/Win7POS` e dal clone temporaneo `/tmp/win7pos-task-020-73042d6`.
- Disegno flusso POS end-to-end, senza codice applicativo.
- Identificazione gap backend rispetto allo schema attuale.
- Proposta di migration/RPC future, non applicate in TASK-020.
- Proposta di dashboard Shop Admin futura, non implementata in TASK-020.
- Foundation test statico per bloccare planning-only e no migration/endpoint TASK-020.
- Evidence con check reali o motivazioni `NOT_RUN`.

## Fuori scope

- Non implementare login POS reale.
- Non creare endpoint pubblico `/api/pos/login` o route POS runtime.
- Non modificare Win7POS.
- Non modificare Android o iOS.
- Non implementare sync vendite.
- Non implementare dashboard live.
- Non creare o applicare migration TASK-020.
- Non salvare secret, token reali, password o PIN raw.
- Non usare service-role lato client/browser.
- Non dichiarare production-ready.
- Non fare commit/push TASK-020 prima della review successiva.

## Review finale / reconciliation

TASK-020 e stato riconciliato a `DONE_RECONCILED` il 2026-06-01 su richiesta esplicita dell'utente, dopo review repo-grounded di Admin Web e della copia locale Win7POS in `/Users/minxiang/Projects/Win7POS`.

Esito review:

- finding Win7POS confermati su repo locale clean `## main...origin/main`, commit `aa545fc Sconto`;
- nessun finding Win7POS documentato e risultato falso;
- piano POS confermato coerente con UX reale WPF: first login online, trusted device, uso quotidiano senza login completo ripetuto, PIN veloce opzionale, revoca/sospensione/lockout/offline grace;
- modello backend futuro confermato con distinzione chiara tra schema Admin Web gia esistente e gap futuri;
- sync vendite e dashboard futura confermati planning-only;
- harness rafforzato aggiungendo check TASK-020 esplicito in `scripts/security-checks.mjs`;
- nessun runtime POS, endpoint pubblico, migration, dashboard live o modifica Win7POS introdotti.

## Letture e fonti

### Admin Web

Letture eseguite:

- `AGENTS.md`
- `CLAUDE.md`
- `README.md`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-015-complete-shop-admin-console.md`
- `docs/TASKS/TASK-016-complete-platform-admin-console.md`
- `docs/TASKS/TASK-017-shop-business-completion.md`
- `docs/TASKS/TASK-018-infrastructure-security-hardening-pos-foundation.md`
- `docs/TASKS/TASK-019-pos-auth-foundation-implementation.md`
- `docs/ARCHITECTURE/POS-AUTH-FOUNDATION.md`
- `docs/ARCHITECTURE/MOBILE-POS-ENFORCEMENT-DESIGN.md`
- `supabase/migrations/*` tramite scan e lettura mirata delle migration schema/staff/devices/sync.
- `src/server/shop-admin/*` tramite scan e lettura mirata dei read model/mutation staff, devices, history e action context.
- `src/app/shop/*` e `src/components/shop/*` tramite scan delle route e superfici Shop Admin.

### Win7POS

- Repo: `https://github.com/XNIW/Win7POS.git`
- Repo locale read-only: `/Users/minxiang/Projects/Win7POS`
- Clone temporaneo read-only: `/tmp/win7pos-task-020-73042d6`
- Commit ispezionato: `aa545fc Sconto`
- Worktree Win7POS locale dopo ispezione: `## main...origin/main`, clean.

## Discovery Admin Web

### Foundation disponibile

| Area | Stato repo-grounded | Evidence |
| --- | --- | --- |
| Shop root | `FOUND` | `public.shops` con `shop_code`, `shop_status in ('active','pending_setup','suspended','archived')`. |
| Staff POS | `FOUND` | `public.staff_accounts` e `public.staff_accounts_safe`; staff separato da `profiles/shop_members`. |
| Credential foundation | `FOUND` | `credential_hash`, `credential_kind`, `must_change_credential`, `failed_attempts`, `locked_until`, `last_login_at`, `credential_version`, `credential_status`, `session_invalidated_at`. |
| Credential safe UI | `FOUND` | `staff_accounts_safe` e read model `src/server/shop-admin/staff-read-model.ts` non selezionano `credential_hash`. |
| Device registry | `FOUND` | `public.shop_devices` con `device_identifier`, `device_type`, `status`, `last_seen_at`, revoca/riattivazione. |
| Device admin actions | `FOUND` | RPC `shop_device_register`, `shop_device_rename`, `shop_device_revoke`, `shop_device_reactivate`; Platform emergency revoke. |
| Audit | `FOUND` | `public.audit_logs` append-only con metadata redatti. |
| Sync Center | `FOUND_READ_ONLY` | `sync_events` owner-scoped, usato per catalog/prices/history activity; non e sync vendite POS. |
| Shop Admin UI | `FOUND` | Route `/shop/staff`, `/shop/devices`, `/shop/sync`, `/shop/history`, `/shop/audit`. |
| Staff hash helper | `FOUND` | `src/server/shop-admin/staff-credentials.ts` usa `scrypt-v1` server-only. |

### Gap backend attuali

| Gap | Stato | Impatto |
| --- | --- | --- |
| POS first-login endpoint/RPC | `NOT_FOUND` | Serve task futuro per auth runtime POS. |
| POS session store | `NOT_FOUND` | `session_invalidated_at` e solo marker foundation, non sessione revocabile. |
| Device token/secret revocabile | `NOT_FOUND` | `shop_devices` identifica e revoca device, ma non ha credenziale device runtime. |
| Heartbeat POS | `NOT_FOUND` | `last_seen_at` esiste ma manca RPC client POS dedicata con enforcement shop/staff/device. |
| Sales sync schema | `NOT_FOUND` | Non ci sono tabelle/RPC Admin Web per vendite POS, pagamenti cash/card o dashboard vendite. |
| Per-device sales summary | `NOT_FOUND` | La dashboard futura richiede aggregati per `shop_device_id`. |
| POS offline queue tracking server | `NOT_FOUND` | Manca modello per batch/idempotency/errori sync POS. |
| Public POS route | `NOT_FOUND_BY_DESIGN` | Non deve essere introdotta in TASK-020. |

## Discovery Win7POS

### Stack tecnico

| Area | Stato | Evidence |
| --- | --- | --- |
| UI | `FOUND` | WPF in `src/Win7POS.Wpf`, `TargetFramework=net48`, `UseWPF=true`, `UseWindowsForms=true`. |
| Runtime | `FOUND` | Windows 7 first, `PlatformTarget=x86`, `Prefer32Bit=true`. |
| Core | `FOUND` | `src/Win7POS.Core`, `netstandard2.0`. |
| Data | `FOUND` | `src/Win7POS.Data`, `netstandard2.0`, Dapper, `Microsoft.Data.Sqlite`, SQLitePCLRaw. |
| CLI | `FOUND_WITH_NOTE` | `src/Win7POS.Cli`, `net10.0`, usato per utility/self-test; non target Windows 7 runtime. |
| Installer | `FOUND` | `installer/Win7POS.iss` Inno Setup. |
| Excel | `FOUND` | Core usa `ClosedXML`, `ExcelDataReader`, `ExcelDataReader.DataSet`. |
| PDF/QR | `FOUND` | WPF usa `PDFsharp-gdi`, `ZXing.Net.Bindings.Windows.Compatibility`. |
| HTTP/API client | `NOT_FOUND` | Scan `HttpClient`, `WebClient`, `HttpWebRequest`, `Authorization`, `Bearer`, `Supabase` non trova networking applicativo. |
| Test project | `NOT_FOUND` | Nessun progetto test; solo script `scripts/reset-test-db.ps1` e CLI self-test. |

### Struttura rilevante

- `src/Win7POS.Wpf/App.xaml.cs`: startup WPF, directory dati, error handling, IE11 browser emulation.
- `src/Win7POS.Wpf/MainWindow.xaml.cs`: inizializza DB, first-run wizard, login operatore, sessione e menu.
- `src/Win7POS.Wpf/Pos/Dialogs/FirstRunSetupDialog.xaml.cs`: crea primo admin locale.
- `src/Win7POS.Wpf/Pos/Dialogs/OperatorLoginDialog.xaml.cs`: login operatore locale via username/PIN.
- `src/Win7POS.Wpf/Infrastructure/Security/OperatorSession.cs`: sessione operatore locale e security events.
- `src/Win7POS.Data/DbInitializer.cs`: schema SQLite locale.
- `src/Win7POS.Data/Repositories/UserRepository.cs`: utenti, lockout, PIN verify, last login.
- `src/Win7POS.Data/Repositories/SaleRepository.cs`: vendite, righe, refund/void, report.
- `src/Win7POS.Wpf/Pos/PosWorkflowService.cs`: workflow POS, pagamento, stampa, report, backup, settings.
- `src/Win7POS.Wpf/Pos/Dialogs/PaymentViewModel.cs`: pagamento contanti/carta.

### Login e sicurezza locale Win7POS

| Aspetto | Stato | Evidence |
| --- | --- | --- |
| First-run admin | `FOUND` | Se non esistono utenti attivi, `FirstRunSetupDialog` crea admin locale. |
| Login giornaliero | `FOUND` | `OperatorLoginDialog` seleziona operatore locale e verifica PIN. |
| PIN hash | `FOUND` | `PinHelper` usa PBKDF2/Rfc2898 con salt Base64 e 10000 iterazioni. |
| Lockout | `FOUND` | `UserRepository.VerifyPinAsync`: 5 tentativi, lockout 900 secondi. |
| User status | `FOUND` | `users.is_active` blocca login locale. |
| PIN change | `FOUND` | `require_pin_change` forza `ChangePinDialog`. |
| Security events | `FOUND` | `security_events` e `SecurityEventCodes` tracciano login, lockout, PIN, utenti/ruoli. |
| Shop code remoto | `NOT_FOUND` | Nessun `shop_code` o tenant remoto nel codice Win7POS. |
| Staff code remoto | `NOT_FOUND` | Login usa `users.username`, non `staff_code` Admin Web. |
| Trusted device remoto | `NOT_FOUND` | Nessun device token/fingerprint/server binding. |

### Vendite, pagamenti e storage

| Aspetto | Stato | Evidence |
| --- | --- | --- |
| Storage locale | `FOUND` | SQLite `C:\ProgramData\Win7POS\pos.db`; override `WIN7POS_DATA_DIR`. |
| Vendite | `FOUND` | Tabella `sales` con `code`, `createdAt`, `kind`, `total`, `paidCash`, `paidCard`, `change`, `operator_id`. |
| Righe vendita | `FOUND` | Tabella `sale_lines` con barcode, nome, quantita, prezzo, totale riga. |
| Pagamento contanti/carta | `FOUND` | `PaymentViewModel` e `PosPaymentInfo` separano `CashAmountMinor` e `CardAmountMinor`. |
| Refund/void | `FOUND` | `SaleKind.Sale=0`, `SaleKind.Refund=1`; campi `related_sale_id`, `voided_by_sale_id`, `voided_at`, `reason`. |
| Operator sale link | `FOUND` | `sales.operator_id` collega vendita a user locale. |
| Daily summary | `FOUND` | `SaleRepository.GetDailySummaryAsync` aggrega count, total, cash, card, refunds. |
| Export vendite | `FOUND` | CSV daily/period con `saleId;code;kind;related_sale_id;createdAt;total;paidCash;paidCard;change`. |
| Offline behavior | `FOUND_LOCAL_ONLY` | App e DB sono locali; nessuna coda sync remota. |
| Device identifier | `NOT_FOUND` | Nessun identificatore dispositivo persistito per integrazione remota. |

### Vincoli Windows 7

- Runtime WPF `net48` x86: integrazione HTTP deve usare API compatibili con .NET Framework 4.8.
- TLS deve essere imposto a TLS 1.2 per Windows 7 aggiornato; TLS 1.3 non va assunto.
- Storage token locale deve usare un meccanismo compatibile Windows 7, preferibilmente DPAPI `ProtectedData` current user/machine scope con fallback documentato.
- Evitare dipendenze moderne che richiedono .NET 6+ nel client WPF.
- La CLI `net10.0` non puo essere trattata come runtime POS Windows 7.
- Il `.slnx` clonato risulta minimale/vuoto; i build futuri devono puntare direttamente a `src/Win7POS.Wpf/Win7POS.Wpf.csproj` come da README.

## Flusso POS proposto

### Prima configurazione online

1. Operatore apre Win7POS su device non ancora trusted.
2. Win7POS mostra flusso "Collega negozio" con:
   - `shop_code`;
   - `staff_code`;
   - PIN/password;
   - nome dispositivo leggibile.
3. Il client normalizza `shop_code`/`staff_code` solo per formato UI, ma il server e l'autorita finale.
4. Win7POS genera un device fingerprint safe composto da segnali non segreti e non invasivi:
   - machine GUID o SID macchina se disponibile;
   - Windows machine name normalizzato;
   - app instance id casuale creato al primo avvio;
   - nessun seriale hardware raw inviato o loggato.
5. Il client invia la richiesta a un futuro boundary server-side su TLS:
   - `shop_code`;
   - `staff_code`;
   - PIN/password solo nel body TLS;
   - fingerprint hash client-side o claim minimale;
   - display name e app version.
6. Backend verifica in ordine fail-closed:
   - shop esiste ed e `active`;
   - staff esiste nello shop ed e `active`;
   - `credential_status` non e `locked`/`rotation_required`;
   - credential valida lato server;
   - rate limit/lockout non superati.
7. Backend crea o aggiorna `shop_devices` con `device_type='pos'`, stato `active` solo se la policy di trust lo consente.
8. Backend crea una credenziale device revocabile:
   - token random ad alta entropia restituito una sola volta;
   - solo hash del token salvato lato backend;
   - binding a `shop_id`, `staff_id`, `shop_device_id`, `credential_version`.
9. Win7POS salva localmente:
   - `shop_code`;
   - `staff_code` o staff display minimo;
   - `shop_device_id`;
   - device token cifrato con DPAPI;
   - `last_ok_server_at`;
   - policy offline ricevuta.
10. Backend scrive audit redatto:
    - `pos.auth.first_login.success` o `pos.auth.first_login.failure`;
    - `shop_id`, `staff_id`, `shop_device_id` se risolti;
    - motivo generico, IP/user-agent redatti se raccolti;
    - mai PIN/password/token raw.

### Uso quotidiano trusted device

1. All'avvio Win7POS legge il trusted device locale.
2. Se device token locale e presente, prova un futuro `pos_device_heartbeat` o `pos_session_refresh`.
3. Se online e valido:
   - server verifica shop/staff/device/session invalidation;
   - aggiorna `shop_devices.last_seen_at`;
   - restituisce stato operativo e policy;
   - nessun login completo richiesto ogni giorno.
4. Il POS puo chiedere un PIN veloce locale opzionale per cambio operatore o riapertura sessione, ma non sostituisce l'enforcement server quando online.
5. Se manca trusted token o server richiede rotazione, Win7POS torna al first login.

### Revoca e sospensione

| Evento Admin Web | Effetto server futuro | Effetto Win7POS |
| --- | --- | --- |
| Device revoked da Shop Admin | `shop_devices.status='revoked'`, token device revocato, sessioni invalidate. | Al prossimo heartbeat/login/sync blocca nuove operazioni online e mette eventuali eventi locali in quarantena. |
| Staff suspended | `staff_accounts.status='suspended'`, `session_invalidated_at=now()`. | Session refresh fallisce, login bloccato, sync push rifiutato. |
| Shop suspended da Platform Admin | `shops.shop_status='suspended'`. | Tutti i device dello shop bloccano login/sync push appena online. |
| Credential rotation forced | `credential_status='rotation_required'`, `credential_version` incrementata. | Trusted token non basta; richiede nuovo login/rotazione credential. |
| Lockout | `failed_attempts`/`locked_until`, audit `pos.auth.lockout`. | Messaggio generico, niente enumeration di shop/staff. |

### Online/offline

Policy proposta per task implementativi futuri:

- Online e obbligatorio per first login, registrazione device, revoca/reactivate, cambio credential e rotazione forzata.
- Offline consentito solo se il device era gia trusted e `last_ok_server_at` e dentro la grace policy.
- Grace iniziale proposta: massimo 72 ore configurabile per shop; oltre grace, bloccare nuove vendite e permettere solo consultazione locale minima.
- Durante offline:
  - vendite locali consentite entro grace e massimali;
  - niente cambio staff credential;
  - niente creazione/modifica utenti locali che pretendano di essere staff remoti;
  - niente cancellazione coda sync;
  - audit locale append-only.
- Al rientro online:
  - heartbeat prima del push;
  - se device/staff/shop non sono validi, bloccare sync automatico e mettere batch in quarantena;
  - se validi, inviare batch idempotenti in ordine.

## Modello backend necessario

TASK-020 non crea migration. Le seguenti sono proposte per TASK-021/TASK-024.

### Riutilizzo schema esistente

- `shops`: sorgente autoritativa `shop_code` e `shop_status`.
- `staff_accounts`: sorgente autoritativa staff POS, credential metadata, lockout e session invalidation.
- `shop_devices`: registry device shop-scoped e `last_seen_at`.
- `audit_logs`: audit redatto globale/shop.
- `sync_events`: puo restare per activity storica, ma non basta per vendite POS.

### Gap schema proposti

| Oggetto futuro | Scopo | Colonne minime proposte |
| --- | --- | --- |
| `pos_device_credentials` | Token trusted device revocabile senza token raw. | `credential_id`, `shop_id`, `shop_device_id`, `staff_id`, `token_hash`, `token_version`, `credential_version`, `issued_at`, `last_used_at`, `revoked_at`, `expires_at`. |
| `pos_sessions` | Sessioni POS brevi/refreshabili e invalidabili. | `pos_session_id`, `shop_id`, `staff_id`, `shop_device_id`, `status`, `issued_at`, `expires_at`, `last_seen_at`, `session_invalidated_at`, `revoked_at`. |
| `pos_sync_batches` | Traccia batch offline/online e retry. | `batch_id`, `shop_id`, `shop_device_id`, `staff_id`, `idempotency_key`, `status`, `received_at`, `processed_at`, `error_code`, `sale_count`. |
| `pos_sales` | Header vendite per dashboard e idempotenza. | `pos_sale_id`, `shop_id`, `shop_device_id`, `staff_id`, `local_sale_id`, `local_sale_code`, `occurred_at`, `kind`, `status`, `total_minor`, `currency`, `idempotency_key`, `synced_at`. |
| `pos_sale_payments` | Breakdown pagamenti. | `pos_sale_payment_id`, `pos_sale_id`, `method`, `amount_minor`. |
| `pos_sale_sync_errors` | Errori redatti per dashboard. | `error_id`, `shop_id`, `shop_device_id`, `batch_id`, `local_sale_id`, `error_code`, `metadata_redacted`, `created_at`. |

### RPC/endpoint futuri

Preferire RPC/Route Handler server-side con self-authorization e audit:

- `pos_auth_first_login`: first login e trust device.
- `pos_device_heartbeat`: verifica shop/staff/device/session e aggiorna `last_seen_at`.
- `pos_device_revoke_token`: revoca token device da Admin Web/server.
- `pos_sales_sync_batch`: ingest batch vendite idempotente.
- `pos_sales_sync_status`: ritorna ack/errori per batch.

Se si usano route Next.js, devono restare boundary server-side e non usare service-role nel client. Se si usano RPC Supabase esposte a `authenticated`, devono auto-autorizzarsi DB-side e non fidarsi di payload client.

## Sync vendite proposto

### Dati minimi da Win7POS

Payload vendita minimo:

- `shop_id` o `shop_code` risolto dal token, non fidato dal payload come unica authz;
- `shop_device_id`;
- `staff_id` o `staff_code` risolto dal token/sessione;
- `local_sale_id` da SQLite `sales.id`;
- `local_sale_code` da SQLite `sales.code`;
- `occurred_at` da `sales.createdAt`;
- `kind`: `sale`, `refund` o `void`;
- `status`: `completed`, `voided`, `refunded`, `quarantined`;
- `total_minor`;
- `paid_cash_minor`;
- `paid_card_minor`;
- `paid_other_minor` opzionale futuro;
- `change_minor`;
- `related_local_sale_id` per refund/void;
- `operator_local_id` solo come metadata diagnostico redatto;
- righe vendita opzionali in task successivo, non richieste per dashboard iniziale.

### Frequenza e batch

- Invio immediato best-effort dopo vendita se online.
- Worker background ogni 30-60 secondi quando ci sono vendite pending.
- Batch massimo iniziale: 100 vendite o 256 KB payload, quello che arriva prima.
- Heartbeat separato ogni 60 secondi durante uso attivo, piu startup/resume.
- Backoff esponenziale con jitter per retry; stop temporaneo su `shop_suspended`, `device_revoked`, `staff_suspended`.

### Idempotenza

Idempotency key proposta:

```text
pos_sale:{shop_device_id}:{local_sale_id}:{local_sale_code}:{kind}:{revision}
```

Regole:

- stesso idempotency key ritorna stesso risultato senza duplicare vendite;
- conflitto se stesso `local_sale_id`/`local_sale_code` arriva con importi diversi;
- conflitto non sovrascrive dati gia accettati;
- conflitti finiscono in `pos_sale_sync_errors` con metadata redatti.

### Offline queue

Win7POS deve aggiungere in SQLite una coda futura, per esempio:

- `sync_queue(id, entity_type, local_entity_id, idempotency_key, payload_json, status, attempt_count, next_attempt_at, last_error_code, created_at, updated_at)`;
- `pos_device_state(shop_code, shop_device_id, device_token_ciphertext, last_ok_server_at, offline_grace_until, status_cache_json)`.

La coda deve essere append/update controllato, non eliminabile da UI ordinaria. Il cleanup puo rimuovere solo record `acked` oltre retention.

### Privacy e performance

- Non inviare nomi prodotto o barcode nella dashboard iniziale se non necessari.
- Non inviare PIN/password/token in payload o log.
- Usare importi interi minor units CLP.
- Limitare payload e metadata; redigere errori SQLite.
- Aggregare lato DB per dashboard, non calcolare totali in client browser.

## Dashboard Admin Web futura

TASK-020 non implementa UI. Le schermate future Shop Admin consigliate sono:

### `/shop/devices` esteso

- stato online/offline per device POS;
- `last_seen_at`;
- staff corrente o ultimo staff;
- app version;
- stato token/trusted/revoked;
- vendite oggi per dispositivo;
- contanti/carta per dispositivo;
- ultimo batch sync e ultimo errore redatto;
- azioni revoca/reactivate gia esistenti, estese a token/session invalidation.

### `/shop/sync` o nuova sezione `/shop/sales`

- totale vendite shop oggi;
- totale contanti/carta/altro;
- count vendite/refund/void;
- tabella per dispositivo;
- tabella batch recenti;
- errori sync con codice redatto;
- filtro per data, device, staff e stato;
- nessun dato raw sensibile o payload completo di default.

### `/shop/audit`

Nuovi eventi POS:

- `pos.auth.first_login.success`
- `pos.auth.first_login.failure`
- `pos.auth.lockout`
- `pos.device.trusted`
- `pos.device.heartbeat`
- `pos.device.revoked_enforced`
- `pos.sales.sync.accepted`
- `pos.sales.sync.duplicate`
- `pos.sales.sync.conflict`
- `pos.sales.sync.blocked`

## Sicurezza

- Nessuna password/PIN raw in log, audit, evidence o storage backend.
- PIN/password transitano solo su TLS e vengono verificati server-side.
- Hash credential lato backend; mantenere `scrypt-v1` oppure pianificare migrazione Argon2id versionata.
- Token device random ad alta entropia, restituito una sola volta, salvato localmente cifrato con DPAPI e sul backend solo hash.
- Token device revocabile e ruotabile.
- Nessun service-role nel client/browser o in Win7POS.
- Rate limit per `shop_code`, `staff_code`, device fingerprint e IP sorgente.
- Lockout con messaggi generici anti-enumeration.
- Audit redatto per successo, fallimento, revoca, lockout, sync accepted/blocked/conflict.
- Offline grace limitata; oltre grace il POS blocca nuove vendite.
- Se POS resta offline molti giorni:
  - bloccare nuove vendite oltre grace;
  - preservare coda locale;
  - richiedere rientro online e revalidazione device/staff/shop;
  - se revocato/sospeso, mettere batch in quarantena e richiedere intervento Shop Admin/Platform Admin;
  - non cancellare vendite locali automaticamente.

## Roadmap implementativa

### TASK-021 - POS backend session/device endpoints

- Obiettivo: implementare first login, trusted device, heartbeat, revoca token e session model.
- File probabili:
  - `supabase/migrations/*task_021_pos_sessions_devices.sql`
  - `src/server/pos-auth/*`
  - `src/app/api/pos/*` solo se si sceglie Route Handler server-side; in alternativa RPC Supabase.
  - `src/server/shop-admin/device-read-model.ts`
  - `scripts/security-checks.mjs`
  - `tests/foundation/task-021-*.test.mjs`
- Schema/migration probabile:
  - `pos_device_credentials`;
  - `pos_sessions`;
  - estensioni safe a `shop_devices` se necessarie.
- Test richiesti:
  - authz fail-closed shop/staff/device;
  - no raw PIN/token logs;
  - rate limit/lockout;
  - revoca device invalida heartbeat;
  - shop/staff suspension blocca refresh.
- Rischi:
  - endpoint pubblico progettato male;
  - token storage;
  - enumeration di `shop_code/staff_code`;
  - compatibilita Windows 7 TLS.

### TASK-022 - Admin Web POS live dashboard

- Obiettivo: dashboard Shop Admin read-only per device live, vendite oggi e sync status.
- File probabili:
  - `src/server/shop-admin/pos-sales-read-model.ts`
  - `src/server/shop-admin/device-read-model.ts`
  - `src/server/shop-admin/shop-section-data.ts`
  - `src/app/shop/devices/page.tsx`
  - `src/app/shop/sync/page.tsx` o nuova route `src/app/shop/sales/page.tsx`
  - `tests/e2e/*`
- Schema/migration probabile:
  - viste aggregate `pos_device_sales_today_safe`;
  - indici su `pos_sales(shop_id, occurred_at, shop_device_id)`.
- Test richiesti:
  - RLS/shop-scoped;
  - no cross-shop leak;
  - aggregati cash/card corretti;
  - stati empty/error/not_configured.
- Rischi:
  - realtime prematuro;
  - query aggregate lente;
  - UI che confonde sync activity con autorizzazione device.

### TASK-023 - Win7POS first login/trusted device client

- Obiettivo: aggiungere client WPF per first login Admin Web/Supabase e trusted device locale.
- File probabili in Win7POS:
  - `src/Win7POS.Wpf/Pos/Dialogs/*` per setup device;
  - `src/Win7POS.Data/DbInitializer.cs` per tabelle local device/sync state;
  - `src/Win7POS.Data/Repositories/*` per device state;
  - nuovo servizio HTTP compatibile net48;
  - `src/Win7POS.Wpf/MainWindow.xaml.cs` per flow startup.
- Schema/migration locale probabile:
  - `pos_device_state`;
  - eventuale `remote_staff_link`.
- Test richiesti:
  - first-run locale resta funzionante;
  - TLS/API failure mostra stato safe;
  - DPAPI token storage;
  - login quotidiano usa trusted device senza full login se server valido.
- Rischi:
  - Windows 7 TLS/certificati;
  - bloccare POS esistenti senza piano di migrazione;
  - protezione token locale.

### TASK-024 - Win7POS sales sync

- Obiettivo: inviare vendite/refund/void da SQLite locale ad Admin Web/Supabase con coda offline idempotente.
- File probabili in Win7POS:
  - `src/Win7POS.Data/DbInitializer.cs`;
  - `src/Win7POS.Data/Repositories/SaleRepository.cs`;
  - nuovo `SyncQueueRepository`;
  - nuovo `PosSalesSyncService`;
  - hook in `PosWorkflowService.CompleteSaleAsync` e refund.
- File probabili Admin Web:
  - migration `pos_sales`, `pos_sale_payments`, `pos_sync_batches`;
  - RPC/Route Handler `pos_sales_sync_batch`;
  - tests foundation/security.
- Test richiesti:
  - duplicate batch non duplica vendite;
  - offline retry;
  - conflict quarantine;
  - cash/card/refund/void aggregati.
- Rischi:
  - perdita eventi se hook dopo vendita fallisce;
  - clock skew client;
  - batch grandi su connessioni lente.

### TASK-025 - Mobile/POS enforcement polish

- Obiettivo: allineare enforcement Android/iOS/POS, policy offline e UX amministrativa.
- File probabili:
  - Admin Web docs e read models;
  - client mobile/POS adapters nei rispettivi repo, solo se disponibili;
  - security scanner/harness cross-client.
- Schema/migration probabile:
  - policy offline per shop;
  - eventuale session invalidation index/view.
- Test richiesti:
  - device revoked blocca sync;
  - staff suspended blocca login/refresh;
  - shop suspended blocca tutti i client;
  - offline grace e quarantine.
- Rischi:
  - comportamento diverso tra Android/iOS/Win7POS;
  - policy offline troppo permissiva o troppo bloccante;
  - mancata comunicazione all'operatore POS.

## Criteri di accettazione TASK-020

- Documenti TASK-020 creati e Master Plan aggiornato.
- Win7POS analizzato dalla copia locale reale e dal clone temporaneo, con `NOT_FOUND` dove manca codice.
- Piano first login/trusted device/revoca/sospensione/offline/sync/dashboard/security completo.
- Nessuna migration TASK-020 creata o applicata.
- Nessun endpoint pubblico POS creato.
- Nessuna modifica Win7POS, Android o iOS.
- Check finali eseguiti o motivati in evidence.
- Reconciliation finale completata solo dopo gate critici `PASS`.

## Handoff

- Stato finale: `DONE_RECONCILED`.
- Prossima fase: `IDLE`.
- Prossimo passo concreto: aprire `TASK-021 - POS backend session/device endpoints` come task separato, senza implementare Win7POS client, sync vendite o dashboard live nello stesso task.
