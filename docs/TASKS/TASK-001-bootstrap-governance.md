# TASK-001 - Bootstrap governance Admin Web

## Informazioni generali

- ID: `TASK-001`
- Titolo: Bootstrap governance Admin Web
- Stato: `DONE`
- Fase attuale: `DONE`
- Responsabile attuale: `USER / REVIEW APPROVED`
- File Master Plan: `docs/MASTER-PLAN.md`

## Scopo

Impostare la struttura di governance/documentazione del progetto Admin Web e risolvere il blocco `BLOCKED_PLANNING_MISMATCH` emerso dall'audit repo-grounded.

## Contesto

Il repository partiva da un progetto Next.js minimale con documenti governance vuoti o non canonici. Questo task crea una base professionale di Master Plan, task template, protocollo execution, dominio, ADR, skills ed evidence per i task futuri.

## Non incluso

- Login reale.
- Supabase reale.
- Schema DB reale.
- Dashboard UI reale.
- POS Windows.
- Integrazione Android/iOS.
- Playwright.
- CI.
- Nuove dipendenze.
- Migration.
- Cleanup non richiesto.
- Commit.

## File coinvolti

- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `docs/MASTER-PLAN.md`
- `docs/TASKS/TASK-TEMPLATE.md`
- `docs/TASKS/TASK-001-bootstrap-governance.md`
- `docs/CODEX-EXECUTION-PROTOCOL.md`
- `docs/ARCHITECTURE/DOMAIN-MODEL.md`
- `docs/DECISIONS/ADR-001-shop-root-model.md`
- `docs/SKILLS/admin-dashboard.md`
- `docs/SKILLS/supabase-security.md`
- `docs/TASKS/EVIDENCE/TASK-001/README.md`

## Criteri di accettazione

| CA | Descrizione | Tipo verifica | Stato |
|---|---|---|---|
| CA-01 | `docs/MASTER-PLAN.md` esiste ed e coerente con TASK-001 attivo. | STATIC | `PASS` |
| CA-02 | `AGENTS.md` preserva il warning Next.js e contiene regole Admin Web. | STATIC | `PASS` |
| CA-03 | `CLAUDE.md` definisce protocollo planning/review. | STATIC | `PASS` |
| CA-04 | `docs/TASKS/TASK-TEMPLATE.md` esiste con sezioni complete. | STATIC | `PASS` |
| CA-05 | `docs/TASKS/TASK-001-bootstrap-governance.md` esiste ed e compilato. | STATIC | `PASS` |
| CA-06 | `docs/CODEX-EXECUTION-PROTOCOL.md` esiste. | STATIC | `PASS` |
| CA-07 | `docs/ARCHITECTURE`, `docs/DECISIONS`, `docs/SKILLS` esistono con documenti iniziali. | STATIC | `PASS` |
| CA-08 | `package.json` contiene `typecheck` se mancava. | STATIC | `PASS` |
| CA-09 | `npm run lint` eseguito e registrato. | STATIC | `PASS` |
| CA-10 | `npm run typecheck` eseguito e registrato. | STATIC | `PASS` |
| CA-11 | `npm run build` eseguito e registrato. | BUILD | `PASS_WITH_NOTES` |
| CA-12 | `git status --short` controllato. | STATIC | `PASS_WITH_NOTES` |
| CA-13 | Secret scan richiesto dal task eseguito e registrato. | STATIC | `PASS` |
| CA-14 | Nessun handoff dichiara `DONE`; prossima fase e `REVIEW`. | MANUAL | `PASS` |

## Matrice CA -> evidence

| CA | Tipo verifica | Comando/Metodo previsto | Esito ammesso | Evidence prevista |
|---|---|---|---|---|
| CA-01 | STATIC | Lettura Master Plan | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-02 | STATIC | Lettura `AGENTS.md` | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-03 | STATIC | Lettura `CLAUDE.md` | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-04 | STATIC | Lettura template task | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-05 | STATIC | Lettura TASK-001 | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-06 | STATIC | Lettura protocollo Codex | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-07 | STATIC | `find docs -maxdepth 4 -type f | sort` | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-08 | STATIC | `cat package.json` | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-09 | STATIC | `npm run lint` | `PASS` / `FAIL` / `BLOCKED` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-10 | STATIC | `npm run typecheck` | `PASS` / `FAIL` / `BLOCKED` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-11 | BUILD | `npm run build` | `PASS` / `FAIL` / `BLOCKED` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-12 | STATIC | `git status --short` | `PASS_WITH_NOTES` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-13 | STATIC | Secret scan repository richiesto dal task | `PASS` / `PASS_WITH_NOTES` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |
| CA-14 | MANUAL | Lettura handoff | `PASS` / `FAIL` | `docs/TASKS/EVIDENCE/TASK-001/README.md` |

