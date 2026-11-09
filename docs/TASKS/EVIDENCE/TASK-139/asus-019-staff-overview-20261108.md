# ASUS-W7POS-019 — stato della superficie staff

## Corrente —148 qualificata e servita, controllo autenticato PASS

Codicecc7b835ac59004e6acd2988be15fdc372d06c7cd, normale merge
9016054ab6fea1a8d9ad7e6765255662af5afafe.45mirati e typecheck/security/lint
locali PASS, con check esterno Win7POS SKIPPED solo localmente.
Cloudflare42638650988 PASS, CI42638651781 attempt2 database/Verify PASS.
Attempt1 PREFIX_CONTAINER_HEALTH_FAILED prima di bind/apply/test preservato
con artifact13683128351 e log; bootstrap/config immutati rispetto a b0a25e8,
un solo rerun targeted failed jobs. TASK094 live SKIPPED, nessun dispatch.
Postmerge CI42641653938 e Cloudflare42641652917 PASS.

Artefatto Linux13684508006, ZIP SHA256
9f5902b105078c35896b531b42e54a6bf30f50a01a6fd026cfa3d238f7c9b01a;
compiled source434e31214ed04820bfb89b9441b054d4d2e3c155,
tree918a24eeeb78e83ae98c5f396dac8231ce1a6ab4 equivalente a candidata e merge.
57checksum e canonical git blob lock/config PASS; dry-run no-bundle verifica
Worker SHA2567d87a0968c9728acdc6993248c794598b94fd7b2fcdc38a0070de97f8e30b08f
byte-identico. Configurazione portabile solo staging, due sole variabili
browser pubbliche legate al progetto staging verificato; nessuna chiave server.

Deploy CLI bounded/no-bundle/keep-vars terminato0. Worker
a68ebec2-3c55-46f8-bf4d-502e326187af, deployment
1cd437f1-0608-408b-ba42-eb0f9716c7e8,100% e tag9016054 verificati,
cf:check:staging PASS. Nessun secret put, SQL, grant, produzione o suite live
commerciale. Primo rilascio147 e rollback pinned399720d2 preservati sotto.

Controllo autenticato della148 PASS dopo nuova immissione mascherata utente:
scheda Admin019, panoramica «non disponibile per accesso staff» e pagina
Staff con lettura autorizzata safe osservate. La sessione resta valida nella
navigazione; nessun account, PIN o permesso modificato. Le sessioni revocate
dal difetto147 non sono state riattivate dal DB.

Sul successore, avvio del collegamento quotidiano verificato sull'installato
1823697 e profilo NEW_SHOP_019 conservato; login manuale, catalogo autorevole
vuoto e workbench reale PASS. Sette XLSX analizzati nella UI con preview
NeedsEvidence e confronto indipendente; solo quattro legacy applicabili
salvati. Backup prodotto e riconciliazione esatta PASS, ricevuta e report/CSV
consultabili. Errore NullReference UI successivo al commit conservato: un test
Windows sintetico riproduce la rientranza della conferma, patch mirata in
qualifica. Non è dimostrato lo stack originale live. Nessun retry Apply o
undo del lotto valido; moderni ancora bloccati dalla prova temporale C.
Le evidenze Windows sono separate dalla CI Admin e dalla qualifica fisica
Win7, già dichiarata indisponibile.

Software pronto alla REVIEW; continuazione reale ACTIVE, nessun DONE.
I checkpoint successivi sono storia.

## Primo live147: catalogo PASS, console FAIL, rollback verificato

PR147 mergecdebb26c8b25a1204b4bea7fc8e0342b833bf6cb; CI42632336586 e
Cloudflare42632336513 post-merge PASS. Artefatto13681780138, digestZIP
86f847f9cd84f4baa0c6251ec55569c582d3af8f7bb17c838ca1984aa4f8e4d9,
57checksum PASS. Source compilata3caa754861a06de281e080022fec67282d79cf93,
tree4f6424cf5ef7b48bcf4e5391154196a8850e7447 identico alla candidata b0a25e8
e al merge. Worker SHA256118b4f6a302d0ffae6078b700af8dcddf8b1876f387a914a001549a3079bac66;
dry-run no-bundle byte-identico, configurazione browser corretta verificata.

Deploy staging5cbf018f-a7ed-4e9d-8406-f8488a9654b7, deployment
94808d91-191e-46e5-b0fc-e328622d8fcd, tagcdebb26. Plain variables uguali,
nomi secret binding uguali, nessun secret put o SQL; pubblico PASS.
Avvio POS installato rifiutato dallo strumento, nessun processo/pull nuovo;
utente esegue lo stesso avvio ordinario e inserisce credenziale mascherata.
Login, catalogo completo zero e storico disponibile osservati; workbench
Historical workspace aperto. Cassa/vendite/pagamenti restano non pronti.

