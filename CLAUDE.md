# CLAUDE.md

Extraction is a thought-extraction app: twelve extraction "modes" surface fragments into a
pile, Gemini synthesizes the pile into an outline. It runs two ways from one codebase —
solo (fragments in `localStorage`) and group (a shared pile on the server, behind IAP).

## Commands

| Command          | What it does                                                                             |
| :--------------- | :--------------------------------------------------------------------------------------- |
| `npm run dev`    | Server + Vite middleware on :3000. `AUTH_MODE=dev` identity.                             |
| `npm run check`  | **The verification loop.** `format:check`, `lint`, `test`. Run before calling work done. |
| `npm run lint`   | `tsc --noEmit`. There is no ESLint — don't reach for one.                                |
| `npm run format` | Prettier over the repo. A hook formats edited files, so you rarely run it by hand.       |
| `npm test`       | `node:test` via tsx over `test/*.test.{ts,mjs}`.                                         |
| `npm run build`  | Vite client build + esbuild server bundle to `dist-server/server.cjs`.                   |

Healthy `npm run check` ends with:

```
# tests 40
# pass 40
# fail 0
```

## Configuration decides behavior

Every backend picks itself by **presence of configuration**, not by a flag. Read
[.env.example](.env.example) before changing any of this.

- **Identity** — `AUTH_MODE=iap` verifies the IAP JWT; `dev` asserts an identity from
  `DEV_USER_*`. Resolved once at boot in [server/authMode.ts](server/authMode.ts), which
  **exits the process** on an inconsistent config rather than failing at request time. That
  fail-closed behavior is deliberate; keep it.
- **Storage** — `FIRESTORE_PROJECT_ID` set means Firestore, unset means a JSON file under
  `.data/`. So a fresh clone runs with no cloud setup.
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
- Adding an extraction mode means touching `VALID_MODES` in both
  [src/App.tsx](src/App.tsx) and [server/store/shape.ts](server/store/shape.ts).
- **Prompts do not live in route handlers.** They are pure functions in
  [server/ai/sessionPrompts.ts](server/ai/sessionPrompts.ts) (solo) and
  [server/ai/levelSetPrompt.ts](server/ai/levelSetPrompt.ts) (group), so a prompt change is a
  readable diff. Route handlers hold the schema and the plumbing only.
- Share links are **base64url** ([src/utils/shareLink.ts](src/utils/shareLink.ts)). Standard
  base64's `+` becomes a space in a query string and `atob` then silently drops it. Don't
  reintroduce a bare `btoa`.

## Conventions

- TypeScript ESM throughout; server imports carry the `.ts` extension (tsx/esbuild resolve it).
- UI is Tailwind v4 in a Neo-Brutalist idiom: `border-3 border-black`,
  `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`, pastel fills. Match the neighbouring mode
  component in [src/components/Modes/](src/components/Modes/) rather than inventing styling.
- Plans and design records live in [planv1/](planv1/) and are committed with their provenance.
- Roadmap direction lives in [docs/intents/](docs/intents/): one file per idea, each carrying an
  honest read of how far the current seams already go. Not plans, not scheduled. If work starts
  on one, its intent file is the brief — and the "what the code already supports" section in it
  is the first thing to re-verify, since it describes the repo on the day it was written.

## Deploying

`./scripts/deploy.sh` pushes **straight to production** Cloud Run. Never run it unprompted;
see [DEPLOYMENT.md](DEPLOYMENT.md).
