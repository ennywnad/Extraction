/**
 * The counts a room is shown about itself.
 *
 * Same reasoning as test/coverage.ts: these are numbers put in front of a room, so being
 * usually right is not good enough. The interesting cases are the ones where a count could
 * flatter — one person writing ten fragments is not ten voices, and somebody who joined and
 * said nothing is on the roster but is not a voice.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { engagementStats } from "../src/utils/engagementStats.ts";
import type { AreaCoverage, Session, Thought } from "../src/types.ts";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

const fragment = (over: Partial<Thought> & { id: string }): Thought => ({
  text: "a fragment",
  timestamp: new Date(NOW).toISOString(),
  mode: "free_stream",
  ...over,
});

const authored = (id: string, email: string, role: string, over: Partial<Thought> = {}) =>
  fragment({ id, author: { email, name: email, role }, ...over });

const sessionWith = (over: Partial<Session>): Session =>
  ({
    id: "e1",
    engagementId: "e1",
    createdAt: new Date(NOW - 41 * 60_000).toISOString(),
    thoughts: [],
    modeProgress: Object.fromEntries(
      ["free_stream", "quick_fire", "guided_drill", "card_sort"].map((m) => [m, 0]),
    ),
    ...over,
  }) as unknown as Session;

describe("engagement stats", () => {
  it("separates who is in the room from who has spoken", () => {
    // The roster fills when somebody opens the engagement, not when they write, so these two
    // numbers are different questions and a facilitator reads both.
    const session = sessionWith({
      roster: {
        "a@x.com": { email: "a@x.com", name: "A", role: "Ops" },
        "b@x.com": { email: "b@x.com", name: "B", role: "IT" },
        "quiet@x.com": { email: "quiet@x.com", name: "Q", role: "Legal" },
      },
      thoughts: [authored("1", "a@x.com", "Ops"), authored("2", "b@x.com", "IT")],
    });
    const stats = engagementStats(session, null, NOW);
    assert.equal(stats.roster, 3);
    assert.equal(stats.voices, 2, "the person who has written nothing is not a voice");
  });

  it("counts one person writing many fragments as one voice", () => {
    const session = sessionWith({
      thoughts: [
        authored("1", "a@x.com", "Ops"),
        authored("2", "a@x.com", "Ops"),
        authored("3", "a@x.com", "Ops"),
      ],
    });
    const stats = engagementStats(session, null, NOW);
    assert.equal(stats.fragments, 3);
    assert.equal(stats.voices, 1);
    assert.equal(stats.roles, 1);
  });

  it("counts roles the way the coverage map does: spelling folded, groupings applied", () => {
    // The board and the map both put this in front of the room. If one folded "Finance" and
    // "finance" and the other did not, the same room would read as two different sizes.
    const session = sessionWith({
      thoughts: [
        authored("1", "a@x.com", "Finance"),
        authored("2", "b@x.com", "finance"),
        authored("3", "c@x.com", "FP&A"),
        authored("4", "d@x.com", "Legal"),
      ],
      roleGroups: {
        "fp&a": { label: "FP&A", group: "Finance", by: "a@x.com", at: "2026-09-11T10:00:00.000Z" },
      },
    });
    assert.equal(engagementStats(session, null, NOW).roles, 2);
  });

  it("counts modes against the session's own progress map, not a second list", () => {
    // If this counted against a list of modes kept here, adding a mode would silently make
    // the board report "2 of 11" while the app had twelve.
    const session = sessionWith({
      thoughts: [
        fragment({ id: "1", mode: "free_stream" }),
        fragment({ id: "2", mode: "free_stream" }),
        fragment({ id: "3", mode: "card_sort" }),
      ],
    });
    const stats = engagementStats(session, null, NOW);
    assert.equal(stats.modesUsed, 2);
    assert.equal(stats.modesTotal, 4);
  });

  it("does not count a system fragment as a mode somebody used", () => {
    const session = sessionWith({ thoughts: [fragment({ id: "1", mode: "system" })] });
    assert.equal(engagementStats(session, null, NOW).modesUsed, 0);
  });

  it("counts only fragments inside the five-minute window as recent", () => {
    const session = sessionWith({
      thoughts: [
        fragment({ id: "1", timestamp: new Date(NOW - 60_000).toISOString() }),
        fragment({ id: "2", timestamp: new Date(NOW - 4 * 60_000).toISOString() }),
        fragment({ id: "3", timestamp: new Date(NOW - 20 * 60_000).toISOString() }),
      ],
    });
    assert.equal(engagementStats(session, null, NOW).recent, 2);
  });

  it("survives a fragment with an unparsable timestamp", () => {
    const session = sessionWith({ thoughts: [fragment({ id: "1", timestamp: "not a date" })] });
    const stats = engagementStats(session, null, NOW);
    assert.equal(stats.fragments, 1);
    assert.equal(stats.recent, 0, "unknown age is not recent");
  });

  it("reports no dark areas until a level set exists, rather than reporting zero", () => {
    // Zero dark areas reads as "everything has been covered", which is the opposite of the
    // truth before anything has been classified.
    assert.equal(engagementStats(sessionWith({}), null, NOW).dark, null);

    const coverage = [
      { area: "Processes", status: "dark", fragments: 0, voices: 0, fragmentIds: [] },
      { area: "Systems", status: "partial", fragments: 3, voices: 1, fragmentIds: [] },
    ] as AreaCoverage[];
    assert.deepEqual(engagementStats(sessionWith({ coverage }), null, NOW).dark, {
      dark: 1,
      total: 2,
    });
  });

  it("passes the server's polling count through, and stays null when it did not say", () => {
    assert.equal(engagementStats(sessionWith({}), 9, NOW).polling, 9);
    assert.equal(engagementStats(sessionWith({}), null, NOW).polling, null);
  });

  it("reports age in whole minutes since the engagement was created", () => {
    assert.equal(engagementStats(sessionWith({}), null, NOW).ageMinutes, 41);
  });

  it("counts who declared a role against the whole roster, and stays null in solo mode", () => {
    // The stat exists so the board and the coverage map can qualify `roles` and `voices`.
    // Null rather than a zeroed pair when there is no roster: absent is a different claim
    // from "nobody declared", and only one of them warrants a caveat.
    const roster = {
      "a@x.com": { email: "a@x.com", name: "Ana", role: "Owns billing" },
      "b@x.com": { email: "b@x.com", name: "Bo", role: "Contributor" },
    };
    assert.deepEqual(engagementStats(sessionWith({ roster }), null, NOW).rolesDeclared, {
      declared: 1,
      total: 2,
    });
    assert.equal(engagementStats(sessionWith({}), null, NOW).rolesDeclared, null);
  });

  it("reads the level-set count off the session and treats never-run as zero, not unknown", () => {
    // The distinction matters in the other direction from `dark`, which is deliberately null
    // until a level set exists because zero dark areas is a claim about coverage. Zero *runs*
    // is not a claim about anything — it is the true count for an engagement nobody has
    // synthesised, and showing "—" there would hide the one case that is unambiguously free.
    assert.equal(engagementStats(sessionWith({}), null, NOW).levelSets, 0);
    assert.equal(engagementStats(sessionWith({ levelSetRuns: 7 }), null, NOW).levelSets, 7);
  });
});
