# 009 — The deferred group surface

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03

## What

A catalogue of everything the group-mode design proposed and the build deliberately left out.
[level-set-plan-v2.md](../../planv1/level-set-plan-v2.md) records them in one line under
"Deferred (unchanged from v1, still out of scope)", and
[planv1/README.md](../../planv1/README.md) repeats the list so a reader of the design bundle is
not misled by concept screens showing features that were never built.

One line in a superseded plan is a thin place for eight ideas to live. This file gives each of
them an honest read, so that the next person deciding what to build is choosing rather than
rediscovering.

Nothing here is a commitment. Several of these should probably stay deferred forever, and the
file says which.

## Why bother writing it down

**A deferral with a reason is reusable; a deferral without one gets re-litigated.** The plan
deferred these correctly for a scope it had to close. It did not record _why_ each one, so every
future reading of the concept bundle re-opens the same eight questions.

**Two of them turn out to be load-bearing for intents already written.** The coverage map is the
missing half of both [005](005-listening-mode.md) and [007](007-status-board.md); per-viewer
classification is most of [006](006-local-assists-before-submit.md). Neither connection is
visible from the plan's one-line list, and both change how cheap those intents are.

## The eight, with a read on each

**Coverage map UI — the one worth building, and closer than it looks.** The arithmetic is done:
[coverage.ts](../../server/ai/coverage.ts) computes per-area status deliberately outside the
model so a count of zero is right every time, [synthesis.ts](../../server/ai/synthesis.ts)
returns it on the `LevelSet`, and the level-set prompt already consumes a summary of it. Then it
stops — the string `coverage` does not appear anywhere in [src/](../../src/). A computed map of
what a room has _not_ discussed is arguably the most distinctive thing this app produces, and it
is currently visible only in so far as a model chose to mention it in prose. This is a rendering
job over a value that already crosses the wire. It is also the missing piece in
[005](005-listening-mode.md)'s live-coverage question and an open question in
[007](007-status-board.md).

**Per-viewer classification — largely superseded by [006](006-local-assists-before-submit.md).**
Deferred here as a server-side idea; [006](006-local-assists-before-submit.md) arrives at a
better-shaped version of it, in the browser, on the author's own unsubmitted draft, where the
confidentiality problem is structurally absent rather than mitigated. Read the two together: this
entry is the older framing and [006](006-local-assists-before-submit.md) supersedes it.

**Firestore realtime listeners — a real architectural choice, not an omission.** The app polls
every 15 seconds with an ETag, and an unchanged poll costs about two Firestore reads (see
[008](008-deploying-group-mode.md)). That is cheap enough that listeners cannot be justified on
cost. The argument for them is latency — a fragment appearing on a facilitator's screen in a
second rather than up to fifteen — and it only becomes interesting alongside the coverage map or
[005](005-listening-mode.md), where a room is watching a wall fill in. Against: it puts the
Firestore SDK in the browser, and [firestore.rules](../../firestore.rules) currently denies all
direct client access precisely so that every read goes through the server. That rule is doing
real work and is not worth trading for latency alone.

**Comments and +1s — the largest, and the one that changes what the pile _is_.** Today a
fragment is one person's contribution, attributed and immutable to everyone else. Comments make
it a thread; +1s make it a vote. Both are defensible, and both mean the pile stops being a
record of what was said and starts being a record of what was agreed. That is a product
decision, not a feature, and it deserves its own intent if it is ever taken up.

**The scope ledger and the three registers (questions, assumptions, definitions)** — four
structured side-channels alongside the pile. They share one question: is a register a new kind
of fragment, or a new collection? As fragments they inherit attribution, editing rules, storage
and sync for free and cost roughly a `kind` field; as collections they are four times the
surface. Nothing suggests they need to be separate, and the cheap version has never been
attempted.

**Two-workshop engagement log** — presumes an engagement spans sessions, which
`Session.engagementId` does not currently model. Genuinely more work than it sounds, and it has
no demand behind it yet.

**Facilitator merge-of-duplicates** — the only item that fights an existing invariant.
[engagementSync.ts](../../src/utils/engagementSync.ts) never infers a deletion from a fragment's
absence, and merging is a deletion plus an edit of someone else's words, which the author-only
rule in [engagementRoutes.ts](../../server/engagementRoutes.ts) refuses on purpose. Anyone
picking this up should start from those two rules and expect to argue with them, rather than
starting from the UI.

## What the code already supports

- **Coverage is computed, shaped and already on the wire** — see above. This is the only one of
  the eight where the server half exists.
- **Attribution, author-only edits and the roster are enforced in the route layer**, so anything
  built on the pile inherits the rules rather than restating them.
- **`Session` is a shape with a documented allowlist** in
  [shape.ts](../../server/store/shape.ts), so a `kind` field on a fragment — the cheap route for
  the registers — has an obvious place to go and one place to be validated.
- **Nothing here needs a new seam.** These are all surfaces over the store and the pile that
  already exist, which is why the plan could defer them cleanly in the first place.

## Open questions

- Does the coverage map belong to the engagement, to [007](007-status-board.md)'s board, or to
  both with different framing? [007](007-status-board.md) already asks this from its side.
- Are the registers a `kind` on a fragment or four collections? Deciding once settles four items.
- Is there any appetite for comments at all, or is the immutable attributed pile the better
  product? Worth answering before anyone builds toward it.

## Non-goals

- Reviving these as a batch. The list is a catalogue, not a roadmap; most of it should stay
  deferred.
- Treating the concept bundle in
  [planv1/App-demos-and-screenshots-claudedesign/](../../planv1/App-demos-and-screenshots-claudedesign/)
  as a specification. It is dated provenance from before any of this was built, and
  [planv1/README.md](../../planv1/README.md) already says which of its claims stopped being true.
