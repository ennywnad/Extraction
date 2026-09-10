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
 * **Configuration is read in ./modelEnv.ts**, which holds the renames and why the old names
 * still work. The short version: `GENAI_BACKEND` and `GEMINI_MODELS` named a provider in a
 * place that no longer is one, so they are now `MODEL_BACKEND` and `MODEL_CHAIN` — while the
 * API keys keep their provider names, because with two providers there are two keys and a
 * single neutral one could not say which.
 */
import type { ModelProvider } from "./providers/types.ts";
import {
  modelBackendSetting,
  modelChainSetting,
  providerKey,
  resetDeprecationWarnings,
} from "./modelEnv.ts";
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

/** Vertex needs exactly this pair, whichever provider is served over it. */
function vertexTarget(): { project: string; location: string } | null {
  const project = process.env.FIRESTORE_PROJECT_ID?.trim();
  const location = process.env.VERTEX_LOCATION?.trim();
  return project && location ? { project, location } : null;
}

export function getProvider(): ModelProvider | null {
  if (resolved) return provider;
  resolved = true;

  const choice = modelBackendSetting();
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
    const key = providerKey("ANTHROPIC_API_KEY");
    if (!key) {
      console.error("claude-apikey requires ANTHROPIC_API_KEY; AI is disabled.");
      backend = "none";
      return (provider = null);
    }
    backend = "claude-apikey";
    return (provider = claudeProvider(buildClaudeApiKey(key), models));
  }

  // Unset or `apikey`: the Gemini Developer API, which is what a fresh clone with a key gets.
  const key = providerKey("GEMINI_API_KEY");
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
  const configured = modelChainSetting()
    ?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const choice = modelBackendSetting();
  return choice === "claude-vertex" || choice === "claude-apikey"
    ? CLAUDE_DEFAULT_MODELS
    : GEMINI_DEFAULT_MODELS;
}

/** Test seam: forget the resolved provider so a case can set different configuration. */
export function resetProviderForTest(): void {
  provider = null;
  resolved = false;
  backend = "none";
  resetDeprecationWarnings();
}
