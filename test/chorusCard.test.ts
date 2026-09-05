/**
 * What the card says, and the two things it must never say.
 *
 * Rendered to a string rather than into a browser, for the same reason
 * test/coverageMap.test.ts is — there is no DOM harness here, and everything at issue is
 * wording.
 *
 * Wording is the whole risk in this component. "Nobody else has been here" is one word away
 * from "nobody agrees with you", and a card that matches words while implying it understands
 * meaning is making a claim the arithmetic behind it cannot support.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ChorusCard from "../src/components/ChorusCard.tsx";
import type { Echo, Neighbour } from "../src/utils/chorus.ts";

const neighbour = (over: Partial<Neighbour> = {}): Neighbour => ({
  id: "n1",
  text: "nobody signs off the handover, so orders sit for days",
  mode: "free_stream",
  timestamp: "2026-09-05T10:00:00.000Z",
  author: { email: "b@x.com", name: "Bev Okafor", role: "Finance" },
  shared: ["handover", "orders"],
  ...over,
});

const echo = (over: Partial<Echo> = {}): Echo => ({
  neighbours: [neighbour()],
  others: 1,
  mine: 0,
  isolated: false,
  silent: null,
  ...over,
});

const render = (e: Echo) =>
  renderToStaticMarkup(createElement(ChorusCard, { echo: e, onDismiss: () => {} }));

describe("chorus card", () => {
  it("draws nothing when the arithmetic had nothing to say", () => {
    for (const silent of ["pile", "thin"] as const) {
      assert.equal(
        render(echo({ silent, neighbours: [], others: 0 })),
        "",
        `a ${silent} echo must not occupy the space with an apology`,
      );
    }
  });

  it("leads with how many other people are near you, not how many fragments", () => {
    const html = render(echo({ neighbours: [neighbour(), neighbour({ id: "n2" })], others: 1 }));
    assert.match(html, /1 other is circling this/);
  });

  it("counts more than one correctly, because a room reads this over a shoulder", () => {
    const html = render(echo({ others: 3 }));
    assert.match(html, /3 others are circling this/);
  });

  it("says it is you when the pile only echoes yourself", () => {
    // Solo mode, and the group case where a contributor has circled their own point twice.
    const html = render(echo({ others: 0, mine: 2 }));
    assert.match(html, /You have been here 2 times before/);
  });

  it("shows the words the link rests on, so the claim can be checked at a glance", () => {
    const html = render(echo());
    assert.match(html, /handover/);
    assert.match(html, /orders/);
    assert.match(html, /Bev Okafor/);
    assert.match(html, /Finance/);
  });

  it("names the mode instead of a person when the pile has no attribution", () => {
    const html = render(
      echo({ neighbours: [neighbour({ author: undefined, mode: "guided_drill" })] }),
    );
    assert.match(html, /guided drill/);
  });

  it("states isolation as a finding, and never as a fault", () => {
    // The reasoning CoverageMap already settled for a dark area: black, not coral, because
    // coral means something is misconfigured and nothing is wrong with being the only voice.
    const html = render(echo({ neighbours: [], others: 0, mine: 0, isolated: true }));
    assert.match(html, /Nobody else has been here/);
    assert.match(html, /a finding, not a problem/);
    assert.match(html, /bg-black/);
    assert.doesNotMatch(html, /FFD5CC/, "coral is reserved for things that are actually wrong");
    assert.doesNotMatch(html, /wrong|should|failed|missing/i);
  });

  it("prints the limit of what it matched on, in both states", () => {
    for (const e of [echo(), echo({ neighbours: [], isolated: true, others: 0 })]) {
      const html = render(e);
      assert.match(html, /not on meaning/, "a reader must not take this for comprehension");
      assert.match(html, /Counted here, never generated/);
    }
  });
});
