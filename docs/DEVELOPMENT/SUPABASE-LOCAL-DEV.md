# Supabase local/dev runbook

## Obiettivo

Rendere ripetibile il flusso locale/non-production per Admin Web senza stampare secret e senza toccare Supabase production.

Questo documento registrava il mismatch osservato in TASK-035/TASK-036 e corretto in TASK-041:

- `supabase/config.toml` usa `project_id = "MerchandiseControlSupabase"`.
- `supabase status` dal repo cerca ora `supabase_db_MerchandiseControlSupabase`.
- Lo stack Docker attivo osservato in TASK-036/TASK-041 e `MerchandiseControlSupabase`, con DB `supabase_db_MerchandiseControlSupabase`.

Non fare reset distruttivi finche non e chiaro quale stack contiene dati test da preservare.

## Script sicuri

```bash
npm run dev:db:check
npm run dev:db:status
```

Gli script:

- non stampano valori env;
- classificano `NEXT_PUBLIC_SUPABASE_URL` come `local`, `supabase_cloud`, `custom_remote`, `invalid` o `missing`;
- redigono eventuale output di `supabase status`;
- falliscono chiuso se `.env.local` punta a cloud/remoto;
- evidenziano mismatch tra `project_id` e container Docker se ricompare.

## Avvio locale consigliato

1. Verificare stato redatto:

   ```bash
   npm run dev:db:check
   ```

2. Se non ci sono container utili o il target e sbagliato, decidere prima se fermare uno stack non allineato. Non usare `supabase db reset` alla cieca.

3. Avviare Supabase locale dal repo solo quando lo stack e allineato o isolato:

   ```bash
   supabase start
   ```

4. Verificare migration locali senza stampare secret:

   ```bash
   supabase migration list --local
   ```

5. Verificare env di processo solo come presenza:

   ```bash
   node -e "for (const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_PROJECT_REF','SUPABASE_SERVICE_ROLE_KEY']) console.log(key + '=' + (process.env[key] ? 'present' : 'missing'))"
   ```

6. Avviare Admin Web:

   ```bash
   npm run dev -- --hostname 127.0.0.1 --port 3000
   ```

7. Eseguire smoke autenticato solo con target locale/non-production:

   ```bash
   npm run test:shop-admin-auth-smoke
   ```

## Applicazione migration

Preferire migration gia presenti. TASK-036 non introduce nuove migration.

Per local/dev:

```bash
supabase migration list --local
supabase db push --local
```

Se la history locale mostra versioni storiche non normalizzate, documentare il mismatch e riparare solo lo stack locale di test, mai cloud/production.

## Generazione tipi

Se serve rigenerare tipi, farlo solo contro local/dev:

```bash
supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

Non rigenerare tipi dentro TASK-036 se non e richiesto da una migration o da un cambio schema reale.

## Cleanup dataset

Gli smoke autenticati devono usare prefissi sintetici (`TASK035_*`, `TASK036_*` se introdotto in futuro) e verificare zero residui. In TASK-036 non e stato introdotto un nuovo dataset runtime.

## Stop condition

Fermarsi e documentare `BLOCKED` o `NOT_RUN` se:

- il target env e `supabase_cloud` o remoto non qualificato;
- manca `SUPABASE_SERVICE_ROLE_KEY` locale per smoke autenticati;
- `supabase status` cerca un container diverso da quello attivo;
- il comando richiesto stamperebbe key o JWT;
- serve resettare cloud/remoto.
