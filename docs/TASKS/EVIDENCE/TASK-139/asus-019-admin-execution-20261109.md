# ASUS019 — Execution Admin B/C, preparazione senza operatore

Stato: EXECUTION / ACTIVE. Mandato utente del 9 novembre, successivo al piano:
«Stasera non posso essere davanti al PC, fai intanto tutte le altre implementazioni
in maniera efficiente, poi domani mattina faremo insieme ... le verifiche».

Il mandato attiva l'implementazione locale del
[piano B/C](../../../ARCHITECTURE/ASUS019-ADMIN-OPERATIONS-HISTORY-PLAN.md).
Baseline d202332; branch codex/asus019-admin-operations-history in worktree isolato.
TASK139/140 restano chiuse, unica continuazione ASUS-W7POS-019. Non è un nuovo
MasterPlan. Windows5d8e704 e il suo pacchetto qualificato rimangono conservati.

## Confini della sessione senza operatore

Implementazione, migrazioni additive non applicate live, fixture sintetiche e gate
automatici. Nessuna UAC/login manuale/DPI/prova sul registro reale stanotte; nessun
reset1001, modifica di credenziali, grant/RLS live, deploy staging/produzione o
Apply/undo degli originali. B/C non diventano qualificate per una sola build.
I gate di parità/migrazione/convergenza precedono l'attivazione del writer web e
la disattivazione dell'importer locale. C provider mancante rimane tale.

## Sequenza

1. B: identità effettiva, metodo/scope, landing/menu; reader shop session-bound;
   completamento superfici operative e preview dei permessi condivisi.
2. C: parser/corpus equivalente; registro e operazioni storiche dedicate con
   idempotenza/audit; wizard tre passi, lettura/report, migrazione/replica e guard
   di cutover. Una funzione non disponibile resta bloccata, senza fallback aperto.
3. Test mirati durante le patch, gate automatici della candidata e handoff preciso
   per la sessione insieme all'operatore. Nessun DONE autoassegnato.

## Prerequisiti e prove

Next16: lette guide locali Server/Client Components, Mutating Data, Data Security,
Redirecting. Supabase CLI2.109.0 disponibile. Docker e WSL non installati:
replay SQL locale BLOCKED_LOCAL_DATABASE; sblocco con CI Linux isolata o host di
test dedicato, senza installare componenti di sistema durante l'assenza utente.
Risultati, prime failure, file e SHA verranno aggiunti qui dopo i comandi eseguiti.

## Checkpoint B1/B2 — prima verifica automatica

Implementati ruolo reale/metodo di accesso, menu per capability e landing su una
superficie operativa; nuovo reader nominale shop/members/settings con lease SQL,
revalidazione prima di pubblicare, whitelist DTO e nessuna query staff privilegiata
generica. Migrazione additiva non applicata live. Guard owner/platform invariati.
La UI esistente già elenca gli utenti interessati da modifiche al ruolo; nessun
supporto individuale inventato. Reader degli altri domini e C ancora in Execution.

- Typecheck PASS;62 test mirati PASS;security scan con Win7POS esplicito PASS.
- Nuove31 assertion pgTAP preparate, non ancora eseguite: CI isolata richiesta.
- Primo lint FAIL per nome variabile module nel nuovo test; corretto, rerun pendente.
- Prima build FAIL: Turbopack rifiuta junction node_modules esterna alla root.
  Rimozione del solo link rifiutata dallo strumento con blocked by policy; non
  ripetuta. Checkout originale preservato e nuovo checkout con dipendenze fisiche
  per proseguire. Nessun cambio di comportamento prodotto per aggirare la build.
- React: patch server/client separata, DTO minimi, nessun nuovo effetto o dipendenza,
  label accesso distinta dal ruolo e navigazione da capability server. Restano da
  verificare live localizzazione/focus con l'operatore. Nessun PASS live dichiarato.

## Checkpoint B3 — letture audit/POS e riparazione gate

Checkout con dipendenze fisiche, branch codex/asus019-admin-operations-history-physical.
Implementati reader audit lista/dettaglio, POS live e ricavi tramite nuova RPC
nominale staff_web_operations_read_v1. Filtri e colonne chiusi, limiti per gruppo,
shop/attore/sessione/versione vincolati, lease prima e dopo la lettura e audit,
revalidazione applicativa prima della pubblicazione. Nessuna nuova query generica
staff e nessun accesso auth.users. Mapper dei ricavi condiviso con il percorso
personale; esempio sintetico:300 CLP e2 vendite danno ticket medio150 CLP.

