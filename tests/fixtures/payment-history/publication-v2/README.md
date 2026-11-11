# Synthetic CLR publication corpus

Produced by the Win7POS analyzer, verified baseline exporter, publication draft
and Data ledger in the test identified by `provenance.json`. Contains two
selective baselines (one existing row and one empty device) and nine subsequent
Apply/Undo operations, including one explicitly approved inactive correction.
All identifiers, workbook contents and receipts are synthetic.

The Node tests verify original archive hashes, closed page shapes, content roots,
source tuples and lossless local receipts. The second device inserts a local row
whose canonical treatment must be decided independently by SQL. These files and
tests are component evidence, not authenticated WPF/server/two-device E2E.
