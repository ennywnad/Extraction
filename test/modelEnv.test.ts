/**
 * The rename, and why it has to be survivable rather than clean.
 *
 * `scripts/deploy.sh` pushes straight to production, so at the moment of a rename the running
 * service holds the *old* names in its own environment. A rename with no alias is therefore
 * not a tidy-up — it is a deployment that boots with no model configured and serves every AI
 * route from its static fallback, labelled correctly and answering nobody's question. The
 * alias is the thing that makes the rename safe to do before the first deploy rather than
 * something that has to be coordinated with one.
 *
 * These tests are about precedence and about noise: which name wins, and that the old one is
 * loud once rather than every request.
 */
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  modelBackendSetting,
  modelChainSetting,
  resetDeprecationWarnings,
} from "../server/ai/modelEnv.ts";

const KEYS = ["MODEL_BACKEND", "GENAI_BACKEND", "MODEL_CHAIN", "GEMINI_MODELS"];

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  try {
    return run();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    }
  }
}

/** Captures console.warn for one call. */
function warnings(run: () => void): string[] {
  const captured: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void captured.push(args.join(" "));
  try {
    run();
  } finally {
    console.warn = original;
  }
  return captured;
}

afterEach(() => resetDeprecationWarnings());

describe("model configuration — the current names", () => {
  it("reads MODEL_BACKEND and MODEL_CHAIN", () => {
    withEnv({ MODEL_BACKEND: "vertex", MODEL_CHAIN: "claude-opus-5" }, () => {
      assert.equal(modelBackendSetting(), "vertex");
      assert.equal(modelChainSetting(), "claude-opus-5");
    });
  });

  it("reports nothing when nothing is set, rather than an empty string", () => {
    // The caller distinguishes "unset" from "configured as empty"; the chain falls back to
    // its built-in default only on the first.
    withEnv({}, () => {
      assert.equal(modelBackendSetting(), undefined);
      assert.equal(modelChainSetting(), undefined);
    });
  });
});

describe("model configuration — the deprecated names", () => {
  it("still reads GENAI_BACKEND and GEMINI_MODELS", () => {
    // The whole point. A service deployed before the rename carries only these.
    withEnv({ GENAI_BACKEND: "vertex", GEMINI_MODELS: "gemini-3.5-flash" }, () => {
      assert.equal(modelBackendSetting(), "vertex");
      assert.equal(modelChainSetting(), "gemini-3.5-flash");
    });
  });

  it("lets the current name win when both are set", () => {
    // The state a half-migrated deployment is actually in — deploy.sh pushes the new name
    // while the old one is still on the service from the previous revision. Precedence has
    // to be the new one, or the rename never takes effect.
    withEnv({ MODEL_BACKEND: "apikey", GENAI_BACKEND: "vertex" }, () => {
      assert.equal(modelBackendSetting(), "apikey");
    });
  });

  it("warns once per name rather than once per read", () => {
    // These are read on every model call. A warning per request buries the boot log it is
    // supposed to be visible in.
    withEnv({ GENAI_BACKEND: "vertex" }, () => {
      const first = warnings(() => modelBackendSetting());
      const second = warnings(() => modelBackendSetting());
      assert.equal(first.length, 1);
      assert.match(first[0], /GENAI_BACKEND is deprecated/);
      assert.match(first[0], /MODEL_BACKEND/, "it has to name the replacement");
      assert.deepEqual(second, []);
    });
  });

  it("says nothing when only the current name is set", () => {
    withEnv({ MODEL_BACKEND: "vertex" }, () => {
      assert.deepEqual(
        warnings(() => modelBackendSetting()),
        [],
      );
    });
  });

  it("treats an empty value as unset on both names", () => {
    // deploy.sh composes --set-env-vars from shell variables that can be empty, so a
    // deployment that never chose a chain arrives with `MODEL_CHAIN=` rather than without
    // it. Reading that as "configured" would pin the chain to the empty list.
    withEnv({ MODEL_CHAIN: "", GEMINI_MODELS: "gemini-3.5-flash" }, () => {
      assert.equal(modelChainSetting(), "gemini-3.5-flash", "empty must fall through");
    });
    withEnv({ MODEL_CHAIN: "   " }, () => {
      assert.equal(modelChainSetting(), undefined);
    });
  });
});
