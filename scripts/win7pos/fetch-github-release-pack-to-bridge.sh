#!/usr/bin/env bash
set -euo pipefail

repo="XNIW/Win7POS"
workflow="Release Pack"
branch="main"
preferred_artifact="Win7POS-ReleasePack-x86"
run_id=""
bridge_root=""

usage() {
  cat <<'EOF'
Usage:
  scripts/win7pos/fetch-github-release-pack-to-bridge.sh [options]

Options:
  --repo <owner/name>          GitHub repo. Default: XNIW/Win7POS
  --workflow <name>           Workflow name. Default: Release Pack
  --branch <name>             Branch. Default: main
  --artifact <name>           Preferred artifact. Default: Win7POS-ReleasePack-x86
  --run-id <id>               Use a specific run instead of latest green run
  --bridge <path>             Win7POSBridge root. Default: sibling ../Win7POSBridge

The script requires an authenticated GitHub CLI (`gh auth status`), downloads
the official Release Pack artifact, extracts the app into:

  <bridge>/outbox/TASK-042B-github-release-pack-<timestamp>/

It does not use tokens directly, does not print secrets, and fails clearly when
the GitHub CLI session is not authenticated.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo="${2:-}"
      shift 2
      ;;
    --workflow)
      workflow="${2:-}"
      shift 2
      ;;
    --branch)
      branch="${2:-}"
      shift 2
      ;;
    --artifact)
      preferred_artifact="${2:-}"
      shift 2
      ;;
    --run-id)
      run_id="${2:-}"
      shift 2
      ;;
    --bridge)
      bridge_root="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

if [[ -z "${bridge_root}" ]]; then
  bridge_root="${WIN7POS_BRIDGE_ROOT:-$(cd "${repo_root}/.." && pwd)/Win7POSBridge}"
fi

if [[ "${bridge_root}" != /* ]]; then
  bridge_root="$(cd "${repo_root}" && mkdir -p "${bridge_root}" && cd "${bridge_root}" && pwd)"
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

json_escape() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "${value}"
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

require_command gh
require_command unzip

if ! gh auth status >/dev/null 2>&1; then
  cat >&2 <<'EOF'
GitHub CLI is not authenticated.

Run:
  gh auth login

Required scope: repo access sufficient to read GitHub Actions artifacts.
EOF
  exit 1
fi

if [[ -z "${run_id}" ]]; then
  run_id="$(
    gh run list \
      --repo "${repo}" \
      --workflow "${workflow}" \
      --branch "${branch}" \
      --status success \
      --limit 1 \
      --json databaseId \
      --jq '.[0].databaseId'
  )"
fi

if [[ -z "${run_id}" || "${run_id}" == "null" ]]; then
  echo "No successful run found for ${repo}, workflow '${workflow}', branch '${branch}'." >&2
  exit 1
fi

run_json="$(
  gh run view "${run_id}" \
    --repo "${repo}" \
    --json databaseId,workflowName,displayTitle,headSha,headBranch,conclusion,status,createdAt,startedAt,updatedAt,url
)"

run_status="$(printf '%s' "${run_json}" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
run_conclusion="$(printf '%s' "${run_json}" | sed -n 's/.*"conclusion":"\([^"]*\)".*/\1/p')"
if [[ "${run_status}" != "completed" || "${run_conclusion}" != "success" ]]; then
  echo "Selected run is not completed/success: status=${run_status}, conclusion=${run_conclusion}, run=${run_id}" >&2
  exit 1
fi

artifact_names="$(
  gh api "repos/${repo}/actions/runs/${run_id}/artifacts" \
    --jq '.artifacts[] | select(.expired == false) | .name'
)"

artifact_name=""
if printf '%s\n' "${artifact_names}" | grep -Fxq "${preferred_artifact}"; then
  artifact_name="${preferred_artifact}"
else
  artifact_name="$(printf '%s\n' "${artifact_names}" | grep -Ei 'release.*pack|releasepack' | head -n 1 || true)"
fi

if [[ -z "${artifact_name}" ]]; then
  cat >&2 <<EOF
No non-expired release pack artifact found for run ${run_id}.

Available non-expired artifacts:
${artifact_names}
EOF
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
package_name="TASK-042B-github-release-pack-${timestamp}"
package_dir="${bridge_root}/outbox/${package_name}"
download_dir="${package_dir}/artifact-download"
app_dir="${package_dir}/app"
checksums_dir="${package_dir}/checksums"
docs_dir="${package_dir}/docs"
diagnostics_source="${bridge_root}/outbox/TASK-042-build-compare-diagnostics"

mkdir -p "${download_dir}" "${app_dir}" "${checksums_dir}" "${docs_dir}" "${bridge_root}/logs" "${bridge_root}/screenshots" "${bridge_root}/inbox"

echo "Downloading artifact '${artifact_name}' from ${repo} run ${run_id}..."
gh run download "${run_id}" --repo "${repo}" --name "${artifact_name}" --dir "${download_dir}"

release_zip="$(find "${download_dir}" -type f -name 'Win7POS_*.zip' | sort | tail -n 1 || true)"
extract_root="${package_dir}/_extracted"
mkdir -p "${extract_root}"

if [[ -n "${release_zip}" ]]; then
  unzip -q "${release_zip}" -d "${extract_root}"
else
  cp -R "${download_dir}/." "${extract_root}/"
fi

exe_path="$(find "${extract_root}" -type f -name 'Win7POS.Wpf.exe' | sort | head -n 1 || true)"
if [[ -z "${exe_path}" ]]; then
  echo "Downloaded artifact does not contain Win7POS.Wpf.exe." >&2
  exit 1
fi

exe_dir="$(cd "$(dirname "${exe_path}")" && pwd)"
if command -v rsync >/dev/null 2>&1; then
  rsync -a "${exe_dir}/" "${app_dir}/"
else
  cp -R "${exe_dir}/." "${app_dir}/"
fi
rm -rf "${extract_root}"

if [[ ! -f "${app_dir}/e_sqlite3.dll" ]]; then
  echo "Release pack extraction is missing e_sqlite3.dll; refusing incomplete artifact." >&2
  exit 1
fi

if [[ ! -f "${app_dir}/VERSION.txt" ]]; then
  echo "Release pack extraction is missing VERSION.txt; refusing incomplete artifact." >&2
  exit 1
fi

app_file_count="$(find "${app_dir}" -type f | wc -l | tr -d ' ')"
app_total_bytes="$(
  total=0
  while IFS= read -r file; do
    size="$(stat -f '%z' "${file}" 2>/dev/null || stat -c '%s' "${file}")"
    total=$((total + size))
  done < <(find "${app_dir}" -type f -print)
  printf '%s' "${total}"
)"

