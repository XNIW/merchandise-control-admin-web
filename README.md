# MerchandiseControl Admin Web

Admin Web per MerchandiseControl, basato su Next.js App Router, TypeScript e Tailwind CSS.

Il prodotto distingue:

- `Master Console`: area globale per amministrare ecosistema, utenti, negozi, stato sistema e audit globale.
- `Admin Console`: area shop-scoped per proprietari/manager collegati tramite account personale e `shop_members`.
- `POS/Staff`: modulo shop-scoped separato dagli account personali, basato su staff/shop-code e non terza console autonoma.

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
- `SUPABASE_SERVICE_ROLE_KEY` solo per runtime server-side degli endpoint POS; mai nel client/browser.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` per Supabase Auth Google OAuth locale/deploy.
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` per Supabase Auth Google OAuth locale/deploy.

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
- Foundation backend POS per sessioni/dispositivi presente; nessun client POS reale ancora collegato.
- Nessuna integrazione Android/iOS/POS reale end-to-end.
- Nessun sales sync POS.
- Google OAuth e predisposto repo-side e verificato in locale per account personali quando il runtime fornisce client ID/secret reali tramite env locali/deploy. I valori reali non devono stare nel repository. Apple e WeChat non sono operativi.

Per modifiche Next.js leggere prima le guide pertinenti in `node_modules/next/dist/docs/`, come richiesto da `AGENTS.md`.
