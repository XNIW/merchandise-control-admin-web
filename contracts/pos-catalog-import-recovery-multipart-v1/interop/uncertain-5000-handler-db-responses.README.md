# Real isolated uncertain-5000 interoperability responses

The ZIP preserves forty raw responses: requests 000–038 from the immutable real
C# HTTP corpus at Win7POS `7e287719d52d854908fd532be86ae45af46aefcf`,
plus one exact retry of 036. Index, route and request SHA jointly identify an
exchange; receipt and retirement can have identical request hashes.

The official Admin parser/handler and actual historical apply_v1/v2, linked
correction/retirement and multipart functions ran on owned network-none
PostgreSQL. Dependency schema and outer trust/session/lease were synthetic.
This proves isolated interoperability, not deployed authentication or readiness.

The original 033 validation failure, later stalled/cancelled owned SQL and raw
logs remain in historical-failures. Completed uploads 000–032 and the original
retirement were retained. After the independently reviewed SQL bijection fix
SHA256 `bf274d3254701d7343c98ba4666b6863b3153f8a4389ef1a0af04827811e68e0`,
only 033–038 resumed: 5000 products with stock 1.25, 10000 prices, five durable
ACKs. The parent became complete only at the last child ACK.

The exact 036 retry preserved its full immutable receipt, product/price IDs and
receipt SHA256 `6f0197350fe15ea03bf315893468058cc30045a9325ee46b32a13ba2794de9e1`.
Its top-level parentStatus changed partial→complete and acceptedPartCount 3→5,
because the group had since completed; every economic count and typed digest
remained unchanged. A delayed original reached the actual apply_v2 fence and
returned identity_retired with no economic writes.

ZIP SHA256: `f813a28b28a6eabf10d651b4ac569d5a4fd1dc78e7a42086b3eb2226461afbbf`.
Manifest SHA256: `db9f39e376611a80d7767bf4da86ba64c6dca4b3d426731d75a2d05989ebbbba`.
Terminal handler UTC: 2026-10-09T23:36:15.279Z. The future upper bounded phases
remain separate and unqualified. No shared TEST DDL, Worker deploy or READY.
