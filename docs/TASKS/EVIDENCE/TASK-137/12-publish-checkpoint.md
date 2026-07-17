# TASK-137 publish checkpoint

Timestamp UTC: `2026-07-17T20:57:55Z`
Fase corrente: `ACTION_REQUIRED_SECURITY_SCAN_READY`

## Repository recuperati

| Repository | Branch | Freeze locale | origin/main | Divergenza dopo questo checkpoint | Staged |
|---|---|---|---|---|---|
| Admin Web | `validate/mac-final-admin-20260717T150455Z` | remediation runtime/evidence `8891ee20`; HEAD corrente = commit che contiene questo checkpoint | `38f02bd969e55df91ff41d3905661da8dfdb145a` | `11/0` | nessuno |
| Android | `validate/mac-final-android-20260717T150455Z` | `38c2a01fc71ebc218038e67f1eab54430a9f5bce` | `8e7c88918d520b78073b8d0d9a1460f0ff4b215b` | `4/0` | nessuno |
| iOS | `validate/mac-final-ios-20260717T150455Z` | `98da803d145a8757661ed30c768a8cae53ec3610` | `2801241a646cd5d35aba5e7d285f23a44825c0ef` | `4/0` | nessuno |

I checkout originali sporchi restano preservati e non sono stati usati per i
commit. Win7POS resta read-only e fuori dalla pubblicazione TASK-137.

## Remediation Admin congelata

- Baseline Security ufficiale vulnerabile: base `38f02bd9`, head `2f166b51`,
  Changes scan `35/35`, quattro finding Medium/high-confidence con una root
  cause nel denied-audit product image.
- Fix comune: migration additiva sul solo confine
  `product_image_record_denied`, con binding actor/shop e product/shop prima
  dell'audit sink e `EXECUTE` esclusivo al service role.
- Commit runtime, test ed evidence sanitizzata: `8891ee20`.
- PoC originale invariata post-fix: `FAIL 6/9` atteso; quattro chiamate
  `permission_denied`, audit vittima `0`, metadata prodotto vittima `0`.

## Gate Admin realmente eseguiti

| Gate | Esito |
|---|---|
| reset/migration Supabase locale fino a `20260717200129` | `PASS` |
| pgTAP catalogo TASK-137 | `76/76 PASS` |
| pgTAP denied-audit | `32/32 PASS` |
| DB lint `public,app_private --fail-on error` | `PASS`, zero errori |
| foundation TASK-137 | `20/20 PASS` |
| E2E HTTP cross-shop, quattro route | `1/1 PASS` |
| E2E lifecycle completo | `1/1 PASS` |
| residui fixture/Auth/database/Storage | `0` |
| typecheck, lint, i18n e build | `PASS` |
| report read-only e cleanup dry-run locali | `PASS`, conteggi zero |
| screenshot build locale corrente | rigenerato e ispezionato, `PASS` sintetico/headless |
| `npm run verify` e `npm run security:scan` | `BLOCKED_EXTERNAL_PREREQUISITE` sul file Win7POS storico assente |
| staging/dev/production | `NOT_USED` / `NOT_APPLIED` |

Il blocco del comando monolitico non viene trasformato in PASS: il repository
Win7POS reale e read-only è pulito, ma non contiene più
`OperatorLoginDialog.xaml.cs`, ancora richiesto dallo scanner Admin. I gate
Admin componenti elencati sopra sono stati eseguiti separatamente.

## Integrità evidence

- manifest di inclusione: `11-mac-final-manifest.md`;
- hash pre-fix dichiarati: `10/10 PASS`;
- link relativi e JSON: `PASS`;
- `git diff --check` e staged diff-check: `PASS`;
- euristica anti-secret sullo staged set: `PASS`;
- nessun token, bearer, cookie, signed URL reale, byte immagine o path macchina
  locale negli artifact Security durevoli;
- screenshot PNG sintetico `1440 x 900`, senza profilo incorporato.

## Nuovo Changes scan obbligatorio

- repository: Admin Web;
- mode: Changes / diff;
- base: `38f02bd969e55df91ff41d3905661da8dfdb145a`;
- head: SHA esatto restituito da `git rev-parse HEAD` sul worktree clean subito
  prima dell'apertura del workspace;
- scope: `.`;
- Deep Scan: `OFF`;
- focus: isolamento tenant del denied-audit product image e regressioni
  introdotte dal diff completo.

Il branch non deve essere modificato tra la risoluzione dello SHA e la
conclusione del scan. Nessun PASS Security post-fix viene dichiarato in questo
checkpoint.

## Gate mobili da riconfermare dopo Security

- Android: unit mirati, instrumentation emulator, `assembleDebug`, `lintDebug`
  e controlli statici secret/log/TLS.
- iOS: Product Images, sync mirati, localizzazioni, build Debug e controlli
  statici secret/log/TLS.
- Pubblicazione soltanto dopo gate verdi, in ordine Admin, Android, iOS, senza
  force push, bypass, deploy production, migration production o release store.

## Blocker residui dichiarati

- nuovo Codex Security Changes scan post-fix: `PENDING`;
- parity live cross-client sul medesimo target non-production: `NOT_RUN`;
- migration staging/dev: `NOT_APPLIED`;
- device fisici: `NOT_RUN`.

TASK-137 resta `REVIEW_WITH_BLOCKERS`, non `DONE`.
