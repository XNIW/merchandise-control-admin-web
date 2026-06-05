#!/usr/bin/env bash
set -euo pipefail

bad_dir=""
good_dir=""
out_dir=""

usage() {
  cat <<'EOF'
Usage:
  scripts/win7pos/compare-build-folders.sh --bad <path> --good <path> --out <path>

Compares a broken Codex-local Win7POS package against a working GitHub
Release Pack folder. The script is read-only for --bad and --good and writes:

  build-compare-summary.md
  build-compare-files.csv
  missing-from-codex.md
  extra-in-codex.md
  different-hashes.md
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bad)
      bad_dir="${2:-}"
      shift 2
      ;;
    --good)
      good_dir="${2:-}"
      shift 2
      ;;
    --out)
      out_dir="${2:-}"
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

if [[ -z "${bad_dir}" || -z "${good_dir}" || -z "${out_dir}" ]]; then
  echo "Missing required --bad, --good, or --out." >&2
  usage
  exit 2
fi

if [[ ! -d "${bad_dir}" ]]; then
  echo "Bad/Codex folder not found: ${bad_dir}" >&2
  exit 1
fi

if [[ ! -d "${good_dir}" ]]; then
  echo "Good/GitHub folder not found: ${good_dir}" >&2
  exit 1
fi

mkdir -p "${out_dir}"

bad_dir="$(cd "${bad_dir}" && pwd)"
good_dir="$(cd "${good_dir}" && pwd)"
out_dir="$(cd "${out_dir}" && pwd)"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

stat_size() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

csv_cell() {
  local value="${1:-}"
  value="${value//\"/\"\"}"
  printf '"%s"' "${value}"
}

write_csv_row() {
  local first=1
  for value in "$@"; do
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    csv_cell "${value}"
    first=0
  done
  printf '\n'
}

total_bytes() {
  local dir="$1"
  local total=0
  local size
  while IFS= read -r file; do
    size="$(stat_size "${file}")"
    total=$((total + size))
  done < <(find "${dir}" -type f -print)
  printf '%s' "${total}"
}

relative_files() {
  local dir="$1"
  (cd "${dir}" && find . -type f -print | sed 's#^\./##' | sort)
}

extension_for() {
  local rel="$1"
  local base="${rel##*/}"
  if [[ "${base}" == *.* ]]; then
    printf '%s' "${base##*.}"
  else
    printf ''
  fi
}

tree_listing() {
  local dir="$1"
  (cd "${dir}" && find . -type f -print | sed 's#^\./##' | sort | awk -F/ '{
    indent = ""
    for (i = 1; i < NF; i++) {
      indent = indent "  "
    }
    print indent "- " $0
  }')
}

bad_list="${tmp_dir}/bad-files.txt"
good_list="${tmp_dir}/good-files.txt"
all_list="${tmp_dir}/all-files.txt"
missing_list="${tmp_dir}/missing.txt"
extra_list="${tmp_dir}/extra.txt"
different_list="${tmp_dir}/different.txt"

relative_files "${bad_dir}" > "${bad_list}"
relative_files "${good_dir}" > "${good_list}"
sort -u "${bad_list}" "${good_list}" > "${all_list}"
comm -13 "${bad_list}" "${good_list}" > "${missing_list}"
comm -23 "${bad_list}" "${good_list}" > "${extra_list}"
: > "${different_list}"

csv_path="${out_dir}/build-compare-files.csv"
write_csv_row "relative_path" "extension" "status" "bad_present" "good_present" "bad_size_bytes" "good_size_bytes" "bad_sha256" "good_sha256" > "${csv_path}"

while IFS= read -r rel; do
  [[ -z "${rel}" ]] && continue
  bad_path="${bad_dir}/${rel}"
  good_path="${good_dir}/${rel}"
  bad_present="false"
  good_present="false"
  bad_size=""
  good_size=""
  bad_sha=""
  good_sha=""
  status=""

  if [[ -f "${bad_path}" ]]; then
    bad_present="true"
    bad_size="$(stat_size "${bad_path}")"
    bad_sha="$(sha256_file "${bad_path}")"
  fi

  if [[ -f "${good_path}" ]]; then
    good_present="true"
    good_size="$(stat_size "${good_path}")"
    good_sha="$(sha256_file "${good_path}")"
  fi

  if [[ "${bad_present}" == "false" ]]; then
    status="missing_from_codex"
  elif [[ "${good_present}" == "false" ]]; then
    status="extra_in_codex"
  elif [[ "${bad_sha}" != "${good_sha}" ]]; then
    status="different_hash"
    printf '%s\n' "${rel}" >> "${different_list}"
  else
    status="same"
  fi

  write_csv_row \
    "${rel}" \
    "$(extension_for "${rel}")" \
    "${status}" \
    "${bad_present}" \
    "${good_present}" \
    "${bad_size}" \
    "${good_size}" \
    "${bad_sha}" \
    "${good_sha}" >> "${csv_path}"
done < "${all_list}"

bad_count="$(wc -l < "${bad_list}" | tr -d ' ')"
good_count="$(wc -l < "${good_list}" | tr -d ' ')"
missing_count="$(wc -l < "${missing_list}" | tr -d ' ')"
extra_count="$(wc -l < "${extra_list}" | tr -d ' ')"
different_count="$(wc -l < "${different_list}" 2>/dev/null | tr -d ' ' || true)"
different_count="${different_count:-0}"
bad_bytes="$(total_bytes "${bad_dir}")"
good_bytes="$(total_bytes "${good_dir}")"

has_bad_esqlite="false"
has_good_esqlite="false"
if grep -Eq '(^|/)e_sqlite3\.dll$' "${bad_list}"; then
  has_bad_esqlite="true"
