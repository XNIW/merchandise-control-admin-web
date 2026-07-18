# 05 - iOS

## Implementazione

- SwiftData persiste solo UUID versione e timestamp;
- PhotosPicker JPEG/PNG/HEIC e camera, senza blob nel modello/outbox;
- ImageIO/CoreGraphics eseguiti fuori dal MainActor, orientamento nei pixel,
  composizione bianca e downsample nativo;
- main/thumb con gli stessi budget e fallback progressivo del contratto;
- writer JPEG elimina APP1 aggiunto strutturalmente da ImageIO;
- cache account/shop/product/version/variant e sessione ephemeral senza cookie,
  cache HTTP o redirect;
- URL HTTP ammesso soltanto in DEBUG Simulator per loopback; runtime normale
  HTTPS-only.

## Test finali

- suite finale ProductImage API/cache/processor/sync/remove/origin binding:
  `22/22 PASS`, zero failure;
- invarianti sync esistenti: `46/46 PASS`;
- localizzazioni: `8/8 PASS`;
- build Debug, iPhone 16e Simulator iOS 26.2: `PASS`.

I test hanno rilevato due gap prima del verde finale: APP1 prodotto da ImageIO
e una seam URLSession che non osservava correttamente il body multipart nei
test. Le correzioni sono state limitate allo stripping strutturale e
all'iniezione interna di sessione; il runtime resta ephemeral.

## Metriche fixture

| Fixture | Input | Tempo | Main | Thumb |
|---|---:|---:|---:|---:|
| HEIC 2000 x 1200 | 2.762 B | 222 ms | 25.107 B, 1600 x 960 | 2.232 B, 384 x 230 |
| high-res 5000 x 4000 | 1.224.254 B | 72 ms | 179.973 B, 1600 x 1280 | 64.682 B, 384 x 307 |
| JPEG ruotato | 12.481 B | 7 ms | 12.612 B, 600 x 1200 | 2.007 B, 192 x 384 |
| PNG trasparente | 632 B | 0 ms | 1.890 B, 160 x 100 | 1.848 B, 160 x 100 |

XCTest performance high-res:

- Clock Monotonic Time: `72,969135 ms`;
- Memory Peak Physical: `88.657,16 kB`;
- Memory Physical delta riportato: `0 kB`.

Gli estratti JSON e il riepilogo XCTest sono conservati nel repository iOS.
Non e stato eseguito upload iOS contro Supabase locale reale e non e stato
usato un device fisico.
