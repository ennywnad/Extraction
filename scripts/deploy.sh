#!/usr/bin/env bash
#
# Build and deploy to Cloud Run with IAP enabled.
# Re-runnable. Assumes ./scripts/bootstrap-gcp.sh has been run once.

source "$(dirname "$0")/config.sh"

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')"

# The IAP JWT audience is computable for Cloud Run; nothing to copy out of the console.
# Format differs from App Engine and from load-balancer backend services.
IAP_AUDIENCE="/projects/${PROJECT_NUMBER}/locations/${REGION}/services/${SERVICE}"

ENV_VARS="AUTH_MODE=iap"
ENV_VARS+=",IAP_AUDIENCE=${IAP_AUDIENCE}"
ENV_VARS+=",FIRESTORE_PROJECT_ID=${PROJECT}"
ENV_VARS+=",GENAI_BACKEND=${GENAI_BACKEND}"
if [[ "${GENAI_BACKEND}" == "vertex" ]]; then
  ENV_VARS+=",VERTEX_LOCATION=${REGION}"
fi

echo "==> Deploying ${SERVICE} to ${REGION}"
echo "    IAP audience: ${IAP_AUDIENCE}"

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
)
# Vertex uses ADC as the runtime service account, so there is no secret to mount.
if [[ "${GENAI_BACKEND}" == "apikey" ]]; then
  DEPLOY_ARGS+=(--set-secrets "GEMINI_API_KEY=gemini-api-key:latest")
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
