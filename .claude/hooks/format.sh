#!/usr/bin/env bash
# PostToolUse(Write|Edit): format the file that was just edited, so formatting
# never lands in a diff as noise. --ignore-unknown skips file types Prettier
# does not handle; .prettierignore still applies, so provenance files under
# planv1/ are left alone.
set -uo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
path="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"

[ -n "$path" ] || exit 0
case "$path" in
  "$root"/*) ;;
  *) exit 0 ;;
esac

(cd "$root" && ./node_modules/.bin/prettier --write --ignore-unknown "$path") >/dev/null 2>&1
exit 0
