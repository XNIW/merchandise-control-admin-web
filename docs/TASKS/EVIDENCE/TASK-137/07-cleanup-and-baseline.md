# 07 - Cleanup e baseline

## LOCALT137A

Baseline prima/dopo identica:

| Entita | Prima | Dopo |
|---|---:|---:|
| audit_logs | 1711 | 1711 |
| auth_users | 205 | 205 |
| image_objects | 0 | 0 |
| image_versions | 0 | 0 |
| inventory_mappings | 79 | 79 |
| products | 289 | 289 |
| profiles | 205 | 205 |
| shop_members | 84 | 84 |
| shops | 180 | 180 |
| sync_events | 228 | 228 |

Il cleanup `finally` E2E ha rimosso utente, membership, shop, prodotto,
lifecycle, oggetti, eventi e audit della fixture sintetica.

## LOCALT137C

Il rerun con strumentazione preprocess/heap ha registrato la stessa baseline
prima/dopo riportata sopra. Il `finally` ha lasciato `image_objects=0` e
`image_versions=0`; nessuna entita non-fixture e cambiata.

## Controlli finali

- cleanup dry-run locale, cutoff 24h: `candidate_count=0`;
- pending/failed/superseded/removed eleggibili: tutti `0`;
- report operativo read-only: immagini `0`, oggetti `0`, byte `0`, orfani
  `0`, oggetti current mancanti `0`, fuori-budget `0`;
- residuo Storage TASK-137: `0`;
- baseline non-fixture: preservata;
- staging e production: non interrogati e non modificati.

I controlli finali sono stati rieseguiti dopo LOCALT137C: cleanup dry-run
`candidate_count=0` e report read-only `result=PASS`, con tutti i conteggi
immagini, oggetti, byte, orfani, mancanti e fuori-budget a `0`.

Lo script cleanup e dry-run di default, bounded a 100 candidati, richiede
target esplicito e doppia conferma per execute staging. Nessun cron e stato
aggiunto.
