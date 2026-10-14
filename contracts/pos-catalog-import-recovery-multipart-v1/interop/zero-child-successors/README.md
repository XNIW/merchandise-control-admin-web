# Three authoritative zero-child successor cases

The archived original requests, raw handler responses and DB checks are synthetic
isolated evidence, captured by the official frozen handler `4b7965d9` and migration
SHA256 `bf274d3254701d7343c98ba4666b6863b3153f8a4389ef1a0af04827811e68e0`.
Observed terminal handoff: 2026-10-10T00:26:05.677260Z. Actor: Mac interop executor.

112 checks passed in the owned isolated PostgreSQL database
`pos_interop_current_zero_child20261010`. Cases:

- Already complete predecessor: every real accepted child is carried by the
  zero-child authoritative successor, with unchanged predecessor metadata.
- Retired correction predecessor: complete original durable ACK covers all rows.
- Retired replacement predecessor: a separate ordinary contributor durable ACK
  covers every original row.

All successors have `parts: []`, `partCount: 0`, `itemCount: 0` and
`parentStatus: "complete"`. The server stores the verified leaf and its full
coverage, with zero private child rows. Exact request retry returns the same reply;
product, price/history, batch, audit and ACK counts and typed digests stay unchanged.
The original receipt and predecessor status are not converted into synthetic ACKs.
Missing coverage and a predecessor child lacking retirement are rejected.

The ZIP SHA256 is
`5e7e3183fcabebac24cadfe2a7407594ea784817fc3d9fa2dd38756a919aea5c`.
The adjacent manifest preserves the original request route/index/body hashes;
lookup and retirement may otherwise have identical body hashes.

These bytes are generated synthetic requests. The existing C# caller corpus is a
separate interoperability lane. Synthetic outer trust/dependency fixtures are used;
there is no live Supabase Auth, shared TEST caller, Cloudflare upper-phase resource,
quota or rollout qualification. No previous 39-request replay was restarted.
