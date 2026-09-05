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

# Where Gemini is served from. Deliberately NOT $REGION — it used to inherit it, which made a
# real choice look like a formatting detail.
#
# `global` is the better default at the same price: for stable model versions the per-token
# rate is identical regionally and globally, and the global endpoint routes to whatever region
# has capacity, so it takes fewer 429s and sees new model ids first.
#
# The tradeoff is residency: `global` may serve a prompt from any region. Set this to a region
# id (e.g. us-central1) if a client requires the pile stay in one — same price, less capacity,
# which is the correct trade when residency is a requirement rather than a preference.
#
# Not Flex PayGo, which is genuinely half price, global-only, and targets 1-15 MINUTE
# responses. Unusable for an interactive prompt; this setting does not select it.
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
