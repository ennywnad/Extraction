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

Closer than 003 is, because the auth story already exists:

- **`GENAI_BACKEND=vertex` already resolves project + region + ADC.** Claude on Vertex needs
  the same three facts. The branch in [client.ts](../../server/ai/client.ts) that builds a
  Vertex client is structurally the branch that would build a Claude-on-Vertex client.
- **`GEMINI_MODELS` is already an ordered, environment-configured chain**, with a comment in
  the code conceding that valid ids differ between backends and move faster than the file does.
  Generalising that to provider-qualified entries is a small change to something that already
  admits it is provider-dependent.
- **The retry gate is already status-based, not provider-specific.** `FATAL_STATUSES` and the
  rate-limit passthrough reason about HTTP status codes, which both providers speak.
- **Prompts are pure functions of their input** and name no provider.

## What would have to change

- **[002](002-model-provider-seam.md).** Chiefly the schema translation: Gemini's
  `config.responseSchema` and Claude's `output_config.format` are the same intent in different
  shapes, and there are 9 of them.
- **Environment variable names.** `GEMINI_API_KEY`, `GEMINI_MODELS`, `GENAI_BACKEND` all name a
  provider in a place that would no longer be provider-specific. Renaming breaks a documented
  deployment; not renaming leaves a lie in `.env.example`. Aliases with a deprecation note is
  the usual answer.
- **Two SDKs, not one client with a wider branch.** Claude on Vertex is
  `@anthropic-ai/vertex-sdk` (`new AnthropicVertex({ projectId, region })`), not
  `@google/genai`. So `getGemini()` cannot simply grow a third branch and keep returning one
  client type — the client type is part of what each adapter hides. Ordinary for an adapter, but
  it is not the shape this file originally implied.
- **Feature parity is not total on Vertex, and the gap is now known rather than assumed.**
  Unavailable there: web fetch, code execution, the Files API, the Models API, Message Batches,
  the MCP connector, Managed Agents, `inference_geo`, server-side fallbacks, fast mode and task
  budgets. **Structured outputs and strict tool use are GA on Vertex** for both providers —
  which is the one that matters, because it is the entire premise of
  [002](002-model-provider-seam.md). Nothing this app uses falls in the gap.

## Facts to verify at implementation time

Do not trust a roadmap document for any of these — they move. Checked on 2026-09-03:

- **Checked.** The model-id convention holds: current-generation models take the bare
  first-party id (`claude-opus-5`), dated snapshots take an `@` separator
  (`claude-opus-4-5@20251101`) — a different convention from both the first-party API and
  Bedrock.
- **Checked.** `region` accepts `"global"` (recommended), a multi-region (`"us"` / `"eu"`), or a
  specific region. `AnthropicVertex` needs exactly project + region + ADC, which is the triple
  [client.ts](../../server/ai/client.ts) already resolves for the Gemini Vertex branch — so that
  branch really is structurally the one that would build this client.
- **Checked.** Which Claude features are and are not available through Vertex — listed above.
- **Still open.** Which Claude models are served in which specific regions.
- **Still open.** Current pricing on Vertex, which Google bills separately from first-party
  rates.

## Open questions

- ~~**What "gateway" means concretely.**~~ **Resolved: (a).** The candidates were (a) just the
  Vertex endpoint with the provider chosen by model id, (b) an actual proxy service in the
  project spoken to over one contract, or (c) a Vertex endpoint per model with routing in the
  app. (a) wins, for the reasons in the gateway section above, and it keeps
  [002](002-model-provider-seam.md) in-process. Reopen only if API Gateway model routing leaves
  Public Preview with structured-output support.
- Does solo-with-Claude use the first-party API, or Vertex as well? First-party is the easier
  local-development story; Vertex keeps one code path.
- If per-route provider selection happens, where does that configuration live — environment,
  or a checked-in config file? Environment gets unwieldy at nine routes.

## Non-goals

- Removing Gemini. This makes the provider a choice; it does not make a choice.
- Supporting every provider on every route. Two, well.
