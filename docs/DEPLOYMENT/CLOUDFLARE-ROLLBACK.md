# Cloudflare rollback runbook

## Stato

- Stato corrente: `READY_AS_RUNBOOK_ONLY`.
- Nessun deploy Cloudflare remoto e stato eseguito in questa sessione.
- Nessun rollback reale e stato eseguito.

## Prima di intervenire

1. Confermare ambiente: `staging` o `production`.
2. Confermare worker:
   - staging: `merchandise-control-admin-web-staging`;
   - production: `merchandise-control-admin-web`.
3. Salvare timestamp, versione/deployment corrente e sintomo osservato.
4. Non stampare secret o env.

## Diagnosi rapida

```bash
npx wrangler deployments list --env staging
npx wrangler deployments list --env production
npx wrangler tail --env staging
npx wrangler tail --env production
```

Usare solo l'ambiente coinvolto. Per produzione, ottenere conferma esplicita prima di azioni mutative.

## Rollback Worker

Percorso dashboard:

1. Cloudflare dashboard.
2. Workers & Pages.
3. Worker target.
4. Deployments.
5. Selezionare una versione precedente nota buona.
6. Rollback.
7. Eseguire smoke read-only.

Percorso CLI, se disponibile nel piano/account:

```bash
npx wrangler rollback --env staging
```

Per production usare CLI solo dopo conferma esplicita:

```bash
npx wrangler rollback --env production
```

## Rollback DNS/custom domain

Se il problema e nel cutover DNS/custom domain:

1. Disabilitare temporaneamente la route/custom domain affetta o ripristinare record precedente.
2. Verificare HTTPS e risoluzione DNS.
3. Eseguire smoke read-only.
4. Documentare TTL, record modificati e timestamp.

Non riattivare Vercel automaticamente. Vercel resta parcheggiato salvo decisione esplicita.

## Rollback env/secrets

Se il problema e una env errata:

1. Correggere il secret su Cloudflare dashboard o con `wrangler secret put`.
2. Verificare che il valore non venga stampato.
3. Ridistribuire o attivare la nuova versione secondo il flusso Cloudflare.
4. Eseguire smoke read-only.

Se un secret e stato esposto, ruotarlo prima di riabilitare traffico.

## Smoke post-rollback

```bash
curl -i "https://<host>/"
curl -i "https://<host>/auth/login?next=/shop"
curl -i "https://<host>/auth/login?next=/platform"
curl -i "https://<host>/shop"
curl -i "https://<host>/platform"
curl -i "https://<host>/api/pos/sales/sync"
```

Verificare:

- status controllato;
- nessun `500`;
- no stack trace;
- no secret leakage;
- auth guard coerente;
- endpoint POS/API con metodo/status atteso.

## Evidence

Registrare:

- ambiente;
- worker;
- versione prima/dopo;
- comando o azione dashboard;
- smoke result;
- follow-up.

Non registrare valori env, token, key, password, PIN o dati reali.
