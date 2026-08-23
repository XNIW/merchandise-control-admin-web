# TASK-157 - Client Commerce Staging E2E and Closeout

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `ACTIVE`
- Fase: `EXECUTION`
- Handoff: `ADMIN_AFTER_SALES_ORDER_LINES_FIX_IN_EXECUTION`
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
