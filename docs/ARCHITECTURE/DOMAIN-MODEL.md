# Domain Model iniziale

## Principio base

Il dominio Admin Web usa `shops` come root aziendale/negozio. Non esiste per ora un livello separato `merchant -> stores`.

I dati business appartengono a `shop_id`/`shop_code`, non direttamente all'account personale.

## Entita principali

### profiles

Account personali usati per accedere alla dashboard web. Un profilo puo essere collegato a piu shop tramite membership.

### shops

Root business del sistema. Ogni shop rappresenta un negozio o azienda operativa e possiede `shop_id`, `shop_code`, configurazioni, ruoli, staff e dispositivi.

### shop_members

Associa profili personali a shop e ruoli. Permette piu soci o manager sullo stesso shop e piu shop per lo stesso profilo.

### staff_accounts

Account operativi futuri per POS. Sono separati dai profili personali, appartengono a uno specifico shop e useranno un login dedicato al contesto negozio.

La gestione ordinaria di staff, PIN/password, abilitazioni e sospensioni e responsabilita di `shop_owner` / `shop_manager` dentro la `Shop Admin Console`, non del `platform_admin`.

### roles

Definisce ruoli iniziali come `platform_admin`, `shop_owner`, `shop_manager`, `cashier`, `viewer`.

I ruoli possono avere significato globale o shop-scoped. I ruoli operativi del negozio, inclusi cashier/staff POS, appartengono allo shop.

### permissions

Permessi granulari associati ai ruoli. Serviranno per autorizzazioni future lato server.

I permessi globali e quelli shop-scoped devono restare distinguibili. Le autorizzazioni shop-scoped devono essere valutate rispetto a `shop_id`.

### devices

Dispositivi autorizzati per ogni shop, incluso futuro POS Windows. I dispositivi appartengono allo shop e non sono gestiti come risorsa globale ordinaria.

### audit_logs

Registro azioni sensibili. Deve rimanere un modulo separato e verificabile.

## Account personale vs staff POS

- Account personale: login web futuro con provider personali o email-password.
- Staff POS: login futuro con contesto shop, `staff_code` e PIN/password.
- Le due identita non vanno fuse senza decisione architetturale esplicita.

## Platform Admin vs Shop Admin

- `Platform Admin Console`: gestione globale ecosistema, stato sistema, audit globale, utenti e negozi.
- `Shop Admin Console`: gestione dello shop, inclusi staff POS, ruoli operativi, permessi, dispositivi, prodotti, fornitori, categorie e import/export.
- `POS/Staff`: modulo interno della `Shop Admin Console`, non console autonoma.

Eventuali interventi globali o di emergenza su dati shop devono essere autorizzati server-side, limitati allo scopo e tracciati in `audit_logs`.

## Vincoli futuri Supabase

- RLS obbligatoria quando Supabase diventera reale.
- Segreti solo server-side.
- Nessuna chiave privilegiata nel browser.
- Azioni sensibili tracciate in audit log.
