# MerchandiseControl Admin Web

Admin Web per MerchandiseControl, basato su Next.js App Router, TypeScript e Tailwind CSS.

Il prodotto distingue:

- `Platform Admin Console`: area globale per amministrare ecosistema, utenti, negozi, stato sistema e audit globale.
- `Shop Admin Console`: area per proprietari/manager del negozio.
- `POS/Staff`: modulo interno della Shop Admin Console, shop-scoped, non terza console autonoma.

Per governance e roadmap leggere `docs/MASTER-PLAN.md`.

## Prerequisiti

- Node.js 20.x.
- npm con lockfile `package-lock.json`.
- Chromium Playwright per gli smoke test UI (`npm run playwright:install` o install gestita dalla CI).
- Configurazione Supabase locale/linkata solo per check manuali Supabase; non e richiesta dalla CI base.

## Variabili ambiente

Usare `.env.example` come template. I nomi previsti sono:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_REF`

Il repository non deve contenere valori reali, secret, service-role key, token o password.

## Sviluppo locale

```bash
npm run dev
```

Aprire [http://localhost:3000](http://localhost:3000).

## Check progetto

```bash
npm run security:scan
npm run test:foundation
npm run typecheck
npm run lint
npm run build
npm run verify
npm run test:ui-smoke
```

Per smoke test compatibile con CI, dopo `npm run build`:

```bash
npm run test:ui-smoke:ci
```

## CI

La pipeline GitHub Actions in `.github/workflows/ci.yml` esegue:

- installazione dipendenze con `npm ci`;
- cache build Next.js;
- `security:scan`;
- foundation tests;
- typecheck;
- lint;
- build;
- smoke UI CI su Chromium desktop;
- `git diff --check`.

Non configura deploy automatici e non richiede secret.

## Limiti attuali

- Nessun deploy production configurato.
- Nessun email provider collegato.
- Sync Center ancora read-only.
- Nessuna autenticazione POS reale.
- Nessuna integrazione Android/iOS/POS reale.
- Nessun login Google, Apple o WeChat.

Per modifiche Next.js leggere prima le guide pertinenti in `node_modules/next/dist/docs/`, come richiesto da `AGENTS.md`.
