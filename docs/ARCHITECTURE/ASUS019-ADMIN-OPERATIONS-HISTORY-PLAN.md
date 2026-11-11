# ASUS019 — controllo operativo Admin e futuro storico web

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

<!-- ASUS019_CURRENT_START -->
## Convergenza corrente — stessa Execution ASUS-W7POS-019

Due consegne: cassa quotidiana e storico bilaterale, senza nuove funzioni.
Stato ACTIVE; nessun DONE, merge main, deploy, installazione o nuova mutazione reale.
L'utente autorizza tutti i file necessari ai residui; soglie e workload invariati.

| Scenario | SHA / binding | Comando e ambiente | Esito | Evidence | Prossimo gate |
|---|---|---|---|---|---|
| Cassa PR136 | b76238d2aac2adf7ed69ee749b7d1e8157407262 | CI42933914161, Security42933914165, WPF42934216716, Release42934061207 | PASS | U19ReleaseB76201, 41 file prodotto/110 checksum; installer596ca74d, payload96cbde92 | delta menu Cassa e candidato integrato finale |
| Focus originario | prodotto149c978 | Integrated12 +soak60, run42897760117, budget250ms | Integrated PASS; soak FAIL conservato | artifact13807390665, cicli116/118:258.573/258.382ms | nessuna attribuzione retroattiva senza fasi originali |
| Diagnosi focus | prodotto149, harness6533c71 | Diagnostic60, run42924975778,162cicli | completa; non qualifica | U19Focus149Hosted01, artifact13816767268 | callback focus superfluo già focalizzato, in coda dietro Send; nessun blocco scanner/ASUS presunto |
| Qualifica cassa b762 | pacchetto Release42934061207; 41/41 file corrispondenti | hosted42937991969, Integrated12 +soak60 | PASS entrambi, ambiente valido | U19CartB762Qual01, artifact13823212154, digest550a502d009879483d9d7913e505dfd81518e2aa87cb2a179cfeda9d62eda138; focus max28.354/14.428ms,32/159cicli | non attesta ASUS, Win7 o coppia finale |
| Ritorno menu Cassa | b762 +sola nuova regressione | AUTHENTICATED_SHELL_UX, net48/x86, 200% | FAIL riprodotto sul ritorno menu | U19MenuFocusRed01:29 assert precedenti PASS, focus ritorno FAIL; cleanup confermato | patch MainWindow ripristina scanner dopo la chiusura menu; successore in verifica |
| Windows-All locale | b976fc70873866dd38344124e04e29006dead5f5, clean | Windows -HistoricalSalesMode All, root nuove | PASS16/16, Core1885/1885 | U19CloudAll04; fingerprint33775364553bd1366310ac894ecaba96c7b3b54a04d1888dc65dc6223f062e5e; Load caldo304.8777ms | candidato query successore da qualificare |
| Windows remoto b976 | stesso b976 | CI42954896078; Security42954896096 | CI FAIL Load; Security PASS | U19WinB976Remote01, artifact13828441507, digestbaa623481ec22dffc879b6946adfe42599c649c9e412d020b9030598b58484c7 | tre query calde572–574.2707ms oltre500; altri15 passaggi PASS, ambiente Load valido |
| Correzione lettura mista | delta SalesReportQuery su b976 | aggregazione giorni/totale unica; test Reports+HistoricalReplica | PASS74 mirati; Load/All successori NOT_RUN | U19QueryRollup01, report-rollup01.trx | compilare/qualificare net48/x86, nessuna soglia cambiata |
| Precedenti Windows | f4ea8e2/136088b | localeAll03; CI42931948198 e42939260104 | f4 locale PASS/remoto Smoke FAIL;136 remoto PASS16/16 | U19CloudAll03, U19WinF4Remote01, U19Win136Remote02 | non cancellare FAIL storici, non sommare rerun |
| Recovery | fixture9a/f4, prodotto invariato | root dump +ritiro dopo2100ms, stessa regola controllo/Recovery | mirato eAll04 PASS | U19RecoveryHeap03/04, U19RecoveryRetirement04, U19CloudAll04 | root TextBoxView throttle timer2s; non semplice cambio5/3 |
| Decisioni client v2 | codice176eaa8 integrato b976 | Core ledger05, Smoke03, CloudSync01 | PASS97 Core; Smoke8gruppi/52verifiche; Cloud1/1 | U19DecisionsLedger05/Smoke03/Cloud01; Smoke31.299s, Cloud3.128s | esiti locale/canonico separati; nessun PASS E2E trasferito |
| Baseline v2 | client136, Adminfe6/830/815 | backup verificato, exportCLR, lettore Node, replaySQL isolato | componenti PASS | U19BaselineExport02, U19BaselineSqlContext03(82/4827), U19BaselinePipeline01(83/4859) | collegare baseline automatica e WPF senza ricaduta v1 |
| Admin qualificato | 6c57134428f59b2192d3afe5608892c7ce717230; merge885ffe8, stesso treea05ade3f | CI42954903731; Cloudflare42954903836 | PASS; foundation1498/14SKIP; SQL84file/4892assert; deploy staging/prod SKIPPED | U19Admin6c01, Worker13826612587, digest530a897a792ad9d94b6d0c08d1f3870d320adbe14921bd93d0ab43c38547dcc9;58hash verificati | packaging distinto da servizio storico operativo |
| Contratti Node | ca08 integrato3523653/6c | typecheck, foundation02 locale | PASS1555/7SKIP su1562;19 mirati sovrapposti | decisions-foundation02; primoFAIL pinning CRLF conservato, byteGit verificati senza diff | API v2 ancora chiuse |
| Proiezione locale server | 82dec507 integrato6a8918e/6c | replay isolato42952263404 | PASS84file/4892assert,33 nuove prove | U19ProjectionSql01, artifact13825732659, digest74d12f78e92680be80d876842de3ab2a617f97222754f650f339d9bfc6eb282a | importi dalle fonti immutabili; duplicato non acquisisce ownership |
| Indice review server | 254d2f6264895dc133a584bb33c6c53d998878a8; integrato localmente b9882c7 | replay isolato42955496895 | PASS85file/4929assert,37 nuove prove | U19ReviewIndexSql01, artifact13827456115, digestddb608cee7bd58d0088cf4af35fff67c2daff87bb6a10ff2945d2dda771fe49d | b988 non ancora pubblicato/qualificato come candidato integrato |
| Corpus CLR→Node | client eab54ae; server118f858 locale | servizi dati reali,9draft/receipt,37record,1correzione | PASS1 CLR +2 Node mirati distinti | U19PublicationCorpus02, U19PublicationCorpusTests02, publication-node02 | non è E2E SQL/WPF distribuito; reviewer privato incompleto |
| Catena bilaterale | reviewer SQL WIP privato, migrazione20261111041740 | review/grant/delivery/journal/reconciliation da completare | NOT_RUN E2E autenticato POS A→server→Admin aperto→POS B→A | V2-REMAINING-INVARIANTS.private.md; APIv2 chiuse | niente primitive incomplete, echo o effetti native/stock/ricevute |
| Cleanup TASK094 | fixtureee788ef4-591b-45a4-86f3-90d28a77e12d, codice/data esatti | query scoped read-only staging | PASS_SCOPED_READONLY, tutti gli attivi0 | task094-readonly-cleanup-20261110.private.json | FAIL42896389034 e cleanup originaleNOT_ATTESTED conservati |
| Installato / dati reali | 2ad42ca9ac5601d7da9555996c1642263252b6e0 | verifica EXE e profilo conservato | invariato; nessun nuovo Apply/Undo | EXE33a73a2c51e6fbe3082081ed787d6421da6641359f6222faf7f566538593eb0f | consegna finale distinta da build/CI |
| Mobile / Win7 / DPI / GetnetC | handoffTASK146 esistente | target Win7 assente; 200%2880×1800 | Win7BLOCKED_TARGET;100/125USER_DEFERRED; moderniC MISSING | commento6722613449, prove private originali | nessun PASS mobile/Win7 trasferito da Windows11 |

