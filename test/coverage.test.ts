/**
 * The dark-area arithmetic. This is deliberately not delegated to the model: the headline
 * output of a level set is the area nobody raised, and a count of zero must be right every
 * time rather than usually.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCoverage, darkAreas } from "../server/ai/coverage.ts";
import type { Session, Thought } from "../src/types.ts";

const AREAS = ["Processes", "Systems", "Commercials"];

const fragment = (id: string, role: string): Thought => ({
  id,
  text: `fragment ${id}`,
  timestamp: new Date().toISOString(),
  mode: "free_stream",
  author: { email: `${role}@x.com`, name: role, role },
});

const sessionWith = (thoughts: Thought[]): Session =>
  ({ id: "e", thoughts } as unknown as Session);

describe("coverage", () => {
  it("reports an area nobody entered as dark with a count of zero", () => {
    const session = sessionWith([fragment("1", "Ops"), fragment("2", "IT")]);
    const coverage = computeCoverage(session, AREAS, { "1": "Processes", "2": "Systems" });
    assert.deepEqual(darkAreas(coverage), ["Commercials"]);
    assert.equal(coverage.find((c) => c.area === "Commercials")!.fragments, 0);
  });

  it("counts distinct roles rather than fragments as voices", () => {
    const session = sessionWith([
      fragment("1", "Ops"), fragment("2", "Ops"), fragment("3", "IT"),
    ]);
    const coverage = computeCoverage(session, AREAS, {
      "1": "Processes", "2": "Processes", "3": "Processes",
    });
    const processes = coverage.find((c) => c.area === "Processes")!;
    assert.equal(processes.fragments, 3);
    assert.equal(processes.voices, 2, "one person contributing twice is still one voice");
  });

  it("will not call an area defined on a single voice, however loud", () => {
    const session = sessionWith(
      Array.from({ length: 20 }, (_, i) => fragment(String(i), "Ops"))
    );
    const classification = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [String(i), "Processes"])
    );
    const processes = computeCoverage(session, AREAS, classification)
      .find((c) => c.area === "Processes")!;
    assert.equal(processes.status, "partial");
  });

  it("ignores classifications pointing at fragments that no longer exist", () => {
    const session = sessionWith([fragment("1", "Ops")]);
    const coverage = computeCoverage(session, AREAS, { "1": "Processes", "ghost": "Systems" });
    assert.equal(coverage.find((c) => c.area === "Systems")!.fragments, 0);
  });
});
