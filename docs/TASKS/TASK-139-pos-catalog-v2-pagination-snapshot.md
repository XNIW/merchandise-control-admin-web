# TASK-139 - POS Catalog v2 Pagination and Snapshot Correctness

> Continuazione corrente ASUS019: PR144/145/146 integrate, ultima mergef57afa6.
> CI42526220441 e Cloudflare42526220439 post-merge PASS, live E2E/deploy
> SKIPPED. Login POS1823697 PASS; HTTP500 catalog_v2_empty_manifest reale
> preservato. Fix HTTP full zero qualificato, non ancora servito; diagnostica
> CI chiusa e senza modifica runtime/SQL. Stato REVIEW software, rollout
> richiede sorgente/unità compatibile col Worker399720d2, nessun nuovo consenso.
> Il DONE storico non è esteso a questa continuazione.
> [Evidence](EVIDENCE/TASK-139/asus-019-staff-overview-20261108.md).

> Checkpoint precedente ASUS-W7POS-019 dell'8novembre: candidata Admin PR144
> `f8ac2fd6` qualificata in CI e Cloudflare, in REVIEW dell'owner.
> Il solo stato della superficie staff distingue capacità assente, permesso
> negato e lettura autorizzata vuota; auth/lease/query staff e resolver409
> invariati. Nessun merge, SQL o deployment. [Evidence e gate residui](EVIDENCE/TASK-139/asus-019-staff-overview-20261108.md).
> Il DONE storico qui sotto resta riferito alla precedente approvazione utente.

## Informazioni generali

