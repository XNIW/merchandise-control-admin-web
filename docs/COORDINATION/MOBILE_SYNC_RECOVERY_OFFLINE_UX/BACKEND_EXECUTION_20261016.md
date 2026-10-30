# MOBILE_SYNC_RECOVERY_OFFLINE_UX — diagnosi backend

Mandato umano mobile TASK-145 iOS / TASK-144 Android del16ottobre2026, coordinatore root della chat `01a14620-011f-7ba0-bb50-4828c2089cc7`. Questo riferimento registra la diagnosi nella fonte SQL effettiva; non cambia stato, planning o WIP del TASK-140F Admin. Nessuna patch prodotto, migration, deploy o scrittura remota eseguita.

## Risultato verificato

**REVIEW della diagnosi approvata; causa A non risolta.** Quattro richieste HTTP500 del14ottobre sono correlate al proprio `PostgREST; error=57014`; i log PostgreSQL confermano statement timeout; i metadata JWT delle richieste edge confermano il ruolo client authenticated, mentre il ruolo di connessione DB è authenticator. Il punto dello stack non dimostra dove siano stati consumati gli otto secondi. Il join all'esatta installazione mobile e il costo causale restano UNKNOWN. Non attribuire ai fix di retry/UI una risoluzione del backend.

Fonte canonica: questo repository, baseline HEAD/origin/main `d283f76a4f9cd59e63e75c00ef831df0efee53c5`, `supabase/migrations/`, catena checkpoint da `20260722013109_cross_platform_sync_event_completeness.sql` fino a `20261002150909_wechat_010_bounded_product_bytes.sql`. Il workspace Desktop MerchandiseControlSupabase è storico, non repository canonico. Sei corpi RPC/helper live coincidono con i corpi ricostruiti dal canonico; non è equivalenza dell'intero schema. ACL service_role aggiuntiva live documentata, nessun cambio grant.

Progetto verificato `jpgoimipbothfgkokyvm` / merchandisecontrol-dev, PostgreSQL17.6. Tutte le operazioni remote sono SELECT/log read. Il nome e l'etichetta TEST da soli non provano isolamento. Il clone locale owned `msru_backend_20261016_01` parte da template vuoto e contiene soltanto fixture sintetiche:19.832prodotti/41.345prezzi, ID in manifest. Due checkpoint completi sotto ruolo authenticated e limite8s invariato sono riusciti in2195ms e2326ms inclusivi processo, con513 e2074eventi. Non sono JWT/PostgREST/app reali, una misura p95 o una riproduzione del timeout. Nessuna patch SQL causalmente giustificata.

## Check, review e preservazione

- ✅ ESEGUITO: log normalizzati/requestID→57014, source6/6, due checkpoint isolati, verifiche scope attuale read-only e preservazione293/293file Admin preesistenti/hash/mode. Index e HEAD invariati durante diagnosi.
- ✅ ESEGUITO: reviewer distinto `/root/evidence_reviewer`; finding BE-R01 guard cleanup e BE-R02 receipt live dei due corpi RPC risolti. Guard cleanup10RED→10GREEN, anche10GREEN con Python-O, tutto con SQL simulato.
- ✅ ESEGUITO: cleanup reale solo database owned dopo review e guard receipt/admission/container/database/owner/zero connessioni. Receipt `cleanup.json`: residuo database0, template intatto, FORCE=false. Container e altri database non fermati.
- ⚠️ NON ESEGUIBILE con ruolo operativo: auto_explain ha rifiutato il caricamento della libreria prima della RPC; nessun bypass di privilegi. EXPLAIN senza ANALYZE non è misura causale.
- ❌ NON ESEGUITO con esito RED: timeout non riprodotto nei due scenari eseguiti. Nessun RED→GREEN SQL o accettazione mobile dichiarati. Build/lint Admin non necessari per questo solo riferimento documentale; gate client restano nelle rispettive lane.

## Evidenze e handoff

Dossier verificato conservato localmente; review `independent-review.md`, richieste `backend-evidence-normalized.json`, corpi `schema-equivalence.json`, fixture `fixture-ids.json`, cleanup `cleanup.json`. Hash review: `3ec75ab8d2d69ce5da60c7d4d391c350cc1c303302033befcac857d2dd2a2710`. Raw backup/config/sessioni non sono pubblicati. Percorsi locali sono evidenze local-only, non file allegati a una futura PR.

