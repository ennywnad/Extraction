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
  waits for neither. The _code_ is therefore the cheapest non-trivial thing on this list and
  could be done first. The _adoption_ is not cheap on the localhost path — see the two gates
  below — which is the one place this intent is more expensive than it first looks.

## Reaching the model: the server never does, and does not need to

The obvious-sounding version of this — the server calls the participant's model — does not
work and should not be made to. A laptop is behind NAT with no public IP, no inbound port, and
a tab that can close mid-request. Everything that "fixes" that (ngrok, Cloudflare Tunnel,
Tailscale) works by making the laptop reachable _from the internet_, which is a worse trade
than the problem it solves, and a strange thing to build into an app that is otherwise careful
about where a client's material goes.

**The browser is the only component with reach to both sides** — an HTTPS session with Cloud
Run, and localhost. So every workable design routes through it, and the real question is never
"how does the server reach the laptop" but "who decides what work happens":

|                          | Who queues the work            | Who consumes the result       | Server contract                     |
| :----------------------- | :----------------------------- | :---------------------------- | :---------------------------------- |
| This intent              | The browser, for its own draft | The author, before submitting | None — an ordinary fragment arrives |
| Peer compute (set aside) | The server                     | The server                    | A work queue and a trust model      |

Both are the browser calling localhost. That is worth knowing: the transport was never what
made the larger idea hard.

### Two gates, not one

**The browser gate.** Since Chrome 142 (late October 2025), Local Network Access is
permission-gated: a page served from a public origin that fetches a loopback or local-network
address is blocked, and the fetch rejects with a network error, until the user grants a prompt.
That is a one-time native click rather than a config file, so it is better than it sounds. The
part that matters most is that permission-gated local requests are **exempt from mixed-content
checks** — which is the thing that would otherwise kill this outright. A deployed HTTPS page
_can_ call `http://localhost:11434` once permission is granted.

**The runtime gate.** Ollama sends no CORS headers to a browser origin by default — only
`127.0.0.1` and `0.0.0.0` are permitted — so the preflight fails. It needs
`OLLAMA_ORIGINS=https://<the app origin>` and a restart.

So a participant's setup is: click Allow, set one environment variable, restart the runtime.
Fine for a demonstration on one machine. Enough friction that it will not happen spontaneously
across a room — which is consistent with this being per-user and opt-in, but it does cap how
far it can spread.

Verify both before building: browser behaviour here changed recently and may change again, and
runtime defaults differ across Ollama, llama.cpp and LM Studio.

### The option that removes both gates

**In-browser inference.** WebGPU, via something like transformers.js or WebLLM, runs the model
_in the page_. No localhost call, so no permission prompt and no CORS. The cost is capability:
realistically 1-3B, perhaps 7-8B with a good GPU and patience, plus a few-hundred-megabyte
download on first use.

Except look at what this intent actually asks for — pick one of four tags, shorten, reformat to
a template. Those are what a 1-3B model is fine at. **For these assists specifically,
in-browser may simply be the better answer**: no setup, works for every participant rather than
only the one who configured it, and the capability ceiling never binds. A 32B model is the
wrong tool for choosing between `action`, `insight`, `fear` and `goal`.

That is a genuine fork, and it maps onto two different motivations that pull apart:

| Goal                               | Path                  | Why                                                  |
| :--------------------------------- | :-------------------- | :--------------------------------------------------- |
| See what a real local model can do | Ollama over localhost | Exercises the hardware; two setup gates; one machine |
| Ship an assist that helps the room | WebGPU in the page    | No setup, everyone gets it, capability is sufficient |

Not exclusive — same call helper, different backend behind it — but they would be built in that
order and for different reasons, and only the first is a demonstration.

## What would have to change

- **A transport decision, before anything else** — localhost or in-page. See above; it changes
  who can use this and how much setup they need, and nothing else in this list depends on which
  way it goes.
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

If it is ever revisited, two things carry over. The one defensible piece of the idea was that
_classification_ — bounded, shardable, verifiable against a fixed label set — is the only part
of synthesis with those properties; generation never was. And mechanically it would be **this
intent's client code plus a work queue**: the browser pulls a unit, runs it against the same
local runtime, and posts the result back, so the server still never initiates a connection to
anyone's laptop. That is the ordinary self-hosted-runner shape. Which is the point — the
transport was never the hard part. The trust boundary was.

## Open questions

- **Localhost or in-page?** The fork above is the first decision and the only one that changes
  who this is for. Possibly both, in that order.
- If localhost: OpenAI-compatible HTTP, so "local" means any such endpoint rather than one
  runtime?
- Is there a Chrome-only shortcut worth taking? The browser ships a built-in on-device model
  API that would remove even the WebGPU download. Chrome-only, and its status should be checked
  rather than assumed.
- Does an assisted fragment record that it was assisted? Arguably yes — the app is careful
  elsewhere about saying who wrote what, and "the human typed this" versus "a model reshaped it
  and the human accepted" is the same kind of distinction the `source` field already makes for
  responses.
- Does tag suggestion replace the keyword matcher, or sit alongside it as an upgrade when a
  runtime is present? Alongside is more honest, since most users will not have one.

## References

Claims above about browser and runtime behaviour, so a future reader can re-check rather than
trust this file. Both areas move.

- [Chrome: new permission prompt for Local Network Access](https://developer.chrome.com/blog/local-network-access)
  — the permission gate, and the mixed-content exemption that makes an HTTPS page able to call
  loopback at all.
- [Intent to Ship: local network access restrictions](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY)
  — shipping timeline, Chrome 142.
- [Local Network Access spec (WICG)](https://wicg.github.io/local-network-access/)
- [Ollama FAQ](https://docs.ollama.com/faq) — `OLLAMA_ORIGINS`, and the default of permitting
  only `127.0.0.1` and `0.0.0.0`.
- [ollama#300 — allowing browser origins](https://github.com/ollama/ollama/issues/300)

## Non-goals

- Anything touching the pile, the coverage map, or the level set.
- Any server-side change to how group mode works.
- Making a local runtime required, or the assists on by default.
