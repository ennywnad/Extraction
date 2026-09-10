/**
 * The failure vocabulary every provider shares.
 *
 * This lives apart from both `client.ts` and the adapters because all three need it and a
 * cycle between them would be the alternative. It is also the part of the model seam that was
 * already provider-neutral before there was a seam: `FATAL_STATUSES` and the rate-limit
 * passthrough reason about HTTP status codes, and both SDKs put a plain numeric `status` on
 * their error objects — `@google/genai`'s `ApiError` and `@anthropic-ai/sdk`'s `APIError`
 * alike. Nothing here had to change to serve a second provider; it only had to move.
 */

/**
 * Statuses where the next model in the chain cannot possibly do better.
 *
 * Advancing the chain answers exactly one question: is this model id usable on this backend?
 * A bad key, missing ADC, a disabled API, or a malformed request answers the same way for
 * every model in it. Retrying those turns a one-line diagnosis into a two-model "outage" —
 * and a wrong key is the most common way a fresh clone fails, so it is the one error that
 * most needs to say what it is.
 */
const FATAL_STATUSES = new Set([400, 401, 403]);

export function isFatalStatus(status: number | undefined): boolean {
  return status !== undefined && FATAL_STATUSES.has(status);
}

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

/** The numeric status an SDK put on an error, if it put one there at all. */
export function statusOf(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}
