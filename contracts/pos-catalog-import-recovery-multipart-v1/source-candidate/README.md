# Multipart source candidate

This directory describes the bounded source candidate. DB phases, upper resource
qualification, exact final-head CI and deployed caller acceptance remain separate
gates. No shared TEST DDL, deployment, cleanup or READY is authorized here.

The historical proposed documents in the parent directory remain byte-exact.
Synthetic request and canonical-manifest bytes are unchanged; this candidate
corrects quota policy, phase cursor rules and explicit compatibility exceptions.
Use `wire-contract.json` for its pinned companion documents.
