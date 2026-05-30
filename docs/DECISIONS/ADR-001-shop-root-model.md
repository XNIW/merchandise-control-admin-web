# ADR-001 - Shop root model

## Stato

Accettata.

## Contesto

Il progetto deve gestire amministrazione piattaforma, negozi, account personali, staff POS e dispositivi futuri. Il dominio puo essere modellato con un livello azienda separato oppure usando direttamente lo shop come root business.

## Decisione

Usare `shops` come root aziendale/negozio.

Non introdurre per ora un modello `merchant -> stores`.

## Motivazione

- Riduce complessita iniziale.
- Si adatta meglio al caso reale del progetto.
- Supporta comunque piu negozi per account personale.
- Supporta piu soci, manager e staff per negozio.
- Mantiene chiara la ownership dei dati su `shop_id`/`shop_code`.

## Conseguenze

- Ogni shop ha `shop_code`, ruoli, staff, dispositivi e futuro POS.
- I dati business futuri devono riferirsi allo shop.
- I moduli POS/Staff, i ruoli operativi e i dispositivi futuri stanno sotto lo shop e sotto la `Shop Admin Console`.
- La `Platform Admin Console` resta area globale e non sostituisce la gestione ordinaria shop-scoped.
- Se servira un livello aziendale superiore, verra introdotto con una nuova ADR e migration pianificata.