Tracking canonico mobile conservato nella rispettiva execution (RESUME_STATUS). Resta aperta A: budget8s/contesa storica UNKNOWN, nessuna remediation causale provata. B e C proseguono indipendentemente nei client. Handoff a root per matrice finale e review, nessun DONE.


## Readback fixture app e cleanup logico — 2026-10-16T20:29:18.981719+00:00

La lane backend ha eseguito solo SELECT amministrative mirate; le scritture della fixtureR1 sono state effettuate dall'app Android, tramite sessione e scope verificati dal runtime owner. Questo controllo amministrativo non è prova RLS del client e non chiude il backend500 storico.

Supplier/category/P1 e prezzi iniziali sono stati verificati per ID/campi/relazioni. Durante offline il server conservava il precedente nome/prezzo234, mentre l'app manteneva nome modificato/prezzo345 e revisione dirty dopo reopen. Il checkpoint remoto20:19:01 non era convergente e resta FAIL puntuale. Senza tap manuali sync, il successivo ACK locale e readback20:21:50 confermano la modifica e un solo nuovo prezzo345, conservando i due precedenti. Convergenza tardiva qualificata su questi ID, nessun p95 o tempo end-to-end esatto inferito dai timestamp server.

Cleanup nativo concluso e readback finale20:27:19: tutti e tre gli oggetti sono tombstonati, zero righe fixture attive e zero riferimenti prodotto attivi verso i due parent. Rimangono esattamente tre prezzi append-only immutati per audit; non sono residui da eliminare mediante purge. Localmente i cinque insiemi business originali coincidono integralmente con il backup e non restano outbox/tombstone pending della fixture. Evidenze private: `backend/runtime-fixture-graph-cleanup-final.json` SHA256 `d59975955755f10a33c8f12fbad88a2728108a190684652fbd7e9f6afa1a63cb`; `runtime/android-final-business-retention.json`. P2 e nuova history non creati; convergenza bidirezionale e matrice complessiva ancora aperte.


## T07, ammissione secondo scope — verifica read-only

Il controllo di capability ha trovato due membership attive ma un solo scope già ammesso su entrambi i dispositivi. Questo non dimostra un prerequisito umano: il normale percorso app di selezione shop chiama `shop_device_register_for_shop` e poi `shop_device_status_for_shop`. I tre corpi SQL pertinenti verificati live coincidono con il canonico; il wrapper è eseguibile da authenticated, il helper resta riservato. Il percorso mantiene i controlli di membership/ruolo, revoca e collisione dispositivo. Android conserva inoltre il confine di riallineamento del database locale prima della registrazione. Nessun RPC di registrazione, nuova lease, modifica membership o bypass RLS è stato eseguito da questa diagnosi.

T07 sul secondo shop resta NOT_TRAVERSED e richiede il normale flusso applicativo con preservazione locale sui binari finali. Non è stato classificato come human-blocked per la sola assenza di lease. Evidenza privata: `backend/t07-device-self-enrolment-readonly.md`, SHA256 `dde83a4938cdaa04e454b2de1c6e7df9d9083662f6ff55ff8af1d439f2304c0f`; identificativi, receipt e pin sono conservati nel dossier locale.

### Execution — 27 ottobre 2026: correzione prezzi applicata al TEST

Il mandato diretto Mobile R4 TASK145/TASK144 autorizza questa correzione backend; TASK140F resta in REVIEW e il suo WIP non cambia. HEAD è be522a28. I317 file preesistenti e l'index sono preservati. L'unico nuovo sorgente è `supabase/migrations/20261027015232_mobile_recovery_checkpoint_price_custom_plan.sql`, SHA256 `b1334a1ad5573fe498aa4b66bec07c871ef21c90f8ad1d40ffe6944115f8e262`. Il nome coincide con la versione registrata dal server; il contenuto coincide con il packet revisionato. Nessun commit, push o deploy di produzione.

