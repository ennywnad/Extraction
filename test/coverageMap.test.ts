/**
 * What the drawn map claims, and the two claims it must not make.
 *
 * Rendered to a string rather than into a browser — there is no DOM harness here, and the
 * interesting behaviour is arithmetic and wording rather than interaction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CoverageMap from "../src/components/CoverageMap.tsx";
import type { AreaCoverage } from "../src/types.ts";

const area = (over: Partial<AreaCoverage>): AreaCoverage => ({
  area: "Processes",
  status: "dark",
  fragments: 0,
  voices: 0,
  fragmentIds: [],
  ...over,
});

const render = (
  coverage: AreaCoverage[],
  pileSize: number,
  rolesDeclared: { declared: number; total: number } | null = null,
) => renderToStaticMarkup(createElement(CoverageMap, { coverage, pileSize, rolesDeclared }));

describe("coverage map", () => {
  it("leads with the count of dark areas, because that is the finding", () => {
    const html = render(
      [area({}), area({ area: "Systems", status: "partial", fragments: 3, voices: 2 })],
      3,
    );
    assert.match(html, /1 of 2 areas still dark/);
  });

  it("says so plainly when nothing is dark", () => {
    const html = render([area({ status: "defined", fragments: 20, voices: 3 })], 20);
    assert.match(html, /Every area has been spoken into/);
    assert.doesNotMatch(html, /still dark/);
  });

  it("declares the fragments the classifier placed nowhere", () => {
    // 5 fragments in the pile, 2 in an area. Without this line the three unplaced ones make
    // an area look unspoken when it is only unplaced, which is a different finding.
    const html = render(
      [area({ status: "partial", fragments: 2, voices: 1 }), area({ area: "Systems" })],
      5,
    );
    assert.match(html, /2 of 5 fragments placed/);
    assert.match(html, /3 were not placed by the classifier/);
  });

  it("claims no shortfall when every fragment was placed", () => {
    const html = render([area({ status: "partial", fragments: 4, voices: 2 })], 4);
    assert.match(html, /4 of 4 fragments placed/);
    assert.doesNotMatch(html, /not placed by the classifier/);
  });

  it("explains a busy area that is still only partial", () => {
    // The threshold is 12 fragments *and* more than one voice, so one person talking a lot
    // does not make an area defined. The cell has to say which half is missing.
    const html = render([area({ status: "partial", fragments: 40, voices: 1 })], 40);
    assert.match(html, /one voice only/);
  });

  it("renders nothing at all before a level set has been generated", () => {
    assert.equal(render([], 12), "");
  });
});

describe("coverage map — voices, when nobody has declared a role", () => {
  // `voices` is a group-by over author roles, and an undeclared role is one of two constants
  // the server assigned. So on a stubbed roster every voice count here is counting defaults,
  // and the map has to say so for the same reason it already accounts for unplaced fragments:
  // its claims are only worth having if its limits are on it.
  const partial = [area({ area: "Systems", status: "partial", fragments: 3, voices: 1 })];

  it("says the voice counts are grouping defaults rather than people", () => {
    const html = render(partial, 3, { declared: 1, total: 8 });
    assert.match(html, /Only 1 of 8 have declared a role/);
    assert.match(html, /rather than the people/);
  });

  it("drops the qualifier that would otherwise miscount the room", () => {
    // "one voice only" is a claim about how many people spoke. With roles at their defaults
    // it is a claim about how many of two constants appear — wrong in the direction that
    // sounds most specific, so it is suppressed rather than reworded.
    assert.match(render(partial, 3), /one voice only/);
    assert.doesNotMatch(render(partial, 3, { declared: 1, total: 8 }), /one voice only/);
  });

  it("claims nothing when it has not been told about roles", () => {
    // Absent must not read as "all declared" — a caller that knows nothing about roles must
    // not make the map assert that the room described itself.
    const html = render(partial, 3);
    assert.doesNotMatch(html, /declared a role/);
  });

  it("stays quiet once the whole roster has declared", () => {
    const html = render(partial, 3, { declared: 8, total: 8 });
    assert.doesNotMatch(html, /declared a role/);
    assert.match(html, /one voice only/, "the qualifier is trustworthy again");
  });
});

describe("coverage map — numbers that moved after the level set", () => {
  const cells = [area({ area: "Systems", status: "partial", fragments: 3, voices: 1 })];
  const draw = (props: { recounted?: boolean; ungroupedPairs?: number }) =>
    renderToStaticMarkup(createElement(CoverageMap, { coverage: cells, pileSize: 3, ...props }));

  it("says its numbers are newer than the level set's prose when a recount moved them", () => {
    // The voices are arithmetic and can be recounted; the conflicts and open questions were
    // written by a model reading the old labels, and cannot be.
    assert.match(draw({ recounted: true }), /until it is regenerated/);
    assert.doesNotMatch(draw({}), /regenerated/);
  });

  it("says when labels that share a word are still counted apart", () => {
    assert.match(draw({ ungroupedPairs: 1 }), /1 pair of role labels shares a word and is/);
    assert.match(draw({ ungroupedPairs: 2 }), /2 pairs of role labels share a word and are/);
    assert.doesNotMatch(draw({}), /role labels/);
  });
});
