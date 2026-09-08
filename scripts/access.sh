#!/usr/bin/env bash
#
# Who can reach the deployed Extraction instance.
#
#   ./scripts/access.sh list                        # everyone who can get in, and how
#   ./scripts/access.sh check dan@example.com       # can this person get in, right now?
#   ./scripts/access.sh grant dan@example.com       # let them in
#   ./scripts/access.sh grant group:workshop@acme.com --until 2026-10-01
#   ./scripts/access.sh revoke dan@example.com      # lock them out
#
# Access to this app is entirely a GCP concern: the server trusts that IAP has already
# authorised whoever reaches it (server/iapAuth.ts) and the engagement roster is auto-join,
# so there is no allowlist inside the app to keep in step. One IAM binding is the whole
# surface: roles/iap.httpsResourceAccessor on the Cloud Run service's IAP resource.
#
# `check` reads more than that one binding, because three other things can decide the answer
# and none of them are visible from it. See the comment on check_access().
#
# Flags:
#   --dry-run     print the mutating gcloud commands instead of running them (reads still run)
#   --until DATE  grant only: YYYY-MM-DD, after which the binding stops applying
#   --i-mean-it   grant only: required for allUsers / allAuthenticatedUsers

usage() {
  sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Before config.sh, which requires PROJECT — asking this script how to use it should not
# require a configured project.
for arg in "$@"; do
  case "${arg}" in -h | --help | help) usage 0 ;; esac
done

source "$(dirname "$0")/config.sh"

ROLE="roles/iap.httpsResourceAccessor"
IAP_FLAGS=(--resource-type=cloud-run --service="${SERVICE}" --region="${REGION}")

DRY_RUN=""
UNTIL=""
I_MEAN_IT=""

fatal() {
  echo "FATAL: $*" >&2
  exit 1
}

# --- Argument parsing ------------------------------------------------------------------------

COMMAND=""
PRINCIPAL_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --i-mean-it) I_MEAN_IT=1 ;;
    --until)
      UNTIL="${2:-}"
      shift
      ;;
    --until=*) UNTIL="${1#*=}" ;;
    -h | --help) usage 0 ;;
    -*) fatal "unknown flag '$1'. Run with --help." ;;
    *)
      if [[ -z "${COMMAND}" ]]; then
        COMMAND="$1"
      elif [[ -z "${PRINCIPAL_ARG}" ]]; then
        PRINCIPAL_ARG="$1"
      else
        fatal "unexpected argument '$1'. One principal at a time."
      fi
      ;;
  esac
  shift
done

[[ -n "${COMMAND}" ]] || usage 1

if [[ -n "${UNTIL}" && ! "${UNTIL}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  fatal "--until takes a date as YYYY-MM-DD, got '${UNTIL}'"
fi

# --- Principals ------------------------------------------------------------------------------

# IAM stores what you give it, so `user:` on a group address is a binding that grants nobody
# and reads as if it worked. Normalise here and always print the form used.
normalize_principal() {
  local raw="$1" prefix rest
  case "${raw}" in
    allUsers | allAuthenticatedUsers)
      printf '%s' "${raw}"
      return
      ;;
    user:* | group:* | serviceAccount:* | domain:*)
      prefix="${raw%%:*}"
      rest="${raw#*:}"
      ;;
    *)
      prefix="user"
      rest="${raw}"
      ;;
  esac
  printf '%s:%s' "${prefix}" "$(printf '%s' "${rest}" | tr '[:upper:]' '[:lower:]')"
}

principal_email() { printf '%s' "${1#*:}"; }
principal_type() { printf '%s' "${1%%:*}"; }

require_principal() {
  [[ -n "${PRINCIPAL_ARG}" ]] || fatal "$1 needs a principal: an email, or group:name@domain."
  PRINCIPAL="$(normalize_principal "${PRINCIPAL_ARG}")"
  case "${PRINCIPAL}" in
    allUsers | allAuthenticatedUsers) return ;;
    domain:*) return ;;
  esac
  [[ "$(principal_email "${PRINCIPAL}")" == *@*.* ]] ||
    fatal "'${PRINCIPAL_ARG}' does not look like an email address."
}

