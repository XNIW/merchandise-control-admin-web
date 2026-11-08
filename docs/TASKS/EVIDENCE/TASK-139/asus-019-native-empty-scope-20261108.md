# ASUS-W7POS-019 â€” native empty catalog scope

Stato: REVIEW â€” FIX_APPLIED_RPC_VERIFIED; NORMAL_POS_ACCESS_NOT_RUN_POLICY. Target della diagnosi: NEW_SHOP_019 sul
progetto merchandisecontrol-dev raggiunto dall'host staging indicato dall'utente.
Identificativi e correlazione tecnica completi sono nel manifest privato Windows;
nessuna credenziale/sessione o identitÃ  reale Ã¨ parte di questa ricevuta.

## Causa dimostrata

Sul database effettivo: shop active, ruolo pos_admin, funzione lease corrente
true, source_total=0, prodotti/categorie/fornitori/prezzi=0. Il resolver restituisce
legacy_owner_bridge con scope_id nullo e blocked=true. Il primo audit correlato
registra pos.auth.first_login.success e poi pos.catalog.pull.failure con
code/reason unmapped, stage manifest, manifest_requested=true. Sei eventi pull
storici erano giÃ  presenti: nessun nuovo login/pull HTTP Ã¨ stato eseguito per
questa diagnosi read-only e il primo errore resta conservato.

Corpo resolver installato MD5 9ef09cf7740e3e9c8e18e9dfa986fee0, identico alla
definizione LF di main d021a4af. La variante CRLF sorgente Ã¨ accettata soltanto
dal guard equivalente. Il run Cloudflare42124742043 Ã¨ build-only, con entrambi
i deploy skipped; non prova lo SHA Worker installato. La correlazione DB/audit
dimostra il ramo del problema senza richiedere un retry HTTP o un dump di token.

## Correzione limitata

Migration20261108051044_asus_019_native_empty_catalog_scope.sql: cambia soltanto
il corpo di app_private.resolve_pos_catalog_scope_v2(uuid). Uno shop attivo,
senza righe e senza alcuna storia di bridge, risolve shop_scoped sul proprio UUID.
Mapping attivi incompleti, bridge disabilitati, shop inesistenti/null/sospesi non
ricevono questa eccezione. Il caso legacy verificato resta invariato. La query
di ammissione viene rivalutata sotto lo stesso lock di scope; nessun dato legacy
Ã¨ incluso senza mapping, nessun owner Ã¨ dedotto dal login.

Prima/dopo sono vincolati a digest esatti; OID e intero pg_proc eccetto prosrc
devono restare invariati. Un drift interrompe tutto con55000. Il nuovo corpo Ã¨
9622c4d3a4c793a7803d730b8a8c51d4. Restano intatti v3 lease-bound, integritÃ ,
snapshot/revision/scope-key e publication fence. Nessuna route/risposta viene
forzata a200: il manifest completo e lo zero provengono dalle query reali.
Nessun cambiamento al client Windows, al fence full-required o a grant/schema dati.

## Regressione e controlli

28 nuove assertion pgTAP: vera lease sintetica dal first-login commit, identitÃ 
scope, manifest completo zero e terminale, riga estranea effettivamente presente
ma esclusa, null/nonexistent/suspended, mapping incompleto/disabilitato/legacy,
cross-shop/device, publication dopo cambio mapping, expiry/revoca/versione.
Le fixture sono rollback-only nel PostgreSQL locale posseduto della CI; non
sono eseguite sul progetto remoto. Attesi67 file/4375 assertion, comprese tutte
le4347 precedenti. Nessun assert o budget preesistente Ã¨ rimosso.

Il runner canonico resta quello CI: python3 scripts/ci/mobile-recovery-local-replay.py
run con workdir/evidence-dir nuovi. Ãˆ esteso con la sola migration pinned,
applicata dopo le quattro tardive giÃ  gestite. Sono mantenuti CLI2.109.0,
target locale/Docker posseduto, copie Git HEAD, digest, ledger e one-attempt.
Snapshot read-only verifica body/metadata del resolver e invarianti estranee.
I gate normali del repository restano richiesti sul candidato finale.

## Piano di rollout precedente all'apply â€” conservato

Prima di applicare: review della patch, CI exact-SHA e riconferma target/digest
installato. Applicare soltanto questa migration sul progetto verificato, senza
db push del train pendente o applicazione di test/fixture. La correzione Ã¨ SQL:
non richiede un nuovo Worker o un nuovo pacchetto POS. Conservare la definizione
precedente e una inversa privata con guard sul nuovo digest e metadata invariati.

Dopo apply: leggere digest/ACL/metadata, lease e manifest attraverso il wrapper
v3 dello scope corretto; poi un solo normale tentativo POS dal profilo identificato,
controllando prima eventuali esiti incerti. Le sole query amministrative non
qualificano il trasporto HTTP o l'accesso UI. Sul catalogo realmente vuoto le
vendite restano indisponibili; puÃ² aprirsi soltanto il percorso storico previsto.
Nessun import Getnet, vendita, reset DB/outbox o revoca sperimentale Ã¨ autorizzato.