Controllo console FAIL: la pagina dichiara sessione staff non attiva. Metadata
readonly: due sessioni appena emesse, non scadute, credential version coerente,
actor pos_admin attivo, revocate subito dopo il login. Nessun token/hash
credenziale letto o pubblicato. Causa dimostrata nel codice: il resolver della
main controlla roleKey===manager, mentre il Worker precedente usa il predicate
condiviso dei ruoli web, già comprensivo di pos_admin/courier. Login e principal
li ammettevano, poi il resolver li negava. L'inventario di stringhe RPC non
aveva rilevato questa differenza semantica; il primo giudizio di compatibilità
non copriva il ruolo effettivo. Nessun PASS live globale.

Prima failure e log POS preservati privatamente. Processo POS della task
fermato verificando PID/creationTime/path/window, nessun import eseguito,
trust conservato. Rollback pinned399720d2 eseguito, nuovo deployment
1c2aaf19-ce73-4faa-8ce1-d5ae0c7374ed,100%; identità e pubblico PASS.
Nessuna revoca o modifica di account eseguita come cleanup.

Successore minimo: import e uso di isPosStaffWebAdminRoleKey già esistente,
al posto della costante manager nel solo resolver runtime. Nessun nuovo ruolo,
grant o fallback. Fence token/shop/staff/version/time/status invariati.
Test del modulo reale: manager/pos_admin/courier ammessi sotto la stessa lease,
15casi scope/version/revoca/must-change respinti, cashier/viewer/admin/custom
negati. Rosso pos_admin/courier conservato; insieme alle regressioni esistenti
45/45 PASS. Il loader isola soltanto gli import server non usati del principal
ed esegue il predicate di produzione, senza copiarne la policy nel test.
Typecheck/security/lint locali PASS con lo SKIP esterno Win7POS già descritto.
Qualifica SHA/artefatto e nuovo rollout da eseguire, nessun verde trasferito.

Le sezioni sotto conservano la prima candidata e la qualifica antecedente al live.

## 9 novembre — candidata di compatibilità release in EXECUTION

Main6173964 e Windows e115ebf ricontrollate. Worker399720d2/deployment291c5cb8
ancora attivi. Tool readonly di export usa il normale consumer OAuth Wrangler
in memoria e soltanto GET circoscritti al Worker staging; cinque vettori di
path confinement PASS, timeout e limite32MiB, nessun token/hash credenziale
persistito o stampato. Identità prima/dopo uguale, un modulo11446015byte,
SHA256c7a50bc0328a5c26a5797bc3837def712e38ea60ab405d8727ae0eb8c101ee43.
Questo è l'artefatto servito, non una pretesa equivalenza dello snapshot8ottobre.

Confronto statico delle stringhe contratto nel bundle servito e nei725file
server della main compilata:130 contro128; gli unici nomi presenti solo nel
servito sono s3_v3 (libreria) e staff_web_staff_read_v1. È un discriminante,
non prova automatica di equivalenza semantica. Il caller servito e il decoder
staff sono stati estratti privatamente dal bundle per il recupero mirato.
La main rifiutava questa superficie; distribuirla invariata perderebbe una
correzione TASK140F già online. Nessun deploy eseguito su quella candidata.

Percorso B in qualifica: wrapper RPC esatto già servito, schema Arg tipizzato,
decoder vincolato a shop/actor/session/version,19colonne safe, UUID/timestamp/
enum/conteggi validi,100righe massimo, niente duplicati e ruoli owner-only
validati. Stessi DTO e policy della pagina; overview/members/settings PR144
rimangono senza reader staff. Nessuna nuova capacità DB o grant. RPC remota:
firma uuid/uuid/uuid/text/integer→jsonb, bodyMD5fcdb20fbb3d87cf31e3117ffb1e59ba4,
service_role EXECUTE true, anon/authenticated false. Il corpo riacquisisce e
pubblica la lease nella stessa transazione. Gli altri contratti commerce/
receipt/retire/correction/recovery pertinenti risultano presenti nei metadati;
nessuna assenza dedotta dalla sola migration history.

Rosso di mancata superficie e wrapper preservato;17 nuovi test di positivo,
binding errati, DTO/colonne estranee, overflow/duplicati, denial/errori/assenza
sessione e metadati owner-only PASS. Con overview e HTTP:63/63 PASS.
Ulteriori boundary preesistenti:53/53 PASS. Typecheck iniziale FAIL di tipo
owner-role; annotato il predicate string, nuovo PASS. Security iniziale FAIL
per RPC non registrata: aggiunto soltanto quel nome alla allowlist del modulo
contenuto, coerente col contratto remoto già esistente; nuovo scan PASS
(check Win7POS esterno SKIPPED nella configurazione locale). Lint PASS.

