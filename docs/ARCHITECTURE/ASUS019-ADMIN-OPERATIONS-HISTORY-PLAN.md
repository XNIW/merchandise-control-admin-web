# ASUS019 — controllo operativo Admin e futuro storico web

## Addendum 12 novembre — PUT e importazione utilizzabile

Stessa Execution ACTIVE. Diagnostico PR153/main7d94271 pubblicato1a7c6e27:
osservazione naturale della stessa baseline503 in put_storage_source, TypeError.
Nel runtime workerd il trasporto di prodotto con redirect:error fallisce prima
dell'invio. Il successore manual rifiuta tutti i3xx senza inoltro; test locale
con byte sintetici, target posseduto, status2xx/3xx/4xx/5xx e AbortSignal.
RED originale conservato, finale foundation1654PASS/0FAIL/7SKIP, security,
typecheck e lint mirato PASS. Gate remoti e rollout successore NOT_RUN.
Nessun DDL, rebuild Windows, indebolimento del controllo origine o cambio chiave.
La causa degli arresti Node resta da isolare separatamente.

Sequenza richiesta: riconciliare originali/ledger/filtro/replica senza doppioni;
guidare scegli/verifica/conferma/risultato con stato per operazione e generation
fence; riusare soltanto prove qualificate, applicabili e non revocate; separare
declined da errori parser, calendario da copertura provata e netto di regolamento
da vendite. Gestione tecnica nella sede Master, con autorizzazione server e
audit; import e consultazione POS rimangono disponibili. Prima di estendere
writer web verificare l'adapter draft/review/commit esistente. Getnet C mancante:
preview consentita, nessun apply moderno finché non esiste prova temporale valida.
Ogni successore deve avere propri gate, pacchetto e verifica dell'installato.

La consegna corrente segue l'ultimo addendum di convergenza: cassa quotidiana e
storico bilaterale. I precedenti riferimenti agli altri domini restano inventario
storico e non ampliano questa Execution.

## Addendum 10 novembre — pubblicazione automatica dei commit POS

Chiarimento successivo: verifica bilaterale di tutti i domini commerciali
condivisi (prodotti, prezzi/storia, categorie/fornitori, import, immagini, stock,
vendite/reso/void, ordini, storico e sole configurazioni condivise previste).
La matrice unica con writer/outbox/endpoint/ACK/feed/apply/conflitto/vista è in
`Win7POS/docs/plans/ASUS-W7POS-019_GETNET_HISTORY/CLOUD-CONTINUATION.md`, ramo135.
Nessuna seconda implementazione concorrente del protocollo: questo documento e
quella matrice sono il raccordo ASUS/coordinatore Mac della stessa task.

Verifiche già lette: il POS usa lane indipendenti; il pull articolo conserva
shadow/base e intento locale. Le due descrizioni obsolete sono corrette nei
documenti Windows. Le categorie/fornitori non hanno un CRUD POS autonomo nei
repository letti: selezione di riferimenti e creazione via import vanno verificati
distintamente. L'outbox vendite non dimostra una replica dei registri di tutte le
casse: il contratto di consultazione Windows è un gap separato da inventariare.
Non introdurre nuovi writer o code generiche senza un'operazione prodotto reale.

Nuovi percorsi bilaterali autenticati, assenza di eco/pull prima dell'ACK,
conflitti, tombstone/Undo/reso e convergenza con schermata già aperta: NOT_RUN.
UI250ms e latenza di convergenza sono budget distinti. Nessun risultato Windows
attesta iOS/Android; il contratto confluirà nell'handoff TASK146 già esistente.

Stessa ASUS019 EXECUTION / ACTIVE. Baseline PR151 43f668df (codice precedente
6c2bd414 qualificato), PR135 fbdde199; PR136 f87dd7c resta consegna separata.
Gap verificato: ledger Apply/Undo locale senza outbox storica; export/freeze_ack
senza ingestione dei fatti; snapshot/delta solo server→POS. Nuovi gate NOT_RUN.

| Autorità | Nuove mutazioni POS | Nuove mutazioni Admin | Trasferimento |
|---|---|---|---|
| local | solo grant vigente, vincolato al contenuto | nessuna economica concorrente | pubblicazione dei commit e lettura |
| frozen | bloccate | bloccate | drain delimitato, migrazione, riconciliazione |
| web | bloccate | permessi server | replica automatica ai POS |

Contratto coordinato con CLOUD-CONTINUATION.md di PR135: protocollo dedicato
con outbox SQLite atomica, operation ID/dataset/device/restore e writer epoch,
sequenza e digest immutabile. Il server conserva prova di autorizzazione
vincolata prima della mutazione. Nuova mutazione, prima consegna tardiva e replay
acquisito sono distinti: ACK perso recupera la stessa ricevuta; prima consegna
senza prova ammissibile richiede riconciliazione. Autenticazione corrente e tenant
fence obbligatori; timestamp client e codice staff non conferiscono autorità.

Riutilizzare ledger/replica/worker esistenti, nessun database cloud aggiuntivo.
Migrazione frozen da backup verificato distinta dal traffico incrementale.
Ingestione idempotente con ricevute e ownership, undo/correzioni espliciti;
cutover subordinato anche a outbox drenata, esiti certi e tutti i device presenti.
Consultazione con movimenti/periodi/provenienza e aggregati globali, una fonte
canonica per evitare doppioni. Conservazione manifest/NDJSON distinta da XLSX.

Implementazione, test isolati e harness autenticato prima del rollout; worker
non provisionato e API/schema/bucket/gateway effettivi restano gate operativi.
Non si trasferiscono PASS da 6c2bd414 al nuovo delta. Nessun deploy, SQL linked,
cutover o modifica del lotto reale. UI200%, Win7 fisico e prova C restano separati.

<!-- ASUS019_COMPOSED_CURRENT_START -->
## Stato corrente — 20261112T205249Z, stessa ASUS-W7POS-019 ACTIVE

| Ambito | Prova e risultato corrente |
| --- | --- |
| Requisito ordinario | Autorizzazione POS e PIN Minimondo senza scadenza, come richiesto esplicitamente. Il modello negoziato `persistent-pos-v1` salva autorità DPAPI v6 con testimone HKCU persistente indipendente dal backup. PIN, binding, generazione, versione, tentativi e revoche note restano verificati. Nessuna licenza futura introdotta; vecchie ricevute v1–v5 restano bounded. |
| Installato reale | 248e689, EXE SHAdec0d531 e profilo Minimondo corretti. Primo login online PASS: grant v6 persistent-pos-v1 e testimone HKCU presenti, nessuna scadenza ordinaria; PIN server senza scadenza/versione1. Carrello vuoto e barcode disponibili. Menu→riepilogo→Escape→carrello PASS, input non inviato conservato/selezionato e poi rimosso. Chiusura ordinaria e secondo processo8576 dalle20:26Z PASS con nuovo normale login online e grant v6 permanente. Nessuna credenziale automatizzata; riapertura offline reale distinta e NOT_RUN. |
| Windows248 qualificato | PR138, 248e6891dcab5ce086c36b0fbec1c66ffb487344. All43248176976 PASS16/16, artifact13960748887/SHA2f2c9486 verificato8entry; Security43248176453 PASS; Release43248317257 verificata41file/110checksum, setup15f1e9f2/payloadccfc0b7f. QA43248326349 verificata40file,34comuni esatti. MainWindow dal bundle esatto PASS29205.7167ms, cleanup naturale. Core46/46, smoke WPF bounded/permanente e processi CLR distinti, statico/dialog PASS. |
| ASUS sul payload esatto | Integrated12 PASS740.778s e Final60 PASS3606.695s: tutti tre flag misura/ambiente/stabilità validi, exit0 e cleanup naturale. UI p95 Rows115.415ms/Grid117.887ms, massimi255.563/165.290ms; limiti preregistrati p95≤250ms e massimo≤1000ms invariati. Crescita managed massima1.545MB sotto8MiB. Budget SHA63970e30,41file prodotto e34comuni QA esatti. Non è una qualifica Win7 fisico o periferiche. |
| Merge Windows | PR138 unita normalmente in92dff410e241e5ee7c2a42a82ef4615b624537d5; albero8ae8b6bd identico248. Postmerge Security43272055077 PASS; CI43272054951 FAIL15PASS/1FAIL nello HIST_LOAD_50K. Artifact13970438026/SHA0e3672dc e8entry verificati: measurementCompleted=false per2campioni dispatcher e1memoria persi; environmentValid/thresholdsPassed=true, tutti gli altri assertLoadPASS. Nessun rerun automatico né soglia ridotta. Release43272054924 PASS, download canonico41file/110checksum (main setup6ec6394f, non installato); cassa selezionata248 con le proprie qualifichePASS, distinto dal residuo della misura storica. |
| Server qualificato | b091325, PR152 unita normalmente in5ff8577; albero b5058dd2 identico al candidato e al virtual merge956176f. Verify/CF propri43251761879/881 e main43258018081/735 PASS. Artifact58file/lock/config e replay97file/5356assert/3concorrenze verificati anche dopo merge. FAIL9ec e332 conservati: metadata replay/lint, poi regressione della rilettura clock dopo lock; b091 ripristina integralmente il corpo canonico prima dei soli due controlli di invalidazione persistente. |
| Storico autenticato nuovo composto | Run43254453360, serverb091/client248, PASS12/12 eSQL97/5356/3; artifact13961554676/SHA5849729d verificato. Admin→entrambiPOS senza eco, ACK perso+nuovo CLR/pull prima ACK, duplicato/Undo/correzione, revoca isolata, HTTP409/history_cloud_writer_closed con zero nuovi grant/ricevute, Recovery/baseline e riconciliazioni senza nuovi movimenti; cleanup naturale. Principal bounded posseduti: prova Core/Data+HTTP+SQL+Storage+Worker+browser distinta dall’enrollment permanente WPF reale. Run23 server612/clientaa4 e precedenti qualifiche restano storia attribuita. |
| SQL effettivamente applicato | Solo nuova migrazione20261112143448_asus019_persistent_pos_authorization_v1.sql, SHA29bd59ef; versione cloud20261112174421. Tre corpi funzione esatti, V3 precedente invariata, nuovi RPC riservati a service_role e helper privato non eseguibile direttamente. Nessun dbpush/repair globale o modifica alle29migrazioni storiche. PIN: soltanto l’operatore Minimondo ha scadenzaNULL, versione1 e PIN invariati. Conteggi cloud movement_versions/job/upload/migrationrun0 prima/dopo. |
| HTTP effettivamente pubblicato | Version ecfd6920-bef3-441e-99f6-2a1b83aaf498, deployment8a732699-a226-40cd-a43c-4868f258826c al100%. Artifact congelato13960220868/SHAcd1e6ebe, sorgente956/treeb5058dd2, Wrangler4.123.0 con no-bundle/keep-vars, nessun rebuild. Tutti24binding e runtime conservati; metadati non-assets esatti, chiave gateway mantenuta senza lettura/rigenerazione. GET protetto e form staff HTTP200. Dopo deploy77richieste firmate riuscite, tutte tre lane idle e0risposte con lavoro. |
| Worker operativo osservato | Host7c95955/runtime612 CJS20eb2acd invariati; pacchetto/qualifica5/5, Node24.18.0, account virtuale/DPAPI/ACL, limiti1GiB/un processo e heap640MiB. Stato corrente running PID32268, ma disponibilità continua FAIL: 11 arresti distinti SCM7031 dalle18:35Z alle20:15Z, contatore cumulativo34 include23 FAIL iniziali. Nessun reinstall/rekey/restart manuale. |
| Worker — recupero successivo | Recuperi SCM dopo300s conservati. PID32268 dalle20:20:43Z;1119 richieste firmate riuscite nelle tre lane fino20:41:06Z. DB ancora avviato15:24:07Z dopo unico restart precedente. Causa degli arresti non dimostrata; stato running distinto da servizio stabile. |
| Consegna cassa installata | Installer248 canonico15f1e9f2 exit0,41file esatti/17file profilo preservati al momento installazione; backup3DB integrityok/FK0 e conteggi115tabelle conservati. Prove reali successive: primo/secondo Start online PASS, navigazione e focus PASS. Conteggi49tabelle main invariati rispetto al controllo prima della navigazione. Worker/chiavi invariati; copia Win7-transfer248 SHAeeb50b3f separata, kit1823697 conservato. |

