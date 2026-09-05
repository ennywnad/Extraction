# 007 — A status board that looks like the rest of the app

**Status:** intent, in part — the participant-facing board is built. See [STATUS.md](STATUS.md).
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
That is the most distinctive thing about how this is built, and the only way to observe it is
to `curl /healthz` or read `.env`. A board turns the claim into something you can look at.

**Everything needed to draw it is in one place.** `instanceStatus()` in
[status.ts](../../server/status.ts) assembles identity, storage and model, and `/healthz`
serves it, so the board is a rendering job over one value. `source` /
`X-Extraction-AI-Source` carry the per-response half.

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

- **Every fact is computed and collected.** `instanceStatus()` returns identity
  (`mode`, `verified`), storage (`backend`, `live`) and model (`backend`, `chainLength`), and
  `/healthz` serves it unauthenticated. Nothing new needs to be measured or gathered.
- **The disclosure rule is already enforced rather than intended.**
  [test/status.test.ts](../../test/status.test.ts) fails if a project id, IAP audience, model
  id or store path reaches that payload, so the "shapes, not secrets" constraint above is a
  test rather than a note the board has to remember.
- **The shape admits what it does not know.** `storage.live` distinguishes a configured store
  from one this process has actually opened, which is the "say what you cannot see" constraint
  above already expressed in data rather than in prose.
- **`source` / `X-Extraction-AI-Source`** already answer "who wrote this response" per
  request, which is the live half of the board.
- **`Workspace.tsx` already renders a degradation banner** driven by `/healthz`, so there is
  precedent for the app reporting its own configuration to the user, and a component to learn
  the visual language from.
- **The design language is settled and documented**, so this is a layout problem rather than
  a design problem.
- **The board itself exists**, at [StatusBoard.tsx](../../src/components/StatusBoard.tsx):
  four boxes — identity, storage, model, and an MCP box that is grey because
  [001](001-mcp-server-over-the-pile.md) is not built — each showing the branch taken beside
  the branches not taken, and a coral line stating the class of failure the board structurally
  cannot see. One component, two variants: a full board and a popup that sits over the
  workspace. Reachable from a fixed control on every screen.
- **Engagement counts ride a different path from instance facts**, deliberately.
  [engagementStats.ts](../../src/utils/engagementStats.ts) tallies roster, voices, roles,
  fragments, last-five-minutes, modes used and dark areas from the `Session` the workspace
  already polls, so none of it goes near the unauthenticated payload. "Polling now" is the one
  thing the server had to learn: [pollWindow.ts](../../server/pollWindow.ts) counts requests
  per engagement in a 60-second window, in memory, and hands the number over on a response
  header so it answers on a 304 as well as a 200.
- **Which boxes and counts a viewer wants is one object**, in `localStorage`
  ([boardPrefs.ts](../../src/utils/boardPrefs.ts)) — shared by both variants and never sent to
  the server, because it is a preference rather than a fact about the engagement.

## What would have to change

The audience decision has been made and taken the narrow branch: **the participant-safe view
only.** Everything the board draws comes from `/healthz`, so it inherits that payload's
disclosure test rather than needing one of its own. What is left is the other half of that
split, and one line the design asked for:

- **An operator view, if it turns out to be wanted.** What is this deployment, in more detail
  than an unauthenticated payload may carry — which means its own route behind
  `requireIdentity` and its own disclosure rule. Deliberately not built on the argument that it
  is cheaper to add later than to unpick.
- **"Last response: model or fallback."** The live half of the board, and the one design
  element not built. `source` / `X-Extraction-AI-Source` are read by whichever mode component
  made the call, so surfacing it means threading the last-seen value out of nine fetches into
  somewhere shared — a change to the modes rather than a rendering job.

## Open questions

- ~~Its own route, an overlay, or a panel on the dashboard?~~ **Resolved: an overlay**, opened
  from a fixed control present on every screen. A route would have made it a place you navigate
  away to, and the thing it answers — am I wired the way I think I am — is asked while looking
  at something else.
- ~~Does it poll, or is a boot-time snapshot enough?~~ **Resolved: a snapshot**, taken with the
  `/healthz` call the app already makes at load. Nothing in that payload can change without a
  restart. The engagement counts beside it are a different matter and do move: they are
  recomputed from each poll the workspace was already making.
- Does it show _per-route_ provider once that exists, or just the default? Per-route is more
  honest and much busier.

The coverage map is not one of these: it belongs to the engagement rather than to the instance,
which [009](009-the-deferred-group-surface.md) settled by building it there. This board is about
what the instance is wired to.

## Non-goals

- Metrics, graphs, uptime, latency histograms. This is "what am I wired to", not observability.
- Replacing the AI-unavailable banner. That warning is in the user's way on purpose; this is
  somewhere you go to look.
