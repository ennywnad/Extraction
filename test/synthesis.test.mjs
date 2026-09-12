/**
 * Group synthesis lifecycle. Runs with no Gemini key, which is exactly the failure path
 * that matters: a shared deliverable must never be filled with placeholder text.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3198;
const H = `http://localhost:${PORT}`;
const A = "s.lindqvist@northwind.com";

let server, dataDir;
const as = (who, path, opts = {}) =>
  fetch(H + path, {
    ...opts,
    headers: { "content-type": "application/json", "x-dev-user": who, ...(opts.headers ?? {}) },
  });

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "extraction-syn-"));
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
  server?.kill("SIGTERM");
  await rm(dataDir, { recursive: true, force: true });
});

const seed = async (topic, texts) => {
  const eng = await (
    await as(A, "/api/engagement", {
      method: "POST",
      body: JSON.stringify({ topic }),
    })
  ).json();
  for (const text of texts) {
    await as(A, `/api/engagement/${eng.id}/thoughts`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }
  return eng;
};

describe("group synthesis", () => {
  it("refuses to synthesize an empty pile", async () => {
    const eng = await (
      await as(A, "/api/engagement", {
        method: "POST",
        body: JSON.stringify({ topic: "empty" }),
      })
    ).json();
    const res = await as(A, `/api/engagement/${eng.id}/synthesize`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(res.status, 400);
  });

  it("writes nothing to the shared deliverable when generation fails", async () => {
    const eng = await seed("failure path", ["a fragment", "another fragment"]);

    const res = await as(A, `/api/engagement/${eng.id}/synthesize`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(res.status, 503, "no Gemini configured should surface as a failure");

    const after = await (await as(A, `/api/engagement/${eng.id}`)).json();
    assert.equal(after.synthesizedSummary, undefined, "no placeholder summary may be stored");
    assert.equal(after.synthesizedOutline, undefined, "no placeholder outline may be stored");
    assert.notEqual(after.status, "review", "a failed run must not advance the session");
  });

  it("claims nothing about who wrote a level set it failed to produce", async () => {
    // The route labels its success with `sendGenerated`, and a failure must not inherit that.
    // `sendAiError` answers with an error and no source, which is the honest state: there is no
    // body for a model or a fallback to have written. A `model` header on a 503 would be the
    // board reporting an answer that does not exist.
    const eng = await seed("unlabelled failure", ["a fragment"]);
    const res = await as(A, `/api/engagement/${eng.id}/synthesize`, { method: "POST", body: "{}" });

    assert.equal(res.status, 503);
    assert.equal(res.headers.get("x-extraction-ai-source"), null);
    assert.equal(res.headers.get("x-extraction-ai-provider"), null);
  });

  it("reports no run in flight once a failed one settles", async () => {
    const eng = await seed("in flight", ["fragment"]);
    await as(A, `/api/engagement/${eng.id}/synthesize`, { method: "POST", body: "{}" });
    const { running } = await (await as(A, `/api/engagement/${eng.id}/synthesize/status`)).json();
    assert.equal(running, false, "the single-flight slot must be released");
  });
});

describe("per-viewer prompting style", () => {
  it("does not persist promptingStyle onto the shared session", async () => {
    const eng = await seed("settings split", ["fragment"]);
    await as(A, `/api/engagement/${eng.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        advancedSettings: {
          promptingStyle: "socratic",
          outputFilter: "actions",
          cognitiveBiasAudit: "include",
        },
      }),
    });
    const after = await (await as(A, `/api/engagement/${eng.id}`)).json();
    assert.equal(
      after.advancedSettings.promptingStyle,
      undefined,
      "one member's tone choice must not change everyone else's questions",
    );
    assert.equal(after.advancedSettings.outputFilter, "actions");
    assert.equal(after.advancedSettings.cognitiveBiasAudit, "include");
  });
});

describe("the level-set run counter", () => {
  it("does not count a run that produced nothing", async () => {
    // This suite runs with no Gemini key, so synthesis fails before it reaches the model and
    // spends nothing. The counter has to agree: it is there to make spend visible, and a
    // number that ticked on a run which never called anything would be measuring clicks.
    const eng = await seed("nothing spent", ["fragment"]);
    const res = await as(A, `/api/engagement/${eng.id}/synthesize`, { method: "POST", body: "{}" });
    assert.equal(res.status, 503, "no key means no level set");

    const after = await (await as(A, `/api/engagement/${eng.id}`)).json();
    assert.equal(after.levelSetRuns, undefined, "a failed run must not inflate the cost count");
  });

  // Not tested here, because it cannot be reached without a key: one completed run increments
  // by one however many callers received it. That property is structural rather than asserted
  // — the increment lives inside the single `run` promise in synthesizeEngagement, and a
  // caller who arrives mid-run awaits that same promise and never executes its body. Counting
  // callers instead would report ten runs for one pair of Gemini calls, which is precisely the
  // overstatement this number must not make.
});