✅ ESEGUITO: una richiesta ordinaria Android13 è unita esattamente al proprio edge HTTP500; il collegamento ai log PG57014 resta temporale/RPC. Il componente prezzi letterale corrente termina in2479.529ms; il piano generico forzato READ ONLY raggiunge8s e viene cancellato, con cleanup verificato. Il piano generico statico stima una riga contro41360 effettive e usa cinque NestedLoop. Questo sostiene il meccanismo, ma non cattura il piano cached dell'RPC ordinaria.

✅ ESEGUITO: il solo SELECT prezzi passa a EXECUTE con tre parametri USING. Corpo, predicati, digest, helper, lock, scope, payload e timeout restano invariati; nessuna interpolazione o modifica RLS/ACL. Review Codex del componente `d942fdd3` e dell'envelope `51800a73`, zero rilievi. La parità nello stesso snapshot REPEATABLE READ READ ONLY8s conferma JSONB e testo identici: MD5 prima/dopo `23802d13c92c0896d8d3710651991605`, riepilogo260byte. Nessun record pubblicato.

✅ ESEGUITO: una sola apply_migration sul TEST già autorizzato `jpgoimipbothfgkokyvm`, esito success=true. La guardia atomica richiede il vecchio source acc2 e verifica il nuovo source9fee. Readback live: `9fee0c276080e3f45b8d567883b13e04`, stessi default, identity, owner, ACL, search_path e attributi. Il rollback esatto della vecchia funzione `c0c7384e` è preservato nel dossier privato. Nessuna tabella, dato o grant rimosso. Non viene asserito TEST globalmente inattivo: le chiamate già iniziate possono terminare sul vecchio corpo.

❌ NON ESEGUITO: pull automatico ordinario dopo apply, prestazioni della RPC completa e chiusura di tutti i500. Parità e apply non chiudono questo gate. Evidenze private in `root-backend-price-fix-integration01/`, `performance/backend-price-custom-plan-fix01/` e `performance/backend-price-custom-plan-envelope01/` sotto la root execution; backup, configurazione e dati sensibili restano fuori dal repository. Handoff a ROOT per richieste ordinarie fresche e aggiornamento della matrice.

### Execution R4 — 27 ottobre 2026: metadata preflight applicati al TEST

Mandato diretto Mobile R4 TASK145/TASK144; TASK140F resta in REVIEW. La [migrazione preflight](../../../supabase/migrations/20261027143737_mobile_recovery_preflight_metadata_custom_plan.sql), versione server `20261027143737`, SHA256 `9fa653cbd503626ca4e7de2ba957b0cc4274cd604489a9e89998f8e65a397357`, modifica soltanto i due SELECT count/upper bound prodotti e prezzi del helper privato in `EXECUTE USING` con gli stessi tre parametri tipizzati. Predicati, cap, guardie, fallback e payload restano identici. La precedente [migrazione prezzi](../../../supabase/migrations/20261027015232_mobile_recovery_checkpoint_price_custom_plan.sql) non viene riapplicata; il source pubblico `9fee0c276080e3f45b8d567883b13e04` resta invariato.

