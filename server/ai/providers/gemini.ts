/**
 * Gemini, through `@google/genai`.
 *
 * The adapter owns its client rather than receiving one, because the two providers' clients
 * are different types from different SDKs — `getGemini()` could not have grown a branch and
 * kept returning one thing. That is ordinary for an adapter and is the reason 002 says the
 * client type is part of what each adapter hides.
 *
 * **Schemas go through `responseJsonSchema`, not the `Type` enum.** The nine schemas in this
 * app were written as `{ type: Type.OBJECT, properties: … }`, which is JSON Schema in a Gemini
 * costume — `Type.OBJECT` is the string `"OBJECT"`. `responseJsonSchema` takes the plain
 * article directly, so the seam needs no translation step on this side at all, and the schemas
 * that were already ordinary JSON Schema get to stop pretending otherwise. It is also what
 * lets the *same object* reach both providers: an earlier version translated to the enum and
 * had to strip `additionalProperties`, which Gemini's `Schema` has no field for and Claude
 * requires. `responseJsonSchema` supports it, so the divergence is gone rather than managed.
 */
import { GoogleGenAI } from "@google/genai";
import type { ModelBackend, ModelRequest, Provider } from "./types.ts";

/**
 * Transient failures are the SDK's job, not the chain's.
 *
 * The SDK retries 408/429/5xx with backoff against the *same* model — but only when
 * `retryOptions` is present, and it is absent by default. Without it a single 503 demotes the
 * request to a weaker model over a blip that a backoff would have cleared.
 */
const RETRY_OPTIONS = { attempts: 3 };

let client: GoogleGenAI | null = null;
let resolved = false;

function build(backend: ModelBackend): GoogleGenAI | null {
  if (backend === "vertex") {
    const project = process.env.FIRESTORE_PROJECT_ID?.trim();
    const location = process.env.VERTEX_LOCATION?.trim();
    if (!project || !location) {
      console.error(
        "MODEL_BACKEND=vertex requires FIRESTORE_PROJECT_ID and VERTEX_LOCATION; Gemini is disabled.",
      );
      return null;
    }
    return new GoogleGenAI({
      enterprise: true, // `vertexai: true` is the legacy alias for the same backend
      project,
      location,
      httpOptions: { headers: { "User-Agent": "extraction" }, retryOptions: RETRY_OPTIONS },
    });
  }

  const key = process.env.GEMINI_API_KEY?.trim();
  // The .env.example placeholder is not a key. Treating it as one turns "nothing is
  // configured" into a 401 on the first request.
  if (!key || key === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { "User-Agent": "aistudio-build" }, retryOptions: RETRY_OPTIONS },
  });
}

function get(backend: ModelBackend): GoogleGenAI | null {
  if (!resolved) {
    resolved = true;
    client = backend === "none" ? null : build(backend);
  }
  return client;
}

/** Test seam. The client is resolved once per process, which a second case would not see. */
export function resetGemini(): void {
  client = null;
  resolved = false;
}

/**
 * The wire shape, as a pure function of the seam's shape.
 *
 * Exported so the translation can be asserted without a client, a key or a network: "the
 * schemas are the whole job" (002), and a translation nothing checks is the one place this
 * seam can quietly stop being one.
 */
export function geminiRequest(model: string, request: ModelRequest) {
  return {
    model,
    contents: request.prompt,
    config: {
      responseMimeType: "application/json", // required alongside responseJsonSchema
      responseJsonSchema: request.schema as unknown,
      ...(request.maxTokens ? { maxOutputTokens: request.maxTokens } : {}),
    },
  };
}

export const gemini: Provider = {
  name: "gemini",

  configured(backend: ModelBackend): boolean {
    return get(backend) !== null;
  },

  async generate(model: string, request: ModelRequest): Promise<unknown> {
    // `configured` is checked by the chain before this runs, so a null here is a bug rather
    // than a state — but throwing beats a non-null assertion that fails as a TypeError.
    const ai = client;
    if (!ai) throw new Error("Gemini adapter asked to generate with no client");

    const response = await ai.models.generateContent(geminiRequest(model, request));
    return JSON.parse(response.text || "{}");
  },
};

/**
 * The default chain's Gemini half.
 *
 * **Verify the retirement dates before trusting this list.** Last checked against the Vertex
 * release notes on 2026-09-10, via a live documentation query rather than from memory — see
 * docs/half-life-test.md for why that distinction is the whole point. A previous default had
 * gone dead in place: it was `gemini-2.5-flash` then `gemini-2.0-flash`, and 2.0-flash shut
 * down on 2026-06-01. A retired id answers 404, which is not fatal to the chain, so the chain
 * advanced to a second dead model and every request paid two round trips to reach the end.
 *
 *   gemini-3.5-flash       stable 2026-05-19, retires no earlier than 2027-05-19
 *   gemini-3.5-flash-lite  stable 2026-07-21, retires no earlier than 2027-07-21
 *
 * Note: Newer models like gemini-3.7-flash and gemini-3.8-flash are available and can
 * be used simply by overriding MODEL_CHAIN. The app passes the string straight to the SDK.
 *
 * The second entry is a cheaper model rather than an older one, which is the only fallback
 * that means anything: the chain advances on "this id is not served here", and a *previous
 * generation* id is strictly more likely to have been retired than the one that just failed.
 */
export const GEMINI_DEFAULT_CHAIN = "gemini:gemini-3.5-flash,gemini:gemini-3.5-flash-lite";
