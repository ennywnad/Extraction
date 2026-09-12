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

describe("the level-set counter is the server's to write", () => {
  it("ignores a run count sent by a client", async () => {
    // Sharper than the coverage gate above. This number exists so that a pile regenerated
    // fifty times cannot happen unnoticed, and synthesis is the only thing in the app whose
    // cost scales with use. A caller that could set it could set it back to zero, which
    // would defeat the entire point of counting.
    const eng = await newEngagement("run count gate");
    await contribute(A, eng.id, "one fragment");

    const res = await as(A, `/api/engagement/${eng.id}`, {
      method: "PATCH",
      body: JSON.stringify({ topic: "run count gate", levelSetRuns: 0 }),
    });
    assert.equal(res.status, 200, "the rest of the patch is still a valid one");

    const after = await asJson(A, `/api/engagement/${eng.id}`);
    assert.equal(after.levelSetRuns, undefined, "a client wrote the run count");
    assert.equal(
      after.topic,
      "run count gate",
      "the allowed fields in the same patch were dropped",
    );
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

describe("role groups", () => {
  const regroup = (who, id, body) =>
    as(who, `/api/engagement/${id}/role-groups`, { method: "PUT", body: JSON.stringify(body) });

  it("lets any member group a declared role, and names whoever did it", async () => {
    // Open to everyone until the app has a facilitator to give it to (docs/intents/011). The
    // stamp is the verified caller's and never the body's, for the same reason as a fragment's.
    const eng = await newEngagement("grouping");
    const res = await regroup(B, eng.id, { label: "FP&A", group: "Finance", by: A });
    assert.equal(res.status, 200);
    const { roleGroups } = await res.json();
    assert.equal(roleGroups["fp&a"].group, "Finance");
    assert.equal(roleGroups["fp&a"].by, B);
  });

  it("files every spelling of a label under one decision", async () => {
    const eng = await newEngagement("spellings");
    await regroup(A, eng.id, { label: "Treasury ", group: "Finance" });
    const res = await regroup(A, eng.id, { label: "TREASURY", group: "Commercial" });
    const { roleGroups } = await res.json();
    assert.deepEqual(Object.keys(roleGroups), ["treasury"]);
    assert.equal(roleGroups.treasury.group, "Commercial");
  });

  it("clears a decision with null", async () => {
    const eng = await newEngagement("clearing");
    await regroup(A, eng.id, { label: "FP&A", group: "Finance" });
    const { roleGroups } = await (await regroup(A, eng.id, { label: "FP&A", group: null })).json();
    assert.equal(roleGroups["fp&a"], undefined);
  });

  it("refuses to group a server default, in either direction", async () => {
    const eng = await newEngagement("defaults");
    const status = async (body) => (await regroup(A, eng.id, body)).status;
    assert.equal(await status({ label: "Contributor", group: "Finance" }), 400);
    assert.equal(await status({ label: "Finance", group: "Facilitator" }), 400);
    assert.equal(await status({ label: "Finance" }), 400, "a missing group is not a clear");
  });

  it("ignores role groups sent through the metadata patch", async () => {
    // A whole map from one tab's snapshot would silently undo a grouping made in another, and
    // would carry a `by` nobody verified. The route above is the only door.
    const eng = await newEngagement("role group patch gate");
    await as(A, `/api/engagement/${eng.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        topic: "role group patch gate",
        roleGroups: { finance: { label: "Finance", group: "Legal", by: B, at: "x" } },
      }),
    });
    assert.equal((await asJson(A, `/api/engagement/${eng.id}`)).roleGroups, undefined);
  });

  it("re-sends the pile to a tab holding an ETag from before the regroup", async () => {
    const eng = await newEngagement("regroup etag");
    const stale = (await as(A, `/api/engagement/${eng.id}`)).headers.get("etag");
    await regroup(B, eng.id, { label: "FP&A", group: "Finance" });
    const res = await as(A, `/api/engagement/${eng.id}`, { headers: { "If-None-Match": stale } });
    assert.equal(res.status, 200, "a regroup that nobody else's poll ever carries");
  });
});

describe("the brief", () => {
  const saveEntry = (who, id, body) =>
    as(who, `/api/engagement/${id}/roster/me`, { method: "PUT", body: JSON.stringify(body) });

  it("keeps a brief on the roster and off every fragment", async () => {
    // A stamp is copied onto each fragment and kept for good; a brief is a paragraph somebody
    // will rewrite. Copied, it would sit on the pile saying whatever it said at the time.
    const eng = await newEngagement("brief stays on the roster");
    await saveEntry(A, eng.id, { role: "Finance", brief: "Owns the forecast." });
    const thought = await contribute(A, eng.id, "Close takes nine days");
    assert.equal(thought.author.role, "Finance");
    assert.equal("brief" in thought.author, false, "not on the response");
    const { roster, thoughts } = await asJson(A, `/api/engagement/${eng.id}`);
    assert.equal(roster[A].brief, "Owns the forecast.");
    assert.equal(
      thoughts.some((t) => "brief" in (t.author ?? {})),
      false,
      "not in the stored pile",
    );
  });

  it("leaves a brief alone when a save does not mention it, and clears it when emptied", async () => {
    const eng = await newEngagement("brief overwrite");
    await saveEntry(A, eng.id, { role: "Finance", brief: "Owns the forecast." });
    const renamed = await (await saveEntry(A, eng.id, { name: "Sofia Lindqvist" })).json();
    assert.equal(renamed.brief, "Owns the forecast.");
    const cleared = await (await saveEntry(A, eng.id, { brief: "   " })).json();
    assert.equal("brief" in cleared, false);
    assert.equal(cleared.role, "Finance", "clearing a brief is not clearing a role");
  });

  it("sets only the caller's brief, and caps it", async () => {
    const eng = await newEngagement("brief cap");
    await saveEntry(A, eng.id, { role: "Finance", brief: "Mine." });
    await saveEntry(B, eng.id, { email: A, brief: "x".repeat(5000) });
    const { roster } = await asJson(A, `/api/engagement/${eng.id}`);
    assert.equal(roster[A].brief, "Mine.", "the body's email is not an identity");
    assert.equal(roster[B].brief.length, 600);
  });
});
