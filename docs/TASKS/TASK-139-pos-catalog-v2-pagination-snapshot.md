# TASK-139 - POS Catalog v2 Pagination and Snapshot Correctness

## Informazioni generali

- ID: `TASK-139`
- Stato: `REVIEW`
- Fase attuale: `REVIEW`
- Responsabile attuale: `CODEX`
- Data apertura: `2026-07-19`
- Evidence: `docs/TASKS/EVIDENCE/TASK-139/README.md`
- Branch: `codex/catalog-v2-pagination-20260719-130212`
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

## Stato corrente

Implementazione e review cumulativa locale completate sul branch dedicato con
verdetto `P0=0`, `P1=0`; tutti i finding P2 sul cursore sono stati corretti e
coperti da regressioni. I gate applicativi locali sono verdi; migration e
pgTAP sono passati nel job CI Supabase separato su Linux sull'HEAD pubblicato
`53b9f47286b994af65c71b4e93d0a05be505e161`. La QA cloud isolata ha inoltre
riprodotto il cap PostgREST e drenato senza skip/duplicati i dataset sintetici
da 19.763 e 100.000 prodotti; una mutazione tra pagine ha causato il rifiuto
fail-closed della continuation. Il progetto QA temporaneo e stato eliminato e
il link locale e stato ripristinato su `merchandisecontrol-dev`, senza apply su
dev o production.

Il client Win7POS corrente conserva un limite bootstrap fisso di 120 pagine:
la sostituzione con un budget derivato dal summary authoritative appartiene al
successivo PR client SYNC-1. Nessun deploy/apply production eseguito o
autorizzato. Stato `REVIEW`, in attesa del nuovo giro CI sull'HEAD contenente
questa evidence e del merge normale della PR.
