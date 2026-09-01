# Group Mode ("Level Set") — v2: Deployable to your own GCP project

Supersedes `level-set-plan.md` (v1). v1's feature design is mostly sound and is carried
forward; this revision fixes **five correctness bugs**, resolves a **product hole that would
break 5 of the 12 modes in group mode**, and replaces v1 §6 (which assumed a deployment
pipeline this repo no longer has) with real, runnable GCP deployment artifacts.

---

## Part A — Review of v1

### What v1 got right (keep, unchanged)

- **`Engagement == Session`, persisted server-side.** Verified against the code: every
  consumer only reads `Session`/`Thought` shapes. Correct minimal-churn mapping.
- **The single-funnel claim.** Verified: every thought mutation in the app reaches
  `App.tsx`'s `handleUpdateSession` (`src/App.tsx:229`), and every caller composes a whole
  new `thoughts` array. Routing logic really does only need to change in one place.
- **Thoughts as a Firestore subcollection**, not an array field. Right call — a 198-fragment
  pile with 10 concurrent writers would thrash a single document.
- **Store interface + factory mirroring `getGemini()`**, with a local-dev fallback so
  `npm run dev` needs zero cloud config.
- **IAP + Firestore + Cloud Run** as the topology, and **`google-auth-library`** rather than
  hand-rolled JWKS. Both correct.
- **Attribution-A card treatment**, append-only, solo cards visually unchanged.

### F1 — Auth fails **open**, and that is the most dangerous line in v1  🔴

v1 §2: *"`IAP_AUDIENCE` unset (local dev) → `req.identity = { email: DEV_USER_EMAIL … }`"*.

One missing or misspelled env var on Cloud Run and the deployed app stops verifying
anything: every request becomes `dev@local.test`, fully authorised, writing to the real
Firestore pile. A misconfiguration should never be indistinguishable from a valid dev setup.

**Fix.** Make the mode explicit and fail closed at boot, not per-request:

```ts
// server/authMode.ts
const mode = process.env.AUTH_MODE ?? "iap";           // default is the SAFE one
if (mode === "iap" && !process.env.IAP_AUDIENCE) {
  console.error("FATAL: AUTH_MODE=iap requires IAP_AUDIENCE"); process.exit(1);
}
if (mode === "dev" && process.env.NODE_ENV === "production") {
  console.error("FATAL: AUTH_MODE=dev refused in production"); process.exit(1);
}
```

Dev mode is then an opt-in you have to type (`AUTH_MODE=dev` in `.env.local`), and a
container that is wrong crash-loops visibly instead of serving an open door.

### F2 — Delete-by-omission will silently destroy other people's fragments  🔴

v1 §4 derives deletions by diffing arrays: *"ids missing from the new array → `DELETE`"*.

Under the 5s poll this loses data. Concrete sequence:

1. A polls, `currentSession.thoughts` = `[t1, t2]`.
2. B adds `t3`. A has not polled yet.
3. A drags a card in CardSort → the mode composes a new array from A's **stale** state:
   `[t1, t2]`.
4. The diff sees `t3` "missing from the new array" → **`DELETE t3`**. B's fragment is gone,
   nobody touched it, no error shown.

This isn't a rare interleaving — it's the normal case any time two people are in the pile
at once, which is the entire point of the feature.

**Fix.** Never infer deletion from absence. Grep confirms `src/components/Workspace.tsx:111`
is the *only* site in the whole app that shrinks the array, so an explicit path is cheap:

- Add `onDeleteThought?: (id: string) => void` to `WorkspaceProps`.
- `App.tsx` passes a real handler: engagement → `DELETE /api/engagement/:id/thoughts/:tid`;
  solo → today's `filter` + `persistSession`.
- The sync layer diffs for **adds** and **field updates only**. An id present on the server
  and absent locally is treated as "newer than me" and merged in, never deleted.

That deletes the whole class of bug for about fifteen lines.

### F3 — "Nobody edits anyone" breaks 5 of the 12 modes  🟠

v1 §3 gates `PATCH /thoughts/:tid` with `403 unless thought.author.email === caller.email`.
But `SliderMap`, `CardSort`, `TimelineMode`, `PriorityPile` and `SwipeReact` exist *precisely*
to mutate thoughts that already exist — and in a shared pile most of those belong to someone
else. With v1's gate, every drag onto a cluster or timeline zone 403s and silently reverts.

