# Catalog text policy v1

Versione canonica: `catalog_text_policy_v1`

Fonte documentale: Admin Web. Il fixture golden machine-readable è
`tests/fixtures/catalog-text-policy-v1.json` e deve essere copiato byte-per-byte
nei repository Android e iOS. I test dei tre repository verificano lo stesso
SHA-256.

## Obiettivo

La policy impedisce che testo catalogo non canonico o caratteri invisibili
proibiti entrino nella persistenza autorevole, nei fingerprint, nelle code di
sync o nei payload. Non è una policy di ricerca, translitterazione o
compatibility folding:

- usa NFC, mai NFKC;
- preserva alfabeti, accenti, simboli, emoji e sequenze ZWJ valide;
- non inventa valori;
- non modifica note o descrizioni free-form fuori dallo scope catalogo POS.

## Unità di lunghezza

Tutti i limiti sono misurati in unità UTF-16 dopo NFC e dopo la
canonicalizzazione whitespace. Questa scelta coincide con `String.length` in
TypeScript/Kotlin e con `value.utf16.count` in Swift, ed è compatibile con il
validator Win7POS.

| Campo | Classe | Required | Max UTF-16 |
|---|---|---:|---:|
| product name | display | sì | 240 |
| second product name | display | no | 240 |
| supplier name | display | sì | 160 |
| category name | display | sì | 160 |
| barcode | identity | sì | 96 |
| item number/article code | identity | no | 120 |

Gli UUID/remote ID/shop code mantengono i limiti di dominio già esistenti e
applicano la stessa validazione strict identity.

## Display text

### Sequenza deterministica

1. Rifiutare input byte non UTF-8 quando il boundary riceve byte.
2. Rifiutare stringhe con surrogate UTF-16 non appaiate.
3. Applicare Unicode NFC.
4. Convertire in U+0020:
   - CRLF come una sola unità;
   - CR;
   - LF;
   - TAB;
   - ogni Unicode Space Separator `Zs`.
5. Collassare sequenze di U+0020 in un solo spazio.
6. Trim di U+0020 iniziale/finale.
7. Rifiutare:
   - C0/C1 residui;
   - U+2028 LINE SEPARATOR e U+2029 PARAGRAPH SEPARATOR;
   - U+200B ZERO WIDTH SPACE;
   - U+2060 WORD JOINER;
   - U+FEFF quando compare nel valore decodificato;
   - bidi embedding/override/isolate U+202A–U+202E e U+2066–U+2069.
8. Rifiutare un required value diventato vuoto.
9. Rifiutare un valore oltre il limite UTF-16.

U+200D ZERO WIDTH JOINER e U+200C ZERO WIDTH NON-JOINER non sono rimossi:
possono appartenere a emoji o scritture valide. U+FEFF usato come BOM del file
va consumato dal decoder; se arriva nel valore campo viene rifiutato.

La funzione è idempotente:

```text
canonicalize(canonicalize(value)) == canonicalize(value)
```

Un optional display value canonicalizzato a stringa vuota viene persistito
come `null` dal consumer, senza placeholder.

### Esito tipizzato

```text
unchanged(value)
normalized(value, changes[])
rejected(reason)
```

Reason canoniche:

- `invalid_utf8`
- `invalid_utf16`
- `prohibited_control`
- `prohibited_line_separator`
- `prohibited_zero_width`
- `prohibited_bom`
- `prohibited_bidi`
- `empty_required`
- `too_long`

Change canoniche:

- `unicode_nfc`
- `line_break_to_space`
- `tab_to_space`
- `space_separator_to_space`
- `space_collapsed`
- `trimmed`

I log/evidence possono registrare reason/change, campo, riga, classe codepoint
e ID redatto/hash, ma non il valore raw.

## Identity/code text

Barcode, item number/article code, remote ID, shop code e chiavi testuali:

1. validare UTF-8/UTF-16 come sopra;
2. applicare soltanto la policy di trim già ammessa dal dominio;
3. non applicare NFC, whitespace replacement, case folding o rimozione di
   caratteri per far passare il valore;
4. rifiutare qualsiasi C0/C1, U+2028/U+2029, zero-width (`U+200B`,
   `U+200C`, `U+200D`, `U+2060`, `U+FEFF`) e bidi control
   U+202A–U+202E/U+2066–U+2069;
5. rifiutare required vuoto e over-limit.

Il trim consentito non autorizza merge. Prima di persistere/importare un batch,
il consumer deve rilevare collisioni tra identità distinte dopo trim nello
stesso scope e rifiutare con `identity_collision_after_trim`.

## Fallback nome prodotto

Per una nuova riga il solo fallback già approvato è:

```text
productName canonicalizzato
  -> secondProductName canonicalizzato
  -> itemNumber strict valido nei flussi Admin/mobile che già lo usano
```

Il mapper Win7POS possiede un fallback ulteriore al barcode, ma non autorizza
Admin/mobile a inventare o sostituire un `product_name` autorevole con barcode.
Se nessun fallback già approvato è valido, la riga è bloccata.

## Preview/import

- Display benigno canonicalizzato: warning non bloccante
  `catalog_text_normalized`, valore canonico visibile, conteggi per riga/campo
  e apply dello stesso identico valore.
- Input proibito/malformato/over-limit: errore bloccante della riga con reason
  localizzata; nessuna scrittura parziale silenziosa.
- Edit preview: rivalidazione completa prima di apply.
- Export errori: reason/code/classi redatte, mai il carattere invisibile raw.

Stringa utente base da localizzare dove esistono le lingue:

```text
Spazi o interruzioni nascoste normalizzati
```

Lingue richieste: italiano, inglese, spagnolo e cinese semplificato.

## Persistenza e sync

- Canonicalizzare/validare prima di local DB, fingerprint, dirty marker, outbox
  e payload.
- Il DB server applica una difesa finale con funzioni private versionate e
  trigger `BEFORE INSERT/UPDATE`.
- Inbound canonicalizza display e rifiuta identity invalida senza generare loop.
- Pending/dirty preesistenti sono riparati in transazione bounded mantenendo lo
  stato pending/dirty e senza duplicare outbox.
- Remote-clean viene aggiornato dal pull canonico, non trasformato
  indiscriminatamente in modifica locale.
- La sola canonicalizzazione testuale non crea PriceHistory.

## Compatibilità Win7POS

Il validator Win7POS corrente rifiuta Cc e surrogate non appaiate, ma accetta
alcuni `Cf`, Zs e U+2028/U+2029. `catalog_text_policy_v1` è intenzionalmente più
severa. Il gate POS si applica al valore finale canonico e deve produrre:

- zero `catalog_product_row_invalid`;
- catalogo non vuoto;
- tutte le pagine/lane drenate;
- summary/exactness coerenti;
- nessun timeout o valore raw nei log.
