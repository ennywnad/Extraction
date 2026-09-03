# Deploying Extraction to your own GCP project

One Cloud Run service per engagement, private to a Google Group via Identity-Aware Proxy.
Firestore holds the shared pile; Vertex AI handles Gemini calls as the runtime service
account, so no API key exists anywhere in the deployment.

This deploys the app as it stands today, which is **both modes**: solo, and group mode with a
shared pile in Firestore behind IAP. When this document was first written only phase 0 existed
and it deployed solo mode alone — that sentence outlived its truth and was corrected on
2026-09-03. All six phases of `planv1/level-set-plan-v2.md` are built.

Built is not the same as exercised. Nothing below has been run against a real project yet, and
`docs/intents/008-deploying-group-mode.md` records which parts have never executed and what the
first deploy should cost.

## Prerequisites

```bash
gcloud auth login
gcloud auth application-default login
export PROJECT=your-project-id
export REGION=us-central1          # optional, this is the default
```

Billing must be enabled on the project.

## One manual step

`gcloud run deploy --iap` needs an OAuth brand. In a project with no organisation, configure
the consent screen as **External** once, in the console:
<https://console.cloud.google.com/auth/branding>

This is the only click-through in the process.

## Provision

```bash
./scripts/bootstrap-gcp.sh
```

Idempotent — safe to re-run. It enables the APIs, creates the Firestore database, and creates
a dedicated `extraction-run` service account (deliberately not the default compute account,
which carries project Editor) with `datastore.user` + `aiplatform.user`.

It deliberately creates no Artifact Registry repository. `deploy.sh` builds with `--source .`,
so Cloud Build pushes to the `cloud-run-source-deploy` repository gcloud makes on first use.

> **The Firestore location is permanent.** It is set to `$REGION` and cannot be changed
> afterwards without recreating the database. Pick the region you want before running this.

## Set the cost guardrails

Do this **before** the first deploy, not after — you want the budget and the usage alerts live
before anything is able to spend. It needs the project to exist and the APIs enabled, which is
what `bootstrap-gcp.sh` just did, but it does not need the app deployed.

```bash
ALERT_EMAIL=you@example.com MONTHLY_BUDGET=25 ./scripts/cost-guardrails.sh
```

Creates a monthly budget with alerts at 50/90/100% of actual spend and 90% of forecast, plus
Cloud Monitoring policies on the three metrics that can run away: Vertex AI tokens, Firestore
reads, and Cloud Run requests. Thresholds sit well above real workshop use, so a page means
something is genuinely wrong.

**A budget alerts; it does not cap.** The only hard stop is a quota ceiling — the script
prints the console link for lowering the Vertex AI generate-content limit.

`./scripts/audit-costs.sh` is a read-only inventory of everything the project holds. Run it now
for a baseline to diff against later.

## Deploy

```bash
./scripts/deploy.sh
```

Builds from source, deploys with `--no-allow-unauthenticated --iap`, computes the IAP JWT
audience (`/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME` — the Cloud Run
format, which differs from App Engine and from load-balancer backend services), and grants the
IAP service agent `run.invoker`.

## Grant access

The service is unreachable by everyone, including you, until this runs:

```bash
gcloud iap web add-iam-policy-binding \
  --resource-type=cloud-run --service=extraction --region=$REGION \
  --member="group:your-engagement@yourdomain.com" \
  --role=roles/iap.httpsResourceAccessor
```

Use `user:someone@example.com` for individuals. Removing someone from the group removes their
access with no change to the app — offboarding is the client directory's job.

## Verify

| Check                                                      | Expected                                           |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `curl $URL/healthz` with no credentials                    | `403` from IAP, before the request reaches the app |
| Signed-in group member                                     | `200`, app loads                                   |
| Signed-in non-member                                       | `403` from IAP                                     |
| `/healthz` as a member                                     | `{"ok":true,"aiEnabled":true}`                     |
| `gcloud run services describe extraction --region=$REGION` | no secret mounts                                   |

`aiEnabled: false` means Gemini is not reachable and every AI route is silently returning
canned static output. Do not run a workshop in that state.

## Audit logging

Firestore **Data Access** logs are off by default, so "who read this pile" is unanswerable
until you enable them. Add to the project IAM policy's `auditConfigs`:

```yaml
- service: firestore.googleapis.com
  auditLogConfigs:
    - logType: DATA_READ
    - logType: DATA_WRITE
```

IAP writes request-level Admin Activity logs regardless.

## After the first deploy, once

The `cloud-run-source-deploy` repository does not exist until the first deploy creates it, so
this cannot be done earlier. Without it, every deploy leaves a container image behind forever —
the only cost in this stack that grows while nobody is using the app.

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location=$REGION \
  --policy=<(echo '[{"name":"keep-5","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":5}},
                    {"name":"delete-old","action":{"type":"Delete"},"condition":{"olderThan":"30d"}}]')
```

Keep enough versions to cover any revision you might roll back to.

## Notes

- **IAP is all-or-nothing per service.** It gates the static bundle and every API route alike;
  there is no path-level exemption. The deployed instance is private to the group. For a public
  solo instance, deploy the same image as a second service without `--iap`.
- **Using the Gemini Developer API instead of Vertex:** `export GENAI_BACKEND=apikey GEMINI_KEY=...`
  before bootstrap. That path adds Secret Manager and a key to rotate; Vertex needs neither.
- **Model ids** differ between the Developer API and Vertex and move faster than this repo
  does. `GEMINI_MODELS` overrides the chain; the server logs which model actually served a
  request, and fails loudly with the whole chain rather than swallowing each failure.
- **Local development** needs none of this. Copy `.env.example` to `.env` and `npm run dev`.
