/**
 * Gemini behind the seam.
 *
 * This is the provider the app shipped with, moved rather than rewritten: the model chain,
 * the fatal-status gate and the SDK's retry policy are the same code that was in `client.ts`,
 * and the only genuinely new part is the schema translation at the bottom.
 *
 * Two Gemini backends, one adapter. Vertex authenticates as the runtime service account
 * through Application Default Credentials, so a deployment holds no key material at all and
 * the client's material stays inside the project's own perimeter. The Developer API key path
 * stays for local development, where contributors have no gcloud setup.
 */
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import type { JsonSchema } from "../schema.ts";
import { runChain } from "./chain.ts";
import type { GenerateRequest, GenerateResult, ModelProvider } from "./types.ts";

/**
 * Transient failures are the SDK's job, not the model chain's.
 *
 * The SDK retries 408/429/5xx with backoff against the *same* model — but only when
 * `retryOptions` is present, and it is absent by default. Without it a single 503 demotes the
 * request to a weaker model over a blip that a backoff would have cleared.
 */
const RETRY_OPTIONS = { attempts: 3 };

/**
 * Models to try, in order. Overridable because the valid ids differ between the Developer
 * API and Vertex and move faster than this file does — verify them against the backend you
 * deploy with rather than trusting this default.
 *
 * **Verify the retirement dates before trusting this list.** Last checked against the Vertex
 * release notes on 2026-09-10, via a live documentation query rather than from memory — see
 * docs/half-life-test.md for why that distinction is the whole point. A previous default had
 * gone dead in place: it was `["gemini-2.5-flash", "gemini-2.0-flash"]`, and 2.0-flash shut
 * down on 2026-06-01. A retired id answers 404, which is not fatal to the chain, so the chain
 * advanced to a second dead model and every request paid two round trips to reach "All models
 * failed". `deploy.sh` sets no model override, so whatever is written here is what production
 * runs.
 *
 * Current chain, with the dates that will make it wrong:
 *   gemini-3.5-flash       stable 2026-05-19, retires no earlier than 2027-05-19
 *   gemini-3.5-flash-lite  stable 2026-07-21, retires no earlier than 2027-07-21
 *
 * The second entry is a cheaper model rather than an older one, which is the only fallback
 * that means anything: the chain advances on "this id is not served here", and a *previous
 * generation* id is strictly more likely to have been retired than the one that just failed.
 */
export const GEMINI_DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];

export function buildVertexClient(project: string, location: string): GoogleGenAI {
  return new GoogleGenAI({
    enterprise: true, // `vertexai: true` is the legacy alias for the same backend
    project,
    location,
    httpOptions: { headers: { "User-Agent": "extraction" }, retryOptions: RETRY_OPTIONS },
  });
}

export function buildApiKeyClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { "User-Agent": "aistudio-build" },
      retryOptions: RETRY_OPTIONS,
    },
  });
}

/**
 * Runs the chain and reports which model answered.
 *
 * The served model used to be computed here and thrown away into a `console.warn`. The seam
 * needs it — `source` on every AI response now names the model that wrote the body — so it is
 * returned rather than logged.
 */
/**
 * `models` is required rather than defaulted.
 *
 * A default here would be a second place the chain is decided, and it would be the one that
 * silently ignores `MODEL_IDS` — configuration resolves in `client.ts` and is handed down, so
 * there is exactly one answer to "what will this try".
 */
export async function generateContentWithFallback(
  ai: GoogleGenAI,
  requestParams: any,
  models: string[],
) {
  const { value, model } = await runChain(models, (id) =>
    ai.models.generateContent({ ...requestParams, model: id }),
  );
  return { response: value, model };
}

/**
 * Plain JSON Schema to Gemini's `Schema`.
 *
 * Structurally the same tree with a different spelling for `type`, plus one omission that
 * matters: Gemini's `Schema` has **no `additionalProperties` field**. Claude's structured
 * outputs require it and Gemini rejects unknown schema fields, so this is not a field that
 * could have been left in for both to read — the neutral schema carries it and each adapter
 * decides. Dropping it here loses nothing, because Gemini's constrained decoding does not
 * invent properties that are not in `properties` in the first place.
 */
export function toGeminiSchema(schema: JsonSchema): Schema {
  switch (schema.type) {
    case "string":
      return { type: Type.STRING, description: schema.description };
    case "integer":
      return { type: Type.INTEGER, description: schema.description };
    case "number":
      return { type: Type.NUMBER, description: schema.description };
    case "boolean":
      return { type: Type.BOOLEAN, description: schema.description };
    case "array":
      return {
        type: Type.ARRAY,
        description: schema.description,
        items: toGeminiSchema(schema.items),
      };
    case "object": {
      const properties: Record<string, Schema> = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        properties[key] = toGeminiSchema(value);
      }
      return {
        type: Type.OBJECT,
        description: schema.description,
        properties,
        required: schema.required,
      };
    }
  }
}

export function geminiProvider(ai: GoogleGenAI, models: string[]): ModelProvider {
  return {
    name: "gemini",
    models: () => models,
    async generate<T extends object = Record<string, unknown>>(
      req: GenerateRequest,
    ): Promise<GenerateResult<T>> {
      const { response, model } = await generateContentWithFallback(
        ai,
        {
          contents: req.prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(req.schema),
          },
        },
        models,
      );
      return { data: JSON.parse(response.text || "{}") as T, provider: "gemini", model };
    },
  };
}
