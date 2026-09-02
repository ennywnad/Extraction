#!/usr/bin/env bash
# PreToolUse(Bash): scripts/deploy.sh and `gcloud run deploy` push straight to
# production Cloud Run. This is the release-authorization gate — a human confirms.
set -uo pipefail

cmd="$(jq -r '.tool_input.command // empty')"

if printf '%s' "$cmd" | grep -Eq 'scripts/deploy\.sh|gcloud[[:space:]]+run[[:space:]]+(deploy|services[[:space:]]+update)|gcloud[[:space:]]+run[[:space:]]+services[[:space:]]+delete'; then
  jq -nc '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "This deploys to production Cloud Run (see DEPLOYMENT.md). Confirm you intend to release now; the rollback path is `gcloud run services update-traffic --to-revisions=PREVIOUS=100`."
    }
  }'
fi
exit 0
