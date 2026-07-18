# TASK-138 Android runtime

## Esito

`PASS_JVM_AND_EMULATOR`, con parity live comune `BLOCKED_ENV`.

## Implementazione

- thumb `Crop`, main editor `Fit`;
- batch per shop, dedup, chunk `<=100`, single-flight e download max `4`;
- visible-only lifecycle, cancellazione offscreen e completion stale ignorata;
- cache account/shop scoped, offline-first e purge logout/switch;
- decode prima del commit cache, one retry URL scaduta;
- preprocess cancellabile off-main, progress main/thumb/finalize e cancel.

## Check reali

- `./gradlew testDebugUnitTest assembleDebug lintDebug`:
  `BUILD SUCCESSFUL in 36s`;
- XML JVM: `604` test, `0` failure/error, `5` skip opzionali preesistenti;
- lint: `0` errori, `24` warning baseline fuori scope;
- instrumentation `ProductImageDeviceTest` su `Medium_Phone_API_35`:
  `3/3 PASS`, `BUILD SUCCESSFUL in 12s`;
- fixture 48 MP: `262 ms`, PSS `240028 -> 245032 kB`, main `165769 B`
  `1600x1200`, thumb `17517 B` `384x288`;
- picker/camera contract image-only e app-scoped: `PASS`;
- upload/read/remove loopback: `PASS`;
- `git diff --check`: `PASS`.

Evidence completa nel worktree Android:
`docs/TASKS/evidence/TASK-138/README.md`.

Screenshot UI, device fisico e stesso shop Supabase non-production non sono
stati eseguiti e non vengono dedotti dai test JVM/emulatore.