Sorgenti preparati: migration, nuovo test SQL, snapshot e runner canonici;
MASTER-PLAN/TASK-139/ricevuta di questa continuazione. Verifiche finali e SHA
sono registrati sotto con gli esiti reali; questo paragrafo conserva il preflight storico.

## Prima failure conservata: pin della copia Windows

Il candidato555f502, CI42450525097, si Ã¨ fermato nel guard di preparazione:
native empty scope source/order drift. Il pin della nuova migration era stato
calcolato sui byte CRLF del checkout Windows; il blob Git canonico Ã¨ LF.
Nessun database o test Ã¨ stato avviato da quel job. Artifact errore13605407170,
archive SHA256 eb6dad7c04fbbe61afbdf4b520c85c8b45bde36d4e18c423926aea5e01ee6b2a,
stage preparation/GUARD_REJECTED, conservato con il primo log.

Corretto soltanto il pin ai byte LF committati:
af69667d6e8e9988a833c4cb2b818c4378061cbc6869c4821b29aa5e64e379ce.
Il verifier non normalizza o accetta nuovi hash alternativi; migration,28assert,
expected e budget sono invariati. Il nuovo candidato richiede le proprie prove.

## Esiti conclusivi verificati

| Gate | Risultato e identitÃ  |
| --- | --- |
| Candidato PR | d864c740652e721559b6341c995aa5416e5f4b76, CI42450711237/Cloudflare42450711222 PASS |
| Checkout runtime PR | 79006cebe0f2af1e591a08ae17f89b3363a50df5, parents d021a4af/d864c740; tree identico al candidato |
| Merge normale PR #143 | 1a35034a490cfcbe108a7680ac3a0eb65d6c0d60; tree d5b3dfe907a234ab9139f8f1e9ac8dc37d3c12a4 identico |
| CI post-merge | CI42451262145 e Cloudflare42451262142 SUCCESS; head/receipt runtime1a35034a |
| Database | 67 file / 4.375 test PASS; nuove28 assertion, tutte le4347 precedenti conservate |
| Foundation/UI | 1.131 PASS / 14 SKIP / 0 FAIL su1145; UI 48 PASS, pairing 2 PASS; Next/OpenNext/local smoke PASS |
| Artifact post-merge |13605977380; archive SHA256 aced9fbd9b9396f9f19113679c445db86efa336bb99814f2f72cc76d8462c2ec verificato contro GitHub |
| Migration effettiva | Sourceversion20261108051044; statementSHA256 af69667d6e8e9988a833c4cb2b818c4378061cbc6869c4821b29aa5e64e379ce |
| Server dopo apply | Body9622c4d3a4c793a7803d730b8a8c51d4; confronto indipendente live dell'intero pg_proc eccetto prosrc IDENTICO al backup |
| RPC reale | v3 sulla tuple esistente/lease corrente:ok,shop_scoped,entitydone,revision0,rows0,summary/window tutti0,owner null,scope-key corretta |
| HTTP/UI normale | NOT_RUN_POLICY: avvio respinto con blocked by policy, motivo piÃ¹ specifico non esposto; processo e nuovi pull0 verificati |
| Worker | Version399720d2-c76f-440b-bf08-a4a2bd7da1a9 del15ottobre; URL Supabase pubblico corrispondente. SHA Git non esposto, nessun redeploy |
| Sicurezza | Advisor5prima/5dopo, nessuna voce per il resolver; non equivale a una nuova qualifica globale del progetto |
| Rollback/cleanup | Inversa privata con guard sul nuovo digest pronta, NOT_EXECUTED; nessun processo POS del tentativo avviato. Worktree/log/evidence/backup conservati con owner root |

Il connettore migration non espone la versione locale
([limite documentato](https://github.com/supabase/mcp/issues/241)).
Ha applicato una sola volta i byte canonici con record20261108053703; un solo
UPDATE atomico, limitato al nuovo record posseduto e vincolato a nome/digest e
assenza della versione sorgente, lo ha allineato a20261108051044. StatementSHA256
finale identico al file; nessuna cronologia precedente o dato aziendale alterati.
Il preflight CLI di sola lettura non Ã¨ partito per IPv6 non supportato: conservato,
nessun link/retry CLI o DDL alternativo. Il DDL Ã¨ passato soltanto da apply_migration.

Le receipt pubbliche CI attestano i guard di metadata del runner e ne vincolano
il digest, ma non espongono i due snapshot grezzi per confronto indipendente.
Il confronto live prima/dopo riportato sopra Ã¨ invece stato eseguito realmente.
La query RPC non ha simulato una pubblicazione catalogo/audit success: mancano
ancora un tentativo HTTP normale e la sua osservazione UI.

Root privata della prosecuzione indicata dal pointer catalog409-current-root.private.txt
fuori dai repository; receipt ci-postmerge-verified/qualification.json e
apply-and-rpc-verification.private.json, backup/inversa resolver, primo errore e
rifiuto policy conservati. Nessun import Getnet/vendita/reset/revoca effettuato.
Prossimo passo: dopo autorizzazione pertinente, verificare che nessun esito sia
giÃ  avvenuto, poi un solo avvio normale dello stesso POS/profilo e osservare
catalog pull e accesso previsto. Non usare un altro launcher per aggirare il rifiuto.
