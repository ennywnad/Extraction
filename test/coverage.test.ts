/**
 * The dark-area arithmetic. This is deliberately not delegated to the model: the headline
 * output of a level set is the area nobody raised, and a count of zero must be right every
 * time rather than usually.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCoverage, darkAreas } from "../src/utils/coverage.ts";
import type { Session, Thought } from "../src/types.ts";

const AREAS = ["Processes", "Systems", "Commercials"];

const fragment = (id: string, role: string): Thought => ({
  id,
  text: `fragment ${id}`,
  timestamp: new Date().toISOString(),
  mode: "free_stream",
  author: { email: `${role}@x.com`, name: role, role },
});

const sessionWith = (thoughts: Thought[]): Session => ({ id: "e", thoughts }) as unknown as Session;

describe("coverage", () => {
  it("reports an area nobody entered as dark with a count of zero", () => {
    const session = sessionWith([fragment("1", "Ops"), fragment("2", "IT")]);
    const coverage = computeCoverage(session, AREAS, { "1": "Processes", "2": "Systems" });
    assert.deepEqual(darkAreas(coverage), ["Commercials"]);
    assert.equal(coverage.find((c) => c.area === "Commercials")!.fragments, 0);
  });

  it("counts distinct roles rather than fragments as voices", () => {
    const session = sessionWith([fragment("1", "Ops"), fragment("2", "Ops"), fragment("3", "IT")]);
    const coverage = computeCoverage(session, AREAS, {
      "1": "Processes",
      "2": "Processes",
      "3": "Processes",
    });
    const processes = coverage.find((c) => c.area === "Processes")!;
    assert.equal(processes.fragments, 3);
    assert.equal(processes.voices, 2, "one person contributing twice is still one voice");
  });

  it("will not call an area defined on a single voice, however loud", () => {
    const session = sessionWith(Array.from({ length: 20 }, (_, i) => fragment(String(i), "Ops")));
    const classification = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [String(i), "Processes"]),
    );
    const processes = computeCoverage(session, AREAS, classification).find(
      (c) => c.area === "Processes",
    )!;
    assert.equal(processes.status, "partial");
  });

  it("ignores classifications pointing at fragments that no longer exist", () => {
    const session = sessionWith([fragment("1", "Ops")]);
    const coverage = computeCoverage(session, AREAS, { "1": "Processes", ghost: "Systems" });
    assert.equal(coverage.find((c) => c.area === "Systems")!.fragments, 0);
  });
});

describe("coverage — voices count the room, not the stamp", () => {
  /**
   * The defect this suite could not see until roles could be declared at all.
   *
   * `AuthorStamp.role` is copied onto a fragment when it is written, and until a roster
   * surface existed every one of those stamps was one of two server constants — so `voices`,
   * a group-by over role, could reach two in a room of twenty. Resolving through the roster
   * fixes the count and, more usefully, fixes it retroactively: a facilitator who fills the
   * roster in halfway through does not have to accept that the first half is miscounted.
   */
  const stamped = (id: string, email: string): Thought => ({
    id,
    text: `fragment ${id}`,
    timestamp: new Date().toISOString(),
    mode: "free_stream",
    // What the server writes before anybody has declared anything.
    author: { email, name: email, role: "Contributor" },
  });

  const thoughts = [stamped("1", "a@x.com"), stamped("2", "b@x.com"), stamped("3", "c@x.com")];
  const assignments = { "1": "Systems", "2": "Systems", "3": "Systems" };

  const withRoster = (roster: Record<string, string>): Session =>
    ({
      id: "e",
      thoughts,
      roster: Object.fromEntries(
        Object.entries(roster).map(([email, role]) => [email, { email, name: email, role }]),
      ),
    }) as unknown as Session;

  it("counts three people under one default role as one voice", () => {
    // Not a bug in this function — it is the honest answer to the input it was given, and the
    // reason the input had to be fixed rather than the arithmetic.
    const session = withRoster({
      "a@x.com": "Contributor",
      "b@x.com": "Contributor",
      "c@x.com": "Contributor",
    });
    const systems = computeCoverage(session, AREAS, assignments).find((c) => c.area === "Systems")!;
    assert.equal(systems.fragments, 3);
    assert.equal(systems.voices, 1);
  });

  it("counts them separately once they declare, without rewriting a single fragment", () => {
    const session = withRoster({
      "a@x.com": "Owns billing",
      "b@x.com": "Runs the platform team",
      "c@x.com": "Contributor",
    });
    const systems = computeCoverage(session, AREAS, assignments).find((c) => c.area === "Systems")!;
    assert.equal(systems.voices, 3, "two declared roles plus the one still on the default");
    assert.equal(
      session.thoughts[0].author!.role,
      "Contributor",
      "the stamp is an audit record and is left exactly as written",
    );
  });

  it("falls back to the stamp for an author who has left the roster", () => {
    const session = withRoster({ "a@x.com": "Owns billing" });
    const systems = computeCoverage(session, AREAS, assignments).find((c) => c.area === "Systems")!;
    assert.equal(systems.voices, 2, "the declared role, plus the departed authors' stamp");
  });
});

describe("coverage — a spelling is not a voice, and a group is one", () => {
  /**
   * The defect free-text roles introduced. "Defined" needs twelve fragments from more than one
   * voice, and "Finance" and "finance" were two — so one part of the business could get an area
   * printed as defined in a client deliverable.
   */
  const byRole = (count: number, email: string, role: string): Thought[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `${email}-${i}`,
      text: "fragment",
      timestamp: new Date().toISOString(),
      mode: "free_stream",
      author: { email, name: email, role },
    }));

  const processesIn = (thoughts: Thought[], over: Partial<Session> = {}) => {
    const session = { id: "e", thoughts, ...over } as unknown as Session;
    const everything = Object.fromEntries(thoughts.map((t) => [t.id, "Processes"]));
    return computeCoverage(session, AREAS, everything).find((c) => c.area === "Processes")!;
  };

  const decided = (label: string, group: string) => ({
    [label.toLowerCase()]: { label, group, by: "f@x.com", at: "2026-09-11T10:00:00.000Z" },
  });

  it("will not call an area defined because two people spelled one role differently", () => {
    const processes = processesIn([
      ...byRole(6, "a@x.com", "Finance"),
      ...byRole(6, "b@x.com", "finance "),
    ]);
    assert.equal(processes.fragments, 12);
    assert.equal(processes.voices, 1);
    assert.equal(processes.status, "partial");
  });

  it("counts two labels the room grouped as one voice", () => {
    const processes = processesIn(
      [...byRole(6, "a@x.com", "FP&A"), ...byRole(6, "b@x.com", "Finance")],
      { roleGroups: decided("FP&A", "Finance") },
    );
    assert.equal(processes.voices, 1);
    assert.equal(processes.status, "partial");
  });

  it("keeps a split the room chose to keep", () => {
    const processes = processesIn(
      [...byRole(6, "a@x.com", "Finance lead"), ...byRole(6, "b@x.com", "Finance")],
      { roleGroups: decided("Finance lead", "Finance lead") },
    );
    assert.equal(processes.voices, 2);
    assert.equal(processes.status, "defined");
  });
});
