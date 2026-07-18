# TASK-138 Optimization review

Data audit: `2026-07-18`. Lane: Admin Web/Supabase locale. Fase risultante:
`REVIEW`; questo file non marca il task `DONE`.

## 1. Recovery e Fase 0

Comandi obbligatori eseguiti prima delle modifiche:

```text
git rev-parse --show-toplevel
git remote -v
git branch --show-current
git status --short --branch
git diff --stat
git diff --name-status
git diff --check
git diff --cached --stat
git ls-files --others --exclude-standard
git rev-parse HEAD
git rev-parse origin/main
```

Risultato:

- worktree: `/Users/minxiang/.codex/worktrees/task-138-20260718/admin`;
- stato Git: detached, nessun file staged;
- `HEAD` e `origin/main` locale:
  `a20fdaf6ce9ed862d1c0fc0123ee355d4ff9fbdc`;
- `git diff --check`: `PASS`;
- nessun file storico TASK-137 tracked modificato;
- nessun commit, push, merge, deploy o migration production.

Le modifiche ai foundation test TASK-020, TASK-054, TASK-055 e TASK-079 sono
state mantenute. Il diff aggiunge esclusivamente TASK-138 alle allowlist del
task attivo/file evidence nel Master Plan: e necessario per evitare una falsa
regressione governance mentre TASK-138 e attivo; non altera i contratti runtime
o gli assert storici `DONE`.

## 2. Matrice requisito / before / gap / after

| Requisito | Prima dell'optimization | Gap osservato | File | Stato dopo |
|---|---|---|---|---|
| Storage canonico | `main.jpg` + `thumb.jpg`, privati e versionati | nessun audit del retry/cache-control nel pass | `browser-client.ts`, evidence `06` | due oggetti invariati, nessuna preview/originale; upload no-upsert e retry bounded |
| Preprocess memory bounded | worker off-main, ma main e thumb encodate insieme dalla sorgente | due canvas/output concorrenti e hash/byte duplicabili | `product-image-worker.ts`, `browser-client.ts` | main prima, sorgente rilasciata, thumb derivata da canvas main, schedule finita, canvas sempre rilasciate |
| Lease URL firmate | nuova read URL a ogni render | nessun riuso fino a expiry e nessuna invalidazione lease su 403 | `browser-client.ts` | lease solo RAM, safety `30 s`, LRU `512`, coalescing, refresh singolo 401/403 |
| Cache disco bounded | Cache Storage scoped ma senza limite | crescita indefinita e nessun last-access | `browser-client.ts` | LRU per header leggero, `32 MiB` / `256` entry, byte reali, purge scope/prodotto/versione |
| Object URL | cleanup locale non misurato | nessun contatore runtime | `browser-client.ts`, `ProductImageControls.tsx` | registry attivo, release centralizzata e assert finale `0` |
| Lista | thumb visible-only | invariata ma non assertiva su main assente | component + E2E | solo thumb, IO gated da IntersectionObserver, main assente prima del dettaglio |
| Dettaglio progressive | main diretta | nessun thumb-preview/crossfade | `ProductImageControls.tsx` | placeholder -> thumb -> main predecoded -> crossfade `200 ms`; reduced motion |
| Errore main | placeholder generico | thumb non garantita durante errore | component + E2E | thumb resta visibile, stato `error`, retry esplicito |
| Upload retry | nessun retry PUT | transiente non recuperato | `browser-client.ts` | massimo un retry per oggetto solo network/5xx; mai 401/403/validazione |
| Visual QA | Product A/B finale e lista 200 | niente preview, error o 390 px | E2E + PNG | desktop/tablet preview/main/error e viewport `390x844` verificati |

## 3. Pipeline preprocessing finale Admin

1. MIME e magic bytes JPEG/PNG;
2. limite input `25 MiB`, massimo `64 MP`;
3. decode una volta in worker con orientamento browser e spazio sRGB;
4. main con lato massimo `1600`, target `750 KiB`, hard limit `1 MiB`;
5. rilascio della sorgente decodificata;
6. thumb derivata dal canvas main, lato massimo `384`, hard limit `90 KiB`;
7. qualita e lati provati con schedule finita; nessun loop aperto;
8. SHA-256 e byte prodotti una volta per output e trasferiti al main thread;
9. canvas main/thumb ridotte a `1x1` in `finally`, anche su errore.