B4: corretta la descrizione dei permessi condivisi. I template esistenti operano
sul ruolo; la pagina Ruoli mostra la matrice. Traduzioni IT/ES/ZH aggiunte.
Il set protetto owner/platform e il trattamento server di1001 restano invariati.

Gate locali dopo le correzioni: typecheck, lint e security PASS; suite foundation
1293 test,1291 PASS,0 FAIL,2 SKIP. Nuovi19 test eseguono reader e mapper reali con
fixture; nuovi31 pgTAP operations oltre ai31 profile ancora NOT_RUN SQL.
Build candidata PASS. Nessun SQL/live/deploy eseguito.

Prime failure conservate nei log privati: full foundation1212/1224 con10 FAIL e2
SKIP; riparati test governance che congelavano il vecchio root e parser di risorse
Win7POS non riconosciute. Aggiunti test negativi di registrazione risorse e dominio
coverage. Le57 prove i18n passano. Sette migrazioni storiche congelate avevano
checkout CRLF: ripristinate solo ai byte LF canonici Git, hash attesi invariati,
nessun cambiamento SQL. Le nuove migrazioni rimangono additive.

Residui in Execution: device/mobile-history/sync staff, domini C0–C5 e relativi
gate. La candidata non completa questi residui né qualifica l'esperienza live.

## Checkpoint B3 — dispositivo, storico mobile e sync

Aggiunto reader nominale staff_web_mobile_operations_read_v1 per dispositivi,
lista/dettaglio storico mobile e sync. Riusa admin_sync_event_read_v1 e il parser
applicativo già esistente: scope legacy solo dal mapping verificato del server,
colonne/filtri limitati, pagine massime200 e budget risposta4 MB. Fonte non
risolta rimane unmapped; dati troppo grandi richiedono una pagina minore e non
vengono troncati silenziosamente. Mapper e analisi sessioni esistenti condivisi,
conteggi esatti e dettaglio autorizzato nello stesso scope. Nessun dato Getnet in
questo dominio. Aggiunti19 test funzionali e25 pgTAP da eseguire in CI.

Foundation1312:1310 PASS,0 FAIL,2 SKIP;38 prove funzionali sulle nuove superfici
PASS. Security PASS. Prime failure mobile: remote_id era erroneamente verificato
come UUID; corretto per mantenere gli identificativi testuali canonici.

PR149 in bozza. CI8e077af: Verify e Cloudflare build PASS; replay applica le due
migrazioni byte esatte e conserva i contratti precedenti, ma pgTAP FAIL. Aggiunta
proiezione chiusa di file/righe/categorie, senza output SQL o valori attesi/reali.
CIc05dced conferma CHECK_CONSTRAINT nel test profile:riga69. La fixture impostava
revoked senza revoked_at; corretta rispettando il vincolo esistente, senza
modificare schema o autorizzazione. Nessun PASS SQL anticipato. I run e le prime
failure sono conservati; staging E2E resta skipped su evento PR, nessun deploy.

Typecheck, lint e build della tranche mobile/device: PASS. Nessuna prova live attribuita.


## Checkpoint C0 — parser portato e oracolo CLR indipendente

Nuovo dominio payment-history separato dal catalogo/storico mobile. Lettura ZIP e
XML streaming, limiti dichiarati, rifiuto path duplicati/traversal, contenuti attivi,
relazioni esterne, DTD, formule, ordine celle/righe non valido e UTF malformato.
Nessun numero binario per CLP: BigInt interno, stringhe decimali nelle DTO. Identità
leading-zero, annullamenti con segno, respinte separate e netto unknown conservati;
timestamp a100ns senza timezone del PC. Overflow aggregato produce totali unknown e
impedisce preparazione. La preparazione parser non equivale ad autorizzazione Apply.

Copiati corpus e due XLSX sintetici byte esatti con manifest Windows. Eseguito un
oracolo CLR net48/x86 che richiama il vero HistoricalSalesImportAnalyzer dagli
assembly del pacchetto QA5d8e704. Snapshot normalizzati e hash assembly conservati
nelle fixture, senza percorsi/dati reali. Confronto di tutti i campi dei movimenti,
respinte e summary nelle tre interpretazioni temporali PASS.36 prove parser PASS.
Il profilo Windows e gli originali non sono stati aperti/modificati da questa prova.

