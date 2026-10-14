# Recupero JPEG nella chiusura Git del 14 ottobre 2026

Il mandato di integrazione recupera soltanto la canonizzazione JPEG del WIP
TASK-139 immagini conservato nel worktree storico. Non ripristina l'intero
prototipo e non modifica lo stato dei task precedenti.

Una prova indipendente con Chrome155 ha generato quattro JPEG sintetici32x24
tramite Canvas e OffscreenCanvas, qualità0.4/0.9 e contesto sRGB. Tutti i byte
nativi sono rifiutati dal validatore corrente con `jpeg_metadata_forbidden`;
la canonizzazione li rende accettabili, senza modificare i byte della scansione.
Le fixture persistenti sono esclusivamente i piccoli input sintetici consumati
dal test di regressione, non log o screenshot applicativi.

Il recupero aggiunge il helper storico e lo richiama dopo la codifica in
entrambi i percorsi. Rimuove APP non JFIF e COM; conserva JFIF, tabelle, frame,
scansioni, stuffing e restart marker. Il validatore server rimane identico,
come dimensioni, budget, qualità, schedule, autorizzazione e gestione abort.
Un output malformato genera l'errore redatto `image_encode_failed`.

Regressioni locali Node22.22.0: tre test PASS sul vero helper e sui veri encoder
estratti via AST; coprono i quattro JPEG Canvas nativi, baseline/progressive,
APP1/2/13/14/COM prima e dopo le scansioni e segmenti malformati. Dopo la rimozione
dei segmenti iniettati, ogni byte deve coincidere con il JPEG valido originale.
Questa prova riguarda codifica e validazione locale. Upload autenticato, Storage,
sessioni reali e accettazione Android/iOS non sono eseguiti da questa chiusura.
