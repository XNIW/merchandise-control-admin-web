# ASUS-W7POS-019 — native empty catalog scope

Stato: FIX; codice/test in qualifica. Target della diagnosi: NEW_SHOP_019 sul
progetto merchandisecontrol-dev raggiunto dall'host staging indicato dall'utente.
Identificativi e correlazione tecnica completi sono nel manifest privato Windows;
nessuna credenziale/sessione o identità reale è parte di questa ricevuta.

## Causa dimostrata

Sul database effettivo: shop active, ruolo pos_admin, funzione lease corrente
true, source_total=0, prodotti/categorie/fornitori/prezzi=0. Il resolver restituisce
legacy_owner_bridge con scope_id nullo e blocked=true. Il primo audit correlato
registra pos.auth.first_login.success e poi pos.catalog.pull.failure con
code/reason unmapped, stage manifest, manifest_requested=true. Sei eventi pull
storici erano già presenti: nessun nuovo login/pull HTTP è stato eseguito per
questa diagnosi read-only e il primo errore resta conservato.

Corpo resolver installato MD5 9ef09cf7740e3e9c8e18e9dfa986fee0, identico alla
definizione LF di main d021a4af. La variante CRLF sorgente è accettata soltanto
dal guard equivalente. Il run Cloudflare42124742043 è build-only, con entrambi
i deploy skipped; non prova lo SHA Worker installato. La correlazione DB/audit
dimostra il ramo del problema senza richiedere un retry HTTP o un dump di token.

## Correzione limitata

Migration20261108051044_asus_019_native_empty_catalog_scope.sql: cambia soltanto
il corpo di app_private.resolve_pos_catalog_scope_v2(uuid). Uno shop attivo,
senza righe e senza alcuna storia di bridge, risolve shop_scoped sul proprio UUID.
Mapping attivi incompleti, bridge disabilitati, shop inesistenti/null/sospesi non
ricevono questa eccezione. Il caso legacy verificato resta invariato. La query
di ammissione viene rivalutata sotto lo stesso lock di scope; nessun dato legacy
è incluso senza mapping, nessun owner è dedotto dal login.

Prima/dopo sono vincolati a digest esatti; OID e intero pg_proc eccetto prosrc
devono restare invariati. Un drift interrompe tutto con55000. Il nuovo corpo è
9622c4d3a4c793a7803d730b8a8c51d4. Restano intatti v3 lease-bound, integrità,
snapshot/revision/scope-key e publication fence. Nessuna route/risposta viene
forzata a200: il manifest completo e lo zero provengono dalle query reali.
Nessun cambiamento al client Windows, al fence full-required o a grant/schema dati.

## Regressione e controlli

28 nuove assertion pgTAP: vera lease sintetica dal first-login commit, identità
scope, manifest completo zero e terminale, riga estranea effettivamente presente
ma esclusa, null/nonexistent/suspended, mapping incompleto/disabilitato/legacy,
cross-shop/device, publication dopo cambio mapping, expiry/revoca/versione.
Le fixture sono rollback-only nel PostgreSQL locale posseduto della CI; non
sono eseguite sul progetto remoto. Attesi67 file/4375 assertion, comprese tutte
le4347 precedenti. Nessun assert o budget preesistente è rimosso.

Il runner canonico resta quello CI: python3 scripts/ci/mobile-recovery-local-replay.py
run con workdir/evidence-dir nuovi. È esteso con la sola migration pinned,
applicata dopo le quattro tardive già gestite. Sono mantenuti CLI2.109.0,
target locale/Docker posseduto, copie Git HEAD, digest, ledger e one-attempt.
Snapshot read-only verifica body/metadata del resolver e invarianti estranee.
I gate normali del repository restano richiesti sul candidato finale.

## Rollout, rollback e verifica ancora da eseguire

Prima di applicare: review della patch, CI exact-SHA e riconferma target/digest
installato. Applicare soltanto questa migration sul progetto verificato, senza
db push del train pendente o applicazione di test/fixture. La correzione è SQL:
non richiede un nuovo Worker o un nuovo pacchetto POS. Conservare la definizione
precedente e una inversa privata con guard sul nuovo digest e metadata invariati.

Dopo apply: leggere digest/ACL/metadata, lease e manifest attraverso il wrapper
v3 dello scope corretto; poi un solo normale tentativo POS dal profilo identificato,
controllando prima eventuali esiti incerti. Le sole query amministrative non
qualificano il trasporto HTTP o l'accesso UI. Sul catalogo realmente vuoto le
vendite restano indisponibili; può aprirsi soltanto il percorso storico previsto.
Nessun import Getnet, vendita, reset DB/outbox o revoca sperimentale è autorizzato.

Sorgenti preparati: migration, nuovo test SQL, snapshot e runner canonici;
MASTER-PLAN/TASK-139/ricevuta di questa continuazione. Verifiche finali e SHA
saranno registrati con gli esiti reali; apply/deployment/live sono ancora NOT_RUN.
