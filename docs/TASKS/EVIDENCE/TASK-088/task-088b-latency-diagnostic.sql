-- TASK-088B durable diagnostic queries.
-- Execute from the Admin repository root with SQLite JSON1/readfile support.

-- query: headline
WITH document AS (
  SELECT json(readfile(
    'docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json'
  )) AS payload
)
SELECT
  json_extract(payload, '$.localk125.samples_completed') AS completedSamples,
  json_extract(payload, '$.localk125.samples_required') AS requiredSamples,
  json_extract(payload, '$.localk125.first_gate_failure.actual_ms') AS g004P50Ms,
  json_extract(payload, '$.localk125.first_gate_failure.limit_ms') AS p50LimitMs,
  json_extract(payload, '$.localk125.first_gate_failure.delta_ms') AS p50DeltaMs,
  json_extract(payload, '$.localk125.functional_failures') AS functionalFailures,
  json_extract(payload, '$.localk125.full_pulls') AS fullPullCount,
  json_extract(payload, '$.localk125.cleanup.residue_count') AS residueCount,
  (
    SELECT count(*)
    FROM json_each(payload, '$.localk125.cleanup.codes')
    WHERE CAST(value AS INTEGER) != 0
  ) AS cleanupCodeFailures,
  json_extract(payload, '$.localk84_root_cause.total_end_to_end_ms') AS k84TotalMs,
  json_extract(payload, '$.localk84_root_cause.admin_commit_coordinator_ms') AS k84AdminCommitMs,
  json_extract(payload, '$.localk84_root_cause.server_to_ios_ms') AS k84ServerToIosMs,
  json_extract(payload, '$.localk84_root_cause.ios_apply_marker_ms') AS k84IosApplyMs,
  json_extract(payload, '$.localk125.cleanup.remote_non_fixture_baseline_preserved') AS baselinePreserved
FROM document;

-- query: targeted-runs
WITH document AS (
  SELECT json(readfile(
    'docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json'
  )) AS payload
)
SELECT
  json_extract(run.value, '$.run') AS run,
  json_extract(run.value, '$.direction') AS direction,
  json_extract(run.value, '$.samples') AS samples,
  json_extract(run.value, '$.p50_ms') AS p50Ms,
  json_extract(run.value, '$.p95_ms') AS p95Ms,
  json_extract(run.value, '$.p99_ms') AS p99Ms,
  json_extract(run.value, '$.max_ms') AS maxMs,
  json_extract(run.value, '$.failures') AS failures,
  json_extract(run.value, '$.cleanup') AS cleanup
FROM document
CROSS JOIN json_each(payload, '$.targeted_runs') AS run
ORDER BY run;

-- query: phase-comparison
WITH document AS (
  SELECT json(readfile(
    'docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json'
  )) AS payload
), phases AS (
  SELECT
    CASE json_extract(phase.value, '$.phase')
      WHEN 'end_to_end' THEN 1
      WHEN 'source_coordinator' THEN 2
      WHEN 'server_to_ios' THEN 3
      WHEN 'ios_apply_marker' THEN 4
      WHEN 'sync_event_visibility_and_fetch' THEN 5
      WHEN 'domain_fetch' THEN 6
      WHEN 'domain_apply_and_persistence' THEN 7
      WHEN 'runner_final_observation' THEN 8
    END AS phaseOrder,
    CASE json_extract(phase.value, '$.phase')
      WHEN 'end_to_end' THEN 'End-to-end'
      WHEN 'source_coordinator' THEN 'Source coordinator'
      WHEN 'server_to_ios' THEN 'Server -> iOS'
      WHEN 'ios_apply_marker' THEN 'iOS apply marker'
      WHEN 'sync_event_visibility_and_fetch' THEN 'Sync-event visibility/fetch'
      WHEN 'domain_fetch' THEN 'Domain fetch'
      WHEN 'domain_apply_and_persistence' THEN 'Domain apply/persistence'
      WHEN 'runner_final_observation' THEN 'Runner final observation'
    END AS phase,
    phase.value AS value
  FROM document
  CROSS JOIN json_each(
    payload,
    '$.g004_k118m_vs_k125.phase_comparison'
  ) AS phase
), tidy AS (
  SELECT
    phaseOrder,
    phase,
    'K118M' AS run,
    json_extract(value, '$.k118m_p50_ms') AS p50Ms,
    json_extract(value, '$.k118m_mean_ms') AS meanMs,
    json_extract(value, '$.k118m_p95_ms') AS p95Ms,
    json_extract(value, '$.k118m_max_ms') AS maxMs,
    json_extract(value, '$.paired_median_delta_ms') AS pairedMedianDeltaMs,
    31 AS sampleCount,
    'Android -> iOS Product' AS groupName,
    'non-burst' AS scope,
    0 AS additive
  FROM phases
  UNION ALL
  SELECT
    phaseOrder,
    phase,
    'K125' AS run,
    json_extract(value, '$.k125_p50_ms') AS p50Ms,
    json_extract(value, '$.k125_mean_ms') AS meanMs,
    json_extract(value, '$.k125_p95_ms') AS p95Ms,
    json_extract(value, '$.k125_max_ms') AS maxMs,
    json_extract(value, '$.paired_median_delta_ms') AS pairedMedianDeltaMs,
    31 AS sampleCount,
    'Android -> iOS Product' AS groupName,
    'non-burst' AS scope,
    0 AS additive
  FROM phases
)
SELECT *
FROM tidy
ORDER BY phaseOrder, run;

-- query: group-summary
WITH document AS (
  SELECT json(readfile(
    'docs/TASKS/EVIDENCE/TASK-088/task-088b-latency-diagnostic.json'
  )) AS payload
)
SELECT
  json_extract(summary.value, '$.run') AS run,
  json_extract(summary.value, '$.status') AS status,
  json_extract(summary.value, '$.sample_count') AS sampleCount,
  json_extract(summary.value, '$.p50_ms') AS p50Ms,
  json_extract(summary.value, '$.p95_ms') AS p95Ms,
  json_extract(summary.value, '$.p99_ms') AS p99Ms,
  json_extract(summary.value, '$.max_ms') AS maxMs,
  json_extract(summary.value, '$.mean_ms') AS meanMs,
  json_extract(summary.value, '$.burst10_max_ms') AS burstMaxMs,
  json_extract(summary.value, '$.source_p50_ms') AS sourceP50Ms,
  json_extract(summary.value, '$.server_to_ios_p50_ms') AS destinationP50Ms,
  json_extract(summary.value, '$.ios_apply_p50_ms') AS iosApplyP50Ms,
  json_extract(summary.value, '$.functional_failures') AS functionalFailures
FROM document
CROSS JOIN json_each(
  payload,
  '$.g004_k118m_vs_k125.group_summary'
) AS summary
ORDER BY run;
