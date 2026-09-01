# Shared configuration for the GCP scripts. Override any of these in your shell.
#   export PROJECT=my-project REGION=us-central1
set -euo pipefail

PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-extraction}"
RUNTIME_SA_ID="${RUNTIME_SA_ID:-extraction-run}"

if [[ -z "${PROJECT}" || "${PROJECT}" == "(unset)" ]]; then
  echo "PROJECT is not set. Run: export PROJECT=your-project-id" >&2
  exit 1
fi

RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT}.iam.gserviceaccount.com"

# GENAI_BACKEND=vertex (default) authenticates as the runtime service account via ADC and
# needs no key material. Set GENAI_BACKEND=apikey to use the Gemini Developer API instead,
# in which case bootstrap also provisions a Secret Manager secret from $GEMINI_KEY.
GENAI_BACKEND="${GENAI_BACKEND:-vertex}"
