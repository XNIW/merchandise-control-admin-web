const MAX_NOTE_LENGTH = 600;

const SENSITIVE_NOTE_PATTERNS = [
  /(^|[^a-z0-9_])bearer\s+[a-z0-9._~+/=-]{12,}/i,
  /(^|[^a-z0-9_])(?:authorization\s*:\s*)?basic\s+[a-z0-9+/=]{8,}/i,
  /[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}/i,
  /(?:access[_-]?token|refresh[_-]?token|id[_-]?token|x-amz-signature|x-goog-signature|api[_-]?key|service[_-]?role(?:[_-]?key)?|supabase[_-]?service[_-]?role[_-]?key|signature|token)\s*[:=]\s*[^&\s]{8,}/i,
  /(?:password|passwd|pwd|pin|secret|client[_-]?secret|credential|private[_-]?key|session[_-]?(?:token|secret|key)|mcpos[_-]?session)\s*[:=]\s*[^&\s]+/i,
  /https?:\/\/[^/@\s]+:[^/@\s]+@/i,
  /\/storage\/v1\/object\/sign\//i,
  /sb_(?:secret|publishable)_[a-z0-9_-]{8,}/i,
  /mcpos_session_[a-z0-9_-]{8,}/i,
  /(?:gh[pousr]_|github_pat_)[a-z0-9_]{20,}/i,
  /(?:sk-(?:proj-)?[a-z0-9_-]{16,}|[sr]k_(?:live|test)_[a-z0-9]{8,})/i,
  /akia[0-9a-z]{16}/i,
  /-----begin [a-z0-9 ]*private key-----/i,
] as const;

export function normalizePosSyncRecoveryAuditNote(value: string | undefined) {
  const normalized = (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOTE_LENGTH);

  if (SENSITIVE_NOTE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { kind: "rejected" as const };
  }

  return { kind: "accepted" as const, value: normalized };
}
