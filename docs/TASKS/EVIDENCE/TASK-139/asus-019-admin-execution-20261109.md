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