Il fallback main-thread usa lo stesso ordine main -> release sorgente -> thumb
da main e rilascia i canvas in `finally`. Il worker resta il percorso normale;
il fallback esiste per browser privi di Worker/OffscreenCanvas.

Il runtime restituisce ora timing separati per decode+validazione,
render+encode main, render+encode thumb, produzione byte+SHA-256, pipeline e
totale browser. L'editor espone main/thumb byte e dimensioni nel riepilogo; il
solo harness che imposta esplicitamente `data-product-image-metrics=enabled`
riceve transientemente i due blob per verificarne marker, hash e segmenti
metadata. Blob e URL non vengono scritti nel DOM, nei log o nell'evidence.

## 4. Signed URL lease cache

- key: `cacheScope + shopId + productId + versionId + variant`;
- value: URL firmata e `expiresAt`, mai persistiti;
- safety window: `30.000 ms`;
- limite RAM: `512` lease LRU;
- batch read URL `100`, read concurrency `2`, download concurrency `4`;
- 20 consumer contemporanei: una read URL e un download condiviso;
- rerender con lease valida: zero nuove read URL;
- lease entro safety window: nuova read URL;
- primo 401/403: invalidazione, nuova URL, un retry;
- secondo 401/403: errore stabile, nessun terzo tentativo;
- cambio account/shop, replace e remove: invalidazione in memoria anche quando
  Cache Storage non e disponibile o il purge disco fallisce.

Le URL firmate non entrano in markup, log, localStorage, IndexedDB o Cache
Storage. La cache durevole contiene esclusivamente byte JPEG validati.

## 5. Cache Admin e strategia eviction

- namespace: account scope / shop / product / version / variant;
- budget disco: `33.554.432 B` (`32 MiB`) e `256` entry;
- indice leggero: header response `X-MC-Image-Bytes` e
  `X-MC-Image-Accessed-At`;
- eviction serializzata e ordinata per ultimo accesso;
- decode, MIME, marker JPEG e size validati prima del commit;
- entry corrotta eliminata;
- hit valido resta utilizzabile se il touch LRU best-effort fallisce;
- `navigator.storage.estimate()` esposto nelle statistiche quando disponibile,
  ma non richiesto al runtime;
- Object URL fuori dalla cache durevole e contate separatamente.

Il budget non viene presentato come quota browser assoluta: e un guardrail
applicativo misurabile. Il test prepopola il limite e dimostra byte/entry entro
budget e rimozione dell'entry meno recente.

## 6. Progressive rendering e visual assertions

Dettaglio Admin:

- la thumb cached e mostrata subito; altrimenti e scaricata prima della main;
- la main parte solo con dettaglio aperto;
- `Image.decode()` completa prima di montare il layer main;
- aspect-square riserva lo spazio e i box thumb/main restano identici;
- transizione opacity `200 ms`, disabilitata da `prefers-reduced-motion`;
- errore main conserva thumb e presenta `Retry image`;
- cleanup abortisce fetch e revoca entrambi gli Object URL.

Visual assertions Playwright `PASS`:

- placeholder e thumbnail lista `56x56`;
- placeholder Product A sempre visibile e Product A non compare nelle ref;
- nessuna variante `main` richiesta prima dell'apertura dettaglio;
- contenitore preview quadrato, nessun delta dimensionale thumb/main;
- main finale accessibile con nome prodotto;
- errore lascia un'immagine visibile e retry;
- viewport `390x844`: `scrollWidth <= clientWidth`, nessun overflow orizzontale;
- offline reopen: stage finale main da cache e zero richiesta Storage aggiunta.

Artifact sanitizzati nuovi:

