# Skill locale - Admin Dashboard

## Quando usarla

Usare queste linee guida per task che riguardano layout dashboard, navigazione, shops, utenti, staff, ruoli, permessi, dispositivi e audit.

## Principi UI

- Costruire interfacce operative, non landing page.
- Privilegiare dashboard leggibile, densa ma ordinata.
- Prevedere sidebar, topbar, area contenuto e navigazione coerente.
- Usare copy non tecnico per operatori reali.
- Prevedere stati vuoti, loading, errore e disabled.
- Considerare desktop e tablet come target principali.
- Mantenere accessibilita base: landmark chiari, contrasto, focus visibile, label comprensibili.
- La UI puo ispirarsi funzionalmente a gestionali/POS di riferimento, ma non deve copiarli 1:1.
- Distinguere chiaramente `Platform Admin Console` e `Shop Admin Console`.
- Prevedere switch negozio per utenti con accesso a piu shop.

## Architettura frontend futura

- Usare route group dashboard quando verra implementata UI reale.
- Tenere componenti piccoli e con responsabilita chiara.
- Separare mock data, domain types e componenti UI.
- Non accoppiare la UI direttamente a Supabase finche schema e auth non sono pianificati.
- Non accoppiare Admin Web e POS Windows.
- `POS/Staff` deve essere progettato come modulo interno alla `Shop Admin Console`, non come terza console.

## Dominio

- `shops` e la root business.
- `shop_id`/`shop_code` guidano ownership dei dati.
- Account personale e staff POS restano separati.
- Staff POS, ruoli operativi, permessi e dispositivi sono shop-scoped.
- Il platform admin gestisce il sistema globale; il cliente/proprietario del negozio gestisce lo staff del proprio shop.
- Audit log va trattato come modulo autonomo.

## Performance e manutenzione

- Evitare stato globale non necessario.
- Evitare fetch client prematuri.
- Progettare tabelle shops/staff/audit pensando a paginazione futura.
- Evitare dipendenze premature.
- Documentare follow-up fuori scope invece di inserirli nel task corrente.
