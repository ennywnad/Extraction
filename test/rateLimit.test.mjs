/**
 * What the group-mode rate limiters are keyed on.
 *
 * The limiters were prose until this existed. Two claims in server.ts are load-bearing and
 * neither is visible from reading a route: that the bucket is the *verified identity* rather
 * than the address a request arrived from, and that the narrow cap on synthesis does not
 * also throttle the status endpoint that reports on it.
 *
 * The identity claim depends on mount order — `requireIdentity` has to run before the
 * limiter, or `keyGenerator` dereferences an identity that is not there and every group
 * request 500s. That is the kind of thing that works on a laptop with one user and fails in
 * a room, so it is worth a test that uses two.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3196;
const H = `http://localhost:${PORT}`;
const A = "s.lindqvist@northwind.com";
const B = "r.okafor@northwind.com";

/** Mirrors the cap in server.ts. A change there should fail here, not drift silently. */
const SYNTHESIS_MAX = 10;

let server, dataDir;
const as = (who, path, opts = {}) =>
  fetch(H + path, {
    ...opts,
    headers: { "content-type": "application/json", "x-dev-user": who, ...(opts.headers ?? {}) },
  });

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "extraction-rl-"));
  server = spawn("npx", ["tsx", "server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_MODE: "dev",
      GEMINI_API_KEY: "",
      GENAI_BACKEND: "apikey",
      ENGAGEMENT_DATA_DIR: dataDir,
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${H}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
});

after(async () => {
  // A spawned server that outlives its test holds the pipes and hangs the run.
  server?.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
});

/**
 * An engagement with an empty pile, so a synthesis POST is refused by the route before it
 * reaches Gemini. The limiter runs ahead of the route either way, so a 400 still costs a
 * token from the bucket — which is the point: the cap is on asking, not on succeeding.
 */
const emptyEngagement = async (who, topic) =>
  (await as(who, "/api/engagement", { method: "POST", body: JSON.stringify({ topic }) })).json();

const synthesize = (who, id) =>
  as(who, `/api/engagement/${id}/synthesize`, { method: "POST", body: "{}" });

describe("group rate limits", () => {
  it("caps synthesis per identity, and does not put two people in one bucket", async () => {
    const mine = await emptyEngagement(A, "one");

    // Spend A's whole budget. Each is a 400 from the route, never a 429.
    for (let i = 0; i < SYNTHESIS_MAX; i++) {
      const res = await synthesize(A, mine.id);
      assert.notEqual(res.status, 429, `request ${i + 1} should be inside the cap`);
    }

    const overflow = await synthesize(A, mine.id);
    assert.equal(overflow.status, 429, "the request past the cap is refused");

    // The real claim. Keyed on IP, B shares A's bucket — same loopback address, and in a
    // deployment the same office NAT — so a workshop would rate-limit itself.
    const theirs = await emptyEngagement(B, "two");
    const other = await synthesize(B, theirs.id);
    assert.notEqual(other.status, 429, "a second identity must have its own budget");
  });

  it("does not throttle the status endpoint the capped route reports on", async () => {
    // A is still exhausted from the test above; same process, same window.
    const mine = await emptyEngagement(A, "three");
    assert.equal((await synthesize(A, mine.id)).status, 429, "A is still capped");

    const status = await as(A, `/api/engagement/${mine.id}/synthesize/status`);
    assert.equal(status.status, 200, "the progress poll is exempt from the synthesis cap");
    assert.deepEqual(await status.json(), { running: false });
  });

  it("leaves ordinary group traffic alone", async () => {
    // The general ceiling has to clear the 15s poll, which spends 60 requests a window per
    // open tab doing nothing. A handful of contributions must not come near it.
    const eng = await emptyEngagement(B, "four");
    for (let i = 0; i < 12; i++) {
      const res = await as(B, `/api/engagement/${eng.id}/thoughts`, {
        method: "POST",
        body: JSON.stringify({ text: `fragment ${i}` }),
      });
      assert.equal(res.status, 201, "contributing is not rate limited in normal use");
    }
    assert.equal((await as(B, `/api/engagement/${eng.id}`)).status, 200);
  });
});
