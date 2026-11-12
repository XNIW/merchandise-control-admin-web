const phases = ["configuration", "validation", "authorize_source", "read_source", "hash_source",
  "reauthorize_source", "prepare_storage_target", "put_storage_source"] as const;
export type HistorySourcePhase = typeof phases[number];
const codes = new Set([
  "auth_denied", "history_input_invalid", "history_cloud_unavailable", "history_cloud_access_denied",
  "history_response_invalid", "history_baseline_session_changed", "history_baseline_upload_invalid",
  "history_baseline_source_unavailable", "history_baseline_source_changed", "history_baseline_upload_failed",
  "history_baseline_upload_target_invalid",
]);

/** Closed metadata only: never serialize exceptions, source bytes, headers, URLs or actor identities. */
export function historySourceFailureAudit(error: unknown, phase: HistorySourcePhase, elapsedMilliseconds: number) {
  let code = "history_source_unexpected_failure";
  try {
    if (error instanceof Error) {
      if (codes.has(error.message)) code = error.message;
      else if (error.name === "AbortError") code = "history_source_aborted";
      else if (error.name === "TimeoutError") code = "history_source_timeout";
      else if (error.name === "TypeError") code = "history_source_network_or_runtime";
    }
  } catch { /* A diagnostic cannot replace the original request failure. */ }
  return {
    event: "history.source.failure",
    phase: phases.includes(phase) ? phase : "unknown",
    code,
    elapsed_ms: Number.isFinite(elapsedMilliseconds) ? Math.max(0, Math.floor(elapsedMilliseconds)) : 0,
  };
}

/** The existing route-rejection sink owns the log envelope and correlation ID. */
export function historySourceFailureStage(error: unknown, phase: HistorySourcePhase, elapsedMilliseconds: number) {
  const safe = historySourceFailureAudit(error,phase,elapsedMilliseconds);
  return `history_source.${safe.phase}.${safe.code}.${safe.elapsed_ms}ms`;
}
import "server-only";


