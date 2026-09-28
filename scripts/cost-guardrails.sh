#!/usr/bin/env bash
#
# Billing and usage guardrails for the Extraction deployment.
#
# Creates: one budget with threshold alerts, an email notification channel, and three
# Cloud Monitoring alert policies on the metrics that can actually run away (Vertex AI
# tokens, Firestore reads, Cloud Run requests). Idempotent — re-running updates nothing
# it already made, it just skips.
#
#   export PROJECT=your-project-id ALERT_EMAIL=you@example.com
#   export MONTHLY_BUDGET=25          # USD, optional, default 25
#   ./scripts/cost-guardrails.sh
#
# A BUDGET DOES NOT CAP SPEND. It emails you. The only hard stop is a quota limit; see the
# note this script prints at the end.

source "$(dirname "$0")/config.sh"

: "${ALERT_EMAIL:?set ALERT_EMAIL=you@example.com}"
MONTHLY_BUDGET="${MONTHLY_BUDGET:-25}"

gcloud config set project "${PROJECT}" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"

echo "==> Enabling the APIs the guardrails need"
gcloud services enable monitoring.googleapis.com billingbudgets.googleapis.com >/dev/null

echo "==> Email notification channel for ${ALERT_EMAIL}"
CHANNEL="$(gcloud beta monitoring channels list \
  --filter="labels.email_address='${ALERT_EMAIL}' AND type='email'" \
  --format='value(name)' | head -1)"