- ID: `TASK-139`
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER / FINAL REVIEW APPROVED`
- Data apertura: `2026-07-19`
- Evidence: `docs/TASKS/EVIDENCE/TASK-139/README.md`
- Branch: `main`
- Dipendenza: Win7POS PR #7 e PR #6 gia fusi prima dell'apertura.

## Obiettivo

Correggere il termine prematuro del catalog pull POS a 1.000 righe e rendere il
contratto server authoritative e snapshot-safe prima dei PR client SYNC-1,
SYNC-2 e PERF-1.

## Scope

- revisione catalogo monotona e DB-enforced per scope effettivo;
- RPC server-only che risolve scope, revisione, summary e pagina nello stesso
  snapshot PostgreSQL;
- paginazione keyset sequenziale `categories -> suppliers -> products -> prices`;
- `LIMIT pageSize + 1` dentro una singola risposta JSON, mantenendo
  `api.max_rows = 1000`;
- cursore `catalog-v2` firmato, bounded e legato a sessione/device/shop/scope;
- cursore compatto entro il limite Win7POS di 512 caratteri anche al massimo
  dominio numerico accettato, con scope key opaca al posto dell'UUID owner;
- `catalogVersion` stabile, alias `catalogRevision`, `catalogSummary` completa;
- rifiuto fail-closed di snapshot/revisione/scope cambiati;
- heartbeat con campi revision/hint opzionali e fallback compatibile;
- test sintetici 0, 1, 999, 1000, 1001, 19763 e 100000, più test Supabase
  locale e gate Admin completi.

## Non incluso

- nessuna modifica Win7POS in questo branch;
- nessun deploy o apply production;
- nessuna credenziale o dato reale;
- nessun cambio economico sales/import;
- nessun aumento del cap PostgREST come sostituto della correttezza;
- nessun rebase, squash o force push.

## Criteri di accettazione

1. 19.763 prodotti producono 20 pagine prodotto, ultima pagina 763.
2. 100.000 prodotti non hanno skip o duplicati e terminano esattamente.
3. `catalogVersion`, `catalogRevision` e `catalogSummary` restano identici per
   tutto il run.
4. Mutazione o cambio scope tra pagine rifiuta la continuation senza payload.
5. Replay dello stesso cursore è deterministico; cursori alterati/cross-scope
   sono rifiutati genericamente.
6. Categorie e fornitori precedono prodotti; prezzi sono filtrati sullo stesso
   scope e non avanzano su righe non autorizzate.
7. L'RPC è inaccessibile a `public`, `anon`, `authenticated` e disponibile solo
   al boundary server autorizzato.
8. CI sull'HEAD esatto, review P0/P1 zero, merge normale e CI post-merge verde.

## Verifiche previste

- migration/test SQL Supabase locale, advisor/lint e max-rows regression;
- test contract/dinamici catalog v2 e heartbeat;
- `npm run lint`, `npm run typecheck`, `npm run security:scan`;
- `npm run test:foundation`, `npm run build`, `npm run verify`;
- `git diff --check` e review cumulativa.

## Stato finale

Implementazione e review cumulativa completate con
verdetto `P0=0`, `P1=0`; tutti i finding P2 sul cursore sono stati corretti e
coperti da regressioni. I gate applicativi locali sono verdi; migration e
pgTAP sono passati nel job CI Supabase separato su Linux. La QA cloud isolata ha inoltre
riprodotto il cap PostgREST e drenato senza skip/duplicati i dataset sintetici
da 19.763 e 100.000 prodotti; una mutazione tra pagine ha causato il rifiuto
fail-closed della continuation. Il progetto QA temporaneo e stato eliminato e
il link locale e stato ripristinato su `merchandisecontrol-dev`, senza apply su
dev o production.

La SHA codice finale verificata è
`1743f888d0f4989ca1211ba55b31e43afefa399b`: coincideva con `main`,
`origin/main` e GitHub `main` al preflight ed è antenata del successivo commit
documentale. I workflow sull'esatta SHA sono verdi:

- CI `30173322843`: `SUCCESS`; migration/pgTAP, foundation, typecheck, lint,
  build, UI smoke e diff check completati.
- Cloudflare `30173322834`: `SUCCESS`; build OpenNext e smoke locale completati,
  deploy staging/production skipped come previsto.

Il contratto server è integrato e i criteri di accettazione 1-8 sono chiusi.
Il limite client storico è stato consumato dalla successiva integrazione
cross-repository; non resta un blocker TASK-139. Nessun deploy/apply production
è stato eseguito o autorizzato. Review finale approvata esplicitamente
dall'utente il `2026-07-25`: stato `DONE`.

## Continuazione ASUS-W7POS-019 — catalogo nativo vuoto, 8 novembre 2026

Il mandato corrente autorizza il FIX del409 unmapped osservato nel normale
onboarding NEW_SHOP_019, senza creare una task duplicata. Lo stato DONE sopra
rimane l'approvazione storica TASK-139; la continuazione cross-repository è ora
REVIEW, con server applicato e RPC reale verificato. HTTP/UI normale resta
NOT_RUN per il blocco della policy di avvio, senza nuovi pull o tentativi alternativi.

La causa è nel resolver installato: active shop privo di mapping e di tutte le
righe catalogo produce legacy_owner_bridge/null/blocked. La lease corrente è
valida e l'audit reale registra il rifiuto allo stage manifest. Il fix ammette
solo lo scope canonico dello shop attivo senza alcuna storia di mapping legacy;
mapping incompleti o disabilitati restano bloccati. Nessun owner inferito,
articolo fittizio, nuova tabella, grant o cambiamento della lease/publication.
Win7POS mantiene il vincolo full-required e le vendite bloccate sullo zero.

La migration forward conserva OID, owner, ACL e tutti gli attributi pg_proc;
prima/dopo sono vincolati a digest del corpo. Il runner locale canonico è esteso
per questa sola migration successiva, preservando i guard di ownership/CLI/ordine,
gli operatori e le quattro applicazioni tardive precedenti. Aggiunte28 assertion
pgTAP con lease reale sintetica e isolamento/negativi, oltre alle4347 esistenti;
67 file/4375 assertion sono PASS anche nel post-merge1a35034a; i14SKIP
foundation restano dichiarati. Nessuna qualifica UI reale è dedotta dai sintetici.

[Evidence, comandi, rollout e rollback](EVIDENCE/TASK-139/asus-019-native-empty-scope-20261108.md).
