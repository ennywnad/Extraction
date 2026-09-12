/**
 * The client's one door to a prompting route, and the flag that decides whether it knocks.
 *
 * Two jobs, and the second is the reason the module exists. It composes the POST that six call
 * sites were each writing out by hand — method, content type, `JSON.stringify` — and it folds in
 * whether this tab's session has asked the app to stay quiet.
 *
 * **A module holding the flag rather than a prop threaded into six components.** The same decision
 * as src/utils/lastAnswer.ts, for the same reason: the five mode components and the intake form
 * share nothing but the pile, and listening is a fact about the model seam rather than about any
 * mode. Threaded, it would be one more prop on six interfaces that are not about the model — and a
 * mode added later would keep talking straight through a briefing, silently, because a forgotten
 * prop looks like a mode nobody has got round to. Read here, everything that goes through this
 * door is quiet by construction and a new call site cannot forget.
 *
 * It is read when a call is composed rather than when a component renders, so there is no stale
 * flag closed over: the value is whatever the session said at the moment somebody asked.
 *
 * **The request is still made.** The server owns the fallback for every route — one copy per route,
 * already labelled `source: "fallback"`, already covered — so a quiet deployment and a quiet room
 * take the same path and the status board reads the same in both. Answering locally instead would
 * mean a second fallback per route in the browser, drifting from the one the server serves, which
 * is the drift the labelling in server/ai/respond.ts exists to prevent.
 *
 * **Synthesis does not come through here**, on either side of the wire. Listening silences what the
 * app says unasked; a level set is the one model call a person has to click for. See
 * docs/intents/005-listening-mode.md and `servesFallback` in server/ai/respond.ts.
 */

let quiet = false;

/**
 * Mirrors `Session.listening` into this module. Called by App whenever it changes — including
 * when a poll brings somebody else's decision in, and when a session closes.
 */
export function setListening(on: boolean): void {
  quiet = on;
}

export function isListening(): boolean {
  return quiet;
}

/**
 * POSTs to a prompting route, telling it to stay quiet when the session is listening.
 *
 * Returns the raw `Response`. Every call site parses its own shape and holds its own last-resort
 * static answer for a body that never arrives, and this is deliberately not the place that decides
 * either of those: what belongs here is only the part that would otherwise be repeated six times.
 */
export async function askModel(path: string, body: object): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(quiet ? { ...body, listening: true } : body),
  });
}
