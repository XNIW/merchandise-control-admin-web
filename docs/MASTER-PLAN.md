# MerchandiseControl Admin Web - Master Plan

## Identita progetto

- Nome progetto: `MerchandiseControl Admin Web`
- Obiettivo: dashboard web unica per amministrazione piattaforma, negozi, account personali, staff POS e futura integrazione Supabase.
- Stack: Next.js App Router, TypeScript, Tailwind CSS, futura integrazione Supabase SSR.

## Aree prodotto

Il prodotto distingue due aree amministrative principali:

- `Platform Admin Console`: area master globale per il proprietario dell'ecosistema.
- `Shop Admin Console`: area per proprietari e manager dei singoli negozi.

`POS/Staff` non e una terza console autonoma. E un modulo interno della `Shop Admin Console`, perche staff, PIN, ruoli operativi, permessi e dispositivi appartengono sempre a uno specifico shop.

## Responsabilita per area

- `platform_admin`: controlla ecosistema globale, utenti, negozi, stato sistema, audit globale e operazioni amministrative sicure. Non gestisce ordinariamente PIN/password/staff di ogni negozio.
- `shop_owner` / `shop_manager`: gestiscono i propri shop, inclusi staff POS, ruoli, permessi, dispositivi, prodotti, fornitori, categorie e import/export.
- `cashier` / staff POS: opera solo dentro uno shop con permessi limitati.

## Decisione architetturale principale

Usare direttamente `shops` come root aziendale/negozio.

Non introdurre per ora un livello separato `merchant -> stores`, per mantenere il dominio piu semplice e aderente al caso reale. Un account personale potra comunque essere membro di piu shop, e uno shop potra avere piu soci, ruoli, staff e dispositivi.

## Modello dominio previsto

- `profiles`: account personali per login web.
- `shops`: root aziendale/negozio, con `shop_id` e `shop_code`.
- `shop_members`: relazione tra profili personali, shop e ruoli.
- `staff_accounts`: account operativi futuri per POS.
- `roles`: ruoli applicativi.
- `permissions`: permessi granulari.
- `devices`: dispositivi autorizzati, incluso futuro POS.
- `audit_logs`: traccia delle azioni sensibili.

## Regole dati

- I dati business appartengono a `shop_id`/`shop_code`, non direttamente all'account personale.
- Login personale futuro: Google, Apple, WeChat, email-password.
- Login POS futuro: `shop_code + staff_code + PIN/password`.
- Account personale e staff POS restano separati.
- Gestione POS/Staff ordinaria: shop-scoped, dentro `Shop Admin Console`.

## Ruoli iniziali

- `platform_admin`
- `shop_owner`
- `shop_manager`
- `cashier`
- `viewer`

## Roadmap

### TASK-001 - Bootstrap governance Admin Web

- Stato: `DONE`
- Scopo: governance, documentazione, domini, ADR, evidence e verify harness.
- Nota: chiuso su conferma esplicita dell'utente dopo review documentale senza blocker reali.

### TASK-002 - Platform Admin UI Shell

- Stato: `DONE`
- File task pianificato: `docs/TASKS/TASK-002-platform-admin-ui-shell.md`
- Scopo: creare la prima UI statica moderna della `Platform Admin Console`.
- Include:
  - layout base dashboard;
  - sidebar;
  - topbar;
  - area contenuto;
  - pagine statiche placeholder per overview, utenti, negozi, audit, sistema e safe operations;
  - UX desktop/tablet;
  - harness Playwright smoke desktop/tablet;
  - nessun Supabase;
  - nessun login;
  - nessun dato reale;
  - nessuna azione database.
- Nota: chiuso su conferma esplicita dell'utente dopo review/fix finale; audit npm risolto con override transitivo `next -> postcss@8.5.10` senza `--force`.

### TASK-003 - Platform Admin Domain Types + Mock

- Stato: `DONE`
- Scopo: definire tipi TypeScript e mock sintetici dichiarati per `Platform Admin`.
- Include:
  - `Profile`;
  - `Shop`;
  - `ShopMember`;
  - `Role`;
  - `Permission`;
  - `AuditLog`;
  - `SystemStatus`;
  - dati mock separati dalla UI.
- Non include Supabase reale.
- Nota: chiuso su conferma esplicita dell'utente dopo review/fix con verdict `READY_FOR_DONE_CONFIRMATION`; nessun blocker reale.

### TASK-004 - Supabase Schema Discovery / Planning

- Stato: `PLANNED`
- Scopo: verificare schema reale Supabase o pianificare schema se assente.
- Include:
  - verifica migration/tabelle/colonne/policy reali;
  - piano RLS;
  - distinzione client/server boundary;
  - piano audit log;
  - piano ruoli globali e shop-scoped.
- Non inventare tabelle o colonne.

### TASK-005 - Platform Admin Read-only Data

- Stato: `PLANNED`
- Scopo: collegare la `Platform Admin Console` a letture dati reali solo dopo schema/auth/boundary verificati.
- Include:
  - lettura profili;
  - lettura shops;
  - lettura membership/owner;
  - lettura audit log se disponibile;
  - gestione loading/error/empty states.
- Solo read-only.
- Nessuna scrittura.

### TASK-006 - Platform Admin Controlled Actions

- Stato: `PLANNED`
- Scopo: introdurre prime azioni amministrative sicure server-side.
- Include in futuro:
  - crea shop;
  - assegna owner iniziale;
  - sospendi shop;
  - riattiva shop;
  - cancellazione logica shop;
  - audit log obbligatorio.
- Tutte le azioni devono essere server-side, autorizzate e tracciate.
- Nessuna service-role key nel client.

## Tooling policy

- Codex resta executor/fixer.
- ChatGPT/Claude resta planner/reviewer.
- Figma puo essere usato per wireframe/UI se utile.
- Browser/Chrome possono essere usati per smoke test visivo.
- Vercel solo quando esistera una UI minima stabile e previa richiesta.
- Non sviluppare un CLI custom ora.
- Preferire npm scripts semplici e verificabili.
- Eventuale CLI/tooling dedicato va trattato come task futuro separato, non dentro `TASK-002`.

## Tracking corrente

- Stato globale attuale: `IDLE`
- Ultimo completato: `TASK-003 - Platform Admin Domain Types + Mock`
- Task attivo: nessuno
- File task: non applicabile
- Stato task: non applicabile
- Fase: `IDLE`
- Responsabile: `USER`

## Regole di avanzamento

- Un solo task attivo per volta.
- Codex prepara handoff a `REVIEW`, non marca `DONE`.
- `DONE` richiede review positiva e conferma esplicita dell'utente.
- Follow-up e automazioni mancanti vanno documentati come candidati separati, non attivati automaticamente.
