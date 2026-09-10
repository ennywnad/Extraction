/**
 * Claude behind the same seam.
 *
 * **Why this provider and not another.** The reason the deployment runs on Vertex is not that
 * Gemini is the best model; it is that Application Default Credentials mean no key material
 * ever exists in the deployment, and the client's material stays inside the project's own
 * perimeter. Claude on Vertex keeps that property exactly — `AnthropicVertex` takes a project
 * id and a region and authenticates through ADC, with no Anthropic key anywhere. So this is a
 * model change that is *not* also a security-posture change, which is the rare and valuable
 * case, and it is the whole argument in docs/intents/004.
 *
 * **Two clients, one code path.** `AnthropicVertex` and the first-party `Anthropic` both
 * extend `BaseAnthropic` and expose the same `messages` resource, so the backend decision is
 * made once when the client is built and nothing below it knows which one it got. That mirrors
 * `getGemini()`'s existing vertex/apikey shape rather than inventing a second idiom: Vertex
 * for the deployment, a key for the contributor with no gcloud setup.
 *
 * **Structured output is the whole premise.** Verified GA on Vertex for Claude before this was
 * written — had it been first-party-only, the neutral schema in ../schema.ts would have been a
 * gamble rather than a translation. The schema goes across verbatim; see that file for the two
 * constraints (`additionalProperties: false`, complete `required`) it enforces in the type
 * system precisely because they are fatal here and invisible on Gemini.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { AiCallError } from "../errors.ts";
import type { JsonSchema } from "../schema.ts";
import { runChain } from "./chain.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "./types.ts";

/**
 * One model, not a chain.
 *
 * The chain advances on "this id is not served here", so a second entry is only worth having
 * when it is a *different* model that might be. Padding this with a cheaper Claude would not
 * be a fallback; it would be a silent downgrade of every response in the app, decided here
 * rather than by whoever configured the deployment. `MODEL_CHAIN` sets a longer chain for anyone
 * who wants one.
 */
export const CLAUDE_DEFAULT_MODELS = ["claude-opus-5"];

/**
 * Output ceiling. Hitting it truncates mid-thought and costs a retry, and the largest thing
 * this app asks for is a level set — a summary, a Markdown outline, and three lists, over the
 * whole pile. 16k leaves room for that while staying under the SDK's non-streaming timeout.
 */
const DEFAULT_MAX_TOKENS = 16000;

/**
 * What this adapter needs from a client, which both of them are.
 *
 * `BaseAnthropic` is the shared superclass but declares no `messages` — that resource is
 * added by each subclass — so the union is the honest common type rather than the base one.
 * Both members expose the same `messages.create`, which is the entire surface used here.
 */
export type ClaudeClient = Anthropic | AnthropicVertex;

export function buildVertexClient(projectId: string, region: string): AnthropicVertex {
  return new AnthropicVertex({ projectId, region });
}

export function buildApiKeyClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

/**
 * Pull the JSON out of a response.
 *
 * With `output_config.format` the model's answer arrives as ordinary text that happens to
 * satisfy the schema, so this reads the text block rather than a dedicated field. `parse()`
 * and its `parsed_output` are the Zod-helper path; the neutral schema here is plain JSON
 * Schema, so the parse is ours.
 */
export function textOf(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : "";
}

/**
 * A refusal is a real outcome here, and one Gemini does not have.
 *
 * Safety classifiers can decline a request with HTTP 200 and `stop_reason: "refusal"` — no
 * JSON, no error thrown. Left unchecked that reaches `JSON.parse("")` and surfaces as a parse
 * error, which sends whoever is debugging it looking at the schema instead of at the prompt.
 * Server-side `fallbacks` would re-run it on another model, but that parameter is not
 * available on Vertex, so naming the outcome is the honest handling.
 */
function assertAnswered(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    throw new AiCallError("The model declined to answer this request.");
  }
}

export function claudeProvider(client: ClaudeClient, models: string[]): ModelProvider {
  return {
    name: "claude",
    models: () => models,
    async generate<T extends object = Record<string, unknown>>(
      req: GenerateRequest,
    ): Promise<GenerateResult<T>> {
      const { value, model } = await runChain(models, (id) =>
        client.messages.create({
          model: id,
          max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages: [{ role: "user", content: req.prompt }],
          output_config: {
            // The neutral schema is already the shape this field wants. The cast is the
            // SDK's open `Record<string, unknown>` accepting a closed interface, not a
            // reshaping — see ../schema.ts.
            format: {
              type: "json_schema",
              schema: req.schema as unknown as Record<string, unknown>,
            },
          },
        }),
      );

      assertAnswered(value);
      return { data: JSON.parse(textOf(value) || "{}") as T, provider: "claude", model };
    },
  };
}

/** Re-exported so the seam's schema type is visible to callers building a provider by hand. */
export type { JsonSchema };
