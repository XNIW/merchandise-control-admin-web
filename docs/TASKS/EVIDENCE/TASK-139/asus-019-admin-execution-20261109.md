# ASUS019 — Execution Admin B/C, preparazione senza operatore

## 12 novembre — causa PUT riprodotta e nuovo delta UX

PR153 è unita in7d94271, versione live1a7c6e27. Osservazione naturale della
baseline già pendente: HTTP503, fase put_storage_source, TypeError,1798ms.
Workerd riproduce il difetto redirect:error prima di ogni richiesta in uscita.
Successore manual: soltanto2xx accettati, nessun redirect seguito. Test nativo
RED conservato e GREEN; foundation1661totali/1654PASS/0FAIL/7SKIP, typecheck,
lint mirato e security scan PASS. Prove private U19HistorySourcePut01;
gate remoti, freeze/merge/deploy e avanzamento della baseline ancora NOT_RUN.
Contratti economici/auth/hash/origine/timer invariati; nessun DDL o installer.
Arresti Worker distinti con causa non dimostrata, nessun restart/rekey manuale.

Recepito addendum importazione Getnet nella stessa Execution ACTIVE:
riconciliazione mensile privata, stati UI e callback obsoleti, percorso guidato,
resolver di prove qualificate/revocabili, report onesto sulle componenti e sui
giorni senza dati, operazioni tecniche Master protette server-side. Nuovi gate
UX e consegna Windows NOT_RUN. Conservare248/v6, ledger e autorità writer.
Getnet C resta mancante e impedisce l'apply moderno; nessuna prova di giugno
estesa implicitamente ad agosto, nessun paywall o nuova task.

L'ultimo addendum di convergenza mantiene due consegne correnti: cassa quotidiana
e storico bilaterale. La precedente matrice di altri domini rimane storica.

Addendum utente 10 novembre: sincronizzazione automatica POS→Admin→altre
postazioni nella stessa Execution. Gap confermato e contratto condiviso nel
[piano canonico](../../../ARCHITECTURE/ASUS019-ADMIN-OPERATIONS-HISTORY-PLAN.md).
Baseline iniziali storiche151/43f668df e135/fbdde199; consegna136 separata.
SHA correnti, qualifiche, rollout effettivo e residui sono nella tabella
sottostante. Nessun PASS pregresso trasferito e nessun DONE.

Chiarimento bilaterale recepito: matrice per dominio e operazione nel medesimo
CLOUD-CONTINUATION Windows, contratto coordinato nel piano Admin. Replica storica
in background e pubblicazione locale sono implementazioni distinte; invio vendite
non equivale a consultazione dei registri inter-postazione. I singoli E2E,
component test e build restano classificati separatamente nella tabella corrente.

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

<details>
<summary>Checkpoint precedente182455Z conservato come storia</summary>

## Stato corrente — 20261112T182455Z, stessa ASUS-W7POS-019 ACTIVE

| Ambito | Prova e risultato corrente |
| --- | --- |
| Requisito ordinario | Autorizzazione POS e PIN Minimondo senza scadenza, come richiesto esplicitamente. Il modello negoziato `persistent-pos-v1` salva autorità DPAPI v6 con testimone HKCU persistente indipendente dal backup. PIN, binding, generazione, versione, tentativi e revoche note restano verificati. Nessuna licenza futura introdotta; vecchie ricevute v1–v5 restano bounded. |
| Installato reale | Nuovo248e689 installato dopo un solo UAC umano: setup exit0,41file hash-esatti,17file del profilo conservati,Start verificato. Readback indipendente PASS, EXE SHAdec0d531. Nessun avvio automatico; primo/secondo Start/PIN reali ancora NOT_RUN al checkpoint. Precedente aa4 e relativo loginFAIL conservati come storia. |
| Windows248 qualificato | PR138, 248e6891dcab5ce086c36b0fbec1c66ffb487344. All43248176976 PASS16/16, artifact13960748887/SHA2f2c9486 verificato8entry; Security43248176453 PASS; Release43248317257 verificata41file/110checksum, setup15f1e9f2/payloadccfc0b7f. QA43248326349 verificata40file,34comuni esatti. MainWindow dal bundle esatto PASS29205.7167ms, cleanup naturale. Core46/46, smoke WPF bounded/permanente e processi CLR distinti, statico/dialog PASS. |
| ASUS sul payload esatto | Integrated12 PASS740.778s e Final60 PASS3606.695s: tutti tre flag misura/ambiente/stabilità validi, exit0 e cleanup naturale. UI p95 Rows115.415ms/Grid117.887ms, massimi255.563/165.290ms; limiti preregistrati p95≤250ms e massimo≤1000ms invariati. Crescita managed massima1.545MB sotto8MiB. Budget SHA63970e30,41file prodotto e34comuni QA esatti. Non è una qualifica Win7 fisico o periferiche. |
| Merge Windows | PR138 unita normalmente in92dff410e241e5ee7c2a42a82ef4615b624537d5; albero8ae8b6bd identico248. Postmerge Security43272055077 PASS; CI43272054951 FAIL15PASS/1FAIL nello HIST_LOAD_50K. Artifact13970438026/SHA0e3672dc e8entry verificati: measurementCompleted=false per2campioni dispatcher e1memoria persi; environmentValid/thresholdsPassed=true, tutti gli altri assertLoadPASS. Nessun rerun automatico né soglia ridotta. Release43272054924 ancora RUNNING; cassa selezionata248 con le proprie qualifichePASS, distinto dal residuo della misura storica. |
| Server qualificato | b091325, PR152 unita normalmente in5ff8577; albero b5058dd2 identico al candidato e al virtual merge956176f. Verify/CF propri43251761879/881 e main43258018081/735 PASS. Artifact58file/lock/config e replay97file/5356assert/3concorrenze verificati anche dopo merge. FAIL9ec e332 conservati: metadata replay/lint, poi regressione della rilettura clock dopo lock; b091 ripristina integralmente il corpo canonico prima dei soli due controlli di invalidazione persistente. |
| Storico autenticato nuovo composto | Run43254453360, serverb091/client248, PASS12/12 eSQL97/5356/3; artifact13961554676/SHA5849729d verificato. Admin→entrambiPOS senza eco, ACK perso+nuovo CLR/pull prima ACK, duplicato/Undo/correzione, revoca isolata, HTTP409/history_cloud_writer_closed con zero nuovi grant/ricevute, Recovery/baseline e riconciliazioni senza nuovi movimenti; cleanup naturale. Principal bounded posseduti: prova Core/Data+HTTP+SQL+Storage+Worker+browser distinta dall’enrollment permanente WPF reale. Run23 server612/clientaa4 e precedenti qualifiche restano storia attribuita. |
| SQL effettivamente applicato | Solo nuova migrazione20261112143448_asus019_persistent_pos_authorization_v1.sql, SHA29bd59ef; versione cloud20261112174421. Tre corpi funzione esatti, V3 precedente invariata, nuovi RPC riservati a service_role e helper privato non eseguibile direttamente. Nessun dbpush/repair globale o modifica alle29migrazioni storiche. PIN: soltanto l’operatore Minimondo ha scadenzaNULL, versione1 e PIN invariati. Conteggi cloud movement_versions/job/upload/migrationrun0 prima/dopo. |
| HTTP effettivamente pubblicato | Version ecfd6920-bef3-441e-99f6-2a1b83aaf498, deployment8a732699-a226-40cd-a43c-4868f258826c al100%. Artifact congelato13960220868/SHAcd1e6ebe, sorgente956/treeb5058dd2, Wrangler4.123.0 con no-bundle/keep-vars, nessun rebuild. Tutti24binding e runtime conservati; metadati non-assets esatti, chiave gateway mantenuta senza lettura/rigenerazione. GET protetto e form staff HTTP200. Dopo deploy77richieste firmate riuscite, tutte tre lane idle e0risposte con lavoro. |
| Worker operativo osservato | Host7c95955/runtime612 CJS20eb2acd invariato, qualifica host5/5 e pacchetto7 verificato; Node24.18.0/account virtuale/DPAPI/ACL, limiti nativi1GiB/un processo e heap640MiB. Stesso PID7208 running nel controllo17:54Z; nessun reinstall/rekey/restart manuale del servizio. FAIL iniziali57014/exit1 conservati. Dopo unico restart database15:24Z ripristinate le tre lane; osservazione idle prolungata, non garanzia di disponibilità notturna. Host richiede PC acceso. |
| Consegna cassa installata | Backup17file e3DB integrityok/FK0, conteggi115tabelle conservati. Manifest12ricevute/41file SHAe66309b6 validato prima del consenso; installer canonico15f1e9f2 concluso18:22:55Z,nessun reboot richiesto. Cash-only: Worker/chiavi invariati, POS lasciato chiuso. Atteso Start/PIN mascherato umano ed effettivo enrollment v6 del vecchio format4. Copia separata Win7-transfer248 byte-esatta del ReleasePack SHAeeb50b3f,nessun dato del negozio aggiunto; kit1823697 invariato. |

