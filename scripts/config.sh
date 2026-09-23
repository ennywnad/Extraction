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

# How the client authenticates, which is a separate question from which provider answers.
# `vertex` (default) is ADC as the runtime service account and needs no key material at all;
# `apikey` uses each named provider's own key, in which case bootstrap provisions the Secret
# Manager secret that provider needs; `none` reaches no model at all, so every AI route answers
# from its labelled fallback.
#
# `none` has to be said out loud — leaving this unset gets you `vertex`, not silence. It is for
# a first deploy that proves IAP, Firestore and the container before anything can spend a
# token; docs/intents/008 is the argument.
#
# GENAI_BACKEND is the old name and is still honoured, so an operator's existing shell or CI
# does not silently start deploying the default. The app reads both too; see
# server/ai/modelEnv.ts.
MODEL_BACKEND="${MODEL_BACKEND:-${GENAI_BACKEND:-vertex}}"

# Who answers, in order, as comma-separated `provider:model` entries — for example
#   claude:claude-opus-5,gemini:gemini-3.5-flash
# A bare id means Gemini, which is what every old GEMINI_MODELS value looks like. Empty leaves
# the app's built-in default, which is Gemini-only on purpose: a default that reached for
# Claude would change what an existing deployment does on its next restart.
MODEL_CHAIN="${MODEL_CHAIN:-${GEMINI_MODELS:-}}"

# Which providers that chain names, which is what decides the secrets and APIs below. A bare
# id (no colon) is Gemini, so an unqualified or empty chain counts as naming Gemini.
CHAIN_NAMES_CLAUDE=false
CHAIN_NAMES_GEMINI=false
case "${MODEL_CHAIN}" in *claude:*) CHAIN_NAMES_CLAUDE=true ;; esac
case "${MODEL_CHAIN}" in *gemini:*) CHAIN_NAMES_GEMINI=true ;; esac
# An entry with no provider prefix is Gemini. Also covers the empty default.
if [[ -z "${MODEL_CHAIN}" ]] || printf '%s' "${MODEL_CHAIN}" | tr ',' '\n' | grep -qv ':'; then
  CHAIN_NAMES_GEMINI=true
fi

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
