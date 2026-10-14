# Real C# supersession replay with authoritative child counts

Original Win7POS corpus: `9a87550244a00a322d70bc066ac19c0a84f6c494`; ZIP SHA256 `fc77839f807f3870f34db4f99447c3cda2c82b7827ae46560bfee06caae97d44`. All 115 HTTP request bodies are unchanged.

Admin source `54a7a3cf7c01e60ea032d9d7444e9b445fa36511`, multipart SQL SHA256 `c827afcaeae4fc4270b0b0d5078c4d7ce7084ff9d315bde4492f46982d3a80cf`. Four new isolated PostgreSQL scopes execute 28+27+27+33 requests through actual handlers and economic SQL. Outer authentication/dependency fixtures are synthetic. Each child itemCount is verified against its immutable persisted items, including 1000/1 and zero-part closure.

Each scenario passes 1001 product/2002 price mappings, stock 1.25, durable ACKs and declared retail values. Deliberately dropped replies are executed and recorded on the server. The archive contains exact response bytes keyed by scenario/index/route/request SHA and SQL postchecks. New independent C# reingest is a separate step. No shared TEST, deployed caller or upper resource acceptance is implied.

The older response archive `d603a60e...` and the Asus initial C# refusal caused by absent itemCount remain negative historical evidence; no old DB was reset or reused for this replay.

New ZIP SHA256 `7baef9303b7be9c20ae4dc183aae0e305c4948efea035a7ab42dc3521d876797`, 1,687,354 bytes. Manifest SHA256 `0474f4e6b907dd13c9983a6ca5be7fb4ca3978f79ecd7c6c89f40fd6507bc1ca`. Execution finished 2026-10-10T01:27:08Z.
