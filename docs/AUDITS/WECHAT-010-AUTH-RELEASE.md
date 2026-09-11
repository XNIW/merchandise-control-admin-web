# Release isolata WECHAT-010 — continuazione Auth

Baseline distribuito: def934021481d3a309a543b0d4ea186b3fa91733.
Sorgente candidato: 0190f52682de86714bb2e5fc0dd6410948355152, PR104.
Selezionati soltanto i quattro file elencati; nessuna migration, dipendenza,
commerce o altra modifica applicativa. Questo branch non va unito a main.
Deploy consentito solo dopo review del sorgente, CI verde e merge normale PR104.
Rollback: Worker c39ebe92-0fdf-4596-94a0-16bcd018ebab.
Flags OFF, nessuna credenziale configurata; smoke pubblico non è Auth live.

| File | SHA256 |
|---|---|
| src/server/auth/wechat-config.ts | 61d49f2b47d415119d864ca47cdeaa3daf85cb09b3e0e2ef2631fae3e11dd1b2 |
| src/server/auth/wechat-mini-session.ts | 04a15073fe86da2d82460f2dcae63fb535e632cb99d2085064639b9ea2435d40 |
| tests/foundation/wechat-010-admission.test.mjs | fa604bedf2ededbe723db9ab7d18321fcea5604264ef93427e5291407bb95a4a |
| docs/DECISIONS/ADR-002-wechat-custom-oidc-bridge.md | fc6a9e9e49d016b5143bd5b1538167c4a8f4de17135b5c4b1041c0a3d3ca9400 |
