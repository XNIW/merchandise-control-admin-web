# Cloudflared non-production HTTPS

## Stato

- Uso previsto: HTTPS temporaneo/non-production per Admin Web locale.
- Provider: Cloudflared Quick Tunnel.
- Persistenza: effimera, non staging permanente.
- Vercel: resta parcheggiato. Non ricollegare Git Integration e non usare Production come staging.
- Guardrail repo: `vercel.json` mantiene `git.deploymentEnabled=false`.

## Prerequisiti

- Admin Web installato con `npm ci` o dipendenze gia presenti.
- `cloudflared` disponibile nel PATH.
- Env runtime solo nell'ambiente locale/non-production, mai nel repository.
- Supabase target coerente con il test previsto. Per smoke autenticati usare solo Supabase locale/non-production.

Verifica rapida:

```bash
command -v cloudflared
cloudflared --version
npm run dev:db:check
```

`npm run dev:db:check` stampa solo presenza/classificazione redatta delle env e fallisce chiuso se `.env.local` punta a un target cloud/remoto.

## Avvio locale

Per sviluppo interattivo:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Per un runtime piu vicino allo smoke:

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Tunnel HTTPS temporaneo

In un secondo terminale:

```bash
npm run dev:tunnel
```

Lo script esegue:

```bash
cloudflared tunnel --url http://127.0.0.1:3000 --no-autoupdate
```

La URL `trycloudflare.com` mostrata da Cloudflared e temporanea. Non salvarla in codice, env versionate, documenti permanenti o config di deployment.

## Env consentite

Usare solo nomi gia previsti:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`

Regole:

- `SUPABASE_SERVICE_ROLE_KEY` resta solo server-side o nel processo Node del test locale.
- Non stampare key, token, password, PIN, JWT o URL con userinfo.
- Non usare Supabase production.
- Non usare Vercel Production come staging.

## Smoke consigliati

Quando il tunnel e attivo, usare solo probe non distruttivi o harness che dichiarano esplicitamente il target non-production.

Esempio read-only:

```bash
curl -i "$CLOUDFLARED_URL/"
curl -i -X POST "$CLOUDFLARED_URL/api/pos/auth/first-login" \
  -H "content-type: application/json" \
  --data '{}'
```

Verificare:

- status controllato;
- `Cache-Control: no-store` sulle route POS sensibili;
- nessun secret nel body;
- nessun uso `vercel.app`.

## Cleanup

- Fermare Cloudflared con `Ctrl-C`.
- Fermare `next dev` o `next start`.
- Fermare eventuale stack Supabase temporaneo solo se creato per questo run.
- Verificare che non restino processi tunnel:

```bash
pgrep -fl cloudflared
```

## Limiti

- Quick Tunnel non ha uptime guarantee.
- Non sostituisce una staging stabile.
- Non sblocca automaticamente TASK-029, TASK-031 o TASK-022_023.
- Non autorizza Sales Sync, Win7POS live E2E o dashboard vendite.