The design deck's "nobody edits anyone" means **nobody rewrites your words**. Sorting the
pile together is the collaborative sensemaking the feature is for.

**Fix — gate by field, not by row.** Server-side allowlist on `PATCH`:

| Field | Who may write |
|---|---|
| `text` | author only |
| delete | author only |
| `clusterCategory`, `timelineZone`, `priorityZone`, `intensity`, `swipeStatus` | any roster member |

Reject any other key with `400`. Attribution is untouched: the `author` stamp never changes,
so a card someone else filed under "Risks" still reads as yours.

*(Future option, out of scope: per-viewer classification, so each person sorts their own
view. Materially more work — a per-user overlay collection — and not needed for v1.)*

### F4 — The roster can't answer "which engagements am I in?"  🟠

`roster: Record<string, AuthorStamp>` is a Firestore **map**. There is no "map contains key"
query, so v1's `GET /api/engagement` ("engagements where caller's email is in roster") has no
implementation. Email keys are also awkward as map keys — the `.` needs `FieldPath` escaping
on every update, which is easy to get wrong and fails quietly.

**Fix.** Keep `roster` as a denormalised map for rendering, and add a queryable array written
in the same transaction:

```ts
memberEmails: string[]   // lowercased; where('memberEmails','array-contains', email)
```

Normalise every email to lowercase at the auth boundary, once, so the two never drift.

### F5 — A newly invited person can't get in  🟠

v1 lists only engagements where you're already in the roster, and auto-provisions your roster
entry *on first contribution*. So an invited SME is in neither: not in the roster, therefore
sees no engagements, therefore can't contribute, therefore never enters the roster.

**Fix — separate the two boundaries, which v1 conflates:**

- **IAP group membership is authorisation.** If you reached the app at all, you are in the
  engagement group. That is the security perimeter.
- **The roster is attribution.** Who you are on a card, not whether you may open the door.

So: `GET /api/engagement` lists **all** engagements on the instance (this matches the deck's
"engagement shelf … visible to everyone in the group"), `GET /api/engagement/:id` is readable
by any authenticated caller, and `POST /api/engagement/:id/join` adds you to the roster with
role `Contributor`. Add a deep link — `/?engagement=<id>` — so the facilitator can drop one
URL into a calendar invite and ten people land in the same pile. Without that link there is
no realistic way to get a workshop started.

### F6 — Rate limiting is broken behind a proxy, and will throttle the workshop  🟠

`server.ts` mounts `express-rate-limit` at 100 requests / 15 min keyed on `req.ip`, and never
sets `trust proxy`. On Cloud Run behind IAP, `req.ip` is the proxy — so all ten stakeholders
share **one** 100-request budget for Gemini calls, and express-rate-limit v7 will log a
validation error about the unset `X-Forwarded-For` trust.

**Fix.** `app.set("trust proxy", 1)`; key the limiter on `req.identity.email` once identity
exists; raise the budget (a live Guided Drill plus a synthesize pass burns dozens of calls per
person per workshop).

### F7 — `dist/server.cjs` and its sourcemap are served as static files  🟡

`server.ts:510` does `express.static(path.join(process.cwd(), "dist"))`, and `npm run build`
writes both the Vite client bundle *and* `dist/server.cjs` + `.map` into `dist/`. Your server
source is fetchable at `/server.cjs.map`. Behind IAP that's group-only rather than public, but
it's still your prompt logic and route surface handed to every client stakeholder.

**Fix.** Build the server to `dist-server/server.cjs` and update `start` to match. The
sourcemap is then kept — once the bundle is outside the directory `express.static` serves,
it is unreachable, and production stack traces are worth having. *(Verified in Phase 0:
`/server.cjs` and `/server.cjs.map` now return the SPA shell.)*

### F8 — Deployment section rests on a premise that no longer holds  🔴

v1 §6: *"No custom Dockerfile/CI — this repo already deploys via Google AI Studio's managed
Cloud Run pipeline (confirmed via `.antigravity/` build history)."*

