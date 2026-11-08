# ASUS-W7POS-019 — stato della superficie staff

## HTTP qualificato e guasto ambiente post-merge

Correttivo codice3e56a3224cc8f54947c0a939cfa79e108b99db64, PR145 integrata
normalmente infdb30f4c926bd2b76cbc6d8828ec4ef9874e9c14. CI42522680653 e
Cloudflare42522680527 PASS; foundation1170totali/1156PASS/14SKIP/0FAIL,
UI48/pairing2; artifact database complete.json PASS67file/4375pgTAP,
merge sintetico44059ba099869bd4465e64b10efd64bca8d60919. Nessun verde dei
predecessori trasferito a questa SHA. Staging E2E e deploy SKIPPED.

Post-merge Verify PASS e Cloudflare42523315497 PASS. Database della
CI42523315476 fallisce prefix bootstrap, prima di bind/apply/test; una sola
ripetizione mirata del job fallito su nuovo runner ha riprodotto la stessa
fase. Evento push conservato, TASK094 live E2E sempre SKIPPED. Prima failure,
seconda failure e receipt GUARD_REJECTED preservate. La causa nativa precisa
rimane UNKNOWN, non è attribuita a Docker/registry/password per ipotesi.

Lacuna concreta del tool: error.json non distingue timeout, image pull/rate
limit, health, connection o migration startup. Diagnostica minima nello stesso
runner: legge il log privato e restituisce soltanto uno di sette enum chiusi
nel campo category esistente. Nessun argv, output nativo, messaggio eccezione,
path o secret entra nella proiezione. Errori della diagnostica non mascherano
la failure primaria; budget1200s, tentativo unico e guard originali invariati.
Test dinamico con sentinelle e categorie fuori allowlist, altro stage e IO_ERROR
PASS. Primo test Windows sul writer Linux O_DIRECTORY fallito: corretto il test
di proiezione usando un sink in memoria, senza rendere portabile o indebolire
il writer originale. Nessun DB/server condiviso toccato da questa diagnostica.

Le quattro RPC receipt/retire/correction/recovery sono presenti nel progetto
remoto anche se le due versioni isolate non sono nella migration history:
assenza di una riga history non è assenza del contratto. Non se ne deduce la
compatibilità di tutto il Worker; resta da riconciliare sorgente servita e
unità release, senza SQL automatiche o deploy main alla cieca.

## Prosecuzione autorizzata — 8 novembre, merge e HTTP reale

PR144 fuori draft e integrata con merge normale919d1008884983075212064c88d790881a2b700e.
Root ha revisionato indipendentemente il diff preparato da altro autore: guard
staff intatto, zero query staff, permesso/sessione scaduta, backend errore,
account personale, zero autorizzato e IT/EN/ES/ZH distinti. Nessun finding
concreto. Continuità fra codicef8ac2fd6 e tre file docs19e0b6f verificata;
albero919d100 identico all'head PR. Nessun nuovo check dichiarato su19e0b6f.
Post-merge CI42519626751 e Cloudflare42519626731 PASS; TASK094 staging E2E,
deploy staging e production SKIPPED. I contatori della qualifica precedente
rimangono attribuiti a f8ac2fd6, non ricostruiti dai soli status nuovi.

Console autenticata realmente sul Worker399720d2 ancora precedente: fallback
Non autorizzato/righe0/scrittureOff osservato. Non significa incassi zero.
Nuovo normale Start-Process dell'installato1823697 sul profilo isolato PASS;
login POS verificato, poi catalog500/db_failure. Audit reale correla
catalog_v2_empty_manifest/manifest. Nessuna RPC success trasferita a HTTP.
Prima failure preservata; processo POS posseduto fermato con PID, creationTime
UTC e path verificati per interrompere i tentativi di background. Trust e account
conservati. Nessun apply Getnet, vendita o outbox commerciale.

Il nuovo correttivo accetta esclusivamente una pagina RPC già validata,
scope shop_scoped senza owner, full_refresh fresco senza lowerBound/continuation,
entity done, hasMore false, zero righe e tutti nove contatori zero. Mantiene
delta zero, scope legacy/combined e vuoti parziali/incoerenti negati; il fence
finale pubblicazione resta obbligatorio. Nessuna migration o grant.
Due casi iniziali full/delta rossi HTTP500; il primo verde locale22/23 ha
mostrato un'ammissione delta troppo ampia, subito ristretta al solo full.
Il positivo delta con lowerBound nullo non rappresentava un delta reale ed è
stato ritirato; il negativo delta originale resta byte-invariato. Il precedente
test di rifiuto indiscriminato full è ora un negativo nonterminale, con tutte
le asserzioni conservate e positivi completi separati. Nuovo mirato33/33 PASS.
CI del nuovo correttivo ancora da eseguire; nessun verde precedente trasferito.