# --- Reads -----------------------------------------------------------------------------------
#
# Every read is a plain assignment so that `set -e` aborts on a failed gcloud call. Piping one
# into a loop instead would swallow the failure and report an empty policy, which for `check`
# means confidently telling you someone has no access when the truth is you could not look.

PROJECT_NUMBER=""
resolve_project_number() {
  [[ -z "${PROJECT_NUMBER}" ]] || return 0
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)' 2>/dev/null || true)"
  [[ "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]] || PROJECT_NUMBER=""
}

# role|member|condition title|condition expression|condition description
read_iap_policy() {
  gcloud iap web get-iam-policy "${IAP_FLAGS[@]}" \
    --flatten='bindings[].members[]' \
    --format='value[separator="|"](bindings.role, bindings.members, bindings.condition.title, bindings.condition.expression, bindings.condition.description)'
}

# member|condition title — project-level bindings of the accessor role, which cover every IAP
# resource in the project and are invisible from the service's own policy.
read_project_accessors() {
  gcloud projects get-iam-policy "${PROJECT}" \
    --flatten='bindings[].members[]' \
    --filter="bindings.role=${ROLE}" \
    --format='value[separator="|"](bindings.members, bindings.condition.title)'
}

read_run_invokers() {
  gcloud run services get-iam-policy "${SERVICE}" --region="${REGION}" \
    --flatten='bindings[].members[]' \
    --filter='bindings.role=roles/run.invoker' \
    --format='value(bindings.members)' 2>/dev/null || true
}

service_url() {
  gcloud run services describe "${SERVICE}" --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || true
}

# --- Conditions ------------------------------------------------------------------------------
#
# Passed as a file rather than --condition=KEY=VALUE,... because that flag splits on commas and
# a CEL expression may contain one. A conditioned binding also will not come off without an
# exact match, so revoke replays the condition it read back out of the policy.
CONDITION_FILE=""
cleanup() { [[ -z "${CONDITION_FILE}" ]] || rm -f "${CONDITION_FILE}"; }
trap cleanup EXIT

yaml_quote() { printf "'%s'" "${1//\'/\'\'}"; }

write_condition_file() {
  local title="$1" expression="$2" description="$3"
  CONDITION_FILE="$(mktemp "${TMPDIR:-/tmp}/extraction-condition.XXXXXX")"
  {
    echo "title: $(yaml_quote "${title}")"
    echo "expression: $(yaml_quote "${expression}")"
    [[ -z "${description}" ]] || echo "description: $(yaml_quote "${description}")"
  } >"${CONDITION_FILE}"
  printf '%s' "${CONDITION_FILE}"
}

# --- Mutations -------------------------------------------------------------------------------

run_mutation() {
  if [[ -n "${DRY_RUN}" ]]; then
    echo "    would run: $*"
    return 0
  fi
  "$@" >/dev/null
}

# --- Access resolution -----------------------------------------------------------------------
#
# Four things decide whether someone gets in, and the obvious one is the only one visible from
# the service's IAP policy:
#
#   1. A binding on this service's IAP resource         — the thing grant/revoke write.
#   2. A project-level binding of the same role         — covers every IAP resource here.
#   3. Membership of a group or domain that holds 1 or 2.
#   4. The IAP service agent holding run.invoker on the service. Without it *everyone* gets a
#      403 no matter what is granted, and nothing else in this repo would tell you.
#
# There is a fifth, off in the console rather than in IAM: while the OAuth consent screen is
# External and in Testing, only listed test users can complete sign-in at all. That one
# presents as a Google sign-in refusal rather than a 403, so this script names it and cannot
# check it.
#
# Answers are 0 = yes, 1 = no, 2 = could not determine. The third state is the point: an
# unresolvable group is not the same answer as an absent binding.
VERDICT=1

check_access() {
  local principal="$1" email type
  email="$(principal_email "${principal}")"
  type="$(principal_type "${principal}")"

  local iap_policy project_accessors
  iap_policy="$(read_iap_policy)"
  project_accessors="$(read_project_accessors)"

  local groups=() open_binding="" found=""

  local role member ctitle cexpr cdesc
  while IFS='|' read -r role member ctitle cexpr cdesc; do
    [[ -n "${member}" ]] || continue
    [[ "${role}" == "${ROLE}" ]] || continue
    case "${member}" in
      allUsers | allAuthenticatedUsers) open_binding="${member}" ;;
      group:*) groups+=("${member#group:}") ;;
    esac
    if [[ "${member}" == "${principal}" ]]; then
      found="yes"
      if [[ -n "${ctitle}${cexpr}" ]]; then
        echo "    granted on ${SERVICE}, conditionally — ${ctitle:-untitled}: ${cexpr}"
      else
        echo "    granted on ${SERVICE}"
      fi
    fi
    if [[ "${type}" == "user" && "${member}" == domain:* && "${email}" == *"@${member#domain:}" ]]; then
      found="yes"
      echo "    granted on ${SERVICE} via ${member}"
    fi
  done <<<"${iap_policy}"

  local pmember pcondition
  while IFS='|' read -r pmember pcondition; do
    [[ -n "${pmember}" ]] || continue
    case "${pmember}" in
      allUsers | allAuthenticatedUsers) open_binding="${pmember}" ;;
      group:*) groups+=("${pmember#group:}") ;;
    esac
    if [[ "${pmember}" == "${principal}" ]]; then
      found="yes"
      echo "    granted project-wide${pcondition:+, conditionally — ${pcondition}} (covers every IAP resource in ${PROJECT})"
    fi
    if [[ "${type}" == "user" && "${pmember}" == domain:* && "${email}" == *"@${pmember#domain:}" ]]; then
      found="yes"
      echo "    granted project-wide via ${pmember}"
    fi
  done <<<"${project_accessors}"

  if [[ -n "${open_binding}" ]]; then
    echo "    !! ${open_binding} holds ${ROLE}. Everyone gets in; this check is moot." >&2
    found="yes"
  fi

  if [[ -n "${found}" ]]; then
    VERDICT=0
    return
  fi

  # No direct binding. The answer now lives in group membership, which is only resolvable for
  # Cloud Identity / Workspace groups — a plain groups.google.com group is not readable here.
  local undetermined=""
  local group answer
  for group in "${groups[@]:-}"; do
    [[ -n "${group}" ]] || continue
    answer="$(gcloud identity groups memberships check-transitive-membership \
      --group-email="${group}" --member-email="${email}" \
      --format='value(hasMembership)' 2>/dev/null || true)"
    case "${answer}" in
      True | true)
        echo "    granted via group ${group}"
        VERDICT=0
        return
        ;;
      False | false) echo "    not a member of ${group}" ;;
      *)
        echo "    ? could not read the membership of ${group} — check it directly:"
        echo "      https://groups.google.com/a/${group#*@}/g/${group%@*}/members"
        undetermined="yes"
        ;;
    esac
  done

  if [[ -n "${undetermined}" ]]; then
    VERDICT=2
  else
    VERDICT=1
  fi
}

