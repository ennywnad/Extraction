/**
 * The production static-serving branch, which nothing else exercises.
 *
 * `startServer()` takes a different path under NODE_ENV=production: Vite's middleware is
 * replaced by a static directory and an SPA fallback route. Every other test runs in
 * development, so that branch was registered by no test at all — which is how an Express 4->5
 * bump could pass CI while crashing the deployed process at boot, because a bare "*" is not a
 * valid path-to-regexp v8 pattern and throws when the route is registered.
 *
 * Run with `npm test`. Serves a stand-in dist directory, so no build is needed.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3197;
const H = `http://localhost:${PORT}`;
const INDEX = "<!doctype html><title>Extraction</title><div id=root></div>";

let server;
let distDir;
let dataDir;
let startupLog = "";

before(async () => {
  distDir = await mkdtemp(join(tmpdir(), "extraction-dist-"));
  dataDir = await mkdtemp(join(tmpdir(), "extraction-prod-"));
  await writeFile(join(distDir, "index.html"), INDEX);
  await mkdir(join(distDir, "assets"), { recursive: true });
  await writeFile(join(distDir, "assets", "app.js"), "export const ok = 1;\n");

  server = spawn("npx", ["tsx", "server.ts"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      // production refuses AUTH_MODE=dev, so this exercises the real identity configuration.
      AUTH_MODE: "iap",
      IAP_AUDIENCE: "/projects/1/locations/us-central1/services/extraction-test",
      GEMINI_API_KEY: "",
      DIST_DIR: distDir,
      ENGAGEMENT_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Drained, and capped: an unread pipe eventually blocks the child, and an unbounded
  // string is a slow leak if the server turns chatty.
  const capture = (d) => (startupLog = (startupLog + d).slice(-8192));
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) {
      throw new Error(`server exited ${server.exitCode} during startup:\n${startupLog}`);
    }
    try {
      if ((await fetch(`${H}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not start:\n${startupLog}`);
});

after(async () => {
  // Stop reading before killing, then make sure it is actually dead. A spawned server that
  // outlives its test holds the pipes this file attached, and on a CI runner that is the
  // difference between a suite that ends and a step that hangs until the job is cancelled.
  server?.stdout?.destroy();
  server?.stderr?.destroy();
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  }
  await rm(distDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
});

describe("production static serving", () => {
  it("starts at all, which is the regression", () => {
    // Registering the SPA fallback is enough to take the process down on an incompatible
    // router. If `before` got here, the route registered.
    assert.equal(server.exitCode, null, startupLog);
  });

  it("serves a built asset from the dist directory", async () => {
    const res = await fetch(`${H}/assets/app.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /export const ok/);
  });

  it("falls back to index.html for a client-side route", async () => {
    for (const path of ["/", "/dashboard", "/some/deep/client/route"]) {
      const res = await fetch(H + path);
      assert.equal(res.status, 200, `${path} returned ${res.status}`);
      assert.match(await res.text(), /<div id=root>/, `${path} did not serve the SPA shell`);
    }
  });

  it("serves the status at /api/status too, since Cloud Run 404s /healthz", async () => {
    const [a, b] = await Promise.all([fetch(`${H}/api/status`), fetch(`${H}/healthz`)]);
    assert.equal(a.headers.get("content-type")?.split(";")[0], "application/json");
    assert.deepEqual(await a.json(), await b.json());
  });

  it("does not swallow the API, which sits in front of the fallback", async () => {
    const res = await fetch(`${H}/healthz`);
    assert.equal(res.headers.get("content-type")?.split(";")[0], "application/json");
    assert.equal((await res.json()).ok, true);
  });

  it("still requires a verified identity under NODE_ENV=production", async () => {
    // The fallback must not have shadowed the authenticated routes: no IAP assertion here,
    // and dev identity is refused in production, so this has to be rejected rather than
    // answered with the SPA shell.
    const res = await fetch(`${H}/api/whoami`, { headers: { "x-dev-user": "a@b.com" } });
    assert.ok(res.status === 401 || res.status === 403, `got ${res.status}`);
  });
});
