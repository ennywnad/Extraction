#!/usr/bin/env bash
#
# Build and deploy to Cloud Run with IAP enabled.
# Re-runnable. Assumes ./scripts/bootstrap-gcp.sh has been run once.

source "$(dirname "$0")/config.sh"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"

# Stop here rather than deploying an audience with a hole in it. If the lookup above failed —
# wrong project, no permission, no credentials — the substitution below yields
# "/projects//locations/..." which deploys happily and then rejects every request with a 401.
# The server refuses to boot on that now, but a deploy that never starts is a worse afternoon
# than a deploy that never happened.
if [[ ! "${PROJECT_NUMBER}" =~ ^[0-9]+$ ]]; then
  echo "FATAL: could not resolve the project number for '${PROJECT}' (got '${PROJECT_NUMBER}')." >&2
  echo "       The IAP audience is computed from it; check gcloud auth and the project id." >&2
  exit 1
fi

# The IAP JWT audience is computable for Cloud Run; nothing to copy out of the console.
# Format differs from App Engine and from load-balancer backend services.
IAP_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${SERVICE}"

ENV_VARS="AUTH_MODE=iap"
ENV_VARS+=",IAP_AUDIENCE=${IAP_AUDIENCE}"
ENV_VARS+=",FIRESTORE_PROJECT_ID=${PROJECT}"
# Only the current names are pushed. A service redeployed by this script therefore stops
# carrying GENAI_BACKEND/GEMINI_MODELS entirely, rather than carrying both and leaving which
# one wins to be worked out from two files. The app still reads the old names, which is what
# makes the revision *before* this one keep working.
ENV_VARS+=",MODEL_BACKEND=${MODEL_BACKEND}"
if [[ -n "${MODEL_CHAIN}" ]]; then
  ENV_VARS+=",MODEL_CHAIN=${MODEL_CHAIN}"
fi
# Vertex serves both providers under the same ADC, so the region is a property of the backend
# rather than of whoever the chain names.
if [[ "${MODEL_BACKEND}" == "vertex" ]]; then
  ENV_VARS+=",VERTEX_LOCATION=${VERTEX_LOCATION}"
fi

echo "==> Deploying ${SERVICE} to ${REGION}"
echo "    IAP audience:    ${IAP_AUDIENCE}"
echo "    Model backend:   ${MODEL_BACKEND}"
echo "    Model chain:     ${MODEL_CHAIN:-<app default>}"
if [[ "${MODEL_BACKEND}" == "vertex" ]]; then
  echo "    Vertex location: ${VERTEX_LOCATION}"
fi
# Said plainly, because it is the one backend whose symptom — every AI route answering with
# canned text — looks like a broken deployment rather than a chosen one.
if [[ "${MODEL_BACKEND}" == "none" ]]; then
  echo "    No model will be reachable. Every AI route answers from its labelled fallback,"
  echo "    and /healthz will report aiEnabled: false. Deliberate at MODEL_BACKEND=none."
fi

DEPLOY_ARGS=(
  run deploy "${SERVICE}"
  --source .
  --region "${REGION}"
  --service-account "${RUNTIME_SA}"
  --no-allow-unauthenticated
  --iap
  --set-env-vars "${ENV_VARS}"
  --min-instances=0
  --max-instances=3
  --concurrency=80
  # 512Mi is the default and is thin for Node holding the Firestore and genai SDKs at
  # concurrency=80. A Cloud Run OOM presents as a 503 with nothing in the application log,
  # which is the worst thing to be debugging during a workshop. Memory is billed per
  # request-second, so at min-instances=0 an idle service pays for none of it.
  --memory=1Gi
  # Startup CPU boost: 2 CPU for container start plus 10s after, billed only for that window.
  # min-instances=0 means every workshop opens with a cold start pulling in both SDKs.
  --cpu-boost
)
# Vertex uses ADC as the runtime service account, so there is no secret to mount at all. Under
# `apikey` each provider the chain names brings its own key — deliberately not one neutral
# variable, because with two providers there are two of them, and a chain may name both.
if [[ "${MODEL_BACKEND}" == "apikey" ]]; then
  SECRETS=()
  [[ "${CHAIN_NAMES_GEMINI}" == true ]] && SECRETS+=("GEMINI_API_KEY=gemini-api-key:latest")
  [[ "${CHAIN_NAMES_CLAUDE}" == true ]] && SECRETS+=("ANTHROPIC_API_KEY=anthropic-api-key:latest")
  if ((${#SECRETS[@]})); then
    DEPLOY_ARGS+=(--set-secrets "$(IFS=,; echo "${SECRETS[*]}")")
  fi
fi

gcloud "${DEPLOY_ARGS[@]}"

echo "==> Allowing the IAP service agent to invoke the service"
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" \
  --role roles/run.invoker --quiet >/dev/null

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"

# access.sh is the grant, and it postdates this epilogue's original hand-written gcloud
# command. It writes the same binding and then checks the three things that decide whether the
# binding actually works — the IAP service agent's run.invoker, the consent screen, and
# user: on a group address, which grants nobody and reads as if it worked.
cat <<NEXT

Deployed: ${URL}

Nobody can reach it yet, including you. Grant someone:

  ./scripts/access.sh grant you@example.com          # prints an invite to send them
  ./scripts/access.sh grant group:workshop@acme.com
  ./scripts/access.sh check you@example.com          # can they get in, right now?

Verify with a non-member account: IAP should return 403 before the request reaches the app.
NEXT
