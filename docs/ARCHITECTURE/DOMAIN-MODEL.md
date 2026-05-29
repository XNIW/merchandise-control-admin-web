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

Account operativi futuri per POS. Sono separati dai profili personali e useranno un login dedicato al contesto negozio.

### roles

Definisce ruoli iniziali come `platform_admin`, `shop_owner`, `shop_manager`, `cashier`, `viewer`.

### permissions

Permessi granulari associati ai ruoli. Serviranno per autorizzazioni future lato server.

### devices

Dispositivi autorizzati per ogni shop, incluso futuro POS Windows.

### audit_logs

Registro azioni sensibili. Deve rimanere un modulo separato e verificabile.

## Account personale vs staff POS

- Account personale: login web futuro con provider personali o email-password.
- Staff POS: login futuro con contesto shop, `staff_code` e PIN/password.
- Le due identita non vanno fuse senza decisione architetturale esplicita.

## Vincoli futuri Supabase

- RLS obbligatoria quando Supabase diventera reale.
- Segreti solo server-side.
- Nessuna chiave privilegiata nel browser.
- Azioni sensibili tracciate in audit log.