`.antigravity/` was deleted in `b375bda` ("Remove AI IDE session transcript before public
release") and is now gitignored. This is a plain public GitHub repo with no build pipeline
attached, and you've asked to run it from your own GCP project. Part B replaces §6 entirely.

Two latent container bugs that section would have hidden:

- **The container cannot start at all, whatever `NODE_ENV` says.** `server.ts:502` boots an
  in-process Vite dev server unless `NODE_ENV === "production"` — but the fix is not just
  setting the variable. `vite` is imported at the **top level**, and `esbuild --format=cjs`
  turns that into a `require("vite")` that runs on module load, before any branch is
  evaluated. In a `--omit=dev` runtime image `vite` isn't installed, so the process dies with
  MODULE_NOT_FOUND regardless of configuration. The import has to become a dynamic
  `await import("vite")` inside the development branch. *(Confirmed empirically in Phase 0:
  with `vite` removed, the old entrypoint crashes on load; the patched one starts clean.)*
- **`PORT` is hardcoded to 3000** (`server.ts:11`). Cloud Run injects `PORT=8080` and health-
  checks that port. v1 flags this as a "small fix needed for local two-user testing" — it is
  actually a hard deployment blocker.

### F9 — Polling re-reads the entire pile from Firestore every 5 seconds  🟡

10 users × 198 thoughts × 12 polls/min ≈ **1.4M Firestore document reads per hour**, for a
pile that changes a few times a minute. It works, but you're paying per poll for data that
didn't change.

**Fix (cheap, v1-sized).** `GET /api/engagement/:id` returns an `ETag` derived from
`updatedAt` + thought count; the client sends `If-None-Match` and takes a `304` on the common
path; the server memoises the assembled `Session` against that same key and only re-reads
Firestore after a write. Also pause polling on `document.hidden` and back off on errors.
Firestore realtime listeners / SSE stay the documented fast-follow.

### F10 — Two-process local testing will race  🟡

v1 §7 proposes two `npm run dev` processes on different ports sharing `.data/engagements.json`.
Whole-file read-modify-write from two processes loses writes, so you'd be debugging the test
harness rather than the feature.

**Fix.** One server, two identities: in `AUTH_MODE=dev`, honour an `x-dev-user` header (and a
`?dev_user=` query param that sets a cookie). Open two browser profiles against
`localhost:3000`, each stamped as a different person. Same process, same store — and it
exercises the actual shared-pile code path.

### F11 — Turning on IAP removes anonymous solo use of the deployed app

Worth deciding deliberately rather than discovering: IAP is all-or-nothing per resource. It
gates `/`, the static bundle and `/api/session/*` alike — there is no path-level exemption. So
the deployed instance becomes private to the engagement group. Solo mode still works there
(localStorage, per person) and localhost dev is untouched.

**Recommendation: accept it for v1.** One private instance per engagement is what the deck
describes. If you later want a public solo instance, deploy the *same image* as a second Cloud
Run service with IAP off and `ENGAGEMENTS_ENABLED=false` — a config change, not a fork.

### F12 — Two smaller things

- **CSRF.** IAP session cookies ride along on cross-site requests. Mitigation is already
  mostly structural: keep `express.json()` as the only body parser, reject non-JSON
  `Content-Type` on mutating routes, and **do not add `cors()`** — cross-origin JSON POSTs
  then fail preflight. One line in the plan, one `if` in the code.
- **Audit logs aren't free.** The deck promises Cloud Audit Logs answer "who saw this pile".
  Firestore **Data Access** logs are off by default; `DATA_READ`/`DATA_WRITE` must be enabled
  explicitly in the project IAM audit config (Part B step 8). Admin Activity logs alone won't
  answer that question.

---

## Part B — The deployable solution

Everything below is new; it replaces v1 §5–§7.

### B1 — Runtime configuration

| Var | Local dev | Cloud Run | Notes |
|---|---|---|---|
| `NODE_ENV` | unset | `production` | Baked into the image. Unset ⇒ Vite dev server ⇒ crash loop |
| `PORT` | 3000 | injected (8080) | Requires the `server.ts:11` fix |
| `AUTH_MODE` | `dev` | `iap` | Defaults to `iap`; `dev` refused when `NODE_ENV=production` |
| `IAP_AUDIENCE` | — | `/projects/<NUM>/locations/<REGION>/services/<SVC>` | Computed by `deploy.sh`; see B4 |
| `FIRESTORE_PROJECT_ID` | unset ⇒ file store | project id | Presence selects the Firestore store |
| `GENAI_BACKEND` | `apikey` | `vertex` | Selects Gemini Developer API vs Vertex; see C6 |
| `GEMINI_API_KEY` | `.env.local` | — | `GENAI_BACKEND=apikey` only |
| `VERTEX_LOCATION` | — | e.g. `us-central1` | `GENAI_BACKEND=vertex` only; project comes from `FIRESTORE_PROJECT_ID` |
| `DEV_USER_EMAIL` / `DEV_USER_NAME` | your identity | — | `AUTH_MODE=dev` only |

`.env.example` gets rewritten for GCP (the current one documents AI Studio secret injection
that no longer applies). `.gitignore` adds `.data/`.

### B2 — `Dockerfile`

```dockerfile
# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # vite -> dist/ ; esbuild -> dist-server/server.cjs

# ---- runtime ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
EXPOSE 8080
CMD ["node", "dist-server/server.cjs"]
```

`esbuild --packages=external` leaves dependencies unbundled, which is why the runtime stage
still installs production `node_modules`. Add a `.dockerignore` (`node_modules`, `.git`,
`.data`, `planv1`, `*.zip`, `.env*`).

Also add to `server.ts`: `GET /healthz` returning `{ok:true}` **before** the SPA catch-all,
and a `SIGTERM` handler that closes the listener — Cloud Run sends SIGTERM and kills at 10s.

### B3 — `scripts/bootstrap-gcp.sh` (run once, idempotent)

```bash
gcloud services enable run.googleapis.com firestore.googleapis.com \
  iap.googleapis.com aiplatform.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com

# Firestore — region is PERMANENT, match your Cloud Run region
gcloud firestore databases create --location="$REGION" --type=firestore-native

# Least-privilege runtime identity (NOT the default compute SA, which is Editor)
gcloud iam service-accounts create extraction-run --display-name="Extraction runtime"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:extraction-run@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/datastore.user
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:extraction-run@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/aiplatform.user

gcloud artifacts repositories create extraction --repository-format=docker --location="$REGION"
```

No Secret Manager step and no API key to store, rotate or leak — Vertex authenticates as the
runtime service account via ADC (see C6). If you opt back to the Developer API, re-add
`secretmanager.googleapis.com`, `roles/secretmanager.secretAccessor`, and
`printf '%s' "$GEMINI_KEY" | gcloud secrets create gemini-api-key --data-file=-`.

Also commit a deny-all `firestore.rules` (`allow read, write: if false;`). The Admin SDK
bypasses rules, so this costs nothing and stops any future client-side SDK from reading the
pile directly.

### B4 — `scripts/deploy.sh`

The audience is **computable**, so nothing has to be copied out of the console:

```bash
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
AUD="/projects/$NUM/locations/$REGION/services/$SERVICE"

gcloud run deploy "$SERVICE" --source . --region "$REGION" \
  --service-account "extraction-run@$PROJECT.iam.gserviceaccount.com" \
  --no-allow-unauthenticated --iap \
  --set-env-vars "AUTH_MODE=iap,IAP_AUDIENCE=$AUD,FIRESTORE_PROJECT_ID=$PROJECT,GENAI_BACKEND=vertex,VERTEX_LOCATION=$REGION" \
  --min-instances=0 --max-instances=3 --concurrency=80

# IAP service agent must be able to invoke the service
gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
  --member "serviceAccount:service-$NUM@gcp-sa-iap.iam.gserviceaccount.com" \
  --role roles/run.invoker
```

*Verified against current Google documentation:* enabling IAP **directly on the Cloud Run
service** is now the recommended topology (no load balancer, no extra cost), and the Cloud Run
IAP audience format is `/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME` —
distinct from the App Engine and backend-service formats, which is the mistake to avoid here.
The `--iap` flag requires `--no-allow-unauthenticated`. IAP cannot be enabled on both the
service and a load balancer.

**One manual prerequisite:** the OAuth consent screen. In a project without an organisation
you must configure the brand as *External* in the console once before `--iap` works. It's the
only click-through step; everything else is scripted.

### B5 — Granting the engagement group access

```bash
gcloud iap web add-iam-policy-binding \
  --resource-type=cloud-run --service="$SERVICE" --region="$REGION" \
  --member="group:northwind-4417@yourdomain.com" \
  --role=roles/iap.httpsResourceAccessor
```

Use `user:someone@client.com` where there's no Workspace group. Removing someone from the
group removes their access with no app-side change — which is the offboarding story the deck
sells.

### B6 — Enable the audit logs the deck promises

Add to the project IAM policy's `auditConfigs`:

```yaml
- service: firestore.googleapis.com
  auditLogConfigs:
    - logType: DATA_READ
    - logType: DATA_WRITE
```

IAP already writes request-level Admin Activity logs; this is what makes "who read fragment
#38" answerable.

### B7 — Verification ladder

1. **Solo untouched.** `npm run dev` with no cloud config: create / edit / delete your own
   thoughts, all 12 modes. Zero behavioural or visual change.
2. **`npm run lint`** (`tsc --noEmit`) clean.
3. **Two-user local.** One server, `AUTH_MODE=dev`, two browser profiles via `?dev_user=`.
   Both piles show both authors; edit/delete affordances appear only on your own cards;
   dragging *someone else's* card in CardSort succeeds (F3); the poll surfaces the other
   person's fragment without a reload.
4. **Data-loss regression (F2).** A adds `t3` while B has a stale pile; B then drags a card.
   Assert `t3` still exists. This should be an automated test, not a manual check — it is the
   bug most likely to silently return.
5. **Fail-closed (F1).** Boot with `AUTH_MODE=iap` and no `IAP_AUDIENCE` ⇒ process exits
   non-zero. Boot with `AUTH_MODE=dev NODE_ENV=production` ⇒ exits non-zero.
6. **Container parity.** `docker build && docker run -e PORT=8080` ⇒ serves the built SPA, no
   Vite in the image, `/healthz` 200.
7. **Deployed.** Non-group Google account ⇒ IAP 403 before the app is reached. Group member ⇒
   200, and a submitted fragment carries a real stamped author. `curl` the run.app URL with no
   cookie ⇒ 403 from IAP, and with a forged `X-Goog-IAP-JWT-Assertion` ⇒ 401 from the app.

### B8 — Build order

| Phase | Contents | Deployable at end? |
|---|---|---|
| 0 ✅ | `PORT` fix, lazy vite import, `/healthz`, SIGTERM, `dist-server` split (F7), `trust proxy` (F6), Dockerfile, bootstrap + deploy scripts, `DEPLOYMENT.md` | **Done, not deployed** — solo app ready for Cloud Run behind IAP. Nothing group-related yet. |
| 1 ✅ | `AUTH_MODE` + `iapAuth.ts` + `/api/whoami`, dev-identity override | Yes — verified identity, unused |
| 2 ✅ | Store interface, file store, Firestore store, engagement routes (F3 field allowlist, F4 `memberEmails`, F5 join + open read) | Yes — API testable by curl |
| 3 ✅ | `engagementAPI.ts`, `handleUpdateSession` branch (F2 explicit delete), ETag polling (F9), `?engagement=` deep link | Yes |
| 4 ✅ | Attribution-A card, IntakeForm engagement shelf, ownership-gated affordances | Yes |
| 5 ✅ | Part C: server-side corpus assembly, group synthesis job, `advancedSettings` split, Vertex backend, visible degradation | **Built; deploy pending** |

Phase 0 is worth doing first on its own: it gets a real URL and a real container out of the
way while the group-mode surface is still zero, so any deployment problem you hit is isolated
from any feature problem.

### Deferred (unchanged from v1, still out of scope)

Comments/+1, coverage map, scope ledger, the three registers, the two-workshop engagement-log
UI, facilitator merge-of-duplicates, per-viewer classification, Firestore realtime listeners.

### Critical files

- Unchanged: all 12 `src/components/Modes/*.tsx`
- Modified: `src/types.ts`, `src/App.tsx`, `src/components/Workspace.tsx`,
  `src/components/IntakeForm.tsx`, `server.ts`, `package.json`, `.env.example`, `.gitignore`
- New: `server/authMode.ts`, `server/iapAuth.ts`, `server/engagementRoutes.ts`,
  `server/store/{types,firestoreEngagementStore,fileEngagementStore,index}.ts`,
  `src/utils/engagementAPI.ts`, `server/ai/{client,corpus,coverage}.ts`,
  `server/ai/prompts/{elicitation,levelSet}.ts`, `Dockerfile`, `.dockerignore`,
  `firestore.rules`, `scripts/bootstrap-gcp.sh`, `scripts/deploy.sh`, `DEPLOYMENT.md`
- Modified by Part C: `server.ts` (AI routes), `src/components/ExportPanel.tsx`

---

## Part C — Gemini integration for a group

v1 leaves `/api/session/*` untouched on the grounds that it is a stateless proxy. That holds
for the *transport*, but not for the *content*: every prompt in `server.ts` is written in the
second person singular for one mind ("the user", "their thought", "unburdening", "compassionate
recap of what was really uncovered beneath the words"), and the corpus those prompts operate on
is about to become ten people's client-confidential material. Three of the seven routes need
real work; the other four need better context and nothing else.

### C1 — The server assembles the corpus, not the browser

Today the client POSTs the pile on every call (`thoughts`, `pastThoughts`, `recentThoughts`).
That was reasonable when the pile lived in your own localStorage. In group mode the server
already holds it, so the browser downloads 198 fragments and re-uploads them every time
someone refreshes Quick Fire — and prompt content becomes client-controlled.

**Change.** Engagement calls send `{ engagementId, … }`; the server loads the pile from the
store and builds the corpus in `server/ai/corpus.ts`. Solo calls keep today's body shape
exactly, so the solo path is byte-for-byte unchanged.

This is the enabling change — C2, C3 and C4 all depend on the server owning assembly. It also
opens the door to Gemini **context caching** (`ai.caches`): with ten people drilling against
one large, mostly-stable pile prefix, the corpus is close to an ideal cache candidate. Measure
before building it; noted, not scheduled.

### C2 — Send the role, not the name

`corpus.ts` formats engagement fragments as:

```
#38 [Business ops lead] (guided_drill): Claims intake isn't one process — branch, broker …
```

Role rather than name, for two reasons. It is what makes coverage analysis possible ("only IT
has spoken about data"), and it keeps a model-authored sentence like *"S. Lindqvist appears to
be avoiding the funding question"* out of a document that gets circulated to S. Lindqvist. The
app holds the fragment→author mapping and re-attaches names deterministically when it cites a
fragment, so nothing is lost in the deliverable.

### C3 — Coverage is computed, not generated

The deck's headline output is the zero in "Commercials & funding envelope" — an **absence**.
Models are unreliable at noticing what is *not* present across 198 items, and this is the one
number the whole artefact is judged on.

**Split the task.** Gemini classifies each fragment into an area (bounded label set, one
fragment at a time, verifiable). `server/ai/coverage.ts` then does arithmetic: fragments per
area, distinct author-roles per area, and `Defined / Partial / Dark` by threshold. An empty
area falls out as a count of zero and is *always* right. Voices-per-area is a group-by over
author stamps — not a generation task at all.

### C4 — Group synthesis becomes a single-flight, versioned job

This is the part that would have hurt in a live engagement.
`src/components/ExportPanel.tsx:103` fires synthesis from a `useEffect` whenever
`synthesizedOutline` is empty — no button press — and its `useCallback` depends on
`session.thoughts` and `onUpdateSession` (recreated every render), so it re-evaluates
constantly. In an engagement, `synthesizedOutline` is a **shared** field, which means:

- whoever opens the review panel first triggers a 198-fragment generation; anyone opening
  before it lands triggers a second, concurrent one, and last write wins;
- the `catch` branch writes a canned fallback (*"We analyzed your brainstorming on 'X'…"*)
  **into the shared field**, so one timeout silently replaces the group's deliverable with
  filler that reads like a real result;
- nothing invalidates it as the pile grows, so the level-set goes quietly stale across exactly
  the async week the engagement is built around.

**Change.**

- `POST /api/engagement/:id/synthesize` — server-side, **single-flight**: if a run is already
  in progress for that engagement, return `202` with the in-flight job id rather than starting
  a second. Facilitator-triggered; never automatic.
- Results land in a `engagements/{id}/syntheses/{version}` subcollection, each stamped with
  `generatedBy`, `generatedAt`, `pileVersion` (the engagement `updatedAt` it was built from)
  and the settings used. The deck already shows "level set v2" and a bias-audit regeneration —
  versions are in the design, they were just missing from the plan.
- `session.synthesized*` keeps pointing at the latest version for read compatibility, so
  `ExportPanel`'s render path is unchanged.
- The client shows **stale** when `pileVersion !== session.updatedAt`, with a Regenerate
  action. Growing piles are the normal case here, not an error.
- A failed run writes **nothing**. It surfaces as an error with a retry. The canned fallback is
  acceptable for a solo user with no API key; it is not acceptable as a client deliverable.
- `ExportPanel`: keep the auto-fire for solo sessions, drop it entirely for engagements.

**A separate prompt**, in `server/ai/prompts/levelSet.ts`. Not a reworded version of the solo
one — a different genre. Boundary of the ask; status per area with the computed counts from C3
supplied as input rather than requested as output; conflicting claims quoted with both fragment
ids; assumptions with their source fragment; open questions with owners. Nothing compassionate,
nothing therapeutic, no action items addressed to "you".

### C5 — `advancedSettings` splits along its natural seam

One shared object today, and the two halves want opposite scopes.

| Setting | Scope | Why |
|---|---|---|
| `promptingStyle` (`socratic` / `empathetic`) | **per-viewer**, local only, never persisted to the engagement | A flips to socratic and B's Guided Drill turns adversarial mid-workshop with no explanation |
| `outputFilter`, `cognitiveBiasAudit` | **engagement-level**, facilitator-owned | These shape the shared deliverable; the deck treats the bias audit as a facilitator act |

Solo sessions keep one combined object exactly as today — the split only exists when
`engagementId` is set.

### C6 — Vertex in production, API key in dev

Group mode sends a named client's commercially sensitive stakeholder statements to Gemini. The
deck's own sample fragment is *"residency is not negotiable for claims data"*, so routing the
pile through the consumer API endpoint on a shared key is an awkward look in a client
conversation.

The installed SDK (`@google/genai` 2.7.0) supports both backends from the same client, so this
is a constructor branch in `server/ai/client.ts`:

```ts
export function getGenAI(): GoogleGenAI | null {
  if (process.env.GENAI_BACKEND === "vertex") {
    return new GoogleGenAI({
      enterprise: true,                          // `vertexai: true` is the legacy alias
      project: process.env.FIRESTORE_PROJECT_ID,
      location: process.env.VERTEX_LOCATION,
    });                                          // ADC — no key material anywhere
  }
  const key = process.env.GEMINI_API_KEY;
  return key && key !== "MY_GEMINI_API_KEY" ? new GoogleGenAI({ apiKey: key }) : null;
}
```

Vertex authenticates as the Cloud Run runtime service account, so **the entire Secret Manager
step disappears from B3/B4** — no key to store, rotate, scope or leak — and you get in-region
processing plus enterprise data-handling terms. Contributors still run `npm run dev` on a plain
API key with no gcloud setup, which is why both paths stay.

Two follow-ons: model ids differ between the backends, so `generateContentWithFallback`'s list
becomes backend-dependent; and that function currently walks three models swallowing each
failure, so a wrong id costs three round trips per request and is invisible. Log which model
actually served, and fail loudly on an exhausted chain.

### C7 — Degradation must be visible

`getGemini()` returning null silently downgrades every route to canned static output — Quick
Fire falls back to *"What's the first word that comes to mind?"*. Ten stakeholders getting
generic prompts in a paid client workshop, with nobody told, is the worst version of this bug.
`/api/whoami` returns `aiEnabled`; the workspace shows an unmissable banner when it is false.
Same for a 429 during a live session: surface it, don't paper over it.

### C8 — Verification (adds to B7)

8. **Corpus.** An engagement AI call sends only `{engagementId}`; server logs show the pile
   assembled server-side with roles and no names.
9. **Single-flight.** Two browsers hit Synthesize within a second: exactly one Gemini call,
   both clients converge on the same version.
10. **No silent fallback.** Force a synthesize failure; assert the shared `synthesized*` fields
    are untouched and an error is shown.
11. **Staleness.** Synthesize, add a fragment, confirm the panel marks the level-set stale.
12. **Style isolation.** A sets socratic; B's next Guided Drill question is unaffected.
13. **Coverage arithmetic.** Seed a pile with zero fragments in one area; assert that area
    reports `Dark` with count 0 without depending on model output.
14. **Backend parity.** Same request against `GENAI_BACKEND=apikey` and `=vertex` returns the
    same schema; the deployed service holds no key material (`gcloud run services describe`
    shows no secret mounts).