fi
if grep -Eq '(^|/)e_sqlite3\.dll$' "${good_list}"; then
  has_good_esqlite="true"
fi

has_bad_cli="false"
has_good_cli="false"
if grep -Eq '^cli/' "${bad_list}"; then
  has_bad_cli="true"
fi
if grep -Eq '^cli/' "${good_list}"; then
  has_good_cli="true"
fi

has_bad_version="false"
has_good_version="false"
if grep -Eq '^VERSION\.txt$' "${bad_list}"; then
  has_bad_version="true"
fi
if grep -Eq '^VERSION\.txt$' "${good_list}"; then
  has_good_version="true"
fi

summary_path="${out_dir}/build-compare-summary.md"
{
  echo "# Win7POS Build Compare Summary"
  echo
  echo "## Inputs"
  echo
  echo "- Bad/Codex package: \`${bad_dir}\`"
  echo "- Good/GitHub package: \`${good_dir}\`"
  echo "- Output directory: \`${out_dir}\`"
  echo
  echo "## Counts"
  echo
  echo "| Metric | Bad/Codex | Good/GitHub |"
  echo "| --- | ---: | ---: |"
  echo "| Files | ${bad_count} | ${good_count} |"
  echo "| Total bytes | ${bad_bytes} | ${good_bytes} |"
  echo
  echo "## Diff Totals"
  echo
  echo "- Missing from Codex: ${missing_count}"
  echo "- Extra in Codex: ${extra_count}"
  echo "- Same relative path, different SHA-256: ${different_count}"
  echo
  echo "## Key Findings"
  echo
  echo "- \`e_sqlite3.dll\` in Bad/Codex: ${has_bad_esqlite}"
  echo "- \`e_sqlite3.dll\` in Good/GitHub: ${has_good_esqlite}"
  echo "- \`cli/\` payload in Bad/Codex: ${has_bad_cli}"
  echo "- \`cli/\` payload in Good/GitHub: ${has_good_cli}"
  echo "- \`VERSION.txt\` in Bad/Codex: ${has_bad_version}"
  echo "- \`VERSION.txt\` in Good/GitHub: ${has_good_version}"
  echo
  echo "## Key File Rows"
  echo
  echo "Filtered from \`build-compare-files.csv\` for executable, config, app DLLs, SQLite/native/runtime folders, assets, docs, and release metadata."
  echo
  echo "| Relative path | Status | Bad bytes | Good bytes |"
  echo "| --- | --- | ---: | ---: |"
  awk -F, '
    NR > 1 {
      row = $0
      path = $1
      gsub(/^"|"$/, "", path)
      status = $3
      bad = $6
      good = $7
      gsub(/^"|"$/, "", status)
      gsub(/^"|"$/, "", bad)
      gsub(/^"|"$/, "", good)
      if (path ~ /Win7POS\.Wpf\.exe$/ ||
          path ~ /Win7POS\.Wpf\.exe\.config$/ ||
          path ~ /Win7POS\.Core\.dll$/ ||
          path ~ /Win7POS\.Data\.dll$/ ||
          path ~ /Microsoft\.Data\.Sqlite\.dll$/ ||
          path ~ /SQLitePCLRaw/ ||
          path ~ /e_sqlite3\.dll$/ ||
          path ~ /SQLite\.Interop\.dll$/ ||
          path ~ /(^|\/)(x86|x64|runtimes|native)(\/|$)/ ||
          path ~ /^Assets\// ||
          path ~ /README_RUN\.txt$/ ||
          path ~ /RELEASE_CHECKLIST\.txt$/ ||
          path ~ /VERSION\.txt$/ ||
          path ~ /^cli\//) {
        printf "| `%s` | %s | %s | %s |\n", path, status, bad, good
      }
    }
  ' "${csv_path}"
  echo
  echo "## Bad/Codex File Tree"
  echo
  tree_listing "${bad_dir}"
  echo
  echo "## Good/GitHub File Tree"
  echo
  tree_listing "${good_dir}"
} > "${summary_path}"

missing_path="${out_dir}/missing-from-codex.md"
{
  echo "# Missing From Codex"
  echo
  echo "| Relative path | Good bytes | Good SHA-256 |"
  echo "| --- | ---: | --- |"
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    good_path="${good_dir}/${rel}"
    echo "| \`${rel}\` | $(stat_size "${good_path}") | \`$(sha256_file "${good_path}")\` |"
  done < "${missing_list}"
} > "${missing_path}"

extra_path="${out_dir}/extra-in-codex.md"
{
  echo "# Extra In Codex"
  echo
  echo "| Relative path | Bad bytes | Bad SHA-256 |"
  echo "| --- | ---: | --- |"
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    bad_path="${bad_dir}/${rel}"
    echo "| \`${rel}\` | $(stat_size "${bad_path}") | \`$(sha256_file "${bad_path}")\` |"
  done < "${extra_list}"
} > "${extra_path}"

different_path="${out_dir}/different-hashes.md"
{
  echo "# Different Hashes"
  echo
  echo "| Relative path | Bad bytes | Good bytes | Bad SHA-256 | Good SHA-256 |"
  echo "| --- | ---: | ---: | --- | --- |"
  while IFS= read -r rel; do
    [[ -z "${rel}" ]] && continue
    bad_path="${bad_dir}/${rel}"
    good_path="${good_dir}/${rel}"
    echo "| \`${rel}\` | $(stat_size "${bad_path}") | $(stat_size "${good_path}") | \`$(sha256_file "${bad_path}")\` | \`$(sha256_file "${good_path}")\` |"
  done < "${different_list}"
} > "${different_path}"

echo "Wrote compare reports to: ${out_dir}"