- `admin-product-list-no-image-chromium-desktop.png`;
- `admin-product-list-thumb-chromium-desktop.png`;
- `admin-product-list-chromium-{desktop,tablet}.png`;
- `admin-detail-thumb-preview-chromium-{desktop,tablet}.png`;
- `admin-detail-main-chromium-{desktop,tablet}.png`;
- `admin-detail-error-chromium-{desktop,tablet}.png`;
- `admin-detail-mobile-390-chromium-desktop.png`;
- report finali `admin-product-ab-chromium-{desktop,tablet}.json`.

## 7. Upload, cancel e retry

Ordine: intent -> PUT main -> PUT thumb -> finalize. `AbortSignal` e propagato e
un cancel prima del finalize non finalizza. Ogni PUT:

- accetta soltanto blob `image/jpeg`;
- usa il multipart richiesto dall'endpoint Supabase signed upload, con il blob
  nominato `image.jpg` e MIME della part `image/jpeg`;
- `x-upsert: false`;
- `cacheControl=3600`, policy conservativa esistente;
- un solo retry su network o 5xx;
- nessun retry automatico su 401/403 o errore permanente.

Non e stato aggiunto manualmente un header esterno `Content-Type`: `fetch`
imposta il boundary multipart, mentre la part JPEG mantiene il MIME esplicito.
Nessun originale, terzo oggetto, TUS/Uppy o dipendenza nuova.

## 8. Storage read-only e costo

Audit locale osservato dopo cleanup:

- container/progetto locale `MerchandiseControlSupabase` healthy;
- bucket `product-images` privato;
- limite oggetto `1.048.576 B`, MIME consentito `image/jpeg`;
- oggetti/versioni/ready/expired residui: `0`;
- read URL server `5 min`, upload intent `2 h`, upload cache-control `3600`.

Il piano remoto reale e Image Transformations non sono esposti dagli strumenti
locali: `BLOCKED_EXTERNAL_PRECONDITION`; nessuna configurazione e stata
cambiata. La tariffa `USD 0,0213/GB` oltre quota e i `100 GB` inclusi vengono
usati solo come scenario condizionale Pro. Non viene dichiarato che il progetto
sia Pro ne un costo incrementale effettivo pari a zero. Le proiezioni
1/1.000/10.000/20.000/100.000 sono in `06-performance-memory-storage.md`.

## 9. Test e gate realmente eseguiti

| Comando | Risultato |
|---|---|
| `node --test tests/foundation/task-138-product-images-runtime.test.mjs` | `6/6 PASS`, `237,9 ms` nel run finale |
| `npm run typecheck` | `PASS`, route types Next `16.2.6` generati |
| `npx eslint <file TASK-138>` | `PASS` |
| `npm run lint` | `PASS` |
| `npm run build` | `PASS`, run finale compile `2,2 s`, TypeScript `6,3 s` |
| `npm run security:scan` con Win7POS esplicitamente non disponibile | `PASS`, skip esterno dichiarato |
| scan secret-like sui file tracked modificati e untracked | `PASS`, zero file |
| `git diff --check` | `PASS` |
| Playwright visual/runtime desktop | `PASS`; run finale locator artifact `8,5 s` (`9,1 s` totale) |
| Playwright visual/runtime tablet, rerun dopo fix locator test-only | `PASS`, `7,6 s` |
| Playwright fixture locale `status` prima del run distribuzione | `PASS`, `1/1`; il tentativo `seed` e stato correttamente bloccato da manifest preesistente |
| Playwright distribuzione preprocessing Chromium desktop | `PASS`, `1/1`, `4,4 s` (`4,9 s` totale), 12 validi + 3 negativi |
| `npm run i18n:check` | `BLOCKED_ENV_EXTERNAL`: topologia worktree priva di Win7POS Localization |

Il primo run tablet ha fallito soltanto per strict locator `img` dopo
l'introduzione intenzionale dei due layer progressivi; il runtime era gia in
main. L'assert e stato corretto a stage `main` + immagine accessibile e il solo
progetto tablet e stato rilanciato con successo. Nessun `PASS` inventato.

Nel follow-up distribuzione, il primo `npm run security:scan` senza override ha
incontrato un sibling Win7POS parziale e si e fermato con `ENOENT` su un file
esterno allo scope. Il rerun esplicito con
`WIN7POS_REPO_PATH=/tmp/missing-win7pos-ci-fixture` ha prodotto lo skip
dichiarato `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE Win7POS` e
`Security scan passed`; non e stato attribuito un PASS al controllo esterno.

