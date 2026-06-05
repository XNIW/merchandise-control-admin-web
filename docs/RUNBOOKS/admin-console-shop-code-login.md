# Admin Console Shop code login

Runbook per aprire la Admin Console con Shop code e Staff code.

## Quando usare questo flusso

Usalo per staff manager shop-scoped con credenziale staff dedicata. Il principal runtime e `pos_staff_manager`:

- `staff_accounts` identifica lo staff account;
- `staff_web_sessions` conserva la sessione web staff;
- `staff_role_permissions` abilita `shop_admin.full_access` o permessi equivalenti;
- nessun record `profiles` viene creato.

Questo flusso e single-shop. E permission-equivalent a un Admin account sullo stesso shop solo quando il permission tree concede le stesse operazioni consentite.

## URL

- Console selection: `http://127.0.0.1:3000/`
- Shop code sign in: `http://127.0.0.1:3000/shop/staff-login`
- Admin Console: `http://127.0.0.1:3000/shop`

## Percorso manuale locale

1. Avvia Supabase locale e Admin Web locale.
2. Prepara uno shop sintetico e uno staff manager con permesso web tramite tooling locale o pannello Master Console non-production.
3. Apri `http://127.0.0.1:3000/shop/staff-login`.
4. Inserisci `Shop code`, `Staff code` e credenziale assegnata.
5. Dopo il sign-in, verifica che la route sia `/shop`.
6. Verifica che lo shop switcher non consenta altri shop: la sessione e single-shop.

## Comportamento atteso

- staff manager attivo, credenziale attiva, non locked, con `shop_admin.full_access`: accesso alla Admin Console.
- cashier/viewer o staff senza permesso web: accesso negato.
- credenziale bloccata, scaduta o in rotazione obbligatoria: accesso negato.
- richiesta di altro `shop_id`: accesso negato.

## Separazione da Admin account

Questo flusso usa shop-code/staff-code, `staff_accounts` e `staff_web_sessions`.

Non usa Supabase Auth personale, `profiles` o `shop_members`. Android/iOS usano personal account. Win7POS usa shop-code/staff-code e non personal account.

## Guardrail

- no production;
- no service-role in browser;
- no secret o credential hash in UI, log, audit metadata o URL;
- no dati reali;
- no cleanup distruttivo su cloud;
- audit append-only non va cancellato.