## Matrice test/check

| Test | Tipo | Quando eseguirlo | PASS | FAIL | BLOCKED | NOT_RUN |
|---|---|---|---|---|---|---|
| `npm run lint` | STATIC | Dopo modifiche documentali/config | Exit code 0 | Errori ESLint | Tool non disponibile | Vietato o non pertinente, con motivo |
| `npm run typecheck` | STATIC | Dopo aggiunta script | Exit code 0 | Errori TypeScript | Tool non disponibile | Vietato o non pertinente, con motivo |
| `npm run build` | BUILD | Dopo lint/typecheck | Exit code 0 | Errore build | Tool non disponibile | Vietato o non pertinente, con motivo |
| `npm run verify` | STATIC/BUILD | Review/fix o pre-commit locale | Exit code 0 | Errore in lint/typecheck/build | Tool non disponibile | Vietato o non pertinente, con motivo |
| `git status --short` | STATIC | Prima e dopo modifiche | Mostra solo modifiche attese | Mostra modifiche non correlate | Git non disponibile | Vietato o non pertinente, con motivo |
| Secret scan richiesto | STATIC | Dopo modifiche | Nessun match reale di credenziali | Match sospetto reale | Tool non disponibile | Vietato o non pertinente, con motivo |

## Safety gates

- Nessun secret nel repository.
- Nessuna chiave Supabase segreta nel client/browser.
- Nessun service role nel client/browser.
- Nessun token, credenziale, email reale o dato personale non redatto.
- Nessuna password hardcoded.
- Nessuna dipendenza nuova.
- Nessun task futuro attivato automaticamente.
- Nessun `PASS` senza comando o metodo realmente eseguito.
- `BLOCKED` richiede causa, tentativo e cosa serve per sbloccare.
- `NOT_RUN` richiede motivo.

## Criteri stato check

- `PASS`: verifica eseguita, esito positivo, output sintetico registrato.
- `FAIL`: verifica eseguita, errore reale o criterio non soddisfatto.
- `BLOCKED`: verifica non completabile per causa esterna o mancanza tool.
- `NOT_RUN`: verifica non eseguita con motivo esplicito.
- `PASS_WITH_NOTES`: verifica positiva ma con note, per esempio git status con modifiche attese.

## Planning

- Obiettivo compreso: risolvere il mismatch governance creando struttura documentale canonica.
- Piano minimo: leggere stato iniziale, normalizzare path, compilare documenti, aggiungere `typecheck`, eseguire check richiesti, aggiornare evidence e handoff.
- Follow-up candidati separati: script secret scan dedicato, report evidence automatico, Playwright/CI solo in task futuri.

## Execution

### Obiettivo compreso

Completare un bootstrap documentale limitato per risolvere `BLOCKED_PLANNING_MISMATCH`, senza implementare login, Supabase, DB schema, dashboard UI, POS, integrazioni mobile, Playwright, CI, nuove dipendenze, migration, cleanup o commit.

### File controllati

- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `docs/MASTER_PLAN.md`
- `docs/MASTER-PLAN.md`
- `docs/tasks/TASK_TEMPLATE.md`
- `docs/TASKS/TASK-TEMPLATE.md`
- `docs/skills/PROJECT_SKILLS.md`
- `docs/SKILLS/admin-dashboard.md`
- documentazione Next.js locale per TypeScript, ESLint e CLI in `node_modules/next/dist/docs/`

### Piano minimo eseguito

1. Inventario iniziale repo/docs/package/agenti.
2. Normalizzazione path canonici con `git mv` per file tracciati.
3. Compilazione documenti governance, architettura, ADR, skills, protocollo ed evidence.
4. Aggiunta script `typecheck` in `package.json`.
5. Esecuzione check richiesti.
6. Aggiornamento evidence e handoff verso `REVIEW`.

### Modifiche fatte

- Preservato il warning Next.js in `AGENTS.md` e aggiunte regole Admin Web.
- Compilato `CLAUDE.md` con protocollo planning/review.
- Normalizzati i file legacy vuoti verso path canonici.
- Creati Master Plan, task template, TASK-001, protocollo Codex, domain model, ADR shop-root, skills locali ed evidence README.
- Aggiunto `"typecheck": "tsc --noEmit"` senza cambiare dipendenze.

### Check eseguiti

