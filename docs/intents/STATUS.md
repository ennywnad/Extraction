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
