/**
 * Try each entry in the chain, and report who answered.
 *
 * The chain answers exactly one question — *is this model usable here* — and the interesting
 * behaviour is which failures it declines to ask that question about. That rule is not
 * Gemini's; it is a fact about model ids moving faster than a checked-in default, and it
 * applies identically to Claude, where an id that has rotated out answers the same 404.
 *
 * **It takes its world as arguments.** The chain, the backend and the provider lookup are all
 * parameters rather than module state, so every decision in here — advance, stop, skip, carry
 * the status — is exercisable without an SDK, a key, or an environment variable. Same instinct
 * as coverage.ts: the part with a judgement in it should not need the world to be real.
 *
 * Transient failures are deliberately **not** handled here. Both SDKs retry 408/429/5xx with
 * backoff against the same model — `@google/genai` once `retryOptions` is set, the Anthropic
 * SDK by default — and demoting to a weaker model over a blip a backoff would have cleared is
 * the failure this separation prevents.
 */
import { AiCallError, isFatalStatus, statusOf } from "../errors.ts";
import type {
  ChainEntry,
  ModelBackend,
  ModelRequest,
  ModelResult,
  Provider,
  ProviderName,
} from "./types.ts";

export async function runChain<T = unknown>(
  request: ModelRequest,
  chain: ChainEntry[],
  backend: ModelBackend,
  lookup: (name: ProviderName) => Provider,
): Promise<ModelResult<T>> {
  const failures: string[] = [];
  const skipped: string[] = [];
  let rateLimited = false;

  for (const { provider, model } of chain) {
    const adapter = lookup(provider);

    // Skipped without a round trip: a chain that names Claude first on a Gemini-only
    // deployment should fall through to Gemini silently, not spend a request discovering it
    // cannot authenticate. This is the whole reason `configured` is on the Provider interface.
    if (!adapter.configured(backend)) {
      skipped.push(`${provider}:${model} (no credentials for ${provider})`);
      continue;
    }

    try {
      const data = (await adapter.generate(model, request)) as T;
      if (failures.length) {
        console.warn(`Served by ${provider}:${model} after ${failures.length} failure(s)`);
      }
      return { data, provider, model };
    } catch (err: unknown) {
      const status = statusOf(err);
      const message = (err as { message?: string })?.message || String(err);
      if (isFatalStatus(status)) {
        console.error(
          `${provider}:${model} failed with ${status}; not trying the rest of the chain.`,
        );
        throw err;
      }
      rateLimited ||= status === 429;
      failures.push(`${provider}:${model}: ${message}`);
      console.warn(`${provider}:${model} failed: ${message}`);
    }
  }

  // Fail loudly with the whole chain: a wrong model id is otherwise invisible, costing a round
  // trip per entry per request while looking like a generic outage. Skipped entries are named
  // too — "nothing answered" and "nothing was reachable" are different problems, and only one
  // of them is fixed by changing a model id.
  const detail = [...failures, ...skipped.map((s) => `${s} — skipped`)];
  throw new AiCallError(
    `No model answered.\n  ${detail.join("\n  ")}`,
    rateLimited ? 429 : undefined,
  );
}
