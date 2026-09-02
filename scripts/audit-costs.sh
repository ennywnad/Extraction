#!/usr/bin/env bash
#
# Read-only inventory of everything the Extraction deployment provisions, with an eye on
# what costs money while nobody is using the app.
#
# Creates nothing, deletes nothing. Safe to run any time.
#   gcloud auth login && export PROJECT=your-project-id && ./scripts/audit-costs.sh

source "$(dirname "$0")/config.sh"

hdr() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
gcloud config set project "${PROJECT}" >/dev/null

hdr "Enabled APIs (each one is a surface that can bill)"
gcloud services list --enabled --format='value(config.name)' | sort

hdr "Cloud Run services"
gcloud run services list --region="${REGION}" \
  --format='table(metadata.name,
                  spec.template.spec.containers[0].resources.limits.cpu:label=CPU,
                  spec.template.spec.containers[0].resources.limits.memory:label=MEM,
                  spec.template.metadata.annotations["autoscaling.knative.dev/minScale"]:label=MIN,
                  spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"]:label=MAX,
                  status.url)'
echo "    MIN > 0 means you are billed around the clock even with zero traffic."

hdr "Cloud Run revisions (old ones are free, but they pin images that are not)"
for svc in $(gcloud run services list --region="${REGION}" --format='value(metadata.name)'); do
  echo "  ${svc}:"
  gcloud run revisions list --service="${svc}" --region="${REGION}" \
    --format='value(metadata.name, status.conditions[0].status, metadata.creationTimestamp)' \
    | sed 's/^/    /'
done

hdr "Artifact Registry repositories and their size"
gcloud artifacts repositories list --location="${REGION}" \
  --format='table(name.basename():label=REPO, format, sizeBytes.size(units_out=M):label=SIZE_MB, createTime.date())'
echo "    0.5 GB/project/month is free; beyond that images bill whether or not they are deployed."

for repo in $(gcloud artifacts repositories list --location="${REGION}" --format='value(name.basename())'); do
  echo "  Images in ${repo}:"
  gcloud artifacts docker images list "${REGION}-docker.pkg.dev/${PROJECT}/${repo}" \
    --include-tags --format='value(package, tags, createTime.date())' 2>/dev/null | sed 's/^/    /' \
    || echo "    (empty)"
done

hdr "Firestore databases"
gcloud firestore databases list \
  --format='table(name.basename():label=DB, locationId, type, appEngineIntegrationMode)'
echo "    Storage bills per GiB-month. Reads are the variable cost; see the polling note in the report."

hdr "GCS buckets (source uploads and build logs accumulate here with no lifecycle rule)"
gcloud storage buckets list --format='value(name, location, storageClass)' 2>/dev/null | sed 's/^/  /'
for b in $(gcloud storage buckets list --format='value(name)' 2>/dev/null); do
  printf '  gs://%s ' "$b"
  gcloud storage du "gs://${b}" --summarize --readable-sizes 2>/dev/null | awk '{print $1}' || echo "?"
done

hdr "Secret Manager (only needed when GENAI_BACKEND=apikey; ~\$0.06/active version/month)"
gcloud secrets list --format='value(name, createTime.date())' 2>/dev/null | sed 's/^/  /' \
  || echo "  none / API disabled"

hdr "Service accounts"
gcloud iam service-accounts list --format='table(email, displayName, disabled)'

hdr "Load balancers and static IPs (these DO bill hourly while idle — expect none here)"
gcloud compute forwarding-rules list --format='value(name, region, IPAddress)' 2>/dev/null | sed 's/^/  /' \
  || echo "  none / compute API disabled"
gcloud compute addresses list --format='value(name, address, status)' 2>/dev/null | sed 's/^/  /' \
  || echo "  none"
echo "    A RESERVED (unattached) address bills. IAP on Cloud Run needs no LB, so this should be empty."

hdr "Compute instances (should be none)"
gcloud compute instances list --format='value(name, zone, status)' 2>/dev/null | sed 's/^/  /' \
  || echo "  none / compute API disabled"

hdr "Budgets already configured"
BA="$(gcloud billing projects describe "${PROJECT}" --format='value(billingAccountName)' 2>/dev/null)"
if [[ -n "${BA}" ]]; then
  echo "  Billing account: ${BA}"
  gcloud billing budgets list --billing-account="${BA##*/}" \
    --format='value(displayName, amount.specifiedAmount.units, thresholdRules.len())' 2>/dev/null \
    | sed 's/^/  /' || echo "  (need roles/billing.viewer to list budgets)"
else
  echo "  Could not read the billing account for ${PROJECT}."
fi

hdr "Monitoring alert policies"
gcloud alpha monitoring policies list --format='value(displayName, enabled)' 2>/dev/null | sed 's/^/  /' \
  || echo "  none, or the alpha component is not installed"

printf '\nDone. Nothing was changed.\n'
