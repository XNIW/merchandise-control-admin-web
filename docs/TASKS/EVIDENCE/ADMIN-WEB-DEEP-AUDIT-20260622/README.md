# Admin Web Deep Audit - Evidence 2026-06-22

Stato handoff: `READY_FOR_REVIEW`.

Nota governance: nessun task e stato marcato `DONE`. Il Master Plan risultava senza task attivo; questo audit e stato gestito come pass operativo standalone con handoff a review utente.

## Scope

- Security: redirect staff login, staff-aware bulk import, secret boundary, service-role/client exposure.
- Architecture/domain: Platform vs Shop, dual access staff/account, shop-scoped catalog/history.
- UI/UX/accessibility: modali catalogo, dettaglio prodotto, dettaglio history, search combobox.
- Performance: paginazione catalog/history e read model pesanti.
- Cleanup: asset default non referenziati e candidati di codice/documentazione.

## Fix applicati

1. Staff login redirect
   - `src/app/(staff-auth)/shop/staff-login/actions.ts`
   - Sostituita la validazione locale debole di `next` con `safeInternalNextPath(requested, "/shop")`.
   - Aggiornati test/scanner in `tests/foundation/task-038-pos-manager-web-login.test.mjs` e `scripts/security-checks.mjs`.

2. Staff-aware bulk import scoping
   - `src/server/shop-admin/staff-aware-mutations.ts`
   - Aggiunto `loadScopedInventoryRowIds` per validare ID caller-provided contro shop corrente o legacy owner mapping valido.
   - Product bulk: un `product_id` dal workbook viene usato solo se gia scoped; altrimenti viene generato un UUID nuovo.
   - PriceHistory bulk: righe con `product_id` non disponibile nello shop vengono rifiutate prima dell'upsert.
   - `src/server/shop-admin/import-export-workbook.ts`
   - Il payload preferisce `existing?.productId` rispetto a `row.productId`, evitando che un ID nel workbook sovrascriva un match barcode gia scoped.
   - Guardrail aggiunti in `tests/foundation/task-061-android-database-export-transfer.test.mjs` e `scripts/security-checks.mjs`.

3. Accessibilita modali
   - Nuovo hook `src/app/shop/_components/useModalFocusTrap.ts`.
   - Applicato a `CatalogActionPanel`, `ProductDetailModalController`, `HistoryDetailModalController`.
   - Le modali ora hanno focus iniziale, trap `Tab`, ripristino focus e chiusura `Escape` quando consentita.

4. Combobox search prodotti
   - `src/app/shop/products/_components/ProductSearchCombobox.tsx`
   - `aria-expanded` ora segue la reale visibilita del listbox, inclusi loading e no-results.

5. Cleanup asset
   - Rimossi asset scaffold non referenziati:
     - `public/file.svg`
     - `public/globe.svg`
     - `public/next.svg`
     - `public/vercel.svg`
     - `public/window.svg`

## Evidence comandi

- `node --test tests/foundation/task-038-pos-manager-web-login.test.mjs` -> PASS, 6/6.
- `node --test tests/foundation/task-061-android-database-export-transfer.test.mjs` -> PASS, 9/9.
- `npm run security:scan` -> PASS, `Security scan passed.`
- `npm run lint` -> PASS.
- `npm run typecheck` -> PASS, `next typegen` completato e `tsc --noEmit` senza errori.
- `npm run test:foundation` -> PASS, 453/453.
- `git diff --check` -> PASS.
- `npm run build` -> PASS. Warning noti: convenzione `middleware` deprecata in Next 16; Node `[DEP0205] module.register()`.
- `npm run verify` -> PASS; include lint, typecheck, security scan, build.
- `npm run test:ui-smoke:ci` -> PASS, 48/48 Chromium desktop.
- `rg "file.svg|globe.svg|next.svg|vercel.svg|window.svg"` -> nessun riferimento.

## Finding audit non chiusi in questo pass

- Staff/POS audit identity: alcuni read model audit selezionano `actor_profile_id` ma non `actor_staff_id`; da correggere con DTO/read model dedicati.
- Platform sync/history attribution: alcune viste Platform attribuiscono via `owner_user_id`; `sync_events.shop_id` dovrebbe essere fonte primaria.
- History mutations legacy fallback: alcuni path usano owner/creator profile come fallback per righe `shop_id IS NULL`; richiede task di autorizzazione dedicato.
- Supplier import history update: il path legacy dovrebbe filtrare anche `owner_user_id`.
- Staff-aware audit fail-open: alcune mutazioni completano anche se la scrittura audit fallisce; la soluzione robusta e RPC transazionale o fail-closed con compensazione.
- POS sales sync: `productId` va verificato contro catalogo dello shop prima di salvare righe vendita.
- Performance: categorie/fornitori caricano ancora opzioni catalogo complete per writer; history list puo leggere blob sessione per pagine grandi; product detail carica history globale. Sono fix piu ampi e vanno separati per non rompere dialog replacement e detail lazy.
- Next 16: migrazione da `middleware.ts` a `proxy` da pianificare prima di abilitare Cache Components.

## Note operative

- Nessuna dependency nuova.
- Nessuna migration Supabase aggiunta.
- Nessun secret aggiunto o stampato.
- Nessun commit, push o stage eseguito.
- `.next` e generata localmente dai comandi build/verify ed e artefatto non versionato.
