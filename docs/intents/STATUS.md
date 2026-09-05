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

| #                                              | Intent                        | State                                                     |
| :--------------------------------------------- | :---------------------------- | :-------------------------------------------------------- |
| [001](001-mcp-server-over-the-pile.md)         | MCP server over the pile      | unchanged                                                 |
| [002](002-model-provider-seam.md)              | Provider-neutral model seam   | unchanged                                                 |
| [003](003-local-models-in-solo-mode.md)        | Local models in solo mode     | unchanged                                                 |
| [004](004-claude-and-the-gcp-model-gateway.md) | Claude as a deployment choice | unchanged                                                 |
| [005](005-listening-mode.md)                   | Listening mode                | unchanged — but its wall now exists                       |
| [006](006-local-assists-before-submit.md)      | Local assists before submit   | unchanged                                                 |
| [007](007-status-board.md)                     | Status board                  | **in part** — reported, and now drawn (below)             |
| [008](008-deploying-group-mode.md)             | Deploying group mode          | **in part** — two preparatory items; still never deployed |
| [009](009-the-deferred-group-surface.md)       | The deferred group surface    | **in part** — the coverage map is built                   |
| [010](010-model-armor.md)                      | Model Armor at the prompt     | unchanged                                                 |

---

## 2026-09-05 — 007, in part: the board is drawn

**What landed.** The half of 007 that was still a rendering job:

- [src/components/StatusBoard.tsx](../../src/components/StatusBoard.tsx) — the board. Four
  boxes (identity, storage, model, and MCP, which is grey and says so), the branch each seam
  took beside the branches it did not, and the coral line stating the class of failure it
  cannot see. Two variants from one component: a board you go to look at, and a popup that
  sits over the workspace.
- [src/utils/engagementStats.ts](../../src/utils/engagementStats.ts) — the counts a room can
  be told about itself, as arithmetic over the `Session` the workspace already polls.
- [server/pollWindow.ts](../../server/pollWindow.ts) — a rolling count of polls per
  engagement, handed over on `X-Extraction-Polling` from
  [engagementRoutes.ts](../../server/engagementRoutes.ts).
- [src/utils/boardPrefs.ts](../../src/utils/boardPrefs.ts) — which boxes and counts to show,
  one object for both views, in `localStorage`.
- `InstanceStatus` moved to [src/types.ts](../../src/types.ts) (re-exported from
  [status.ts](../../server/status.ts)) for the reason `AreaCoverage` did: a client component
  now draws it. The server still assigns its own union types into that shape, so a new branch
  on any seam nobody declared is a compile error rather than a cell the board cannot render.
- 30 tests across three files.

**The audience question is answered, and narrowly.** 007 said audience was the only thing
blocking this, and the answer is: **the participant-safe view only.** Everything drawn comes
from `/healthz`, which is already guarded by [test/status.test.ts](../../test/status.test.ts)
against project ids, audiences, model ids and store paths. No new authenticated route, and so
no operator view — that stays open, and is cheaper to add later than to unpick if it turned
out nobody wanted it. The two smaller questions went the same conservative way: an overlay
rather than a route, and a boot-time snapshot rather than a poll, because nothing in that
payload can change without a restart.

**The stats forced the audience line to be drawn twice.** Instance facts are unauthenticated;
engagement counts are not, and they are also not the instance's business. So they arrive by a
different path entirely — tallied in the browser from the pile it already polls, never through
`/healthz`. Seven of the eight cost nothing: roster, voices, roles, fragments, last-5-min,
modes used and dark areas are all arithmetic over a `Session` the client is already holding.

**The eighth is the only new thing the server learned to do, and it is deliberately small.**
"Polling now" counts _requests_ in a 60-second window, not people. Keying that map on the
identity the poll already carries would have cost the same code and made a presence claim the
data cannot support, so it counts requests and the tile says "two tabs, two counts". It is in
memory and per instance, because persisting it would mean a store write per poll — exactly
what the 304 path in `engagementRoutes.ts` was written to avoid. It rides a response header
rather than the body, because almost every poll _is_ a 304: a count that only moved when the
pile moved would sit still in exactly the quiet room it exists to describe.

**Two bugs the tests could not have found, both caught by opening a browser.** The
[009](009-the-deferred-group-surface.md) increment below shipped a component that had never
been looked at, and said so; this one was looked at. The popup's heading broke into four lines
of one word each, because at 380px the badge and three buttons left the title a ten-character
column. And the model card drew three chain slots beside the words "2 deep" — the board
overstating what the server had told it, which is the one thing it exists not to do. Both are
now fixed, and the chain has a test that counts the slots.