Rilascio concreto: target merchandise-control-admin-web-staging e progetto
collegato verificati; Worker attivo399720d2-c76f-440b-bf08-a4a2bd7da1a9,
deployment291c5cb8-489b-41ff-8d77-7be51c03989b. Credenziali metadata disponibili,
nessuna nuova credenziale richiesta o modificata. Rollback predisposto con
wrangler rollback verso quella versione, env staging, nessuna SQL.
L'albero storico equivalente1f0679b261dde089800a3bdef7888c1f7a7b8014 non prova
la sorgente del Worker15ottobre; main differisce su28percorsi runtime da quel
solo albero storico e PR133 mantiene un train isolato. Owner Admin deve fornire
o riconciliare snapshot immutabile equivalente al Worker corrente, comprensivo
TASK140F, oppure prova di compatibilità del rilascio completo main. Serve a
conservare codice già servito e contratto DB, non è un nuovo consenso generico.
Nessun deploy main o dispatch CI generico eseguito; nessun train SQL applicato.

Le sezioni sotto conservano gli stati precedenti a questo mandato e al merge.

Continuazione autorizzata dell'8 novembre 2026, base Admin
`f874723a436456c14841932ab1028c0e8cf25964`. Candidato
`f8ac2fd6beda0e20d2fa4060c2dad45e78bdc001`, PR144 in REVIEW del software;
ACK/review dell'owner e merge/deploy pendenti. Nessun DONE.

Il ramo `getShopAdminReadModel` dopo accesso e permesso verificati non dispone
di una lettura shop/member lease-bound per lo staff. In precedenza classificava
questa capacità assente come `unauthorized`; il fallback mostrava righe0 e
scrittureOFF anche quando nessuna query era stata eseguita. Questa è una causa
dimostrata nel codice, non una certificazione del deployment della console.

Il nuovo stato locale `staff_surface_unavailable` conserva il guard e l'assenza
di query staff. Il testo spiega la disponibilità della pagina; una lettura non
eseguita o fallita presenta dati indisponibili, una lettura autorizzata vuota
mantiene lo zero. Le azioni sono descritte soltanto per la pagina. Accesso scaduto
o negato rimane distinto; i dati precedenti non sono preservati. Traduzioni
italiana, spagnola e cinese incluse. Nessuna modifica auth, lease, RLS, SQL,
resolver catalogo, ruolo, grant o contratto mobile.

Regressioni dinamiche sui moduli reali con dipendenze sintetiche: tre superfici
staff, permesso negato/sessione scaduta/assente, account personale, lettura vuota,
errore query/backend non configurato, perdita accesso, membri e traduzioni.
25/25 test mirati PASS (13 nuovi più12 esistenti), ripetuti dopo la correzione
lint del loader. Security, typecheck, lint e build locali PASS, Node24.18.0.
CI canonica Node22 sul candidato PASS: CI42493312883 e Cloudflare42493312831.
Foundation1158 totali,1144 PASS/14 SKIP/0 FAIL; UI48, pairing2,
67file/4375pgTAP. Security, typecheck, lint, build e diff check PASS.
Staging E2E e deployment skipped secondo il workflow, nessun esito live dedotto.

Runtime CI merge sintetico `56751ed3a9d3c82fb7fdad5a209f343f558e94b5`, albero
`e956139b91a4655358bf2048c14f5a565c185401`, identico alla candidata.
Artifact13622139763 scaricato: SHA256 ZIP
`bbad9412814758a28739aae9be988231e6849427d6589f7081d05d0facab14b9`
uguale al digest GitHub; complete.json lega status, SHA,67file/4375test e digest
del resolver già riparato. Ricevuta privata `admin-ci-144/qualification.private.json`.
Questa successiva chiusura documentale è distinta dalla SHA codice verificata.

Prime failure conservate fuori repository: i18n senza sibling configurato
ENOENT; runner foundation con elenco assoluto ENAMETOOLONG su Windows; esecuzione
di tutti1158 test con glob Node:1152 PASS,4 FAIL,2 SKIP. Tre failure riguardano
lo scanner cross-repository e le registrazioni locali Win7POS, una il checksum
WECHAT-006 del checkout CRLF. Il primo lint ha inoltre rilevato il nome `module`
nel nuovo loader test; corretto in `loadedModule`, nuovo lint PASS. Nessun test,
expected, soglia o budget eliminato per ottenere un verde.

Evidence privata: root corrente da `catalog409-current-root.private.txt`,
sottodirectory `e2e-20261108T143340Z`, log `admin-*`. Nessuna identità reale,
credenziale o controllo finanziario in questa proiezione.

La versione Worker attiva osservata resta quella del15 ottobre; il suo SHA Git
non è esposto. Questo fix non è una prova live della console e non comporta
rollout dell'attuale train mobile. Il coordinamento TASK-146 riusa la nota
esistente sulla PR iOS29; ACK dell'owner ancora PENDING, nessun nuovo commento.

Separatamente, l'utente ha già autorizzato un avvio normale POS: il nuovo
tentativo è stato negato dalla policy dello strumento, nessun processo o nuovo
pull osservato. Due tentativi installer sono terminati con consenso Windows
annullato e restano conservati. Dopo esplicita richiesta utente di riapertura,
installazione d262ccd riuscita:41/41file byte-identici e DB invariato rispetto
al backup verificato, nessun avvio POS automatico. Non si ripete la richiesta
della stessa autorizzazione per aggirare il rifiuto del POS, non si
cambia launcher e non si attribuisce un PASS HTTP/UI alla prova RPC precedente.
