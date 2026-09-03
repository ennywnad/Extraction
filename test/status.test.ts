/**
 * The two rules that hold the status shape together, since it is served unauthenticated.
 *
 * The first is a disclosure rule and is the reason this file exists: /healthz answers anyone,
 * so the payload may name *which branch* a seam took and never *what it points at*. The
 * second is an honesty rule — configured is not working, and the shape has to be able to say
 * so, because the most dangerous misconfigurations are the ones that exit the process before
 * anything can report them at all.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { instanceStatus } from "../server/status.ts";
import { resolveAuthConfig } from "../server/authMode.ts";

const SECRETS = {
  FIRESTORE_PROJECT_ID: "acme-prod-482913",
  VERTEX_LOCATION: "europe-west4",
  IAP_AUDIENCE: "/projects/482913/locations/europe-west4/services/extraction",
  GEMINI_MODELS: "gemini-3-secret-preview,gemini-2.5-flash",
  GENAI_BACKEND: "vertex",
  ENGAGEMENT_DATA_DIR: "/srv/acme/.data",
};

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const [k, v] of Object.entries(SECRETS)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  process.env.AUTH_MODE = "iap";
});
afterEach(() => {
  for (const k of Object.keys(SECRETS)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  delete process.env.AUTH_MODE;
});

const status = () => instanceStatus(resolveAuthConfig());

describe("instance status", () => {
  it("names no part of the deployment topology anywhere in the payload", () => {
    const json = JSON.stringify(status());
    for (const [key, value] of Object.entries(SECRETS)) {
      // GENAI_BACKEND is the exception on purpose: "vertex" is the branch, not the target.
      if (key === "GENAI_BACKEND") continue;
      for (const part of value.split(",")) {
        assert.ok(!json.includes(part), `${key} leaked into /healthz: ${json}`);
      }
    }
  });

  it("reports the chain's length without its model ids", () => {
    assert.equal(status().model.chainLength, 2);
  });

  it("reports storage as configured but not yet live", () => {
    // Nothing in this process has opened a store, and a Firestore store nobody has opened
    // has not proved it can connect. Claiming otherwise is the failure this field prevents.
    assert.deepEqual(status().storage, { backend: "firestore", live: false });
  });

  it("distinguishes a verified identity from an asserted one", () => {
    assert.deepEqual(status().identity, { mode: "iap", verified: true });
    process.env.AUTH_MODE = "dev";
    assert.deepEqual(status().identity, { mode: "dev", verified: false });
  });

  it("keeps aiEnabled agreeing with the model backend it reports", () => {
    const s = status();
    assert.equal(s.aiEnabled, s.model.backend !== "none");
  });
});
