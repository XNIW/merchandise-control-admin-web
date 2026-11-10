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
`nTypecheck, lint e build della tranche mobile/device: PASS. Nessuna prova live attribuita.`n
