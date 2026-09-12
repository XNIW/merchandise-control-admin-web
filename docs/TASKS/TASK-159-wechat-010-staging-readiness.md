# TASK-159 — WECHAT-010 controlled Mini staging readiness

- Stato: `REVIEW / EXTERNAL_ACTIVATION_REQUIRED`
- Fase: `REVIEW`
- Writer: Codex root, unico writer, worktree codex/wechat-010-native-direct.
- Authority: explicit WECHAT-010 user request, including normal PR/CI/merge and isolated staging deploy.

## Scope

Prepare the existing Admin-owned gateway for tester/shop-only staging admission,
correct the bridge nonce encoding required by Supabase, validate session lifetimes,
and advertise mutation capabilities only while the mutation flag is enabled.
No new IdP, provider endpoint, migration, credential or production change.
All surface, linking and mutation flags remain OFF. Actual vendor qualification,
rotated Mini Test AppSecret and first real login remain external prerequisites.

## Acceptance

Focused fail-closed tests, repository verify/foundation/paging/UI checks, independent
security diff review, normal PR with green CI, and documented source-isolated
staging candidate. No live Auth or business E2E PASS from mocked tests.

## Deployment baseline

Pre-deployment staging Worker `38272504-ca78-4bcb-8553-ae7463ae1e64` mapped exactly to
`a787331a6e673b2daf93929b507aa18c6dc24e24` through GitHub Cloudflare run
`32530174055`. Current main contains two unapplied commerce migrations; they are
not WeChat dependencies and will not be applied or included in the isolated
staging release. All seven WeChat migration statement hashes match remote.

## Verification / handoff

Local checks: focused WeChat59/59, foundation1002PASS/2skip (existing clean
Win7POS reference used read-only), verify including lint/typecheck/security/build,
POS paging, UI48/48, OpenNext build and local Worker smoke29/29 PASS.
An initial local symlink build failure was resolved by isolated npm ci; the dirty
historical Win7POS checkout was preserved. No new dependency or lockfile change.

Independent security scan `6aeeb9bd-93e4-4ef9-b791-10bfc4ec39d2`: complete,
all7 source files plus7 supplemental files, zero findings/deferred items; P0/P1=0.
Reviewer noted a nonsecurity flag-parser mismatch; capability projection now
uses the existing exact `true` mutation-gate semantics, with a regression test.
Normal PR/CI/merge remains authorized; this handoff does not self-approve DONE.
External live Auth/catalog/functions remain NOT_RUN and flags OFF.

## Staging execution evidence — 2026-09-11

