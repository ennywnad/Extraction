import { GoogleGenAI } from "@google/genai";

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
        "GENAI_BACKEND=vertex requires FIRESTORE_PROJECT_ID and VERTEX_LOCATION; AI is disabled."
      );
      return (client = null);
    }
    client = new GoogleGenAI({
      enterprise: true, // `vertexai: true` is the legacy alias for the same backend
      project,
      location,
      httpOptions: { headers: { "User-Agent": "extraction" } },
    });
    return client;
  }

  const key = process.env.GEMINI_API_KEY;
  if (key && key !== "MY_GEMINI_API_KEY") {
    client = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
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
  const configured = process.env.GEMINI_MODELS?.split(",").map((m) => m.trim()).filter(Boolean);
  return configured?.length ? configured : ["gemini-2.5-flash", "gemini-2.0-flash"];
}

export async function generateContentWithFallback(ai: GoogleGenAI, requestParams: any) {
  const models = modelChain();
  const failures: string[] = [];

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({ ...requestParams, model });
      if (failures.length) console.warn(`Served by ${model} after ${failures.length} failure(s)`);
      return response;
    } catch (err: any) {
      const message = err?.message || String(err);
      failures.push(`${model}: ${message}`);
      console.warn(`Model ${model} failed: ${message}`);
    }
  }
  // Fail loudly with the whole chain: a wrong model id is otherwise invisible, costing a
  // round trip per model per request while looking like a generic outage.
  throw new Error(`All models failed.\n  ${failures.join("\n  ")}`);
}
