/**
 * Claude, through `@anthropic-ai/vertex-sdk` on a deployment and `@anthropic-ai/sdk` locally.
 *
 * **This is the adapter that makes the seam a seam.** A provider interface with one
 * implementation behind it is an indirection, not a seam, which is why 002 says it must never
 * land alone — and Claude is the right thing to prove it with precisely because the two
 * providers do not agree about anything at the wire: different SDKs, different client types,
 * different auth objects, different ways of constraining output, different response shapes.
 * Nothing here could have been faked by renaming a Gemini call.
 *
 * **On Vertex there is no key.** `AnthropicVertex` takes a project and a region and
 * authenticates through ADC as the runtime service account — exactly the triple the Gemini
 * Vertex branch already resolved. That is 004's whole argument: swapping the model does not
 * touch the security posture, because the client's data never leaves the project perimeter
 * and no key material exists in the deployment either way.
 *
 * Structured outputs are GA on Vertex for both providers, which is the fact the seam rests on.
 * Verified against the platform availability table rather than assumed — had constrained
 * decoding been first-party-only for either provider, this file would be a much weaker thing.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import type { ModelBackend, ModelRequest, Provider } from "./types.ts";

/** What the SDK accepts for a JSON-schema output format: an open record. */
type SchemaRecord = { [key: string]: unknown };

let client: Anthropic | AnthropicVertex | null = null;
let resolved = false;

function build(backend: ModelBackend): Anthropic | AnthropicVertex | null {
  if (backend === "vertex") {
    const projectId = process.env.FIRESTORE_PROJECT_ID?.trim();
    const region = process.env.VERTEX_LOCATION?.trim();
    if (!projectId || !region) {
      console.error(
        "MODEL_BACKEND=vertex requires FIRESTORE_PROJECT_ID and VERTEX_LOCATION; Claude is disabled.",
      );
      return null;
    }
    // No apiKey argument exists on this constructor. ADC resolves the credentials.
    return new AnthropicVertex({ projectId, region });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_ANTHROPIC_API_KEY") return null;
  return new Anthropic({ apiKey });
}

function get(backend: ModelBackend): Anthropic | AnthropicVertex | null {
  if (!resolved) {
    resolved = true;
    client = backend === "none" ? null : build(backend);
  }
  return client;
}

/** Test seam, as with the Gemini adapter. */
export function resetClaude(): void {
  client = null;
  resolved = false;
}

/**
 * Every schema in this app describes a small object — a recommendation, ten prompts, a level
 * set. This is a ceiling against a runaway, not a budget: the answer is schema-constrained, so
 * the model has nowhere to ramble to.
 */
const DEFAULT_MAX_TOKENS = 8192;

/**
 * The wire shape, as a pure function of the seam's shape — the counterpart to
 * `geminiRequest`, and the pair is what a test can hold against each other.
 */
export function claudeRequest(model: string, request: ModelRequest) {
  return {
    model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user" as const, content: request.prompt }],
    // The counterpart to Gemini's responseJsonSchema, and the *same object* goes into both.
    // `output_format` is the deprecated spelling; this is the current one. The cast is only to
    // satisfy the SDK's open-ended record type — the schema is deliberately a closed type so
    // an author cannot reach for a keyword one of the two providers would silently drop.
    output_config: {
      format: { type: "json_schema" as const, schema: request.schema as unknown as SchemaRecord },
    },
  };
}

export const claude: Provider = {
  name: "claude",

  configured(backend: ModelBackend): boolean {
    return get(backend) !== null;
  },

  async generate(model: string, request: ModelRequest): Promise<unknown> {
    const ai = client;
    if (!ai) throw new Error("Claude adapter asked to generate with no client");

    const response = await ai.messages.create(claudeRequest(model, request));

    // A refusal is a 200 with no usable content, so it is checked before the content is read
    // rather than surfacing as a parse error three lines later. Server-side `fallbacks` would
    // re-run it on another model, but that parameter is not available on Vertex — so naming
    // the outcome is the honest handling, and the chain then treats it as any other failure.
    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to answer this prompt");
    }

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    return JSON.parse(text || "{}");
  },
};

/**
 * Named only when a chain asks for it.
 *
 * The default chain stays Gemini-only on purpose: a default that reached for Claude would
 * change what an existing deployment does on the next restart, and the seam is meant to make
 * the provider a decision rather than to make it for anybody.
 */
export const CLAUDE_SUGGESTED_MODEL = "claude:claude-opus-5";
