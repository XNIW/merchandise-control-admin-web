# TASK-138 Security e bounded diff review

## Scan

- `npm run security:scan` con Win7POS esplicitamente escluso:
  `Security scan passed`;
- skip dichiarato: `SKIPPED_EXTERNAL_REPO_NOT_AVAILABLE Win7POS`;
- scan sole righe aggiunte Admin/Android/iOS per log, storage di token/URL,
  Base64, service role e persistence sink: zero match TASK-138;
- `git diff --check`: PASS nei tre repository;
- nessun Deep Security Scan, come richiesto.

La `SUPABASE_SERVICE_ROLE_KEY` e stata usata esclusivamente nel processo server
e nell'harness locale di seed/cleanup. Non e mai stata impostata con prefisso
`NEXT_PUBLIC`, passata a client mobile o salvata in artifact.

## Supabase checklist

- RLS/grant e cross-shop deny coperti da pgTAP/E2E;
- owner/manager write, viewer read-only, cashier deny verificati;
- bucket privato, path server-owned, signed URL effimere;
- nessuna migration/schema nuova in TASK-138;
- il breaking change Supabase 2026 sugli explicit Data API grants non richiede
  patch TASK-138: il foundation esistente ha grant espliciti e i test passano.

## Review bounded

- Admin: circa `691` insert / `140` delete prima delle sole evidence finali;
- Android: `1112` insert / `151` delete runtime tracciato;
- iOS: `1338` insert / `126` delete runtime tracciato;
- nessuna dipendenza o lockfile modificato;
- nessuna modifica Win7POS/production, commit, push o merge;
- checkout originali dirty preservati.

Finding corretti durante la review:

1. Admin list loader riceveva lo short ID UI: ora usa il UUID canonico;
2. Admin StrictMode poteva riusare un single-flight senza consumer: la entry
   cancellata viene eliminata subito;
3. Android stale load poteva impedire l'avvio della nuova versione: la guardia
   riusa solo job con lo stesso `versionId`;
4. iOS API test recorder ignorava `httpBodyStream`: fix test-only e rerun verde.

Nessun finding security reportable residuo nel diff TASK-138.
