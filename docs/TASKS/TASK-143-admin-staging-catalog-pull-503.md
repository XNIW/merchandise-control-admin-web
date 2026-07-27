# TASK-143 - Admin staging catalog pull 503

## Informazioni generali

- ID: `TASK-143`
- Stato: `REVIEW`
- Fase attuale: `REVIEW_READY`
- Responsabile attuale: `CLAUDE/CHATGPT / REVIEWER`
- Data apertura: `2026-07-27`
- Branch implementazione: `codex/admin-staging-catalog-pull-503-20260727`
- Branch closeout: `codex/admin-staging-catalog-pull-503-closeout-20260727`
- Implementation PR: `#45`
- Admin merge SHA: `75113502a824461dce8487c93383fde3122774c1`
- Baseline Admin: `96e9dc52e4c558099762d70e93357b33ec17c20c`
- Evidence: `docs/TASKS/EVIDENCE/TASK-143/README.md`
- Incident report:
  `docs/HANDOFFS/2026-07-27_ADMIN_STAGING_CATALOG_PULL_503.md`
- Handoff Win7POS SHA: `9fe3fa718b16289438f0a19ea77733396eb8866d`

## Autorizzazione

L'utente autorizza diagnosi e fix server/edge Admin, test, commit, PR, review,
merge normale, eventuale migration additiva realmente necessaria, apply
esclusivamente staging e un solo deploy Worker staging.

Restano vietati:

- modifiche o avvio di Win7POS;
- modifiche Android/iOS;
- apply o deploy production;
- aumento dei timeout per mascherare la causa;
- secret, payload catalogo o identificativi completi in log/evidence;
- una nuova acceptance fisica Asus in questa esecuzione.

## Incidente congelato

- Timestamp UTC: `2026-07-27T19:31:27.9819345Z`.
- Finestra primaria: timestamp `±5 minuti`.
- Route/stage: catalog pull / `catalog_pull`.
- HTTP: `503`.
- Request reached server: `true`.
- Catalog pages received: `0`.
- Client request hash: `sha256:081732bebab8`.
- Edge correlation hash: `sha256:c24e0c989466`.
- Server request ID: assente.
- Audit nella finestra Win7POS: first login e device trust `success`; nessun
  catalog success/failure.

## Obiettivo

1. Correlare il singolo 503 con Worker/edge/Supabase staging.
2. Identificare il layer e la causa esatta.
3. Applicare il fix minimo solo server/edge staging.
4. Verificare first page, drain completo, manifest e audit bounded.
5. Integrare via PR e merge normale, distribuire una volta sola su staging.
6. Consegnare la task a `REVIEW_READY`, mai `DONE`, per una successiva singola
   acceptance Asus autorizzata separatamente.

## Criteri di accettazione

1. Layer e root cause verificati tramite evidence runtime, non dedotti.
2. Nessun 503 anonimo: ogni failure server espone stage/root code e un support
   ID bounded, senza segreti o payload.
3. Audit failure bounded emesso anche quando il catalogo non produce pagine.
4. First page e paginazione completa sono snapshot-safe e non saltano record.
5. Manifest completo uguale alle righe drenate; catalogo vuoto non è successo.
6. Regressioni TASK-139, TASK-141 e TASK-142 verdi.
7. `verify`, `cf:build`, test Worker e gate DB applicabili realmente eseguiti.
8. Review indipendente con P0/P1/P2 aperti uguali a zero.
9. CI verde, merge normale e main riconciliato.
10. Apply/deploy limitati allo staging; production e client non modificati.

## Gate previsti

- `git diff --check`
- test mirati TASK-143
- regressioni TASK-139/TASK-141/TASK-142
- `npm run verify`
- `npm run cf:build`
- Supabase reset/pgTAP soltanto se DB coinvolto
- Worker locale smoke
- security scan previsto dal repository
- server-side staging first page e full drain
- request trace bounded e audit success/failure

La request trace non è un terzo write DB: è composta dal support ID
`X-Request-Id`/response body e dalla corrispondente invocazione Worker. Il
success audit resta atomico nella publication fence; il failure audit viene
atteso prima della risposta. Evitare un audit `request` separato preserva il
contratto one-publication, non aggiunge una write prima della validazione e non
introduce un ulteriore subrequest su ogni pagina.

## Stato corrente

Baseline, ultimi dieci commit Admin e PR Win7POS #49 verificati. Il checkout
Win7POS locale dirty è stato preservato e l'handoff è stato letto direttamente
da `origin/main`.

La correlazione Cloudflare GraphQL ha confermato il failure layer:

- stessa invocazione del completamento client, `2026-07-27T19:31:27Z`;
- Worker version `c5ae7e81-ded9-43ec-996a-199f7cfa540b`;
- status `exceededResources`, `errors=1`, `subrequests=0`;
- CPU `10.000µs`, body `0`, memoria circa `31MB`;
- binding staging richiesti presenti nella versione attiva.

La versione Worker precedente, prima di TASK-142, aveva drenato lo snapshot
reale senza `exceededResources`; il deploy TASK-142 ha aggiunto alla route
catalog pull l'import della policy completa di normalizzazione/scrittura.
Quell'import porta parsing e inizializzazione non necessari nel cold path
prima del primo I/O. Il fix locale usa un validatore read-only compatto,
equivalente alla golden policy TASK-142, e aggiunge failure/audit bounded.
Diagnosi chiusa; test focalizzati, regressioni TASK-139/141/142, paging,
security scan, `verify`, build OpenNext e Worker smoke locale sono verdi.
La review indipendente sul feature SHA iniziale ha trovato due P1, due P2 e un
P3: empty manifest, harness full-drain insufficiente, boundary RPC/POST non
esercitati, semantica request trace non esplicita e stato gate non aggiornato.
Le correzioni sono state approvate dal follow-up indipendente:
`P0=0/P1=0/P2=0`; l'unico P3 documentale è stato corretto prima della PR.

La PR `#45` è stata unita normalmente sullo SHA
`75113502a824461dce8487c93383fde3122774c1` dopo CI e Cloudflare verdi. La
main locale è stata avanzata fast-forward e coincide con `origin/main`.
Migration staging `94/94`; nessuna migration TASK-143. È stato eseguito un
solo deploy staging: deployment `bbdc35a8-14b8-4201-8144-c4c6d060bc7c`,
Worker version `66eeda7f-003b-4b61-9fbd-b4222896c048`, timestamp
`2026-07-27T22:14:27.319282Z`.

L'acceptance server-side, senza Asus, ha usato una sessione dedicata sullo
scope reale correlato all'incidente e poi l'ha revocata. Risultato:

- first page `HTTP 200 / success`, `4.879,2ms`;
- drain completo `676/676` pagine, `205.616,7ms`;
- manifest e righe esatti: categorie `71`, fornitori `102`, prodotti
  `19.763`, prezzi `41.228`;
- validatore catalog text `PASS`;
- support ID univoci `676`;
- audit catalog success `676`, failure `0`;
- dati catalogo generati o modificati: `NO`;
- Cloudflare post-deploy fino a `2026-07-27T22:24:00.121Z`: `823` richieste,
  tutte `success`, errori `0`, `exceededResources=0`, exception `0`.

La task è consegnata a `REVIEW_READY`, mai `DONE`. Resta soltanto una singola
acceptance fisica Asus, da autorizzare ed eseguire separatamente.
