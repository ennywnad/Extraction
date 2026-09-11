/**
 * The model seam: one call, two providers behind it, chosen by configuration.
 *
 * The app's central claim is that configuration decides behavior. That was true of identity
 * and storage and only half true here — `getGemini()` abstracted *which Gemini* you reached
 * and nothing abstracted *that it was Gemini*. It is true of the call now: a route states a
 * prompt and a schema, and which provider answers is a property of the deployment.
 *
 * **Two axes, not one.** `MODEL_BACKEND` says how the client authenticates — `vertex` (ADC as
 * the runtime service account, no key material) or `apikey`. `MODEL_CHAIN` says who answers,
 * as `provider:model` entries tried in order. Keeping them apart is what lets a chain fall
 * from Claude to Gemini, and what keeps the configuration 2 + N rather than N × 2.
 *
 * **Nothing here reaches for Claude on its own.** The default chain is Gemini-only, because a
 * default that named Claude would change what an existing deployment does on its next restart.
 * The seam makes the provider a decision; it does not make the decision.
 *
 * Configuration is read in ./modelEnv.ts, which holds the renames and why the old names still
 * work. See docs/intents/002-model-provider-seam.md and 004-claude-and-the-gcp-model-gateway.md.
 */
import { modelBackendSetting, modelChainSetting } from "./modelEnv.ts";
import { runChain } from "./providers/chain.ts";
import { GEMINI_DEFAULT_CHAIN, gemini, resetGemini } from "./providers/gemini.ts";
import { claude, resetClaude } from "./providers/claude.ts";
import type {
  ChainEntry,
  ModelBackend,
  ModelRequest,
  ModelResult,
  Provider,
  ProviderName,
} from "./providers/types.ts";

export { AiCallError, isRateLimited } from "./errors.ts";
export { runChain } from "./providers/chain.ts";
export type {
  ChainEntry,
  JsonSchema,
  ModelBackend,
  ModelRequest,
  ModelResult,
  Provider,
  ProviderName,
} from "./providers/types.ts";

const PROVIDERS: Record<ProviderName, Provider> = { gemini, claude };

/**
 * Splits `provider:model`, defaulting to Gemini for a bare id.
 *
 * The bare form is what every existing `GEMINI_MODELS` value looks like, and it keeps working
 * for free — reading it as Gemini is both the compatible answer and the true one.
 *
 * An unknown prefix is dropped with a warning rather than throwing. A typo in one entry of a
 * chain should cost that entry, not the whole deployment's ability to reach a model: the point
 * of a chain is that it survives one member being wrong.
 */
export function parseChain(raw: string): ChainEntry[] {
  const entries: ChainEntry[] = [];
  for (const part of raw.split(",").map((p) => p.trim())) {
    if (!part) continue;
    const at = part.indexOf(":");
    if (at === -1) {
      entries.push({ provider: "gemini", model: part });
      continue;
    }
    const provider = part.slice(0, at).trim();
    const model = part.slice(at + 1).trim();
    if (!model) {
      console.warn(`Chain entry "${part}" names no model; ignoring it.`);
      continue;
    }
    if (provider !== "gemini" && provider !== "claude") {
      console.warn(`Chain entry "${part}" names unknown provider "${provider}"; ignoring it.`);
      continue;
    }
    entries.push({ provider, model });
  }
  return entries;
}

/** Models to try, in order, already split into provider and id. */
export function modelChain(): ChainEntry[] {
  const configured = modelChainSetting();
  const parsed = configured ? parseChain(configured) : [];
  return parsed.length ? parsed : parseChain(GEMINI_DEFAULT_CHAIN);
}

/**
 * How the client authenticates. Reported rather than only logged, so something other than the
 * boot log can answer "where is the model coming from".
 */
export function modelBackend(): ModelBackend {
  const setting = modelBackendSetting();
  if (setting === "vertex") return "vertex";
  if (setting === "apikey") return "apikey";
  // Unset behaves as apikey, which is what a fresh clone with a key in .env expects.
  return "apikey";
}

/**
 * The providers the chain names that can actually be reached under this backend.
 *
 * A chain naming both providers on a deployment holding one set of credentials is a normal
 * state rather than an error — so this answers what is live, and `aiAvailable()` is the
 * question every route already asks.
 */
export function availableProviders(): ProviderName[] {
  const backend = modelBackend();
  const named = new Set(modelChain().map((e) => e.provider));
  return [...named].filter((name) => PROVIDERS[name].configured(backend));
}

/** Whether any model at all can be reached. Every AI route has a static answer when not. */
export function aiAvailable(): boolean {
  return availableProviders().length > 0;
}

/**
 * Asks the chain for a structured answer, and reports who gave it.
 *
 * Entries whose provider has no credentials are skipped without a round trip: a chain that
 * names Claude first on a Gemini-only deployment should fall through to Gemini silently, not
 * spend a request discovering that it cannot authenticate.
 */
export async function generate<T = unknown>(request: ModelRequest): Promise<ModelResult<T>> {
  return runChain<T>(request, modelChain(), modelBackend(), (name) => PROVIDERS[name]);
}

/** Test seam: both adapters resolve their client once per process. */
export function resetProviders(): void {
  resetGemini();
  resetClaude();
}
