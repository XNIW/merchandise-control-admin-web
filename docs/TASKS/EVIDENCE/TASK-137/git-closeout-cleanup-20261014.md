# Recupero run ledger cleanup nella chiusura Git del 14 ottobre 2026

Il recupero collega il solo CLI immagini privato alle tre RPC run ledger già
presenti in main. La modalità predefinita dry-run conserva zero mutazioni del
ledger e zero cancellazioni. Soltanto `--execute`, dopo i guard esistenti,
acquisisce il run shop-scoped e rinnova la lease prima di preparazione,
cancellazione e registrazione. Lease persa, risposta malformata o acquisizione
occupata interrompono il percorso. Un errore conserva contatori parziali
verificati e tenta il terminale failed, senza esporre dettagli interni.

Restano il paging bounded, il limite candidati/byte, la verifica server di ogni
oggetto, il probe404 esplicito, il rifiuto delle risposte malformate e la
condizione `cleanup_status === complete`. Nessuna migration è aggiunta o
riscritta. Il cleanup immagini pubblico Storefront è un dominio distinto.

Undici regressioni eseguono il vero entrypoint CLI con sole interfacce sintetiche
Supabase/Storage: dry-run, run vuoto, busy, acquire malformato, lease persa,
paging, progressi parziali, pending,404 ambiguo, prepare malformato ed errore read.
Prima del port, dieci fallivano sul main conservato; dopo il port tutte passano.
Viene inoltre recuperato il pgTAP storico di30asserzioni sulle RPC esistenti,
con fixture sintetica in transazione/rollback; il gate effettivo è la CI del
candidato. Nessun comando di cleanup, Storage, SQL o servizio condiviso è
eseguito dalla verifica locale del CLI, che sostituisce integralmente i confini.
