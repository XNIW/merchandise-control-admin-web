# Win7POS workers.dev staging connection

Runbook per collegare Win7POS allo staging pubblico Admin Web su Cloudflare workers.dev.

## Target staging

- Admin Web staging base URL: `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev`
- Worker: `merchandise-control-admin-web-staging`
- Endpoint Win7POS first login: `POST /api/pos/auth/first-login`

Inserire sempre solo la base URL. Non usare:

- `/auth/login`
- `/shop`
- `/platform`
- query string o fragment

Esempio corretto:

```text
https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
```

## Configurazione Win7POS

Metodo consigliato per staging/release:

Nel ReleasePack generato da GitHub Actions e disponibile anche:

```bat
set-admin-web-staging-url.bat
```

Il helper scrive:

```text
%ProgramData%\Win7POS\pos-admin-web.config
AdminWebBaseUrl=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
```

Metodo manuale alternativo:

```powershell
setx WIN7POS_ADMIN_WEB_BASE_URL "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev" /M
```

Metodo alternativo:

```text
C:\ProgramData\Win7POS\pos-admin-web.config
AdminWebBaseUrl=https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev
```

La finestra normale di collegamento POS non chiede l'URL. L'operatore inserisce solo:

- Shop code
- Staff code
- PIN/password

Il nome device e generato automaticamente dal PC e mostrato come valore read-only. Non deve contenere username, MAC address, serial number o path locali.

## Pannello avanzato

Usare `Impostazioni avanzate / Server` solo per setup tecnico o supporto.

Regole:

- workers.dev/staging deve usare HTTPS;
- HTTP e accettato solo su loopback locale (`localhost`, `127.0.0.1`, `::1`);
- HTTP LAN non-loopback e development-only con `WIN7POS_ALLOW_INSECURE_LAN_ADMIN_WEB=1`;
- non abilitare `WIN7POS_ALLOW_INSECURE_LAN_ADMIN_WEB` nei pacchetti release o su postazioni reali.

## Smoke Admin Web staging

Comandi non-production:

```bash
npm run cf:build
npx wrangler deploy --dry-run --env staging --minify
npx wrangler deploy --env staging --keep-vars --minify
npx wrangler deployments list --env staging
npx wrangler deployments status --env staging
```

Nota: su account con limite Worker 3 MiB, `--minify` e necessario per questo
bundle OpenNext. Senza `--minify`, Cloudflare puo rifiutare la versione per
dimensione Worker prima del deploy.

Probe POS first-login:

```bash
curl -i "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/pos/auth/first-login"
```

Atteso:

```text
HTTP 405
```

```bash
curl -i -X POST "https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/api/pos/auth/first-login" -H "content-type: application/json" --data '{}'
```

Atteso:

```text
HTTP 400/401/503
Cache-Control: no-store
```

Probe valido POS first-login:

- usare solo credenziali sintetiche di staging;
- non stampare PIN, token, session token, device token o service-role key;
- aspettarsi `HTTP 200` solo con shop code/staff code/PIN validi e device key sintetica autorizzata dal flusso;
- dopo il test revocare device/sessioni sintetiche e ripristinare eventuale credential temporanea.

Retest Win7POS fisico:

1. Scaricare l'artifact GitHub Actions `Win7POS-ReleasePack-x86` dal run validato.
2. Estrarre lo zip interno `Win7POS_YYYYMMDD_HHMM.zip`.
3. Eseguire `set-admin-web-staging-url.bat` come amministratore, oppure scrivere `%ProgramData%\Win7POS\pos-admin-web.config`.
4. Avviare Win7POS.
5. Aprire `Collega POS online`.
6. Inserire solo shop code, staff code e PIN/password.
7. Verificare first-login, heartbeat e catalog pull; eseguire sales sync solo se incluso nel retest fisico.

## Guardrail sicurezza

- Non loggare PIN/password, token POS, session token o service-role key.
- Non salvare segreti in README, task, evidence, screenshot o command history.
- Non usare dati reali per smoke automatici.
- Non fare deploy production da questo runbook.
- Non applicare migration o Supabase production apply da questo runbook.

## Troubleshooting

- Se Win7POS mostra URL non configurato, verificare env/config e riaprire l'app.
- Se Win7POS rifiuta l'URL, rimuovere path come `/auth/login` o `/shop` e usare solo la base URL.
- Se il login resta negato, verificare che shop code, staff code, credenziale staff e device policy siano configurati in staging.
- Se Google OAuth non torna su workers.dev, verificare in Supabase/Google console le callback per `https://merchandise-control-admin-web-staging.merchandise-control-admin-web.workers.dev/auth/callback`.
