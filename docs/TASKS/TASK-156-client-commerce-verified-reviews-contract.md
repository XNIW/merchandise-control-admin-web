# TASK-156 - Client Commerce Verified Reviews and Moderation

- Release train: `CLIENT_COMMERCE_JOURNEY_COMPLETION`
- Stato: `DONE`
- Fase: `REVIEW`
- Handoff: `CODEX_REVIEW_APPROVED_USER_AUTHORIZATION_SATISFIED`
- Dipende da: `TASK-155`
- Planning authority: Client `TASK-050`

Introdurre review verificate per owner/order-line completed, unique constraint,
moderation queue, aggregate pubblici e suggerimenti ricerca da sole pubblicazioni
reali. Nessuna recensione, notifica o query storica inventata.

Review indipendente `APPROVED`, `P0=0/P1=0/P2=0`. La moderazione richiede
`storefront.publish`, il replay same-state è idempotente, le recensioni pubbliche
richiedono una pubblicazione catalogo attiva e gli aggregati restano server-side.
