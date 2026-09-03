# 006 — Peer compute: local models doing the room's work

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Depends on:** [002](002-model-provider-seam.md), [003](003-local-models-in-solo-mode.md)

## What

When a connected participant has a local model, the app can hand that participant's machine
some of the prompt work and take the result back into the pile flow. Frontier spend drops to
whatever genuinely needs a frontier model.

[003](003-local-models-in-solo-mode.md) is "your machine runs your own solo session". This is
the generalisation: **any connected machine with a model is capacity**, including in group
mode, where ten laptops in a workshop are currently doing nothing but rendering React.

## Where the money actually is

Worth being precise, because the intuition "the level set is the expensive part" is probably
backwards.

| Work                                                                                                        | Frequency                                   | Local-friendly?                                                        |
| :---------------------------------------------------------------------------------------------------------- | :------------------------------------------ | :--------------------------------------------------------------------- |
| Per-interaction prompts (`quick-fire`, `drill-next`, `binary-bracket`, `devils-advocate`, swipe candidates) | 12 modes x N participants x many turns each | **Yes** — narrow schemas, low stakes, and mostly the asker's own input |
| Fragment classification for coverage                                                                        | Once per synthesis, scales with pile size   | **Yes, with care** — see below                                         |
| The level-set document itself                                                                               | Once per synthesis                          | **No** — this is the deliverable                                       |

The level set is _one call_. The per-interaction routes are the volume, and they are also the
lowest-stakes and least shared. So the savings are concentrated exactly where the risk is
lowest, which is a convenient shape rather than a difficult tradeoff.

## Can a local model touch the level set at all?

Yes — in one specific place, and it is not the writing.

Synthesis is two model calls: `classify()` assigns each fragment to one of ten areas, then
`levelSetPrompt` writes the document from those assignments plus the computed coverage.
Classification is the half that can leave the frontier:

- **Bounded output.** One label from a fixed list of ten, or `"unclassified"`. A local model
  does not have to be eloquent, only consistent.
- **Shardable.** Every fragment is independent, so the pile can be split across however many
  machines have volunteered.
- **Verifiable, which is the important one.** A returned label either is or is not in
  `LEVEL_SET_AREAS`, so garbage is rejectable for free. Beyond that, a random sample can be
  re-run server-side and compared — a statistical check that costs a fraction of doing the
  whole thing centrally.
- **It scales with pile size**, so it is the part that actually grows into a bill.

There is a pleasing detail here: `classificationPrompt` already describes the task as
"one fragment at a time — the kind of task a model is reliable at", while the implementation
sends the whole pile in a single call. Sharding it across machines would move the code
_closer_ to what its own comment claims.

The document generation stays frontier. It is read by the people who contributed the fragments
and it is the thing the engagement is for.

## The three problems, in order of seriousness

**1. Confidentiality — the real blocker in group mode.** The pile carries other people's
attributed fragments. Sending them to a participant's laptop for inference is a genuine change
to where a client's material goes, and it contradicts what the README currently claims: that
all model calls are proxied server-side and, on Vertex, stay inside the project's own
perimeter. This is not a technicality to route around; it is a decision a room has to make.

The clean line is **whose data it is**:

- Your own drill turn, drawing on your own fragments → your machine. No new question.
- The room's pile → explicit consent, or don't.

That line also gives a natural staging order, below.

**2. Trust in a returned result.** Group mode's founding rule is that the server never accepts
an identity from the client. A generated result is the same category of thing: client-supplied
data presented as fact. A wrong or hostile classification skews the coverage map, and the
coverage map is the deliverable's headline — the area nobody raised. Mitigations, cheapest
first: reject any label outside the bounded set; re-run a random sample centrally and compare;
and never accept free-text that lands in the document unverified. Note that all three are
available _because_ the distributed task is classification. They would not be available for
generation, which is the argument for the split.

**3. Availability.** This is volunteer compute. Nobody's laptop is an SLA. So it has to be
opportunistic: offer the work, accept it if claimed, time out and do it centrally otherwise.
That maps onto machinery that already exists — [respond.ts](../../server/ai/respond.ts)
already reports _who answered_ on every response, so `source: "peer-local"` is one more value
in a field that is already there and already tested.

## What the code already supports

- **`classify()` is already a separate function** in
  [synthesis.ts](../../server/ai/synthesis.ts), distinct from document generation. The seam
  this intent needs most is already a function boundary.
- **`computeCoverage` takes a classification map as an argument** and does not care who
  produced it. It validates by construction: an assignment naming an area that does not exist
  simply contributes to no area.
- **Synthesis is already single-flight per engagement**, so there is an existing coordinator
  to hang work distribution off rather than inventing one.
- **The `source` field and its header** already exist to say who produced a response.
- **The ETag poll** (`getVersion`, O(1) by contract) is precedent for lightweight
  client-server coordination that does not read the whole pile.

## What would have to change

- **[002](002-model-provider-seam.md) and [003](003-local-models-in-solo-mode.md)** first.
- **`classify()` reshaped from one call to shardable units.** Closer to its own documented
  intent, but a real change with its own accuracy question — per-fragment classification loses
  the cross-fragment context the single call currently has.
- **A work-offer channel.** The client currently only ever asks the server for things. This
  inverts it: the server needs to offer a unit of work and the client needs to claim, run, and
  return it — with a timeout and a central fallback on every path.
- **Browser reachability of the local runtime.** Ollama and friends need CORS permitting the
  app's origin, or a small local shim. This is a setup step for the participant, which caps
  how casually this can be adopted.
- **Consent, expressed in the product.** Not a checkbox buried in settings — if a facilitator
  is going to let the room's fragments run on the room's laptops, the room should be told.

## A staging order

1. Solo, own machine, own data — that is [003](003-local-models-in-solo-mode.md), no new
   questions.
2. Group, but only a participant's _own_ turn on their _own_ machine. Cuts the highest-volume
   spend with no confidentiality change.
3. Sharded classification across consenting machines, with central spot-checks. This is the
   step that touches the level set, and the one that needs the consent story.
4. Never: the level-set document on a peer machine.

## Open questions

- Is the economics real? Classification on a Flash-class model over a few hundred fragments is
  not obviously expensive. Worth measuring actual spend by route before building any of this —
  it may turn out that step 2 is the whole prize and step 3 is not worth its complexity.
- Does a participant get to know their machine is being used, per task or once?
- What happens to a partially-complete shard when someone closes their laptop mid-workshop?
- Does the sample-verification cost eat the saving? If you re-run 20% centrally, you have
  bought 80% — still worthwhile, but it changes the arithmetic and should be stated.

## Non-goals

- A general compute marketplace. This is one app opportunistically using idle capacity in its
  own room.
- Distributing the deliverable. The document stays central.