Source PR [102](https://github.com/XNIW/merchandise-control-admin-web/pull/102)
merged normally as `67e360fcbc5812b2bf8e5471ef17b2323d0f0fd2`, after exact-head
CI and Cloudflare checks passed. Isolated staging release
`def934021481d3a309a543b0d4ea186b3fa91733` starts at the proven deployed
`a787331a` baseline and selects only reviewed WeChat files from PR101/102.
Its 14 selected files match merged source byte-for-byte; the only other two
files are release/governance evidence. No commerce, dependency or migration delta.

Exact release [CI34650038825](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/34650038825)
and [Cloudflare build-only34650041304](https://github.com/XNIW/merchandise-control-admin-web/actions/runs/34650041304)
passed, including pgTAP and local Worker smoke. Local release verify, foundation
994PASS/2existing skips, focused59/59, UI48/48, Worker29/29, paging and dry-run
passed. The required CI workflow also ran its existing TASK094 staging
catalog-import fixture E2E; that success is not evidence of live WeChat Auth or
business E2E. No remote migration was applied.

After designated root review, Wrangler deployed staging with `--keep-vars`,
`--minify` and `--autoconfig=false`, preserving existing variables/secrets.
The OpenNext automatic-deploy wrapper initially rejected a multiword metadata
argument before upload; disabling automatic framework delegation resolved it
without source changes. Version `c39ebe92-0fdf-4596-94a0-16bcd018ebab` is at100%,
created `2026-09-11T21:40:59Z`, tagged `wechat-010-def93402` with exact source SHA
in its version message. Production was untouched.

Postdeploy real HTTP smoke9/9PASS: `/privacy`, `/account-deletion` and
`/api/auth/wechat/status` returned200 over verified TLS without redirects;
challenge, exchange, shops, catalog, sync delta and mutation gates returned503
`provider_not_configured`. The POST probes used synthetic OFF-state inputs,
never a real WeChat code or secret. All six WeChat feature/linking/mutation flags
remain absent with defaultOFF, public status has every surface disabled, and
binding names/types match the previous deployment. No secret was supplied or
rotated. Remote migration registry is unchanged at141 with identical complete
registry checksum `1b712fb5e807d9e90cc0668cd81df43a`; both pending commerce
migrations remain excluded.

Rollback target: Worker `38272504-ca78-4bcb-8553-ae7463ae1e64`.
Canonical task remains REVIEW. Live Auth, catalog/functions and essential-function
E2E remain NOT_RUN pending a qualified provider, rotated Test AppSecret and
operator-designated canonical tester/shop admission. No fixture is advertised
as a live tester and no feature flag was enabled.

## Emendamento WECHAT-011 — 2026-09-11

Il nuovo mandato continua TASK-159: un writer root nel worktree isolato
`codex/wechat-010-auth-closure`, due reviewer read-only complessivi.
Autorizzati review/fix/CI/merge normale e deploy staging senza nuovo prompt di fase.
Delta: ADR mirato ai requisiti e alla release GoTrue effettiva; cleanup sessioni,
revoca e readiness verificabili; nessun adapter senza qualifica favorevole.
Accettazione globale e stato DONE restano subordinati a prove reali e governance.
Release selezionata dal baseline def93402, senza commerce/migration/dependency delta.

## Execution della continuazione

Review read-only separata ha riprodotto cleanup incompleto, revoca boolean errata
e readiness pubblica incoerente. Fix: signOut canonico prima della RPC issue,
rollback opaco su risposta incerta; revoke solo con SQL true; readiness per superficie
senza esporre allowlist. Test Auth29/29, foundation1006+2skip, UI48/48 e verify PASS.
ADR aggiornato come proposta condizionata; provider/credenziale live NON_VERIFICATO.
Review dei commit finali e integrazione registrate nel closeout successivo.


## Closeout tecnico approvato e integrato

Reviewer read-only distinti `review_protocol` e `review_security`: APPROVED per
Admin `0190f52682de86714bb2e5fc0dd6410948355152`, Mini
`364b44cb63e553e47a398acc7d71378260c83647`, packet privato e release
`91f3d8e57f3c47740852974b73a5d66efc4189db`. S1 P1 e S2–S5 P2 chiusi con
regressioni; nessun finding aperto nel delta. L'ADR è una decisione condizionata,
non una qualifica provider o un'autorizzazione a omettere nonce.

[PR104](https://github.com/XNIW/merchandise-control-admin-web/pull/104) integrata
normalmente come `57e6049714252f6a6c1af37ec3f69127f16de902`; main locale/origin
allineate pulite prima del closeout documentale. CI PR34655768668 e Cloudflare
34655768662 PASS; main CI34656044040 e Cloudflare34656044041 PASS. Job/step/
annotation letti: solo warning preesistente runtime Node20 Actions. pgTAP48file/
2627test PASS; foundationCI995pass+13skip, locale1006pass+2skip; UI48/48 PASS.
TASK094 staging import E2E non rieseguito, skipped in CI corrente.

La release isolata deriva da def93402 e include solo quattro file identici al
source approvato/integrato più manifest `docs/AUDITS/WECHAT-010-AUTH-RELEASE.md`.
Branch `codex/wechat-010-auth-staging` preservato e pushato; non va merged a main.
Nessun commerce/migration/dependency delta. Release Cloudflare build-only
34655880432 PASS; verify/Auth29/OpenNext/local Worker29/dry-run PASS.
Wrangler deploy staging `--keep-vars --minify --autoconfig=false` exit0, metadata
source91f3d8e e tag wechat-010-auth-91f3d8e. Versione effettiva
`29d0c715-e3e7-4a23-b9e7-40ade3149414`, rollout100%. Rollback alla precedente
`c39ebe92-0fdf-4596-94a0-16bcd018ebab` disponibile, non eseguito.

Postdeploy HTTP reale OFF9/9 PASS, nessun redirect; nuovo status activation
disabled, enabled/readySurfaces tuttefalse, linking/mutationsfalse. Primo probe
challenge{}:400 e harnessFAIL; body corretto, rerun9/9 exit0, nessun difetto runtime.
Binding names/types invariati, nessun binding WECHAT/allowlist. Registry141
identica per versione/nome/statement count/hash, nessuna migration applicata;
commerce escluso, Google/email e produzione invariati. Nessuna fixture creata.

Execution dei fix conclusa e integrata; review codice APPROVED. Accettazione
live BLOCKED / EXTERNAL_ACTIVATION_REQUIRED, non DONE. Servono procedura TEST
supportata e nuova credenziale, qualifica OneID sul Mini TEST e tester/shop canonici
precisi già usati sulle altre piattaforme. Nessun account arbitrario/iniettato.
Mini distOFF/verify88 e cinque tab DevTools OFF verificati; privacy web-view
BLOCKED dal controllo IDE; Auth/telefono/E2E reale NOT_RUN. Report unico Mini
`docs/testing/WECHAT-010-REPORT.md`; packet privato OPERATOR-ACTIONS aggiornato
con prove attese e comando di ripresa, senza segreti o messaggi vendor inviati.

## 2026-09-12 - Explicit native privacy and direct Mini mandate

WECHAT-010/TASK-159 continues in EXECUTION. The operator designates the existing
private profile and TASK068E_260618231325 as pilot target; current canonical
identity, active membership/shop and shop_owner role were rechecked read-only.
This does not prove native clients use the same shop. No impersonation.
Authorized: shared/versioned native privacy available without Auth; explicit
Mini-only code2Session architecture revision, secure initial pairing to the
existing profile, opaque sessions and restricted authorization, additive reviewed
migrations if required. OneID remains paused. OIDC guarantees for other surfaces
remain unchanged. Root sole writer in both existing isolated worktrees; at most
two independent read-only reviewers. No production or activation before proof.
Prior narrower scope is superseded only by this explicit amendment.

## 2026-09-12 — Native privacy and Mini direct implementation

User mandate supersedes OneID-only and H5-only dependencies for Mini. Existing designated pilot verified; no further shop choice. Shared native policy, explicit code2Session protocol, two-consent pairing, opaque sessions and session-derived business/Storage RPCs implemented. Root only writer, two reviewers approved the initial design; implementation findings corrected and exact final review pending. Mini 98+3 tests, Admin foundation1013 PASS/2 expected skips, component browser2 PASS, direct SQL53 PASS; isolated staging141 plus additive migration validated, no commerce migration. Worker-local HTTPS uses intercepted upstream, live credential/login NOT_RUN. OneID paused. REVIEW, no DONE. Canonical report lives in Mini docs/testing/WECHAT-010-REPORT.md.