Aggiunta dipendenza saxes6.0.0 bloccata e xmlchars transitive per parsing XML
streaming rigoroso; nessun install script autorizzato globalmente. Lockfile cambia
solo per questi due pacchetti. Audit production: i due pacchetti nuovi non segnalati;
5 advisory su dipendenze già presenti nella closure production (1moderate,3high,1critical) da
mantenere visibili e valutare, senza npm audit fix indiscriminato.
Fonte API: https://github.com/lddubeau/saxes (repository archiviato; versione pinned).

Benchmark sintetico parser, non dedup/ledger/job end-to-end:10k507ms/166MiB peakRSS;
100k4692ms/394MiB;100k identità ripetute4773ms/394MiB. PASS dei conteggi/importi
letterali; nessuna promessa p95 cloud. Il parser non deve essere eseguito dentro
il Worker HTTP Admin: Workers limita ogni isolate a128MB (documentazione ufficiale
https://developers.cloudflare.com/workers/platform/limits/, verificata10novembre).
C2 richiede processo/worker dedicato bounded o una variante streaming fino allo
staging DB; nessun nuovo servizio live è stato creato. Budget Node proposto1GiB,
concorrenza1; prova dell'intero worker ancora da implementare/eseguire.
Web:10file/20MiB/100MiB job, worksheet XML32MiB (Windows128MiB), stessi limiti
righe/celle/strings. Capacità più bassa esplicita, senza cambi economici silenziosi.
C1–C5 restano in Execution, writer cloud spento e importer Windows invariato.

C0 dopo gli ultimi fix: typecheck/lint/build/security PASS; foundation1348 test,
1346 PASS,0 FAIL,2 SKIP.36 parser PASS, inclusi UTF16 e overflow summary unknown.
Prima failure UTF16 era una mutazione fixture senza dichiarazione encoding: corretta
aggiungendo una dichiarazione esplicita nel solo ZIP in memoria. Fonte e hash dei
file canonici invariati. Oracolo riproducibile in tools/PaymentHistoryClrOracle.

## Gate B SQL chiuso sulla candidata d2de24a

CI42747737445: Database migrations and pgTAP PASS, Verify PASS; Cloudflare build
42747737131 PASS. Le tre migrazioni aggiuntive sono applicate byte esatte nel
replay isolato e il gate controlla che i contratti precedenti restino invariati.
Staging E2E skipped per evento PR, nessun deploy o applicazione SQL live.
Fixture inizialmente scorrette corrette rispettando i vincoli già presenti:
revoked_at per sessione revocata; shop non attivo con stato valido; remote_id
canonico lower/UUID per evento atomico; source unmapped con owner conservato.
Le prime failure dei run42741667088/42742080558/42743059586/42744052484/
42745544635/42746667539 rimangono conservate. Nessuna guard rimossa per il PASS.
Questo PASS riguarda B; non viene trasferito al futuro codice C o alla prova live.

Artifact13732536171 complete.json: 70 file pgTAP, 4462 assertion PASS; replay byte esatto true.

## C1–C5 in ramo successivo

B/C0 congelati per review in PR149, head4a8d77a. La continuazione C1–C5 usa il
ramo codex/asus019-cloud-payment-history dallo stesso checkout isolato, senza
aggiungere modifiche al pacchetto Windows5d8e704. Base della futura PR:
codex/asus019-admin-operations-history-physical. Unico task ASUS019 in Execution.
Il nuovo ramo non dichiara gate propri prima dei comandi effettivi.


## C1 — ledger e transazioni, candidata da verificare

C0 head4a8d77a: CI42748533266 e Cloudflare42748533370 SUCCESS, nessun deploy.
Nuovo ledger additivo separato da vendite native/stock/outbox: upload immutabili,
prove versionate, alias/canonical merchant, staging fenced, batch/versioni,
osservazioni duplicate senza trasferimento ownership, ricevute e revisioni.
Runtime nasce con writer local; nessuna attivazione web automatica. RPC chiuse
con sessione personale corrente oppure lease staff ricontrollata nella transazione
e deadline prima del publish. Configurazione grant/prove riservata al legal owner;
full_access staff non promuove prove provider né cambia i grant del ruolo.
Commit idempotente vincolato a shop/actor/key/digest e review revision/epoch;
undo produce solo tombstone dei movimenti posseduti dal batch. Nessuna Apply reale.

22 prove planner PASS. Nuovo oracolo CLR eseguito dagli assembly qualificati5d:
identità alias, tick100ns e fingerprint economici dei cinque movimenti sintetici
uguali al web. Prima failure ha evidenziato digest non legato alla posizione
sorgente: corretto includendo payload completo, binding e correzioni. Failure
fixture cross-realm corretta normalizzando l'array, valori attesi invariati.
Typecheck PASS.46 pgTAP aggiunti al replay byte-esatto; SQL non ancora qualificato.
Worker/UI/migrazione/replica/cutover rimangono in implementazione nella stessa
Execution; tutte le verifiche desktop rimandate alla presenza dell'utente.

C1 CI42752287697: Verify PASS, SQL migration applicata ma pgTAP FAIL; prima
receipt conservata. Il controllo RLS considerava anche gli indici, che non sono
tabelle: corretto filtrando relkind=r, senza cambiare policy. Diagnostica estesa
alle sole assertion number del reporter compatto pg_prove. Nuovo upload in due
fasi: browser uploaded non significa verified; checksum in worker con lease/fence.
Operatore import può attestare mapping/CLP/primo uso; grant ruolo e verifica
provider documentata rimangono protetti owner-only. Nessuna promozione automatica.


## C2 — UI e worker dedicato, nuova candidata

C1 head63671a6: CI42753236951 Database/Verify PASS, Cloudflare42753236956
SUCCESS.47 nuove assertion SQL oltre ai test precedenti, nessuna azione live.
La nuova candidata amplia a66 le prove SQL: doppio export nuovi=0, ownership
invariata, undo duplicate-only=0, sessione personale/RLS/scadenza/profilo
disabilitato, ripresa sotto login fresco con invalidazione review precedente.
Digest review ora include actor/session/version; replay da rieseguire su questo head.

Workbench tre passaggi /shop/payment-history, menu derivato dalla capability
finanziaria effettiva, IT/ES/EN/ZH, tastiera e focus. Upload firmato privato,
checksum in worker Node separato, job fenced, status, preview prove persistite,
commit singolo e lookup receipt dopo incertezza. Moderni irrisolti conservano
entrambi gli intervalli e merchant metadata, zero candidati finanziari staged.
Nomi simili non fondono canonical merchant; grant e verifica provider protetti.
Reader paginato e download della sola pagina; undo solo esplicito del batch.

21 test boundary/API e10 worker PASS;95 mirati complessivi PASS includono parser,
planner e contratti security/i18n.8 Playwright component PASS con React DOM/HTTP
intercettato e dati sintetici: non una sessione Admin autenticata E2E. Primo test
reload fallito perché la fixture sovrascriveva lo stato ad ogni apertura: fix della
fixture, receipt originale riusata senza secondo Apply. Successivo recupero URL
PASS, nessun uso di persistenza browser. Copie e label IT/ES/ZH e axe critical PASS.

Security prima FAIL per import client da percorso server: regole temporali pure
spostate nel modulo lib condiviso, server reexport e corpus immutati. Security
PASS successivo. Foundation completa iniziale1401:1391 PASS/3 FAIL/7 SKIP: guard
server-boundary già corretto, storage browser eliminato senza eccezioni al guard,
metadata localizzata aggiunta.95 mirati PASS successivi; completa da rieseguire
sul tree congelato. Typecheck e lint PASS; build precedente PASS, nuova build
dopo recupero URL ancora da eseguire. Worker bundle costruito con toolchain
locked993223byte; nessuna nuova dipendenza/provisioning/deploy/SQL live.

C3–C5 restano in implementazione. Creato worktree Windows isolato dal commit
0378e17; nessuna modifica al candidato5d8e704, all'installato a8286c6 o al profilo.
Nessuna installazione/UAC/accesso operatore questa notte.

## C3–C5 — trasferimento e replica, checkpoint non distribuito

C2 head1bc98c7: Verify/Database CI42756837014 SUCCESS. Suite completa1401:
1394 PASS,0 FAIL,7 SKIP; security/typecheck/lint/build PASS. Gli8 component test
non sostituiscono E2E autenticato. Candidate Windows5d e profilo reale invariati.

Continuazione isolata codex/asus019-history-replica-cutover. Export Windows
prodotto da backup SQLite verificato,7 NDJSON e manifest, soli valori string/null,
ricevute originali intatte, shop/device/dataset/revision/restore epoch e checksum.
5 prove Data/Core sintetiche PASS; build WPF net48/x86 PASS. Non è il pacchetto5d.
Il reader web ha15 prove PASS sul vero export del prodotto e fingerprint CLR.
Worker migrazione e gateway firmato17 PASS; nessuna chiave service-role nel
processo di parsing, solo operazioni analitiche/replay sicuro e download dei claim.

Migrazione SQL additiva20261110044957: trasferimento solo dopo freeze e ack POS
che lega manifest/archive/backup SHA; mapping esplicito per scope; dati e ricevute
locali conservati come legacy_attested, nessuna promozione a prova provider.
Identità globali distinte dagli ID locali, ownership e tombstone conservati,
stesso export nuovi=0.59 pgTAP sintetici preparati: SQL ancora NOT_RUN finché il
replay CI non termina. Replica dedicata con snapshot/cursori/checksum/revisioni,
gate inventario completo e convergenza; default locale, rollback congelato senza
ritorno automatico al writer locale. HTTP/UI migrazione e client replica ancora
in implementazione: nessuna dichiarazione di parità/consegna C3–C5.

Typecheck/lint PASS. Foundation1433:1426 PASS,0 FAIL,7 SKIP. Security scan PASS,
controllo esterno Win7 saltato per il vecchio percorso Mac: da rieseguire col
percorso Windows esplicito. Build candidata successiva ancora da eseguire.
Il controllo provider ora usa la capability finanziaria migrate; cambiare grant
condivisi resta owner-only. Mancanza documento verificato non aggirabile da1001,
badge o colonna Z. Nessun SQL/deploy/import/UAC live questa notte.

Checkpoint successivo: security con WIN7POS_REPO_PATH=C:/Dev/Win7POS PASS,
nessun controllo esterno saltato. Build Next PASS. Bundle Node costruito con
guard che esclude Supabase SDK, admin client e gateway privilegiato dal processo
parser. Prove SQL59 ancora NOT_RUN; integrazione API/UI/client ancora aperta.

## C3–C5 — checkpoint SQL35f3312 qualificato, integrazione successiva attiva

Draft PR151, base PR150. Migrazione additiva20261110044957 congelata con SHA
a943f661433e4b67db8924ee35277c4d75ecb2edd54442add0ad24b6ec49ffe9.
CI42770536504 Verify/Database SUCCESS, Cloudflare42770536548 SUCCESS. Replay
72file/4587 assertion PASS,59 nuove; operatori precedenti byte-exact e contratti
runtime esistenti preservati. Artifact13741906708: merge284950b, treef4b9a9a
identico al branch35f33121bfb6e1e3c403693414e72e71786cfe13. Nessun deploy.

FAIL42767754085/42769038477/42769748015 conservati. Creazione del migration
worker fermata alla condizione CASE: aggiunte parentesi esplicite, poi replay
PASS. Diagnostica estesa solo a numeri di statement/linea, SQLSTATE e categorie
chiuse; primo file diagnostico non incluso nell'artefatto, whitelist CI corretta.
Nessun output SQL grezzo, valore bancario o segreto pubblicato per il debug.

Ramo Windows isolato:15 prove Core/Data PASS su export/recupero/replica/report,
build WPF net48/x86 PASS senza warning, dialog standards39/39 PASS. Cache cloud
pubblicata atomicamente, report usa una sola origine storica, vecchio registro
conservato, annullamento propagato, rollback non rivela di nuovo i vecchi totali.
Grant locale fresco con scadenza monotona per ogni nuovo Apply/Undo, nessuna
scrittura offline; originale receipt replay resta consultabile. Export congelato
recuperabile con verifica integrale dei file e ack device. UI IT/ES/EN/ZH nel
dialog esistente, nessun avvio nativo questa notte. Suite Core completa in corso.

API device e trasferimento, wizard migrazione e pannello inventario/cutover in
implementazione sopra35f3312: typecheck iniziale PASS, test boundary/UI ancora
da eseguire. Follow-up SQL20261110070629 separato dal precedente congelato:
totali del solo nuovo import nella review e reader nominato per i nomi POS.
Questa tranche successiva non eredita i PASS SQL/CI del checkpoint35f3312.

## Integrazione HTTP/UI, candidata successiva in verifica

Endpoint POS dedicato usa lease attuale, token verificati, soli hash nel named
RPC e proiezione chiusa. Endpoint migrazione/cutover deriva actor/shop dalla
sessione e rivalida migrate prima della pubblicazione.22 nuove prove boundary
PASS, incluse revoca, scope, DTO espanso, operazioni finanziarie negate al device
e importi Int64 stringa. Typecheck PASS, lint senza errori (un warning corretto).

Wizard trasferimento e pannello postazioni IT/ES/EN/ZH, recupero URL con soli UUID,
conferma singola e receipt lookup dopo incertezza. Inventario non preattestato,
nomi fisici da reader nominato, attivazione disabilitata salvo gate server vero.
Primo component run17:16 PASS/1 TIMEOUT, selettore getByLabel exact del combo;
nome accessibile corretto nel DOM, fixture aggiornata a getByRole combobox.
Nessuna riduzione degli assert di cutover; nuovo run da eseguire.

Follow-up SQL20261110070629 con7 nuove assertion reader; review precedente
estesa con5 assertion sui nuovi totali. Attesi73file/4599 assertion, ancora
NOT_RUN su questa candidata. Frontend/SQL nuovi non distribuiti.

Windows futuro commit1ccc5b23b65fd1924889e5cd097ca578d18618df: suite Local
autorizzata avviata, esito ancora aperto. Pacchetto5d, installato a828 e registro
reale conservati. Non avviare UAC/POS/desktop finché l'utente non torna disponibile.

## Candidata Admin f11cff7 — controlli automatici PASS, rollout non eseguito

Codicef11cff71ade1f0ca3a6edcfc5398ab42e01ff829, draft PR151 sopra PR150.
CI42780343982 Verify/Database SUCCESS, Cloudflare42780344070 SUCCESS;
TASK094 live e deploy staging/produzione SKIPPED. Artefatto SQL13745323726:
73file/4599 assertion PASS, operatorSQLByteExactReplay=true. Merge testata
027ffcebc2742c1974b00020cdad15aa0c9faff6, tree
ae37831a45bb5af068a4106d24959a1948f29029 identico al branchf11cff7.
Il pacchetto Worker HTTP13746121265 è conservato in CI, non distribuito.

CI foundation1410:1396 PASS/0 FAIL/14 SKIP per prerequisiti esterni;
UI smoke48, pairing2, storico17 PASS. La verifica locale contro il client Windows
futuro esegue anche i test esterni:1460test,1458 PASS/0 FAIL/2 SKIP, typecheck/lint
PASS. Security con WIN7POS_REPO_PATH esplicito PASS senza salti esterni. Ultima
rifinitura copy cutover:9 browser component PASS, typecheck PASS, poi CI completa
f11cff7 verde. Sono component test sintetici/intercettati, non sessioni live.

Failure6581445 conservata: SQL73/4599 PASS, Verify/Cloudflare fermati dal guard
statico che non elencava il nuovo endpoint POS. Registrato soltanto il percorso
esatto, nessun wildcard; boundary test negativi invariati. Successore18d1639
Verify/Database/Cloudflare PASS. Primo run locale sul nuovo Win7POS:2 FAIL del
verificatore i18n, che ammetteva soltanto i cinque stati report precedenti;
ora accetta esattamente le due generazioni approvate, richiede entrambe le
traduzioni cloud e continua a negare domini parziali o sconosciuti.57 i18n PASS,
compresi compatibilità col client qualificato e rifiuto di traduzione cloud mancante.

Worker: ogni tentativo HTTP è limitato a15s, corpo risposta8MiB, due tentativi
massimi con lo stesso request UUID; cancellazione o risposta sovradimensionata
non ripetono il claim.22 prove worker/gateway PASS, incluse attesa indefinita di
header/body e perdita della risposta. Bundle Node finale costruito senza SDK o
client DB privilegiato, SHAd573775bd1f6e695339f287268a39abab6f1112767300d16eaa9c58e84f4b1c5.
Host Node/limite container/chiave HMAC non provisionati: nessun worker cloud attivo.

## Ripresa con operatore e gate ancora aperti

1. Consegna A resta sul codice qualificato5d8e704, distinta dai rami cloud futuri.
   Installato a8286c6 ancora verificato per hash, POS installato non in esecuzione,
   main Windows0378e17 pulita. Al rientro: nuovo preimage/backup verificato e nuovo
   tentativo installer02; consenso UAC dell'utente, avvio quotidiano dal collegamento,
   PIN mascherato, shell/riepilogo, storico volontario e ritorno con sessione viva.
   Conservare l'unica ricevuta/batch legacy; nessun retry Apply/Undo per testare UI.
   Concludere DPI100/125/200 sul candidato effettivamente installato; Win7 fisico e
   periferiche restano NOT_RUN/BLOCKED_TARGET.
2. B/C sono implementati nei rami in bozza, non serviti. Prima di prove autenticate:
   review dell'unità staging, migrazioni additive/versioni/ACL/preimage/rollback
   espliciti e dataset sintetico distinto dal negozio reale. Nessun recupero1001 o
   modifica dei grant per far passare una pagina. Reader/capability/menu/revoca
   reali restano NOT_RUN fino alla sessione sulla versione effettivamente servita.
3. C end-to-end richiede l'host Node24 separato, limite1GiB/concorrenza1, gateway
   HTTPS e segreto HMAC tramite secret store. La build del worker non prova il suo
   provisioning. Misurare job+DB+replica10k/100k, duplicati100%, p50/p95/memoria/egress
   sull'ambiente scelto; i benchmark parser precedenti non qualificano quel gate.
   Nessuna promessa di tempi/costi cloud è dedotta dai test locali.
4. Prima di qualsiasi cutover reale: inventario fisico completo con fonti, client
   aggiornati o ritiro verificato, freeze/drain, export/backup autenticati di ogni
   POS, mapping e riconciliazione, stessa replica/revisione/checksum su tutti i
   device e annullamento propagato su fixture. Un vecchio POS non disponibile
   resta irrisolto; nessuna autoattestazione o doppio writer. Rollback congela,
   riconcilia e conserva i dati; non riapre automaticamente l'import locale.
5. Prova provider C dei moderni ancora MISSING; CSV BLOCKED_INPUT. Nessuna richiesta
   ripetuta all'utente e nessuna promozione di una colonna Z a prova provider.

Windows futuro PR135: Core/Data1760 PASS e build net48/x86 PASS sul codice1ccc5b2;
prima CI42777264224 FAIL conservata, fixture/grant e guard0016 corretti nella
successiva cc23a65. Qualifica completa del successore ancora in corso, nessun
PASS trasferito e nessun pacchetto/installazione futura prodotto. Questa è la
stessa Execution ASUS019 ACTIVE; non DONE, senza accettazione utente.

## Ricevuta finale automatica del client futuro9d47f28

Codice Windows9d47f28b647af7fc8a4715733fa8d0821339a101 congelato nel draft135.
CI42785561851 e Security42785562194 SUCCESS. Artefatto13750491209 scaricato e
SHA ZIPded5fc01ee27d287c28dbce38a77842ccd6adc653320c70d25697199afa802c8 verificato.
Report sourceSha9d47f28,15/15 passi canonici PASS; functional22/22, foundation
5case/37assertion, smoke8case/52assertion in49836ms, load11assertion PASS.
measurementCompleted/environmentValid/thresholdsPassed tutti true. Nessun
FAIL/TIMEOUT/NOT_RUN nei15passi della nuova ricevuta. Core/Data e selftest PASS;
Local precedente1760/1760 resta riferita al codice1ccc5b2, senza attribuire al
successore conteggi non pubblicati dalla ricevuta CI.

Il checkpoint standalone WPF42783064279/cc23a65 aveva già22functional PASS.
Nella fixture storica il manager con permessi espliciti conserva i test di
revoca del singolo permesso; il percorso HTTP/geometry continua a usare pos_admin.
Il primo42777264224 FAIL e i run superseduti/cancellati sono conservati. Nessun
budget aumentato, assert rimosso o negativo trasformato in skip.

Il ramo Windows resta sul codice esatto qualificato9d47f28. I checkpoint della
CLOUD-CONTINUATION.md e la descrizione PR135 sono collegati a questa ricevuta
finale nel registro canonico condiviso, evitando un nuovo commit codice dopo
la qualifica. Nessun nuovo installer Release Pack creato o installato. I report
CI e il precedente artefatto standalone WPF non sono la consegna prodotto5d.

Stato finale di questa sessione: implementazioni B/C disponibili in bozza con
controlli automatici sopra eseguiti; ambiente/E2E cloud autenticato, prestazioni
sull'host scelto, inventario fisico/cutover e accettazione rimangono gate aperti.
Consegna A5d, installato a828, profilo e ricevuta legacy conservati. Nessuna
azione UAC/POS/login/DPI/live durante l'assenza dell'operatore. Unica ASUS019
ACTIVE; la sessione manuale riprende dal punto1 della procedura precedente.

## Review10novembre — quattro correzioni, stessa Execution

Draft135 Windows: commit247d6f4, retention pubblicato + massimo3 trasferimenti
recuperabili per55minuti, pulizia atomica di copie scadute/incompatibili. Delta
vuoto senza clone, delta modificato materializzato alla prima pagina non vuota;
checksum/count e CAS conservati, con barriera alla regressione di revisione.
HistoricalReplicaTests10/10 PASS. Nuova CI42819603512 in corso; Security42819603578
SUCCESS. Nessun installer del client cloud futuro.

Draft151 Admin corregge il rifiuto definitivo dell'Apply: solo40001 restituito
dalla RPC Apply porta il marker chiuso outcome=rejected. Il browser ritira quella
chiave URL, invalida il review e consente nuova revisione; errori di trasporto,
receipt nulla e revoca/errore DTO dopo la RPC restano incerti e conservano la
stessa chiave. Test29 boundary/HTTP PASS,11 browser PASS inclusi reload, risposta
persa, rifiuto e403 ambiguo. Nessun import reale per verificare questa correzione.

Migrazione additiva20261110124034: il worker personale richiede profilo active e
disabled_at nullo, bloccando in SHARE sessione/membership/shop/profilo durante
claim/stage/finish. Il commit finanziario aveva già il controllo indipendente
del profilo: questo difetto riguardava l'analisi worker, non un bypass dimostrato
del commit. La revoca membership reale passa da revokePlatformShopMember alla
RPC platform_revoke_shop_member (membership_status=suspended); la sessione può
scadere tramite not_after. Non è stato trovato nel repository un percorso che
elimini automaticamente auth.sessions quando cambia profiles. Il vincolo schema
impone disabled+disabled_at insieme; la fixture prova review/null e
disabled/timestamp con sessione/membership valide, più revoche indipendenti.

GC server interna: solo snapshot, righe snapshot e cursori temporanei scaduti;
budget massimo5000 cursori/righe per chiamata, discovery64 candidati/8device,
massimo8 metadata per device, SKIP LOCKED e fence advisory condiviso col
percorso device. Un cursore non scaduto protegge anche righe con metadata scaduta.
Tre snapshot e32 radici pendenti per device danno backpressure, senza espellere
trasferimenti attivi; delta_start identico riusa la radice viva. Claim worker
autenticati eseguono la manutenzione anche quando non arriva nuovo lavoro.
Nessuna pulizia di ledger/eventi/provenienza/ricevute/ack permanenti.

Nuova fixture SQL sintetica rollback-only39 assertion, registro CI/checksum
aggiornato senza modificare migrazioni già qualificate. Replay Linux CI ancora
PENDING (Docker/WSL assenti localmente). Foundation locale1460PASS/7SKIP; nuovo
controllo typecheck/lint/security tutti exit0. I PASS SQL73/4599 precedenti restano
riferiti al vecchio head; nessuna attribuzione automatica alla correzione.

## Consegna A — installazione effettiva10novembre

La richiesta utente «Riaprimi la finestra UAC» ha riattivato solo l'installer
già qualificato5d8e704. Setup SHA54e087cc3cf7e04b6ef7e26921a148290ec7431c0d0f3a164c4e58b3509fe044
ricontrollato prima dell'avvio; log Installation process succeeded, nessun reboot.
Confronto diretto con lo ZIP prodotto8912fbfb...:41/41 file installati identici,
EXE02cdff8d0c11e223f3541df87e5e5b40cfdfc7e8e0fef7fc6221be65189ed95d.
Dieci file del profilo invariati prima/dopo, nessun processo POS avviato.
Ricevuta privata installer-5d8e704-20261110T095735.final.private.json.
I confronti diagnostici iniziali con manifest QA e manifest normalizzato sono
conservati: sei file solo-QA e VERSION normalizzato non descrivevano il payload
installato; la verifica finale usa tutti i byte dello ZIP prodotto qualificato.

Accesso ordinario, shell/riepilogo/storico/ritorno con operatore restano NOT_RUN
sull'installato5d; targetWin7/periferiche indisponibili, provaC moderna MISSING,
CSV BLOCKED_INPUT, E2E cloud autenticato e host reale ancora aperti.
Nessun DONE, merge, deploy, SQL live o Apply/Undo degli originali.