## 10. Bounded security/diff review

- nessun `console` con URL/token;
- nessun sink local/session storage o IndexedDB per signed URL;
- origin, protocollo e path Storage firmato validati prima del fetch;
- risposte MIME/size/marker/decode validate prima della cache;
- logout account/staff mantiene `Clear-Site-Data: "cache"`;
- nessuna service-role key in browser, evidence o file repo;
- nessuna dipendenza/lockfile, migration o schema nuova;
- nessun Deep Security Scan, come richiesto;
- Win7POS e checkout originali non modificati.

## 11. Rischi residui e handoff

- la memoria browser e campionata, non e una prova di assenza assoluta di leak;
- la serie CDP per fixture copre la JS heap pagina, non l'intera heap worker,
  canvas o memoria nativa di decode e non e presentata come picco assoluto;
- il fallback HTMLImage dei browser senza `createImageBitmap` puo avere un
  profilo memoria peggiore del worker normale;
- piano/feature/costo Supabase remoto e parity staging restano
  `BLOCKED_EXTERNAL_PRECONDITION`;
- device fisico non dichiarato.

Verdict lane Admin: `RELEASE_READY_WITH_MEASURED_GATES` per runtime locale e
visual Admin; verdict complessivo TASK-138 resta responsabilita del reviewer e
passa a `REVIEW`, mai `DONE` senza conferma esplicita utente.

Conferme: nessun commit, push, merge, deploy production, migration production,
modifica Win7POS, terzo oggetto preview, signed URL persistita o costo Storage
del placeholder.

## 12. Review trasversale finale del coordinatore

Verdict complessivo: `REVIEW_WITH_BLOCKERS`. La lane Admin e
`RELEASE_READY_WITH_MEASURED_GATES` per il solo runtime locale; Android e iOS
restano `REVIEW_WITH_BLOCKERS`. TASK-138 torna a `ACTIVE / REVIEW`, mai `DONE`.

### Limiti cache e progressive finali

| Client | Lease URL RAM | Cache memory | Cache disk | Dettaglio |
|---|---:|---:|---:|---|
| Admin | LRU `512`, safety `30 s` | Object URL contate | Cache Storage `32 MiB` / `256` | thumb -> main predecoded, crossfade `200 ms` |
| Android | LRU `256`, safety `30 s` | encoded bytes LRU `8 MiB` | file LRU `64 MiB` | thumb -> main, decode Default, Compose Crossfade |
| iOS | LRU `1.000`, safety `30 s` | decoded `48 MiB` / `100` | file LRU `128 MiB` | thumb -> main, decode off-main, Reduce Motion |

Il reviewer ha trovato la lease map Android inizialmente senza cap. Il finding
e stato corretto con access-order LRU `256` e test overflow `256 -> 257`; il
gate post-fix Android e `68/68 PASS`. Nessun altro finding reportable e emerso
dalla review bounded del diff; non e stato eseguito un Deep Scan.

### Gate post-optimization

| Lane | Gate | Esito |
|---|---|---|
| Admin | foundation | `6/6 PASS` |
| Admin | typecheck, ESLint, build Next `16.2.6`, security scoped, diff | `PASS` |
| Admin | visual desktop/tablet/390 px | `PASS`; locator finale desktop `1/1`, tablet `1/1` |
| Android | JVM Service/Cache/Processor/ViewModel | `68/68 PASS` |
| Android | assemble, compile androidTest, lint, diff/secret/SDK path | `PASS`; lint `0` error |
| Android | Emulator API 35 Product Images | `3/3 PASS` |
| iOS | build-for-testing e Analyze | `PASS` |
| iOS | XCTest Product Images | 34 eseguiti, `33 PASS`, `1 SKIP` opt-in, `0 failure` |
| iOS | diff/i18n/secret | `PASS` |
| cleanup | DB/Storage/Auth/manifest/processi | `PASS`, residui `0` |

### Parity stessa fixture locale

