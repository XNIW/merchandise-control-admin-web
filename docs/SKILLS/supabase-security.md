# Skill locale - Supabase Security

## Quando usarla

Usare queste linee guida quando un task futuro pianifica o implementa Supabase, auth, policy, ruoli, permessi, storage, edge/server code o audit log.

## Regole obbligatorie future

- RLS obbligatoria per tabelle con dati business o dati utente.
- Segreti solo server-side.
- Nessuna chiave privilegiata nel client/browser.
- Platform admin verificato lato server.
- Operazioni globali del platform admin solo server-side.
- Audit log per azioni sensibili.
- Audit log obbligatorio per azioni globali e interventi sui dati shop.
- Dati test sintetici e privacy-safe.
- Nessun token o credenziale nel repository.

## Separazione responsabilita

- Client: UI e chiamate consentite con sessione utente.
- Server: policy sensibili, privilegi amministrativi, validazioni finali.
- Database: RLS, vincoli, ownership su `shop_id`.
- Shop-scoped: staff POS, ruoli operativi, permessi e dispositivi devono essere autorizzati rispetto allo shop corrente.
- Global-scoped: azioni platform devono essere limitate, server-side e tracciate.

## Planning prima del codice

Prima di implementare Supabase reale serve un task dedicato per:

- schema planning;
- ruoli e permessi;
- policy RLS;
- migration strategy;
- dati seed sintetici;
- rollback;
- evidence di sicurezza.
