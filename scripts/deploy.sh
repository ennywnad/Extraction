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
# Both Vertex-served providers need the region; neither key-served one does.
if [[ "${MODEL_BACKEND}" == "vertex" || "${MODEL_BACKEND}" == "claude-vertex" ]]; then
  ENV_VARS+=",VERTEX_LOCATION=${VERTEX_LOCATION}"
fi

echo "==> Deploying ${SERVICE} to ${REGION}"
echo "    IAP audience:    ${IAP_AUDIENCE}"
echo "    Model backend:   ${MODEL_BACKEND}"
echo "    Model chain:     ${MODEL_CHAIN:-<app default>}"
if [[ "${MODEL_BACKEND}" == "vertex" || "${MODEL_BACKEND}" == "claude-vertex" ]]; then
  echo "    Vertex location: ${VERTEX_LOCATION}"
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
# Vertex uses ADC as the runtime service account, so there is no secret to mount. A key-served
# provider mounts its own: the keys are deliberately not one neutral variable, because with two
# providers there are two of them.
if [[ "${MODEL_BACKEND}" == "apikey" ]]; then
  DEPLOY_ARGS+=(--set-secrets "GEMINI_API_KEY=gemini-api-key:latest")
elif [[ "${MODEL_BACKEND}" == "claude-apikey" ]]; then
  DEPLOY_ARGS+=(--set-secrets "ANTHROPIC_API_KEY=anthropic-api-key:latest")
fi

gcloud "${DEPLOY_ARGS[@]}"

echo "==> Allowing the IAP service agent to invoke the service"
gcloud run services add-iam-policy-binding "${SERVICE}" --region "${REGION}" \
  --member "serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-iap.iam.gserviceaccount.com" \
  --role roles/run.invoker --quiet >/dev/null

URL="$(gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)')"

cat <<NEXT

Deployed: ${URL}

Nobody can reach it yet. Grant the engagement group:

  gcloud iap web add-iam-policy-binding \\
    --resource-type=cloud-run --service=${SERVICE} --region=${REGION} \\
    --member="group:YOUR-GROUP@yourdomain.com" \\
    --role=roles/iap.httpsResourceAccessor

Use user:someone@example.com for individuals. Verify with a non-member account: IAP should
return 403 before the request reaches the app.
NEXT
