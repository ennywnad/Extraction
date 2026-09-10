# 004 — Claude, and the model as a deployment choice

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Depends on:** [002](002-model-provider-seam.md)
**Updated:** 2026-09-03 — the gateway question is resolved below, and the parity and model-id
facts have been checked against live documentation rather than assumed.

## What

Two related moves that share a prerequisite.

**Solo mode can use Claude directly.** An Anthropic API key, the same way `GEMINI_API_KEY`
works today — one more branch in the same selection-by-configuration pattern.

**Group mode's model becomes a deployment decision rather than a code decision.** The
deployment already authenticates as the runtime service account through Application Default
Credentials and holds no key material at all. Vertex AI serves Claude models under exactly
that same auth. So the model behind a group engagement becomes something the GCP project
decides — Gemini, Claude, or another model served from the project — without the application
knowing or caring which.

## Why

**The security posture is the argument.** The reason the current deployment uses
`GENAI_BACKEND=vertex` is not that Gemini is the best model; it is that ADC means no key
material ever exists in the deployment, and the client's data stays inside the project's own
perimeter. Claude on Vertex keeps that property exactly — the Vertex client takes a project id
and a region and authenticates through ADC, with no Anthropic API key anywhere. That means
this is a model change that is _not_ also a security-posture change, which is the rare and
valuable case.

**Different routes genuinely want different models.** The level set is a document a room of
people will be held to; `binary-bracket` generates two sentences. Being able to place a
different model on each is worth more than picking one winner and defending it. That capability
is really [002](002-model-provider-seam.md); this intent is what makes it worth having.

**It is the honest version of "should this use Claude?"** Rewriting the app to swap one
provider for another trades a working thing for an equivalent working thing and loses the
Vertex/ADC/IAP story that is the most distinctive part of the deployment. Making the provider a
seam keeps both and demonstrates more.

## Which gateway — checked, and the answer is none of them

The open question at the bottom of this file used to be "what does gateway mean concretely",
with three candidate shapes. Three real products were examined. None of them is the one this
intent wants, and that is the answer rather than a dead end.

