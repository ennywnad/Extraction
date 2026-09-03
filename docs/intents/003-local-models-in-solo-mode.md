# 003 — Local models in solo mode

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Depends on:** [002](002-model-provider-seam.md)

## What

Solo mode can point at a model running on the same machine — Ollama, llama.cpp, LM Studio —
instead of a cloud one. A `~32B`-class model on a modern laptop is enough for what the solo
routes actually ask for.

**Explicitly not a requirement.** Solo mode runs today with no model at all and must keep
doing so. This adds a third branch to the existing selection-by-configuration pattern:

| `GENAI_BACKEND`  | What runs                                                               |
| :--------------- | :---------------------------------------------------------------------- |
| unset / `apikey` | Gemini Developer API, if a key is present; otherwise labelled fallbacks |
| `vertex`         | Vertex AI as the runtime service account                                |
| `local` _(new)_  | Whatever is serving at `LOCAL_MODEL_BASE_URL`                           |

## Why

**The pile is the most personal data in the app.** A solo session is someone unburdening about
a job, a relationship, or a decision they have not told anyone about. The Sentence Completion
stems are literally _"the thing I keep not saying is…"_. That someone might not want that
leaving their laptop is not a paranoid position; it is the obvious one, and right now the only
way to honour it is to run with no AI and get canned prompts.

**It removes the last reason a fresh clone can't see the real behaviour.** No key, no billing
account, no cloud project — the app currently runs end to end in that state, but with fixed
placeholder prompts. A local model turns that from a demo into the actual product.

**The hardware caught up.** This intent did not make sense when the project started. It does
now, which is the only reason it is being written down rather than dismissed.

## What the code already supports

- **Selection by presence of configuration** is exactly the right pattern for this and is
  already the documented house style, so a third branch is unsurprising rather than a special
  case.
- **The labelled-response work already built the vocabulary.**
  [respond.ts](../../server/ai/respond.ts) distinguishes a generated answer from a substituted
  one on every response. Saying _which_ model generated it is the same field.
- **The AI-unavailable banner already exists** in `Workspace.tsx`, so there is a place to say
  "running locally" instead of inventing UI.
- **Every AI route already has a working no-model path**, so a local model that fails is not a
  new failure mode — it degrades into an existing one.

## What would have to change

- **[002](002-model-provider-seam.md).** Nine call sites currently hand Gemini a Gemini-shaped
  request.
- **Structured output is the real risk.** Nearly every route depends on schema-constrained
  decoding — that is what makes `JSON.parse` on the response safe rather than a gamble. A 32B
  model behind a runtime with grammar support will honour a small schema; a ten-field level-set
  schema is a different proposition. Likely answers, in preference order: grammar-constrained
  decoding where the runtime supports it; a reduced schema on the local path for the wide
  routes; validate-and-retry as a floor. Whatever is chosen, the failure should be visible —
  the whole point of the `source` field is that quietly-worse output is the bad outcome.
- **Which routes are worth running locally is a real question, not a formality.** The cheap,
  frequent, narrow ones — `quick-fire`, `drill-next`, `binary-bracket`, `devils-advocate` —
  are a good fit. Synthesis over a large pile is the one route that most wants a frontier
  model and least tolerates a mangled schema. Per-route provider selection (see 002's open
  questions) is what makes that expressible.
- **Latency and the UI.** A local 32B is seconds-per-response, not sub-second. The drill is
  conversational and will feel it. Nothing in the UI currently shows a model is thinking
  beyond a spinner.

## Open questions

- OpenAI-compatible HTTP as the interface, since Ollama, llama.cpp and LM Studio all speak it?
  That is the pragmatic answer and it means "local" is really "any OpenAI-compatible endpoint",
  which is arguably a better feature than the one described here.
- Does this apply to group mode at all? Probably not — a shared pile behind IAP is served by a
  deployment, and a laptop is not one. See [004](004-claude-and-the-gcp-model-gateway.md).
- Should the _client_ be able to reach a local model directly, cutting the server out for solo
  mode entirely? Tempting, and it breaks the "all model calls are proxied server-side" property
  that the README currently claims.

## Non-goals

- Bundling or downloading a model. The user brings their own runtime.
- Making local the default, or making it required.
