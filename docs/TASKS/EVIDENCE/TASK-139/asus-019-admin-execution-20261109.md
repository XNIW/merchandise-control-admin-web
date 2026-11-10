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
