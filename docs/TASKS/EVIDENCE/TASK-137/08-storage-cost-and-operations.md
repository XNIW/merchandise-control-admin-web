# 08 - Costi Storage e operazioni

## Campioni misurati

| Campione | Main + thumb |
|---|---:|
| Admin PNG sintetico | 27.887 B |
| Android high-res 48 MP | 183.286 B |
| iOS HEIC | 27.339 B |
| iOS high-res | 244.655 B |
| iOS JPEG ruotato | 14.619 B |
| iOS PNG trasparente | 3.738 B |
| Totale | 501.524 B |

Media aritmetica su sei fixture eterogenee: `83.587,33 B` per prodotto
(`81,628 KiB`).

## Stima

| Prodotti con immagine | Byte | MiB | GiB |
|---:|---:|---:|---:|
| 1.000 | 83.587.333 | 79,715 | 0,0778 |
| 10.000 | 835.873.333 | 797,151 | 0,7785 |
| 20.000 | 1.671.746.667 | 1.594,302 | 1,5569 |

La stima include solo main+thumb. Non include overhead metadata Storage,
egress/cache miss, versioni pending transitorie o versioni vecchie in attesa
della finestra cleanup. Non e una previsione statistica di un catalogo reale.
I byte sono arrotondati all'intero piu vicino nelle righe di stima.

## Report operativo

Comando:

```text
npm run task137:images:report -- --target=local|staging
```

Il report e read-only, bounded a 50.000 righe/oggetti e produce:

- immagini correnti e versioni ready;
- byte verificati correnti e byte Storage effettivi;
- aggregato per shop con solo hash redatto dello shop;
- oggetti senza lifecycle, oggetti current mancanti e path malformati;
- versioni sopra budget e conteggi lifecycle.

Non stampa ID, path, token o signed URL. Il run locale finale e `PASS` con
tutti i conteggi a zero.
