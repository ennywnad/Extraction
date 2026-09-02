#!/usr/bin/env bash
# Stop: typecheck the project once the turn is finished, so a type error surfaces
# before the work is called done — rather than after every individual edit, which
# paid for a full-project tsc on each one.
# Exit 2 blocks the stop and hands the compiler output back to Claude to fix.
set -uo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"

# Already continuing from an earlier block by this hook. Let the stop through, so
# an error Claude cannot fix does not bounce forever.
if [ "$(jq -r '.stop_hook_active // false')" = "true" ]; then
  exit 0
fi

if ! out="$(cd "$root" && npm run --silent lint 2>&1)"; then
  printf 'tsc --noEmit failed:\n\n%s\n' "$out" >&2
  exit 2
fi
exit 0