| Flusso | Esito |
|---|---|
| Admin seed/upload -> Admin lista/dettaglio/offline/error | `PASS` |
| no-image -> Android | `PASS`, zero eventi rete/cache |
| Admin image -> Android thumb/main/cache | `BLOCKED_LOCAL_ORIGIN_CONTRACT` prima del download |
| Admin image -> iOS thumb/main/cache | `BLOCKED_ENV` prima della rete per config path non stabile dopo reinstall |
| Android/iOS upload -> altri client | `NOT_RUN` |
| replace/remove da ciascuna piattaforma sullo stesso shop | `NOT_RUN` |
| staging/dev allowlistato | `BLOCKED_EXTERNAL_PRECONDITION` |

Il rifiuto Android `image_signed_url_invalid` conferma il guardrail same-origin:
la fix richiesta e allineare l'origin locale emessa a quella emulator-reachable,
non rilassare il client. Il retry iOS e terminato su file-not-found della config
privata prima della rete; nessuna sessione/token e entrata in evidence.

### Metriche e blocker misurazione

- Admin Chromium post-optimization: `12` fixture valide rappresentative + `3`
  negative; main p50/p90/p95 `10.811/53.019/764.587 B`, thumb
  `1.408/7.470/14.696 B`, coppia `12.148/60.489/779.283 B`;
- Admin totale browser p50/p90/p95 `49,2/92,2/113,2 ms`; decode+validazione
  `4,2/16,7/47,8 ms`, render+encode main `24,8/36,1/45,5 ms`,
  render+encode thumb `2,3/2,5/3,2 ms`, byte+hash `0,2/0,4/0,7 ms`;
- Admin delta JS heap pagina massimo campionato p50/p90/p95
  `7.885.496/10.854.608/29.080.188 B`; checkpoint `20 ms`, non picco
  assoluto e non comprensivo di tutta la memoria worker/canvas/nativa;
- Admin no-upscale `PASS`, EXIF/XMP/IPTC assenti su main+thumb e cancel 48 MP
  `PASS`; profilo ICC sRGB dell'encoder registrato esplicitamente;
- Android 48 MP: `50 ms`, PSS `242.449 -> 245.738 KiB`, main `165.769 B`,
  thumb `17.517 B`;
- iOS 48 MP: `172 ms`, main `395.369 B`, thumb `62.038 B`; HEIC `213 ms`;
- iOS cinque fixture nearest-rank: main p50/p90/p95
  `25.107/395.369/395.369 B`, thumb `2.232/64.297/64.297 B`, totale
  `27.339/457.407/457.407 B`;
- Storage Admin sintetico a 100k, separato main/thumb/totale: media
  `7,786600/0,322700/8,109300 GB`, p50
  `1,081100/0,140800/1,214800 GB`, p90
  `5,301900/0,747000/6,048900 GB`, p95
  `76,458700/1,469600/77,928300 GB`.

Il gap Admin delle 12 fixture e chiuso dal JSON schema `2`; la copertura e
rappresentativa per classi sintetiche richieste, ma non e un campione statistico
del catalogo reale. Restano aperti: timer di fase equivalenti sui client mobili,
before/peak/after completo di memoria nativa/worker su tutte le piattaforme,
scroll/20 dettagli con crescita non monotona dimostrata e frame/jank reali.

### Blocker che impediscono RELEASE_READY_WITH_MEASURED_GATES globale

1. parity locale same-shop incompleta e nessuna matrice incrociata
   upload/replace/remove;
2. screenshot Android/iOS assenti; device fisici non verificati;
3. staging/dev, piano Storage e feature remote non verificabili con i
   prerequisiti disponibili;
4. distribuzione Admin misurata solo su input sintetici e memory peak completa
   worker/nativa/multipiattaforma non misurata;
5. browser source decode/fallback non ha prova di picco memoria bounded pari ai
   downsample nativi mobili.

Prossimo passo di review: correggere solo l'harness/origin locale Android e il
trasporto config iOS post-install, completare mobile visual e matrice stessa
fixture serialmente, poi completare memoria/timing mobili comparabili. Non sono
richiesti commit, deploy, migration o modifiche production per chiudere questi
gate.
