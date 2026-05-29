<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regole agenti - MerchandiseControl Admin Web

## Lingua e progetto

- Lingua di lavoro: italiano.
- Progetto: Admin Web per MerchandiseControl.
- Stack previsto: Next.js App Router, TypeScript, Tailwind CSS, futura integrazione Supabase SSR.
- Prima di scrivere codice Next.js o cambiare convenzioni framework, leggere la guida pertinente in `node_modules/next/dist/docs/`.

## Ruoli

- Codex e executor/fixer quando esiste un task attivo in fase `EXECUTION` o `FIX`.
- Claude/ChatGPT e planner/reviewer quando il progetto e in `IDLE`, `PLANNING`, `REVIEW` o quando serve validare un handoff.
- Un task passa a `DONE` solo dopo conferma esplicita dell'utente.
- Codex non marca mai un task come `DONE`: prepara handoff verso `REVIEW`.

## Protocollo operativo

Prima di ogni modifica Codex deve leggere:

1. `docs/MASTER-PLAN.md`
2. il file task attivo indicato nel Master Plan
3. il codice o la documentazione rilevante per lo scope

Regole obbligatorie:

- Un solo task attivo per volta.
- No scope creep.
- No refactor non richiesti.
- No dipendenze nuove senza motivo esplicito nel task.
- No secret nel repository.
- No service role o chiavi segrete nel client/browser.
- No dati reali, token, credenziali o password hardcoded.
- Ogni task deve avere check reali o motivazioni `NOT_RUN`/`BLOCKED`.
- Nessun `PASS` inventato: i risultati vanno copiati o sintetizzati da comandi eseguiti davvero.
- Ogni handoff deve includere file toccati, criteri di accettazione, evidence, rischi residui e prossima fase.
