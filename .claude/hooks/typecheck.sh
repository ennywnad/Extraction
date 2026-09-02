#!/usr/bin/env bash
# PostToolUse(Write|Edit): typecheck after an edit to app source, so a type error
# surfaces at the edit rather than at the next manual `npm run check`.
set -uo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
path="$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')"

case "$path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

case "$path" in
  "$root"/src/*|"$root"/server/*|"$root"/server.ts|"$root"/test/*) ;;
  *) exit 0 ;;
esac

if ! out="$(cd "$root" && npm run --silent lint 2>&1)"; then
  printf 'tsc --noEmit failed after editing %s:\n\n%s\n' "$path" "$out" >&2
  exit 2
fi
exit 0