if [[ -z "${CHANNEL}" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create \
    --display-name="Extraction cost alerts" \
    --type=email --channel-labels="email_address=${ALERT_EMAIL}" \
    --format='value(name)')"
  echo "    created ${CHANNEL}"
else
  echo "    reusing ${CHANNEL}"
fi

echo "==> Budget: \$${MONTHLY_BUDGET}/month on ${PROJECT}"
BILLING_ACCOUNT="$(gcloud billing projects describe "${PROJECT}" \
  --format='value(billingAccountName)')"
BILLING_ACCOUNT="${BILLING_ACCOUNT##*/}"
if [[ -z "${BILLING_ACCOUNT}" ]]; then
  echo "    !! Could not read the billing account. Needs roles/billing.viewer. Skipping budget." >&2
elif gcloud billing budgets list --billing-account="${BILLING_ACCOUNT}" \
       --format='value(displayName)' 2>/dev/null | grep -qx "Extraction ${PROJECT}"; then
  echo "    budget already exists, leaving alone"
else
  # 50% and 90% catch a drift; 100% actual and 100% forecast catch a spike early.
  gcloud billing budgets create \
    --billing-account="${BILLING_ACCOUNT}" \
    --display-name="Extraction ${PROJECT}" \
    --budget-amount="${MONTHLY_BUDGET}USD" \
    --filter-projects="projects/${PROJECT_NUMBER}" \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0 \
    --threshold-rule=percent=0.9,basis=forecasted-spend \
    --notifications-rule-monitoring-notification-channels="${CHANNEL}" \
    --disable-default-iam-recipients \
    >/dev/null && echo "    created"
fi

policy() {
  local name="$1" filter="$2" threshold="$3" window="$4" doc="$5"
  if gcloud alpha monitoring policies list --format='value(displayName)' 2>/dev/null \
       | grep -qx "${name}"; then
    echo "    '${name}' already exists, leaving alone"
    return
  fi
  local tmp; tmp="$(mktemp)"
  # Alert filters must name a resource.type as well as a metric.type, or the API rejects them.
  # Monitoring filters carry double quotes; escape them so the JSON below stays valid.
  local filter_json="${filter//\"/\\\"}"
  cat > "${tmp}" <<POLICY
{
  "displayName": "${name}",
  "combiner": "OR",
  "enabled": true,
  "documentation": { "content": "${doc}", "mimeType": "text/markdown" },
  "conditions": [{
    "displayName": "${name}",
    "conditionThreshold": {
      "filter": "${filter_json}",
      "comparison": "COMPARISON_GT",
      "thresholdValue": ${threshold},
      "duration": "0s",
      "aggregations": [{
        "alignmentPeriod": "${window}",
        "perSeriesAligner": "ALIGN_DELTA",
        "crossSeriesReducer": "REDUCE_SUM"
      }]
    }
  }],
  "notificationChannels": ["${CHANNEL}"],
  "alertStrategy": { "autoClose": "86400s" }
}
POLICY
  gcloud alpha monitoring policies create --policy-from-file="${tmp}" >/dev/null \
    && echo "    created '${name}'"
  rm -f "${tmp}"
}

echo "==> Usage alert policies"

# Every threshold below is a multiple of one measured number, so it can be re-derived rather
# than trusted. Baseline: src/App.tsx polls every 15s, so one open tab is 4 requests/hour x 60
# = 240 requests/hour, and a 30-person workshop is ~7,200 requests/hour. Each threshold is set
# roughly an order of magnitude above that, which is high enough that a page means something
# is genuinely wrong and low enough to catch a runaway in its first hour rather than its bill.

# ~2M Flash input tokens/hour is far above any real workshop and cheap to sit under. Note a
# group level set is TWO model calls over the whole pile (classify, then synthesise), so
# budget synthesis at double what one prompt looks like.
policy "Extraction: Vertex AI token burn" \
  'resource.type="aiplatform.googleapis.com/PublisherModel" AND metric.type="aiplatform.googleapis.com/publisher/online_serving/token_count"' \
  2000000 3600s \
  "Vertex AI consumed more than 2M tokens in an hour. A workshop uses a few hundred thousand, remembering that one level set is two calls over the whole pile. Check for a client retry loop against the /api/session/* routes."

# 100k reads/hour is ~\$0.03/hr. A 30-person workshop is ~7,200/hr, so this is ~14x steady
# state. An unchanged poll costs ONE read: the route settles it on the ETag against
# getVersion, which reads the engagement document alone (thoughtCount is stored on it, not
# counted). If this fires, the pile is being loaded in full on every poll — look for a client
# that stopped sending If-None-Match, or an engagement whose updatedAt is moving constantly.
policy "Extraction: Firestore read burn" \
  'resource.type="firestore_instance" AND metric.type="firestore.googleapis.com/document/read_count"' \
  100000 3600s \
  "Firestore served more than 100k document reads in an hour, against a steady state of roughly 240 per open tab. An unchanged 15-second poll should cost one read, so this means polls are missing the 304 path and loading the whole pile, or a client is polling far faster than 15s."

# max-instances=3 x concurrency=80 caps compute, so this is about what is downstream.
policy "Extraction: Cloud Run request burn" \
  'resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"' \
  50000 3600s \
  "Cloud Run served more than 50k requests in an hour, against roughly 240 per open tab. Compute cost is capped by max-instances=3, so the concern is what each request drives: Vertex tokens and Firestore reads. If the solo instance is deployed without IAP, check this first — /api/session/* is unauthenticated there."

cat <<NEXT

Guardrails in place. Two things this does NOT do:

1. A budget alerts, it does not cap. To make Vertex AI spend physically unable to run away,
   set a quota ceiling — this is the only hard stop:
     https://console.cloud.google.com/iam-admin/quotas?project=${PROJECT}
   Filter to "Vertex AI API", find the generate-content requests-per-minute limit for
   ${REGION}, and request a lower limit (e.g. 60/min). A workshop never approaches it.

2. Nothing here reclaims storage. Old container images accumulate in Artifact Registry on
   every deploy. Add a cleanup policy once:
     gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \\
       --location=${REGION} --policy=<(echo '[{"name":"keep-5","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},{"name":"delete-old","action":{"type":"Delete"},"condition":{"olderThan":"30d"}}]')

Run ./scripts/audit-costs.sh any time for a read-only inventory.
NEXT