| Check | Esito | Output sintetico |
|---|---|---|
| `npm run lint` | `PASS` | Exit code 0; comando `eslint` completato senza errori. |
| `npm run typecheck` | `PASS` | Exit code 0; comando `tsc --noEmit` completato senza errori. |
| `npm run build` | `PASS_WITH_NOTES` | Exit code 0; Next.js 16.2.6 ha compilato e generato `/` e `/_not-found`; presente warning Node `DEP0205` non bloccante. |
| `git status --short` | `PASS_WITH_NOTES` | Mostra modifiche documentali/config attese e rinomini governance. |
| Secret scan richiesto | `PASS` | Exit code 0; nessun output prodotto. |

### Rischi rimasti

- Non esiste ancora uno script secret scan dedicato; va pianificato come task separato se serve renderlo ripetibile senza copiare comandi shell.
- Non esiste CI; va pianificata come task separato.
- Playwright non e configurato e non va considerato disponibile finche un task dedicato non lo introduce.
- L'app resta template Next.js: dashboard UI reale fuori scope per TASK-001.
- `next-env.d.ts` e tracciato nel repo anche se `.gitignore` lo ignora; non e stato fatto cleanup per vincolo di scope.

### Handoff verso REVIEW

- Prossima fase: `REVIEW`
- Prossimo agente: `CLAUDE / ChatGPT`
- Azione consigliata: verificare governance, naming, evidence, check, no secret, no scope creep.
- Nota: Codex non marca il task come `DONE`.

## Review

- Fase review: `REVIEW`.
- Responsabile review: `CLAUDE / ChatGPT`.
- Verdict tecnico: `PASS_WITH_NOTES`.
- Decisione review: `APPROVED` per conferma utente, non `DONE`.
- Correzioni review/fix applicate:
  - allineato tracking Master Plan e task da `EXECUTION` a `REVIEW`;
  - aggiunto harness `npm run verify` senza nuove dipendenze;
  - aggiornata evidence review con check rieseguiti.
- Check review/fix rieseguiti:
  - `npm run lint`: `PASS`;
  - `npm run typecheck`: `PASS`;
  - `npm run build`: `PASS_WITH_NOTES`;
  - `npm run verify`: `PASS_WITH_NOTES`;
  - `git diff --check`: `PASS`;
  - secret scan richiesto: `PASS`;
  - `git status --short --untracked-files=all`: `PASS_WITH_NOTES`.
- Note:
  - build valida con warning Node `DEP0205` non bloccante;
  - UI, Supabase runtime e repo mobile restano fuori scope o non disponibili;
  - i riferimenti ai path legacy (`docs/MASTER_PLAN.md`, `docs/tasks`, `docs/skills`) restano solo come inventario storico dei file normalizzati;
  - `DONE` richiede conferma esplicita dell'utente.

### Review/Fix prodotto Platform/Shop

- Chiarimento aggiunto: il prodotto distingue `Platform Admin Console` e `Shop Admin Console`.
- `POS/Staff` e documentato come modulo interno shop-scoped della `Shop Admin Console`, non come terza console autonoma.
- Responsabilita aggiornate:
  - `platform_admin`: ecosistema globale, utenti, negozi, stato sistema, audit globale e operazioni amministrative sicure;
  - `shop_owner` / `shop_manager`: gestione shop, staff POS, ruoli, permessi, dispositivi, prodotti, fornitori, categorie e import/export;
  - `cashier` / staff POS: operativita limitata dentro uno shop.
- File aggiornati: Master Plan, Domain Model, ADR, admin dashboard skill, Supabase security skill, README, task ed evidence.
- Check eseguiti per questo fix:
  - `npm run verify`: `PASS_WITH_NOTES`;
  - `git diff --check`: `PASS`;
  - secret scan richiesto: `PASS`;
  - `git status --short --untracked-files=all`: `PASS_WITH_NOTES`.
- Stato storico: restava `REVIEW` in attesa di conferma utente; chiuso ora in `DONE` dopo conferma esplicita.

## Chiusura

- Stato finale: `DONE`
- Conferma utente: conferma esplicita ricevuta nel prompt "Review planning TASK-002 e chiusura TASK-001".
- Data chiusura: `2026-05-29`
- Condizioni verificate:
  - governance creata;
  - Master Plan presente;
  - Domain Model presente;
  - ADR presente;
  - skills locali presenti;
  - evidence presente;
  - `npm run verify` gia registrato in evidence precedente;
  - nessun blocker aperto rilevato nella review documentale;
  - rischi residui non bloccanti gia documentati.
- Follow-up aperti:
  - `TASK-002 - Platform Admin UI Shell` resta `PLANNED` / `PLANNING`;
  - eventuali script secret scan dedicati, CI, Playwright o automazioni restano task futuri separati.
