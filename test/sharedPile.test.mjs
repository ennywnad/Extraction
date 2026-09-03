/**
 * Group-mode behaviour that the UI must not be trusted to enforce.
 *
 * Run with `npm test`. Boots a real server against the file store in a temp directory, so
 * no cloud configuration is involved.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3199;
const H = `http://localhost:${PORT}`;
const A = "s.lindqvist@northwind.com";
const B = "r.mehta@northwind.com";

let server;
let dataDir;

const as = (who, path, opts = {}) =>
  fetch(H + path, {
    ...opts,
    headers: { "content-type": "application/json", "x-dev-user": who, ...(opts.headers ?? {}) },
  });
const asJson = async (...args) => (await as(...args)).json();

const newEngagement = (topic) =>
  asJson(A, "/api/engagement", { method: "POST", body: JSON.stringify({ topic }) });
const contribute = (who, id, text) =>
  asJson(who, `/api/engagement/${id}/thoughts`, { method: "POST", body: JSON.stringify({ text }) });

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "extraction-test-"));
  server = spawn("npx", ["tsx", "server.ts"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_MODE: "dev",
      GEMINI_API_KEY: "",
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
  server?.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
});

describe("attribution", () => {
  it("stamps the verified caller, ignoring any author in the request", async () => {
    const eng = await newEngagement("attribution");
    const thought = await asJson(B, `/api/engagement/${eng.id}/thoughts`, {
      method: "POST",
      body: JSON.stringify({
        text: "whose is this?",
        author: { email: A, name: "Someone Else", role: "CEO" },
      }),
    });
    assert.equal(thought.author.email, B);
  });

  it("auto-provisions a roster entry on first contribution", async () => {
    const eng = await newEngagement("auto provision");
    await contribute(B, eng.id, "first contact");
    const { roster } = await asJson(B, `/api/engagement/${eng.id}/roster`);
    assert.ok(roster[B], "B should be on the roster without an explicit join");
  });
});

describe("field-level authorship", () => {
  it("lets any member file another member's fragment", async () => {
    const eng = await newEngagement("shared classification");
    const t = await contribute(A, eng.id, "A's fragment");
    const res = await as(B, `/api/engagement/${eng.id}/thoughts/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ clusterCategory: "Process scope" }),
    });
    assert.equal(res.status, 200, "card sort and friends must work on other people's cards");
  });

  it("refuses to let anyone rewrite another member's words", async () => {
    const eng = await newEngagement("author only");
    const t = await contribute(A, eng.id, "A's words");
    const res = await as(B, `/api/engagement/${eng.id}/thoughts/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({ text: "hijacked" }),
    });
    assert.equal(res.status, 403);
  });

  it("refuses to let anyone delete another member's fragment", async () => {
    const eng = await newEngagement("delete gate");
    const t = await contribute(A, eng.id, "A's fragment");
    assert.equal(
      (await as(B, `/api/engagement/${eng.id}/thoughts/${t.id}`, { method: "DELETE" })).status,
      403,
    );
    assert.equal(
      (await as(A, `/api/engagement/${eng.id}/thoughts/${t.id}`, { method: "DELETE" })).status,
      204,
    );
  });
});

describe("the coverage map is the server's to write", () => {
  it("ignores a coverage map sent by a client", async () => {
    // The map is arithmetic over the pile, computed outside the model so a zero is right
    // every time. A caller that could set it could report every area defined on an empty
    // pile — which is the one number in the deliverable nobody should be able to argue with.
    const eng = await newEngagement("coverage gate");
    await contribute(A, eng.id, "one fragment, one area at most");

    const res = await as(A, `/api/engagement/${eng.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        topic: "coverage gate",
        coverage: [
          { area: "Commercials", status: "defined", fragments: 99, voices: 9, fragmentIds: [] },
        ],
      }),
    });
    assert.equal(res.status, 200, "the rest of the patch is still a valid one");

    const after = await asJson(A, `/api/engagement/${eng.id}`);
    assert.equal(after.coverage, undefined, "a client wrote the coverage map");
    assert.equal(after.topic, "coverage gate", "the allowed fields in the same patch were dropped");
  });
});

describe("concurrent contribution", () => {
  it("does not lose a fragment added while another contributor held a stale pile", async () => {
    const eng = await newEngagement("stale snapshot");
    const t1 = await contribute(A, eng.id, "A: fragment one");

    // A's snapshot, taken before B contributes.
    const stale = await asJson(A, `/api/engagement/${eng.id}`);
    const t2 = await contribute(B, eng.id, "B: fragment two");

    // A drags a card. Every mode composes a whole new array from A's stale state, so the
    // array A works from does not contain B's fragment. Absence must never mean deletion.
    const composed = stale.thoughts.map((t) =>
      t.id === t1.id ? { ...t, clusterCategory: "Process scope" } : t,
    );
    for (const t of composed) {
      await as(A, `/api/engagement/${eng.id}/thoughts/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ clusterCategory: t.clusterCategory }),
      });
    }

    const final = await asJson(A, `/api/engagement/${eng.id}`);
    assert.ok(
      final.thoughts.some((t) => t.id === t2.id),
      "B's fragment was destroyed",
    );
    assert.equal(final.thoughts.find((t) => t.id === t1.id).clusterCategory, "Process scope");
  });
});

describe("transport", () => {
  it("answers an unchanged re-poll with 304", async () => {
    const eng = await newEngagement("etag");
    await contribute(A, eng.id, "something");
    const first = await as(A, `/api/engagement/${eng.id}`);
    const etag = first.headers.get("etag");
    assert.ok(etag);
    const second = await as(A, `/api/engagement/${eng.id}`, { headers: { "If-None-Match": etag } });
    assert.equal(second.status, 304);
    assert.equal(second.headers.get("etag"), etag, "a 304 must still carry the ETag");
  });

  // A stale ETag has to fall through to the pile. The 304 short-circuit answers from the
  // version alone, so a fragment arriving without touching updatedAt would strand every
  // tab on an old pile forever.
  it("re-sends the pile when a fragment lands under a held ETag", async () => {
    const eng = await newEngagement("etag invalidation");
    const first = await as(A, `/api/engagement/${eng.id}`);
    const stale = first.headers.get("etag");
    await contribute(B, eng.id, "arrived after the poll");

    const res = await as(A, `/api/engagement/${eng.id}`, { headers: { "If-None-Match": stale } });
    assert.equal(res.status, 200);
    assert.notEqual(res.headers.get("etag"), stale);
    const body = await res.json();
    assert.equal(body.thoughts.length, 1);
  });

  // The conditional request takes its own lookup path, so it needs its own 404.
  it("404s an unknown engagement even when the caller holds an ETag", async () => {
    const res = await as(A, "/api/engagement/no-such-id", {
      headers: { "If-None-Match": 'W/"whatever-0"' },
    });
    assert.equal(res.status, 404);
  });

  it("rejects a form content type on mutating routes", async () => {
    const eng = await newEngagement("csrf");
    const res = await fetch(`${H}/api/engagement/${eng.id}/thoughts`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-dev-user": B },
      body: "text=forged",
    });
    assert.equal(res.status, 415);
  });
});