report_invoker() {
  resolve_project_number
  if [[ -z "${PROJECT_NUMBER}" ]]; then
    echo "    ? could not resolve the project number, so the IAP service agent's run.invoker" >&2
    echo "      binding was not checked. Without it every request 403s regardless of grants." >&2
    return
  fi
  local agent invokers
  agent="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com"
  invokers="$(read_run_invokers)"
  if grep -qxF "${agent}" <<<"${invokers}"; then
    echo "    IAP service agent holds run.invoker on ${SERVICE}"
  else
    echo "    !! The IAP service agent does NOT hold run.invoker on ${SERVICE}." >&2
    echo "       Everyone is locked out regardless of the grants above. Re-run deploy.sh, or:" >&2
    echo "       gcloud run services add-iam-policy-binding ${SERVICE} --region=${REGION} \\" >&2
    echo "         --member='${agent}' --role=roles/run.invoker" >&2
  fi
}

consent_screen_note() {
  cat <<'NOTE'
    While the OAuth consent screen is External and in "Testing", only accounts listed there as
    test users can sign in at all — an IAM grant alone is not enough, and the failure looks
    like a Google sign-in refusal rather than a 403. Add them there too, or publish the screen:
      https://console.cloud.google.com/auth/audience
NOTE
}

# --- Commands --------------------------------------------------------------------------------

