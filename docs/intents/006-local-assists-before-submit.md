# 006 — Local assists before a fragment enters the pile

**Status:** intent. Not planned, not scheduled. Low priority, and cheap.
**Written:** 2026-09-03
**Depends on:** nothing. See below — this turns out not to need
[002](002-model-provider-seam.md) or [003](003-local-models-in-solo-mode.md).

## What

Small, optional, toggleable things a local model can do to **your own draft, in your own
browser, before you submit it** — never to the pile, never to anyone else's words.

| Assist             | Fit for a small local model                                          |
| :----------------- | :------------------------------------------------------------------- |
| Tag suggestion     | **Best.** Bounded output, and it upgrades something real — see below |
| Templated reformat | Good. A fixed target shape is the easy case                          |
| Shorten            | Good. Subjective, but you are reading the result before it counts    |
| Tidy / clean up    | Needs defining before it means anything                              |
| Spell check        | **Weakest.** The browser already does this better                    |

Each behind its own toggle, off by default, so the point is partly to _see what a local model
can do_ on your own text with no stakes attached.

## Why this shape is right and the bigger one was not

An earlier draft of this file proposed distributing the room's inference work across
participants' machines — sharding fragment classification during synthesis, so a workshop's
idle laptops could offset frontier spend. It is recorded at the bottom, because the reason it
was set aside is more useful than the idea itself.

**A fragment before submission is not yet the room's data.** It is a draft in one person's
browser, authored by them, not yet attributed, not yet in the pile, not yet anyone else's.
Running a local model on it involves nobody else's material at all. The confidentiality problem
that blocked the larger version is not mitigated here or consented around — it is structurally
absent, which is a much better place to be.

**The trust problem disappears the same way.** The larger version asked the server to accept a
generated result it did not produce, which matters because a skewed classification skews the
coverage map, and the coverage map is the deliverable's headline. Here the local model's output
is a _suggestion to the author_, who accepts or rejects it and then submits through the
ordinary path. The server receives a fragment from a human, stamps it server-side exactly as it
does today, and never has to trust the local model at all. **The human is the verification
step**, which is both the cheapest possible design and the correct one.

**It changes nothing about group mode.** No new rules about attribution, no change to what IAP
gates, no change to the server proxying model calls for the pile. Production can run IAP and a
frontier model on Vertex while one participant's browser quietly does a tag suggestion on their
own laptop. Those two facts do not interact — which is exactly why this can be demonstrated in
a real deployment without arguing about it first.

## The assists, honestly

**Tag suggestion is the one worth building.** It is bounded output — a label from a known set —
which is the category a small model is reliable at and which is checkable for free. And it
replaces something that currently exists and is bad: the pile sidebar's semantic filters are a
substring matcher in `Workspace.tsx`, crude enough that a fragment containing the word
_"socratic"_ or _"provocative"_ is classified as a **fear**, because the keyword list has
leaked mode vocabulary into content vocabulary. A local model suggesting _action / insight /
fear / goal_ on the text you just wrote is a strict upgrade to a shipped feature, not a new
feature looking for a home.

**Spell check is the one not worth building.** The browser's is better, already there, and
free. Worth saying out loud so it does not get built out of list-completionism.

**"Tidy up" needs a definition before it is a feature.** Fixing capitalisation is not the same
as rewriting for clarity, and one of those is fine while the other is the tension below.

## The tension worth naming

This app exists to get raw thought out before the editing voice arrives. Sentence Completion's
stems — _"the thing I keep not saying is…"_ — are built specifically to route around
self-editing. Quick Fire clears the box on Enter so you cannot go back and polish.

A **clean this up** button next to the input is, in a small way, arguing with the product.

Not a blocker — these are toggles and they are off by default. But it should shape the
placement: an assist belongs _after_ you have written and are about to submit, never as
something hovering while you type. Reformatting is a filing decision, not a writing one.

## What the code already supports

- **Nine of the twelve modes already have a text input** to hang this off. Swipe, Timeline and
  Priority Pile author nothing — they file existing cards — so the surface is smaller and more
  uniform than "twelve modes" suggests.
- **The tag vocabulary already exists** (`action`, `insight`, `fear`, `goal`) with colours
  already assigned to it throughout the UI, so tag suggestion has a target set and a rendering
  already built.
- **Fragments already flow through one submission path** with server-side attribution, and this
  changes none of it — an assisted fragment is submitted identically to a typed one.
- **It needs neither 002 nor 003.** Both of those are about the _server's_ model call. This is
  the browser talking to a runtime on the same machine, so it shares no code with them and
  waits for neither. That makes it the cheapest non-trivial intent on the list and it can be
  done first.

## What would have to change

- **The browser has to reach the local runtime.** Ollama and friends need CORS permitting the
  app's origin, or a small shim. This is a per-user setup step and it is the main real work —
  which for a demonstration is fine, since it is one person's laptop.
- **A claim in the README needs qualifying.** It currently says all AI calls are proxied
  server-side so credentials are never exposed to client-side network inspectors. A
  browser-to-localhost call is a client-side model call. The _reason_ for the rule does not
  apply — a local runtime has no credential to expose — but the sentence as written would
  become false, and it should be narrowed rather than quietly contradicted.
- **A small client-side call helper**, with a schema for the bounded-output assists and a
  timeout. Roughly what [002](002-model-provider-seam.md) does server-side, at a fraction of
  the size, because there is one provider and the tasks are tiny.
- **Toggles need somewhere to live.** Per-assist, remembered per user, and visibly off when no
  local runtime is reachable.

## The demonstration property

Worth stating because it answers "how much work is it to let one connected user do this":
almost none beyond the above, because **there is no coordination layer**. The assists are
per-user and client-side, so one participant having a runtime configured while nobody else does
is the default behaviour, not a special case to build. Nothing has to negotiate, elect, shard,
or fall back. A facilitator can demonstrate a local model working inside a live IAP deployment
against a Vertex-backed pile, and the two halves never touch.

## Recorded: the version that was set aside

Distributing the room's inference across participants' machines — sharding `classify()` during
synthesis so idle laptops offset frontier spend. Set aside, and worth remembering why:

- **The pile carries other people's attributed fragments.** Sending them to a participant's
  laptop is a real change to where a client's material goes, and it contradicts what the app
  promises. That is a decision a room has to make, not a default to build.
- **The saving was probably smaller than it looked.** The level set is one call; the volume is
  in the per-interaction routes, which are per-user anyway.
- **It would have required the server to trust a result it did not produce**, and the
  verification needed to make that safe eats into the saving that justified it.

If it is ever revisited, the one defensible piece was that _classification_ — bounded, shardable,
verifiable against a fixed label set — is the only part of synthesis with those properties.
Generation never was.

## Open questions

- OpenAI-compatible HTTP, so "local" means any such endpoint rather than one runtime?
- Does an assisted fragment record that it was assisted? Arguably yes — the app is careful
  elsewhere about saying who wrote what, and "the human typed this" versus "a model reshaped it
  and the human accepted" is the same kind of distinction the `source` field already makes for
  responses.
- Does tag suggestion replace the keyword matcher, or sit alongside it as an upgrade when a
  runtime is present? Alongside is more honest, since most users will not have one.

## Non-goals

- Anything touching the pile, the coverage map, or the level set.
- Any server-side change to how group mode works.
- Making a local runtime required, or the assists on by default.
