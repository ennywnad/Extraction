/**
 * One internal shape for "ask a model for a structured answer".
 *
 * Every model call in this app is the same call: a prompt, a JSON Schema the answer must
 * satisfy, and parsed data back. That was already true before there was a seam — it was just
 * written nine times in `@google/genai`'s dialect, so the app could say *which Gemini* it
 * reached and not *that it was Gemini*.
 *
 * The seam is in-process and deliberately not an HTTP contract: 004 examined three real
 * gateways and settled on Vertex itself as the gateway, so there is no proxy for a provider
 * to sit behind. See docs/intents/002-model-provider-seam.md.
 *
 * **The two axes are separate, and keeping them separate is the point.** *Which provider
 * answers* is a property of the chain; *how the client authenticates* is `ModelBackend`. An
 * earlier version of this file crossed them into one five-value enum — `vertex`, `apikey`,
 * `claude-vertex`, `claude-apikey`, `none` — which is N × 2 values for a 2 × N question, would
 * have been six on the next provider, and could not express the thing a chain is for: falling
 * from one provider to another. Vertex serves both providers under the same ADC, so the auth
 * is genuinely one question and the provider genuinely another.
 */
import type { JsonSchema } from "../schema.ts";

export type { JsonSchema };

/** The two providers this app speaks. Not a plugin point; see 002's non-goals. */
export type ProviderName = "gemini" | "claude";

/**
 * How the client authenticates, which is a separate question from which provider answers.
 *
 * `vertex` is ADC as the runtime service account — no key material anywhere, and the client's
 * data stays inside the project perimeter. Both providers are served under exactly that same
 * auth, which is the whole reason 004 is a model change and not a security-posture change.
 */
export type ModelBackend = "vertex" | "apikey" | "none";

export interface ModelRequest {
  /** The whole prompt. Prompts are pure functions elsewhere and name no provider. */
  prompt: string;
  /** What the answer must satisfy. Enforced by the provider, not by parsing and hoping. */
  schema: JsonSchema;
  /** Upper bound on the answer. Every schema here describes a small object. */
  maxTokens?: number;
}

export interface ModelResult<T = unknown> {
  data: T;
  /** Who actually answered — not who was asked first. */
  provider: ProviderName;
  model: string;
}

/**
 * One entry in the chain, already split.
 *
 * The chain is provider-qualified (`claude:claude-opus-5`) because a bare id cannot say which
 * adapter should carry it, and the two providers' id spaces do not overlap in any way a
 * lookup could exploit.
 */
export interface ChainEntry {
  provider: ProviderName;
  model: string;
}

/**
 * What an adapter has to do, and deliberately all it has to do.
 *
 * `configured` is separate from `generate` so the chain can skip an entry whose provider has
 * no credentials without spending a round trip to discover it — a chain naming both providers
 * on a deployment that only has one is a normal state, not an error.
 */
export interface Provider {
  readonly name: ProviderName;
  /** Whether this provider can be reached at all under the current backend. */
  configured(backend: ModelBackend): boolean;
  /**
   * Asks one specific model. Throws on failure, carrying the upstream HTTP status where the
   * SDK exposed one — the chain reasons about status and nothing else.
   */
  generate(model: string, request: ModelRequest): Promise<unknown>;
}
