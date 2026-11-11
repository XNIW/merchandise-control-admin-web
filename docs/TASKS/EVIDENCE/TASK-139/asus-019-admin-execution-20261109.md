# ASUS019 — Execution Admin B/C, preparazione senza operatore

L'ultimo addendum di convergenza mantiene due consegne correnti: cassa quotidiana
e storico bilaterale. La precedente matrice di altri domini rimane storica.

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

<!-- ASUS019_COMPOSED_CURRENT_START -->
## Composizione corrente — 20261111T152646Z, stessa ASUS-W7POS-019

Execution ACTIVE: cassa quotidiana e storico bilaterale. L'utente autorizza
tutti i file necessari; nessuna nuova funzione, infrastruttura o task.
Codepoint candidati: Windows71eafda924c91bdbe121bbfa9b2cd054dffa3e77,
Admin48093f3bf77ad6bbc07cd74d6e28df2e5c81ea5e (codice identico a33164d44).
Il commit documentale successore non cambia tali componenti; richiede comunque
binding e qualifica del proprio SHA. Nessun merge main, deploy o installazione.

| Scenario | SHA / comando / ambiente | Esito ed evidence | Prossimo gate |
|---|---|---|---|
| Cassa qualificata precedentemente | d1b2bc3, pacchetto a07430ce /payload6b44ffe3; Integrated12 eFinal60 ASUS | PASS31cicli/max102.510ms e151/max97.826ms, budget63970e30 invariato | ripetere sul pacchetto composto finale |
| Candidato precedente composto | c88b3614, Windows-All locale U19FinalWindows01 | FAIL2/16 (gates, Core); altri14PASS. Core1971PASS/11FAIL/1982; cleanup naturale e pubblicazione evidence PASS | FAIL conservato; nessun PASS trasferito al successore |
| C88 prove mirate | fingerprint9ab866c4; geometria, Smoke, Load canonici | PASS U19FinalGeometry01; Smoke52/52 U19FinalSmoke01; Load11/11 U19FinalLoad01, queryMs196.5719 contro500 invariato | non è pacchetto finale o qualifica Win7 fisico |
| Trasporto baseline corretto | componente3e4748b, composto71eafda; POST solo all'Admin configurato | Core/Data120/120 U19BffTransportTarget01; quattro gate prima falliti oraPASS; build net48/x86 eCloud1/1 U19BffCloud02 | suite completa sullo SHA finale |
| Confine architetturale | c88 contattava Storage direttamente, respinto da4gate | il POS ora invia l'archivio al BFF esistente; target Storage solo server-side, hash/dimensione/lease controllati, niente allowlist client o indebolimento gate | E2E autenticato con Worker operativo di test |
| Freeze legacy | regression U19CutoverCoverage01 FAIL riprodotto; 02 PASS dopo fix | copertura canonica verificata vale come drain dei soli legacy; audit incrementale originale invariato; journal/witness v2 incerti restano bloccanti | provare origine Admin nella modalità prevista |
| Fixture report | c88 mancava schema baseline nelle fixture minime | schema20 canonico applicato senza ACK inventati; U19BaselineReports01 PASS10/10 | includere nella suite completa successore |
| API e BFF Admin | privato33164d44, composto48093f3 | U19BffContract02: typecheckPASS, target40PASS, foundation1616PASS/7SKIP su1623; sourceStable b621fc93 | CI completa, browser e packaging sullo SHA pubblicato |
| SQL pubblico v2 | bc6d061e, replay43044363336; migration141636 SHAba0992ab | PASS94file/5307assert +3concurrentcases, U19ComposedSql03; artifact13868405092 digesta20891af162ddef1ccc001b1bb508f4279e2bde780f536e6d79c8b70097bbada | tre race preesistenti non qualificano nuove race recovery |
| FAIL SQL conservati | 63f69799 e9fbf9ae; replay43038705948/43041270226 | nuove fixture: policy indipendenti mancanti, negativo dopo cambio revisione, conteggio zero obsoleto dopo Apply. Guard finanziari invariati; successore bc6PASS | non sommare rerun o cancellare FAIL |
| Baseline qualificata pubblicata | Windows6ce1f12 CI43023775479 eSecurity43023775383; Admin5895e17 CI43023787452/CF43023787441 | PASS; artifact Windows13860906046 digest155813f5, 8entry; Worker13856476824 digestee458ce8,58file; deploy SKIPPED e Worker non operativo | risultati precedenti distinti dalla coppia corrente |
| Storico bilaterale completo | A→server→Admin già aperto→B→A senza eco; origine Admin; ACK perso/restart/correzione/Undo/revoca/conflitti | NOT_RUN come singola prova autenticata distribuita. I component test non la sostituiscono | completare harness con servizi reali isolati |
| Consegna | installato2ad42ca invariato; profilo Minimondo e7originali conservati | pacchetto composto, Integrated/Final60 e consegna NOT_RUN; 200% invariato,100/125 USER_DEFERRED | Win7 fisico BLOCKED_TARGET; GetnetC MISSING |

Nessun DONE. Worker impacchettato, servizio operativo, CI, deploy e installazione
restano gate separati. Backup SQLite completo locale; si trasferisce soltanto
l'archivio selettivo. Nessuna mutazione reale, vendita nativa, stock o ricevuta
commerciale aggiunta da questa continuazione.
<!-- ASUS019_COMPOSED_CURRENT_END -->

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
