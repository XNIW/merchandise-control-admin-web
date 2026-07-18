# TASK-138 Final Release Review

Data: `2026-07-18`

Verdict: `RELEASE_READY_WITH_MEASURED_GATES`

L'utente ha richiesto esplicitamente la review completa, l'esecuzione dei gate
mancanti, la chiusura `DONE` e la successiva pubblicazione su `main`. Questo
documento riconcilia il precedente handoff `REVIEW_WITH_BLOCKERS`; non modifica
lo stato storico di TASK-137 e non estende lo scope a Win7POS o production.

1. **Scope** — Admin Web, Android, iOS e Supabase locale TASK-138; nessuna
   migration o write su staging/production.
2. **Baseline Git** — Admin `a20fdaf6`, Android `69c36c2c`, iOS `2e2cc620`,
   ciascuno in worktree isolato; i checkout originali sono rimasti intatti.
3. **Backend gate** — reset/apply locale, pgTAP `149/149`, foundation backend
   `20/20` e route/lifecycle Product Images erano verdi prima delle patch client.
4. **Ruoli** — fixture sintetica owner/manager/viewer/cashier: write consentita
   solo ai ruoli autorizzati e denial backend preservati.
5. **Product A** — nessuna versione immagine produce placeholder locale, zero
   `read-urls`, zero Storage request e zero cache entry sui tre client.
6. **Product B** — thumb lazy/crop in lista e main contain/fit in dettaglio o
   editor provati su Admin, Android e iOS.
7. **Progressive rendering** — placeholder -> thumb -> main, decode precedente
   alla pubblicazione e fallback thumb su errore main sono coperti da runtime e
   test.
8. **Visibility** — Admin usa observation/cancel reali; Android e iOS cancellano
   lavoro offscreen e ignorano completion stale.
9. **Batching** — dedup per chiave e chunk `<=100` provati con `205` riferimenti
   su ciascun runtime.
10. **Concurrency** — single-flight/coalescing e massimo `4` download concorrenti
    sono coperti da test deterministici.
11. **Signed URL** — lease solo memory, LRU bounded, expiry/safety window e un
    solo refresh+retry `401/403`; nessuna URL firmata viene persistita.
12. **Decode safety** — status, MIME, magic bytes, dimensioni e decode sono
    verificati prima del commit cache; byte corrotti non lasciano entry.
13. **Cache scope** — chiave account/shop/product/version/variant, offline hit e
    purge su logout, cambio account/shop, replace e remove sono verdi.
14. **Budget cache** — Admin Cache Storage ha LRU byte/entry; Android limita
    memoria a `8 MiB` e disco a `64 MiB`; iOS limita decoded a `48 MiB`/100 entry
    e disco a `128 MiB`.
15. **Preprocess** — lavoro pesante off-main/UI; main massimo `1600 px`/`1 MiB`,
    thumb massimo `384 px`/`90 KiB`; nessun upscale e metadati rimossi.
16. **Fixture preprocess Admin** — 12 input validi rappresentativi e 3 negativi,
    inclusi landscape/portrait/square, alpha, orientation, small, progressive e
    48 MP; corrotti/MIME errato/animato sono respinti.
17. **Distribuzione Admin** — main p50/p90/p95 `10.811/53.019/764.587 B`, thumb
    `1.408/7.470/14.696 B`, coppia `12.148/60.489/779.283 B`.
18. **Timing Admin** — preprocess totale p50/p90/p95
    `49,2/92,2/113,2 ms`; heap pagina campionato delta
    `7.885.496/10.854.608/29.080.188 B`, non picco nativo assoluto.
19. **Storage projection** — distribuzione Admin a 100k immagini: media
    `8,1093 GB`, p50 `1,2148 GB`, p90 `6,0489 GB`, p95 `77,9283 GB`; main e
    thumb separati nel JSON evidence.
20. **Android unit gate** — `74/74 PASS`; regressione reale aggiunta per il campo
    MIME obbligatorio con `kotlinx.serialization encodeDefaults=false`.
21. **Android build gate** — `assembleDebug` e `assembleDebugAndroidTest` PASS;
    `lintDebug` PASS con `0` errori e `23` warning storici/fuori scope.
22. **Android runtime** — sei screenshot, lista `200`, apertura editor `20`, max
    `12` immagini composte; PSS before/max/after
    `164431/194988/184228 KiB`.
23. **iOS complete gate** — Analyze exit `0`; suite Product Images finale 40
    eseguiti, `37 PASS`, `3 SKIP` opt-in attesi senza config, `0 failure`.
24. **iOS performance** — test 200 scroll `1,877 s`, 205-ref concurrency
    `3,107 s`, 48 MP `0,160 s`, HEIC `0,265 s`, high-res `0,052561 s`, peak
    physical campionato `91.998,608 kB`.
25. **Visual QA** — Admin desktop/tablet/390 px, Android sei stati e iOS sei
    stati sono stati acquisiti e ispezionati; il clipping iniziale dell'harness
    iOS e stato corretto e riconfermato.
26. **Cross-platform replace** — Android replace -> Admin/iOS read PASS; iOS
    replace -> Admin/Android read PASS. Il fix MIME Android e nato da questa
    prova reale, non da una deduzione statica.
27. **Cross-platform remove** — Android remove -> Admin absent PASS; iOS remove
    della versione Android -> commit DB riuscito, prima risposta PostgREST `503`
    post-commit, unico retry idempotente `already_removed` PASS in `0,249 s`,
    Admin absent/zero image-read PASS.
28. **Cleanup** — teardown fixture `1/1 PASS`; query finale:
    `shops=0`, `products=0`, `versions=0`, `storage_objects=0`, `auth_users=0`;
    manifest/config rimossi e nessun Simulator/emulatore rimasto acceso.
29. **Security/diff** — scan normale Admin PASS con Win7POS esplicitamente
    saltato perché fuori scope e checkout parziale; i18n Admin+Win7POS PASS;
    diff/secret/sensitive-sink scan bounded sui tre repository senza finding
    bloccanti. Nessun Deep Scan e stato eseguito, come richiesto.
30. **Release decision** — criteri TASK-138 locali e cross-platform soddisfatti;
    staging/dev autenticato e device fisici restano
    `BLOCKED_EXTERNAL_PRECONDITION`/`NOT_RUN` e non sono trasformati in PASS.
    L'utente accetta la chiusura locale misurata: task `DONE`, pronto per commit,
    merge fast-forward su `main` e push dei tre repository.

## Gate Admin finali

- `npm run typecheck`: `PASS`;
- `npm run lint`: `PASS`;
- `node --test tests/foundation/task-138-product-images-runtime.test.mjs`:
  `6/6 PASS`;
- `npm run build`: `PASS`, Next.js `16.2.6`;
- `npm run security:scan`: `PASS`, con skip esplicito del repository esterno
  Win7POS non disponibile nella forma attesa dallo scan monolitico;
- `npm run i18n:check`: `PASS`, `status: pass`;
- fixture cleanup e residual query: `PASS`, tutti i contatori TASK-138 a zero.

## Limiti dichiarati

Le misure memoria sono campioni dei tool indicati, non prova di assenza assoluta
di leak. Staging/dev non-production non aveva una sessione autorizzata valida;
device fisici Android/iOS non erano disponibili. Production, deploy, migration
remote e Win7POS non appartengono a TASK-138.