{
  while IFS= read -r file; do
    rel="${file#${app_dir}/}"
    printf '%s  app/%s\n' "$(sha256_file "${file}")" "${rel}"
  done < <(find "${app_dir}" -type f -print | sort)
} > "${checksums_dir}/SHA256SUMS.txt"

find "${app_dir}" -type f -print | sed "s#^${app_dir}/##" | sort > "${checksums_dir}/APP-FILES.txt"

source_info_path="${docs_dir}/SOURCE-INFO.md"
{
  echo "# TASK-042B GitHub Release Pack Source"
  echo
  echo "- Repo: \`${repo}\`"
  echo "- Workflow: \`${workflow}\`"
  echo "- Branch: \`${branch}\`"
  echo "- Run id: \`${run_id}\`"
  echo "- Artifact: \`${artifact_name}\`"
  echo "- Package: \`${package_dir}\`"
  echo
  echo "## Run JSON"
  echo
  echo '```json'
  printf '%s\n' "${run_json}"
  echo '```'
  echo
  echo "## Artifact List"
  echo
  printf '%s\n' "${artifact_names}" | sed 's/^/- /'
} > "${source_info_path}"

runbook_path="${docs_dir}/RUNBOOK-WIN7POS-GITHUB-RELEASE-PACK.md"
{
  echo "# TASK-042B Windows 7 Runbook"
  echo
  echo "1. Copy the whole folder \`${package_name}\` from the bridge outbox to local disk on Windows 7."
  echo "2. Do not run the app directly from a shared/network folder."
  echo "3. Open \`app\`."
  echo "4. Launch \`Win7POS.Wpf.exe\`."
  echo "5. If the UI does not appear, run diagnostics from \`diagnostics\` or from \`Win7POSBridge/outbox/TASK-042-build-compare-diagnostics\`."
  echo "6. Save results under \`Win7POSBridge/inbox\`, logs under \`Win7POSBridge/logs/TASK-042-build-compare\`, and screenshots under \`Win7POSBridge/screenshots\`."
  echo
  echo "This package comes from the official GitHub Actions Release Pack artifact, not from a local raw \`dotnet build\` output."
} > "${runbook_path}"

diff_note_path="${docs_dir}/DIFFERENCES-FROM-BROKEN-CODEX-PACK.md"
{
  echo "# Differences From Broken Codex Pack"
  echo
  echo "- This package is sourced from GitHub Actions workflow \`${workflow}\`, run \`${run_id}\`."
  echo "- It includes \`e_sqlite3.dll\`, which the broken Codex-local package missed."
  echo "- It includes release metadata \`VERSION.txt\`, \`README_RUN.txt\`, and \`RELEASE_CHECKLIST.txt\`."
  echo "- It includes the optional \`cli/\` payload and native runtime payload produced by the official workflow."
  echo "- See Admin Web evidence folder \`docs/TASKS/EVIDENCE/TASK-042/TASK-042B-build-compare\` for the full file/hash comparison."
} > "${diff_note_path}"

if [[ -d "${diagnostics_source}" ]]; then
  mkdir -p "${package_dir}/diagnostics"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "${diagnostics_source}/" "${package_dir}/diagnostics/"
  else
    cp -R "${diagnostics_source}/." "${package_dir}/diagnostics/"
  fi
fi

manifest_path="${package_dir}/manifest.json"
{
  echo "{"
  echo "  \"task\": \"TASK-042B\","
  echo "  \"packageType\": \"GitHub Release Pack bridge package\","
  echo "  \"createdAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"repo\": \"$(json_escape "${repo}")\","
  echo "  \"workflow\": \"$(json_escape "${workflow}")\","
  echo "  \"branch\": \"$(json_escape "${branch}")\","
  echo "  \"runId\": \"$(json_escape "${run_id}")\","
  echo "  \"artifact\": \"$(json_escape "${artifact_name}")\","
  echo "  \"packagePath\": \"$(json_escape "${package_dir}")\","
  echo "  \"appPath\": \"$(json_escape "${app_dir}")\","
  echo "  \"fileCount\": ${app_file_count},"
  echo "  \"totalBytes\": ${app_total_bytes},"
  echo "  \"containsESqlite3Dll\": true,"
  echo "  \"containsSecrets\": false,"
  echo "  \"win7LiveE2EStatus\": \"NOT_RUN_MANUAL_WIN7_PENDING\","
  echo "  \"salesSyncLiveStatus\": \"NOT_RUN_WIN7_MANUAL_PENDING\""
  echo "}"
} > "${manifest_path}"

echo "Package ready: ${package_dir}"
echo "App folder: ${app_dir}"
echo "File count: ${app_file_count}"
echo "Manifest: ${manifest_path}"
echo "Checksums: ${checksums_dir}/SHA256SUMS.txt"