OpenNext Windows: Next build PASS, successivo bundling FAIL EPERM symlink
sharp. Prima failure conservata, nessuna build fallita distribuita, proxy e
patch dipendenze ripristinati. Docker non disponibile sul PATH.
Il workflow Cloudflare esistente produce ora dopo tutti i gate un artefatto
Linux portabile: dry-run Wrangler, bundle/assets, configurazione solo staging
con gli stessi binding/flag, SHA/tree e lock/config/file checksum. Sei test
di configurazione target/service/assets/entrypoint PASS. Nessun nuovo secret,
dipendenza, dispatch CI generico o modifica al deploy TASK150.

Restano da qualificare la SHA esatta, artefatto e compatibilità complessiva,
quindi rollout e prove autenticate. Il Mac coordinatore citato nei documenti
non è leggibile da questo host; la nota PR29 resta l'unico raccordo, senza
aspettare CI mobile per lavoro indipendente. Non è un DONE.

Prima candidata7804c1b: CI42628860727 e Cloudflare42628860692 PASS; artefatto
13679288210, digestZIP55c273cc16c25aba7f20db7343b35ca0e06201d46fd3a551a6572bb6e111c9b0,
57file verificati, merge sintetico6a9f768/albero74d0336 identico alla candidata.
Next16.2.12/OpenNext1.20.2/AWS4.1.0/Workers CLI4.123.0 registrati; lock canonico
invariato. Nessun upload di versioni o deploy remoto.

Gate configurazione: nessun file browser di quella build incorpora l'URL del
progetto e un file conserva la variabile pubblica non risolta. I soli binding
Worker non qualificano le funzionalità browser. Il successore passa ai due
step di build soltanto le due variabili pubbliche repository già esistenti;
target e chiave publishable verificati privatamente contro il progetto
Supabase. Nessuna nuova variabile/chiave o secret put. Packaging rifiuta URL
diverso, assenza di configurazione o chiave secret e registra soltanto il
projectRef e la presenza della configurazione, mai chiave o suo hash.
Nuovi quattro vettori di configurazione: totale mirato73/73 PASS.
Il verde7804 non è trasferito al successore; artefatto precedente conservato.

Le sezioni seguenti conservano il checkpoint dell'8novembre.

## Stato corrente — software integrato, rollout non eseguito

PR144 merge919d100, PR145 mergefdb30f4 e PR146
mergef57afa6c225e628d881d2427bc027a488b2ad452. Codice diagnostica
f3449181100574218f3e927f87dabde66a277d59: CI42525515132 e
Cloudflare42525515054 PASS,1171foundation totali/1157PASS/14SKIP/0FAIL.
Albero merge sintetico2f25ca0134a432f53b32240d14867a6fd7e72a30 identico
al candidato; sorgenti runtime e configurazione prodotto invariati rispetto
a fdb30f4. Il numero PR146 non apre una nuova TASK146 Admin.

Post-merge su f57afa6: [CI42526220441](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/42526220441)
PASS sia database sia Verify; [Cloudflare42526220439](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/42526220439)
PASS. TASK094 staging E2E e deploy staging/production SKIPPED. Nessun dispatch
generico, SQL, secret put o deploy Worker. Le due failure prefix precedenti
restano conservate, causa precisa UNKNOWN; non sono convertite in PASS.

Review software pronta; nessun DONE. Il solo Worker attivo osservato resta
399720d2 del15ottobre. Prossima azione owner Admin: fornire/riconciliare un
albero sorgente immutabile equivalente, inclusa TASK140F e configurazione
build, oppure prova di compatibilità della main completa. Quindi distribuire
l'unità delimitata già autorizzata, con rollback pinned e verifica HTTP/console.
L'assenza di questo legame impedisce di qualificare come sicuro un rilascio
indifferenziato della main. Nessun nuovo permesso generico o nuova credenziale
è richiesto. Coordinamento sulla stessa nota della PR iOS29, ACK ancora PENDING.

Win7POS1823697 invariato: accesso reale PASS, HTTP500 preservato; fix HTTP
non ancora osservabile live. Getnet A/B/C mancanti dopo revisione delle fonti,
target Win7 dichiarato non disponibile. Render sintetici EN/IT a192DPI
osservati separatamente, senza PASS di100/125 o interazione desktop.
Worktree privato: file tracciati puliti prima di questa chiusura documentale;
solo bytecode Python del nuovo test conservato perché la rimozione è stata
rifiutata dallo strumento con blocked by policy. Nessun metodo alternativo.

Le sezioni sotto conservano i checkpoint, con qualifiche attribuite alle
rispettive SHA e prime failure immutate.

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
La CI a quel checkpoint era ancora da eseguire; esiti sul codice esatto sopra,
senza trasferire i verdi dei predecessori.

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