Checkpoint unico privato aggiornato20261112T205249Z. Installato248: enrollment permanente, carrello/barcode, riepilogo→ritorno, chiusura e seconda apertura online PASS. Il nuovo login online genera una nuova ricevuta/sessione: non prova il riuso offline della precedente. Riapertura offline reale e reboot Windows NOT_RUN; prove sintetiche in processi distinti PASS, nessun reboot fisico dichiarato. Revoca server sconosciuta offline non rilevabile immediatamente.

Load diagnostico sul medesimo payload248, primo tentativo su ASUS dopo chiusura POS reale: PASS11/11, tutti tre flag validi,311/311 dispatcher e156/156 memoria, zero campioni persi e nessun cambio a intervalli, priorità, carico o soglie. Profilo17file hash-identico prima/dopo. Questo esito non sostituisce il FAIL postmerge43272054951: causa del gap hosted ancora non dimostrata, nessun rerun CI automatico.

Storico reale: il normale background ha preparato un archivio/backup con hash verificati e creato un upload pending; flow locale upload_created, oggetto Storage assente, nessun job/run/movimento cloud. Sincronizzazione reale incompleta; osservazione HTTP passiva330s conservata separatamente, nessuna richiesta o importazione di prova generata. Non qualificare il solo stato online come storico consegnato.

Win7 fisico BLOCKED_TARGET; periferiche NOT_RUN; Getnet C MISSING e tre moderni non applicati. DPI200%/2880×1800 conservati,100/125 USER_DEFERRED. Nessun Apply/Undo/reimport reale, articolo, vendita di prova o cancellazione di profilo/code. FAIL intermedi e ricevute storiche conservati, nessuna soglia/assert/pin indebolita. Nessun DONE globale.