**[Claude Apps Gateway](https://code.claude.com/docs/en/claude-apps-gateway-config)** is an
OIDC/SSO proxy for _Claude Code developer traffic_ — per-developer spend limits, group policies,
telemetry forwarding. Its `managed.policies` block configures the CLI. It governs humans using
Claude Code at an organisation, not an application making model calls as a service account,
which is what this app is. Worth reading anyway for its `upstreams` shape — `provider: anthropic
| bedrock | vertex | foundry` with per-upstream auth is close to what
[002](002-model-provider-seam.md) has to invent, already shipped and already named.

**[GCP Agent Gateway](https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview)**
governs agent-to-agent, agent-to-tool and user-to-agent traffic. It does not proxy model
inference at all, so it is not this. It does speak MCP over mTLS with Agent Identity and
Context-Aware Access, which makes it a lead for [001](001-mcp-server-over-the-pile.md) instead —
recorded there.

**[API Gateway model routing](https://docs.cloud.google.com/api-gateway/docs/model-routing-overview)**
is the closest thing to option (b) below, and the interesting one: a single OpenAI-compatible
endpoint that dispatches to Gemini, Claude and GPT by the `model` field in the payload. Since
Ollama and LM Studio speak that same shape, one adapter could in principle have covered this
intent and [003](003-local-models-in-solo-mode.md) together. It does not work here yet — Public
Preview, **text-based prompts only**, structured outputs undocumented, and no VPC Service
Controls. Every model call this app makes is schema-constrained JSON, so a routing layer that
will not commit to carrying a response schema through cannot carry this app. Worth re-checking
later; not worth building on now.

**So: option (a). Vertex is the gateway.** The provider is chosen by model id against the
endpoint the deployment already authenticates to. That keeps [002](002-model-provider-seam.md)
in-process — an adapter interface with two implementations, no HTTP contract, and no proxy
service to operate.

## What the code already supports

**Both halves are built.** `MODEL_BACKEND=claude-vertex` runs the app on Claude over Vertex
under ADC; `claude-apikey` runs it on a first-party key for local development. The adapter is
[providers/claude.ts](../../server/ai/providers/claude.ts), behind
[002](002-model-provider-seam.md)'s seam, and no route knows which provider it is talking to.

- **The security posture is unchanged, which was the entire argument.** `claude-vertex` reuses
  the same project + region + ADC triple the Gemini Vertex branch already resolved, so the
  deployment still holds no key material.
- **The chain is shared.** `MODEL_CHAIN` orders it for whichever provider is live, defaulting to
  `claude-opus-5` — one id rather than two, because the chain advances on "this id is not
  served here" and padding it with a cheaper model would be a silent downgrade of every
  response rather than a fallback.
- **The status gate needed no work at all.** `FATAL_STATUSES` and the rate-limit passthrough
  reason about HTTP status codes, and both SDKs put a numeric `status` on their errors — this
  file predicted that and it held exactly.
- **Prompts are pure functions of their input** and name no provider. None of them moved.
- **One failure mode is Claude-only and is handled:** safety classifiers can decline with HTTP
  200 and `stop_reason: "refusal"`, carrying no JSON. Server-side `fallbacks` would re-run it
  on another model but are not available on Vertex, so the adapter raises rather than letting
  an empty parse surface as a schema problem.

**Never exercised against a real project.** Everything above is verified against a stubbed
transport by [providerContract.test.ts](../../test/providerContract.test.ts). Vertex has not
served a Claude request for this app once — the same gap [008](008-deploying-group-mode.md)
records for the deployment as a whole, and it applies here in full.

## What would have to change

- **Run it once against a real project.** Enable Claude in the project's Model Garden, set
  `MODEL_BACKEND=claude-vertex` and a `VERTEX_LOCATION` that serves it, and make one request.
  Until that happens the adapter is verified only to the wire.
- **Per-route provider selection**, which is where this intent said the capability actually
  pays off — a cheap model on `binary-bracket`, a frontier one on the level set. Deferred in
  [002](002-model-provider-seam.md) with the reasoning; the seam does not need to change to
  gain it.
- **Feature parity is not total on Vertex, and the gap is known rather than assumed.**
  Unavailable there: web fetch, code execution, the Files API, the Models API, Message Batches,
  the MCP connector, Managed Agents, `inference_geo`, server-side fallbacks, fast mode and task
  budgets. **Structured outputs and strict tool use are GA on Vertex** for both providers —
  the one that matters, because it is the entire premise of
  [002](002-model-provider-seam.md). Nothing this app uses falls in the gap, with one
  consequence worth naming: no server-side `fallbacks` is why a refusal is handled in the
  adapter rather than delegated.

## Facts verified at implementation time

Re-checked on 2026-09-10 against live documentation rather than from this file, which is the
rule [docs/half-life-test.md](../half-life-test.md) exists to state:

- **Held.** The model-id convention: current-generation models take the bare first-party id
  (`claude-opus-5`), dated snapshots an `@` separator (`claude-opus-4-5@20251101`) — a
  different convention from both the first-party API and Bedrock.
- **Held.** `AnthropicVertex` needs exactly project + region + ADC, and `region` accepts
  `"global"` (recommended), a multi-region, or a specific one.
- **Held.** Structured outputs are GA on Vertex for Claude, and take
  `output_config: { format: { type: "json_schema", schema } }`.
- **Answered** (was open): Claude is served from `us-east5`, `us-central1`, `europe-west1`,
  `asia-southeast1`, and the global endpoint.
- **New, and not in any roadmap file.** Structured outputs there require `additionalProperties:
false` and a complete `required`, and reject `minimum`/`maximum`/`minLength`. That shaped
  [002](002-model-provider-seam.md)'s schema type — see the note there about which of those two
  providers fails loudly and which one does not.
- **Still open.** Current pricing on Vertex, which Google bills separately from first-party
  rates. Unchanged by this work; it is a question for whoever runs the first real workshop.

## Open questions

- ~~**What "gateway" means concretely.**~~ **Resolved: (a).** The candidates were (a) just the
  Vertex endpoint with the provider chosen by model id, (b) an actual proxy service in the
  project spoken to over one contract, or (c) a Vertex endpoint per model with routing in the
  app. (a) wins, for the reasons in the gateway section above, and it keeps
  [002](002-model-provider-seam.md) in-process. Reopen only if API Gateway model routing leaves
  Public Preview with structured-output support.
- ~~Does solo-with-Claude use the first-party API, or Vertex as well?~~ **Resolved: both**, and
  it cost less than the question implied. `AnthropicVertex` and `Anthropic` expose the same
  `messages` surface, so the choice is made once where the client is built and the adapter
  below it is one code path either way — the same vertex/apikey shape the Gemini branch already
  had, rather than a second idiom. First-party keeps the local-development story for a
  contributor with no gcloud setup; Vertex keeps the no-key-material property for the
  deployment.
- If per-route provider selection happens, where does that configuration live — environment,
  or a checked-in config file? Environment gets unwieldy at nine routes. Still open, and now
  the only thing standing between this intent and the reason it was written.

## Non-goals

- Removing Gemini. This makes the provider a choice; it does not make a choice.
- Supporting every provider on every route. Two, well.
