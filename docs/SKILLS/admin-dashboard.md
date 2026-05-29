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

## Architettura frontend futura

- Usare route group dashboard quando verra implementata UI reale.
- Tenere componenti piccoli e con responsabilita chiara.
- Separare mock data, domain types e componenti UI.
- Non accoppiare la UI direttamente a Supabase finche schema e auth non sono pianificati.
- Non accoppiare Admin Web e POS Windows.

## Dominio

- `shops` e la root business.
- `shop_id`/`shop_code` guidano ownership dei dati.
- Account personale e staff POS restano separati.
- Audit log va trattato come modulo autonomo.

## Performance e manutenzione

- Evitare stato globale non necessario.
- Evitare fetch client prematuri.
- Progettare tabelle shops/staff/audit pensando a paginazione futura.
- Evitare dipendenze premature.
- Documentare follow-up fuori scope invece di inserirli nel task corrente.
