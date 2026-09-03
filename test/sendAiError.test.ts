/**
 * What a failed AI call is allowed to say out loud.
 *
 * The SDK passes an upstream error body through verbatim, and on Vertex that body names the
 * project and the full model resource path. `/api/session/*` carries no identity requirement
 * in a solo deployment, so anything reachable there is reachable by anyone.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { AiCallError } from "../server/ai/client.ts";
import { sendAiError, UserFacingError } from "../server/ai/respond.ts";

/** Enough of an express Response to record what a route answered with. */
function fakeRes() {
  const sent: { status: number; body: any } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: any) {
      sent.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, sent };
}

/** The shape the SDK actually throws: the whole upstream JSON body as the message. */
const UPSTREAM_BODY = JSON.stringify({
  error: {
    code: 403,
    message:
      "Permission denied on resource project my-private-project-4471. " +
      "projects/my-private-project-4471/locations/us-central1/publishers/google/models/gemini-2.5-flash",
  },
});

function upstream(status: number, message = UPSTREAM_BODY) {
  return Object.assign(new Error(message), { status });
}

describe("sendAiError", () => {
  it("never repeats an upstream error body to the caller", () => {
    const { res, sent } = fakeRes();
    sendAiError(res, "Recommend mode", upstream(403));
    assert.equal(sent.status, 500);
    assert.doesNotMatch(sent.body.error, /my-private-project-4471/);
    assert.doesNotMatch(sent.body.error, /publishers\/google/);
    assert.match(sent.body.error, /server log/);
  });

  it("withholds the chain report too, which quotes every upstream body", () => {
    const { res, sent } = fakeRes();
    sendAiError(res, "Synthesize", new AiCallError(`All models failed.\n  a: ${UPSTREAM_BODY}`));
    assert.equal(sent.status, 500);
    assert.doesNotMatch(sent.body.error, /my-private-project-4471/);
  });

  it("answers 429 with something the caller can act on", () => {
    const { res, sent } = fakeRes();
    sendAiError(res, "Quick fire", upstream(429));
    assert.equal(sent.status, 429);
    assert.match(sent.body.error, /rate limited/i);
    assert.doesNotMatch(sent.body.error, /my-private-project-4471/);
  });

  it("passes 429 through even when the whole chain was exhausted", () => {
    const { res, sent } = fakeRes();
    sendAiError(res, "Synthesize", new AiCallError("All models failed.", 429));
    assert.equal(sent.status, 429);
  });

  it("keeps a message that was explicitly written for the caller", () => {
    const { res, sent } = fakeRes();
    sendAiError(
      res,
      "Synthesis",
      new UserFacingError("Gemini is not configured; cannot produce a level set."),
    );
    assert.equal(sent.status, 500);
    assert.match(sent.body.error, /not configured/);
  });

  it("withholds an unmarked message even when it looks harmless", () => {
    // Allowlist, not denylist: the bar is "someone wrote this for the caller", not "this
    // does not look like a leak".
    const { res, sent } = fakeRes();
    sendAiError(res, "Drill next", new Error("Unexpected token < in JSON at position 0"));
    assert.equal(sent.status, 500);
    assert.doesNotMatch(sent.body.error, /Unexpected token/);
  });

  it("withholds a store failure, which carries `code` rather than `status`", () => {
    // Regression: an earlier version tested for an upstream HTTP status, so a Firestore
    // error reached the caller naming the project and the document path.
    const { res, sent } = fakeRes();
    const firestore = Object.assign(
      new Error(
        "5 NOT_FOUND: no entity to update: app: s~my-private-project-4471, path: /engagements/abc",
      ),
      { code: 5 },
    );
    sendAiError(res, "Synthesis", firestore, 503);
    assert.equal(sent.status, 503);
    assert.doesNotMatch(sent.body.error, /my-private-project-4471/);
    assert.doesNotMatch(sent.body.error, /engagements/);
  });

  it("honours a route's own default status for a non-rate-limit failure", () => {
    // The group level set answers 503: nothing was written, so trying again is meaningful.
    const { res, sent } = fakeRes();
    sendAiError(res, "Synthesis", upstream(500), 503);
    assert.equal(sent.status, 503);
  });

  it("survives a thrown non-Error", () => {
    const { res, sent } = fakeRes();
    sendAiError(res, "Drill next", "something odd");
    assert.equal(sent.status, 500);
    assert.ok(typeof sent.body.error === "string" && sent.body.error.length > 0);
  });
});
