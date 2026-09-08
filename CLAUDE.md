# CLAUDE.md

Extraction is a thought-extraction app: twelve extraction "modes" surface fragments into a
pile, Gemini synthesizes the pile into an outline. It runs two ways from one codebase —
solo (fragments in `localStorage`) and group (a shared pile on the server, behind IAP).

## Commands

| Command                  | What it does                                                                             |
| :----------------------- | :--------------------------------------------------------------------------------------- |
| `npm run dev`            | Server + Vite middleware on :3000. `AUTH_MODE=dev` identity.                             |
| `npm run check`          | **The verification loop.** `format:check`, `lint`, `test`. Run before calling work done. |
| `npm run lint`           | `tsc --noEmit`. There is no ESLint — don't reach for one.                                |
| `npm run format`         | Prettier over the repo. A hook formats edited files, so you rarely run it by hand.       |
| `npm test`               | `node:test` via tsx over `test/*.test.{ts,mjs}`.                                         |
| `npm run test:firestore` | The same suite with the store contract also run against Firestore. Needs an emulator.    |
| `npm run build`          | Vite client build + esbuild server bundle to `dist-server/server.cjs`.                   |

Healthy `npm run check` ends with:

```
# tests 154
# pass 153
# fail 0
# skipped 1
```

The skip is `FirestoreEngagementStore` in
[test/storeContract.test.ts](test/storeContract.test.ts), which needs an emulator:

```
gcloud emulators firestore start --host-port=localhost:8484   # needs a JRE on PATH
npm run test:firestore                                        # 164 tests, 0 skipped
```

## Configuration decides behavior

Every backend picks itself by **presence of configuration**, not by a flag. Read
[.env.example](.env.example) before changing any of this.

- **Identity** — `AUTH_MODE=iap` verifies the IAP JWT; `dev` asserts an identity from
  `DEV_USER_*`. Resolved once at boot in [server/authMode.ts](server/authMode.ts), which
  **exits the process** on an inconsistent config rather than failing at request time. That
  fail-closed behavior is deliberate; keep it.
- **Storage** — `FIRESTORE_PROJECT_ID` set means Firestore, unset means a JSON file under
  `.data/`. So a fresh clone runs with no cloud setup. Both implementations answer one set of
  assertions in [test/storeContract.test.ts](test/storeContract.test.ts) — add to that file
  rather than to one store's tests, or the production store goes back to being assumed.
- **Gemini** — `GENAI_BACKEND=vertex` (ADC, no key material) or `apikey` (local dev).
  `getGemini()` returns `null` when unconfigured and **every AI route has a static fallback**
  — the app must stay usable with no AI. Preserve that when adding a route, and send the
  fallback through `sendFallback()` from [server/ai/respond.ts](server/ai/respond.ts)
  so it is labelled (`source`, plus a header) rather than passed off as generated. The group
  level set is the one exception: it refuses rather than filling a client deliverable.

## Architecture notes that aren't obvious

- `Session.engagementId` is the mode switch: present = group mode, absent = solo.
- [src/utils/engagementSync.ts](src/utils/engagementSync.ts) **never infers a deletion from a
  fragment's absence.** Modes compose whole new `thoughts` arrays from a possibly-stale
  snapshot, so absence means "older than the server", not "removed". Deletion is an explicit
  call. Don't "simplify" this into an array diff.
- Coverage arithmetic ([server/ai/coverage.ts](server/ai/coverage.ts)) is deliberately **not**
  delegated to the model — a count of zero has to be right every time.
- The model chain in [server/ai/client.ts](server/ai/client.ts) advances **only** for
  "this model id is not served here". 400/401/403 are fatal and rethrown with their status;
  transient 408/429/5xx are the SDK's `retryOptions` backoff to handle, not the chain's.
- **An AI route reports a failure with `sendAiError()`**, never by formatting its own. A
  message reaches the caller only if it is a `UserFacingError`; everything else is summarised,
  because Gemini and Firestore errors both name the project, and `/api/session/*` has no
  identity requirement in a solo deployment. Allowlist, not denylist. A 429 — the only status
  a caller can act on — passes through.
- Adding an extraction mode means touching four places, and **a forgotten one is a
  `npm run lint` failure rather than a mode nobody can reach.** Three are keyed on
  `ExtractionMode`, so the missing key is the error: `EMPTY_MODE_PROGRESS` in
  [src/App.tsx](src/App.tsx) and in [server/store/shape.ts](server/store/shape.ts), and
  `MODE_CARDS` in [src/components/Workspace.tsx](src/components/Workspace.tsx) (the card and,
  derived from it, the pile filter). The fourth is the render `switch` in `App.tsx`, whose
  `default` assigns the mode to `never`. That last one only works because `@types/react` is
  installed — without it `tsc` reads `node_modules/react/index.js` and every value from a hook
  is `any`, which silently un-checks the whole client. Don't drop those types.
