# TASK-074 - Devices UX Polish / Owner-Friendly Device Registry

Stato: `DONE`

Fase attuale: `DONE_RECONCILED`

Responsabile attuale: `CODEX_TASK074_FINAL_VISUAL_REVIEW`

Data apertura/esecuzione: 2026-06-19

## Obiettivo

Rendere `/shop/devices` leggibile per shop owner e manager senza cambiare i
contratti di enforcement gia completati in TASK-072.

La pagina deve mostrare dispositivi registrati, stato revocabile, ultimo account
personale visto, ultimo staff POS visto, app version, tipo client e ultima
attivita. I client rilevati solo da `sync_events.source_device_id` devono
restare in una sezione separata di activity hints, senza essere presentati come
dispositivi autorizzati.

## Scope implementato

- Vista dedicata per `/shop/devices` basata su `getShopDeviceReadModel`, non sul
  renderer tabellare generico.
- Header owner-friendly con badge `Revocation enforced`.
- Summary cards per active, revoked, needs attention e sync activity hints.
- Filtri `All`, `Active`, `Revoked`, `Mobile`, `POS`, `Web`,
  `Diagnostics / Test` e ricerca GET.
- Lista principale a card con identificatore abbreviato; identificatore
  completo e row id restano in `Technical details`.
- Separazione esplicita tra `Account personale usato` e `Staff POS usato`.
- Azioni inline per `Details`, `Rename`, `Revoke`, `Reactivate`.
- Dispositivi diagnostici/test raggruppati fuori dalla lista principale.
- `Sync activity hints` in accordion con copy non autorizzativa.
- Form manuali spostate in `Advanced manual actions`.
- Redirect post action aggiornati per preservare `shop_id`.
- Final review: copy sync hints riallineato a `mapped shop inventory source`,
  copy button robusto su clipboard non disponibile e filtro
  `Diagnostics / Test` marcato con badge/kind diagnostico anche quando aperto
  dal filtro.

## Scope non cambiato

- Nessuna modifica a RPC, RLS o enforcement mobile/POS.
- Nessuna migration schema.
- Nessuna service-role key lato client.
- Nessun hard delete.
- Nessun fingerprint invasivo o metadato sensibile aggiunto.

## File principali

- `src/app/shop/devices/page.tsx`
- `src/app/shop/_components/DeviceRegistryView.tsx`
- `src/app/shop/_components/DeviceActionPanel.tsx`
- `src/app/shop/_components/CopyDeviceIdentifierButton.tsx`
- `src/server/shop-admin/device-read-model.ts`
- `src/server/shop-admin/shop-section-data.ts`
- `src/app/shop/actions.ts`
- `tests/foundation/task-074-devices-ux-polish.test.mjs`
- `tests/foundation/task-072-device-auto-registration.test.mjs`
- `tests/e2e/task-035-shop-admin-authenticated-smoke.spec.ts`

## Evidence

- `docs/TASKS/EVIDENCE/TASK-074/README.md`
- `docs/TASKS/EVIDENCE/TASK-074/devices-before.png`
- `docs/TASKS/EVIDENCE/TASK-074/devices-after.png`
- `docs/TASKS/EVIDENCE/TASK-074/devices-after-mobile.png`

## Stato check

Aggiornato in evidence TASK-074. Review finale richiesta esplicitamente
dall'utente il 2026-06-19; TASK-074 riconciliato a `DONE_RECONCILED` con
verdict finale `DONE`.