✅ ESEGUITO — review indipendente `7dba2a8da77e1986a104312989056f31d0ed8d8f55b7d4ccd63c30e5910632af`, singola apply TEST e [ricevuta terminale sanitizzata](#r4-test-preflight-metadata-terminale). Readback helper `6fb3118d630941b56b6772db94868567`, OID `58221`, metadata completi invariati (`8e8498b3f5806524566080bd618f298d`): owner, ACL, SECURITY DEFINER, STABLE, parallel, search_path, argomenti e risultato. `authenticated.statement_timeout=8s` invariato; nessuna modifica a dati, grant, RLS o configurazione globale.

✅ ESEGUITO — una coppia diagnostica nella stessa transazione REPEATABLE READ, originale generic prima/candidata dopo: JSON completo, testo e SHA identici; COMPLETE, zero violazioni, count e payload identici. Wall `2115,954 → 1160,546 ms`; TEMP `3576 read/2186 written` invariato. I soli due metadata passano da IndexScan sottostimato a SeqScan con parametri correnti; payload invariato. Singola coppia con ordine/cache confondenti: non un p95 né prova che la richiesta storica fallita usasse generic.

<a id="r4-test-preflight-metadata-terminale"></a>
**Ricevuta terminale TEST, 27 ottobre 2026.** Apply unica riuscita alle `14:37:37 UTC`; postread alle `14:37:59.832661 UTC`. Ledger: una statement di `38828` byte, identica alla migrazione revisionata. Corpo helper SHA256 `09ffea10ac2008db3ac845d00760167ef5737cfe298898ad0bce61583a210f2b`; ricevuta privata identificata dal digest `e4b1594dc94eb7d9ec338431b3c5f030feb627026254407eb6744b3afd87770a`. Ripristino completo della vecchia funzione e rollback condizionato preservati privatamente, non eseguiti. Questa sintesi omette percorsi locali, raw, credenziali e righe business.

❌ NON ESEGUITO al termine dell'apply — nuova qualifica ordinaria automatica dei client e finestra healthy. La chiusura HTTP500 resta **APERTA**: servono richieste ordinarie fresche, scope autenticato qualificato, budget originale di8s e copertura del cooldown effettivo. Apply, parità o assenza di errori senza una checkpoint effettiva non sostituiscono questo gate. Nessun deploy di produzione o promozione Git autorizzato da questa entry.


### Execution R4 — replay locale e raccordo CI portabile, 27 ottobre 2026

Il mandato mobile TASK-145/TASK-144 autorizza questo raccordo nella fonte backend; non cambia il REVIEW storico di TASK-140F. I due SQL canonici già applicati restano invariati: [checkpoint prezzi](../../../supabase/migrations/20261027015232_mobile_recovery_checkpoint_price_custom_plan.sql) e [metadati del preflight](../../../supabase/migrations/20261027143737_mobile_recovery_preflight_metadata_custom_plan.sql).

Il replay locale05 ha installato realmente la funzione sul database owned: prefisso di 168 migration verificato, un solo apply e ledger finale a 169. La copia locale sostituisce soltanto tre costanti del guard (OID e due digest dei metadati); il body canonico `09ffea10ac2008db3ac845d00760167ef5737cfe298898ad0bce61583a210f2b` rimane identico. Definizione attesa, metadati e ACL pubbliche locali prima/dopo, endpoint owned e limite authenticated di 8 secondi sono verificati. La baseline HEAD locale ha due ACL dirette, mentre TEST ne ha tre: non si dichiara equivalenza dei privilegi e non è stato aggiunto alcun GRANT. Il precedente TIMEOUT dello start Studio rimane FAIL distinto dal successivo replay del DB, senza restart o reset.

Supabase CLI 2.109.0 ha poi eseguito tutti i 66 file pgTAP di HEAD: **4295 test PASS, exit 0**. Il digest della ricevuta del replay è `945e888d247bf3ec547672de32fbb413cc63747787ec57a5538239208d498392`; quello della suite è `a41d3d1649d89e7b7e38311bfa5a957b09b068fb2d56220240d6021d173a28ad`. Queste prove locali non attestano acceptance mobile, prestazioni applicative o risoluzione degli HTTP500.

Il [job database CI](../../../.github/workflows/ci.yml) usa ora l'[adapter posseduto dal repository](../../../scripts/ci/mobile-recovery-local-replay.py): copia HEAD in una directory nuova, conserva le porte Linux originali, richiede start riuscito e ownership osservata, applica l'envelope locale sotto latch esclusivo, verifica body/metadati/ACL/ledger e infine esegue realmente i 66 file pgTAP. Nessun no-op, skip generale, SQL storico riscritto o seed inventato. Il job resta a 25 minuti e lo start a 1200 secondi; l'artifact pubblica soltanto JSON chiusi di errore o completamento, mai log grezzi, status o chiavi. La review Codex indipendente è FILE-only; dieci prove CPU della prima versione e quattro del delta sono distinte. **Linux CI: NOT_RUN** fino all'esecuzione sull'esatto commit pubblicato. Il replay locale non trasferisce il proprio PASS alla CI.

**HTTP500: OPEN.** La qualifica del backend ordinario e i gate applicativi restano separati. Questo aggiornamento non dichiara DONE, merge, deploy o nuova applicazione SQL remota.
