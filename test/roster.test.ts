/**
 * Telling a role somebody chose from one the server filled in.
 *
 * This is the whole basis of the fix: `AuthorStamp.role` is never empty, so "has a role" is
 * not a question worth asking. The question is whether anybody said it, because the coverage
 * map groups by role and two constants group into two however many people are present.
 *
 * The tests that matter here are the ones about which way it errs. Counting a default as
 * declared would have the app assert that the room described itself when nobody did — and it
 * would do it silently, on a number printed in a client deliverable.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDeclaredRole, roleOf, rosterState } from "../src/utils/roster.ts";
import {
  CONTRIBUTOR_ROLE,
  FACILITATOR_ROLE,
  type AuthorStamp,
  type Session,
} from "../src/types.ts";

const stamp = (email: string, name: string, role: string): AuthorStamp => ({ email, name, role });

const sessionWith = (members: AuthorStamp[]): Session =>
  ({
    id: "e1",
    engagementId: "e1",
    roster: Object.fromEntries(members.map((m) => [m.email, m])),
    thoughts: [],
  }) as unknown as Session;

describe("declared roles", () => {
  it("treats the server's two defaults as undeclared", () => {
    // These are the exact strings shape.ts stamps. If either is renamed in one place only,
    // every roster entry silently becomes "declared" and the caveat disappears — which is why
    // the constants are imported here rather than written out.
    assert.equal(isDeclaredRole(FACILITATOR_ROLE), false);
    assert.equal(isDeclaredRole(CONTRIBUTOR_ROLE), false);
  });

  it("treats anything a person could have typed as declared", () => {
    assert.equal(isDeclaredRole("Owns the billing migration"), true);
    assert.equal(isDeclaredRole("Finance"), true);
  });

  it("does not count blank or absent as declared", () => {
    assert.equal(isDeclaredRole(""), false);
    assert.equal(isDeclaredRole("   "), false);
    assert.equal(isDeclaredRole(undefined), false);
  });

  it("errs towards undeclared when someone types a default back in", () => {
    // Indistinguishable from the server having set it, and there is no marker to tell them
    // apart. Understating by one is the harmless direction; the other would be the app
    // claiming a declaration that never happened.
    assert.equal(isDeclaredRole("Contributor"), false);
    assert.equal(isDeclaredRole(" Contributor "), false);
  });
});

describe("roster state", () => {
  const room = sessionWith([
    stamp("c@x.com", "Cara", CONTRIBUTOR_ROLE),
    stamp("a@x.com", "Ana", "Owns the billing migration"),
    stamp("b@x.com", "Bo", FACILITATOR_ROLE),
  ]);

  it("counts only the declared against the whole roster", () => {
    const { declared, total } = rosterState(room);
    assert.equal(declared, 1);
    assert.equal(total, 3, "the undeclared are still in the room and still count in the total");
  });

  it("sorts declared first, then by name, so the poll cannot reshuffle it", () => {
    // The session is replaced wholesale every fifteen seconds. Object key order is not an
    // ordering, so without this the list can reorder under somebody reading it.
    assert.deepEqual(
      rosterState(room).members.map((m) => m.name),
      ["Ana", "Bo", "Cara"],
    );
  });

  it("finds the viewer's own entry regardless of address casing", () => {
    // The roster key is lowercased server-side; an identity arriving with different casing
    // must still match, or the viewer is shown somebody else's card as their own.
    assert.equal(rosterState(room, "A@X.com").me?.name, "Ana");
    assert.equal(rosterState(room, "A@X.com").mineUndeclared, false);
  });

  it("knows when the viewer is still carrying what the server gave them", () => {
    assert.equal(rosterState(room, "c@x.com").mineUndeclared, true);
  });

  it("claims nothing about a viewer who is not on the roster", () => {
    const state = rosterState(room, "nobody@x.com");
    assert.equal(state.me, null);
    assert.equal(state.mineUndeclared, false, "absent is not the same as undeclared");
  });

  it("handles a solo session, which has no roster at all", () => {
    const solo = { id: "s1", thoughts: [] } as unknown as Session;
    assert.deepEqual(rosterState(solo).members, []);
    assert.equal(rosterState(solo).total, 0);
  });
});

describe("which role a fragment counts under", () => {
  // The stamp records who somebody was when they wrote; the roster records who they are. Every
  // question the app asks is about now, so this resolves through the roster — which is what
  // makes declaring a role halfway through a session repair the counts for the first half.
  const withRoster = (role: string): Session =>
    ({
      id: "e1",
      engagementId: "e1",
      roster: { "a@x.com": stamp("a@x.com", "Ana", role) },
      thoughts: [],
    }) as unknown as Session;

  const stampedAs = stamp("a@x.com", "Ana", CONTRIBUTOR_ROLE);

  it("prefers the roster over the role stamped at write time", () => {
    assert.equal(roleOf(withRoster("Owns billing"), stampedAs), "Owns billing");
  });

  it("matches the roster regardless of the stamp's address casing", () => {
    assert.equal(roleOf(withRoster("Owns billing"), stamp("A@X.com", "Ana", "x")), "Owns billing");
  });

  it("keeps the stamp when the author is no longer on the roster", () => {
    // Someone removed from a roster must not lose their attribution in the pile they wrote.
    const empty = { id: "e1", roster: {}, thoughts: [] } as unknown as Session;
    assert.equal(roleOf(empty, stampedAs), CONTRIBUTOR_ROLE);
  });

  it("keeps the stamp in a session with no roster at all", () => {
    const solo = { id: "s1", thoughts: [] } as unknown as Session;
    assert.equal(roleOf(solo, stampedAs), CONTRIBUTOR_ROLE);
  });

  it("has nothing to say about an unauthored fragment", () => {
    assert.equal(roleOf(withRoster("Owns billing"), undefined), undefined);
  });
});