Il Load remoto fallisce su due assertion che condividono il limite delle query
a caldo; cancellazione, memoria, Dispatcher e conteggi di import passano. Le
misure non dimostrano una causa hardware o una regressione delle nuove prove.
Il prototipo SQL e la patch eliminano una lettura aggregata ripetuta; soltanto
le nuove prove sul prodotto possono qualificare il limite di500ms.

Sono conservati i FAIL originali149, f4 remoto, All01/02, Smoke01/02 e il primo
corpusCLR con percorso export non valido. Fixture corretti senza cambiare le
guardie prodotto. Le vecchie run non diventano PASS e i test sovrapposti non si sommano.

Review, grant fresco legato al contenuto, proprietà di Apply/Undo, delivery
atomica, ricevuta canonica, journal prima di authorize e riconciliazione dei
grant ignoti restano gate critici prima dell'API e della coppia finale. Le prove
SQL/Node/loopback e il Worker impacchettato non attestano il servizio operativo.
Baseline da backup completo verificato locale; soltanto export storico selettivo
online. Profilo Minimondo, ledger originale e sette XLSX restano conservati.

Checkpoint UTC 20261111T050409Z. I dettagli dei checkpoint precedenti rimangono nella
cronologia Git e nelle evidence private originali; nessuna approvazione operativa implicita.
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
