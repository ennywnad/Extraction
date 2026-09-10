/**
 * One internal shape for "ask a model for a structured answer".
 *
 * The app's central claim is that configuration decides behavior — identity, storage and the
 * AI backend each select themselves by the presence of the configuration they need. For the
 * model that claim used to be true of the *client* and false of the *call*: `getGemini()`
 * abstracted which Gemini you reached, and nothing abstracted that it was Gemini. Nine call
 * sites assembled a raw `@google/genai` request object each.
 *
 * This is the missing half. A route now says what it wants and what shape it wants it in; a
 * provider decides how to ask for that.
 *
 * **What is deliberately not abstracted away.** `GenerateResult` names the provider and the
 * model that answered rather than hiding them, because "which seam took which branch" is a
 * question this codebase has decided repeatedly should be answerable rather than inferred —
 * the same reason `storeBackend()` exists and `source` is on every AI response. A seam that
 * made the provider invisible would be re-solving the problem `/healthz` was built to fix.
 *
 * **An adapter owns its client.** Claude on Vertex is `@anthropic-ai/vertex-sdk`; Gemini is
 * `@google/genai`. There is no common client type to return, and pretending otherwise would
 * mean a union that every caller has to narrow. The client is part of what an adapter hides.
 */
import type { JsonSchema } from "../schema.ts";

/**
 * Which provider answered. Not which backend built the client — `vertex` and `apikey` are
 * both `gemini` here, because a route asking "who wrote this" means the model family, and
 * `/healthz` already reports the backend separately.
 */
export type ProviderName = "gemini" | "claude";

export interface GenerateRequest {
  /** The assembled prompt. Prompts stay pure functions in sessionPrompts/levelSetPrompt. */
  prompt: string;
  /** The response shape, in plain JSON Schema. See ../schema.ts. */
  schema: JsonSchema;
  /**
   * Output ceiling. Providers differ on whether this is required (Claude) or implicit
   * (Gemini), so it is optional here and each adapter applies its own default.
   */
  maxTokens?: number;
}

export interface GenerateResult<T> {
  /** Already parsed. Every call site used to run its own `JSON.parse(response.text || "{}")`. */
  data: T;
  provider: ProviderName;
  /** The model id that actually answered, which may be any entry in the chain. */
  model: string;
}

/**
 * The default `T` is deliberately a record rather than `unknown`.
 *
 * A route that does not name a shape still gets something spreadable into a response body,
 * which is what every one of them does with it. `unknown` would make the untyped call — the
 * common case, where the schema is the contract — the one that needs a cast.
 */
export interface ModelProvider {
  readonly name: ProviderName;
  /** The chain this provider will try, in order. Reported as a length, never as ids. */
  models(): string[];
  generate<T extends object = Record<string, unknown>>(
    req: GenerateRequest,
  ): Promise<GenerateResult<T>>;
}
