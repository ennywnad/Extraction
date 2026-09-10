/**
 * Try each model id in order, and report which one answered.
 *
 * The chain answers exactly one question — *is this model id usable on this backend* — and
 * the interesting behaviour is which failures it declines to ask that question about. That
 * rule is not Gemini's; it is a fact about model ids moving faster than a checked-in default,
 * and it applies identically to Claude on Vertex, where an id that has rotated out answers
 * the same 404. So it lives here once rather than once per adapter: two copies of this loop
 * would drift, and the way they would drift is one of them quietly retrying a bad credential
 * against every model in the chain.
 *
 * Transient failures are deliberately **not** handled here. Both SDKs retry 408/429/5xx with
 * backoff against the same model — `@google/genai` once `retryOptions` is set, the Anthropic
 * SDK by default — and demoting to a weaker model over a blip a backoff would have cleared is
 * the failure this separation prevents.
 */
import { AiCallError, isFatalStatus, statusOf } from "../errors.ts";

export async function runChain<T>(
  models: string[],
  attempt: (model: string) => Promise<T>,
): Promise<{ value: T; model: string }> {
  const failures: string[] = [];
  let rateLimited = false;

  for (const model of models) {
    try {
      const value = await attempt(model);
      if (failures.length) console.warn(`Served by ${model} after ${failures.length} failure(s)`);
      return { value, model };
    } catch (err: any) {
      const message = err?.message || String(err);
      // `status` is set by either SDK's error type for any 4xx/5xx. Absent for a
      // network-level failure, which is worth trying the next model for.
      const status = statusOf(err);
      if (isFatalStatus(status)) {
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
