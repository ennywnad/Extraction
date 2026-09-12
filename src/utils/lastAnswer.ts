/**
 * Who wrote the last AI response this browser received.
 *
 * Every AI route has a static fallback so the app stays usable with no model — a deliberate
 * property, and the failure mode it creates is the one `server/ai/respond.ts` exists to close:
 * canned output is shaped exactly like generated output, so a misconfigured deployment looks
 * like a working one that has gone bland. The server already declares the substitution, on a
 * header for anything that never parses the body and on `source` for the app.
 *
 * Nothing read either. This module is the client half: the nine call sites record what came
 * back, and the status board draws it.
 *
 * **A store rather than a prop threaded through the modes.** The nine fetches live in eight
 * components that reach the pile through `onAddThought` and otherwise share nothing. Threading
 * a callback would put a parameter about the model seam on eight mode interfaces, none of
 * which are about the model. So a call site records into here and the board reads here, which
 * is one import at each end and no prop in between.
 *
 * **What it deliberately does not hold.** One value, not a log: the board asks "is this
 * deployment answering", which the most recent answer settles. A history would be a different
 * feature with a retention question attached, and it is not what 007 asked for.
 */

/**
 * What the server said wrote the body.
 *
 * `unstated` is the honest third state and the reason this is not a boolean. The seven solo
 * routes in server.ts go through `sendModel` / `sendFallback` and always say. The group
 * synthesize route in server/engagementRoutes.ts answers with a plain `res.json(levelSet)` and
 * says nothing — so an absent marker means "this route does not report", never "a model wrote
 * it". Defaulting absence to `model` would make the board assert exactly what it was not told,
 * on the one screen whose job is refusing to do that.
 */
export type AnswerSource = "model" | "fallback" | "unstated";

/** Which family answered. Never a model id — same disclosure line /healthz draws. */
export type AnswerProvider = "gemini" | "claude";

export interface LastAnswer {
  /** The route that answered, as a person would name it: "quick fire", not the path. */
  route: string;
  source: AnswerSource;
  /** Present only when a model answered and the route named the family. */
  provider?: AnswerProvider;
  /** When this browser received it, for "3m ago". */
  at: number;
}

const PROVIDERS: AnswerProvider[] = ["gemini", "claude"];

/** Just enough of a Response to read the two headers, so a test needs no fetch. */
export interface AnswerHeaders {
  get(name: string): string | null;
}

/**
 * Reads what a response says about itself.
 *
 * Header first, body second. They agree in every case the server produces, but the header is
 * the one `sendFallback` sets unconditionally, while `source` on the body is a field a route
 * could in principle forget to spread. Neither present is `unstated` rather than a guess.
 *
 * Pure, and separate from the recording below, so the parsing is testable without a store.
 */
export function readAnswer(
  route: string,
  headers: AnswerHeaders,
  body: unknown,
  at: number,
): LastAnswer {
  const data = (body ?? {}) as { source?: unknown; provider?: unknown };

  const stated = headers.get("X-Extraction-AI-Source") ?? data.source;
  const source: AnswerSource =
    stated === "model" ? "model" : stated === "fallback" ? "fallback" : "unstated";

  const named = headers.get("X-Extraction-AI-Provider") ?? data.provider;
  const provider = PROVIDERS.find((p) => p === named);

  // A provider on a fallback would be the board naming a model that did not write the words.
  return source === "model" && provider ? { route, source, provider, at } : { route, source, at };
}

let current: LastAnswer | null = null;
const listeners = new Set<() => void>();

/**
 * Records what a route answered with.
 *
 * Called after the body is parsed and before the caller decides whether it liked the shape:
 * a response whose fields were wrong is still a response the server wrote, and which half of
 * the seam produced it is exactly what somebody debugging that wants to know.
 */
export function recordAnswer(route: string, headers: AnswerHeaders, body: unknown): void {
  current = readAnswer(route, headers, body, Date.now());
  for (const listener of listeners) listener();
}

/** The snapshot, stable by reference until something is recorded — `useSyncExternalStore`. */
export function lastAnswer(): LastAnswer | null {
  return current;
}

export function subscribeToAnswers(listener: () => void): () => void {
  listeners.add(listener);
  // Braced rather than returning `listeners.delete(...)`: the unsubscribe is declared to
  // return void, and handing React a boolean it ignores is a lie in the signature.
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: the store outlives a single case otherwise, being module state. */
export function resetAnswers(): void {
  current = null;
  listeners.clear();
}
