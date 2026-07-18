# TASK-138 iOS runtime

## Esito

`PASS_BUILD_AND_SIMULATOR`, con parity live comune `BLOCKED_ENV`.

## Implementazione

- batch per scope/sessione, dedup, chunk `<=100`, service/store single-flight;
- download gate cancellabile max `4`;
- visible-only lifecycle, generation/scope guard e memoria bounded
  (`100` entry / `48 MiB`);
- decode ImageIO prima del commit, cache offline e purge account/shop;
- preprocess/downsample cancellabile off-main;
- progress processing/main/thumb/finalize e cancel editor;
- thumb `.fill`, main `.fit`.

## Check reali

- Debug `build-for-testing`: `** TEST BUILD SUCCEEDED **`;
- Product Images XCTest su iPhone 16e Simulator: `32/32 PASS`, zero failure,
  `** TEST SUCCEEDED **` in `4,091 s`;
- test 200 ref/concurrency: `2,897 s`;
- high-res 48 MP: `0,067023 s`, peak physical `92.097,944 kB`;
- localizzazioni EN/IT/ES/ZH: `4/4 PASS`;
- `git diff --check`: `PASS`.

Il primo run aveva `9` assertion failure in `5` test API perche il recorder
del test leggeva solo `httpBody`, mentre URLSession forniva `httpBodyStream`.
Corretto il recorder test, il run identico e passato `32/32`; nessun runtime
fix e stato usato per nascondere il fallimento.

Evidence completa nel worktree iOS:
`docs/TASKS/EVIDENCE/TASK-138/README.md`.

Screenshot UI, device fisico e stesso shop Supabase non-production non sono
stati eseguiti.
