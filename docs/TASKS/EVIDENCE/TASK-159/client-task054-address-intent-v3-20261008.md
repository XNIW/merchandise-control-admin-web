# TASK-054 — Creazione indirizzo riconciliabile, 8 ottobre 2026

Mandato utente corrente: risolvere il commit riuscito con risposta persa senza
duplicare indirizzi, con una migration aggiuntiva coordinata. Fonte Admin verificata
`82af13ef0005ecfb767809bd362327e91692b5ba`; checkout originale e lane W preservati.
Implementazione e gate eseguiti nel worktree isolato
`codex/task054-address-create-idempotency`.

## Risultato e contratto

Nuove RPC `customer_address_create_v3(uuid,jsonb)` e
`customer_address_create_reconcile_v3(uuid)`, account-global come gli indirizzi v2.
Un ledger privato associa owner/intento al canonical UUID e all'hash del payload;
creazione e ledger sono atomici, sotto il lock owner già adottato da v2. Replay e
riconciliazione restituiscono l'indirizzo corrente senza ripetere scritture. Payload
diverso produce `intent_conflict`; cancellazione produce `deleted` e non ricrea
l'indirizzo. La cancellazione dell'account rimuove anche il ledger. Nessuna PII
indirizzo viene duplicata nel ledger.

Autorizzazione corrente tramite account e `auth.sessions`, con lock SHARE sulle
righe fino al commit. Due RPC con EXECUTE solo `postgres`/`authenticated`; helper
solo `postgres`; ledger senza grant client, RLS abilitata e forzata.
[Contratto completo](../../../contracts/CUSTOMER_ADDRESS_CREATE_INTENT_V3.md).

Migration autonoma `20261008151018_customer_address_create_intent_v3.sql`, creata
tramite Supabase CLI 2.120.0. SHA256 finale
`b290c6373d2d49a3c9fb4847e5ee8f47f2ce11f4eeeb17da4d3fc4086a615e56`.
Le tre canoniche precedenti e i contratti v2 restano byte-identici.

## Riproduzione e verifiche

PostgreSQL locale 17.11.0.002, container dedicato `network=none`, schema storico
derivato più gli otto delta canonici fino a TEST155 e le tre migration commerce.
Solo dati sintetici; nessun dato TEST o credenziale nel database di regressione.

| Gate | Risultato |
|---|---|
| Prima della patch: due richieste v2 con vera attesa sul lock | FAIL atteso, exit 1: due ID, due indirizzi |
| Contratto v3 inizialmente assente | FAIL atteso, exit 3 |
| Concorrenza v3 finale, attesa `pg_stat_activity.wait_event=advisory` osservata | PASS, exit 0: un ID, una riga, stessa versione |
| Nuova suite SQL finale | PASS, 43/43, exit 0 |
| Profili/indirizzi v1 esistenti | PASS, 64/64, exit 0 |
| Commerce journey esistente | PASS, 55/55, exit 0 |
| Probe TypeScript positivi/negativi con Node 22.23.3 e TypeScript lockfile | PASS, exit 0 |
| `node scripts/security-checks.mjs` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |

Comandi SQL: `docker exec -i <container> psql -X -U supabase_admin -d <database>
-v ON_ERROR_STOP=1 -At < supabase/tests/<suite>.sql`. Ogni pgTAP viene accettato
solo con piano, conteggio e zero `not ok`: exit 0 da solo non è sufficiente.
Concorrenza: `python3 scripts/testing/customer-address-create-intent-v3.py
--container <container> --database task054_address_v3`; `--baseline` riproduce v2.
Probe tipi: `tsc --noEmit --strict --skipLibCheck --target es2022
--moduleResolution node tests/foundation/client-commerce-types.ts`.

La review read-only distinta ha trovato P2: il cast `isDefault` nella dichiarazione
di v2 propagava `22P02`. Riproduzione autonoma READ ONLY e nuova regressione
autenticata rossa (41 assertion, una fallita) precedono il fix minimo dell'handler.
La re-review ha rieseguito autonomamente 43/43 assertion in rollback, verificato
l'handler e zero utenti sintetici residui: **APPROVED per source/local**.

Readback reale locale: 57 RPC consumer presenti, incluse le due nuove. Metadata,
definition MD5, hash e risultati sono nella [ricevuta JSON](client-task054-address-intent-v3-20261008.json).
Log completi e dump restano in output locale escluso da Git.

## Confini del risultato

CI sul commit finale, apply condiviso TEST e smoke autenticato Client **NOT_RUN**.
Questa lane non distribuisce il Worker e non modifica migration history TEST.
La full verify Next non è stata rieseguita: il delta modifica SQL e contratti di
tipo, senza codice Next/React; il gate CI resta richiesto prima dell'integrazione.
Il cluster locale resta disponibile alla lane recovery coordinata, in un database
separato PRE3 senza dati sintetici della suite; cleanup solo a fine uso condiviso.

Handoff: `CODEX_FIX_COMPLETE_TO_RE_REVIEW`, re-review source/local conclusa;
nessun `DONE`, merge o accettazione live derivano da questo risultato.
