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

Dossier verificato locale: `/Users/minxiang/Documents/Codex/mobile-sync-execution-20261016-resume/backend/README.md`; review `independent-review.md`, richieste `backend-evidence-normalized.json`, corpi `schema-equivalence.json`, fixture `fixture-ids.json`, cleanup `cleanup.json`. Hash review: `3ec75ab8d2d69ce5da60c7d4d391c350cc1c303302033befcac857d2dd2a2710`. Raw backup/config/sessioni non sono pubblicati. Percorsi locali sono evidenze local-only, non file allegati a una futura PR.

Tracking canonico mobile: `/Users/minxiang/Desktop/iOSMerchandiseControl/docs/COORDINATION/MOBILE_SYNC_RECOVERY_OFFLINE_UX/EXECUTION/20261016-resume/RESUME_STATUS.md`. Resta aperta A: budget8s/contesa storica UNKNOWN, nessuna remediation causale provata. B e C proseguono indipendentemente nei client. Handoff a root per matrice finale e review, nessun DONE.


## Readback fixture app e cleanup logico — 2026-10-16T20:29:18.981719+00:00

La lane backend ha eseguito solo SELECT amministrative mirate; le scritture della fixtureR1 sono state effettuate dall'app Android, tramite sessione e scope verificati dal runtime owner. Questo controllo amministrativo non è prova RLS del client e non chiude il backend500 storico.

Supplier/category/P1 e prezzi iniziali sono stati verificati per ID/campi/relazioni. Durante offline il server conservava il precedente nome/prezzo234, mentre l'app manteneva nome modificato/prezzo345 e revisione dirty dopo reopen. Il checkpoint remoto20:19:01 non era convergente e resta FAIL puntuale. Senza tap manuali sync, il successivo ACK locale e readback20:21:50 confermano la modifica e un solo nuovo prezzo345, conservando i due precedenti. Convergenza tardiva qualificata su questi ID, nessun p95 o tempo end-to-end esatto inferito dai timestamp server.

Cleanup nativo concluso e readback finale20:27:19: tutti e tre gli oggetti sono tombstonati, zero righe fixture attive e zero riferimenti prodotto attivi verso i due parent. Rimangono esattamente tre prezzi append-only immutati per audit; non sono residui da eliminare mediante purge. Localmente i cinque insiemi business originali coincidono integralmente con il backup e non restano outbox/tombstone pending della fixture. Evidenze private: `backend/runtime-fixture-graph-cleanup-final.json` SHA256 `d59975955755f10a33c8f12fbad88a2728108a190684652fbd7e9f6afa1a63cb`; `runtime/android-final-business-retention.json`. P2 e nuova history non creati; convergenza bidirezionale e matrice complessiva ancora aperte.


## T07, ammissione secondo scope — verifica read-only

Il controllo di capability ha trovato due membership attive ma un solo scope già ammesso su entrambi i dispositivi. Questo non dimostra un prerequisito umano: il normale percorso app di selezione shop chiama `shop_device_register_for_shop` e poi `shop_device_status_for_shop`. I tre corpi SQL pertinenti verificati live coincidono con il canonico; il wrapper è eseguibile da authenticated, il helper resta riservato. Il percorso mantiene i controlli di membership/ruolo, revoca e collisione dispositivo. Android conserva inoltre il confine di riallineamento del database locale prima della registrazione. Nessun RPC di registrazione, nuova lease, modifica membership o bypass RLS è stato eseguito da questa diagnosi.

T07 sul secondo shop resta NOT_TRAVERSED e richiede il normale flusso applicativo con preservazione locale sui binari finali. Non è stato classificato come human-blocked per la sola assenza di lease. Evidenza privata: `backend/t07-device-self-enrolment-readonly.md`, SHA256 `dde83a4938cdaa04e454b2de1c6e7df9d9083662f6ff55ff8af1d439f2304c0f`; identificativi, receipt e pin sono conservati nel dossier locale.
