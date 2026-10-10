# Dense 5000 actual phased transport pilot

Observed 2026-10-10T01:33:03.042023Z. Source commit `54a7a3cf7c01e60ea032d9d7444e9b445fa36511`; multipart SQL SHA256 `c827afcaeae4fc4270b0b0d5078c4d7ce7084ff9d315bde4492f46982d3a80cf`.

The 210 response frames were obtained from the official Admin parser/handler and real economic SQL in a new owned isolated PostgreSQL database. Original and plan input bytes are the immutable C# builder/SQLite outputs from Win7POS commit `51964ac2ec242a6f0f75c0ee65d44ad57a99a352`, corpus `phased-inputs-8610e1f`. Original: 4,857,436 bytes; plan: 5,940,971 bytes. Outer token/lease and dependency-schema fixtures are synthetic. This proves the transport pilot, not a deployed Worker or the complete C# recovery service.

The ZIP contains `schedule.json` (`win7pos-phased-admin-schedule-v1`), the request/response ledger, actual replay receipt and all indexed raw response files. ZIP SHA256: `1111be524982933d98a2e25f8b3245f526efb454d1fbd1727b9f0eed9c29d95b` (2,176,691 bytes). Schedule SHA256: `a02c9e004dc48f45e6879e67a6b167debbf7b3108cec692d5847ed0eb7e7d821`.

Two complete original upload/finalize passes, repeated exact phase requests, two not-found lookups, explicit retirement, the non-authoritative `identity_retired` lookup and idempotent explicit retirement all have actual responses. The plan produces ten children with authoritative item counts, ten durable ACKs and paged receipt responses. Postchecks find 5,000 products, 10,000 prices, 10 batches and 5,000 stock values of 1.25. Cached complete-plan `parentStatus` is its persisted snapshot; final apply and durable ACK postchecks establish completion.

This pilot contains additional QA retries. Capture the real C# helper or service HTTP bytes using only the recorded status/hash/cursors. A full `PrepareAsync → RetireAsync → CommitAsync → SyncPending` capture must preserve its actual call order; missing calls or duplicate responses must be obtained from the real handler/DB, never synthesized. A subsequent byte-exact replay on a fresh equivalent isolated DB and C# reingest remain separate proofs. Previously retained dense databases were not modified.
