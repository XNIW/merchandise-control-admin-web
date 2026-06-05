# Admin Console personal account login

Runbook per aprire la Admin Console con un Admin account personale.

## Quando usare questo flusso

Usalo per shop owner o shop manager con account personale Supabase Auth, profilo in `profiles` e membership attiva in `shop_members`.

Questo e il flusso coerente con Admin Web e con Android/iOS quando l'utente umano deve poter gestire uno o piu shop. Un account personale puo essere multi-shop.

## URL

- Console selection: `http://127.0.0.1:3000/`
- Login Admin account: `http://127.0.0.1:3000/auth/login?next=/shop`
- Admin Console: `http://127.0.0.1:3000/shop`

## Percorso manuale locale

1. Avvia Supabase locale e Admin Web locale.
2. Apri `http://127.0.0.1:3000/auth/login?next=/shop`.
3. Inserisci email e password dell'Admin account sintetico locale.
4. Dopo il sign-in, verifica che la route sia `/shop`.
5. Verifica che la shell mostri `Admin Console`.
6. Se l'account ha piu membership attive, usa lo shop switcher. Lo `shop_id` resta navigazione, non autorizzazione.

## Comportamento atteso

- `shop_owner` e `shop_manager`: accesso alla Admin Console.
- `viewer`: accesso negato.
- account senza membership attiva: accesso negato.
- account `platform_admin` senza membership shop: non apre la Admin Console solo perche e master.

## Separazione da Shop code

Questo flusso usa `profiles` e `shop_members`.

Non usa shop-code/staff-code, `staff_accounts` o `staff_web_sessions`. Le sessioni staff restano separate, single-shop e non creano un profilo personale.

## Guardrail

- no production;
- no service-role in browser;
- no dati reali;
- no cleanup distruttivo su cloud;
- usare solo dati sintetici locali o staging esplicitamente autorizzato.
