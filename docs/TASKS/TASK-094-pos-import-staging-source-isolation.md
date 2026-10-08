# TASK-094 — candidato staging U2 isolato dalla sorgente servita

Fase: EXECUTION. Mandato esplicito dell'8 ottobre 2026: preparare un candidato
pulito dal commit post hoc f401fc3d6c2a63d2676877a772fc6299b7401f26, albero
1f0679b261dde089800a3bdef7888c1f7a7b8014 equivalente alla sorgente effettivamente
servita. Questo commit NON è il commit della build originale.

Si riusa soltanto la patch prodotto U2 della PR132, head9cc0f691, integrata in
main62f513f6. Nessun sorgente after-sales/reviews, migrazione commerce, indirizzo
TASK054, nuova dipendenza o modifica ai cinque staged originali è incluso.
I tre endpoint, i parser e le due SQL mantengono gli stessi byte revisionati.
Nel candidato iniziale59378789 anche i 18 golden JSON erano byte-identici;
la successiva variante sintetica di nove JSON è documentata più avanti.
I due file preesistenti security-checks e database.types ricevono
soltanto lo stesso delta U2; conservano la loro base servita.

Scope: receipt read-only, retirement esplicito e correction autenticati e
shop/device-scoped. Main e tutti i WIP/checkout/dispositivi altrui sono preservati.
La nuova base richiede review di compatibilità e gate propri: i PASS originali
della PR132 non vengono ribattezzati PASS del candidato staging.

Gate normali tramite Draft PR verso una ref di base f401 isolata. La CI viene
attivata dall'evento pull_request: il workflow CI workflow_dispatch è escluso
perché avvierebbe anche l'E2E staging mutante. Cloudflare PR esegue build-only,
deploy staging/production SKIPPED. Nessun apply, deploy, cleanup o READY.

DDL eventualmente proposta in ordine: 20261008194809
(dfbdd58c3a0ca4700a24996cdf2c69e4724cff249562bd1fff0d7a61c8ac6a20),
20261008200355
(dd1a12f7d36ff8a8efb5499fa197cd972ac03b2812fefad8fea142df2217d631).
La registry TEST osservata alle20:44:56UTC conta155, latest20261002180757.
Entrambe le nuove DDL restano NON_APPLICATE. Il dispatch staging richiede la
successiva autorizzazione specifica sugli effetti concreti, incluse secret e smoke.

Evidenze del candidato: EVIDENCE/TASK-094/staging-source-isolation-20261008.
Le evidenze originali PR132 rimangono nella revisione originale, con i loro limiti.
Metriche HTTP503/CPU/memory e manifest ARTICOLI corrente sono prerequisiti
separati; mobile, vendite/restore e produzione restano fuori da questo candidato.

## Gate iniziale e delta di qualificazione

Il candidato59378789 della Draft PR133 ha gateFAIL conservati: CI37846093202
e Cloudflare37846093230. Foundation1018PASS/5FAIL/13SKIP; DB147migrazioni
applicate soltanto nel DB effimero, pgTAP48file/2624test con un'asserzione FAIL.
Le cause sono quattro fixture storiche non allineate a funzioni servite già
byte-identiche a PR132: redirectmanual, filtri data null, revalidazione immagini
e replay della versione immagine ready/current. Nessun difetto U2 dedotto.

Si portano soltanto i delta fixture già presenti in PR132: tre foundation file
e wechat_003_image_intent_replay_rate_lock.sql. Quest'ultimo conserva i contatori
versione/rate e verifica anche zero audit/sync duplicati e i rifiuti non-current
e archived. Nessun nuovo sorgente prodotto o SQL di migrazione è cambiato.
31/31 test foundation mirati PASS su questo delta, senza npm install/build.
Le review del delta e la nuova CI sull'HEAD successore restano gate distinti;
nessun retry sullo stesso albero e nessun test SQL locale ripetuto.

## Variante fixture sintetiche concordata con Asus

Su richiesta esplicita, idempotencyKey correction diventa correction-idem-1.
I sette JSON trasferiti e i due response duplicate/conflict mantengono binding
coerenti. Il parser Admin invariato ricalcola canonicalPayloadHash
3316daaff1fa2b14af2e86205cd3e6da45d57b290186a577f376f92d1afedf13
e no-effect eedf895823df77b29ddcf88a734d513fd66beca7babfeb0c83911d3d1281b60e.
La dichiarazione payloadHash client sintetica resta opaca e coerente; nessun
originale reale viene riscritto. Ordinary, runtime, SQL e scanner invariati.
11/11 test esistenti correction/golden/child mirati PASS sul delta. La verifica
Gitleaks Win7 resta dell'owner Asus, non eseguita qui. Freeze finale 36 file.
