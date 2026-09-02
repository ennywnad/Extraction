#!/usr/bin/env bash
# PreToolUse(Write|Edit): .env holds real credentials and is gitignored.
# .env.example is the documented template and stays editable.
set -uo pipefail

path="$(jq -r '.tool_input.file_path // empty')"
base="${path##*/}"

case "$base" in
  .env.example) exit 0 ;;
  .env|.env.*)
    jq -nc --arg p "$path" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("Refusing to write \($p). This file holds real credentials and is gitignored. Add or document the variable in .env.example and let a human set the real value.")
      }
    }'
    ;;
esac
exit 0
