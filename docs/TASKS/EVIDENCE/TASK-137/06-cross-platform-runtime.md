# 06 - Runtime e parity cross-platform

## Stato esatto

| Lane | Runtime eseguito | Risultato |
|---|---|---|
| Admin Web | Chromium -> Admin -> Supabase locale reale | PASS |
| Android | emulator -> server HTTP loopback di contratto | PASS 3/3 baseline + 1/1 rerun invalidato |
| iOS | Simulator -> URLProtocol/sessione iniettata | PASS 22/22 |
| Admin -> Android/iOS live | stesso shop e Supabase locale/staging | NOT_RUN |
| Android/iOS -> altri client live | stesso shop e Supabase locale/staging | NOT_RUN |
| device fisici comparabili | Android + iOS | NOT_RUN |

La parity funzionale e dimostrata a livello di contratto e invarianti, non come
parity live tra tre client. Non viene dichiarata equivalenza tra emulator e
Simulator e non viene dichiarato un test fisico non eseguito.
Le metriche provengono inoltre da fixture sintetiche diverse: la stessa
immagine binaria non e stata eseguita sui tre encoder.

## Invarianti confrontati

| Invariante | Admin | Android | iOS |
|---|---|---|---|
| checkpoint/targeted apply | contratto + E2E | unit sync PASS | XCTest sync PASS |
| duplicate/no-op | pgTAP + E2E | unit sync PASS | XCTest/suite sync PASS |
| stale conflict | pgTAP PASS | unit sync PASS | suite sync PASS |
| tombstone/remove | pgTAP + E2E | unit sync PASS | XCTest apply PASS |
| offline/reconnect | cache E2E | unit cache/sync PASS | cache/sync PASS |
| account/shop switch | cache scoped | unit + device PASS | XCTest cache PASS |
| full-pull avoidance | product_ids only | targeted apply PASS | targeted apply PASS |
| URL/token/blob assenti | scanner/E2E | contract test | payload test |

## Blocco residuo

Manca un harness mobile con sessioni riusabili per lo stesso shop sintetico e
cleanup coordinato. Crearlo durante la chiusura avrebbe riaperto fixture e
baseline gia ripulite. Per questo TASK-137 passa a `REVIEW_WITH_BLOCKERS` e non
a `DONE`.

## Recheck preflight finale

- Supabase locale: attivo; target live remoto non usato;
- Android: emulator `emulator-5554` connesso, ma package applicativo assente e
  quindi nessuna sessione auth riusabile;
- iOS: Simulator iPhone 17 Pro, iOS 26.5, booted;
- Admin: processo preesistente in ascolto su `127.0.0.1:3050`, lasciato
  intatto;
- runner final-sync/TASK-137 concorrente: non rilevato;
- fixture parity creata: no; baseline e residuo zero restano invariati.

Il gate sessioni dei tre client e `NOT_READY`, quindi il runner live non e
stato avviato e non viene dichiarata una parity parziale.
