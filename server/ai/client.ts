import { GoogleGenAI } from "@google/genai";

/**
 * Transient failures are the SDK's job, not the model chain's.
 *
 * The SDK retries 408/429/5xx with backoff against the *same* model — but only when
 * `retryOptions` is present, and it is absent by default. Without it a single 503 demotes the
 * request to a weaker model over a blip that a backoff would have cleared.
 */
const RETRY_OPTIONS = { attempts: 3 };

/**
 * Selects a Gemini backend.
 *
 * Vertex authenticates as the runtime service account through Application Default
 * Credentials, so a deployment holds no key material at all and the client's material stays
 * inside the project's own perimeter. The Developer API key path stays for local development,
 * where contributors have no gcloud setup.
 */
let client: GoogleGenAI | null = null;
let resolved = false;

export function getGemini(): GoogleGenAI | null {
  if (resolved) return client;
  resolved = true;

  if (process.env.GENAI_BACKEND === "vertex") {
    const project = process.env.FIRESTORE_PROJECT_ID?.trim();
    const location = process.env.VERTEX_LOCATION?.trim();
    if (!project || !location) {
      console.error(
        "GENAI_BACKEND=vertex requires FIRESTORE_PROJECT_ID and VERTEX_LOCATION; AI is disabled.",
      );
      return (client = null);
    }
    client = new GoogleGenAI({
      enterprise: true, // `vertexai: true` is the legacy alias for the same backend
      project,
      location,
      httpOptions: { headers: { "User-Agent": "extraction" }, retryOptions: RETRY_OPTIONS },
    });
    return client;
  }

  const key = process.env.GEMINI_API_KEY;
  if (key && key !== "MY_GEMINI_API_KEY") {
    client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" },
        retryOptions: RETRY_OPTIONS,
      },
    });
  }
  return client;
}

/**
 * Models to try, in order. Overridable because the valid ids differ between the Developer
 * API and Vertex and move faster than this file does — verify them against the backend you
 * deploy with rather than trusting this default.
 */
function modelChain(): string[] {
  const configured = process.env.GEMINI_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return configured?.length ? configured : ["gemini-2.5-flash", "gemini-2.0-flash"];
}

/**
 * Statuses where the next model in the chain cannot possibly do better.
 *
 * Advancing the chain answers exactly one question: is this model id usable on this backend?
 * A bad key, missing ADC, a disabled API, or a malformed request answers the same way for
 * every model in it. Retrying those turns a one-line diagnosis into a two-model "outage" —
 * and a wrong `GEMINI_API_KEY` is the most common way a fresh clone fails, so it is the one
 * error that most needs to say what it is.
 */
const FATAL_STATUSES = new Set([400, 401, 403]);

/** Carries the upstream status through the chain so a route can answer better than 500. */
export class AiCallError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiCallError";
  }
}

export async function generateContentWithFallback(ai: GoogleGenAI, requestParams: any) {
  const models = modelChain();
  const failures: string[] = [];
  let rateLimited = false;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({ ...requestParams, model });
      if (failures.length) console.warn(`Served by ${model} after ${failures.length} failure(s)`);
      return response;
    } catch (err: any) {
      const message = err?.message || String(err);
      // `status` is set by the SDK's ApiError for any 4xx/5xx. Absent for a network-level
      // failure, which is worth trying the next model for.
      const status: number | undefined = err?.status;
      if (status !== undefined && FATAL_STATUSES.has(status)) {
        console.error(`Model ${model} failed with ${status}; not trying the rest of the chain.`);
        throw err;
      }
      rateLimited ||= status === 429;
      failures.push(`${model}: ${message}`);
      console.warn(`Model ${model} failed: ${message}`);
    }
  }
  // Fail loudly with the whole chain: a wrong model id is otherwise invisible, costing a
  // round trip per model per request while looking like a generic outage.
  throw new AiCallError(
    `All models failed.\n  ${failures.join("\n  ")}`,
    rateLimited ? 429 : undefined,
  );
}

/**
 * Whether a failed call was rate limited, upstream or after exhausting the chain.
 *
 * The one upstream status worth passing to a caller, because it is the only one they can act
 * on. Everything else is the server's problem — including 401/403, where the user did nothing
 * wrong by asking and the deployment is misconfigured.
 */
export function isRateLimited(err: unknown): boolean {
  return (err as { status?: number })?.status === 429;
}
