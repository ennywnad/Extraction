/**
 * How an AI route answers: who wrote the body, and what a caller is told when nobody could.
 *
 * Every AI route has a static fallback so the app stays usable with no model configured —
 * that is a deliberate property, and it is what lets a fresh clone (or a workshop laptop with
 * no key) run end to end. The failure mode it creates is that canned output is shaped exactly
 * like generated output, so a misconfigured deployment looks like a working one that has
 * gone bland.
 *
 * So the substitution is declared rather than silent: `source` on the body for the app, and a
 * header for everything that never parses the body — curl, a proxy log, a smoke test.
 */
import type { Response } from "express";
import { isRateLimited } from "./client.ts";
import type { GenerateResult } from "./providers/types.ts";

export type AiSource = "model" | "fallback";

const HEADER = "X-Extraction-AI-Source";
const PROVIDER_HEADER = "X-Extraction-AI-Provider";

/**
 * A response the model actually generated.
 *
 * **Two headers rather than one widened one.** `X-Extraction-AI-Source` keeps its exact
 * `model` / `fallback` contract — it answers the question this module exists for, and folding
 * a provider name into it would mean anything reading it has to parse rather than compare.
 * The provider rides beside it.
 *
 * **The provider is named; the model id is not.** That is the same line `/healthz` draws when
 * it reports `vertex` and a chain length but never the ids, and it is drawn here for the same
 * reason: `/api/session/*` carries no identity requirement in a solo deployment, so anything
 * on these responses is readable by anyone who can reach the port. Which family answered is
 * deployment shape, of a piece with what the status board already shows. Exactly which model
 * id and version served a given request is a narrower fact, and it stays in the server log
 * where `runChain` already puts it.
 */
export function sendModel<T extends object>(res: Response, result: GenerateResult<T>) {
  res.setHeader(HEADER, "model");
  res.setHeader(PROVIDER_HEADER, result.provider);
  return res.json({
    ...result.data,
    source: "model" satisfies AiSource,
    provider: result.provider,
  });
}

/**
 * A response the server substituted because no model is configured. `notice` is written for a
 * human reading the response, not for the UI, which has its own banner driven by /healthz.
 */
export function sendFallback<T extends object>(res: Response, body: T) {
  res.setHeader(HEADER, "fallback");
  return res.json({
    ...body,
    source: "fallback" satisfies AiSource,
    notice:
      "AI is not configured on this server, so this response is a fixed placeholder and is not tailored to the session. See GENAI_BACKEND in .env.example.",
  });
}

/**
 * An error whose message was written to be read by the caller.
 *
 * The marker exists so that returning a message is a decision someone made, rather than the
 * default for anything that doesn't look dangerous — see `sendAiError`.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Reports a failed AI call.
 *
 * A message reaches the caller only if it is a `UserFacingError`. Everything else is
 * summarised, because an error from a client library carries whatever that library felt like
 * saying: the SDK passes Gemini's body through verbatim, and on Vertex it names the project
 * and the full model resource path, while a Firestore failure names the project and document
 * path. `/api/session/*` has no identity requirement in a solo deployment, so anything
 * reachable there is reachable by anyone.
 *
 * Allowlisted rather than denylisted on purpose. The first version of this tested for an
 * upstream HTTP status, which read a Firestore error — `code`, not `status` — as safe.
 *
 * Routes call this rather than formatting their own error, so the sanitising is not something
 * a new route can forget to do.
 */
export function sendAiError(res: Response, label: string, err: unknown, defaultStatus = 500) {
  console.error(`${label} error:`, err);
  const status = isRateLimited(err) ? 429 : defaultStatus;
  return res.status(status).json({ error: safeMessage(err) });
}

function safeMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (isRateLimited(err)) return "The AI service is rate limited. Try again in a moment.";
  return "The AI request failed. See the server log for the details.";
}
