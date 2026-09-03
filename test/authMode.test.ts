/**
 * The fail-closed identity resolution, which had no test at all.
 *
 * This is the one function in the repo whose *failure* is the feature: an earlier design keyed
 * dev mode on "is IAP_AUDIENCE unset", so a single missing variable on Cloud Run would have
 * turned the deployed app into an anonymous free-for-all writing to the real datastore. The
 * fix was to exit the process instead, and CLAUDE.md asks for that behaviour to be kept — but
 * nothing enforced it, so a refactor that softened a `fatal()` into a `console.warn` would
 * have passed every check in the suite.
 *
 * `process.exit` is replaced with a throw for the duration of each assertion. That is the only
 * way to observe a `never` in-process, and the throw makes an exit that stops happening fail
 * loudly here rather than silently return a config.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthConfig } from "../server/authMode.ts";

class Exited extends Error {
  constructor(readonly code?: number) {
    super(`process.exit(${code})`);
  }
}

const realExit = process.exit;
const realError = console.error;
const realWarn = console.warn;
let logged: string[] = [];

/** Runs resolveAuthConfig with exit and logging captured. */
function resolve(env: Record<string, string | undefined>) {
  logged = [];
  process.exit = ((code?: number) => {
    throw new Exited(code);
  }) as typeof process.exit;
  console.error = (...args: unknown[]) => void logged.push(args.join(" "));
  console.warn = (...args: unknown[]) => void logged.push(args.join(" "));
  try {
    return resolveAuthConfig(env as NodeJS.ProcessEnv);
  } finally {
    process.exit = realExit;
    console.error = realError;
    console.warn = realWarn;
  }
}

/** Asserts the process was killed, and returns what was said on the way out. */
function refuses(env: Record<string, string | undefined>, matching: RegExp): string {
  assert.throws(() => resolve(env), Exited, "the process was expected to exit and did not");
  const said = logged.join("\n");
  assert.match(said, matching);
  return said;
}

afterEach(() => {
  process.exit = realExit;
  console.error = realError;
  console.warn = realWarn;
});

const CLOUD_RUN_AUD = "/projects/482913/locations/europe-west4/services/extraction";

describe("auth mode resolution", () => {
  it("defaults to dev off production, and says the identities are not verified", () => {
    const config = resolve({});
    assert.equal(config.mode, "dev");
    assert.match(logged.join("\n"), /asserted, not verified/);
  });

  it("defaults to iap under NODE_ENV=production rather than to the permissive mode", () => {
    // The original bug in one line: an unset AUTH_MODE must never resolve to dev in a
    // deployment. With no audience to verify against there is nothing to do but refuse.
    refuses({ NODE_ENV: "production" }, /requires IAP_AUDIENCE/);
  });

  it("refuses dev identity in production even when it is asked for explicitly", () => {
    refuses({ NODE_ENV: "production", AUTH_MODE: "dev" }, /AUTH_MODE=dev is refused/);
  });

  it("refuses a mode it does not recognise instead of falling back", () => {
    refuses({ AUTH_MODE: "iep" }, /AUTH_MODE must be "iap" or "dev"/);
  });

  it("accepts the audience deploy.sh computes, with nothing to say about it", () => {
    const config = resolve({ AUTH_MODE: "iap", IAP_AUDIENCE: CLOUD_RUN_AUD });
    assert.equal(config.mode, "iap");
    assert.equal(config.iapAudience, CLOUD_RUN_AUD);
    assert.equal(logged.join(""), "", "a correct configuration should be quiet");
  });

  it("accepts the App Engine and load-balancer audiences too", () => {
    // Warning about these would be a fail-closed check on an assumption about which product
    // is in front of the service, which is not this file's business.
    for (const aud of [
      "/projects/482913/apps/northwind-extraction",
      "/projects/482913/global/backendServices/7719",
    ]) {
      assert.equal(resolve({ AUTH_MODE: "iap", IAP_AUDIENCE: aud }).iapAudience, aud);
      assert.equal(logged.join(""), "", `warned about a valid audience: ${aud}`);
    }
  });

  it("refuses an audience with a failed substitution in it", () => {
    // How this actually goes wrong: deploy.sh computes the audience from a gcloud lookup, and
    // an empty project number yields exactly this. It deploys fine and 401s everyone.
    const said = refuses(
      { AUTH_MODE: "iap", IAP_AUDIENCE: "/projects//locations/europe-west4/services/extraction" },
      /empty path segment/,
    );
    assert.match(said, /PROJECT_NUMBER/, "the message has to point at the thing that failed");
  });

  it("refuses a trailing empty segment too, which is the same mistake", () => {
    refuses(
      { AUTH_MODE: "iap", IAP_AUDIENCE: "/projects/482913/locations/europe-west4/services/" },
      /empty path segment/,
    );
  });

  it("only warns about an audience that is not a resource path at all", () => {
    // Deliberately not fatal. Exiting here would buy diagnosis rather than safety — a wrong
    // audience rejects every assertion, and iapAuth already logs the expected value on each
    // rejection — so refusing to boot on "this does not look like an audience to me" would
    // let a stale list in this file take down a service that was working.
    const aud = "extraction-482913.a.run.app";
    const config = resolve({ AUTH_MODE: "iap", IAP_AUDIENCE: aud });
    assert.equal(config.iapAudience, aud);
    assert.match(logged.join("\n"), /does not match any audience format/);
  });

  it("only warns about an audience that is merely unfamiliar", () => {
    // Shaped like an IAP path but not a format this file knows. Wrong enough to mention,
    // not wrong enough to refuse to serve on — the list of formats can go out of date.
    const aud = "/projects/482913/regions/europe-west4/services/extraction";
    const config = resolve({ AUTH_MODE: "iap", IAP_AUDIENCE: aud });
    assert.equal(config.iapAudience, aud, "an unfamiliar audience must still boot");
    assert.match(logged.join("\n"), /does not match any audience format/);
  });

  it("lowercases the dev identity, because it is the roster key", () => {
    const config = resolve({ AUTH_MODE: "dev", DEV_USER_EMAIL: "S.Lindqvist@Northwind.com" });
    assert.equal(config.devUser.email, "s.lindqvist@northwind.com");
  });
});