- **Prompts do not live in route handlers.** They are pure functions in
  [server/ai/sessionPrompts.ts](server/ai/sessionPrompts.ts) (solo) and
  [server/ai/levelSetPrompt.ts](server/ai/levelSetPrompt.ts) (group), so a prompt change is a
  readable diff. Route handlers hold the schema and the plumbing only.
- The **production** static branch (`NODE_ENV=production`) is only covered by
  `test/productionServing.test.mjs`, via `DIST_DIR`. Nothing else runs the server in
  production mode, so a router change can pass every other test and still fail at boot — an
  Express 4->5 bump did exactly that, because a bare `"*"` route is invalid under
  path-to-regexp v8. Each server-spawning test file needs its **own port** (node runs test
  files in parallel), and must actually reap the process in `after` — a spawned server that
  outlives its test holds the pipes and hangs a CI step long after the suite reports green.
  `npm test` carries `--test-timeout` so that failure mode fails instead of stalling.
- **The chorus is arithmetic, and calling a model from it would be the obvious wrong fix.**
  [src/utils/chorus.ts](src/utils/chorus.ts) links a fragment to the ones sharing its uncommon
  words, entirely in the browser, in both solo and group mode. It has no route, no prompt module
  and no `sendFallback`, and that is deliberate twice over: it fires on **every fragment from
  every participant**, so it would be by a wide margin the highest-volume AI call in the app —
  well past synthesis, which is single-flight per engagement and capped at ten per window — and
  the only thing a model would add is the wording, which is the exact part that must not
  editorialise. "Nobody else has been here" is one careless sentence away from "nobody agrees
  with you". Same rule as [coverage.ts](server/ai/coverage.ts): counting is not a model's job.
  The consequence worth keeping is that it behaves identically with Gemini unconfigured.
- Share links are **base64url** ([src/utils/shareLink.ts](src/utils/shareLink.ts)). Standard
  base64's `+` becomes a space in a query string and `atob` then silently drops it. Don't
  reintroduce a bare `btoa`.

## Conventions

- TypeScript ESM throughout; server imports carry the `.ts` extension (tsx/esbuild resolve it).
- UI is Tailwind v4 in a Neo-Brutalist idiom: `border-3 border-black`, `shadow-hard-4`, pastel
  fills. Match the neighbouring mode component in [src/components/Modes/](src/components/Modes/)
  rather than inventing styling.
- **Every colour a component names must be a token in [src/index.css](src/index.css)** —
  `bg-paper`, `bg-butter`, `shadow-hard-4` — never `bg-[#F8F7F4]` and never a hex in a JS
  value. That file remaps the custom properties Tailwind v4 already compiles every utility
  into, so the dark theme is one block there and **no component contains a `dark:` variant**.
  An arbitrary value compiles to a literal, cannot be reached by the remapping, and shows up
  as a patch of daylight in a dark room. [test/theme.test.ts](test/theme.test.ts) fails on
  one, on a hue with no dark ramp, and on a hard shadow written out longhand.
- Plans and design records live in [planv1/](planv1/) and are committed with their provenance.
- Roadmap direction lives in [docs/intents/](docs/intents/): one file per idea, each carrying an
  honest read of how far the current seams already go. Not plans, not scheduled. If work starts
  on one, its intent file is the brief — and the "what the code already supports" section in it
  is the first thing to re-verify, since it describes the repo on the day it was written.

## Deploying

`./scripts/deploy.sh` pushes **straight to production** Cloud Run. Never run it unprompted;
see [DEPLOYMENT.md](DEPLOYMENT.md).

Who can reach a deployment is **entirely** an IAM question — one binding of
`roles/iap.httpsResourceAccessor` on the service's IAP resource. The app has no allowlist:
[server/iapAuth.ts](server/iapAuth.ts) trusts that IAP already authorised the caller and only
establishes who they are, and the engagement roster is auto-join. So an access request means
[scripts/access.sh](scripts/access.sh) (`list` / `check` / `grant` / `revoke`), never an app
change. Its `check` reads the project policy, group membership and the IAP service agent's
`run.invoker` as well as the service's own policy, because a "no" from any of those other three
is invisible in the obvious one — [test/accessScript.test.mjs](test/accessScript.test.mjs)
pins that against a stub `gcloud`.