**What it deliberately did not do.** No operator view, and no `/api/status` — see above. The
board does **not** show "last response: model or fallback", which the design had: `source` is
a per-response header read by whichever mode component made the call, so surfacing it means
threading that through every mode's fetch, and that is a change to nine call sites rather than
a rendering job. The AI-unavailable banner is untouched, as 007 asks — that warning is in the
way on purpose; this is somewhere you go to look.

**Next, if picking up here.** The MCP box is drawn and grey, which makes
[001](001-mcp-server-over-the-pile.md) the intent with a visible hole waiting for it. If the
"last response" line is wanted, the honest version is a small shared store for the last
`X-Extraction-AI-Source` seen, written where responses are read rather than where they are
rendered.

---

## 2026-09-03 — 008, in part: the production store has now run

008 is the one intent that is not code, and it is the floor under everything else: group mode
has only ever run on a laptop, so `FirestoreEngagementStore`, IAP verification and Vertex had
never executed once. The deploy is not mine to do. Two of the things that make it less likely to
go badly are.

**The store contract now runs against Firestore.**
[test/storeContract.test.ts](../../test/storeContract.test.ts) states the `EngagementStore`
contract once and runs it against both implementations — `FileEngagementStore` always, and
`FirestoreEngagementStore` when `FIRESTORE_EMULATOR_HOST` is set (`npm run test:firestore`, 87
tests, nothing skipped). Ten behaviours, and the two stores agree on all of them, including two
that only one of them could ever have got wrong: a roster keyed by an email address, which
Firestore reads as a dotted field path unless it is wrapped in a `FieldPath`, and ten
simultaneous contributions, where the file store rewrites one array and the production store
writes a subcollection.

The contract was prose on the interface before this — "implementations must treat thoughts as an
independently addressable collection", "must serve `getVersion` in O(1) reads" — and prose is not
a test. What made this worth doing rather than deferring to the deploy is that the emulator runs
the real client and the real query, batch, aggregation and `FieldPath` semantics, which is
precisely where two implementations of one interface diverge. What it cannot tell you: whether
ADC resolves, whether the runtime service account holds the roles, or whether
[firestore.rules](../../firestore.rules) denies what it means to. So 008's table row is narrower
now, not gone, and the file says so.

**The audience is checked before a request depends on it.** 008 named the IAP audience as the
plausible first-deploy failure, and the reason it is nasty is that it presents as a 401 from
every route with nothing in the response to explain it. It is _computed_ by deploy.sh from a
`gcloud projects describe` lookup, so the way it goes wrong is a failed substitution:
`/projects//locations/...` deploys perfectly happily and then refuses everyone.
[authMode.ts](../../server/authMode.ts) now exits on an audience that cannot work and says which
substitution to check; [deploy.sh](../../scripts/deploy.sh) refuses to deploy when the project
number did not resolve at all.

Where the fatal line sits is the only interesting decision here, and it moved once during
review. Exiting the process buys _diagnosis_, not safety: a wrong audience rejects every
assertion, which is broken but not permissive, and `iapAuth` already logs the expected value on
each rejection. So the only fatal case is one that cannot be anything but a bug — an empty path
segment, which no audience has. Everything else unrecognised warns and boots, because whether a
string is a valid audience is a claim about IAP's product surface rather than about this
deployment, and a list going stale in that file should not be able to take down a service that
was working. The first version refused to start on anything outside three known formats, which
was failing closed on an assumption about somebody else's deployment.

**And the fail-closed resolution finally has tests.** `resolveAuthConfig` is the function whose
failure is the feature — an earlier design would have turned a deployment into an anonymous
free-for-all on one missing variable — and CLAUDE.md asks for that behaviour to be preserved,
but nothing enforced it. A refactor softening a `fatal()` into a warning would have passed the
whole suite. [test/authMode.test.ts](../../test/authMode.test.ts) replaces `process.exit` with a
throw and asserts on each refusal, including the original bug in one line: an unset `AUTH_MODE`
under `NODE_ENV=production` must never resolve to dev.

**A documentation correction that mattered.** `/healthz` changed shape in the 007 increment
below, which made [DEPLOYMENT.md](../../DEPLOYMENT.md)'s verification ladder quote a response the
server no longer sends. Corrected, and the ladder is stronger for it: it now reads
`storage.backend`, where `file` on a deployment means `FIRESTORE_PROJECT_ID` never reached the
service and the shared pile is being written to a container disk that will vanish with the
instance. That is the most expensive misconfiguration this app can have and it is invisible from
inside the app.

**What this did not do.** Not deployed. Nothing here has spent a token or created a resource.
The route layer's rules — attribution, author-only edits, the 304 — are still exercised only
over the file store; it is the store contract that is now proven of both, not the routes above
it. And an emulator is not the service.

**Next, if picking up here.** The deploy itself, in 008's own order: guardrails, then the Vertex
quota ceiling, then a deploy with `GENAI_BACKEND` unset to prove IAP, Firestore and the container
without spending anything.

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
