# TASK-042C - Admin Web manual test runbook

## Scope

Questo runbook prepara il test manuale Admin Web prima del prossimo test POS online e Sales Sync.

Usare solo ambienti locali o non-production. Non usare produzione, dati cliente reali, URL `vercel.app` di produzione, password reali, PIN reali, token, JWT o service-role nel browser.

## URL da usare

Opzione locale browser sul Mac:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

URL Admin Web per il browser locale: `http://127.0.0.1:3000`.

Opzione HTTPS temporanea/non-production per Windows 7 o rete esterna:

```bash
npm run dev:tunnel
```

Usare la URL temporanea `trycloudflare.com` stampata da Cloudflared solo per il run corrente. Non salvarla in repository, evidence, env versionate o config permanenti.

Per Win7POS, inserire come Base URL Admin Web:

- la URL `trycloudflare.com` del run corrente, se Win7POS gira su Windows 7 e deve raggiungere il Mac;
- `http://127.0.0.1:3000` solo se Admin Web gira sulla stessa macchina Windows 7.

## Pre-flight sicurezza

1. Verificare target Supabase redatto:

   ```bash
   npm run dev:db:check
   ```

2. Fermarsi se il check indica produzione o remoto non qualificato.
3. Usare `SUPABASE_SERVICE_ROLE_KEY` solo come env di processo server-side/test locale, mai nel browser e mai in file versionati.
4. Redigere ogni credential one-time prima di condividere screenshot, log o evidence.

## Account platform_admin test

Serve un account test non-production gia presente in Supabase Auth.

Se serve abilitarlo come `platform_admin`, usare lo script esistente solo dopo aver confermato che il target e non-production:

```bash
PLATFORM_ADMIN_BOOTSTRAP_EMAIL="<email-test-non-production>" npm run supabase:bootstrap-platform-admin
```

Il primo run e dry-run con rollback. Applicare solo dopo review del target e senza stampare secret:

```bash
PLATFORM_ADMIN_BOOTSTRAP_EMAIL="<email-test-non-production>" CONFIRM_PLATFORM_ADMIN_BOOTSTRAP=yes npm run supabase:bootstrap-platform-admin
```

Non salvare email personali reali, password o token in questo file o nell'evidence.

## Platform Admin manual smoke

1. Aprire `/auth/login?next=/platform`.
2. Accedere con l'account test `platform_admin`.
3. Aprire `/platform`.
4. Verificare le sezioni:

   - `/platform/overview`
   - `/platform/users`
   - `/platform/shops`
   - `/platform/provisioning`
   - `/platform/admins`
   - `/platform/audit`
   - `/platform/system`
   - `/platform/data`
   - `/platform/devices`
   - `/platform/sync`
   - `/platform/history`
   - `/platform/operations`
   - `/platform/support`

5. Confermare che i dati visibili sono sintetici/non-production.
6. Confermare che nessun hash credential, token o service-role appare nella UI.

## Shop test

Creare o verificare uno shop sintetico con prefisso `TASK042_`.

Percorso consigliato:

1. Aprire `/platform/provisioning`.
2. Usare `Create shop with existing owner` se esiste un profilo owner test attivo.
3. Inserire:

   - shop name sintetico con prefisso `TASK042_`;
   - shop code sintetico con prefisso `TASK042_`;
   - owner profile test;
   - reason sintetica non sensibile.

In alternativa, verificare uno shop test gia esistente da `/platform/shops`.

Il valore `shop_code` si legge in:

- `/platform/shops`;
- dettaglio `/platform/shops/<shopId>`;
- `/shop/overview`;
- `/shop/settings`.

## Shop Admin manual smoke

1. Aprire `/shop`.
2. Selezionare lo shop test se lo switcher lo richiede.
3. Verificare:

   - `/shop/overview`
   - `/shop/products`
   - `/shop/categories`
   - `/shop/suppliers`
   - `/shop/import-export`
   - `/shop/sync`
   - `/shop/history`
   - `/shop/members`
   - `/shop/roles`
   - `/shop/staff`
   - `/shop/pos`
   - `/shop/devices`
   - `/shop/settings`
   - `/shop/audit`

4. In catalogo, usare solo prodotti/categorie/fornitori sintetici `TASK042_*`.
5. In import/export, usare solo file sintetici e verificare preview prima di apply.
6. In audit, verificare presenza eventi ma non copiare valori sensibili.

## Staff POS manager/cashier

Da Platform Admin:

1. Aprire `/platform/provisioning`.
2. Nel pannello `Provision POS manager web access`, selezionare lo shop test.
3. Inserire uno `staff_code` sintetico, per esempio prefisso `TASK042_`.
4. Salvare la credential one-time solo nel runtime del test e redigerla in ogni evidence.

Da Shop Admin:

1. Aprire `/shop/staff`.
2. Creare staff cashier o manager test con `staff_code` sintetico.
3. Copiare il valore one-time solo per configurare Win7POS nel run corrente.
4. Non salvare credential/PIN/password in repository, screenshot o log.

Il valore `staff_code` si legge in `/shop/staff` e nel dettaglio `/shop/staff/<staffId>`.

## Preparare Win7POS online

Sul package Windows 7 gia verificato per lo smoke locale aprire:

```text
Win7POSBridge\outbox\TASK-042B-github-release-pack-20260604-223656\app
```

Da disco locale Windows, avviare `Win7POS.Wpf.exe`.

Per il test online inserire:

- Admin Web Base URL: URL non-production del run corrente;
- `shop_code`: shop test `TASK042_*`;
- `staff_code`: staff test `TASK042_*`;
- credential/PIN/password: valore one-time runtime, non salvato.

Eseguire solo dopo aver completato il manual smoke Admin Web:

1. POS online login/first-login.
2. Heartbeat.
3. Catalog pull.
4. Vendita sintetica.
5. Verifica dashboard POS/Admin Web.
6. Sales Sync solo se endpoint/schema/dataset non-production sono pronti.

## Cleanup TASK042

Pulire o archiviare solo dati sintetici creati per il run:

- shop `TASK042_*`;
- prodotti `TASK042_*`;
- categorie `TASK042_*`;
- fornitori `TASK042_*`;
- staff `TASK042_*`;
- dispositivi/sessioni POS del run.

Annotare il cleanup in `docs/TASKS/EVIDENCE/TASK-042/README.md` o nel risultato manuale in `Win7POSBridge/inbox`.

## Stop condition

Registrare `NOT_RUN` o `BLOCKED` e fermarsi se:

- il target e produzione;
- manca un account test non-production;
- manca la credential one-time runtime;
- Win7POS non raggiunge la URL Admin Web non-production;
- un log o screenshot contiene secret non redatti;
- Admin Web manual smoke non e stato completato.
