# 04 - Android

## Implementazione

- Room v20 persiste solo UUID versione e timestamp immagine;
- targeted apply aggiorna/azzera il riferimento senza inserirlo nel normale
  payload write/outbox;
- Photo Picker image-only e `TakePicture` con FileProvider app-scoped, senza
  broad storage permission;
- decode/processing su `Dispatchers.IO`, sfondo bianco, JPEG main/thumb,
  qualita e fallback `85%` fino a `640/128 px`;
- APP1 respinto da processor, cache, upload e download;
- cache no-backup isolata per hash account + shop/product/version/variant;
- client Ktor usa la dipendenza gia presente; release HTTPS-only;
- HTTP loopback consentito solo nei manifest Debug/androidTest.

## Test finali

- JVM mirati Room/sync/cache/processor/contratto: `25/25 PASS`;
- instrumentation su `Medium_Phone_API_35 (AVD)`, API 35: `3/3 PASS`;
- rerun post-hardening del solo caso invalidato upload/read/remove:
  `1/1 PASS`, zero failure, `BUILD SUCCESSFUL`;
- workflow strumentale: picker/camera, preprocess/cache scoped e
  intent -> 2 PUT -> finalize contro server loopback;
- `assembleDebug`: `PASS`;
- `lintDebug`: `PASS` (`2m24s`).

Il primo run instrumentation si era fermato a `2/3`: Android bloccava il
cleartext loopback prima della prima richiesta. La correzione minima e un
network security config esclusivamente Debug/test per
localhost/127.0.0.1/10.0.2.2; Release non e stata rilassata.

## Metriche finali 8000 x 6000 sintetico

- input: `1.258.536 B`, `48 MP`, bitmap di test `RGB_565`;
- preprocess: `41 ms`, nessun OOM;
- main: `165.769 B`, `1600 x 1200`;
- thumb: `17.517 B`, `384 x 288`;
- PSS prima/dopo: `256.222 / 264.103 KiB`;
- delta PSS: `7.881 KiB` (non e una misura di picco).

Artefatti finali nel repository Android:

- `docs/TASKS/evidence/TASK-137/android-instrumentation.xml`;
- `docs/TASKS/evidence/TASK-137/android-summary.json`.

Il log instrumentation raw resta locale ed è escluso dal consolidamento Git.

Non e stato eseguito un upload Android contro Supabase locale reale e non e
stato usato un device fisico. Il caso sintetico `48 MP` e ora `PASS` su AVD;
non costituisce una misura termica o di memoria comparabile a device fisico.
