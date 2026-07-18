# TASK-138 Performance, memoria e storage

## Rete e fan-out

Foundation dinamica con `205` ref unici e `410` consumer concorrenti:

- batch `100 / 100 / 5`;
- `205` download effettivi dopo coalescing;
- picco read concurrency `<=2`;
- picco download concurrency `4` esatto.

Browser lista 200:

| Viewport | Render | Ref avviati | Heap delta campionato |
|---|---:|---:|---:|
| desktop | 200 | 2 | 74.032.944 B |
| tablet | 200 | 2 | 59.016.256 B |

Il guardrail e `96 MiB`. Questi delta CDP sono campioni di processo durante un
run dev, non picchi assoluti o budget production.

## Preprocess Admin

Il report schema `2` in `admin-preprocessing-chromium-desktop.json` e stato
prodotto dopo l'optimization pass, usando il worker e l'editor reali:

- `12` input validi rappresentativi: landscape, portrait, square, PNG alpha,
  orientamento EXIF 6, piccolo, 48 MP, progressivo, packaging/testo, rumore
  deterministico, scuro a basso contrasto e panorama;
- `3` negativi aggiuntivi: JPEG corrotto, MIME errato e GIF multi-frame;
- main e thumb reali ispezionate per MIME, marker JPEG, byte, dimensioni e hash;
- EXIF/XMP/IPTC assenti in entrambi gli output; l'encoder browser aggiunge un
  profilo ICC sRGB, registrato esplicitamente e non confuso con metadata input;
- no-upscale `PASS` su tutte le fixture; il caso `120x80` resta `120x80` sia
  main sia thumb;
- cancellazione 48 MP `PASS`; max timer gap campionato `102,7 ms`;
- runtime osservato per tutti i validi: `worker`.

Distribuzioni nearest-rank sui `12` output validi:

| Metrica | Media | p50 | p90 | p95 |
|---|---:|---:|---:|---:|
| input byte | 235.991 B | 23.509 B | 281.519 B | 2.150.687 B |
| main byte | 77.866 B | 10.811 B | 53.019 B | 764.587 B |
| thumb byte | 3.227 B | 1.408 B | 7.470 B | 14.696 B |
| coppia main+thumb | 81.093 B | 12.148 B | 60.489 B | 779.283 B |
| browser totale | 58,592 ms | 49,2 ms | 92,2 ms | 113,2 ms |
| decode + validazione | 8,692 ms | 4,2 ms | 16,7 ms | 47,8 ms |
| render + encode main | 23,100 ms | 24,8 ms | 36,1 ms | 45,5 ms |
| render + encode thumb | 2,075 ms | 2,3 ms | 2,5 ms | 3,2 ms |
| byte + SHA-256 | 0,267 ms | 0,2 ms | 0,4 ms | 0,7 ms |

Memoria per fixture: sessione CDP pagina,
`Performance.getMetrics.JSHeapUsedSize`, checkpoint before/after e massimo
campionato ogni `20 ms`. Il delta massimo campionato ha p50 `7.885.496 B`, p90
`10.854.608 B`, p95/massimo `29.080.188 B`. Questa metrica non comprende tutta
la heap del worker, canvas e memoria nativa di decode; non e un picco assoluto
di processo e non dimostra assenza assoluta di leak.

## Mobile

- Android Emulator API 35, run post-optimization 48 MP: `50 ms`, PSS
  `242.449 -> 245.738 KiB` (delta `3.289 KiB`), main `165.769 B`
  `1600x1200`, thumb `17.517 B` `384x288`;
- iOS Simulator, run post-optimization 48 MP: `172 ms`, main `395.369 B`,
  thumb `62.038 B`; high-resolution performance peak physical aggregato
  `100.093,264 kB`;
- iOS `205` ref, batch `100/100/5`: `2,970 s`;
- iOS HEIC: `213 ms`.

Le metriche usano runtime, encoder e metodi differenti e non sono confronti
benchmark diretti tra piattaforme. Android non ha una misura PSS
before/peak/after; iOS non ha una serie physical-memory before/peak/after per
fixture. Nessuna delle due misure dimostra assenza assoluta di leak.

## Storage e costo

