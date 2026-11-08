# ASUS-W7POS-019 — stato della superficie staff

Continuazione autorizzata dell'8 novembre 2026, base Admin
`f874723a436456c14841932ab1028c0e8cf25964`. Candidato in FIX, da qualificare
e consegnare a REVIEW; nessun DONE e nessun deploy implicito.

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
Qualifica CI canonica Node22 sul candidato e review dell'owner ancora pendenti.

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
pull osservato. L'installer verificato è terminato con consenso Windows
annullato. Non si ripete la richiesta della stessa autorizzazione, non si
cambia launcher e non si attribuisce un PASS HTTP/UI alla prova RPC precedente.
