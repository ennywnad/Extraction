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

const render = (coverage: AreaCoverage[], pileSize: number) =>
  renderToStaticMarkup(createElement(CoverageMap, { coverage, pileSize }));

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
