# TASK-047 - Align Master Console and Admin Console access model

## Stato

- Stato: `REVIEW`
- Fase: `REVIEW`
- Responsabile corrente: `REVIEWER`
- Evidence: `docs/TASKS/EVIDENCE/TASK-047/README.md`
- Scope: naming/copy/routing guard/test/docs.

## Obiettivo

Allineare il modello di accesso Admin Web alla decisione prodotto:

- `Master Console`: nome breve della console globale, route tecnica `/platform`.
- `Admin Console`: nome breve della console shop-scoped, route tecnica `/shop`.
- L'entrypoint `/` non deve dire genericamente "Admin Web" come destinazione unica: deve guidare verso Master Console, Admin Console con Admin account, oppure Admin Console con Shop code.

## Decisione prodotto

La Master Console resta riservata al ruolo tecnico `platform_admin`.

La Admin Console supporta due principal separati:

1. `personal_account`: Supabase Auth personale, `profiles` e `shop_members`; puo essere multi-shop.
2. `pos_staff_manager`: sessione web staff basata su shop-code/staff-code, `staff_accounts` e `staff_web_sessions`; e sempre single-shop.

Gli account personali e gli staff account non vengono fusi. Quando il ruolo/permission tree e permission-equivalent per lo stesso shop, l'accesso operativo alla Admin Console deve risultare equivalente sullo scope consentito. Le differenze restano identita, sessione, audit actor e capacita multi-shop.

## Matrice attesa

| Client / route | Principale | Console | Scope | Note |
| --- | --- | --- | --- | --- |
| `/platform` | `platform_admin` via personal account | Master Console | globale | Solo owner/ecosistema; nessun shop-code/staff-code. |
| `/shop` | `personal_account` via `shop_members` | Admin Console | multi-shop consentito | Usato da Admin Web e app Android/iOS con account personale. |
| `/shop/staff-login` -> `/shop` | `pos_staff_manager` via `staff_accounts` + `staff_web_sessions` | Admin Console | single-shop | Usato per Shop code e Staff code; non crea `profiles`. |
| Win7POS | shop-code/staff-code | POS runtime, non console web | single-shop/device | Win7POS non usa personal account. |
| Android/iOS | personal account | app mobile | multi-shop consentito | Non usa shop-code/staff-code per l'account umano. |

## Regole

- Non rinominare route tecniche senza task dedicato.
- Non dedurre il tipo di accesso da `.env.local`.
- Non usare production.
- Nessun service-role o secret in browser.
- Nessun dato reale, password o token nel repository.
- Shop POS-first: uno shop puo nascere da provisioning master o da flussi futuri POS-first shop, ma l'accesso Admin Console deve restare esplicito per principal.
- Cleanup staging/cloud fuori scope; questo task modifica copy, test statici e docs.

## Implementazione prevista

- Root `/`: console selection esplicita.
- `/auth/login`: Admin account sign in per Master Console o Admin Console personale.
- `/shop/staff-login`: Shop code sign in per Admin Console single-shop.
- Guard `/platform`: messaggio Master Console.
- Guard `/shop`: messaggio Admin Console.
- Shell Platform: etichetta Master Console.
- Shell Shop: etichetta Admin Console.
- Docs/runbook: decisione prodotto, comportamento auth atteso e rischi residui.
- Miglioria review Master Console: liste Users e Shops con riga
  selezionabile, pannello dettaglio contestuale, identificatori sicuri,
  riepilogo shop/membership/proprietari, e origine account esplicitamente
  `Not captured` finche il provider auth non entra in un DTO server-side sicuro.
  Il pannello dettaglio deve restare leggibile durante lo scroll, il link
  full-detail deve avere ritorno contestuale alla lista, e il ritorno deve
  preservare la riga selezionata.
- Fix review runtime locale: `platform:local:dev` deve evitare il blocco
  `EADDRINUSE` quando `3000` e gia occupata, usando una porta locale alternativa
  e stampando l'URL da aprire.
- Follow-up UX polish Users/Shops: le liste `/platform/users` e
  `/platform/shops` devono leggere come console operative, con search/filtri
  locali sui dati gia ritornati dal read model, badge stato colorati,
  inspector laterale a sezioni, pagine full detail sezionate e diagnostica
  normale ridotta a sezione `Diagnostics`. `Open full detail` deve aprire la
  pagina dettaglio in cima, mentre `Back to Users/Shops` continua a tornare alla
  lista con `?selected=<id>` e riga selezionata visibile.
- Final micro-polish Master Console: sidebar sinistra sticky su desktop,
  inspector con header/action raggiungibili durante lo scroll interno, copy meno
  tecnico per dati correlati non visibili, shop code copy realmente cliccabile
  con feedback leggero, e riga selezionata distinguibile anche con bordo/ARIA.

## Criteri di accettazione

- La UI non mostra piu `Return to Admin Web` o `Opening Admin Web`.
- L'entrypoint `/` espone link separati a `/auth/login?next=/platform`, `/auth/login?next=/shop` e `/shop/staff-login`.
- La Master Console resta protetta da `platform_admin`.
- La Admin Console continua a provare account personale e sessione staff web.
- I runbook descrivono accesso Master, Admin account e Shop code.
- I check statici passano senza Supabase locale o cloud.
- Il runbook Master Console locale chiarisce che `.env.local` cloud non decide
  il target locale e che va aperto l'URL stampato dal launcher locale.
- Users e Shops in Master Console permettono di selezionare una riga e leggere
  il dettaglio accanto senza esporre secret auth o usare service-role nel client.
- Il dettaglio completo di User/Shop mostra un link di ritorno alla lista e il
  ritorno ripristina la selezione precedente tramite query `selected`.
- Le tabelle Users/Shops distinguono stato, accesso, owner/membership,
  device/sync/audit e dati non catturati senza inventare provider, owner,
  membership, device o audit.
- I badge stato sono distinguibili a colpo d'occhio e non usano il solo testo:
  active/disabled/pending/suspended/archived hanno trattamento visivo distinto.
- Su desktop/tablet largo il menu Master Console resta visibile durante lo
  scroll della lista, l'inspector mantiene `Open full detail` facile da
  raggiungere, e il bottone `Copy` dello shop code ha label accessibile e copia
  il codice senza nuove dipendenze.
