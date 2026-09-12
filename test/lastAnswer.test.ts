/**
 * What a response is allowed to say about who wrote it.
 *
 * Same instinct as test/status.test.ts: the interesting cases are the ones where the client
 * could overstate what the server told it. A fallback that reads as a model answer is the
 * exact failure server/ai/respond.ts was written to close, and it would be reintroduced here
 * by one careless default.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  lastAnswer,
  readAnswer,
  recordAnswer,
  resetAnswers,
  subscribeToAnswers,
} from "../src/utils/lastAnswer.ts";

const AT = Date.parse("2026-09-11T10:00:00.000Z");

/** The two headers a route sets, as a Response would expose them. */
const headers = (over: Record<string, string> = {}) => ({
  get: (name: string) => over[name] ?? null,
});

const model = headers({
  "X-Extraction-AI-Source": "model",
  "X-Extraction-AI-Provider": "gemini",
});

describe("reading who answered", () => {
  it("takes the source from the header", () => {
    const answer = readAnswer("quick fire", model, {}, AT);
    assert.equal(answer.source, "model");
    assert.equal(answer.provider, "gemini");
    assert.equal(answer.route, "quick fire");
    assert.equal(answer.at, AT);
  });

  it("falls back to the body when the header is absent", () => {
    // Both are set by the same helper, but the header is the one sendFallback sets
    // unconditionally while `source` is a field a route spreads — so each can stand alone.
    const answer = readAnswer("quick fire", headers(), { source: "fallback" }, AT);
    assert.equal(answer.source, "fallback");
  });

  it("calls an unmarked response unstated rather than assuming a model wrote it", () => {
    // The load-bearing case. Every route in the app declares a source today, so this is what
    // protects the board from the next one that forgets to: defaulting absence to "model"
    // would have it assert what it was never told, the one thing it exists not to do.
    const answer = readAnswer("some new route", headers(), { summary: "..." }, AT);
    assert.equal(answer.source, "unstated");
    assert.equal(answer.provider, undefined);
  });

  it("reads a model answer that names no family as a model answer", () => {
    // Not a defect and not `unstated`. The group level set is two model calls, and when a
    // cross-provider chain has them answered by different families the route says `model` and
    // names none rather than crediting one with a body it half wrote.
    const answer = readAnswer(
      "level set",
      headers({ "X-Extraction-AI-Source": "model" }),
      { summary: "..." },
      AT,
    );
    assert.equal(answer.source, "model");
    assert.equal(answer.provider, undefined);
  });

  it("never names a provider on a fallback", () => {
    // A provider beside canned words would credit a model with prose it did not write.
    const answer = readAnswer(
      "quick fire",
      headers({
        "X-Extraction-AI-Source": "fallback",
        "X-Extraction-AI-Provider": "gemini",
      }),
      {},
      AT,
    );
    assert.equal(answer.source, "fallback");
    assert.equal(answer.provider, undefined);
  });

  it("ignores a provider it does not recognise", () => {
    // The board keys a label off this union, so an unknown string must not reach it.
    const answer = readAnswer(
      "quick fire",
      headers({
        "X-Extraction-AI-Source": "model",
        "X-Extraction-AI-Provider": "something-else",
      }),
      {},
      AT,
    );
    assert.equal(answer.source, "model");
    assert.equal(answer.provider, undefined);
  });

  it("treats a body that is not an object as saying nothing", () => {
    assert.equal(readAnswer("level set", headers(), null, AT).source, "unstated");
    assert.equal(readAnswer("level set", headers(), "nope", AT).source, "unstated");
  });
});

describe("the store", () => {
  beforeEach(() => resetAnswers());

  it("holds nothing until a route has answered", () => {
    assert.equal(lastAnswer(), null);
  });

  it("keeps the most recent answer rather than a log", () => {
    recordAnswer("quick fire", model, {});
    recordAnswer("level set", headers({ "X-Extraction-AI-Source": "fallback" }), {});
    assert.equal(lastAnswer()?.route, "level set");
    assert.equal(lastAnswer()?.source, "fallback");
  });

  it("returns a stable snapshot between records", () => {
    // useSyncExternalStore re-renders on every getSnapshot that differs by reference.
    recordAnswer("quick fire", model, {});
    assert.equal(lastAnswer(), lastAnswer());
  });

  it("tells a subscriber, and stops when it unsubscribes", () => {
    let calls = 0;
    const stop = subscribeToAnswers(() => calls++);
    recordAnswer("quick fire", model, {});
    assert.equal(calls, 1);
    stop();
    recordAnswer("quick fire", model, {});
    assert.equal(calls, 1);
  });
});
