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

echo "==> Project ${PROJECT}, region ${REGION}, service ${SERVICE}, backend ${GENAI_BACKEND}"
gcloud config set project "${PROJECT}" >/dev/null

echo "==> Enabling APIs"
APIS=(
  run.googleapis.com
  firestore.googleapis.com
  iap.googleapis.com
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
)
if [[ "${GENAI_BACKEND}" == "vertex" ]]; then
  APIS+=(aiplatform.googleapis.com)
else
  APIS+=(secretmanager.googleapis.com)
fi
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
if [[ "${GENAI_BACKEND}" == "vertex" ]]; then
  grant roles/aiplatform.user
else
  grant roles/secretmanager.secretAccessor
  echo "==> Gemini API key secret"
  if gcloud secrets describe gemini-api-key >/dev/null 2>&1; then
    echo "    gemini-api-key already exists; add a version with:"
    echo "    printf '%s' \"\$GEMINI_KEY\" | gcloud secrets versions add gemini-api-key --data-file=-"
  else
    : "${GEMINI_KEY:?set GEMINI_KEY when GENAI_BACKEND=apikey}"
    printf '%s' "${GEMINI_KEY}" | gcloud secrets create gemini-api-key --data-file=-
  fi
fi

echo "==> Artifact Registry"
if gcloud artifacts repositories describe extraction --location="${REGION}" >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud artifacts repositories create extraction \
    --repository-format=docker --location="${REGION}" \
    --description="Extraction container images"
fi

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

Then:  ./scripts/deploy.sh
NEXT
