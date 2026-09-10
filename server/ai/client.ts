/**
 * Which model provider this instance talks to, decided by configuration.
 *
 * Identity resolves its branch at boot, storage picks Firestore or a JSON file by whether a
 * project id is set, and this is the same decision for the model. What changed is that it is
 * now a decision between *providers* rather than between two ways of reaching one of them:
 * `getGemini()` abstracted which Gemini you reached, and nothing abstracted that it was
 * Gemini. The adapters in ./providers hold that; this file only chooses.
 *
 * **`getProvider()` returns `null` when nothing is configured, and every AI route has a static
 * fallback.** That is the property that lets a fresh clone run end to end with no cloud setup
 * at all, and it survives having two providers — "no model" is one answer here, not one per
 * provider.
 *
 * **The environment variables lost their provider name, and the old ones still work.**
 * `GEMINI_API_KEY`, `GEMINI_MODELS` and `GENAI_BACKEND` each name a provider in a place that
 * is no longer provider-specific. Renaming them outright would break a documented deployment —
 * `scripts/deploy.sh` pushes straight to production and sets `GENAI_BACKEND=vertex` — so the
 * new names are read first and the old ones are honoured with a warning. The aliases had to
 * land in the same change as the seam rather than after it, for exactly that reason.
 */
import type { ModelProvider } from "./providers/types.ts";
import {
  GEMINI_DEFAULT_MODELS,
  buildApiKeyClient as buildGeminiApiKey,
  buildVertexClient as buildGeminiVertex,
  geminiProvider,
} from "./providers/gemini.ts";
import {
  CLAUDE_DEFAULT_MODELS,
  buildApiKeyClient as buildClaudeApiKey,
  buildVertexClient as buildClaudeVertex,
  claudeProvider,
} from "./providers/claude.ts";

export { AiCallError, isRateLimited } from "./errors.ts";
export { generateContentWithFallback } from "./providers/gemini.ts";
export type { ModelProvider, GenerateRequest, GenerateResult } from "./providers/types.ts";

/**
 * Which branch this instance took — reported rather than only logged, so something other than
 * the boot log can answer "where is the model coming from".
 *
 * `none` covers both "nothing configured" and "a backend was asked for and is misconfigured".
 * The two Claude entries are separate values rather than a provider field beside a backend
 * field, because every consumer of this asks one question: which of the ways this app can
 * reach a model is live. Splitting it into two axes would mean four combinations to render on
 * a board where only these five exist.
 */
export type ModelBackend = "vertex" | "apikey" | "claude-vertex" | "claude-apikey" | "none";

let provider: ModelProvider | null = null;
let resolved = false;
let backend: ModelBackend = "none";

/** Placeholders in .env.example. A key still set to one of these is not a key. */
const PLACEHOLDERS = new Set(["MY_GEMINI_API_KEY", "MY_ANTHROPIC_API_KEY"]);

let warnedLegacy = false;

/**
 * Reads the current name, falling back to the one that named a provider.
 *
 * The warning fires once per process rather than per read: it is a note for whoever deploys
 * next, and a line per AI request would be noise in exactly the logs someone is reading for
 * something else.
 */
function setting(current: string, legacy: string): string | undefined {
  const value = process.env[current]?.trim();
  if (value) return value;
  const fallback = process.env[legacy]?.trim();
  if (fallback && !warnedLegacy) {
    warnedLegacy = true;
    console.warn(
      `${legacy} is deprecated and still honoured; the provider-neutral name is ${current}. See .env.example.`,
    );
  }
  return fallback;
}

function apiKey(current: string, legacy: string): string | undefined {
  const value = setting(current, legacy);
  return value && !PLACEHOLDERS.has(value) ? value : undefined;
}

/** Vertex needs exactly this pair, whichever provider is served over it. */
function vertexTarget(): { project: string; location: string } | null {
  const project = process.env.FIRESTORE_PROJECT_ID?.trim();
  const location = process.env.VERTEX_LOCATION?.trim();
  return project && location ? { project, location } : null;
}

export function getProvider(): ModelProvider | null {
  if (resolved) return provider;
  resolved = true;

  const choice = setting("MODEL_BACKEND", "GENAI_BACKEND");
  const models = modelChain();

  if (choice === "vertex" || choice === "claude-vertex") {
    const target = vertexTarget();
    if (!target) {
      console.error(`${choice} requires FIRESTORE_PROJECT_ID and VERTEX_LOCATION; AI is disabled.`);
      backend = "none";
      return (provider = null);
    }
    if (choice === "claude-vertex") {
      backend = "claude-vertex";
      return (provider = claudeProvider(
        buildClaudeVertex(target.project, target.location),
        models,
      ));
    }
    backend = "vertex";
    return (provider = geminiProvider(buildGeminiVertex(target.project, target.location), models));
  }

  if (choice === "claude-apikey") {
    const key = apiKey("MODEL_API_KEY", "ANTHROPIC_API_KEY");
    if (!key) {
      console.error("claude-apikey requires ANTHROPIC_API_KEY; AI is disabled.");
      backend = "none";
      return (provider = null);
    }
    backend = "claude-apikey";
    return (provider = claudeProvider(buildClaudeApiKey(key), models));
  }

  // Unset or `apikey`: the Gemini Developer API, which is what a fresh clone with a key gets.
  const key = apiKey("MODEL_API_KEY", "GEMINI_API_KEY");
  if (key) {
    backend = "apikey";
    provider = geminiProvider(buildGeminiApiKey(key), models);
  }
  return provider;
}

/**
 * The backend behind the live provider. Resolves it if nothing has asked yet, so this answers
 * the same before and after the first AI request.
 */
export function modelBackend(): ModelBackend {
  getProvider();
  return backend;
}

/** Whether the selected provider is Claude — the two backends that reach it. */
export function isClaudeBackend(b: ModelBackend): boolean {
  return b === "claude-vertex" || b === "claude-apikey";
}

/**
 * Models to try, in order.
 *
 * The default depends on which provider was selected, because a model id is only meaningful
 * against one of them. An override applies to whichever provider is live — it is a list of
 * ids for *this* deployment, not a Gemini list that Claude has to ignore.
 *
 * Verify the ids and their retirement dates against the backend you deploy with; they move
 * faster than this repo does, and each adapter carries the dates it was last checked against.
 */
export function modelChain(): string[] {
  const configured = setting("MODEL_IDS", "GEMINI_MODELS")
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const choice = setting("MODEL_BACKEND", "GENAI_BACKEND");
  return choice === "claude-vertex" || choice === "claude-apikey"
    ? CLAUDE_DEFAULT_MODELS
    : GEMINI_DEFAULT_MODELS;
}

/** Test seam: forget the resolved provider so a case can set different configuration. */
export function resetProviderForTest(): void {
  provider = null;
  resolved = false;
  backend = "none";
  warnedLegacy = false;
}
