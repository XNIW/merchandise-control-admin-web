# TASK-137 pre-fix Security Changes scan

Sanitized durable copy of the completed pre-fix Changes scan. The source scan
was sealed before remediation; no post-fix claim is derived from these files.

- Scan ID: `18ce2671-83b2-41f3-ab0a-c9f0996063b5`
- Mode: `branch_diff` / Changes, Deep Scan disabled
- Base: `38f02bd969e55df91ff41d3905661da8dfdb145a`
- Vulnerable head: `2f166b51e7d3ff68f8f01593cb68845788e7be9a`
- Coverage: `complete`, 35 changed-file rows
- Findings: four `medium` / high-confidence route instances sharing one root
  cause in `product_image_record_denied`
- Pre-fix PoC: `9/9 PASS` in a rolled-back local transaction
- Staging/production: not used

The copied PoC remains byte-for-byte unchanged and intentionally asserts the
vulnerable behavior. It is expected to fail after remediation. A separate
post-fix regression proves the safe behavior.

## Copied artifacts

| Path | SHA-256 |
|---|---|
| `coverage.json` | `c6ed3ace7173106d37efcba739cce8b0e7df27914e38363f12f3326afeed81e3` |
| `findings/cross-shop-denied-audit-injection/cross-shop-denied-audit-injection.md` | `3d507ecc3b6357d793975767dca1b27ab2f92072587a04abc356cb2331ecdb3a` |
| `findings/cross-shop-denied-audit-injection/poc/README.md` | `c5570e4366d5cb16671bd9aba7481adb60ac9fd9816a41bf3f70c368168d37e1` |
| `findings/cross-shop-denied-audit-injection/poc/cross-shop-denied-audit.sql` | `f209f2192d879378e350bb2c646c060edb535ea05b19be37e2b9cebc5b0efe20` |
| `findings/cross-shop-denied-audit-injection/poc/representative-output.txt` | `c042b4da88c474d676bca96b834fb48796150f60f733a9d05802f9c2bca68cfc` |
| `hardening/hardening.json` | `3a185cf612116dc8a835dc87feec01bb972ee3548473dab5fac93dc779f08f0c` |
| `hardening/hardening.md` | `3ca12e32bf9318d85ff61f4c1701db95e1c41383fdc79abc01de6a2e80d53cb7` |
| `findings.json` | `872c7a08f14734e370740d7a9ca060c2692cfef8549f3dce58bef3fa055d6f01` |
| `report.md` | `934fa7dfe190407602664253d8974714a71bc125c9e30922ca7d142a919a30fb` |
| `scan-manifest.json` | `3c5ffcae95f56d7d7811744520e5fbaef9ead54923eea4ca195dc16b0aa57c4f` |

`scan-manifest.json` remains the byte-preserved sealed manifest and therefore
lists internal worker receipts that are intentionally absent from this
sanitized subset. The report's detailed finding and hardening links are
included and resolve inside this directory. Temporary validation logs and
context files containing machine-local paths were deliberately not copied. No
credential, token, signed URL, image byte, or absolute path is present in this
durable subset.