cmd_list() {
  echo "==> ${SERVICE} in ${REGION} (${PROJECT})"
  local url
  url="$(service_url)"
  [[ -z "${url}" ]] || echo "    ${url}"

  echo "==> Bindings on this service's IAP resource"
  local iap_policy role member ctitle cexpr cdesc any=""
  iap_policy="$(read_iap_policy)"
  while IFS='|' read -r role member ctitle cexpr cdesc; do
    [[ -n "${member}" ]] || continue
    any="yes"
    if [[ -n "${ctitle}${cexpr}" ]]; then
      echo "    ${member}  ${role}  [${ctitle:-untitled}: ${cexpr}]"
    else
      echo "    ${member}  ${role}"
    fi
  done <<<"${iap_policy}"
  [[ -n "${any}" ]] || echo "    (none — nobody can reach it)"

  echo "==> Project-wide holders of ${ROLE}"
  echo "    These cover every IAP resource in ${PROJECT}, not just this service."
  local project_accessors pmember pcondition
  any=""
  project_accessors="$(read_project_accessors)"
  while IFS='|' read -r pmember pcondition; do
    [[ -n "${pmember}" ]] || continue
    any="yes"
    echo "    ${pmember}${pcondition:+  [${pcondition}]}"
  done <<<"${project_accessors}"
  [[ -n "${any}" ]] || echo "    (none)"

  echo "==> Preconditions"
  report_invoker
  consent_screen_note
}

cmd_check() {
  require_principal check
  echo "==> Can ${PRINCIPAL} reach ${SERVICE} in ${REGION}?"
  check_access "${PRINCIPAL}"
  case "${VERDICT}" in
    0) echo "==> YES" ;;
    1) echo "==> NO — no binding, direct or inherited, grants it" ;;
    2) echo "==> UNDETERMINED — a group holding the role could not be read (see above)" ;;
  esac
  echo "==> Preconditions"
  report_invoker
  [[ "${VERDICT}" == "1" ]] || consent_screen_note
  exit "${VERDICT}"
}

cmd_grant() {
  require_principal grant
  case "${PRINCIPAL}" in
    allUsers | allAuthenticatedUsers)
      if [[ -z "${I_MEAN_IT}" ]]; then
        fatal "${PRINCIPAL} would open the shared pile to anyone with a Google account.
       Everything anyone has extracted becomes readable by strangers, and there is no
       undo for what gets read. Re-run with --i-mean-it if that is genuinely the intent."
      fi
      echo "!! Granting ${PRINCIPAL}. This is a public deployment from now on." >&2
      ;;
  esac

  echo "==> Granting ${ROLE} to ${PRINCIPAL} on ${SERVICE} (${REGION})"
  [[ "${PRINCIPAL_ARG}" == "${PRINCIPAL}" ]] ||
    echo "    read '${PRINCIPAL_ARG}' as ${PRINCIPAL}"

  local iap_policy role member ctitle cexpr cdesc
  iap_policy="$(read_iap_policy)"
  while IFS='|' read -r role member ctitle cexpr cdesc; do
    [[ "${role}" == "${ROLE}" && "${member}" == "${PRINCIPAL}" ]] || continue
    if [[ -z "${ctitle}${cexpr}" && -z "${UNTIL}" ]]; then
      echo "    already granted, leaving alone"
      grant_epilogue
      return
    fi
    echo "    note: an existing binding for ${PRINCIPAL} carries a condition [${ctitle:-untitled}: ${cexpr}]"
  done <<<"${iap_policy}"

  local args=(gcloud iap web add-iam-policy-binding "${IAP_FLAGS[@]}"
    --member="${PRINCIPAL}" --role="${ROLE}")
  if [[ -n "${UNTIL}" ]]; then
    local file
    file="$(write_condition_file \
      "extraction_until_${UNTIL//-/_}" \
      "request.time < timestamp(\"${UNTIL}T00:00:00Z\")" \
      "Extraction access expires ${UNTIL}")"
    args+=(--condition-from-file="${file}")
    echo "    expires ${UNTIL} (the binding stops applying; nothing is cleaned up)"
  else
    args+=(--condition=None)
  fi
  run_mutation "${args[@]}"
  echo "    done"
  grant_epilogue
}