Checkpoint unico privato aggiornato20261112T182455Z. Restano primo login→carrello/barcode→riepilogo→ritorno, seconda apertura offline e riavvio Windows reale. UAC completato e cassa248 installata; nuova autorizzazione reale non ancora attestata. Residuo indipendente HIST_LOAD_50K: osservazione incompleta conservataFAIL, domanda diagnostica prima di ogni nuova prova; nessun cambiamento al protocollo per trasformarla inPASS. Le prove sintetiche di autorità in processi distinti e oltre il vecchio limite sonoPASS; nessun reboot fisico dichiarato. Revoca server sconosciuta mentre offline non è rilevabile immediatamente.

Win7 fisico BLOCKED_TARGET; periferiche NOT_RUN; Getnet C MISSING e tre moderni non applicati. DPI200%/2880×1800 conservati,100/125 USER_DEFERRED. Nessun Apply/Undo/reimport reale, articolo, vendita di prova o cancellazione di profilo/code. FAIL intermedi e ricevute storiche conservati, nessuna soglia/assert/pin indebolita. Nessun DONE globale.

Advisors dopo DDL conservati come inventario: [RLS senza policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [RPC anonime](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC autenticate](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [protezione password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nessun finding di execute pubblico per la nuova V4; permessi live verificati separatamente. Policy estranee non modificate.

</details>

<details>
<summary>Checkpoint precedente175420Z conservato come storia</summary>

## Stato corrente — 20261112T175420Z, stessa ASUS-W7POS-019 ACTIVE

| Ambito | Prova e risultato corrente |
| --- | --- |
| Requisito ordinario | Autorizzazione POS e PIN Minimondo senza scadenza, come richiesto esplicitamente. Il modello negoziato `persistent-pos-v1` salva autorità DPAPI v6 con testimone HKCU persistente indipendente dal backup. PIN, binding, generazione, versione, tentativi e revoche note restano verificati. Nessuna licenza futura introdotta; vecchie ricevute v1–v5 restano bounded. |
| Installato reale | Ancora aa4ec25, EXE SHA f2f75be2, Start/profilo verificati. Primo login reale FAIL: first-login timeout, fallback offline_attestation_required mostrato genericamente come scaduto. POS chiuso dall’utente. Installazione248 e primo/secondo avvio reale NOT_RUN: non attribuire al pacchetto nuovo il precedente smoke reale d1b. |
| Windows248 qualificato | PR138, 248e6891dcab5ce086c36b0fbec1c66ffb487344. All43248176976 PASS16/16, artifact13960748887/SHA2f2c9486 verificato8entry; Security43248176453 PASS; Release43248317257 verificata41file/110checksum, setup15f1e9f2/payloadccfc0b7f. QA43248326349 verificata40file,34comuni esatti. MainWindow dal bundle esatto PASS29205.7167ms, cleanup naturale. Core46/46, smoke WPF bounded/permanente e processi CLR distinti, statico/dialog PASS. |
| ASUS sul payload esatto | Integrated12 PASS740.778s e Final60 PASS3606.695s: tutti tre flag misura/ambiente/stabilità validi, exit0 e cleanup naturale. UI p95 Rows115.415ms/Grid117.887ms, massimi255.563/165.290ms; limiti preregistrati p95≤250ms e massimo≤1000ms invariati. Crescita managed massima1.545MB sotto8MiB. Budget SHA63970e30,41file prodotto e34comuni QA esatti. Non è una qualifica Win7 fisico o periferiche. |
| Merge Windows | PR138 unita normalmente in92dff410e241e5ee7c2a42a82ef4615b624537d5; albero8ae8b6bd identico248. Postmerge Security43272055077 PASS; CI43272054951 e Release43272054924 ancora RUNNING al checkpoint. Resta selezionato il pacchetto248 già qualificato, senza sostituirlo con un diverso versionstamp di main. |
| Server qualificato | b091325, PR152 unita normalmente in5ff8577; albero b5058dd2 identico al candidato e al virtual merge956176f. Verify/CF propri43251761879/881 e main43258018081/735 PASS. Artifact58file/lock/config e replay97file/5356assert/3concorrenze verificati anche dopo merge. FAIL9ec e332 conservati: metadata replay/lint, poi regressione della rilettura clock dopo lock; b091 ripristina integralmente il corpo canonico prima dei soli due controlli di invalidazione persistente. |
| Storico autenticato nuovo composto | Run43254453360, serverb091/client248, PASS12/12 eSQL97/5356/3; artifact13961554676/SHA5849729d verificato. Admin→entrambiPOS senza eco, ACK perso+nuovo CLR/pull prima ACK, duplicato/Undo/correzione, revoca isolata, HTTP409/history_cloud_writer_closed con zero nuovi grant/ricevute, Recovery/baseline e riconciliazioni senza nuovi movimenti; cleanup naturale. Principal bounded posseduti: prova Core/Data+HTTP+SQL+Storage+Worker+browser distinta dall’enrollment permanente WPF reale. Run23 server612/clientaa4 e precedenti qualifiche restano storia attribuita. |
| SQL effettivamente applicato | Solo nuova migrazione20261112143448_asus019_persistent_pos_authorization_v1.sql, SHA29bd59ef; versione cloud20261112174421. Tre corpi funzione esatti, V3 precedente invariata, nuovi RPC riservati a service_role e helper privato non eseguibile direttamente. Nessun dbpush/repair globale o modifica alle29migrazioni storiche. PIN: soltanto l’operatore Minimondo ha scadenzaNULL, versione1 e PIN invariati. Conteggi cloud movement_versions/job/upload/migrationrun0 prima/dopo. |
| HTTP effettivamente pubblicato | Version ecfd6920-bef3-441e-99f6-2a1b83aaf498, deployment8a732699-a226-40cd-a43c-4868f258826c al100%. Artifact congelato13960220868/SHAcd1e6ebe, sorgente956/treeb5058dd2, Wrangler4.123.0 con no-bundle/keep-vars, nessun rebuild. Tutti24binding e runtime conservati; metadati non-assets esatti, chiave gateway mantenuta senza lettura/rigenerazione. GET protetto e form staff HTTP200. Dopo deploy77richieste firmate riuscite, tutte tre lane idle e0risposte con lavoro. |
| Worker operativo osservato | Host7c95955/runtime612 CJS20eb2acd invariato, qualifica host5/5 e pacchetto7 verificato; Node24.18.0/account virtuale/DPAPI/ACL, limiti nativi1GiB/un processo e heap640MiB. Stesso PID7208 running nel controllo17:54Z; nessun reinstall/rekey/restart manuale del servizio. FAIL iniziali57014/exit1 conservati. Dopo unico restart database15:24Z ripristinate le tre lane; osservazione idle prolungata, non garanzia di disponibilità notturna. Host richiede PC acceso. |
| Consegna cassa preparata | Backup17file esatti e3DB integrityok/FK0, conteggi115tabelle conservati. Manifest qualified-cash248-windows-paths SHAe66309b6 collega12ricevute e41file; ValidateOnly exit0 riconferma pacchetto e profilo invariati. Installer canonico15f1e9f2 non ancora avviato: disponibilità umana richiesta per un solo UAC. Script cash-only lascia POS chiuso e non tocca Worker/chiavi; poi Start/PIN mascherato manuali ed effettivo enrollment v6 del vecchio format4. |

Checkpoint unico privato aggiornato20261112T175420Z. Restano intervento UAC e prove sull’installato: primo login→carrello/barcode→riepilogo→ritorno, seconda apertura offline e riavvio Windows reale. Le prove sintetiche in processi distinti e oltre il vecchio limite sono PASS; nessun reboot fisico dichiarato. Revoca server sconosciuta mentre offline non è rilevabile immediatamente.

Win7 fisico BLOCKED_TARGET; periferiche NOT_RUN; Getnet C MISSING e tre moderni non applicati. DPI200%/2880×1800 conservati,100/125 USER_DEFERRED. Nessun Apply/Undo/reimport reale, articolo, vendita di prova o cancellazione di profilo/code. FAIL intermedi e ricevute storiche conservati, nessuna soglia/assert/pin indebolita. Nessun DONE globale.

Advisors dopo DDL conservati come inventario: [RLS senza policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [RPC anonime](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [RPC autenticate](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [protezione password](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Nessun finding di execute pubblico per la nuova V4; permessi live verificati separatamente. Policy estranee non modificate.

</details>

<details>
<summary>Checkpoint precedente153827Z conservato come storia</summary>

## Stato corrente — 20261112T153827Z, stessa ASUS-W7POS-019 ACTIVE

| Ambito | Sorgente / prova | Esito attribuito |
| --- | --- | --- |
| Installato reale | aa4ec25, U19CashAa4Install01/U19PersistentPosAuth01 | INSTALLATO41/profile13 conservato,EXE f2f75be2 e Start umano verificati. Login FAIL: first-login timeout e fallback offline_attestation_required, tradotto genericamente come scaduto. Trust reale format4; navigazione e secondo Start aa4 NOT_RUN. Nessun nuovo PIN richiesto durante implementazione. |
| Nuovo requisito autorizzazione | Windows248e689/PR138;server3322b6c/PR152 | IMPLEMENTATO,in qualifica,non installato/distribuito: negoziazione persistent-pos-v1,grantDPAPIv6/testimoneHKCU persistente,heartbeat conserva autorità,timerlogout assente. Core46/46,WPFbounded+permanente/processi distinti,statico/dialog PASS. CI/SQL/Release/ASUS propri ancora da verificare; nessun PASS aa4 trasferito. |
| PIN operatore | risposta esplicita utente12novembre;pin-deadline-applied.private.json | Rimossa soltanto la scadenza14giorni dell’operatore Minimondo:1riga,versione e PIN invariati,cambio manuale/revoca mantenuti. Nessun segreto letto o salvato; altre policy staff invariate. |
| Prima CI nuova modalità | server9ec,run43247498459 | FAIL conservato: metadata di ordinamento replay mancanti e variabilemodule nel nuovo fixture lint. Successore332 aggiorna hash esatto/25assert e nome loader,guardia originale mantenuta; nuovo replay in corso. |

| Offline indipendente | fe069a1, PR137, merge e6ce2ee | PASS Windows15/15,Security2/2,Release41/110,QA40,ASUS Integrated12+Final60. Riapertura in CLR distinti con positivi/negativi; reboot/logoff offline BLOCKED_TIME_CONTINUITY. Postmergee6 CI43153357858,Security43153357836 eRelease43153357805 PASS. |
| Composto cassa+storico | aa4ec25, PR135, merge0705b4ca27cc083ae95a59c1e13db041848d1a7d | PASS All43136421196 (16/16),Security43136426122 (2/2),Release43136430945 (41/110),QA43136435344 (40),ASUS Integrated12+Final60,tre flag misura validi. Main ha lo stesso albero2e768143b9e0897280d014229357e3228e5b2a7f del candidato. Postmerge0705 CI43153687268PASS16/16 conartifact verificato8entry,Security43153687263PASS2/2,Release43153687291PASS e download41/110. Mainpacket diverso nel versionstamp,non ASUStestato/installato: sul PC è installatoaa4 qualificato12+60. Run e6 conservate. Installato41/profile13; prova umana corrente distinta. |
| Coppia storica finale | server612d9bd/clientaa4ec25, run43137863338 | PASS12/12 eSQL96/5331,artifact13909032440/SHA4b07396b verificato. HTTP409/history_cloud_writer_closed reale,zero grant/receipt,Admin→entrambiPOS senza eco,revoca isolata,ACK perso+nuovo CLR,Recovery/baseline e due riconciliazioni senza nuovi movimenti,cleanup naturale. Anche22/server612-client1f PASS12/12 e96/5331. Copertura Core/Data+HTTP+SQL+Storage+Worker+browser, distinta dal WPF installato/Win7. |
| Host Windows | 7c959553d77416a1620ccfa53fb5be15a85db291,run43152837911 | Qualifica PASS5/5 e pacchetto7 verificato, CJS20eb2acd esatto della prova23. Servizio realmente INSTALLATO con Node24.18.0,account virtuale,DPAPI/ACL,limiti nativi1GiB/un processo e heap640MiB. Primo avvio e recuperi SCM: child_exited/exit1; picco privato circa63MB,nessuna prova di superamento memoria. Disponibilità staging limitata al PC acceso,nessun Node sul Win7. FAIL iniziali conservati. Dopo unico restart database,processo7208 mantenuto e177richieste firmate accettate nelle tre lane; osservazione stabilità ancora in corso,nessun riavvio manuale servizio. |
| SQL staging | sorgente612,29 file canonici/SHA invariati | APPLICATE soltanto le29 migrazioni della task,171→200 registrazioni; mapping versione sorgente→cloud conservato. PASS47tabelle con RLS/PK,nessuna lettura anonima/diretta service-role,6corpi critici esatti e5dipendenze precedenti invariate. Snapshot iniziale preinstallazione:runtime/movimenti/job/ricevute/grant/eventi0;ricontrollo aggregato corrente fallito per timeout e non assunto invariato; bucketprivato20MiB con MIME previsti.6pendenti estranee e7alias preesistenti esclusi; nessun dbpush/repair globale. |
| HTTP staging | 612d9bd,version4a2ef3eb-485b-4848-83a0-ddae22cb1b35,deployment688beeab-5d47-41dd-b52e-eefe9cfb5fa2 | Chiave dedicata generata durante installazione,protetta DPAPI/ACL e inviata soltanto via stdin. Clone versione dopo secretput: script/runtime e tutti i binding precedenti ESATTI rispettofaf9;unica aggiunta PAYMENT_HISTORY_WORKER_GATEWAY_SECRET. Nessun rebuild/deploy codice nuovo. Gateway unsigned403;almeno una richiesta firmata accettata13:33:28Z. Accettazione singola distinta dal servizio stabile,ancora FAIL. Nessun valore segreto letto nei report. |
| Convergenza Admin | PR149→84172406,PR150→ea9cfec2,PR151→0d61aaeb2312acdfdaab29df9ca0267e57920b2c | Tre merge normali;tree151 a1c92b64 identico7c. CI7c43153578202/CF43153578259PASS;artifact58file13915165978/SHA191a58f8 e replay96/5331/3concorrenze13915811332/SHA9d2300e4 verificati. Main0d61 CI43155600313/CF43155600256PASS,58file artifact13915862293/SHAfa28c580 eSQL96/5331/3concorrenze13915853428/SHA529b86bc verificati;nessun nuovo deploy da main. CI intermedia14943153580626 CANCELLED automaticamente per i merge149/150 ravvicinati,esito conservato e non contatoPASS;150CI43153635083/CF43153635103PASS. |
| Installazione eseguita | U19CashAa4Install01 e U19HistoryWorkerHost7C9501 | Backup coerente integrity/FK e copia13file verificati prima della manutenzione. Un solo consenso UAC accettato,setupaa4/SHA722b4cf9 terminato exit0,41file prodotto e13file profilo verificati,host7c installato. Ricevute separate per installazione riuscita e fallimento operativo successivo;non ripetere installer né generazione chiave. |

| Diagnosi servizio reale | U19PersistentPosAuth01/backend-restart-observation.private.json | Timeout57014 precedenti su gateway e servizi estranei; metriche autentiche mostrano commitment1.59GiB SEVERE,swap622MiB e95.2%RAM nel campione11:51locale. Singolo restart Dashboard,Postgres riavviato15:24:07Z,controllo1.9s/0blocker;177richieste firmate e tre forme idle. Conteggi cloud movement_versions/job/upload/migrationrun0 alle15:32:14Z. Causa specifica non dimostrata,nessun cambio configurazione/billing/chiave né restart manuale Worker. |

Advisors conservati: [RLS senza policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) intenzionale per tabelle interne negate per default; [cinque RPC SECURITY DEFINER autenticate](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) con fence attore/shop/sessione/permessi qualificati. [INFO sulle FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) e indici nuovi registrate senza estendere la patch; finding preesistenti conservati. FirstFAIL checkout/account virtuale e due errori del controllo pubblico conservati,nessun deploy ripetuto per quei controlli.

Nessun Apply/Undo/reimport reale, articolo o vendita di prova. GetnetC MISSING; Win7 fisico BLOCKED_TARGET; DPI200%/2880×1800 invariati,100/125 USER_DEFERRED. Reboot offline ancora distinto dalla riapertura app. Execution ACTIVE,nessun DONE globale. Installazione PASS,prima richiesta firmata accettata e servizio stabile FAIL restano distinti;Nuovo grant richiede accesso online valido dopo qualifica/installazione; aa4 ha login FAIL documentato. La regola offline reboot legacy resta storica,il nuovo modello v6 non usa una scadenza ordinaria; qualifica hardware Win7 distinta. Diagnosi timeout: [guida Supabase](https://supabase.com/docs/guides/database/postgres/timeouts).

</details>

<details>
<summary>Checkpoint precedente235241Z conservato come storia</summary>


## Priorità installato/offline — 20261111T235241Z, stessa ASUS-W7POS-019 ACTIVE

Il nuovo addendum separa la consegna della cassa dal residuo storico indipendente.
Identificazione read-only: Start punta al Program Files installato; processo vecchio
2ad42ca, proprietario del DB Minimondo atteso. I Recent pertinenti sono link a una
cartella sorgenti e a uno ZIP, non EXE alternativi. Origine esatta del clic iniziale
non attestata. Nessuna riscrittura di MainWindow: correzione già qualificata in d1b.

Cassa d1b2bc318c8a0aecce9543dc6a96f9a1aaf7cfc3 installata tramite setup canonico
SHA a07430ce29e60eb04d2bc23651ab905beac3bf6ed6e8e12479e83ac230f2bb8e,
Release42967017718. Compatibilità:15 migrazioni esatte,0pendenti/ignote/checksum
divergenti; schema storico,formato trust e contratti HTTP invariati rispetto2ad.
Backup prodotto verificato/integrity+FK e copia completa13file hash-identica;
installer non ha alterato il profilo.41file installati corrispondono al pacchetto.
Log installer: successo/no reboot; exit code non catturato, non inventato.
Nuovo processo8128 da explorer, EXE/versione/hash e proprietà dello stesso DB
verificati. Primo accesso reale: carrello vuoto e barcode disponibili, sync
non modale; sconosciuto apre quick-create esistente, annullata senza salvare;
riepilogo volontario→POS, focus scanner provato digitando e cancellando un
marcatore. Conteggi prodotti/vendite/outbox/storico invariati. Chiusura normale.
Secondo avvio reale NOT_RUN (avvio/PIN mascherato manuali); scanner fisico NOT_RUN.
Qualifiche d1b riusate sul pacchetto identico; nessuna nuova soak per il link.

Offline: d1b mantiene il contratto process-scoped e NON soddisfa la riapertura.
Successore separato da d1b in codex/asus019-offline-reopen. Modello da implementare:
attestazione DPAPI v5 con identità profilo/dispositivo/generazione/operatore e
versione credenziale; testimone protetto fuori dal backup profilo che vincola
esattamente la ricevuta e conserva clock monotono/high-water/tombstone di revoca.
Un nonce volatile per sessione Windows rende distinguibile la perdita della
continuità di boot; QPC avanza il tempo server fra processi senza affidarsi solo
all'orologio civile. File vecchi/alterati/altro profilo o device non riattivano
l'autorità. Mirror/PIN/tentativi e durata esistente <=12h,scadenza staff/sessione
restano obbligatori; nessuna password recuperabile. Prove positive e negative
in processi distinti prima di cambiare l'aspettativa dello smoke.
Riavvio Windows offline BLOCKED_TIME_CONTINUITY: senza clock sicuro attraverso
lo spegnimento non è provata la durata trascorsa; nuova attestazione online dopo
reboot, non semplice rimozione del nonce. Test di reboot simulato/clock rollback
deve negare. Supporto reale del reboot non dichiarato; prossimo passo scegliere
un'origine temporale verificabile compatibile Win7 e qualificarla su target.
Prima attivazione senza trust negata; perdita rete nello stesso processo resta
distinta da blocco/sblocco,nuovo processo e reboot. Revoche server sconosciute
durante offline non rilevabili immediatamente.

Storico preservato: All93fd run43114242774 FAIL15PASS/1FAIL nel crash
HIST_B_COMMIT_AUTHORITY; artifact13899494374 SHA1a8ebfcf verificato (8entry).
Release43114234648 PASS packaging, non installato/qualificato globalmente.
Cinque nuovi assert WPF mancavano nei due cataloghi QA: fix2file da qualificare,
83check protocollo PASS, nessuna assertion precedente rimossa. SQL2c/Remote17
FAIL prima degli assert per duplicato permesso nel seed; fix2024819 idempotente
circoscritto al fixture,nuova run necessaria. Remote15/16 nove casi reali PASS
propri ma overallFAIL; timeout non accettato come writer_closed.

Autorizzata dall'utente l'esecuzione automatica notturna. Nessun nuovo consenso
operativo richiesto; desktop protetto e blocchi strumento rispettati. Nessuna
vendita/import/Undo reale,nessun nuovo prodotto,soglia o timeout indebolito.
200%/2880x1800 conservati,100/125 USER_DEFERRED,Win7fisico BLOCKED_TARGET.
Stati cassa,offline,storico e target fisico distinti; nessun DONE globale.


## Checkpoint storico precedente — 20261111T230040Z, stessa ASUS-W7POS-019

Execution ACTIVE: cassa quotidiana e storico bilaterale. Tutti i file necessari
autorizzati dall'utente. Qualifiche riferite agli SHA e agli artefatti seguenti;
documentazione in checkout separati, candidati delle run attive congelati.

| Scenario | SHA / comando / ambiente | Esito ed evidence | Prossimo gate |
|---|---|---|---|
| Windows composto | 6cdaa2988030b3a140493d6239c8d5007603f55c; Windows-All43080480557, Security43080480554 | PASS16/16 e due job Security PASS; U19Win6cRemote01 verifica8entry, artifact13886737547 SHA2569de74b63, fingerprint6ea13878 | componente qualificato; consegna separata |
| Load composto | HIST_LOAD_50K, stesse soglie/carico | PASS11/11:571/571campioni,drop0,query391.7479ms/500,cold420.5537,maxDispatcher12.3842ms | non attribuisce la causa del vecchio gap059 |
| Release esatta | 6c, Release43080678943; U19Release6c02/download-verification.json | PASS41file prodotto/110checksum; versione1.0.0-dev.6cdaa2988030, installer69c51811,payload0b88ee0f; development-unsigned, non installato | installazione/consegna separata |
| Cassa ASUS sul pacchetto | exact6c,QAartifact13884426672/da3147db,40file; U19Cart6c01 | Integrated12PASS31cicli focus29.410/scroll194.120ms; Final60PASS151cicli/3605.623s focus29.133/scroll194.686ms,zero drop. P95UI Rows212.029/Grid237.805ms;41file prodotto riverificati,budget63970e30 invariato. final-verified.private.json resultSHA8690882e | componente cassa qualificato, installazione/consegna e coppia storica ancora aperte |
| MainWindow minimo | patch privata menu-focus,commitda6539c antenato6c | reverse patch check PASS; a chiusura animazione menu torna RestoreScannerFocus sulla scheda Cassa,altre schede HamburgerFocus. Esatto punto già incluso in All16/16 e soaks6c; autorizzazione utente riconfermata | nessun nuovo delta o PASS trasferito |
| Diagnostica catalogo incollata | catalog.pull/db_failure HTTP500,UTC2026-07-26T12:00:00Z | corrisponde al campione sintetico RUNTIME_OBSERVABILITY,Program.cs2126-2146; non usata come prova di incidente attuale del negozio | nessuna modifica backend dedotta da questo campione |
| Cassa precedente | d1b2bc3,pacchettoa07430ce/payload6b44ffe3 | ASUS PASS31cicli/max102.510ms e151/max97.826ms | risultati storici, non trasferiti al nuovo pacchetto |
| Windows predecessori | 622PASS16/16;0e CI43078277359 eRelease43078654263 | 0e FAIL13PASS/1FAILbuild/2NOT_RUN, U19Win0eRemoteFail01; causa due API moderne nel solo helper condiviso net48, fix84b3015 incluso6c; intera soluzione Release PASS con solo CS8892 preesistente | FAIL conservato, non sommato ai successori |
| Baseline canonica | 17f7081 e5512319, inclusi6c | RED conservati eGREEN74/74 (include51): prova applied originale dopo cambio epoca; delta vuoto avanzato richiede snapshot tramite fallback esistente, schema20/trigger invariati. WPFnet48x86 e dialog standards PASS | E2E completo ancora aperto |
| Admin pubblico precedente | 8ccb5758; CI43066464128,CF43066464229 | Verify/SQL/build PASS, deploySKIPPED; U19Admin8cc01 verifica58file/tree/lock/config, Worker13876372298/7a032d48 e replay13876623226/14fb3bc5 | Worker impacchettato, servizio operativo non attestato |
| Admin candidato nuovo | b61ff823db68f37689a997604edda820256bc7f5, PR151; CI43091893821,CF43091893786 | Verify/SQL/build PASS, deploySKIPPED. U19AdminB6101 verifica58file/tree05d3cb0d/lock/config; Worker13889521659/5dd48490 e replay13889457956/8b33dab0,94file5307assert+3racePASS | servizio isolato reale attestato in Remote15; deploy staging/produzione non attestato |
| Sessione web reale | Remote10,run43085382627,Admin7d371d9/client6c | FAIL403 history_access_denied; cookie presente, propria sessione revocata, credenziale valida e permesso presente. U19AuthenticatedRemote10 artifact13887037812/d9db3c7e; cleanup naturale | login12h oltre credenziale+1h riprodotto e corretto sotto |
| Regressione scadenza | auth b61ff; U19StaffExpiryContract01 ecommitted-binding.private.json | RED2FAIL/4PASS, GREEN6/6: scadenza min(12h,credenziale), guardia runtime invariata; scaduto negato, sessione troppo lunga ancora negata. TypecheckPASS,48targetPASS,1624foundationPASS/7SKIP; sola rinomina loader test per ESLint poi unit6/6 e lint PASS | browser/API reale HTTP200/read=true in Remote15; precedente FAIL conservato |
| Recovery prima prova | Remote11,run43085389040,Admin9f50f08/client938305e | FAIL prima del witness: adattatore QA cercava receipt_json nella risposta Apply già ricevuta. U19AuthenticatedRemote11 artifact13888091004/194184e4; tre client PG rollback/uscita naturale0 | b61ff cattura testo originale dal DB nella stessa transazione col lock, nessuna ricevuta ricostruita |
| Recovery Remote12 | Adminb61ff/client938305e,run43091251050; U19AuthenticatedRemote12 artifact13889193349/923f8b7b | overallFAIL; prima gara Apply/recovery PASS con advisory lock osservato e ricevuta originale. Seconda raggiunge review finale dopo due recovery, FAIL BASELINE_REVIEW_REJECTED; tre PG rollback/uscita0. Il test non ripristinava SET LOCAL dopo COMMIT | correggere soltanto contesto QA e attestarlo; browser non raggiunto |
| Successore Recovery / Remote13 | Adminb6304fe/client938305e,run43094416569 | replay SQL stepPASS,servizio/browser ed exportFAIL. Log recuperato: conflict_source_ready:history_test_client_rejected. Fonte congelata ha superato i controlli precedenti prima di questa fase; ricevute singoli casi ecleanup non esportate,nessun PASS nuovo attestato | causa client interna da recuperare col successore diagnostico |
| Controllo browser / Remote14 | Adminc1b5fc1/client6c,run43094421902; src/SQL/lock/config uguali b61 | replay SQL stepPASS,servizio/browser ed exportFAIL. Stesso codice conflict_source_ready:history_test_client_rejected; accesso/API e controlli precedenti superati nel flusso,ma ricevuta caso non disponibile | non dichiarare il percorso completo PASS |
| Recupero diagnostica Remote13/14 | API log recuperata dopo precedenti HTTP502 | export CreateArtifact fallito dopo5tentativi con HTML inveceJSON; artifact assenti. Codice esterno recuperato,oggetto clientFailure originale perso con il file non esportato | Remote15: copia redatta stdout identica ai byte originali artifact,SHA b6f1a46c; recupero alternativo verificato |
| E2E reale Remote15 | Admin177cbc485c4a1eca685ad11042831af90ac6fd47/client8c5b43550804b64f50080e820d0f34aaef27df1d,run43102737034; U19AuthenticatedRemote15 | overallFAIL in conflict_preparation. Artifact13894880423 SHAe0b33ba8 verificato; SQL94file/5307assert PASS e cleanup naturale. Browser/API HTTP200,read=true; Worker reale isolato SHA20eb2acd | diagnosticare il codice HTTP originale omesso dal vecchio adattatore; nessuna causa prodotto assunta |
| Recovery reale Remote15 | stessi SHA/run; due casi indipendenti nel report | PASS Apply prima di recovery della sessione corrente e PASS due recovery concorrenti. Ricevuta originale SHAda5ee0bf,attese advisory osservate,contesto SET LOCAL ripristinato,hash economico completo invariato08857d62,native0/nuove ricevute bancarie0 | gare nuove chiuse; vecchi FAIL conservati |
| Catena POS reale Remote15 | stessi SHA/run,servizi HTTP+Next+Postgres+Storage+Worker e Admin già aperto | PASS POSA→server→Admin→POSB→POSA,6movimenti/hash2e4ecedb; duplicate PASS stesso hash; Undo PASS5/hash8d1ff879; correction PASS6/hashc95138a2; ACK perso/nuovo processo/pull prima ACK PASS7/hash3f2f43c1. Confronto di7campi economici,no effetti nativi/eco | non sommare casi sovrapposti né dichiarare l’intera suite PASS |
| E2E reale Remote16 | Admin6b98/client09be,run43109044206; U19AuthenticatedRemote16 | overallFAIL,stessi nove casi PASS nella ricevuta propria. Artifact13896212196 SHA2923b9f5; causa macchina catturata B/local_review/timeout,HTTPassente,retryable=true. Cleanup attesta solo figli Next/Worker/CLR,non Docker | timeout non è PASS di conflitto; causa SQL/HTTP da attestare |
| Successore Windows composto | 93fd90c9c25bcb36423dea8b5e5bd7cc8ff95248,PR135; C:/Dev/A19HttpComposed01 | 23mappingPASS,build soluzione/WPFnet48x86/harnessPASS0warning/error,dialogALLPASS. Security43114242861duejobPASS; WPFbuild43114239676PASSsolo build. All43114242774,Release43114234648,QApayload43116109160 RUNNING. Cash/menu/diagnosticaLoad esatti6c | cinque regressioni sul vero importatore WPF compilate,esecuzione All ancora aperta |
| Successore Admin HTTP | 2c784e60a10611b6b88e26acdbd614d0038113da,PR151 | typecheckPASS,101targetPASS,1641foundationPASS7SKIP. Motore SQL originale delegato da bridge SECURITY INVOKER,solo errore dominio40001→PT409. 43assert canonici ripristinati esattiB61;11nuovi in file dedicato,95file/5318assert ATTESI. Registro nuovo hash64124b7d,vecchi pin invariati; prepare locale byte/ordinePASS con solo override Git nel processo | SQL reale e CF/CI43115750045/046 in corso; nessun PASS SQL locale |
| Gate preflight426 | run43113763111,Admin42644e3; U19Admin426DbFail01 artifact13897980910/9e550f90 | VerifyPASS e CF43113763034buildPASS,deploySKIP; SQLFAIL prima di eseguire database per mancata registrazione ordine nuova migrazione. FAIL preservato; corretto nel successore2c | nessun pin precedente adattato o test precedente rimosso |
| E2E autenticato17 | run43115740703,server2c/client93fd effettivi verificati | RUNNING canonicalSQL. Probe sullo stesso contenuto preparato deve attestare rawSQL40001/canonical_economic_conflict,poi veroHTTP409 con solo history_cloud_writer_closed accettato. Revoca/errori temporanei/risposte malformate esclusi localmente dal PASS | completare conflitto e riconciliazione,origineAdmin e revoca isolata senza allentare timeout/workload |
| Core locale componente | C:/Dev/A19ForegroundErrors01,U19ForegroundCore01/core.trx | PASS2008,30m35s,include20mappingprecedenti; sorgenti congelate in foreground-core-frozen-source.private.json. Non sommato ai23successori e non trasferito come PASS dell’intero93fd | All93fd richiesto |
| PR135/136 | 93fd successore in135; d1b2bc3 in136 | d1b è antenato93fd; PosView/MainWindow blob uguali. Nessuna correzione duplicata necessaria | 136 resta aperta fino al gate di consegna composta; nessun merge ora |
| Vincoli esterni | installato2ad42ca,ledger Minimondo e7originali conservati | scala200%/2880x1800 invariata;100/125USER_DEFERRED;Win7fisicoBLOCKED_TARGET;GetnetCMISSING;nessun Apply reale nuovo | prova fisica e consegna non sostituite da CI |

Le run precedenti Remote01-09 e il FAIL Load059 restano nella cronologia;
nessuna soglia, campione o timeout viene allentato per ottenere PASS. Le sorgenti
dei candidati attivi e gli SHA privati precedenti sono riproducibili. Gli artifact
sono verificati per digest, contenuto e binding, non soltanto per esito del job.

Il solo archivio selettivo passa dal BFF; backup completo locale, nessun segreto
nel browser/evidence. Core/Data con servizi reali non attesta WPF, periferiche o
Win7fisico. Nessun merge main, deploy, installazione o DONE. Checkpoint privato
220842Z aggiornato; PR135/151 eTASK146 conservano il proprio storico integrale.

</details>


<details>
<summary>Checkpoint precedente181007Z conservato come storia</summary>


## Composizione verificata — 20261111T181007Z, stessa ASUS-W7POS-019

Execution ACTIVE: cassa quotidiana e storico bilaterale, tutti i file necessari
autorizzati. Qualifiche legate agli SHA indicati; successori e componenti WIP
non ereditano il PASS. Nessun merge main, deploy o DONE.

| Scenario | SHA / comando / ambiente | Esito ed evidence | Prossimo gate |
|---|---|---|---|
| Cassa precedente | d1b2bc3, pacchettoa07430ce/payload6b44ffe3; ASUS Integrated12/Final60 | PASS31cicli/max102.510ms e151/max97.826ms, budget63970e30 invariato | soaks del pacchetto finale composto |
| Windows composto | 6228e6c3, CI43066448526 eSecurity43066448505 | PASS16/16; U19Win622Remote01 verifica8entry artifact13879850970 SHA256dd273615, fingerprintfd5bd3f0 | pacchetto esatto e consegna restano aperti |
| Load composto | HIST_LOAD_50K, medesime soglie/carico | PASS11/11:578/578campioni, drop0, query408.476ms/500, cold429.4557, maxDispatcher osservato3.2664ms | non attribuisce una causa al vecchio FAIL |
| Load059 precedente | CI43057322574, U19Win059RemoteFail01 | FAIL15/16 solo Load:393/394campioni e1drop iniziale; query283.8887ms PASS, maxosservato13.8919ms. Causa UNRESOLVED; nessun blocco host/UI dedotto | FAIL conservato; diagnostica bounded02f51b9 inclusa nel successore,83check puri PASS |
| Windows anteriori | 791fc4f7 PASS16/16; c88 FAIL2/16 | artifact verificati U19Win791Remote01 eU19WinC88RemoteFail01; risultati separati | nessuna somma dei rerun |
| Admin componenti | 8ccb5758, CI43066464128 eCF43066464229 | Verify/SQL/build PASS; U19Admin8cc01 verifica58file, lock/config/treeb116e1f7. Workerartifact13876372298 SHA2567a032d48 | entrambi i deploy SKIPPED, servizio operativo non attestato |
| SQL composto | replay8cc, artifact13876623226 SHA25614fb3bc5 | PASS94file/5307assert+3race preesistenti, receipt verificata U19Admin8cc01 | nuove race recovery NOT_RUN |
| Storage reale | helper996cd7b incluso8cc | riconosce solo SDK StorageApiError HTTP400/code404 oltre404; U19AuthenticatedContract03 typecheckPASS,42target inclusi nei1618foundationPASS/7SKIP | nessuna interpretazione permissiva di altri400/auth/rete |
| E2E autenticato03 | client622/Admin8cc, run43066567889 | FAIL baseline_upload_target_invalid, U19AuthenticatedRemote03 artifact13876473338 SHA256f0d94772; NextRequest normalizza127.0.0.1→localhost, guardia origine correttamente chiusa | fixture configurata col nome canonico, controllo client invariato |
| E2E autenticato04 | client622/Admin5bb98ff, run43070574083 | FAIL initial_baseline/convergence_timeout dopo limite invariato; ultimo turno history_replica_turn_complete, cleanup naturale. U19AuthenticatedRemote04 verifica artifact13877903598 SHA256a2a465ed. Browser NOT_RUN | diagnosticare stati baseline/Worker, nessun roundtrip PASS |
| E2E autenticato05 | client704e8ce/Admin49e4788, run43072749769 | FAIL initial_baseline/convergence_timeout; SQL94/5307PASS, cleanup naturale, casiACK/restart NOT_RUN. U19AuthenticatedRemote05 verifica artifact13881301690 SHA2561f42cbe6 | FAIL conservato |
| E2E diagnostico06 | client6a82ad3/Adminf8f5388, run43073567207 | FAIL iniziale: POSB baseline applied ma read-mode assente; entrambi i run SQL applied,2upload verified, Worker vivo/idle. U19AuthenticatedRemote06 verifica artifact13882437164 SHA256ef73b969, cleanup naturale | meccanismo candidato riprodotto sotto, conferma HTTP successore necessaria |
| Baseline e cambio epoca | componente17f7081, A19BaselineEpoch01 | regressione RED1/2 eGREEN51/51: conserva soltanto prova applied originale coincidente con shop/device/dataset/snapshot/revisioni/checksum dopo freeze; snapshot ignoto negato, nessun nuovo intento/riscrittura | incluso nel successore, Windows-All/E2E propri necessari |
| Baseline e delta vuoto avanzato | componente5512319, stessa root | U19BaselineReadAdvanceRed02 FAIL2/2 riproduce read-mode disabilitato alle revisioni2/3; GREEN74/74 include rifiuti checksum e riuso dei delta invariati. Se la copia fisica non prova la nuova revisione, rollback e unico resnapshot completo già previsto; triggerSQL/Schema20 invariati. Red01 conserva un errore iniziale nei parametri della fixture, corretto nel Red02 | confermare sul servizio reale dopo correzione |
| Compatibilità della correzione | restorelocked/WPF net48x86 U19BaselineReadAdvanceWpf01; standarddialog U19BaselineReadAdvanceDialog01 | buildPASS0warning/error e dialogALLPASS. Nessuna modifica dialog/scale/dati reali | Windows-All composto e pacchetto/soaks finali ancora aperti |
| Origine Admin e revoca | componenti46b5bcd/30b4f57 e policy web per sorgente esatta | build15/16PASS0warning/error, node syntaxPASS; inventario/freeze/export verificati/migrazione/import web e revoca sessione sintetica, esecuzione NOT_RUN | congelare coppia ed eseguire, conflitti e race ancora aperti |
| Successore0e77a1e | CI43078277359, U19Win0eRemoteFail01 | FAIL:13PASS/1FAILbuild/2NOT_RUNdipendenti; artifact13884155683 SHA256ce54f6f1/8entry verificati, fingerprint29f2fc64. WPF, functional, crash, smoke, Load eCloudSync PASS; nessuna riattribuzione Core | correggere helper condiviso net48 e ripetere suite |
| Packaging0e | Release43078654263 | FAIL Build solution: helper OwnedSqliteTestFile usava ThrowIfNullOrWhiteSpace eIsPathFullyQualified non disponibili nel progetto CatalogPerformance net48; nessun artifact installer | causa esatta conservata release0e-build-failure.private.json |
| Correzione helper | 84b3015, composto f1eb91f | controlli equivalenti string.IsNullOrWhiteSpace, percorso rooted/canonico e file esistente; capability originale obbligatoria. Restorelocked+soluzioneReleasePASS U19OwnedFixtureCompatSolution01, solo warning CS8892 preesistente | nessuna nuova API richiesta dal prodotto Windows7 |
| Conflitto fra POS | componenti923b15a/e18803b, composto ae8d951 | build19PASS0warning/error e node syntaxPASS; ownership reale come chiamanteWPF, richiesta divergente del peer, nessun grant/receipt/economia, chiusura automatica dell'intento via esito negativo del supervisor. Esecuzione NOT_RUN | includere nel successore autenticato |
| Candidato distribuito precedente | client0e77a1e/Adminf070efd, run43078306388 | in corso all'osservazione; include correzioni baseline17f/551 e origineAdmin/ACK/restart/revoca | attendere risultato reale, nessun PASS anticipato |
| Pacchetto precursore | Release05943057309469 | PASS scaricato e verificato U19Release05901:41file prodotto/110checksum, development-unsigned; QAbundle40file U19Cart05901 | non è il pacchetto finale; Integrated/Final60 finale NOT_RUN |
| Vincoli esterni | installato2ad42ca e profilo Minimondo/originali conservati | 200%/2880×1800 invariati;100/125 USER_DEFERRED; Win7fisico BLOCKED_TARGET; GetnetC MISSING | nessuna nuova installazione o attestazione sostitutiva |

Le prove E2E01/02 fallite e i FAIL DNS Chromium restano nella cronologia e negli
artifact verificati Remote01/02; le qualifiche Admin3b eWindows791 sono storiche.
Il test Core/Data usa servizi HTTP/Next/PostgreSQL/Storage/Worker reali di test,
ma non attesta WPF, periferiche o Windows7 fisico. La versione/hash browser è
raccolta solo quando si raggiunge effettivamente quella fase.

Il solo archivio selettivo passa dal BFF configurato; il backup completo resta
locale. Nessuna allowlist client Storage, ricevuta inventata, nuovo grant SDK o
fallback v1. I legacy confermati drenano senza riscrivere l'audit; gli intenti
e witness v2 incerti restano bloccanti. Checkpoint privato180532Z e handoff
PR135/151/TASK146 aggiornati, coda storica TASK146 conservata esattamente.


</details>

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

## Indagine baseline-volume — 13 novembre (14 UTC), stessa Execution

Checkout isolato ca9f239: modifica soltanto sender/gateway e prove/documenti
necessari. Originale live-failure-response e aggregate source-metadata restano
evidence private esterne; nessun originale finanziario entra nelle fixture.
Prototipo gzip: firma wire, HMAC prima di decompressione, wire/decoded8MiB,
identità nonce/body immutabile nei retry. Stage200righe/6MiB, richieste15s,
analisi120s, heartbeat20s e codice SQL/main invariati. RED workerd400/zeroRPC
conservato; primo GREEN26/26, helper successivo34PASS/3FAIL conservato, correzione
del solo bootstrap server-only37/37. Nuova bomb64MiB e volume finale in corso.
Pipeline completa sintetica25947movimenti/20274917byte NDJSON: ogni payload hash
e finish identity/gzip identico;72174835/1818712byte wire. La fixture ZIP486290B
non riproduce l'entropia ZIP reale869952B: nessuna stima cloud da quei byte.
Modello registrato prima della prova RTT300ms+50KiB/s, DB stub a costo costante:
identity timeout122365ms con30batch/6000oggetti/0movimenti. Gzip ancora in corso;
ipotesi da qualificare, nessun aumento timer o automatico retry reale. Output
immutabili C:/Dev/U19BaselineVolume01, nessun DB/deploy/riavvio/commit/push.

## Successore14novembre — deadline, vettori e diagnostiche, non rollout

Il confronto fullrun01 conteso termina anche gzip con FAIL120665.953ms. Non è
prestazione qualificata e non dimostra causa live; originale tentativo1 fermo
con6000oggetti resta preservato. Root ha richiesto serializzazione delle nuove
prove e autorizzato esplicitamente stage_vector_v2: max4 chunk di1..200 righe,
fence/fase unici, payloadtotale6MiB, transazione atomica e motore v1 invariato.
Schema concordato col proprietario Master SQL; ACK phase/count/last verificato
nel Node worker, server v2 necessario, nessun fallback. Misura SQL pura proviene
dal wrapper; DBroundtrip e overhead gateway non sono rinominati SQL.

Nello slot esclusivo: targeted-v2-deadline-01 PASS78/78 e02 PASS84/84, coprono
RPC headers/body bloccata, ACK dopo deadline, abort processo, fail col fence e
segnale originari, vector ACK errato, nessun finish/reclaim/fallback,4×200 e
1001righe sintetiche, native workerd HMAC/limiti/bomb64MiB e regressioni export.
Typecheck01 FAIL di tipizzazione async/JSON conservato,02 PASS; lint02 PASS.
Bundle01 costruito con gateway privilegiato escluso; CSC01 FAIL del path comando
con slash conservato, CSC02 net48/x64 PASS. Nessun processo di prova residuo.

Log persistente nuovo512KiB atomico/whitelist, path derivato solo da statusPath
host esistente, nessun cambio chiave/ACL/configSCM. Fatalcatch e stop processo
redatti, nessuna OOM inventata da recovery counter. Unit guard packaging v2 e
prova actualCJSfatalpersist aggiunte, gate finali ancora in corso. Il builder
accetta solo artifact prequalificato più ricevuta esterna hashata che lega
source/tree/artifact/raw hash ai run/report SQL e volume reale; non emette una
qualifica propria. Frozen kit v1 e hard pin612d9bd/20eb restano invariati.

SQL reale+gateway+bundle25.947,5/5 SCM nell'esatto workflow Windows, pacchetto
qualificato, consegna installata e retry canonico live non eseguiti qui.
Root coordina freeze locale autorizzato e test finali seriali prima handoff;
nessun push/deploy/service restart o operazione finanziaria da questa tranche.

Ulteriore delta richiesto da root: timer monotono120s avviato prima del claim,
nessun reset dopo backoff o ACK. Recovery esplicito soltanto claim migration
daemon: nonce/body identici, massimo3 backoff2/5/15s dentro quel budget. Stage,
auth e contratto errato terminali; --once non recupera oltre la coppia normale.
Un attempt_started_at server può soltanto accorciare il residuo. Mirati finali
di questo delta, packaging guard in memoria e actualCJS fatal sono selezionati
per la finestra CPU esclusiva successiva; nessuna ricevuta CI fittizia prodotta.

## Ricevuta locale finale14novembre — congelamento autorizzato, non qualifica CI

targeted-v2-final-01:90test/90PASS/0FAIL/0SKIP in2328.1833ms nello slot esclusivo.
Include4 nuovi recovery/deadline, actual Node24 CJS fatalpersist e22 assertion
del guard packaging solo in memoria (nessun manifest qualificante scritto).
Typecheck-final01 PASS. Lint-final01 FAIL del solo nome module nel probe VM;
rinominato loaded, lint-final02 PASS. Bundle-final01 PASS, privileged adapter
escluso. Parsing dei5file PowerShell modificati PASS; diff-check PASS.
CSC02 già PASS sul medesimo sorgente host (net48/x64). Nessun test120s rilanciato
su stub; risultati fullrun01 contesi e FAIL restano immutabili e non qualificanti.

Root autorizza commit esclusivamente locale dei file elencati nel diff, poi
integrazione con Master SQL su un unico head. Nessun push/DDL/live/retry/SCM/UAC.
Il vero gate SQL+gateway+artifactCJS/volume25947,5/5SCM in runner canonico e le
ricevute verificate per packaging/rollout non sono prodotti da questa tranche.

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


<details>
<summary>Raccordi storici del main 8e466108 preservati nel merge documentale</summary>

Addendum utente 10 novembre: sincronizzazione automatica POS→Admin→altre
postazioni nella stessa Execution. Gap confermato e contratto condiviso nel
[piano canonico](../../../ARCHITECTURE/ASUS019-ADMIN-OPERATIONS-HISTORY-PLAN.md).
Baseline151/43f668df,135/fbdde199; consegna136 separata. Implementazione aperta,
nuovi gate NOT_RUN. Nessun PASS pregresso trasferito, rollout o DONE.

Chiarimento bilaterale recepito: matrice per dominio e operazione nel medesimo
CLOUD-CONTINUATION Windows, contratto coordinato nel piano Admin. Replica storica
in background e pubblicazione locale sono implementazioni distinte; invio vendite
non equivale a consultazione dei registri inter-postazione. E2E autenticati nuovi
NOT_RUN; component test e build restano classificati separatamente.

</details>
