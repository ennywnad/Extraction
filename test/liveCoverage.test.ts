/**
 * The coverage wall drawn while the room is still writing.
 *
 * The arithmetic underneath is already covered by test/coverage.test.ts and is not repeated here.
 * What this file is about is the part that is new and easy to get wrong: *where the classification
 * comes from*, and the fact that a partial one supports a weaker claim than the level set's.
 *
 * The failure worth pinning is not a wrong number. It is a true number under a headline that
 * overstates it — nine black cells reading "nine areas still dark" when the honest sentence is
 * "nobody has filed anything in nine areas", in a room where the difference is a facilitator
 * announcing a gap that is really an unused feature.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { acceptedAreas, liveCoverage, MIN_PLACED } from "../src/utils/liveCoverage.ts";
import { LEVEL_SET_AREAS } from "../src/utils/levelSetAreas.ts";
import CoverageMap from "../src/components/CoverageMap.tsx";
import type { AreaCoverage, Session, Thought } from "../src/types.ts";

const filed = (id: string, area?: string, role = "Ops"): Thought => ({
  id,
  text: `fragment ${id}`,
  timestamp: "2026-09-11T10:00:00.000Z",
  mode: "free_stream",
  author: { email: `${role}@x.com`, name: role, role },
  ...(area ? { assist: { backend: "in-page" as const, area } } : {}),
});

const sessionWith = (thoughts: Thought[]): Session => ({ id: "e", thoughts }) as unknown as Session;

/** Enough filed fragments to clear MIN_PLACED, spread over two areas and two roles. */
const enough = (): Thought[] =>
  Array.from({ length: MIN_PLACED }, (_, i) =>
    filed(String(i), LEVEL_SET_AREAS[i % 2], i % 2 ? "IT" : "Ops"),
  );

describe("acceptedAreas — only what an author actually took", () => {
  it("reads the area off a fragment whose author accepted one", () => {
    const session = sessionWith([filed("1", "Data & reporting")]);
    assert.deepEqual(acceptedAreas(session), { "1": "Data & reporting" });
  });

  it("ignores a fragment nobody filed", () => {
    // The ordinary case, and the default one: both assists ship off. Nothing here infers an area.
    const session = sessionWith([filed("1"), filed("2", "Data & reporting")]);
    assert.deepEqual(acceptedAreas(session), { "2": "Data & reporting" });
  });

  it("drops an area that is not one of the ten", () => {
    // A value from an older build, a shared link, or a renamed area. Counted as placed it would
    // inflate the footer's tally while matching no cell, which makes the unplaced warning — the
    // one thing keeping the map honest — under-report.
    const session = sessionWith([filed("1", "Vibes"), filed("2", "Data & reporting")]);
    assert.deepEqual(acceptedAreas(session), { "2": "Data & reporting" });
  });
});

describe("liveCoverage — and when it refuses to draw", () => {
  it("says nothing until enough has been filed to mean something", () => {
    // Two filed fragments make nine black cells, and nine black cells read as "this room has
    // covered nothing" when they mean "almost nobody has used the assist".
    const session = sessionWith([filed("1", "Data & reporting"), filed("2", "Success measures")]);
    assert.equal(liveCoverage(session), null);
  });

  it("says nothing at all in the default configuration", () => {
    // Both assists are off by default, so most sessions never place a single fragment.
    const session = sessionWith(Array.from({ length: 40 }, (_, i) => filed(String(i))));
    assert.equal(liveCoverage(session), null);
  });

  it("draws all ten areas once enough is filed", () => {
    const coverage = liveCoverage(sessionWith(enough()));
    assert.equal(coverage?.length, LEVEL_SET_AREAS.length);
    assert.deepEqual(
      coverage?.map((c) => c.area),
      [...LEVEL_SET_AREAS],
    );
  });

  it("reports an area nobody filed as dark with a count of zero", () => {
    const coverage = liveCoverage(sessionWith(enough()))!;
    const untouched = coverage.find((c) => c.area === LEVEL_SET_AREAS[9])!;
    assert.equal(untouched.fragments, 0);
    assert.equal(untouched.status, "dark");
  });

  it("counts only filed fragments, leaving the rest for the footer to account for", () => {
    // Ten fragments, five filed. The map must not quietly treat the unfiled five as placed.
    const session = sessionWith([
      ...enough(),
      ...Array.from({ length: 5 }, (_, i) => filed(`u${i}`)),
    ]);
    const coverage = liveCoverage(session)!;
    const placed = coverage.reduce((sum, c) => sum + c.fragments, 0);
    assert.equal(placed, MIN_PLACED);
    assert.equal(session.thoughts.length, MIN_PLACED + 5);
  });
});

describe("the two maps make different claims", () => {
  const coverage = (): AreaCoverage[] => liveCoverage(sessionWith(enough()))!;

  const render = (source: "live" | "level-set") =>
    renderToStaticMarkup(
      createElement(CoverageMap, { coverage: coverage(), pileSize: MIN_PLACED + 5, source }),
    );

  it("says nothing has been filed, not that nothing has been said", () => {
    const html = render("live");
    assert.match(html, /have nothing filed yet/);
    assert.doesNotMatch(html, /still dark/);
  });

  it("names where the classification came from", () => {
    // Without this the wall looks like the deliverable's map, which was produced a completely
    // different way and supports a much stronger claim.
    assert.match(render("live"), /accepted on their own drafts/);
  });

  it("blames nobody for the fragments that were never filed", () => {
    // "not placed by the classifier" is the level set's sentence and there is no classifier here.
    const html = render("live");
    assert.match(html, /never filed by anyone/);
    assert.doesNotMatch(html, /not placed by the classifier/);
  });

  it("defaults to the level set's claim when nobody says which map it is", () => {
    // ExportPanel renders this with no `source` at all, so the deliverable's map rides entirely
    // on the default. Flipped, the client-facing wall would quietly start hedging about what it
    // knows — the one direction this component must never fail in, and invisible from its own
    // call site.
    const html = renderToStaticMarkup(
      createElement(CoverageMap, { coverage: coverage(), pileSize: MIN_PLACED + 5 }),
    );
    assert.match(html, /still dark/);
    assert.doesNotMatch(html, /accepted on their own drafts/);
  });

  it("leaves the level set's map saying exactly what it said before", () => {
    // The regression that matters most: this component already had one caller producing a client
    // deliverable, and a shared wording change would have rewritten it silently.
    const html = render("level-set");
    assert.match(html, /still dark/);
    assert.match(html, /not placed by the classifier/);
    assert.doesNotMatch(html, /accepted on their own drafts/);
  });
});
