# TASK-144 - POS offline authorization attestation

## Informazioni generali

- ID: `TASK-144`
- Stato: `DONE`
- Fase attuale: `DONE / USER_CONFIRMED_CLOSURE`
- Responsabile attuale: `USER / CONFIRMED CLOSURE`
- Risoluzione finale: `USER_CONFIRMED_CLOSURE`
- Data apertura: `2026-07-28`
- Branch: `codex/admin-pos-offline-authorization-20260728`
- Baseline Admin: `7ff0f6a0dfd9e1203cd07834f73ecc4269abc714`
- Baseline Win7POS read-only: `fb6dbe670ae1a646268331e7288d6e6b07b5500d`
- Evidence: `docs/TASKS/EVIDENCE/TASK-144/README.md`
- PR: `#47`
- Feature SHA remoto: `ffcf96a6c0d8b5c749e953f5fd354f4491a08722`
- Merge SHA: `6ae562c83a6ebcecad93bf53141a13fbcdf0a080`

## Obiettivo

Emettere nel first-login POS l'attestazione server-side
`effectiveOfflineAuthorizationExpiresAt` già prevista dal contratto Win7POS,
senza introdurre campi paralleli o allargare l'autorità offline.

## Scope

- estensione additiva del boundary first-login/RPC esistente;
- expiry UTC autoritativa e persistita;
- clamp su sessione, credential dispositivo, credential staff e massimo
  policy;
- replay che non estende la lease originaria;
- revoca/lock/archive/invalidation/credential-version fail-closed;
- errori tipizzati;
- fixture Win7POS compatibile;
- test foundation, route e pgTAP;
- PR non-draft, review indipendente, CI e merge normale.

## Fuori scope

- Win7POS, Android e iOS;
- database e Worker production;
- deploy staging prima del merge di `TASK-145`;
- article mutations, tracciate separatamente in `TASK-145`;
- secret, token, credential, PIN o body in log/evidence.

## Criteri di accettazione

1. Il successo first-login contiene `effectiveOfflineAuthorizationExpiresAt`
   UTC strettamente parseabile e maggiore di `serverTime`.
2. L'expiry non supera sessione, credential dispositivo, credential staff o
   massimo policy.
3. Nessun timestamp client può estendere l'autorizzazione.
4. Il replay non estende l'expiry originaria.
5. Shop/staff/device/session non validi non ricevono attestazione.
6. Credential version e session invalidation invalidano l'autorità precedente.
7. Gli errori offline sono tipizzati e non includono segreti.
8. Le regressioni first-login/device trust/policy restano verdi.
9. La fixture della response è deserializzabile dal contratto Win7POS corrente.
10. Review indipendente finale con `P0=0`, `P1=0`, `P2=0`.

## Delivery

Review, PR, CI e merge normale sono completati. TASK-144 è consegnata a
`REVIEW_READY`. Migration staging, unico deploy Worker condiviso
post-merge e acceptance reale `STGFE91FF04C` sono `PASS`; production,
Win7POS, Android e iOS restano `NOT_MODIFIED`.

## Closeout finale article-sync 2026-07-30

- Win7POS final acceptance e cleanup consolidato staging: `PASS`.
- Residui sintetici target: `0`; audit immutabile: `PRESERVED`.
- Invarianti non-target: `UNCHANGED`.
- Review tecnica piano/transazione e outcome:
  `P0/P1/P2/P3 = 0/0/0/0`.
- Worker deploy aggiunti dal closeout: `0`.
- Production, Win7POS, Android e iOS: `NOT_MODIFIED`.
- Windows 7 fisico: `EXTERNAL_PENDING`.
- Conferma esplicita finale dell'utente: `RECEIVED`.
- Stato governance: `DONE / USER_CONFIRMED_CLOSURE`.
