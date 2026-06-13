# Cloudflare WAF and rate-limit runbook

## Stato

- Stato corrente: `READY_AS_RUNBOOK_ONLY`.
- Regole remote Cloudflare: `NOT_APPLIED`.
- Motivo: account, zone, dominio staging e dominio production non sono ancora
  verificati in questa task.
- Production: non configurare o modificare regole senza conferma esplicita.

## Principi

- Applicare prima in staging o in modalita log-first quando disponibile.
- Non usare Cloudflare Access su tutto `/auth/login`: bloccherebbe Shop Admin e
  staff legittimi.
- Non creare allowlist larghe per aggirare auth applicativa.
- Non salvare nei log token, JWT, PIN, password, service-role key, body di
  login o payload POS completi.
- Ogni regola deve avere rollback chiaro e owner operativo.

## Target e regole consigliate

| Area | Path | Regola consigliata | Severita iniziale | Note |
| --- | --- | --- | --- | --- |
| Login account personale | `/auth/login`, `/auth/callback` | Managed WAF + rate limit per IP e fingerprint browser | log-first poi challenge | Non bloccare callback OAuth/SSR legittime. |
| Login staff shop-code | `/shop/staff-login` | Rate limit piu stretto per IP + shop code, challenge su burst | medium | Protegge credential staff senza esporre shop code in log. |
| Master provisioning | `/platform/provisioning`, `/platform/provisioning/*` | WAF managed rules + rate limit su POST | high | Solo utenti Platform Admin gia autorizzati lato app. |
| Safe operations | `/platform/operations`, `/platform/operations/*` | Log-first su anomalie e rate limit solo su mutazioni POST | medium | Non bloccare operazioni read-only o checklist usate durante incident review. |
| Shop catalog mutations | `/shop/products`, `/shop/categories`, `/shop/suppliers` | Rate limit su POST/action requests e WAF managed rules | medium | Non usare per bloccare GET read-only autenticati. |
| Import/export | `/shop/import-export/*` | Body/upload anomaly rules, rate limit su preview/apply/export | high | Loggare solo dimensione/status, mai workbook rows. |
| Staff/device actions | `/shop/staff`, `/shop/devices`, `/shop/members` | Rate limit su mutazioni, WAF managed rules | high | Protegge reset credential, revoke device e membership. |
| POS first login | `/api/pos/auth/first-login` | Rate limit per IP + shop/staff code redatti | high | Burst o enumerazione devono essere challenge/block. |
| POS heartbeat | `/api/pos/session/heartbeat` | Soglie piu alte per device attivo, block su anomalie | medium | Evitare falsi positivi sui POS legittimi. |
| POS catalog pull | `/api/pos/catalog/pull` | Rate limit per device/session, payload JSON bound | medium | Gia protetto da auth token applicativo. |
| POS sales sync | `/api/pos/sales/sync` | Rate limit per device/session + payload anomaly | high | Loggare conteggi e status, non righe vendita. |

## Soglie iniziali suggerite

Queste soglie sono conservative e vanno validate in staging:

- `/auth/login`: 20 request/min/IP, poi managed challenge.
- `/shop/staff-login`: 10 request/min/IP, poi managed challenge.
- `/platform/provisioning/*`: 10 POST/min/IP, poi block temporaneo.
- `/platform/operations/*`: 30 POST/min/IP in log-first; non applicare challenge
  alle letture safe.
- `/shop/import-export/preview` e `/shop/import-export/apply`: 6 POST/min/IP,
  poi challenge o block temporaneo.
- `/api/pos/auth/first-login`: 12 POST/min/IP, poi challenge/block.
- `/api/pos/session/heartbeat`: 120 POST/min/IP con esclusione per staging POS
  noto, poi log-first.
- `/api/pos/catalog/pull`: 60 POST/min/IP, poi log-first.
- `/api/pos/sales/sync`: 30 POST/min/IP, poi log-first.

## Verifica read-only

Prima di applicare regole remote:

```bash
npx wrangler whoami
```

Verificare manualmente in Cloudflare dashboard:

1. Account corretto.
2. Zone staging/production corrette.
3. Worker staging `merchandise-control-admin-web-staging`.
4. Worker production `merchandise-control-admin-web`.
5. Nessuna regola production mutata durante la verifica staging.

Se account o zone non sono verificati, classificare:

- `BLOCKED_CLOUDFLARE_API_TOKEN_MISSING`
- `BLOCKED_CLOUDFLARE_ACCOUNT_ID_MISSING`
- `BLOCKED_CLOUDFLARE_ZONE_NOT_VERIFIED`
- `BLOCKED_CLOUDFLARE_STAGING_DOMAIN_UNKNOWN`

## Logging e redaction

Registrare solo:

- timestamp;
- rule id/nome;
- ambiente;
- path pattern;
- azione (`log`, `challenge`, `block`);
- status aggregato;
- conteggi.

Non registrare:

- token, JWT, cookie, session token;
- service-role o API key;
- PIN/password/credential;
- righe workbook;
- payload POS completi;
- RUT, email complete o dati reali cliente.

## False-positive handling

1. Per staging, riportare la regola da `challenge`/`block` a `log-first`.
2. Verificare i path safe operations e le letture autenticate prima di abbassare
   soglie globali.
3. Confrontare solo conteggi aggregati, status e path pattern; non esportare body
   o identificativi reali.
4. Per production, modificare una sola regola alla volta dopo approval manuale e
   registrare rule id, motivo e risultato smoke.

## Rollback regole

Per staging:

1. Mettere la regola in `log` o disabilitarla.
2. Eseguire smoke read-only:

   ```bash
   npm run smoke:staging
   ```

3. Documentare rule id, timestamp e motivo.

Per production:

1. Richiedere approval manuale.
2. Disabilitare solo la regola affetta.
3. Eseguire smoke read-only production approvato.
4. Aprire follow-up incident/report.

## Cosa non fare

- In UI Cloudflare inglese, trattare questa sezione come lista `do not`.
- Non usare production come staging.
- Non creare regole production da Codex senza conferma esplicita.
- Non bypassare auth applicativa con allowlist troppo larghe.
- Non loggare body sensibili.
- Non riattivare Vercel come workaround.
- Non aumentare body size o timeout applicativi per aggirare rate limit.
