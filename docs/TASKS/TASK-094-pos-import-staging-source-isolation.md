# TASK-094 — candidato staging U2 isolato dalla sorgente servita

## Continuazione autorizzata post-PR122 — 10 ottobre 2026

Fase: EXECUTION. Candidato workingtree sul precedente af365f0d. Si trasferisce
soltanto il delta protocollo da main62f513 a2bcee6e8: parser forensic attempt0/
omesso, upload immutabile a fasi, verifica hash server, retirement esplicito,
piani con parti bounded, ACK completi e successione autorevole. Gli endpoint
ordinary mantengono attempt positivo,1000 righe e512KiB HTTP. Il controllo
quote/root/identity e la normalizzazione paginata appartengono al nuovo protocollo.

I cinque file serviti e i nove golden brevi preesistenti sono byte-identici al
precedente RC; security-checks e database.types conservano la base del RC e
ricevono soltanto tre route e dodici dichiarazioni RPC. Nessun after-sales,
reviews, indirizzo commerce o migrazione native storica viene importato dal main.
La sorgente f401 resta attestazione post hoc dell'albero, non commit compilato
originale. Il diff protocollo è verificato; review e CI del candidato finale
devono qualificare il suo specifico SHA, senza riattribuire gate main54a.

Le prove sorgente main54a comprendono CI/Cloudflare PASS (deploy/E2E skipped),
115 richieste C# con handler/SQL economica su quattro DB freschi e il pilot
dense5000 di210 chiamate/10ACK. L'owner Asus riferisce reingest1158/8 PASS,
pubblicato7ae17532. Outer authentication e schema dependency sono sintetici;
non sono prove di caller live. Il pilot dense5000 è distinto dalla cattura e
replay del servizio C# completo. Dense59999 e risorse upper restano in qualifica.
I precedenti FAIL e DB conservati non sono rimossi o riapplicati.

Proposta DDL selettiva, senza esecuzione: le due SQL originali invarianti
20261008194809 e20261008200355, poi20261009004800 multipart SHA256
c827afcaeae4fc4270b0b0d5078c4d7ce7084ff9d315bde4492f46982d3a80cf.
Il successore2bcee6e8 contiene il fix mirato e88 per il timeout110s reale nel
controllo finale59999: proiezioni materializzate strette, stesse tre verifiche.
SHA attuale della terza DDL:
e88d17783f89fc307bb2f62c1d2e5d6fb645fa6d3c3b3a4b7d723b50d94f9aca.
La review statica dell'equivalenza passa; replay/risorse/gate nuovi sono pending.
Registry155 e deployment22107a6f sono osservazioni storiche, da rinfrescare
nelle precondizioni della proposta finale. Nessun all-migrations.

Shared TEST DDL, Worker/secret staging, cleanup, READY e produzione richiedono
le autorizzazioni specifiche ancora mancanti. Il dispatch Cloudflare proposto
deve identificare ref pulita/SHA/albero, secret TASK150, configuration probe,
eventuale smoke GET e rollback; non viene eseguito da questo candidato.
Metriche finali e universo ARTICOLI con ownership/bootstrap restano separati,
activeQaRuns/qaScopeClean null. Nessun DONE o blocco POS dipendente dal mobile.

## Storico della preparazione — 8 ottobre 2026

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
