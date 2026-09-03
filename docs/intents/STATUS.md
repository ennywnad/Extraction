# Intent status log

What has actually landed against [the intents](README.md), newest first. One entry per
increment, with the reasoning that picked it — so the next person starts from a decision
rather than from the whole table again.

Nothing here schedules anything. An intent stays an intent until its file says otherwise;
this file only records which pieces of one have become code.

## Legend

| Marker        | Means                                                                |
| :------------ | :------------------------------------------------------------------- |
| **landed**    | In `main`, covered by a test, and the intent file has been corrected |
| **in part**   | A named slice landed; the intent itself is still open                |
| **unchanged** | No code yet                                                          |

## Where each intent stands

| #                                              | Intent                        | State                                      |
| :--------------------------------------------- | :---------------------------- | :----------------------------------------- |
| [001](001-mcp-server-over-the-pile.md)         | MCP server over the pile      | unchanged                                  |
| [002](002-model-provider-seam.md)              | Provider-neutral model seam   | unchanged                                  |
| [003](003-local-models-in-solo-mode.md)        | Local models in solo mode     | unchanged                                  |
| [004](004-claude-and-the-gcp-model-gateway.md) | Claude as a deployment choice | unchanged                                  |
| [005](005-listening-mode.md)                   | Listening mode                | unchanged                                  |
| [006](006-local-assists-before-submit.md)      | Local assists before submit   | unchanged                                  |
| [007](007-status-board.md)                     | Status board                  | **in part** — the seams now report (below) |
| [008](008-deploying-group-mode.md)             | Deploying group mode          | unchanged — still never run off a laptop   |
| [009](009-the-deferred-group-surface.md)       | The deferred group surface    | unchanged                                  |

---

## 2026-09-03 — 009, in part: the coverage map is drawn

**What landed.** The map of what a room has _not_ discussed, which was computed, shaped, shipped
across the wire and never rendered:

- [src/components/CoverageMap.tsx](../../src/components/CoverageMap.tsx) — the wall. Black cells
  for dark areas, golden for partial, emerald for defined; fragment and voice counts per area.
- [src/components/ExportPanel.tsx](../../src/components/ExportPanel.tsx) — renders it above the
  group deliverable, and includes it in the copied markdown, so a facilitator's copy no longer
  presents the outline as though the pile had covered everything.
- [server/ai/synthesis.ts](../../server/ai/synthesis.ts) — mirrors `coverage` onto the session
  alongside `synthesized*`.
- `AreaCoverage` moved to [src/types.ts](../../src/types.ts) (re-exported from
  [coverage.ts](../../server/ai/coverage.ts)) since it now crosses the wire in both directions,
  and `ServerMetaPatch` in [store/types.ts](../../server/store/types.ts) keeps it server-written.
- Six render tests and one write-gate test.

**Two things the intent had not anticipated, and they are the substance of the increment.**

_The value crossed the wire to one person only._ 009 called this "a rendering job over a value
that already crosses the wire", and the value does — in the synthesize response, to whoever
clicked Generate. Rendered from there alone, the map would have existed for one participant
until they reloaded, which is no use for something a room is meant to watch. Mirroring it onto
the session puts it in the ordinary poll, so every viewer gets it for no new endpoint.

_A zero only means silence if every fragment was placed._ The arithmetic guarantees an area with
no fragments reports zero — that is why it is not a model call. But the _input_ is a model call,
and the classifier can return fewer assignments than there are fragments, or area names matching
none of the ten. Those fragments are then in the pile and in no cell, and a dark area reads as
unspoken when it is only unplaced. So the map states how much of the pile it actually placed.
Without that line the map's most valuable claim is unfalsifiable.

**What it deliberately did not do.** No live coverage — a rendered wall is not a live one, and
[005](005-listening-mode.md) still needs a non-model classifier for that. No drill-down into an
area's fragments, though `fragmentIds` is persisted and would support one. Coverage is not on
`/healthz` or [007](007-status-board.md)'s board: it belongs to the engagement, which is now
settled rather than open in both files.

**What it cost elsewhere.** `coverage` is deliberately absent from the route layer's
`META_FIELDS` and from `SessionMetaPatch`, so the store interface grew a second patch type for
what the server may write. That is the same decision the arithmetic already embodies — the one
count nobody should be able to argue with — expressed in the type system.

**Caveat worth stating plainly.** The component is verified by rendering it to a string and
asserting its claims; it has not been looked at in a browser, and no group level set has ever
been generated outside a laptop (see [008](008-deploying-group-mode.md)). The wording and the
arithmetic are tested. The layout is not.

**Next, if picking up here.** 007's board is the remaining unbuilt half of a now-cheap intent
and needs only its audience decision. 005's live coverage is the more interesting one and is now
purely a classification problem.

---

## 2026-09-03 — 007, in part: every seam reports its choice

**What landed.** Each of the three seams can now be _asked_ which branch it took, and one
shape collects the answers:

- [server/ai/client.ts](../../server/ai/client.ts) — `geminiBackend()` returns
  `vertex` / `apikey` / `none`, recorded where the client is actually built rather than
  re-derived from the environment afterwards. `modelChain()` is exported so its length can be
  reported without its ids.
- [server/store/index.ts](../../server/store/index.ts) — `storeBackend()` returns
  `firestore` / `file`, and `storeIsLive()` answers the separate question of whether that
  branch has been taken in this process at all.
- [server/status.ts](../../server/status.ts) — `instanceStatus()` assembles identity, storage
  and model into one value, now served by `/healthz`.
- `/api/whoami` derives `aiEnabled` from that same value instead of computing its own.
- [test/status.test.ts](../../test/status.test.ts) — five tests. Four are about the shape; the
  first is the one that matters, and it asserts that no project id, IAP audience, model id or
  store path appears anywhere in a payload served unauthenticated.

**Why this slice, and why first.** [The ordering note](README.md#in-what-order-if-they-were-built)
splits 007 in half and sends this half early: the board wants the full state space and belongs
at the end, but "each seam reports its choice rather than logging it" only gets more expensive
the longer it waits, because 002/003/004 add providers and every new one is another scattered
fact to go back for. It is also the smallest thing on the list that is unambiguously not a
rewrite risk — no seam moved, nothing was abstracted, three functions were added.

**What it deliberately did not do.** No `/api/status`, no board, no UI. 007's open question is
_audience_ — an operator view and a participant view are different boards with different
authorization — and building the endpoint would have answered it by accident. The reporting
half has no such question in it, which is exactly why it could go first.

**What this buys the next increment.** `/healthz` is now a shape rather than a boolean, so the
board is a rendering job over a value that already crosses the wire — the same position
[009](009-the-deferred-group-surface.md) describes the coverage map being in.

**Next, if picking up here.** Either half of 007 is now cheap; the board still needs its
audience decision made first. The other candidate with no decisions blocking it is 009's
coverage map: computed in [coverage.ts](../../server/ai/coverage.ts), returned on the
`LevelSet`, and the string `coverage` still appears nowhere in [src/](../../src/).

**Still true, and worth repeating.** [008](008-deploying-group-mode.md) comes before all of it.
Firestore, IAP verification and Vertex have not executed once outside a laptop, and
`storage.live: false` in the new payload is that fact stated in the shape rather than in prose.
