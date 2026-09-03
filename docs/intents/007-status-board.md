# 007 — A status board that looks like the rest of the app

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03

## What

A visual board showing what this instance actually is: which of the expected pieces are
configured, which branch each seam took, where the model is coming from and whether it is
answering, and — once [001](001-mcp-server-over-the-pile.md) exists — what is connected over
MCP.

Not a table of key-value pairs. A cartoon control panel drawn in the same Neo-Brutalist idiom
as everything else: heavy black outlines, hard offset shadows, functional pastel fills,
JetBrains Mono state labels. Something you can read across a room from a projector, that looks
like it belongs to this app and not to a monitoring vendor.

## Why

**The app's central design claim is currently invisible.** _Configuration decides behavior_ —
identity, storage, and the model each select themselves by the presence of what they need.
That is the most distinctive thing about how this is built, and today the only ways to observe
it are reading `.env`, tailing the boot log, or waiting for a coral warning banner to appear.
A board turns the claim into something you can look at.

**Everything needed to draw it now exists and is scattered.** `authMode` resolves at boot,
`getEngagementStore()` logs which store it chose, `getGemini()` knows its backend,
`/healthz` and `/api/whoami` each expose `aiEnabled` independently, and `source` /
`X-Extraction-AI-Source` now report per-response whether a model or a fallback answered. Five
places, one story, no single view.

**The state space is about to get much larger.** With [003](003-local-models-in-solo-mode.md),
[004](004-claude-and-the-gcp-model-gateway.md) and
[006](006-local-assists-before-submit.md), "which model answered" stops being a boolean and
becomes: local, Vertex-Gemini, Vertex-Claude, first-party Claude, or a labelled fallback —
possibly varying per route, and with a local runtime that may be assisting in the browser
without touching the pile at all. At that point a board stops being a nicety.
A facilitator about to run a paid workshop needs to see, at a glance, that the room is wired
the way they think it is.

**It is the natural demo surface.** Someone cloning this repo for the first time gets more
from one screen showing "identity: dev · storage: local file · model: none, serving
fallbacks" than from three pages of README.

## Rough shape

Three seams as three blocks, wired in request order, with the pile and the deliverable hanging
off the end:

```
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ IDENTITY │───▶│ STORAGE  │───▶│  MODEL   │
   │  ● iap   │    │ ● file   │    │ ○ vertex │
   │  ○ dev   │    │ ○ firestore│  │ ● local  │
   └──────────┘    └──────────┘    │ ○ peer   │
                                    └──────────┘
```

Colour carries the state, reusing the palette the app already assigns meaning to:

| Colour            | Means                                                                    |
| :---------------- | :----------------------------------------------------------------------- |
| Emerald `#51CF66` | Configured and answering                                                 |
| Golden `#FFD43B`  | Working but degraded — serving fallbacks, dev identity, local file store |
| Coral `#FF6B6B`   | Expected and missing, or misconfigured                                   |
| Blue `#4DABF7`    | Informational — counts, versions, last-answered-by                       |

Match the mode components in [src/components/Modes/](../../src/components/Modes/) rather than
inventing styling, same as any other surface here.

## Two constraints worth designing around

**A board can only show states a running process can be in.** This app fails closed on purpose:
[authMode.ts](../../server/authMode.ts) _exits the process_ on an inconsistent identity
configuration rather than serving unverified identities. So the most dangerous
misconfigurations are precisely the ones the board will never render, because there is no
server left to render them. A board that shows all green and implies "everything is fine" is
lying by omission about the class of failure it structurally cannot see. It should say what it
does not know.

**It must show shapes, not secrets.** A status board naturally wants to print the GCP project
id, the IAP audience, the model chain, the store path. That is deployment topology, and
`/healthz` is unauthenticated — publishing it would reintroduce exactly the disclosure that
`sendAiError` was just written to prevent. So: "Vertex · connected" rather than the project id;
"3 models in chain" rather than their ids; "Firestore" rather than the project. If a detailed
view is worth having, it goes behind `requireIdentity`, and the split between the two is a
design decision rather than an afterthought.

## What the code already supports

- **Every fact is already computed** — `authConfig.mode`, the store branch, `getGemini()`,
  the model chain, `aiEnabled`. Nothing new needs to be measured.
- **`source` / `X-Extraction-AI-Source`** already answer "who wrote this response" per
  request, which is the live half of the board.
- **`Workspace.tsx` already renders a degradation banner** driven by `/healthz`, so there is
  precedent for the app reporting its own configuration to the user, and a component to learn
  the visual language from.
- **The design language is settled and documented**, so this is a layout problem rather than
  a design problem.

## What would have to change

- **A `/api/status` endpoint** aggregating the five scattered facts into one shape. Mostly
  assembly.
- **`getEngagementStore()` would have to report its choice, not just log it.** Right now the
  branch is `console.log`-only; nothing can ask which store is live.
- **A decision about audience.** Operator-facing (what is this deployment) and
  participant-facing (is the AI on) are different boards with different content and different
  authorization. Trying to be both is how it ends up being neither.

## Open questions

- Its own route, an overlay, or a panel on the dashboard?
- Does it poll, or is a boot-time snapshot enough? Most of it cannot change without a restart
  — model backend, auth mode, store — so the only genuinely live parts are "did the last call
  succeed", MCP connections, and (with [006](006-local-assists-before-submit.md)) whether this
  browser can currently reach a local runtime.
- Does it show _per-route_ provider once that exists, or just the default? Per-route is more
  honest and much busier.
- Is there a place for the coverage map here, or does that belong to the engagement rather
  than the instance?

## Non-goals

- Metrics, graphs, uptime, latency histograms. This is "what am I wired to", not observability.
- Replacing the AI-unavailable banner. That warning is in the user's way on purpose; this is
  somewhere you go to look.
