/**
 * Who the group level set says wrote it.
 *
 * The route that produces the app's one client deliverable used to answer with a plain
 * `res.json(levelSet)` and name no source, so the status board could say nothing about the
 * response that matters most — the exact asymmetry 007 recorded. The two halves of closing it
 * are here: the decision about which family may be named, and the labelling itself.
 *
 * Both are tested without a key, an SDK or a server, which is the point. `npm test` runs with no
 * model configured, and group synthesis deliberately refuses to fall back — so the success path
 * is unreachable end to end on this machine, and a rule that could only be checked against a
 * live model would not be checked at all. Same instinct as `runChain` taking its world as
 * arguments.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answeringProvider } from "../server/ai/synthesis.ts";
import { sendGenerated } from "../server/ai/respond.ts";
import { readAnswer } from "../src/utils/lastAnswer.ts";

/** Just enough of an express Response to record what a helper set. */
function fakeRes() {
  const headers = new Map<string, string>();
  let body: unknown;
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return {
    res,
    headers,
    get body() {
      return body as Record<string, unknown>;
    },
    /** The shape readAnswer wants, so both halves can be checked against each other. */
    get headerBag() {
      return { get: (name: string) => headers.get(name) ?? null };
    },
  };
}

describe("which family a level set may name", () => {
  it("names the family when one answered both calls", () => {
    assert.equal(answeringProvider("gemini", "gemini"), "gemini");
  });

  it("names nobody when the prose and the classification came from different families", () => {
    // The case this function exists for. Naming the prose writer would credit it with coverage
    // arithmetic fed by another family; naming the classifier would be worse still.
    assert.equal(answeringProvider("claude", "gemini"), undefined);
    assert.equal(answeringProvider("gemini", "claude"), undefined);
  });

  it("names the writer when nothing classified, rather than treating absence as a second family", () => {
    // One model answered everything there was to answer, so there is nothing to overstate.
    assert.equal(answeringProvider("claude", undefined), "claude");
  });
});

describe("labelling a body the route assembled itself", () => {
  it("declares a model wrote it, on the header and on the body", () => {
    const out = fakeRes();
    sendGenerated(out.res as never, { summary: "a summary" }, "gemini");

    assert.equal(out.headers.get("X-Extraction-AI-Source"), "model");
    assert.equal(out.headers.get("X-Extraction-AI-Provider"), "gemini");
    assert.equal(out.body.source, "model");
    assert.equal(out.body.provider, "gemini");
    assert.equal(out.body.summary, "a summary", "the body it was given survives intact");
  });

  it("still says model when no family may be named, and names none", () => {
    // `source` and `provider` are separate questions: that a model wrote this is certain, since
    // synthesis refuses to produce a level set at all without one.
    const out = fakeRes();
    sendGenerated(out.res as never, { summary: "a summary" });

    assert.equal(out.headers.get("X-Extraction-AI-Source"), "model");
    assert.equal(out.headers.has("X-Extraction-AI-Provider"), false);
    assert.equal(out.body.source, "model");
    assert.equal("provider" in out.body, false, "an absent family is absent, not null");
  });

  it("is read back by the client as the board would draw it", () => {
    // The two halves of the seam meeting: what the server set is what readAnswer reports, so
    // neither side is asserted against a fixture of the other.
    const named = fakeRes();
    sendGenerated(named.res as never, { summary: "s" }, "claude");
    const one = readAnswer("level set", named.headerBag, named.body, 0);
    assert.equal(one.source, "model");
    assert.equal(one.provider, "claude");

    const anonymous = fakeRes();
    sendGenerated(anonymous.res as never, { summary: "s" });
    const two = readAnswer("level set", anonymous.headerBag, anonymous.body, 0);
    assert.equal(two.source, "model");
    assert.equal(two.provider, undefined, "and never `unstated`, which would be a different claim");
  });
});