grant_epilogue() {
  local url
  url="$(service_url)"
  echo "==> Preconditions"
  report_invoker
  consent_screen_note
  case "${PRINCIPAL}" in
    user:*) ;;
    *)
      echo "==> IAM changes are not instant. Re-run 'check' in a minute to confirm."
      return
      ;;
  esac
  local email
  email="$(principal_email "${PRINCIPAL}")"
  cat <<INVITE

==> Something to send them (IAM changes take a minute or two to take effect):

  ${url:-<the service URL>}

  Sign in with ${email} — access is granted to that address exactly. If your browser is
  signed into more than one Google account, use the account chooser or an incognito window;
  the wrong account is the most common reason this fails.

  A "you don't have access" 403 means the wrong account or a grant that has not propagated
  yet. A Google sign-in refusal is a different thing — tell me and I'll add you.

  Anything you add is attributed to your email address and is visible to everyone else in the
  engagement. It is a shared pile, not a private notebook.
INVITE
}

cmd_revoke() {
  require_principal revoke
  echo "==> Revoking ${ROLE} from ${PRINCIPAL} on ${SERVICE} (${REGION})"

  local iap_policy role member ctitle cexpr cdesc removed=""
  iap_policy="$(read_iap_policy)"
  while IFS='|' read -r role member ctitle cexpr cdesc; do
    [[ "${role}" == "${ROLE}" && "${member}" == "${PRINCIPAL}" ]] || continue
    local args=(gcloud iap web remove-iam-policy-binding "${IAP_FLAGS[@]}"
      --member="${PRINCIPAL}" --role="${ROLE}")
    if [[ -n "${ctitle}${cexpr}" ]]; then
      local file
      file="$(write_condition_file "${ctitle}" "${cexpr}" "${cdesc}")"
      args+=(--condition-from-file="${file}")
      echo "    removing the conditional binding [${ctitle:-untitled}: ${cexpr}]"
    else
      args+=(--condition=None)
      echo "    removing the binding"
    fi
    run_mutation "${args[@]}"
    removed="yes"
  done <<<"${iap_policy}"

  [[ -n "${removed}" ]] || echo "    no binding on this service to remove"

  # Everything below is access this script deliberately will not take away by itself.
  local project_accessors pmember pcondition
  project_accessors="$(read_project_accessors)"
  while IFS='|' read -r pmember pcondition; do
    [[ "${pmember}" == "${PRINCIPAL}" ]] || continue
    echo "    !! ${PRINCIPAL} also holds ${ROLE} at the project level, so they can still get in." >&2
    echo "       That binding covers every IAP resource in ${PROJECT}, so removing it is not" >&2
    echo "       this script's call. If you want it gone:" >&2
    echo "       gcloud projects remove-iam-policy-binding ${PROJECT} \\" >&2
    echo "         --member='${PRINCIPAL}' --role='${ROLE}'" >&2
  done <<<"${project_accessors}"

  local group_note=""
  while IFS='|' read -r role member ctitle cexpr cdesc; do
    [[ "${role}" == "${ROLE}" ]] || continue
    case "${member}" in
      group:* | domain:*) group_note+="       ${member}
" ;;
    esac
  done <<<"${iap_policy}"
  if [[ -n "${group_note}" ]]; then
    echo "    Access is also granted through:"
    printf '%s' "${group_note}"
    echo "    If they are in one of those, removing them there is the directory's job, not this"
    echo "    script's. Run 'check ${PRINCIPAL_ARG}' to see where they still stand."
  fi

  cat <<'AFTER'
==> What this does not do
    Their fragments stay in the pile, attributed to them, and their roster entry remains —
    the app has no notion of removing a participant. Nothing here deletes anything.
AFTER
}

case "${COMMAND}" in
  list) cmd_list ;;
  check) cmd_check ;;
  grant) cmd_grant ;;
  revoke) cmd_revoke ;;
  help) usage 0 ;;
  *) fatal "unknown command '${COMMAND}'. One of: list, check, grant, revoke." ;;
esac
