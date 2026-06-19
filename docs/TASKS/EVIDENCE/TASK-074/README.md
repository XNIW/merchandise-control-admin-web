# TASK-074 Evidence - Devices UX Polish

Stato: `DONE`

Fase: `DONE_RECONCILED`

Data: 2026-06-19

Verdict finale: `DONE`

## Sintesi

`/shop/devices` ora usa una vista dedicata owner-friendly. La pagina conserva il
registry server-side shop-scoped completato in TASK-072, ma riduce il rumore
operativo: identificatori completi e row id sono nei dettagli tecnici, mentre la
lista principale mostra stato, tipo, app version, ultimo accesso/sync, account
personale usato e staff POS usato.

La sezione `Sync activity hints` resta read-only e dichiara esplicitamente che
`sync_events.source_device_id` e solo un hint di attivita, non autorizzazione.

Final visual review: il copy ora parla di `mapped shop inventory source`, non di
shop owner; il filtro `Diagnostics / Test` mantiene badge/kind diagnostico
anche sulle card filtrate; il copy button gestisce in modo non rumoroso i
browser che negano la clipboard.

## Screenshot

- Prima: `devices-before.png`
- Dopo desktop: `devices-after.png`
- Dopo mobile viewport scrolled to cards: `devices-after-mobile.png`

## Miglioramenti verificati

- Header `Devices` con badge `Revocation enforced`.
- Summary cards: active, revoked, needs attention, sync activity hints.
- Filtri e search GET senza stato client custom.
- Lista principale a card, senza full UUID/row id nel flusso principale.
- `Account personale usato` e `Staff POS usato` separati.
- `Technical details` contiene identificatore completo, row id e metadata
  redatti con copy button.
- Azioni inline per rename/revoke/reactivate con hidden `shop_id` e `deviceId`.
- Dispositivi diagnostic/test raggruppati fuori dalla lista principale.
- Manual register/row-id fallback chiuso in `Advanced manual actions`.
- Il filtro `Diagnostics / Test` conserva badge `Diagnostics / Test` e
  `data-device-kind="diagnostic"` sulle card filtrate.
- `Sync activity hints` usa la dicitura `mapped shop inventory source` ed evita
  `mapped shop owner`.

## Schema/RPC

Nessuna migration TASK-074. Verificato e riusato lo schema TASK-072:

- `shop_devices.last_seen_profile_id`
- `shop_devices.last_seen_staff_id`
- `shop_devices.last_seen_principal_kind`
- `shop_devices.metadata_redacted`
- `shop_devices.reactivated_at`
- `shop_device_register`, `shop_device_rename`, `shop_device_revoke`,
  `shop_device_reactivate`

La patch TASK-074 legge `metadata_redacted` e `reactivated_at`; non cambia
enforcement, upsert o status RPC.

## Device install id

Nessuna modifica Android/iOS/POS in TASK-074. Restano valide le implementazioni
TASK-072:

- Android: stable install id locale usato dal registro device e dalla sync
  activity, con metadata redatti.
- iOS: stable install id locale usato dalla registrazione runtime e sync, con
  metadata redatti.
- POS/staff web: device/session path server-side usa `shop_devices` e status
  enforcement gia verificati in TASK-072.

## Check

| Check                                                                                                                          | Risultato                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --check` preflight | `PASS` |
| In-app browser authenticated visual review | `PASS` - `/shop/devices` live autenticata, 3 registered, 4 diagnostic, 1 sync hint; `mapped shop inventory source` presente e `mapped shop owner` assente |
| Screenshot review desktop/mobile | `PASS` - `devices-after.png` e `devices-after-mobile.png` aggiornati dopo final review |
| `npm run security:scan` | `PASS` - `Security scan passed.` |
| `npm run test:foundation` | `PASS` - 392/392 |
| `npm run typecheck` | `PASS` - Next typegen + `tsc --noEmit` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS` - warning noti Next `middleware` deprecato e Node `module.register()` |
| `npm run verify` | `PASS` - lint + typecheck + security + build |
| Authenticated `/shop/devices` smoke | `PASS` - wrapper local Supabase + `next start`; Diagnostics/Test filter verifica fixture sintetica senza confonderla con lista owner |
| Negative revoked register heartbeat | `PASS` - nello smoke local Supabase il device `revoked` resta `revoked` dopo `shop_device_register`, anche se il heartbeat aggiorna `app_version` |
| `git diff --check` finale | `PASS` |
| `git status --short --branch --untracked-files=all` finale | `PASS_REVIEWED` - nessun file staged; modifiche/untracked TASK-074 attese |

## Rischi residui

- TASK-074 non modifica enforcement mobile/POS; eventuali nuovi client non
  aggiornati continueranno a comparire solo come sync activity hints.
- La classificazione diagnostic/test e euristica UI-only: non cancella righe e
  non cambia autorizzazione.
- Il valore completo del device identifier resta visibile nei dettagli tecnici
  per audit e copy, non nella lista principale.

## Prossimo passo consigliato

Task chiuso lato review come `DONE_RECONCILED`. Prossimo passo consigliato:
selezionare il prossimo task esplicito senza riaprire enforcement mobile/POS.