Advisors dopo DDL conservati come inventario: [RLS senza policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [RPC anonime](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC autenticate](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [protezione password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nessun finding di execute pubblico per la nuova V4; permessi live verificati separatamente. Policy estranee non modificate.
<!-- ASUS019_COMPOSED_CURRENT_END -->

## Diagnostica del trasferimento — stessa Execution, 12 novembre

Il client248 resta installato e qualificato. Baseline reale upload_created: archivio/backup verificati, oggetto Storage assente, zero movimenti cloud. Dashboard aggiornata Healthy; nella finestra17:02–18:02 Santiago Storage mostra object-info400 e signed-upload200, nessun PUT. Causa ancora non dimostrata.

Il successore server registra nei soli errori source fase, codice chiuso e durata nel campo stage del logger route-rejection esistente, che conserva envelope e request ID generato dal server. La sua implementazione e la sua guardia rimangono esatte rispetto5ff8577; nessuna nuova emissione console o allowlist. Callback e guasti del logger non cambiano l’esito. Nessun header, URL firmato, credenziale, contenuto o identità economica entra nel log. Risposte HTTP, timeout15s, doppia autenticazione, hash, origine/oggetto, non-overwrite e verifica Worker invariati.

Validazione finale locale: foundation1653PASS/0FAIL/7SKIP (1660totali),41/41mirati inclusi i controlli sicurezza, scanner sicurezza/typecheck/lint mirato PASS. FAIL intermedi conservati: due confronti VM, poi TypeError fra realm; primo foundation1651/1/7 per console fuori canale e secondo1632/21/7 per nuova dipendenza del logger condiviso e corpo non identico. Risolto riusando il sink originale senza modificarlo né cambiare assert/allowlist. La prima CI43308989789/Cloudflare43308989713 di eb26 conserva il relativo FAIL; nuovo sorgente congelato e gate propri necessari prima del deploy. Nessun DDL o installer Windows per questo delta, nessun DONE.

<details>
<summary>Checkpoint precedente171130Z conservato come storia</summary>


## Composizione precedente — 20261111T171130Z, stessa ASUS-W7POS-019

Execution ACTIVE, due consegne: cassa quotidiana e storico bilaterale.
Autorizzati tutti i file necessari; nessuna nuova funzione o task.
Codepoint candidati: Windowsc9a3355e972f4dd995931e4f24bf4fb6c4f74ab3
(include harness92c3517 e diagnostica02f51b9), Admin996cd7b7475e17679e30347823fafd4378022318.
Il successore documentale va legato alla propria qualifica; nessun PASS
pregresso diventa automaticamente PASS del nuovo SHA.

| Scenario | SHA / comando / ambiente | Esito ed evidence | Prossimo gate |
|---|---|---|---|
| Cassa precedente | d1b2bc3, pacchettoa07430ce/payload6b44ffe3; ASUS Integrated12 eFinal60 | PASS31cicli/max102.510ms e151/max97.826ms, budget63970e30 invariato | qualifica sul pacchetto finale composto |
| Windows composto precedente | 791fc4f7, CI43050673848 eSecurity43050674075 | PASS16/16; U19Win791Remote01 verifica artifact13870814586 SHA256b6537e61/8entry, fingerprint5797937a; target396/396 incluso nel perimetro | non trasferire il PASS al successore |
| Successore059 | CI43057322574, Security43057322848 | Windows-All FAIL15/16, Core e altri14passi PASS; fallisce solo Load. U19Win059RemoteFail01, artifact13874022646 SHA2565b2dbb24/8entry verificati | copertura del campionatore da chiarire |
| Load059 | HIST_LOAD_50K, stesso workload e limiti | query283.8887ms contro500 PASS; max Dispatcher osservato13.8919ms; 393/394campioni e1drop nella prima fase analysis: gate Dispatcher FAIL. Nessuna causa host/UI dedotta | diagnostica limitata, zero tolleranze aggiunte |
| Diagnostica Load | componente02f51b9, composto ca83a08 | U19LoadGap01 PASS11/11,18.8606s, fingerprint6285d981 sul WIP stabile prima del commit;83check puri PASS. Nuovi testimoni wait/memory/GC, senza cambiare clock, intervalli, priorità, soglie o workload | causa del vecchio drop UNRESOLVED; ripetere Windows-All successore |
| API/BFF precedente | Admin3b675654, CI43059296486 eCF43059299287 | Verify, SQL e build PASS; U19Admin3b01 verifica58file, lock/config/treeeb1cd04e. Artifact13873217236 SHA2566477fc81. Entrambi i deploy SKIPPED | Worker impacchettato, servizio operativo non attestato |
| SQL composizione | replay3b, artifact13872648476 SHA256e7232bb1 | PASS94file/5307assert +3race preesistenti; receipt verificata U19Admin3b01 | nuove race recovery NOT_RUN |
| Prova autenticata01 | client059/Admind4f02e5, run43058834395 | SQL PASS; scenario FAIL initial_baseline/history_response_invalid, cleanup naturale. Artifact13874140882 SHA256508ae8cf, U19AuthenticatedRemote01 | FAIL conservato, nessun roundtrip PASS |
| Prova autenticata02 | client413eb4d/Admin9c85b2c, run43062172147 | SQL PASS; baseline contextHTTP200; Storage.info realeHTTP400 con machine code404 e StorageApiError; clientFAIL come sopra. Artifact13875071522 SHA256c4ade33c verificato U19AuthenticatedRemote02 | correzione specifica del confine Storage |
| Correzione Storage | Admin996cd7b, sorgenti stabili520c480a | helper riconosce soltanto SDK StorageApiError400/code404 oltre al404già previsto; generici400/auth/rete restano FAIL. U19AuthenticatedContract03 typecheckPASS,42targetPASS inclusi nei1618foundationPASS/7SKIP su1625 | E2E reale successore, CI e packaging propri |
| Harness successore | client92c3517, schemaasus019-authenticated-history-v2; incluso c9a3355 | build10PASS0warning/error; baseline confrontata con economia originale e audit immutabile; implementati import duplicato, Undo con proprietario originale, correzione dopo Undo e confronto esatto identità/ticks/gross/fee/VAT/net. Il reader SQLite si chiude prima di Apply; stop supervisor atteso e limitato | esecuzione distribuita di questi casi NOT_RUN |
| Storico bilaterale completo | A→server→Admin già aperto→B→A, origine Admin in writer mode prevista | roundtrip autenticato non ancora PASS; ACKperso/riavvio reale/pull prima ACK/revoca/conflitti e race recovery ancora aperti | completare servizi reali di test e casi residui |
| Pacchetto e consegna | release05943057309469 in packaging all'ultima osservazione, Core PASS; QAbundle43057597754 | QA40file verificati artifact13872765644 SHA256ce6e92f8, U19Cart05901; nessuna nuova installazione. Integrated/Final60 finale NOT_RUN | pacchetto finale, binding, soaks, backup/rollback e consegna |
| Vincoli esterni | installato2ad42ca, profilo Minimondo e7originali conservati | 200%/2880×1800 invariati;100/125 USER_DEFERRED; Win7fisico BLOCKED_TARGET; GetnetC MISSING | nessuna attestazione sostitutiva |

Il vecchio c88 Windows-All FAIL2/16 rimane verificato in U19WinC88RemoteFail01;
SQL63f/9fb e fallimenti precedenti restano nella cronologia. Anche i FAIL DNS
di Chromium (CIc351 e run43056918378) sono conservati; quest'ultima non ha
eseguito lo scenario autenticato e fallisce anche l'export per evidence assente.
La CI3b usa Ubuntu24.04 e il Chromium Playwright vincolato dal lockfile; il
servizio E2E separato registrera versione/hash del Chrome alla fase browser, ancora NOT_RUN nelle due prove fallite.

Il client trasferisce solo l'archivio selettivo al BFF configurato, con
dimensione/hash/lease verificati; il backup completo rimane locale. Nessuna
allowlist client per Storage, ricevuta fittizia, nuovo grant SDK o v1 fallback.
Copertura baseline verificata e replica completa drenano i soli legacy senza
riscriverne l'audit; journal/witness v2 incerti restano bloccanti.
Nessun merge main, deploy, mutazione reale o DONE. Qualifica mobile e Win7
fisico restano separate; il test Core/Data non attesta WPF o periferiche.


</details>

<!-- ASUS019_CURRENT_START -->
## Qualifiche precedenti — evidence conservate

Due consegne: cassa quotidiana e storico bilaterale. EXECUTION ACTIVE.
L'utente autorizza tutti i file necessari; soglie e carico restano invariati.
Nessun merge main, deploy, installazione o nuova mutazione reale in questo checkpoint.

| Scenario | SHA / comando / ambiente | Esito ed evidence | Prossimo gate |
|---|---|---|---|
| Cassa PR136 | d1b2bc318c8a0aecce9543dc6a96f9a1aaf7cfc3; CI42967023331, Security42967023327, WPF42967096688, Release42967017718 | PASS; U19ReleaseD1b201 verifica41file/110checksum, installer a07430ce e payload6b44ffe3 | integrare nella coppia finale prima della sua qualifica |
| Cassa ASUS disponibile | d1b2, Integrated12 eFinal60, budget63970e30 invariato | PASS31cicli/max102.510ms e151cicli/max97.826ms; U19D1b2AsusI01/F01, cleanup naturale | Windows11 disponibile, non Win7 fisico o coppia finale |
| Cassa hosted | d1b2, run42970975541; U19D1b2Hosted01 | PASS Integrated33cicli/138.340ms eSoak166cicli/56.051ms; artifact13837190884 digestd100083f39920a95f54b7132f6c9ed4622ce7ea3bde00991c26ae23295106a47 | mantenere distinto da ASUS |
| Windows135 qualificato | 4f07a2d84f06ec065df04021bc62c91b050c4d78; CI43018907144 eSecurity43018907124 | PASS16/16, Load11/11; U19Win4f07Remote01 verifica8entry, artifact13854594896 digest89cab51916750ea5ddad68df4e6831bacec5926a69a99df4c5cd2b6674863c15; fingerprint1624e4ad8a5b45cedca6050129610c3f439af0692444f58b1027964081ce5022 | la baseline locale privata non e ancora integrata in questo candidato |
| Load egeometria cee originali | cee9160 CI43009830230 FAIL14/16, U19WinCeeRemote01; locale U19CeeGeometry01 | misure geometriche PASS ma ConfirmOnce false: fixture loopback rifiutava local_review; caldo532.6015/496.8929/500.4045ms oltre500 | FAIL conservato; nessuna attribuzione hardware/scanner |
| Correzione successore4f07 | celle giorno/ora aggregate una volta; fixture ammette review gia implementata | target23/23, U19CeeGeometry02 PASS22misure/confirm-once/cancel; remoto Loadquery286.2606ms, cold310.1317ms, misura completa valida | stessa soglia500 e stesso carico; non trasferire il PASS al futuro candidato finale |
| Recovery eFAIL storici | timeout fixture TextBoxView/timer2s identificato, U19RecoveryHeap03/04 eRetirement04; focus149FAIL258.573/258.382ms | successori mirati eWindows-All PASS; gate890 fermo17 dopo18 corretto; originali b976/cee eFAILfixture conservati | nessun retry live o cambio arbitrario5/3 |
| Admin151 qualificato | 221573a770b5838796dd8f91f656dc85799a7a1d; CI43009841014, Cloudflare43009840957 | PASS packaging; deploy SKIPPED; U19Admin22101 verifica58file/lock/config/tree; Worker13849982775 digestb6181d2b28a917cbfdfecd2a5fd42bcd4adcd650551d5adf95e635f307808f98 | Worker impacchettato distinto dal servizio operativo |
| Outcome/concorrenza SQL integrati221 | replay90file/5164assert e3scenari reali concorrenti; U19Admin22101 | PASS artifact13849964696 digeste52825578ecea26d9df1a0528735577fc09b2c8fbef4a07aad28a3146f632cd4; nonce/review/witness eoriginali ricevute vincolati | API pubblica v2 ancora chiusa |
| Baseline server privata | 92e725e32a6b77777821e3c1c85cfb63abe3573b; replay43019401370; migrate11650 e121621 additive | PASS92file/5225assert e3concorrenze; U19BaselineUploadSql01 artifact13855186857 digest29a5057ba72a8b13e4b490c08d0a5345de1068196e19fcd3f2876db7052a824a | context, evidenza legacy eupload idempotente privati; nessun nuovo endpoint esposto |
| Contratti Node baseline | 4906bb8ad5acc79237d2076b3d184e57dc1cb82b | typecheck PASS,9mirati PASS, foundation1588PASS/7SKIP su1595; U19BaselineCodec01/02; unicoFAILCRLF corretto con blob Git esatti, pin invariati | source integrato identico nel codepoint5442650, nuova CI dopo commit documentale |
| Baseline client privata | ce9e583567885f541b080725a7e44f76d73d3f13; C:/Dev/A19BaselineCompose01 | Store22689e7 target344/344 eCloud1/1 net48/x86; orchestratore83/83, U19BaselineFlow01; vecchi333 eFAILpin78 preservati | collegare host/trasporto; cambio sessione primaApply richiede resume/review verificato |
| Lettura canonica privata | marker sticky solo dopo ricevuta baseline e replica completa compatibile; ever_web/pin1–19 invariati | tre prove lettura/rollback PASS incluse nel target; fonte canonica senza doppioni/eco, copia incompleta non pubblicata | nuova20 privata SHA c6527cbfdf9d438da6852f9a3f44b4e24340d60ad3d2800e6fa66ceeea50f16f; non e migrazione distribuita |
| Storico bilaterale | grant/outbox/witness qualificati, baseline in composizione | NOT_RUN E2E autenticato reale A→server→Admin aperto→B→A eorigine Admin | completare baseline/lease recovery, SQLv2+Node boundary+WPF, poi qualifica coppia esatta |
| TASK094 cleanup | sola lettura dei10conteggi fixture gia autorizzati | PASS tutti0; vecchio authFAIL/cleanupNOT_ATTESTED conservato | nessun retry live cieco |
| Consegna eprerequisiti esterni | installato2ad42ca, profilo Minimondo/quattro lotti legacy/setteXLSX invariati | Win7 fisico BLOCKED_TARGET;100/125 USER_DEFERRED,200% conservato; Getnet modernoC MISSING | niente equivalenza fra build/installazione, CI/deploy, Windows11/Win7 |
| Mobile TASK146 | coordinamento nel commento esistente6722613449; nessun AndroidTEST verificato qui | nessun nuovo PASS mobile o targetinventato | aggiornare il solo prefisso, preservando tutta la coda Mac |

Il trasferimento usa soltanto l'archivio selettivo dei sette gruppi di tabelle;
il backup SQLite completo rimane locale. Upload, start, review eApply mantengono
identita persistenti. Fonte eautorizzazione sono ricontrollate; nessun lock SQLite,
gate commerciale o manutenzione backup attraversa HTTP. Nessuna nuova coda/timer.
La prova con risposte controllate e distinta da server/Worker/browser reali.
Non esporre la v2 incompleta e non dichiarare DONE prima dei gate critici.
Checkpoint UTC 2026-11-11T12:49:44.409904+00:00.
<!-- ASUS019_CURRENT_END -->

<details>
<summary>Checkpoint precedente conservato al 20261111T012245Z</summary>

## Convergenza corrente — stessa Execution ASUS-W7POS-019

Addendum di convergenza recepito: due consegne, cassa quotidiana e storico
bilaterale. Nessuna funzione nuova; la precedente matrice di altri domini resta
inventario storico e non amplia il lavoro corrente. Stato ACTIVE, nessun DONE.

| Scenario | Sorgente / binding | Comando / ambiente | Esito | Evidence | Prossimo gate |
|---|---|---|---|---|---|
| Cassa PR136 |149c978c2c169dd8640e7e2d13c0e6ca151f2884; Release42889654511 | CI/Security/WPF/Release e pacchetto esatto | PASS build e Integrated12; FAIL soak60 |42897760117, U19CartSoak14901, artifact13807390665 | attribuire i cicli116/118, correggere causa, nuova qualifica |
| Focus, attribuzione | prodotto149 invariato; solo harness6533c71d68cb15d30ad94f7b809e54a37a721c0e | run-cart-performance Diagnostic, stesso carico/budget; hosted42924975778 | RUNNING, non qualifica | U19Focus149Local02; product-binding; run42924975778 | leggere massimi per ciclo/fase/callback; nessuna causa scanner presunta |
| Windows precedente | fbdde199 + fingerprint6c170539da7fd1af2ba72d0236ef5edad140aab9c8d2f2308eff050fc4a6dd99 | Windows -HistoricalSalesMode All | FAIL conservato | U19CloudAll01 | successore completo su checkpoint nuovo |
| Successori fixture Windows | stesso ramo135 + delta proprio | geometry/shell/Smoke/RequiredGates | PASS9.698s /25.519s /8gruppi52assert55.430s /50su50 | U19CloudFunctionalFix01 e04, U19CloudSmoke04, required-gates05 | non sommare con la suite precedente |
| Recovery | diagnosi fixture; prodotto invariato | net48/x86, cinque aperture, deadline60s e8MiB invariati | FAIL iniziale5contro3 conservato; successore mirato PASS40.545s | U19RecoveryIdentity01, U19RecoveryHeap03, U19RecoveryRetirement04, U19RecoveryHeap04 | suite Windows completa; rilascio assoluto/Win7 non attestato |
| Owner correzione Windows | ramo135 + delta, riferimenti lotto/Apply e cancellazione spool | Ledger64test, mirati4, build19, CloudView06 | PASS; i4 sono sovrapposti | U19CloudSync28/30, build19, CloudView06 3.382s | owner canonico server e ammissione v2 |
| Admin qualificato | e67008ad7668b9ca91b45432e3031427e190cf71; merge CI d137c89561c50a5c7f491fd1b3a0d8c40c2963fb, stesso tree626493033d90264d81fb814e08cad6030d701fdd | CI42914874218; Cloudflare42914874236 | PASS CI e packaging, deploy SKIPPED | U19AdminWorkerE67001:58hash verificati, artifact13809111740 | non confondere bundle con servizio operativo |
| Admin delta locale | owner lotto/Apply, permessi marker per dominio e503 separato | typecheck03/lint01; foundation06 | PASS1547,7SKIP preesistenti,0FAIL su1554 | admin-foundation06.private.log; 109.174s | CI sul commit successore |
| SQL owner shape + marker | 81116906db3f6db32aea989d542ee7e80fa21f3f; migration04af62ef/e9af34c2 | replay canonico Linux isolato42925339887 | PASS80file/4787assert | U19SqlMarker04/complete.json | nessun SQL linked o deploy |
| SQL owner canonico | isolato186f4c67f2aec07847d67ba9cf636aa02d131df2; migration20261110234619 SHA d46c65c96b13585f12994fc360f86cdb847a5508979301e7ab3631c6a4bc6898 | replay isolato42926950143 | RUNNING; parse/18assert plan PASS locale | run42926950143 | raccogliere esito; helper ancora privato |
| Catena v2 e baseline | v1 ancora chiamato dal WPF; API v2 chiusa | Apply/outbox componenti, preparatore e semantica privati | INCOMPLETE, E2E autenticato NOT_RUN | stesso diff135/151 | baseline verificata, autorizzazione contenuto, consegna/ricevuta, WPF, lettura globale |
| Cleanup vecchio TASK094 |42896389034 | nessun retry live | FAIL auth_denied; cleanup zero NOT_ATTESTED | admin016-task094-staging.private.log | recuperare soli ID fixture e verifica read-only, niente purge |
| Mobile / Win7 fisico | handoff TASK146 esistente / target mancante | nessun build mobile; hardware non disponibile | NOT_RUN / BLOCKED_TARGET | commento6722613449; piano Win7 | nessun PASS trasferito da Windows11 |

La diagnostica breve149 attribuisce un'attesa407.506ms alla fase setup, con
callback Render sovrapposti225.670/80.837ms e barcode già focalizzato. È un
campione di avvio locale, non la spiegazione dei massimi258.573/258.382ms dei
cicli116/118 hosted. Le soglie250ms e il workload congelato restano invariati.

Recovery: identificate singolarmente le finestre chiuse, senza HWND, owner-list,
focus o timer prodotto attivi. Il dump privato sintetico individua una catena
DispatcherTimer.FireTick → TextBoxView.OnThrottleBackgroundTimeout → TextEditor /
TextAdaptor / DataGridCellItemAutomationPeer → colonna/DataGrid → Recovery.
Il timer interno net48 dura2s: il vecchio drain poteva terminare prima. Ora
entrambi i fixture sono raccolti alla stessa età minima2100ms dopo l'ultimo
Closed, con gli stessi10 tentativi, deadline60s e confronto memoria8MiB.
Nel successore recovery1/control5; il dump successivo non trova root path verso
le istanze Recovery. Il PASS mirato non cancella il FAIL originale e non qualifica
rilascio assoluto o hardware fisico. Riferimento tecnico Microsoft:
https://source.dot.net/PresentationFramework/MS/Internal/Documents/TextBoxView.cs.html
e https://devblogs.microsoft.com/dotnet/wpf-on-dotnet-7/ . Nessuna dipendenza
aggiunta al prodotto: lettore ClrMD3.1.512801 solo nel tool privato di diagnosi.

SQL marker:42921661653 FAIL per evento fixture forgiato;42923536204 FAIL per
tentativo di revocare il ruolo pos_admin canonico. Successore usa evento reale
del trigger catalogo e ruolo limitato manager modificabile: nessuna protezione
indebolita.42919972944 verde ma head obsoleto non qualifica questi20assert.

Installato verificato2ad42ca,41file, profilo/ledger Minimondo e quattro XLSX
importati conservati. Nessuna installazione, nuovo Apply/Undo/vendita reale o
scrittura del profilo.200% preservato;100/125 USER_DEFERRED, Win7 BLOCKED_TARGET,
Getnet moderno prova C MISSING. Nessun merge/deploy/cutover. Il Worker storico
operativo resta un gate distinto dal Worker web impacchettato.

Checkpoint UTC 2026-11-10T23:54:20.160630+00:00.

</details>

<details>
<summary>Checkpoint precedente 10 novembre 22:27 UTC, conservato alla convergenza</summary>

## Stato corrente — Execution bilaterale attiva, checkpoint 10 novembre 22:27 UTC

Admin151/43f668df + diff: lettore movimenti nominativo, filtri per data commerciale,
cursore vincolato a dataset/revisione/filtro, totali globali filtrati e importi
esatti/null preservati. La pagina mostra provenienza e prova temporale; il JSON
esporta la pagina filtrata con totali globali, senza dichiarare un export completo.
Il polling globale ShopShell esistente (3s, backoff fino30s) pubblica un marker
storico separato; lease staff ricontrollato, nessun timer per vista o audit ogni poll.
Richieste cancellabili, nessuna sostituzione di file/input/focus o posizione commerciale.

Typecheck07/lint02 PASS. Foundation05:1527PASS/7SKIP preesistenti (1534 totali,
91.408s); browser sintetico desktop13PASS6.3s, tablet5PASS2.6s, ritocco etichetta
netto desktop5PASS2.5s. Non sono E2E autenticati o prova di stile del CSS distribuito.
SQL isolato e099bce8918caabcc0b766132a5bfb86bbbf4f4f /42912319575 PASS:
78file/4755assert, artifact13806949466, digest
30b7b9d2f1aa7c2c26491ae38a6349dd2fb2dd0083396582a1b0a507e8a82b6a.
Include le primitive private preparazione/semantica e il lettore/marker37assert.
Tentativi42910563273 FAIL pin CRLF/LF e42911042429 FAIL fixture revoca senza
revoked_at conservati; corretti pin LF e fixture, nessuna protezione indebolita.
Vecchio job live TASK094/42896389034 auth_denied FAIL resta senza retry;
cleanup finally eseguito, conteggio zero finale NOT_ATTESTED.

Client135/fbdde199 + diff: richiesta foreground nella stessa gate prioritaria e
credenziali correnti; preparazione paginata riprendibile20PASS13s; revisioni
monotone/status34PASS23s. CloudView05 PASS3.985s, conferma325ms, copia489ms,
notifica revisione nota332ms: convergenza di componente, distinta da Input250ms.
Windows-All U19CloudAll01 fingerprint6c170539da7fd1af2ba72d0236ef5edad140aab9c8d2f2308eff050fc4a6dd99
FAIL: Core/Data, build, gate e CloudSync PASS; functional19/22 e Smoke50/52
prima del deadline FAIL, Load NOT_RUN dependency_failed. Sorgente invariata nella run.
Geometria corretta nel fixture tramite gate foreground reale loopback: PASS9.698s.
Shell mirata successiva PASS25.519s dopo drain della lettura automatica prima
Close:70checkpoint, stesso budget60s. Tre TIMEOUT diagnostici intermedi conservati.
Recovery mantiene FAIL per weakref chiuse5 contro3 del controllo; nessuna deroga.
Windows-All finale sul nuovo delta resta da completare.

PR136/149c978 resta congelata: CI, Security, WPF e Release PASS;41/40file e34comuni
identici verificati. Qualifica42897760117: Integrated12min PASS, soak60min FAIL
su158cicli, ambiente valido, focus258.573/258.382ms nei cicli116/118 oltre250ms.
Artifact13807390665 digestada85a03ea8e2dc64c86be5fcd8408dcb664eb8c83ffd755bd0fbde72eda4387,
evidence U19CartSoak14901. PR136 aggiornata: nessun retry cieco o budget allargato.

Residui critici aperti: ammissione v2 completa e ingest/ricevute esposte, baseline/
backfill del lotto originale da backup attestato, collegamento WPF al grant v2,
lettura canonica globale e registri inter-postazione; E2E autenticati bilaterali
per dominio NOT_RUN. Il WPF usa ancora grant v1; preparatore v2 non collegato.
Worker operativo/deploy/SQL live/cutover NOT_RUN. Installato2ad42ca e ledger
Minimondo invariati, nessun nuovo Apply/Undo/vendita reale.200% preservato;
100/125 USER_DEFERRED, Win7 BLOCKED_TARGET, Getnet moderno C MISSING.
Stessa ASUS019 ACTIVE: nessun merge o DONE; risultati Windows non attestano mobile.

</details>

<details>
<summary>Checkpoint precedente 10 novembre 21:00 UTC, conservato</summary>

## Stato corrente — Execution incrementale attiva, nessun rollout

Checkpoint10novembre21:00Z. PR151 resta su43f668df; baseline runtime6c2bd414
qualificata separatamente. Il nuovo codice locale non è ancora pubblicato.
Contratto v2:17/17 PASS; confine device36/36 PASS e typecheck03 PASS. La revoca
runtime e i token non validi producono auth_denied; il solo permesso storico
negato resta history_cloud_access_denied. Un errore di lettura lease è503,
non un logout. Il42501 SQL rilegge la lease per distinguere la revoca concorrente.
Foundation03 completa:1484PASS/7SKIP preesistenti,0FAIL (85.214s). Foundation02
1482PASS/2FAIL è conservata: guard CI testuale, corretto senza ampliare l'accesso.

Replay SQL isolato0162205 /42896389034:75file,4664assert PASS. Verify PASS;
job staging TASK094 FAIL auth_denied, nessun retry. Il finally di cleanup è
eseguito dal runner; la verifica finale dei conteggi non è attestata sul fallimento.
I due replay22c9cbc falliti42892520753/42895021975 restano conservati. Fix reale:
CASE delimitato nella validazione PLpgSQL. Migration20261110181221 SHA256
`ebfa26747b33a683a90864d2a4c33eb1acd4d17d839b1a806fec545d3daeda21`.

Nuova preparazione privata984d6e4 /42897836745:76file,4694assert PASS; Verify e
staging esclusi esplicitamente nella modalità database_replay_only. I default
PR/main conservano i gate esistenti. Migration20261110203449 SHA256
`253eec9b4dc565083d6fab31aba67d8a7878bc57bd1552694362cec76d92212a`:
contesto da snapshot verificato, identità/root immutabili, pagine256KiB/200record,
ordine/resume/ACK perso/capacità/header/hash controllati. Nessun nuovo grant,
nessuna applicazione economica, nessuna API v2 raggiungibile: ammissione semantica,
ingestione/ricevute, baseline/backfill e UI movimenti/aggregati rimangono incompleti.
I PASS SQL non attestano servizio worker, distribuzione o E2E fra due POS.

Windows136/149c978: CI15/15+functional22/22, Security, WPF e Release Pack verdi;
41file prodotto/40QA e34comuni byte-identici verificati. Qualifica integrata12min
+soak60min42897760117 in corso. Installato2ad42ca invariato, nessuna installazione.
Client135/fbdde199 con diff: gate richieste storico condiviso33test PASS,
ledger/replica/stato67test PASS; CloudView04 componente PASS3.045s, selezione e
conti locali invariati, conferma mostrata in253ms e copia in386ms. Sono latenze
di componente, non Input250ms o rete reale. Nuovo Windows-All finale NOT_RUN.

Convergenza bilaterale autenticata per tutti i domini, backfill del lotto reale,
worker effettivo e cutover restano NOT_RUN/incompleti. Handoff TASK146 esistente;
nessun PASS mobile. Nessun deploy o SQL linked, nessun nuovo Apply/Undo/vendita
reale o scrittura del profilo Minimondo. Win7 fisico BLOCKED_TARGET, DPI100/125
USER_DEFERRED,200% preservato; prova provider C moderna MISSING. ASUS019 ACTIVE,
nessuna nuova task, merge o DONE. Le sezioni successive sono checkpoint storici.

</details>

Stato del documento: **READY_FOR_REVIEW / PLANNING**, 9 novembre 2026.
Le funzioni B/C sono **NOT_IMPLEMENTED / NOT_RUN**, non qualificate da questo piano.
Unica continuazione coordinata: ASUS-W7POS-019; nessuna riapertura dei TASK-139/140
chiusi, nessun nuovo task numerico assegnato, nessuna seconda task Windows.
Questo è il backlog delle tranche B/C fino alla successiva autorizzazione Execution.

## Mandato, baseline e confini

Il mandato utente separa A, consegna Windows già in Execution, da B/C, sola analisi
e documentazione Admin. Nessun ruolo, credenziale, grant/RLS, schema, dato o deploy
modificato da questa pianificazione. Nessun reset/recovery1001, test SQL/HTTP/E2E,
dispatch CI Admin o comando npm di qualifica eseguito per B/C.

- Admin letto su main/origin `b5c2dbc291adb4010624d2aabaaeaaabe2adcc2d`, worktree
  privato della stessa ASUS019. Il checkout principale dell'utente resta intatto.
- Windows `a397a49ac4a4028d0b9e909e621c776c257325d3`: Windows-All15/15, Core1745,
  functional22, smoke8/52, crash5, load11 PASS; quattro workflow exact-SHA SUCCESS.
  Il successore `5d8e704b2d0027c4ee1d5a9f4cb6b10842b85b54` aggiunge soltanto la
  prova MainWindow pagamento e aggiorna la guida. Albero `src`
  `d540bb0963a634ee6140f720fef17456a4b87775` identico ad a397. Nuova qualifica
  5d8e704 conclusa15/15 PASS e quattro workflow SUCCESS; prodotto41/QA40,34 comuni
  identici, smoke scaricato8/52 PASS49.397s. Sono prove eseguite sul successore,
  non PASS trasferiti da a397. Primo UAC annullato prima dell'avvio: installato
  a828 e10/10 file del profilo invariati, consegna reale ancora aperta.
- Installato al checkpoint: a8286c6. Installazione e percorso reale del successore
  restano aperti nella [task Windows](https://github.com/XNIW/Win7POS/tree/main/docs/plans/ASUS-W7POS-019_GETNET_HISTORY).
- Getnet V1 reale: quattro originali legacy hanno prodotto **una ricevuta Apply e
  un lotto attivo**, riconciliati; nessun nuovo Apply/undo consentito per provare UI.
  Tre moderni restano NeedsEvidence per C. La colonna Z non verifica la semantica
  del provider. Copertura osservata parziale non significa interi mesi completi.
- Win7 fisico: NOT_RUN/BLOCKED_TARGET, già dichiarato indisponibile. Nessun SDK
  moderno richiesto sul registratore; kit net48/x86 e checklist da aggiornare in A.

Coordinamento e prove attuali: [handoff ASUS019](../TASKS/EVIDENCE/TASK-139/asus-019-staff-overview-20261108.md)
e [commento coordinatore unico](https://github.com/XNIW/iOSMerchandiseControl/pull/29#issuecomment-6722613449).
TASK/PR numerici di repository diversi non sono identità intercambiabili.

## Causa e catena di autorizzazione dimostrata dal sorgente

| Passaggio | Evidenza nella baseline | Conseguenza |
|---|---|---|
| Provisioning iniziale | `20260707183000_mac_admin_w7pos_009_pos_admin_staff_role.sql`, `task051_insert_initial_manager`: inserisce1001 attivo come `pos_admin` e il set canonico. `permissions.ts:101` espone `POS_ADMIN_STAFF_PERMISSION_KEYS`, incluso `shop_admin.full_access`. | 1001 è il codice iniziale, non una regola universale di autorizzazione. Il runtime non deve ripromuovere un1001 revocato. |
| Identità staff | `staff-web-auth.ts:365`, `staff-web-runtime-boundary.ts`, `access-principal.ts`: cookie staff separato, sessione/versione/credenziale/stato, ruolo manager/pos_admin/courier e permessi espliciti. | Staff non diventa `profiles`, non usa `auth.uid()` come identità staff. Il ruolo `admin` resta escluso dal predicate corrente. |
| Scope e capability | `data-access.ts:116` e `resolveShopAdminDataAccess`: shop richiesto diverso respinto; permessi personali o staff distinti; `revalidateShopAdminDataAccessForPublish` ricontrolla identità/sessione/versione/permesso. | Un parametro shop nel browser è navigazione, mai autorità. La cache React qui è per richiesta, non autorizza risposte successive. |
| Proiezione shell | `data-access.ts:86` `staffShellShop` assegna `role: shop_manager`; `ShopShell.tsx:915` usa `formatRole(selectedShop.role)` salvo override courier; `shop/layout.tsx` passa il metodo di accesso, non il ruolo staff effettivo al badge. | “Manager shop” non prova un downgrade di pos_admin. Correggere DTO e copy del badge, non i dati account. |
| Panoramica | `shop/overview/page.tsx` → `shop-section-data.ts:3650` → `read-model.ts:239`. Prima richiede `settings.view`, poi per staff ritorna `staff_surface_unavailable` senza query generale. | L'identità può essere autorizzata ma il reader della superficie non esiste. Non è una lettura riuscita vuota. |
| Stato pagina | `shop-section-data.ts:160` `fallbackSection`; `ShopSectionPage.tsx` separa dati e azioni. `Page actions = Read-only` descrive l'assenza di azioni di quella pagina. | Non implica che tutte le scritture dell'account siano disabilitate. |
| Reader Staff già recuperato | `staff-read-model.ts:143`, `staff-web-lease-bound-rpc.ts:46` → `staff_web_staff_read_v1`, vincoli actor/shop/session/version, whitelist e massimo100 righe. | Riutilizzare il modello di boundary, non il contenuto della lista Staff per costruire una Panoramica fittizia. |
| Azioni implementate | `action-context.ts` → `staff-mutations.ts` / `staff-aware-mutations.ts` → RPC nominali catalog/lifecycle, audit attore separato. | Non cancellare i boundary staff esistenti; “tutti i mutator personal-only” è documentazione storica superata. |

Il provisioning TypeScript `staff-manager-provisioning.ts` contiene anche
`recoverInitialManager1001`: il recupero può ricreare account o sostituire la
credenziale. Non è un rimedio per la Panoramica e non è stato invocato.

Limite live: la sessione servita dopo PR148 era stata osservata valida su
Panoramica/staff; il vecchio rollout147 aveva invece revocato pos_admin ed è stato
corretto e verificato separatamente. Questa pianificazione non rilegge token,
hash o metadati live e non pretende una nuova attestazione dell'account corrente.
Il badge/screenshot non sono una prova del set effettivo live.

### Cinque esiti da conservare nel contratto UI/API

| Esito | Stato operativo da mostrare | Azione |
|---|---|---|
| Permesso mancante/shop diverso | Non autorizzato | Nessuna query/dato; richiedere il ruolo appropriato. |
| Principal autorizzato, reader assente | Funzione non disponibile per questo accesso | Offrire sezione realmente utilizzabile; mantenere distinto dal denial. |
| Pagina consultiva | Sola lettura di questa pagina | Dati autorizzati consultabili; nessuna conclusione sui privilegi globali. |
| Lettura autorizzata senza righe | Nessun dato per filtro/periodo | Zero righe vero; copertura/totali solo se conosciuti. |
| Errore backend o sessione scaduta | Errore temporaneo oppure nuovo accesso richiesto | Non esporre errori nativi; eliminare dati stale, login solo se sessione non valida. |

Le superfici `device-read-model.ts:258`, `audit-read-model.ts:214`,
`pos-live-read-model.ts:382`, `pos-revenue-read-model.ts:499` e
`history-read-model.ts:2818` oggi ritornano ancora `unauthorized` per un reader staff
mancante. B deve correggere questo contratto e aggiungere i reader autorizzati,
senza classificare tutti quei ritorni come permessi realmente negati.

## Matrice ruolo/funzione: contratto desiderato e copertura corrente

Legenda: sì = diritto operativo desiderato nello shop autorizzato, sempre con
stato/credenziale/sessione validi; P = permesso esplicito/template; O = owner o
platform protetto; C = nuova tranche cloud, oggi assente. Un diritto non attesta
che un reader o un flusso sia già implementato.

| Funzione | Iniziale pos_admin | Manager staff delegato | Cassiere / viewer staff | Personale owner / manager | Platform Master |
|---|---|---|---|---|---|
| Lettura catalogo / modifica | sì / sì | P / P | POS secondo permessi; web escluso dal ruolo corrente | sì / sì | Solo console/boundary globale autorizzato, nessuna impersonificazione automatica |
| Import/export catalogo | sì | P | no di default | sì / sì | Operazioni piattaforma esplicite |
| Report/ricavi operativi | sì, reader staff da completare | P (`pos.dashboard.read`) | POS secondo permessi; nessun web automatico | sì / sì, dati realmente disponibili | Ambito globale dedicato, nessun accesso implicito per login shop |
| Staff delegati non protetti | sì, con limiti server | P `staff.write` | no | sì / sì con limiti | sì attraverso azioni piattaforma auditabili |
| Ruoli/template non protetti | sì entro delega sicura | soltanto capability autorizzata; non basta il nome manager | no | sì / sì entro limiti owner-only | sì attraverso boundary dedicato |
| Peer pos_admin, credenziali privilegiate, privilegi protetti | O | O | no | owner sì / manager no | sì, recupero distinto e auditato |
| Dispositivi ordinari | sì (`devices.write`), reader UI da completare | lettura P; scrittura owner-only oggi non delegabile a manager | no | owner modifica / manager legge | azioni piattaforma autorizzate |
| Impostazioni operative | sì dove implementate; distinguere profilo fiscale | lettura P; scrittura protetta oggi | no | owner secondo funzione / manager lettura | titolarità e identità fiscale nei flussi Master previsti |
| Storico Getnet: lettura / import / undo / export | C, permessi dedicati separati | C, ciascun permesso esplicito | C sola lettura se delegata; nessun import implicito | C secondo ruolo e permessi | Nessun import commerciale implicito da privilegio globale |
| Titolarità legale / Master Console / altri shop | no / no / no | no / no / no | no / no / no | solo membership/ownership effettive; email da sola non basta | ruolo platform verificato; cambio titolarità tramite flusso protetto |

Copertura reale da cui partire:

- Catalogo: page-access distingue canImport/canExport/canManageProducts, reader e
  mutator staff hanno RPC nominali. Verificare le operazioni esatte in B, non
  sostituirle con query service-role generiche.
- Staff: lettura safe e lifecycle presenti. `canManagePosAdminRoleFromAccess`
  permette solo personale shop_owner. Metadati `owner_only_role_keys` includono
  pos_admin/courier e ruoli con permessi protetti. Non equiparare courier a pos_admin:
  è una restrizione specifica da preservare/valutare nel boundary corrente.
- Panoramica/settings/members, dispositivi, audit, storico mobile, POS live e
  ricavi: gap reader staff documentati sopra. Scritture dispositivi già presenti
  nel lifecycle non equivalgono a un percorso pagina leggibile e completo.
- Profilo shop e identità fiscale hanno il codice intenzionale
  `shop_settings_managed_by_master_console` in `action-context.ts` /
  `settings-mutations.ts`; pieno operativo non trasferisce titolarità legale.
- Getnet web non esiste. `/shop/history` è cronologia Android/iOS di catalogo,
  `shared_sheet_sessions` e attività sync, non registro storico degli incassi.
  Nuova superficie proposta `/shop/payment-history`, senza riuso delle tabelle mobile.

### Decisione proposta sui controlli owner-only

Conservare in B owner/platform per creazione/promozione/gestione di altri pos_admin,
reset delle loro credenziali, permessi protetti e titolarità. L'iniziale pos_admin
gestisce gli operatori ordinari del proprio shop senza poter aumentare il proprio
set, conferire a un delegato privilegi che non può delegare o aggirare il divieto
usando reset/riattivazione/cambio ruolo/template. Motivazione obbligatoria, audit
actor/target e conferma esplicita per azioni sensibili. Eventuale futura delega di
privilegi protetti richiede una capability separata e un flusso approvato con
riautenticazione; è una decisione ulteriore, non effetto del reader overview.

Le migrazioni TASK140 PIN/login e concurrency hardening contengono guard SQL e
trigger owner/platform: leggere le definizioni finali successive prima di una
patch. Non modificare migrazioni storiche già applicate; future migrazioni additive.

## Successivi operatori e permessi effettivi

`getEnabledStaffRolePermissions` legge `staff_role_permissions` per
`(shop_id, role_key, enabled=true)`, non per staffId. 1002/1003 con lo stesso ruolo
condividono il set. La UI esistente già dice che i permessi appartengono ai ruoli;
il link “creare/modificare ruoli” è da verificare perché `/shop/roles` oggi è una
matrice read-only e non crea ruoli.

B riusa i template esistenti: `catalog_manager`, `staff_manager`, `viewer`,
`courier_tracking` e `shop_manager_full` soltanto dove i controlli owner-only lo
consentono. Prima del salvataggio mostra ruolo, persone interessate e diritti
aggiunti/rimossi. Non promettere un override individuale oggi inesistente.

Se serve differenziare due persone con lo stesso ruolo nominale, raccomandazione
futura: ruoli personalizzati shop-scoped con template versionati, mantenendo
pos_admin/built-in protetti. Alternativa più costosa: override per account.

| Modello futuro | Precedenza e revoca | Caching/consumatori |
|---|---|---|
| Ruoli personalizzati (preferito se richiesto) | Un set esplicito per ruolo, nessuna unione nascosta; delegabili solo capability del grantor e mai protette. Cambio ruolo/set incrementa permissionRevision. Stato/credenziale/revoca prevalgono sempre. | Nuovi role key oggi non passano schema e predicate web: migrazioni, login/lease, POS e web devono supportarli insieme; rifiuto fail-closed sui client vecchi. |
| Override per account (solo decisione esplicita) | deny account > allow account limitato al delegabile > ruolo; nessun allow prevale su sospensione/revoca o owner-only. Mostrare l'origine di ciascun permesso. | Identità include staffId e permissionRevision; invalidare cache e sessioni interessate. Nuovo resolver effettivo comune per web, RPC e attestation POS. |

In entrambi: nessuna autoescalation modificando il proprio ruolo/set, revoca
effettiva al prossimo boundary, nuova verifica prima del commit/pubblicazione;
invalidare sessioni/cache e rispettare la durata delle attestazioni offline POS.
Non dichiarare revoca offline istantanea senza un contratto di lease aggiornato.
Questa estensione non è necessaria al primo B con template esistenti.

## UX Admin e importazione in tre passaggi

Badge composto da ruolo effettivo + ambito shop; metodo di accesso separato
(“codice negozio” / “account personale”). Per pos_admin: “Amministratore negozio”,
senza leggere `staffShellShop.role` come autorità. Menu da capability server e
copertura implementata. Fino al reader overview, landing sulla prima sezione
utilizzabile autorizzata (catalogo o Staff); courier conserva il proprio percorso.
Se non esiste sezione disponibile, messaggio operativo con accesso/assistenza,
senza dashboard vuota o zero inventati. Link diretti conservano i medesimi guard.

1. **Carica export originali.** `.xlsx` supportati, hash e riconoscimento da
   intestazioni. Elenco file e stato/progresso; nessuna conversione silenziosa.
   CSV di report resta output; CSV input non qualificato resta BLOCKED_INPUT.
2. **Controlla.** Periodo osservato per file, valuta, nuove/duplicate/respinte,
   cancellazioni/conflitti, lordo firmato/netto noto e copertura. Evidenziare
   sconosciuto e lacune; non equiparare righe respinte a ricavi. Richiedere soltanto
   le decisioni applicabili nella tabella sotto, mantenendo preview non applicabile
   leggibile quando manca una prova.
3. **Conferma e ricevuta/lotti.** Piano immutabile con hash originali, parser,
   mapping/policy revision, dataset revision e autorizzazione fresca. Una richiesta
   idempotente, progress/recupero dello stato dopo interruzione, ricevuta immutabile
   separata dallo stato corrente del lotto. Nessun secondo Apply per scoprire se il
   primo è riuscito. Undo distinto, con motivo e preview: disattiva il lotto,
   **non esegue un rimborso bancario**.

| Quando chiedere | Domanda comprensibile | Decisione tracciata / riuso |
|---|---|---|
| Legacy senza valuta esplicita | “Questi importi sono in CLP?” | Scope shop/formato/versione e fonte, conferma esplicita; niente default economico implicito. |
| Identità esercente non conosciuta | “A quale esercente verificato appartiene questo export?” | Binding alias → esercente canonico con documento pertinente e revisore. Nomi simili non fondono gruppi. |
| Moderni Z/offset non verificati | “Come rappresenta Getnet gli orari in questo formato?” con confronto dei due esiti | Documento provider o riscontro voucher/portale; stringa compilata non prova verificata. Conservare raw, offset, interpretazione, versione, fonte. Nessun fuso del PC. |
| Overlap reale o confine POS ignoto | “Quando è iniziato l'uso reale del POS? Questi movimenti sono già presenti?” | Fonte/data effettiva e riconciliazione; attestazione mai-usato conservata, installazione non è prima vendita. |
| Correzione di movimento inattivo | “Vuoi riattivare questa versione? Ecco le differenze.” | Approvazione su contenuto/revisione precisi, non conferma generica; conflitto attivo non sostituito. |

Mapping/policy già approvati si riusano solo se **verificati, versionati, pertinenti
a shop/esercente/formato/periodo e non revocati**. Un cambio file/policy/mapping o
permission invalida il piano. La V1 locale oggi conserva riferimenti testuali e
binding, non un archivio provider di prove verificate: migrare come
`legacy_attested`, senza promozione automatica a `provider_verified`.
IT/ES/EN/ZH, progress accessibile/aria-live, etichette esplicite, tastiera/focus,
errori associati al campo e ritorno al riepilogo senza perdere la sessione.

## Backlog eseguibile e ordine delle dipendenze

### A — Windows, Execution esistente

Finire qualifica del candidato congelato e verificare installer/manifest/hash,
backup prodotto/profilo preservato, avvio quotidiano e identità prima del PIN.
Percorso reale: login → shell autenticata vuota → riepilogo → storico volontario
→ chiusura → riepilogo → cassa con processo/sessione vivi. Vendita ancora negata
per catalogo vuoto. Solo lettura ricevuta/lotto e review legacy nuovi=0, mai Apply/undo.
Test mutazioni/pronto solo fixture isolate. Completare DPI100/125/200 e1024×768,
1024×600 limite documentato, ripristino200%/2880×1800. Win7 fisico e secondo monitor
assente restano NOT_RUN distinti. La guida Windows ora descrive la shell normale;
i risultati successivi restano nel suo PLAN/EXECUTION/report, non duplicati qui.

### B — Identità e copertura operativa Admin, futura Execution

| Ordine | Patch futura e file precisi | Accettazione / dipendenza |
|---|---|---|
| B0 | Baseline, inventario capability/azioni e migrazioni finali; `docs/ARCHITECTURE/SHOP-ADMIN-DUAL-ACCESS-MODEL.md`, `AUTHORIZATION-MODEL.md`, questo piano. | Contratto matrice approvato; chiarire che full operativo non è owner legale. Nessun uso recovery1001. |
| B1 | DTO ruolo/scope/metodo/capability in `access-principal.ts`, `data-access.ts`, `page-access.ts`; `src/app/shop/layout.tsx`, `src/components/shop/ShopShell.tsx`, landing `src/app/shop/page.tsx`, dizionari `src/i18n`. | Badge pos_admin corretto, landing utilizzabile, nessuna autorizzazione dal client/codice1001; negativi immutati. Può precedere il reader completo. |
| B2 | Nuovo reader overview session-bound nominale in nuova migration; wrapper in `staff-web-lease-bound-rpc.ts`, DTO in `read-model.ts`, stati in `shop-section-data.ts`/`ShopSectionPage.tsx` e overview route. Typegen `src/lib/supabase/database.types.ts`. | Shop derivato da sessione, actor/session/token hash/version/permesso rivalidati nella transazione e prima della pubblicazione; DTO limitato. Nessuna `.from(shops)` privilegiata staff con solo filtro browser. |
| B3 | Stesso modello per `device-read-model.ts`, `audit-read-model.ts`, `pos-live-read-model.ts`, `pos-revenue-read-model.ts`, `history-read-model.ts` (dominio mobile distinto), impostazioni/members per il solo scope consentito; nuove RPC limitate per superficie. Riusare `staff-aware-mutations.ts`, `staff-mutations.ts`, `device-mutations.ts`, `settings-mutations.ts`. | Lista/read/detail/export/action della stessa funzione coerenti per i due principal; gap espliciti fino alla consegna di ciascuna superficie. Nessun dato ricavi inventato, nessuna espansione owner-only. |
| B4 | `src/app/shop/staff/page.tsx`, `src/app/shop/_components/StaffActionPanel.tsx`, `staff-read-model.ts`, `staff-web-permissions.ts` e test. | Preview dell'effetto su tutti gli utenti del ruolo, template esistenti, lock server su set protetti, nessuna autoescalation. Ruoli custom/override rinviati se non richiesti. |
| B5 | Foundation, pgTAP/HTTP/e2e e sessione web servita; docs/handoff dello stesso ASUS019. | Tutte le operazioni dichiarate coperte hanno prove eseguite positive/negative; nuovo login non revoca pos_admin valido; revoca e modifiche permessi fermano query/commit stale. |

B2 non può chiamare `staff_web_staff_read_v1` fingendo sia un reader shop. Il
contratto SQL di tale RPC risulta attestato nelle prove della release servita ma
non compare come definizione nelle migration del checkout: prima di riuso/upgrade
acquisire preimage, ACL, digest e definizione autorevole, poi renderlo riproducibile
nel replay senza modificare retroattivamente migrazioni applicate. È una dipendenza
documentale concreta, non autorizzazione ad applicare SQL ora.

### C — Registro cloud e passaggio a unico import web, futura Execution

| Ordine | Contratto e patch future proposte | Gate |
|---|---|---|
| C0 — parità parser | Nuovo dominio `src/server/payment-history/`, corpus `tests/fixtures/payment-history/` e `tests/foundation/payment-history-*.test.mjs`; fixture canoniche versionate condivise con Win7POS. Leggere/adattare `GetnetExcelImportReader`, adapter legacy/modern e Core `HistoricalSalesTimeRules`, `HistoricalSalesValueRules`, `HistoricalSalesImportModels`. | Equivalenza byte/campi normalizzati/importi interi CLP, IDs leading-zero/precision, vendita/cancellazione/respinta, subtipo, netto unknown, date/offset e chiavi. Parser/versione nel piano; corpus sintetico senza dati reali. |
| C1 — ledger server | Migration additiva nuova, tipi generati; tabelle nuove per source upload, evidence policy, canonical merchant+alias, job, batch, movement version, osservazioni duplicate, receipt/audit e revision log. Permessi separati proposti `payment_history.read/import/cancel/export/migrate` con allowlist server/SQL, non `history.write` del catalogo. | Shop sempre dal principal; RLS per personale e RPC staff con lease, niente accesso browser privilegiato. Ricevute immutabili, stato batch separato; nessun insert in vendite native/stock/fisco/outbox commerciale. |
| C2 — import web | Route proposta `/shop/payment-history`, componenti wizard3passi e API upload/analysis/preview/commit/status; worker bounded riavviabile, storage privato e checksum. | Idempotency key legata a shop+actor+request digest; stessa chiave diverso contenuto = conflitto. Lease di lavoro con fencing, commit singolo, ripresa/receipt lookup dopo timeout. Revoca prima del commit impedisce applicazione. |
| C3 — migrazione locale | Win7POS futuro exporter di migrazione vicino a `HistoricalSalesImportService.cs`, manifest e reader server dedicati; backup prodotto, mapping localID→globalID e report riconciliazione. | Migrare dati, mapping/prove con livello corretto, original receipts, stato attivo/annullato e provenance device/dataset; registri locali non diventano UUID globali per semplice copia. Nessun write via outbox sales. |
| C4 — sync read dedicata | Endpoint versionato `/api/pos/history/...` proposto; Win7POS Core contratti, Data replica storico, WPF report origin/coverage; niente articolo artificiale. | Auth device/shop/lease dedicata; snapshot+keyset e revision cursor vincolati a shop/dataset, checksum/counts, revision gap→resnapshot, tombstone/undo propagati. Replica consultabile offline con watermark e stato stale espliciti. |
| C5 — cutover | WriterAuthority/epoch per shop, minimum client version, inventario di tutte le postazioni, disattivazione importer WPF futura dopo reconcile, web writer abilitato solo alla chiusura del gate. | Stesso export preesistente nuovi=0 e totali invariati; tutti i device convergono (anche undo); preesistenti consultabili, export confrontati e backup recuperabile. Una sola autorità di scrittura per shop. |

Identità globale proposta: `(shop, provider, canonicalMerchant, externalNamespace,
externalId)`, con movimento/versione e semantica coerenti con il parser V1, mai
soltanto hash del file. File identico, export sovrapposti, device diversi e retry
devono osservare lo stesso movimento. Payload differente su chiave attiva è
conflitto, non upsert che sovrascrive valori. Un batch duplicate-only non acquisisce
la proprietà del movimento; undo del proprietario propaga disattivazione e audit.
Alias/gruppi locali non provano identità globale: collisioni o corrispondenze
incerte richiedono evidenza, non merge automatico per nome/RUT incompleto.

Cutover concreto: prima snapshot/backup e upload di migrazione, poi blocco scritture
locali su tutte le versioni abilitate e drain dei job, riconciliazione freeze, infine
epoch server e web unico writer. Un vecchio POS offline non riceve un divieto remoto:
se non è aggiornato, ritirato o provatamente escluso dalle scritture, **C5 è BLOCKED**
e il web non diventa writer. Il nuovo client deve negare l'import locale quando non
può verificare la propria autorità. La consultazione resta disponibile. Nessuna
simultaneità di due writer indipendenti durante la fase di migrazione.

Rollback C: prima del cutover disabilitare il nuovo writer e recuperare il backup
locale verificato; dopo import cloud non riabilitare semplicemente il vecchio
writer. Congelare scritture, esportare/reconciliare ogni revisione cloud e tombstone,
ripristinare dati/mapping/receipt coerenti e assegnare un nuovo epoch solo dopo
convergenza. Conservare cloud/receipts/audit; nessun drop o purge per rollback UI.
Se la riconciliazione non passa, modalità consultazione e writer fermo.

## Verifiche future: comandi derivati dai runner, non eseguiti ora

Prima del codice Next, leggere la guida locale pertinente come impone AGENTS.
Su futura candidata B/C, in checkout isolato e con dipendenze locked:

```text
npm run typecheck
npm run security:scan
npm run lint
npm run build
node --test tests/foundation/asus-019-staff-overview-unavailable.test.mjs tests/foundation/task-039-staff-aware-shop-admin-completion.test.mjs tests/foundation/task-051-platform-provisioning-fiscal-pos-first.test.mjs
node --test tests/foundation/asus-019-served-staff-read.test.mjs
```

Aggiornare il primo file: oggi richiede intenzionalmente unsupported per
overview/members/settings. Aggiungere i positivi del reader implementato,
conservando denial, nessuna query prima di auth, payload errato, dati cross-shop,
segreti/colonne inattese, revoca prima di pubblicazione e reader realmente assente.
Foundation e test statici non sostituiscono SQL/HTTP/sessione reale.

Replay database canonico corrente, Linux/CI isolata con CLI2.109.0 e Docker:

```bash
python3 scripts/ci/mobile-recovery-local-replay.py run \
  --repo "$GITHUB_WORKSPACE" \
  --workdir "$RUNNER_TEMP/asus019-admin-local" \
  --evidence-dir "$RUNNER_TEMP/asus019-admin-db-evidence"
```

Derivato da `.github/workflows/ci.yml`, non un `db reset` del progetto linked.
Root nuove assolute; output error/complete anche se FAIL; nessun retry live
automatico. Estendere `supabase/tests/task_140_staff_pin_reset_login.sql` solo
per regressioni pertinenti e aggiungere file pgTAP nuovi overview/history/lease.
Verificare l'inclusione di ogni nuova migration/test nel manifest pinned del replay
prima di eseguirlo; aggiornare il manifest per la nuova candidata, non aggirare hash.

Runner browser esistente:

```text
node scripts/testing/run-playwright-target.mjs local tests/e2e/task-140-staff-pin-reset-login.spec.ts --project=chromium-desktop --workers=1
node scripts/testing/run-playwright-target.mjs staging tests/e2e/task-140-staff-pin-reset-login.spec.ts --project=chromium-desktop --workers=1
```

Sono comandi futuri con prerequisiti, non pronti da eseguire indiscriminatamente.
TASK140 richiede `CONFIRM_TASK140_STAFF_PIN_E2E=yes`, target esplicito, chiavi nel
canale segreto; locale richiede porta Supabase verificata
`TASK140_EXPECTED_SUPABASE_PORT`, workdir isolato e app loopback. Staging richiede
anche linked project/dev-staging coerenti, allowlist e denylist produzione,
`ALLOW_STAGING_E2E=yes`, `CONFIRM_TASK140_STAGING_SQL=yes` e gli URL verificati.
Il test TASK140 crea/resetta fixture: usarlo solo sul dataset sintetico autorizzato,
mai su NEW_SHOP_019. Derivare identico wrapper per nuovi
`tests/e2e/staging/asus019-admin-operations.spec.ts` e
`tests/e2e/staging/asus019-payment-history.spec.ts` (file futuri, oggi inesistenti).

Per ogni live: dichiarare target staging, SHA/tree/Worker servito e versione SQL,
dataset sintetico univoco, actor/metodo di accesso, azioni consentite, preimage,
backup/rollback, timeout e cleanup esatto. Manifest degli ID creati privato;
conteggio residue=0 obbligatorio, fallimento cleanup conserva FAIL. Nessun token,
PIN, URL con credenziali o dettaglio economico nei report condivisi. Metadati
reali disponibili soltanto se già in scope e redatti, senza reset per reperirli.

### Fixture e acceptance obbligatori

| Gruppo | Positivi | Negativi/invarianti |
|---|---|---|
| Identità | Provisioning1001→pos_admin, sessione nuova valida, stesso shop; personale owner/manager con membership valida. |1001 revocato resta revocato; email senza membership; cashier/viewer web; altro shop URL/API; scadenza/lockout/versione/cookie errati; nessuna promozione dal badge/codice. |
| Capability/azioni |1002/1003 template limitati, parità delle operazioni implementate tra principal, lettura vuota vera, pagina consultiva vera. | Permessi cambiati durante richiesta/sessione bloccano publish/commit stale; no autoescalation o gestione peer protetto; unsupported distinto da denial/backend. |
| Import | Legacy/moderni con prove verificate, preview/commit/receipt, duplicati tra file e device, interruzione prima/dopo commit e ripresa. | C mancante blocca Apply ma non preview; valuta ignota; alias incerto; sovrapposizione reale; file mutato; conflitti attivi; correzioni inattive non approvate; revoca durante job. |
| Migrazione/report | Active/annullato e receipt ricostruiti, offline/reconnect e resnapshot, POS/Getnet/both, coverage e netto unknown. | Stesso export non raddoppia totali; no doppia proprietà; undo converge; nessuna variazione vendite native, stock, cassa/fisco/outbox; zero distinto da sconosciuto. |
| UX | IT/ES/EN/ZH, desktop/mobile, zoom/tastiera/focus, errori operativi e stato progress/retry. | Nessuna perdita sessione chiudendo il wizard, nessun dettaglio tecnico come unica istruzione, nessuna azione UI abilitata senza corrispondente guard server. |

## Prestazioni, costo e recuperabilità

B: DTO overview bounded, query/index shop-scoped, niente scansione globale o N+1
identità. Riutilizzare cache per richiesta; niente cache cross-actor delle capability.
Budget proposto da misurare: overview p95≤1s con1000device/100staff e risposte≤256KiB,
nessuna query senza indice shop/chiave. Se il limite fallisce, conservare FAIL e
profilare, non alzare soglie per accettare il candidato.

C: proposta iniziale da validare su corpus:10file/job,20MiB/file,100MiB/job,
100000righe/job, espansione ZIP/memoria/celle bounded e rifiuto zip-bomb. Questi sono
limiti applicativi proposti, non limiti del provider attestati. Analisi in worker
bounded con code/backpressure; pagina movimenti≤200, chunk replica≤1000. UI non
blocca sul parsing; progress e cancel prima del commit, receipt lookup dopo.
Benchmark10k/100k/duplicati100%, memoria/CPU/query/egress e p50/p95 prima dei limiti
finali; nessuna promessa di tempo cloud dedotta dal solo runner locale Windows.

Parità economica non significa ampliare input senza limiti: la V1 Windows ammette
32 file, 32MiB/file,128MiB/selezione e100000 righe complessive, con limiti anche su
XML/celle/shared strings (`GetnetExcelImportReader.cs`). Se il web mantiene limiti
inferiori, spiegarli prima dell'upload e coprire gli stessi dati con job idempotenti
separati. La parità richiesta riguarda contenuto, decisioni e risultato; ogni
variazione di capacità deve essere deliberata e misurata.

Costo da stimare nella futura Execution con piano/provider effettivo e misure:
storage originali + versioni/revocation/audit, CPU parsing e retry, DB indici/backup,
egress replica e conservazione. Formula di preventivo: byte conservati×mesi +
job×CPU media + query/IO + byte replicati×device; registrare tariffa/data e volume,
senza inventare prezzi. Retention proposta: upload temporanei7giorni dopo ricevuta,
originali/evidence secondo periodo approvato e diritto d'accesso; ricevute/audit
non cancellati dal cleanup upload. Nessun log di riga finanziaria nel monitoraggio.

Rollback B: Worker precedente qualificato pinned; migrazioni additive compatibili
con vecchio client. Fermare la superficie nuova se auth/DTO/regressione; nessun
reset di credenziali o grant per ripristinare una pagina. Preimage/ACL/digest prima
di apply e verifica post-rollback. Storico147 FAIL e rollback non riscritti.

## Evidence, decisioni e passaggio di fase

Eseguito per questo Planning: status/fetch/log/diff Admin e letture mirate di
AGENTS, Master/task/handoff, sorgenti, migrazioni e runner sopra. Nessun gate npm,
SQL, HTTP o nuova sessione live eseguito. `git diff --check` documentale registrato
al salvataggio; le eventuali evidence precedenti mantengono SHA e data propri.

Decisioni proposte pronte alla review: mantenere pos_admin esistente, owner-only
protetto, template ruolo condivisi; nuova superficie incassi distinta da History
mobile; parser con corpus equivalente, ledger separato e unica write authority.
Decisioni ancora aperte prima di C Execution: fonte provider C per moderni; scelta
storage/worker e retention effettiva; inventario completo dispositivi/versioni per
cutover; eventuale requisito vero di permessi individuali. B reader non dipende da
C e non autorizza implicitamente C. Prova C assente non blocca la consultazione
legacy già valida né autorizza una interpretazione moderna arbitraria.

Prossimo passo A: chiudere i run5d8e704 e consegna reale già autorizzati.
Prossimo passo B dopo review/Execution: B0+B1, poi reader overview con boundary SQL
riproducibile e prove negative, senza recupero1001 o espansione owner-only.
C resta pianificata fino ai suoi gate. PASS richiede prove eseguite; FAIL/TIMEOUT
si conservano, BLOCKED nomina prerequisito/sblocco, NOT_RUN non è PASS_WITH_NOTES.
Nessun DONE senza accettazione esplicita dell'utente.

## Checkpoint incrementale —10novembre, componente in Execution

Contratto locale v2:17/17 test mirati PASS (554.9378ms), include proof/receipt
Int64 esatti e correzioni con economia precedente/proposta, contesto ed evidence.
Foundation completa precedente:1476PASS/7SKIP preesistenti; typecheck precedente
PASS. API device e ammissione/ingest del nuovo protocollo non ancora collegate.

Qualifica SQL delle sole fondamenta isolata su22c9cbc85d1daa611d722c82ad74b5e312cd5447,
ramo codex/asus019-local-publication-foundation, CI42892520753 in corso.
Migration20261110181221 SHA25637c752500ed849817169760f1f6b3e3409bbc81bd8320ac387425b7dc0f19276;
26 assertion aggiunte nel replay canonico Linux. Non è un rollout né attesta
l'implementazione dell'ammissione finanziaria o del trasporto automatico completo.
Nessun DB live toccato, worker provisionato o cutover; i75file/4664assert sono
attesi nel probe, non ancora PASS. Il ramo151/WIP resta distinto da questa prova.

Raccordo Windows:136/149c978 CI15/15+functional22/22 e Security verdi; payload WPF
40file verificato, Release42889654511 in corso. Installato2ad42ca invariato.
Client135 WIP: ricevute recuperabili/lineage/gate/UI notificata con test propri;
backfill originale e E2E autenticato POS A/Admin/POS B ancora NOT_RUN.
Handoff TASK146 aggiornato nel commento6722613449 con storia immutata.
Stessa ASUS019 ACTIVE, nessuna nuova task, merge/deploy o DONE.

<details>
<summary>Checkpoint corrente precedente, conservato10novembre21:00Z</summary>

## Stato corrente — B/C implementati e qualificati nel draft, nessun rollout

Checkpoint 10 novembre: codice Admin PR151 su 6c2bd41407ebc48ec3b0d240934e10235575ea31,
CI42822197960 e Build42822197996 SUCCESS. Replay SQL isolato Linux: 74 file,
4638 assertion, comprese 39 nuove su revoca profilo personale e GC temporanea.
Foundation locale: 1460 PASS / 7 SKIP preesistenti; boundary 29, browser mirati 11
(totale storico 19), typecheck/lint/security/build PASS con attribuzione propria.
Migrazione additiva 20261110124034: SHA256
866867a3d444fc137731c616d3f5af5cd4d11a29070c0d33e8dc5dcf808fec64.
Le frasi Planning/NOT_IMPLEMENTED/PENDING sottostanti sono checkpoint storici.
Nessun deploy, SQL live, cutover, installazione cloud o Apply/Undo originale.

Client futuro PR135 ora 9cfe193: incorpora con patch controllata i fix comuni
carrello/scanner/sync di cc6128f e conserva payment-history. Qualifica propria
richiesta; due FAIL b0307d4 nel budget storico di 60 secondi restano conservati.
Consegna Windows corrente PR136 distinta: nuovo ingresso nella vera postazione
senza attendere catalogo; candidato cc6128f in qualifica, installato 2ad42ca.
WPF remota verde; Release Pack cc6128f FAIL per un falso positivo nel worklog,
correzione documentale ancora pendente. Nessun PASS trasferito all'installato.

Il percorso quotidiano separa disponibilità locale qualificata, postazione,
ultima copia pubblicata e singole operazioni. L'analogo principio mobile è in
handoff al coordinatore TASK146 dopo lettura del suo task/codice; nessun test
mobile attribuito ai gate Windows. Scala Windows 200% mantenuta; 100/125 differiti,
Win7 fisico indisponibile, prova provider C moderna mancante. Execution ACTIVE,
nessun DONE. Questo aggiornamento è solo documentale: runtime/Admin invariato.

</details>
