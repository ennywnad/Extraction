/**
 * The chain answers exactly one question — is this model usable here — and the interesting
 * behaviour is which failures it declines to ask that question about. Retrying a bad key
 * against every entry is what turns the most common fresh-clone mistake into something that
 * reads like an outage.
 *
 * `runChain` takes its world as arguments, so every case here is a real exercise of the
 * decision rather than a mock of one: no SDK, no key, no environment variable. That is also
 * what makes this the **contract both adapters answer** — a stub Provider is the same
 * interface the real ones implement, so a rule proven here holds for Gemini and Claude alike
 * rather than being asserted twice and drifting.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AiCallError } from "../server/ai/errors.ts";
import { parseChain, runChain } from "../server/ai/client.ts";
import { RECOMMEND_SCHEMA } from "../server/ai/schema.ts";
import type { ChainEntry, Provider, ProviderName } from "../server/ai/providers/types.ts";

const request = { prompt: "hi", schema: RECOMMEND_SCHEMA };

function apiError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

/**
 * A provider whose n-th call produces the n-th scripted outcome, recording what it was asked.
 * `configured: false` is the deployment that names a provider it holds no credentials for.
 */
function stub(name: ProviderName, outcomes: unknown[] = [{ ok: true }], configured = true) {
  const asked: string[] = [];
  const provider: Provider = {
    name,
    configured: () => configured,
    async generate(model) {
      asked.push(model);
      const outcome = outcomes[asked.length - 1];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { provider, asked };
}

const chain = (...entries: string[]): ChainEntry[] => parseChain(entries.join(","));

describe("the chain — parsing", () => {
  it("splits provider:model", () => {
    assert.deepEqual(parseChain("claude:claude-opus-5"), [
      { provider: "claude", model: "claude-opus-5" },
    ]);
  });

  it("reads a bare id as Gemini, which is what every old GEMINI_MODELS value looks like", () => {
    assert.deepEqual(parseChain("gemini-3.5-flash"), [
      { provider: "gemini", model: "gemini-3.5-flash" },
    ]);
  });

  it("keeps a dated Claude snapshot intact, @ separator and all", () => {
    // The id convention differs from both the first-party API and Bedrock, and the only
    // separator this parser is allowed to care about is the first colon.
    assert.deepEqual(parseChain("claude:claude-opus-4-5@20251101"), [
      { provider: "claude", model: "claude-opus-4-5@20251101" },
    ]);
  });

  it("drops a typo'd entry rather than the whole chain", () => {
    // The point of a chain is that it survives one member being wrong. Throwing here would
    // turn a typo in one entry into a deployment that can reach no model at all.
    assert.deepEqual(parseChain("gpt:gpt-5,gemini:gemini-3.5-flash"), [
      { provider: "gemini", model: "gemini-3.5-flash" },
    ]);
    assert.deepEqual(parseChain("claude:,gemini:gemini-3.5-flash"), [
      { provider: "gemini", model: "gemini-3.5-flash" },
    ]);
  });

  it("ignores blanks and surrounding space", () => {
    assert.deepEqual(parseChain(" gemini:a , , claude:b "), [
      { provider: "gemini", model: "a" },
      { provider: "claude", model: "b" },
    ]);
  });
});

describe("the chain — deciding", () => {
  it("advances to the next entry when an id is not served here", async () => {
    const g = stub("gemini", [apiError(404, "model not found"), { ok: true }]);
    const result = await runChain(
      request,
      chain("gemini:a", "gemini:b"),
      "apikey",
      () => g.provider,
    );
    assert.deepEqual(g.asked, ["a", "b"]);
    assert.equal(result.model, "b");
    assert.equal(result.provider, "gemini");
  });

  it("advances on a network failure, which carries no status", async () => {
    const g = stub("gemini", [new Error("ECONNRESET"), { ok: true }]);
    await runChain(request, chain("gemini:a", "gemini:b"), "apikey", () => g.provider);
    assert.deepEqual(g.asked, ["a", "b"]);
  });

  it("falls from one provider to the other, which is the whole point of qualifying entries", async () => {
    // The shape this replaced could not express this at all: a chain was one provider's ids,
    // so a dead Claude id exhausted the chain instead of reaching Gemini.
    const c = stub("claude", [apiError(404)]);
    const g = stub("gemini", [{ ok: true }]);
    const lookup = (n: ProviderName) => (n === "claude" ? c.provider : g.provider);

    const result = await runChain(request, chain("claude:x", "gemini:y"), "vertex", lookup);
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "y");
  });

  it("skips a provider it has no credentials for, without spending a round trip", async () => {
    // A chain naming both providers on a deployment holding one set of credentials is a
    // normal state, not an error — and discovering that by getting a 401 costs a request and
    // reads like an outage in the log.
    const c = stub("claude", [{ ok: true }], false);
    const g = stub("gemini", [{ ok: true }]);
    const lookup = (n: ProviderName) => (n === "claude" ? c.provider : g.provider);

    const result = await runChain(request, chain("claude:x", "gemini:y"), "apikey", lookup);
    assert.deepEqual(c.asked, [], "must not have been called at all");
    assert.equal(result.provider, "gemini");
  });

  for (const status of [400, 401, 403]) {
    it(`stops on ${status} rather than asking a second model the same question`, async () => {
      const g = stub("gemini", [apiError(status), { ok: true }]);
      await assert.rejects(
        () => runChain(request, chain("gemini:a", "gemini:b"), "apikey", () => g.provider),
        (err: Error & { status?: number }) => {
          // The original error propagates, so the route sees the real status and the log says
          // "401", not "no model answered".
          assert.equal(err.status, status);
          assert.match(err.message, new RegExp(`HTTP ${status}`));
          return true;
        },
      );
      assert.deepEqual(g.asked, ["a"], "should not have tried the rest of the chain");
    });
  }

  it("reports the whole chain when nothing answers", async () => {
    const g = stub("gemini", [apiError(404, "gone"), apiError(503, "unavailable")]);
    await assert.rejects(
      () => runChain(request, chain("gemini:a", "gemini:b"), "apikey", () => g.provider),
      (err: AiCallError) => {
        assert.ok(err instanceof AiCallError);
        assert.match(err.message, /gemini:a: .*gone/);
        assert.match(err.message, /gemini:b: .*unavailable/);
        assert.equal(err.status, undefined, "not a rate limit");
        return true;
      },
    );
  });

  it("names skipped entries separately from failed ones", async () => {
    // "Nothing answered" and "nothing was reachable" are different problems, and only one of
    // them is fixed by changing a model id.
    const c = stub("claude", [], false);
    await assert.rejects(
      () => runChain(request, chain("claude:x"), "apikey", () => c.provider),
      (err: AiCallError) => {
        assert.match(err.message, /skipped/);
        assert.match(err.message, /no credentials for claude/);
        return true;
      },
    );
  });

  it("carries 429 out of an exhausted chain so the caller can back off", async () => {
    const g = stub("gemini", [apiError(404), apiError(429, "quota exceeded")]);
    await assert.rejects(
      () => runChain(request, chain("gemini:a", "gemini:b"), "apikey", () => g.provider),
      (err: AiCallError) => {
        assert.equal(err.status, 429);
        return true;
      },
    );
  });

  it("returns the parsed data the provider gave it", async () => {
    const g = stub("gemini", [{ recommendation: "free_stream" }]);
    const { data } = await runChain<{ recommendation: string }>(
      request,
      chain("gemini:a"),
      "apikey",
      () => g.provider,
    );
    assert.equal(data.recommendation, "free_stream");
  });
});
