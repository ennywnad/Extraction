# Group Mode ("Level Set") — Core Sharing, v1

## Context

`ennywnad/extraction` ("Extraction") is a single-user, browser-only thought-extraction tool: sessions and thoughts live entirely in `localStorage` (`src/utils/localDB.ts`), and the only server code (`server.ts`) is a stateless Gemini-AI proxy with no auth or datastore.

A companion Claude Design mockup bundle (`Extraction Level Set.dc.html`, not code) proposes a hosted "group mode": a room of stakeholders contributing to one shared pile over a client engagement, hosted on **Cloud Run + Identity-Aware Proxy (IAP) + Firestore**, with each fragment stamped with the verified contributor's identity (name + role) rather than freely typed. That doc is explicitly marked "concept, not built."

Decisions already locked in with the user (not open for re-litigation):
- **Fidelity**: build the real thing — real Firestore, real IAP JWT verification, no mocks in the production code path. This session cannot provision GCP resources (no project, no credentials), so the code must be written to work once that infra exists, with a local-dev fallback so `npm run dev` keeps working with zero cloud config (mirroring the existing `getGemini()` null-fallback pattern for the Gemini key).
- **Target repo**: `ennywnad/extraction` (cloned at `/home/claude/extraction`), not the design-mockup bundle.
- **Feature scope, "core sharing only, first"**: identity-stamped attribution on fragments, one shared pile per engagement, append-only (nobody edits/deletes anyone else's fragment). Explicitly **out of scope** for this pass: comments/+1, coverage map, scope ledger, open-questions/assumptions/definitions registers, the two-workshop async engagement-log UI, facilitator merge-of-duplicates. These are noted as future extension points, not designed in detail.
- **Card visual style**: locked to the mockup's "Attribution-A" treatment — 22×22 initials badge, stacked bold name / gray uppercase role, existing mode-dot demoted next to the fragment index on the right. Solo (non-engagement) cards render exactly as today — zero visual change there.

A key discovery that changes the deployment section below: this repo was scaffolded by **Google AI Studio** (see `.antigravity/*.pbtxt`, `.env.example`'s `APP_URL` comment) and already deploys to Cloud Run through AI Studio's own managed build/deploy pipeline, which also injects secrets (`GEMINI_API_KEY`) as env vars. So we do **not** hand-roll a Dockerfile/CI — we add the two new env vars the same way, and document the IAP/Firestore/Google-Group provisioning as a manual checklist for the human, separate from app code.

## 1. Data model — `src/types.ts`

Additive only, nothing existing changes shape:

```ts
export interface AuthorStamp {
  email: string;
  name: string;
  role: string;
}

export interface Thought {
  // ...unchanged fields...
  author?: AuthorStamp; // present only for thoughts in an engagement; absent = solo/local
}

export interface Session {
  // ...unchanged fields...
  engagementId?: string;                     // set (== session.id) when this session is
                                              // server-held in Firestore instead of localStorage
  roster?: Record<string, AuthorStamp>;      // email -> identity, present only on engagements
}
```

**Engagement = a `Session`, persisted server-side instead of in `localStorage`, 1:1** (`engagementId` doubles as `Session.id`). This is the minimal-churn mapping: every existing consumer of `Session`/`Thought` — all 12 `src/components/Modes/*.tsx`, `ExportPanel.tsx` — keeps compiling and behaving identically without modification, because they only ever read `Session`/`Thought` shapes and call the same `onUpdateSession`/`onAddThought`-style callbacks they call today.

## 2. Server-side auth — new `server/iapAuth.ts`

- Reads the `X-Goog-IAP-JWT-Assertion` header.
- Uses **`google-auth-library`** (`OAuth2Client.getIapPublicKeys()` + `verifySignedJwtWithCertsAsync(...)`), matching Google's documented Node IAP verification flow — no hand-rolled JWKS/ES256 code.
- `IAP_AUDIENCE` env var holds the expected `aud` claim (only known once the IAP resource is provisioned).
- Express middleware `requireIdentity`:
  - `IAP_AUDIENCE` set → verify the header; missing/invalid → `401`. On success: `req.identity = { email, sub, verified: true }`.
  - `IAP_AUDIENCE` unset (local dev, mirrors `getGemini()`'s fallback) → `req.identity = { email: process.env.DEV_USER_EMAIL || "dev@local.test", sub: "local-dev", verified: false }`.
- Mounted only on the new `/api/engagement/*` router — the existing stateless `/api/session/*` Gemini routes are untouched.

## 3. Server-side datastore

- `server/store/types.ts` — `EngagementStore` interface: create/get/list engagement, append/patch/delete thought (author-gated), get/upsert roster entry, patch session meta (activeMode, modeHistory, status).
- `server/store/firestoreEngagementStore.ts` — production impl, `@google-cloud/firestore` Admin SDK, Application Default Credentials (no key files committed). Engagement doc at `engagements/{id}`; thoughts as a **subcollection** `engagements/{id}/thoughts/{thoughtId}` (not a flat array field) to avoid the 1 MiB document ceiling and concurrent-writer contention a shared array would hit under real multi-user load. Reassembled into the existing `Session.thoughts: Thought[]` wire shape on read, so the frontend needs no awareness of the subcollection split.
- `server/store/fileEngagementStore.ts` — local-dev fallback, same interface, single JSON file at `.data/engagements.json` (gitignored) read/written whole-file, same spirit as `localDB.ts`.
- `server/store/index.ts` — factory mirroring `getGemini()`: Firestore impl if `FIRESTORE_PROJECT_ID` is set, else the file-backed impl.
- `server/engagementRoutes.ts` — `express.Router()` mounted as `app.use('/api/engagement', requireIdentity, engagementRouter)`, plus `GET /api/whoami`:

| Route | Behavior |
|---|---|
| `GET /api/whoami` | `{ email, name, role, dev: !verified }` from identity + roster lookup. |
| `POST /api/engagement` | `{topic, intention}` → creates engagement, seeds roster with creator (default role `"Facilitator"`), returns `Session`. |
| `GET /api/engagement` | Engagements where caller's email is in roster (for a "join" picker). |
| `GET /api/engagement/:id` | Full `Session` (meta + hydrated thoughts + roster). `404` if missing. |
| `PATCH /api/engagement/:id` | Session-meta updates (`activeMode`, `modeHistory`, `status`, `synthesized*`) — any roster member may update. |
| `POST /api/engagement/:id/thoughts` | Server stamps `id`, `timestamp`, `author` (roster lookup by caller email; auto-provisions a roster entry with role `"Contributor"` on first contribution so nobody is blocked). |
| `PATCH /api/engagement/:id/thoughts/:tid` | `403` unless `thought.author.email === caller.email` — enforces "nobody edits anyone" server-side, not just hidden in the UI. |
| `DELETE /api/engagement/:id/thoughts/:tid` | Same author-only gate. |
| `GET /api/engagement/:id/roster` | Roster map. |
| `PUT /api/engagement/:id/roster/:email` | Self-edit-only, to set/correct own display name/role. |

## 4. Frontend integration

New `src/utils/engagementAPI.ts` (parallel to `localDB.ts`): thin `fetch` wrappers for every route above.

**Key insight from reading `App.tsx`/`Workspace.tsx`/all `Modes/*.tsx`**: every thought mutation in the app — all 12 modes plus Workspace's own delete/edit/scratch-add — already funnels through one function, `App.tsx`'s `handleUpdateSession(updates: Partial<Session>)`, which every caller invokes by composing a **whole new `thoughts` array** (e.g. `onUpdateSession({ thoughts: session.thoughts.filter(...) })`). This means the routing logic only needs to change in **one place**:

- `handleUpdateSession` branches on `currentSession.engagementId`:
  - **Absent** (solo session) → today's exact code path, byte-for-byte unchanged (`persistSession` to localStorage).
  - **Present** (engagement) → diff `currentSession.thoughts` (before) against `updates.thoughts` (if included in this update) by `id`: new ids → `POST` each; ids present in both with different content → `PATCH` each; ids missing from the new array → `DELETE` each. Non-thought fields in `updates` (activeMode, modeHistory, status, synthesized*) → `PATCH /api/engagement/:id`. Merge the server's response (which fills in server-stamped `id`/`timestamp`/`author` for new thoughts) back into `currentSession` state.
  - This means **zero changes** to any of the 12 `Modes/*.tsx` files, `ExportPanel.tsx`, or Workspace's existing `handleDeleteThought`/`handleSaveEdit`/`handleAddDirectThought` call sites — they keep composing whole-array updates exactly as today; only the one function they all call gets smarter.
- Polling: while `currentSession?.engagementId` is set, a `setInterval` (5s) + a `window` `focus` listener re-fetch `GET /api/engagement/:id` and merge into state, skipped while a local edit-in-progress (`editingThoughtId` in Workspace) is active to avoid clobbering in-flight typing. This is the "core" sharing mechanism — no WebSocket/SSE/Firestore-listener in v1; noted as a fast-follow.
- `App.tsx` gains: `viewerIdentity` (from `whoami()` on load), `handleCreateEngagement`/`handleJoinEngagement(id)` alongside existing `handleStartSession`/`handleLoadSession`.
- `IntakeForm.tsx`: additive panel near the existing "Previous Sessions" list (~line 858) for "Group Engagements" — new props `onCreateEngagement`, `onJoinEngagement`, `myEngagements`. No existing solo-flow code paths change.
- `Workspace.tsx`, two additive changes only:
  1. Pile-card header: when `thought.author` is present, render the locked Attribution-A markup (initials badge + name/role stack, mode-dot demoted next to `#N`); when absent, render exactly today's header.
  2. Edit/delete hover affordances (`Edit2`/`Trash2`) only render when `!thought.author || thought.author.email === viewerIdentity.email` — enforced again server-side per §3, this is UI-level only.

## 5. Dependencies & env vars

`package.json` deps: `@google-cloud/firestore`, `google-auth-library`.

`.env.example` additions (same AI-Studio-injected-secrets convention as `GEMINI_API_KEY`):
```
FIRESTORE_PROJECT_ID=
IAP_AUDIENCE=
DEV_USER_EMAIL=dev@local.test
DEV_USER_NAME=Local Dev
```
`.gitignore`: add `.data/`.

Small fix needed for local two-user testing: `server.ts` hardcodes `const PORT = 3000` → `Number(process.env.PORT) || 3000`.

## 6. Deployment

No custom Dockerfile/CI — this repo already deploys via **Google AI Studio's** managed Cloud Run pipeline (confirmed via `.antigravity/` build history and the `APP_URL`/`GEMINI_API_KEY` injection convention in `.env.example`). We only add `FIRESTORE_PROJECT_ID`/`IAP_AUDIENCE` following that same secrets convention.

Add `DEPLOYMENT.md` — a manual checklist for the human, since this session provisions nothing:
1. Enable `iap.googleapis.com` and `firestore.googleapis.com` on the project; create a Firestore database (Native mode).
2. Enable IAP directly on the Cloud Run service (simplest topology — the mockup's external-LB variant documented as an alternative for a custom domain/Cloud Armor).
3. Create the Google Group for the engagement's members; grant it `roles/iap.httpsResourceAccessor` on the IAP resource.
4. Grant the Cloud Run runtime service account `roles/datastore.user`.
5. Set `FIRESTORE_PROJECT_ID` and `IAP_AUDIENCE` (read off the IAP resource once created) via AI Studio's secrets panel, same as `GEMINI_API_KEY`.
6. Verify: non-member request → 403 at the IAP layer (never reaches the app); member request → 200 and a submitted thought carries a real stamped author.

## 7. Verification (no GCP required)

- `npm run dev` with no `FIRESTORE_PROJECT_ID`/`IAP_AUDIENCE` set → confirm the solo flow (create/edit/delete own thoughts) is unchanged.
- `npm run lint` (`tsc --noEmit`) passes.
- Two-user simulation: two `npm run dev` processes on different `PORT`s with different `DEV_USER_EMAIL`/`DEV_USER_NAME`, same cwd (shared `.data/engagements.json`). From process A, create an engagement + add a thought; from process B, join the same id + add a thought; confirm both piles show both thoughts with correct attribution, each user sees edit/delete only on their own cards, and polling surfaces the other's contribution without manual reload.
- Fail-closed check: with `IAP_AUDIENCE` set but no assertion header (curl), confirm `401`.

### Critical files
- `src/types.ts`, `src/App.tsx`, `src/components/Workspace.tsx`, `src/components/IntakeForm.tsx`
- `server.ts` (mount point only), new `server/iapAuth.ts`, `server/engagementRoutes.ts`, `server/store/*`
- New `src/utils/engagementAPI.ts` (pattern-mirrors `src/utils/localDB.ts`)
- `package.json`, `.env.example`, `.gitignore`, new `DEPLOYMENT.md`