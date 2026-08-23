# TASK-157 - Client Commerce Staging E2E and Closeout

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `ACTIVE`
- Fase: `EXECUTION`
- Handoff: `ADMIN_SECOND_PR_CI_FIX`
- Dipende da: `TASK-153`–`TASK-156`
- Planning authority: Client `TASK-050`

Governare apply migration soltanto su staging `jpgoimipbothfgkokyvm`, fixture
sintetiche, pgTAP/RLS, E2E-01…25, review integrata e closeout. Production, POS,
Android/iOS gestionali e WeChat restano invariati.

## Fix batch P2 riproducibile

Il Client non deve usare `customer_order_reorder_preview_v1` per comporre un caso
post-vendita: quel contratto è intenzionalmente limitato a ordini riacquistabili e al
catalogo corrente. Il secondo e ultimo PR Admin introduce il read model additivo
`customer_after_sales_order_lines_v1`, owner-scoped e basato sugli snapshot storici,
e applica server-side la quantità residua anche alla mutation di creazione del caso.

## Checkpoint tecnico Admin

- Review indipendente secondo PR: `APPROVED`, `P0=0`, `P1=0`, `P2=0`, `P3=0`.
- pgTAP mirato: `55/55 PASS`; reset locale, lint DB, verify/build ed ESLint:
  `PASS`.
- Apply staging `jpgoimipbothfgkokyvm`: `BLOCKED` dal provider/CLI dopo i due
  tentativi bounded; nessuna migration production eseguita.
- Il closeout Client conserva la classificazione
  `STAGING_PARTIAL_EXTERNAL` senza nascondere bug tecnici.
