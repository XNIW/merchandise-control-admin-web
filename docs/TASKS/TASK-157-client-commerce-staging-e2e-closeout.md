# TASK-157 - Client Commerce Staging E2E and Closeout

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `ACTIVE`
- Fase: `EXECUTION`
- Handoff: `ADMIN_PR_CI_STAGING_PENDING`
- Dipende da: `TASK-153`–`TASK-156`
- Planning authority: Client `TASK-050`

Governare apply migration soltanto su staging `jpgoimipbothfgkokyvm`, fixture
sintetiche, pgTAP/RLS, E2E-01…25, review integrata e closeout. Production, POS,
Android/iOS gestionali e WeChat restano invariati.
