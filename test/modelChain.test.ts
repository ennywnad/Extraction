/**
 * The model chain answers exactly one question — is this model id usable on this backend —
 * and the interesting behaviour is which failures it declines to ask that question about.
 * Retrying a bad key against every model in the chain is what turns the most common
 * fresh-clone mistake into something that reads like an outage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GoogleGenAI } from "@google/genai";
import { AiCallError, generateContentWithFallback } from "../server/ai/client.ts";

/**
 * The chain is handed its models rather than reading them from the environment — that
 * resolution lives in `client.ts` and happens once. So these cases name the chain directly
 * and test the mechanics, which is all this function decides.
 */
const CHAIN = ["model-a", "model-b"];

/** Shaped like the SDK's ApiError: a plain HTTP status on an Error. */
function apiError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

/** A client whose n-th call produces the n-th scripted outcome. Records what it was asked. */
function scriptedClient(outcomes: unknown[]) {
  const calls: string[] = [];
  const ai = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        const outcome = outcomes[calls.length - 1];
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  } as unknown as GoogleGenAI;
  return { ai, calls };
}

describe("model chain", () => {
  it("advances to the next model when an id is not served here", async () => {
    const { ai, calls } = scriptedClient([apiError(404, "model not found"), { text: "{}" }]);
    const { response, model } = await generateContentWithFallback(ai, { contents: "hi" }, CHAIN);
    assert.deepEqual(calls, ["model-a", "model-b"]);
    assert.equal((response as { text: string }).text, "{}");
    // Which model answered is returned rather than only logged: `source` on every AI response
    // names the provider that wrote the body, and it cannot do that from a console.warn.
    assert.equal(model, "model-b");
  });

  it("advances on a network failure, which carries no status", async () => {
    const { ai, calls } = scriptedClient([new Error("ECONNRESET"), { text: "{}" }]);
    await generateContentWithFallback(ai, { contents: "hi" }, CHAIN);
    assert.deepEqual(calls, ["model-a", "model-b"]);
  });

  for (const status of [400, 401, 403]) {
    it(`stops on ${status} rather than asking a second model the same question`, async () => {
      const { ai, calls } = scriptedClient([apiError(status), { text: "{}" }]);
      await assert.rejects(
        () => generateContentWithFallback(ai, { contents: "hi" }, CHAIN),
        (err: Error & { status?: number }) => {
          // The original error propagates, so the route sees the real status and the log
          // says "401", not "all models failed".
          assert.equal(err.status, status);
          assert.match(err.message, new RegExp(`HTTP ${status}`));
          return true;
        },
      );
      assert.deepEqual(calls, ["model-a"], "should not have tried the rest of the chain");
    });
  }

  it("reports the whole chain when every model fails", async () => {
    const { ai } = scriptedClient([apiError(404, "gone"), apiError(503, "unavailable")]);
    await assert.rejects(
      () => generateContentWithFallback(ai, { contents: "hi" }, CHAIN),
      (err: AiCallError) => {
        assert.ok(err instanceof AiCallError);
        assert.match(err.message, /model-a: .*gone/);
        assert.match(err.message, /model-b: .*unavailable/);
        assert.equal(err.status, undefined, "not a rate limit");
        return true;
      },
    );
  });

  it("carries 429 out of an exhausted chain so the caller can back off", async () => {
    const { ai } = scriptedClient([apiError(404), apiError(429, "quota exceeded")]);
    await assert.rejects(
      () => generateContentWithFallback(ai, { contents: "hi" }, CHAIN),
      (err: AiCallError) => {
        assert.equal(err.status, 429);
        return true;
      },
    );
  });
});
