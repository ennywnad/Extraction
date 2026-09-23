#!/usr/bin/env bash
#
# One-time, idempotent provisioning for the Extraction group-mode instance.
# Safe to re-run: every step checks for the resource before creating it.
#
# Prerequisites:
#   gcloud auth login && gcloud auth application-default login
#   export PROJECT=your-project-id
#
# NOT handled here (one manual console step): the OAuth consent screen. In a project without
# an organisation you must configure the brand as "External" at
#   https://console.cloud.google.com/auth/branding
# before `gcloud run deploy --iap` will succeed.

source "$(dirname "$0")/config.sh"

echo "==> Project ${PROJECT}, region ${REGION}, service ${SERVICE}, backend ${MODEL_BACKEND}"
gcloud config set project "${PROJECT}" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"
if [[ ! "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]]; then
  echo "FATAL: could not resolve the project number for '${PROJECT}' (got '${PROJECT_NUMBER}')." >&2
  exit 1
fi

echo "==> Enabling APIs"
APIS=(
  run.googleapis.com
  firestore.googleapis.com
  iap.googleapis.com
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
)
# Vertex serves both providers under the same ADC, so this follows the backend and not the
# chain. See docs/intents/004: that equivalence is the whole argument for Claude on Vertex.
if [[ "${MODEL_BACKEND}" == "vertex" ]]; then
  APIS+=(aiplatform.googleapis.com)
elif [[ "${MODEL_BACKEND}" == "apikey" ]]; then
  APIS+=(secretmanager.googleapis.com)
fi
# `none` enables neither, which is the point of it: no model API, no secret store, nothing to
# spend. Falling through to the apikey branch would enable Secret Manager for a deployment
# that has no key to put in it.
gcloud services enable "${APIS[@]}"

echo "==> Firestore database"
# The location is PERMANENT once set. Keep it in the same region as Cloud Run.
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "    already exists, leaving alone"
else
  gcloud firestore databases create --location="${REGION}" --type=firestore-native
fi

echo "==> Runtime service account"
# Deliberately not the default compute service account, which carries project Editor.
if gcloud iam service-accounts describe "${RUNTIME_SA}" >/dev/null 2>&1; then
  echo "    ${RUNTIME_SA} already exists"
else
  gcloud iam service-accounts create "${RUNTIME_SA_ID}" \
    --display-name="Extraction Cloud Run runtime"
fi

grant() {
  echo "    granting $1"
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${RUNTIME_SA}" --role="$1" \
    --condition=None --quiet >/dev/null
}
echo "==> IAM"
grant roles/datastore.user
if [[ "${MODEL_BACKEND}" == "none" ]]; then
  # No model, so no model credential of either kind. The app answers every AI route from a
  # labelled fallback; see docs/intents/008.
  echo "    MODEL_BACKEND=none: no model role and no key secret"
elif [[ "${MODEL_BACKEND}" == "vertex" ]]; then
  # Claude on Vertex authenticates the same way Gemini does — same role, same runtime service
  # account, no key material for either. That equivalence is the argument; see docs/intents/004.
  grant roles/aiplatform.user
else
  # Under `apikey` each provider the chain names brings its own key, and a chain may name
  # both. They are deliberately not one neutral variable: with two providers there are two
  # keys, and one name could not say which it held.
  provision_key_secret() {
    local secret="$1" key_var="$2" key_value="$3"
    echo "==> API key secret (${secret})"
    if gcloud secrets describe "${secret}" >/dev/null 2>&1; then
      echo "    ${secret} already exists; add a version with:"
      echo "    printf '%s' \"\$${key_var}\" | gcloud secrets versions add ${secret} --data-file=-"
    else
      : "${key_value:?set ${key_var} when MODEL_BACKEND=apikey and the chain names it}"
      printf '%s' "${key_value}" | gcloud secrets create "${secret}" --data-file=-
    fi
    # Bound to the one secret, not the project. secretAccessor at project scope would let the
    # runtime read every secret anyone ever adds here, which is the same mistake as using the
    # default compute service account — just smaller today.
    echo "    granting roles/secretmanager.secretAccessor on ${secret} only"
    gcloud secrets add-iam-policy-binding "${secret}" \
      --member="serviceAccount:${RUNTIME_SA}" \
      --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
  }

  [[ "${CHAIN_NAMES_GEMINI}" == true ]] && provision_key_secret gemini-api-key GEMINI_KEY "${GEMINI_KEY:-}"
  [[ "${CHAIN_NAMES_CLAUDE}" == true ]] && provision_key_secret anthropic-api-key ANTHROPIC_KEY "${ANTHROPIC_KEY:-}"
fi

# --- Build identity ------------------------------------------------------------------------
#
# deploy.sh builds with `--source .`, which hands the build to Cloud Build. For any project
# where Cloud Build was enabled on or after 2024-04-29 the build runs as the *Compute Engine
# default* service account, and Google deliberately ships that account without enough
# permission to do the build. Without roles/run.builder the first deploy fails inside Cloud
# Build with a permission error that names a service account nothing in this repo mentions.
#
# This is separate from the runtime identity above and stays that way: the build principal
# needs to push images, the runtime principal needs Firestore and Vertex, and neither should
# hold the other's roles.
echo "==> Cloud Build identity for --source deploys"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "    granting roles/run.builder to ${BUILD_SA}"
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${BUILD_SA}" --role=roles/run.builder \
  --condition=None --quiet >/dev/null

# Whoever runs deploy.sh passes --service-account, which is an act-as on the runtime account.
# Granted to the caller rather than assumed, so a second person deploying gets a clear error
# from this script's absence rather than an opaque one from gcloud.
DEPLOYER="$(gcloud config get-value account 2>/dev/null || true)"
if [[ -n "${DEPLOYER}" && "${DEPLOYER}" != "(unset)" ]]; then
  echo "    letting ${DEPLOYER} act as ${RUNTIME_SA}"
  gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
    --member="user:${DEPLOYER}" --role=roles/iam.serviceAccountUser --quiet >/dev/null
  for role in roles/run.sourceDeveloper roles/serviceusage.serviceUsageConsumer; do
    echo "    granting ${role} to ${DEPLOYER}"
    gcloud projects add-iam-policy-binding "${PROJECT}" \
      --member="user:${DEPLOYER}" --role="${role}" --condition=None --quiet >/dev/null
  done
else
  echo "    !! could not resolve the active account; grant the deployer roles/run.sourceDeveloper," >&2
  echo "       roles/serviceusage.serviceUsageConsumer, and serviceAccountUser on ${RUNTIME_SA}." >&2
fi

# No Artifact Registry repository is created here. deploy.sh builds with `--source .`, which
# hands the build to Cloud Build and pushes to the `cloud-run-source-deploy` repository that
# gcloud creates on first use. A repository made here would sit empty forever. The
# artifactregistry API is still enabled above, because that auto-created repository needs it.

echo "==> Firestore security rules"
echo "    firestore.rules in this repo is deny-all. The Admin SDK bypasses rules, so nothing"
echo "    here depends on them; deploy them only if you ever add a client-side SDK:"
echo "    firebase deploy --only firestore:rules"

cat <<NEXT

Bootstrap complete.

Still manual, once:
  1. OAuth consent screen -> External:  https://console.cloud.google.com/auth/branding
  2. Audit logs for "who read this pile" (Part B6 of the plan): enable DATA_READ / DATA_WRITE
     for firestore.googleapis.com in the project IAM audit config.

Then, in this order:
  ./scripts/cost-guardrails.sh   # budget + usage alerts, BEFORE anything can spend
  ./scripts/deploy.sh
NEXT
