# 002 — A provider-neutral model seam

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Blocks:** [003](003-local-models-in-solo-mode.md), [004](004-claude-and-the-gcp-model-gateway.md)
**Updated:** 2026-09-03 — the seam is in-process. See
[004](004-claude-and-the-gcp-model-gateway.md) for why, and the note on two SDKs below.

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

**The seam is built.** `ModelProvider` in
[providers/types.ts](../../server/ai/providers/types.ts) is the one internal shape, with two
adapters behind it; [client.ts](../../server/ai/client.ts) does nothing but choose between
them. A route calls `provider.generate({ prompt, schema })` and gets back parsed `data`
alongside the provider and model that produced it. No handler imports `@google/genai`, and no
handler names a provider.

The coupling this file was written to measure is gone: the nine call sites that each assembled
a Gemini-shaped request now pass a schema, and the 41 `Type` enum uses are one translation
function in [providers/gemini.ts](../../server/ai/providers/gemini.ts). `@google/genai` is
imported by that adapter alone.

What holds it up:

- **Selection by presence of configuration** extends to four branches — `vertex`, `apikey`,
  `claude-vertex`, `claude-apikey` — under `MODEL_BACKEND`, with the `GEMINI_*` names still
  honoured.
- **Prompts were already provider-neutral**, as pure functions in
  [sessionPrompts.ts](../../server/ai/sessionPrompts.ts) and
  [levelSetPrompt.ts](../../server/ai/levelSetPrompt.ts). That turned out to be roughly half
  the problem already solved, by accident, and none of them moved.
- **The schemas are plain JSON Schema** in [schema.ts](../../server/ai/schema.ts) — see the
  answered question below for why that, and not a local type.
- **"Who answered" now names the provider.** [respond.ts](../../server/ai/respond.ts)
  distinguished a model answer from a substituted one via `source` and a header; it now carries
  `X-Extraction-AI-Provider` beside it. The model _id_ deliberately stays off the wire, on the
  same disclosure line `/healthz` already draws.
- **The chain is generic** over both providers in
  [providers/chain.ts](../../server/ai/providers/chain.ts), because "advance only on this-id-is-
  not-served-here" is a fact about model ids rather than about Gemini.

## What would have to change

Nothing, for the seam itself. What remains is what it was built to make cheap:

- **[003](003-local-models-in-solo-mode.md)** adds a third adapter whose constrained decoding
  is the weak case. The seam was deliberately designed against two providers that constrain
  well so that 003 arrives as the degraded case rather than shaping the interface around the
  weakest mechanism it will ever serve.
- **Per-route provider selection**, which is the capability
  [004](004-claude-and-the-gcp-model-gateway.md) says makes this worth having. Deferred rather
  than open — see below.

**The schemas were the whole job, and they are done.** The nine live in
[schema.ts](../../server/ai/schema.ts) as plain JSON Schema; the Gemini adapter translates to
`config.responseSchema` and drops `additionalProperties`, which Gemini's `Schema` has no field
for; the Claude adapter passes the schema through `output_config.format` verbatim.

The sharpest thing learned building it: **the two providers disagree about
`additionalProperties` and `required` in a way that is invisible on one of them.** Claude
rejects a schema missing either; Gemini silently accepts one. A schema written against the
default backend would therefore pass every local test and 400 only on the provider nobody runs
locally. `ObjectSchema` declares both non-optional so that cannot compile, and
[schemaShape.test.ts](../../test/schemaShape.test.ts) adds what the type cannot say — that
`required` is _complete_.

**Both mechanisms are GA on Vertex**, re-verified against the platform availability table
before implementation rather than trusted from this file. That is what made the schema work a
translation rather than a gamble.

**An adapter owns its client, because the SDKs are different.** Claude on Vertex is
`@anthropic-ai/vertex-sdk` (`new AnthropicVertex({ projectId, region })`); Gemini is
`@google/genai`. So there is no `getModel()` returning one client type — the client is part of
what each adapter hides. Both authenticate through ADC against the same project and region, so
the _configuration_ converges even though the objects do not. One correction to what this file
originally assumed: `BaseAnthropic` is the shared superclass of both Anthropic clients but
declares no `messages`, so even within one provider the honest common type is the union.

## Open questions

- ~~Is `schema` plain JSON Schema, or a narrow local type that each adapter expands?~~
  **Resolved: plain JSON Schema.** It is what Claude's `output_config.format` takes verbatim,
  so the translation cost sits with the provider that needs translating rather than with every
  route. The "slightly more work to constrain" worry inverted: the constraints that mattered
  (`required`, `additionalProperties`) are expressible in the TypeScript type, so they are
  enforced at compile time rather than by a validator.
- ~~Is the provider chosen per-process or per-route?~~ **Deferred, deliberately, to keep it
  from being drifted into.** Per-process today: one `MODEL_BACKEND` for the whole instance,
  matching how identity and storage already select themselves. Per-route is still the version
  worth having — a cheap model on `drill-next`, a frontier one on the level set — but it needs
  a configuration surface for nine routes, and inventing one in the same change that
  introduced the seam would have been designing two things at once. The seam does not have to
  change to gain it: `getProvider()` is the only thing a per-route selector would replace, and
  `GenerateRequest` already carries everything a router would key on.
- ~~Does the seam stay in-process, or does it become a small HTTP contract?~~ **Resolved:
  in-process.** [004](004-claude-and-the-gcp-model-gateway.md) settled on the Vertex endpoint
  itself as the "gateway", so there is no proxy service for a provider to sit behind. One thing
  would reopen it: API Gateway model routing leaving Public Preview with structured-output
  support. It is an OpenAI-compatible front for Gemini, Claude and GPT, and because local
  runtimes speak that shape too, it would collapse this intent and
  [003](003-local-models-in-solo-mode.md) into a single adapter.
- ~~What happens to `GEMINI_MODELS` and `GENAI_BACKEND`?~~ **Resolved: aliases, as guessed.**
  `MODEL_BACKEND`, `MODEL_IDS` and `MODEL_API_KEY` are read first; the old names still work and
  log one deprecation line at boot. The deadline the README attached to this was real and is
  now discharged — the aliases exist _before_ the next `deploy.sh` push rather than after it.

## Non-goals

- Supporting every provider. Two real ones and a local runtime is the point; a plugin
  architecture is not.
- Abstracting away the differences that matter. If constrained decoding is weaker on a local
  runtime than on Vertex, the seam should make that visible, not paper over it.
