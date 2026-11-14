# ASUS019 — autorità POS ordinaria persistente

Requisito esplicito del 12 novembre 2026 nella stessa Execution: assenza di
scadenza ordinaria e logout temporale. Licenza dispositivo futura, nessuna
nuova task o modifica alla contabilità/storico.

Il client negozia `localAuthorizationPolicy: persistent-pos-v1`. Senza il
campo resta V3 bounded; valori sconosciuti sono rifiutati. La nuova RPC V4
è eseguibile soltanto dal service principal e delega a V3 l'emissione canonica
con gli stessi lock e controlli staff/versione/dispositivo. Aggiorna soltanto
credenziale e sessione appena emesse nella medesima transazione. Un errore
annulla anche l'emissione V3, senza lasciare un grant parziale.

Il massimo UTC finito portabile `9999-12-31T23:59:59.999999Z` rappresenta assenza
di scadenza ordinaria nelle colonne esistenti. La scadenza staff esplicita resta
un cap; il client non la trasforma in autorità locale perpetua. Il marcatore
usa `offline_authorization_policy_version`, senza nuove tabelle. La risposta
conferma la modalità solo dopo il commit riuscito. L'heartbeat restituisce la
scadenza effettiva e conserva il grant permanente. Il predicato runtime rifiuta
invalidazioni esplicite del grant persistente, oltre a stato/revoca/versione.
Nessuna chiave server nel client, nuovo endpoint di rinnovo o salvataggio PIN.

Migrazione additiva `20261112143448_asus019_persistent_pos_authorization_v1.sql`,
generata dal CLI vincolato 2.109.0. Corpus SQL precedente e pin invariati. Il
test pgTAP usa fixture sintetiche e rollback: ACL, versione errata, emissione,
cap staff, heartbeat, legacy, rollback dopo errore di promozione, invalidazioni
sessione/credenziale e cambio versione. Non è un test del negozio reale.

Preliminari WIP: typecheck PASS,20/20 target runtime PASS; foundation1649 PASS,
0 FAIL,7 SKIP dopo ripristino dei byte LF canonici di sette migrazioni legacy
dai blob HEAD. Il FAIL iniziale dei pin CRLF rimane registrato, nessun pin
aggiornato. SQL isolato e CI del commit restano NOT_RUN. Nuova modalità non
applicata né distribuita. Evidence privata `C:/Dev/U19PersistentPosAuth01`.

Il servizio Worker 7c è installato, ma la stabilità operativa resta FAIL per
timeout database. La chiave gateway è configurata e verificata senza modifiche
a script/runtime/binding precedenti della versione 612. Diagnosi operativa
separata dalla nuova modalità. Execution ACTIVE, nessun DONE globale.