La precedente estrapolazione dal solo Product B (`28.864 B`) e ritirata come
media globale. La distribuzione seguente usa le `12` coppie main/thumb
sintetiche rappresentative misurate nel runtime Admin post-optimization, con
percentile nearest-rank:

| Variante | Media | p50 | p90 | p95 |
|---|---:|---:|---:|---:|
| main | 77.866 B | 10.811 B | 53.019 B | 764.587 B |
| thumb | 3.227 B | 1.408 B | 7.470 B | 14.696 B |
| coppia main+thumb | 81.093 B | 12.148 B | 60.489 B | 779.283 B |

Il totale percentile e calcolato sulla distribuzione delle coppie, non come
somma dei percentili marginali. La copertura sintetica include packaging/testo,
rumore, scuro e panorama, ma non costituisce un campione statistico del catalogo
fotografico reale: le proiezioni sono `MEASURED_SYNTHETIC`, non forecast di
produzione.

Proiezione Storage corrente in GB decimali, due oggetti per versione e nessun
originale/preview:

| Prodotti | Profilo | main GB | thumb GB | totale GB |
|---:|---|---:|---:|---:|
| 1 | media | 0,000077866 | 0,000003227 | 0,000081093 |
| 1 | p50 | 0,000010811 | 0,000001408 | 0,000012148 |
| 1 | p90 | 0,000053019 | 0,000007470 | 0,000060489 |
| 1 | p95 | 0,000764587 | 0,000014696 | 0,000779283 |
| 1.000 | media | 0,077866 | 0,003227 | 0,081093 |
| 1.000 | p50 | 0,010811 | 0,001408 | 0,012148 |
| 1.000 | p90 | 0,053019 | 0,007470 | 0,060489 |
| 1.000 | p95 | 0,764587 | 0,014696 | 0,779283 |
| 10.000 | media | 0,778660 | 0,032270 | 0,810930 |
| 10.000 | p50 | 0,108110 | 0,014080 | 0,121480 |
| 10.000 | p90 | 0,530190 | 0,074700 | 0,604890 |
| 10.000 | p95 | 7,645870 | 0,146960 | 7,792830 |
| 20.000 | media | 1,557320 | 0,064540 | 1,621860 |
| 20.000 | p50 | 0,216220 | 0,028160 | 0,242960 |
| 20.000 | p90 | 1,060380 | 0,149400 | 1,209780 |
| 20.000 | p95 | 15,291740 | 0,293920 | 15,585660 |
| 100.000 | media | 7,786600 | 0,322700 | 8,109300 |
| 100.000 | p50 | 1,081100 | 0,140800 | 1,214800 |
| 100.000 | p90 | 5,301900 | 0,747000 | 6,048900 |
| 100.000 | p95 | 76,458700 | 1,469600 | 77,928300 |

Versioni superseded nel grace period sono separate: ogni versione ancora
presente aggiunge un'altra coppia secondo la distribuzione scelta. Un caso
temporaneo con una versione superseded per ogni prodotto raddoppierebbe i GB
della riga; il numero reale di versioni nel grace period non e stato misurato.
Overhead oggetti/metadata, pending non scaduti, backup, egress e altro consumo
del progetto non sono stimati.

Formula costo condizionale oltre quota: GB fatturabili x USD `0,0213`/GB-mese,
prezzo Storage eccedente pubblicato da Supabase e osservato il `2026-07-18`.
Il piano remoto reale non e esposto dagli strumenti locali:
`BLOCKED_EXTERNAL_PRECONDITION`; i `100 GB` inclusi del piano Pro sono quindi
solo uno scenario, non il piano effettivo ne un claim di costo incrementale
zero. Fonte: `https://supabase.com/pricing`.

Audit locale read-only precedente dopo cleanup: bucket `product-images`
privato, limite oggetto `1.048.576 B`, MIME `image/jpeg`;
`storage_objects=0`, `image_versions=0`, ready/pending scadute/fixture DB/Auth
`0`. Il run distributivo finale ha riusato una fixture sintetica locale
preesistente dopo gate `status PASS`, senza upload, finalize, remove o altra
scrittura DB/Storage. Il manifest preesistente non e stato rimosso da questa
lane. TTL read URL server `5 min`, intent upload `2 h`; upload Admin usa
`cacheControl=3600` conservativo. Image Transformations e piano remoto reale
non sono stati modificati e restano non verificati.
