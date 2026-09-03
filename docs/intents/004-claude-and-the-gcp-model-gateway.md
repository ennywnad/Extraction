# 004 — Claude, and the model as a deployment choice

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03
**Depends on:** [002](002-model-provider-seam.md)

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
- **Feature parity is not total on Vertex.** Some Claude API features are unavailable or
  differ when served through Vertex rather than the first-party API. None of them are features
  this app currently uses, but that should be re-checked rather than assumed at implementation
  time.

## Facts to verify at implementation time

Do not trust a roadmap document for any of these — they move:

- Exact Claude model ids on Vertex, and their regional availability. Vertex uses unprefixed
  ids for current-generation models and an `@`-separated form for dated snapshots, which is a
  different convention from the first-party API and from Bedrock.
- Which Claude features are and are not available through Vertex.
- Current pricing on Vertex, which is billed by Google and differs from first-party rates.

## Open questions

- **What "gateway" means concretely.** The idea as described is a single endpoint fronting the
  project's models. That could be (a) just the Vertex endpoint, with the provider chosen by
  model id, (b) an actual proxy service in the project that the app talks to over one contract,
  or (c) a Vertex endpoint per model with routing in the app. These have quite different
  implications for [002](002-model-provider-seam.md) — (b) would push the seam out of the
  process and into HTTP. Worth pinning down before the seam is designed, because the seam is
  cheaper to design once.
- Does solo-with-Claude use the first-party API, or Vertex as well? First-party is the easier
  local-development story; Vertex keeps one code path.
- If per-route provider selection happens, where does that configuration live — environment,
  or a checked-in config file? Environment gets unwieldy at nine routes.

## Non-goals

- Removing Gemini. This makes the provider a choice; it does not make a choice.
- Supporting every provider on every route. Two, well.
