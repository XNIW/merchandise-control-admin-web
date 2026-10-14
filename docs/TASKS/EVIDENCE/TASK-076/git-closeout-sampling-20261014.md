# Recupero campionamento nella chiusura Git del 14 ottobre 2026

Il recupero selettivo del WIP di luglio aggiunge ai harness076 e077A il numero
di campioni, limitato a interi1–20, e i riepiloghi descrittivi per rotta e totali.
Per077 viene mantenuta l'interfaccia corrente `TASK077_ROUTE_SAMPLE_COUNT`:
nessuna seconda opzione `TASK077_SAMPLE_COUNT`. Il wrapper propaga il conteggio
al dataset sintetico076; le sue soglie, fixture e cleanup restano invariati.
076 continua a percorrere tutte le rotte; non vengono recuperati vecchi selettori
o assert relativi a interfacce staff ormai sostituite.

Ogni report conserva tutte le misure originali, comprese le failure. Le latenze
NULL non entrano nei quantili, il cui denominatore è pubblicato; una serie
vuota restituisce conteggio0 e valoriNULL. P50/P95/max sono statistiche dei
campioni osservati e non provano uno SLA, la distribuzione della popolazione,
una traccia delle query server o un miglioramento delle prestazioni.

Sette regressioni locali eseguono le funzioni effettive estratte dai tre harness,
senza importarne i runner live: limiti, input frazionari/invalidi, quantili,
conteggi, preservazione delle failure e scrittura dei report. Le scritture sono
sostituite con un sink in memoria. Nessun login, traffico cloud, fixture reale o
misurazione delle prestazioni viene eseguito da questa chiusura Git.
