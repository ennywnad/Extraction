/**
 * Share links are the one path where a session leaves the app and comes back through a URL.
 * The interesting cases are not "does base64 work" but the two encodings that have to agree:
 * non-Latin text surviving `btoa`, and the base64 alphabet surviving a query string.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeSnapshot, decodeSnapshot } from "../src/utils/shareLink.ts";

/** What the browser actually hands the app back, rather than the string we generated. */
function throughQueryString(blob: string): string {
  return new URLSearchParams(`snapshot=${blob}`).get("snapshot")!;
}

function roundTrip(session: unknown): unknown {
  return decodeSnapshot(throughQueryString(encodeSnapshot(session)));
}

describe("share link snapshots", () => {
  it("round-trips a session", () => {
    const session = { id: "s1", topic: "Should we rebuild ingest?", thoughts: ["hire", "ship"] };
    assert.deepEqual(roundTrip(session), session);
  });

  it("round-trips text btoa cannot encode on its own", () => {
    const session = { topic: "Quarterly planning 🎯 — 目標", thoughts: ["café", "naïve"] };
    assert.deepEqual(roundTrip(session), session);
  });

  it("round-trips a tilde, which standard base64 turns into a '+'", () => {
    // "a~" is the shortest payload that lands a '+' in the encoded blob; before base64url,
    // the query string turned that '+' into a space and atob dropped it, shifting every
    // byte after it and corrupting the JSON.
    const session = { topic: "a~", thoughts: ["budget is ~$50k", "~2 weeks", "a~"] };
    assert.deepEqual(roundTrip(session), session);
  });

  it("emits no character a query string reinterprets", () => {
    for (let i = 0; i < 200; i++) {
      const blob = encodeSnapshot({ topic: `~${i}~`, note: "x".repeat(i) });
      assert.match(blob, /^[A-Za-z0-9_-]*$/, `unsafe characters in ${blob}`);
      assert.equal(throughQueryString(blob), blob);
    }
  });

  it("still decodes links written by the standard-base64 build", () => {
    const session = { topic: "~", thoughts: ["legacy"] };
    const legacy = btoa(encodeURIComponent(JSON.stringify(session)));
    assert.ok(legacy.includes("+"), "fixture no longer exercises the mangled character");
    assert.deepEqual(decodeSnapshot(throughQueryString(legacy)), session);
  });

  it("throws rather than returning a half-decoded session", () => {
    assert.throws(() => decodeSnapshot("!!!not-base64!!!"));
  });
});
