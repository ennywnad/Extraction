# 002 — A provider-neutral model seam

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Blocks:** [003](003-local-models-in-solo-mode.md), [004](004-claude-and-the-gcp-model-gateway.md)

## What

One internal shape for "ask a model for a structured answer", with provider adapters behind it.
Something close to:

```ts
generate({ prompt, schema, settings }) -> { data, provider, model }
```

Today the equivalent call is `generateContentWithFallback(ai, requestParams)` where
`requestParams` is a raw `@google/genai` request object, assembled at each call site.

## Why

This is not on the wishlist for its own sake. It exists because both
[003](003-local-models-in-solo-mode.md) and
[004](004-claude-and-the-gcp-model-gateway.md) need the same missing piece, and doing them
one at a time means rewriting the same nine call sites twice. Pulling it out makes the real
cost visible in one place instead of hiding half of it in each of the other two.

The second reason is that the app's central design claim is _configuration decides behavior_ —
identity, storage, and the AI backend each select themselves by the presence of the
configuration they need. That claim is true for identity and storage. For the model it is
true of the **client** and false of the **call**: `getGemini()` abstracts which Gemini you
reach, and nothing abstracts that it is Gemini.

## What the code already supports

Honestly: not much. Measured against `main` at the time of writing:

| Coupling                                            | Count                                              |
| :-------------------------------------------------- | :------------------------------------------------- |
| Call sites passing a Gemini-shaped request          | 9                                                  |
| Uses of the `Type` enum to declare response schemas | 41                                                 |
| Reads of `response.text`                            | 9                                                  |
| Files importing `@google/genai`                     | 3 (`server.ts`, `ai/client.ts`, `ai/synthesis.ts`) |

What _is_ in good shape, and worth building on:

- **Selection by presence of configuration** is established, documented, and works. A third
  and fourth branch fit the existing pattern without argument.
- **Prompts are already provider-neutral.** After the extraction into
  [sessionPrompts.ts](../../server/ai/sessionPrompts.ts) and
  [levelSetPrompt.ts](../../server/ai/levelSetPrompt.ts), every prompt is a pure function
  returning a string. None of them know which model reads them. That is roughly half the
  problem already solved, by accident.
- **"Who answered" is already a first-class response field.**
  [respond.ts](../../server/ai/respond.ts) already distinguishes a model answer from a
  substituted one via `source` and a header. Extending that to name the _provider_ is a small
  step from something that already exists.
- **The model chain is already env-configured and ordered**, with a comment conceding that
  valid ids differ per backend. That generalises to a provider-qualified list.

## What would have to change

**The schemas are the whole job.** Every route declares its response shape with Gemini's
`Type` enum inside a `config.responseSchema`. The shapes themselves are ordinary JSON Schema
in a Gemini costume. So:

1. Express the 9 schemas in plain JSON Schema (or a small local type), once.
2. Each adapter translates to its provider's mechanism:
   - **Gemini** — `config.responseSchema` + `responseMimeType: "application/json"`
   - **Claude** — `output_config: { format: … }` (structured outputs)
   - **Local runtimes** — grammar-constrained decoding, and it varies by runtime
3. Each adapter normalises the response back to parsed `data`.

Everything else — the model chain, the fatal-status gate, the retry policy, the labelled
fallbacks — is already provider-agnostic in shape and mostly needs renaming.

## Open questions

- Is `schema` plain JSON Schema, or a narrow local type that each adapter expands? Plain JSON
  Schema is more honest and slightly more work to constrain.
- Does the seam stay in-process, or does it become a small HTTP contract so a provider can be
  a separate service? The gateway idea in 004 pushes toward the latter.
- Is the provider chosen per-process (an env var, matching today) or per-route?
  [006](006-distributed-local-inference.md) turns this from a refinement into the load-bearing
  question: routing cheap, high-frequency work away from a frontier model is the entire saving,
  and it is expressible only per-route. Per-route is where this gets genuinely useful — a cheap local model on `drill-next`, a frontier model on
  the level set — and it is also where the configuration story gets complicated. Worth
  deciding deliberately rather than drifting into it.
- What happens to `GEMINI_MODELS` and `GENAI_BACKEND`? Renaming them is a breaking change to
  a documented deployment; keeping them is a lie in the variable name. Aliases, probably.

## Non-goals

- Supporting every provider. Two real ones and a local runtime is the point; a plugin
  architecture is not.
- Abstracting away the differences that matter. If constrained decoding is weaker on a local
  runtime than on Vertex, the seam should make that visible, not paper over it.
