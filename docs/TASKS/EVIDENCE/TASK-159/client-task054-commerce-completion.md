# Coordinamento Client TASK-054 — commerce e typegen

Mandato utente operativo del2026-09-28: unica branch isolata
`codex/client-commerce-completion`, writer root della chat Client. TASK-159 WeChat
resta nel proprio stato; nessun nuovo task ACTIVE o modifica al runtime WeChat.
Riferimento: [Client PR27](https://github.com/XNIW/ClientMerchandiseControl/pull/27).

La patch conservata nel precedente audit Client (SHA256
123242eaa408dfabdfd730c67fd842d822b924bf14f2588020d93a516aafe413) è stata verificata
con git apply --check su fe4907ad e integrata nei tipi commerce mancanti, preservando
gli altri domini. Contratti nullable ricavati dalle firme/default canonici; fixture
TypeScript positive/negative per creazione indirizzo, pickup/delivery, contesto,
cursori, consenso revocato e owner injection. Nessun any o cast permissivo aggiunto.

Nuovo difetto riprodotto: safe_dedup collassava reservation_hold allo shop, perdendo
la seconda notifica di hold dello stesso customer. La nuova migration
20260928200000 esclude gli hold dall'indice generale; indice hold_source preesistente
mantiene dedup per hold/evento. Test canonico notifiche:40PASS+1FAIL prima,
41PASS dopo. Nessuna modifica a migration già applicate.

Validazione locale: Node22.23.3 npm run verify PASS (lint/typegen/tsc/security/build);
foundation1031PASS/2skip su snapshot readonly Win7POS origin/main, dopo2FAIL iniziali
per file assenti nel checkout POS dirty. La prima build con node_modules symlink era
fallita per vincolo Turbopack: dipendenze clonate nel solo worktree, poi buildPASS.
SQL isolato cmc_verified:23suite/1035assert PASS, incluso journey55/RLS e notifiche41.
Il dump staging fresco è stato ripristinato in cmc_recovery; apply/inverse cataloghi
schema/ACL uguali e reapplyPASS. Cleanup bucket via Storage API non ancora provato,
finestra staging senza writer non confermata: **nessun apply condiviso**.

Questa PR integra codice di sviluppo e non certifica backend staging, login provider,
commerce E2E o release. I gate/review/CI del revision set congelato e la ricevuta del
merge saranno collegati qui. Le due migration commerce canoniche precedenti restano
le uniche dipendenze, più la correttiva nuova. Non eseguire replay globale dello staging.
