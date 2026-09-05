/**
 * What the board claims, and the claims it must refuse to make.
 *
 * Rendered to a string, as with the coverage map: there is no DOM harness here and the
 * interesting behaviour is wording rather than interaction. The load-bearing tests are the
 * ones about honesty — a status board that overstates what it knows is worse than no board,
 * because somebody about to run a paid workshop will believe it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StatusBoard from "../src/components/StatusBoard.tsx";
import { DEFAULT_PREFS, type BoardPrefs } from "../src/utils/boardPrefs.ts";
import type { EngagementStats } from "../src/utils/engagementStats.ts";
import type { InstanceStatus } from "../src/types.ts";

const deployed: InstanceStatus = {
  ok: true,
  identity: { mode: "iap", verified: true },
  storage: { backend: "firestore", live: true },
  model: { backend: "vertex", chainLength: 3 },
  aiEnabled: true,
};

const freshClone: InstanceStatus = {
  ok: true,
  identity: { mode: "dev", verified: false },
  storage: { backend: "file", live: true },
  model: { backend: "none", chainLength: 0 },
  aiEnabled: false,
};

const stats: EngagementStats = {
  roster: 7,
  voices: 6,
  roles: 4,
  fragments: 148,
  recent: 23,
  modesUsed: 9,
  modesTotal: 12,
  ageMinutes: 41,
  dark: { dark: 3, total: 10 },
  polling: 9,
};

const prefs = (over: Partial<BoardPrefs> = {}): BoardPrefs => ({
  boxes: { ...DEFAULT_PREFS.boxes, ...over.boxes },
  stats: { ...DEFAULT_PREFS.stats, ...over.stats },
});

const render = (
  status: InstanceStatus | null,
  engagement: EngagementStats | null = stats,
  over: Partial<BoardPrefs> = {},
  variant: "board" | "popup" = "board",
) =>
  renderToStaticMarkup(
    createElement(StatusBoard, {
      status,
      stats: engagement,
      prefs: prefs(over),
      onPrefsChange: () => {},
      settingsOpen: false,
      onSettingsToggle: () => {},
      variant,
    }),
  );

describe("status board", () => {
  it("names the branch each seam took and the branches it did not", () => {
    const html = render(deployed);
    assert.match(html, /IAP/);
    assert.match(html, /Firestore/);
    assert.match(html, /Vertex/);
    // The road not taken is the point: this is what makes it a board about configuration
    // rather than a row of green ticks.
    assert.match(html, />dev</);
    assert.match(html, />file</);
    assert.match(html, />api key</);
  });

  it("distinguishes a configured store from one this process has opened", () => {
    // The distinction `storage.live` exists to make. A Firestore that nothing has read from
    // is not a working Firestore, and on a first deployment that difference is the whole game.
    const unopened = { ...deployed, storage: { backend: "firestore", live: false } as const };
    const html = render(unopened);
    assert.match(html, /Not opened yet/);
    assert.match(html, /nothing has read from it in this process/);
    assert.doesNotMatch(html, /Opened this process/);
  });

  it("states the class of failure it structurally cannot show", () => {
    // authMode.ts exits on an inconsistent identity config, so the worst misconfigurations
    // have no server left to draw them. All green must not read as "everything is fine".
    assert.match(render(deployed), /exits the process rather than serving unverified identities/);
    assert.match(render(deployed, null, {}, "popup"), /never reach a screen/);
  });

  it("refuses to invent a status when the server has not answered", () => {
    const html = render(null);
    assert.match(html, /has not said what it is wired to/);
    assert.doesNotMatch(html, /Vertex|Firestore|IAP/);
  });

  it("treats a modelless instance as degraded rather than broken, and says fallbacks are labelled", () => {
    const html = render(freshClone);
    assert.match(html, /None/);
    assert.match(html, /Nothing is broken/);
    assert.match(html, /labels the response/);
    assert.match(html, /0 of 3 seams configured/);
  });

  it("reports the chain's depth without naming a single model id", () => {
    const html = render(deployed);
    assert.match(html, /3 deep/);
    assert.match(html, /3 model ids are tried in order/);
    assert.doesNotMatch(html, /gemini|flash|pro-/i);
  });

  it("draws exactly as many chain slots as there are model ids", () => {
    // Caught in a browser rather than here: the label read "2 deep" beside three boxes,
    // which is the board overstating what the server told it.
    const slots = (html: string) => (html.match(/data-chain-slot="(first|later)"/g) ?? []).length;
    assert.equal(slots(render(deployed)), 3);
    assert.equal(slots(render({ ...deployed, model: { backend: "apikey", chainLength: 2 } })), 2);
  });

  it("draws an empty chain as empty rather than as unlit slots", () => {
    const html = render(freshClone);
    assert.match(html, /Fallback chain · empty/);
    assert.match(html, /data-chain-slot="empty"/);
    assert.doesNotMatch(html, /data-chain-slot="first"/);
  });

  it("keeps the MCP box grey and honest, because 001 is not built", () => {
    const html = render(deployed);
    assert.match(html, /MCP/);
    assert.match(html, /Not served/);
    assert.match(html, /is not built yet/);
  });

  it("says a solo session has nothing to count instead of showing zeroes", () => {
    // Zeroes would read as a room nobody is talking in, which is a different claim entirely.
    const html = render(deployed, null);
    assert.match(html, /Solo — none/);
    assert.doesNotMatch(html, /On the roster/);
  });

  it("offers no empty stats list in a solo session", () => {
    // The settings panel is the one place a heading with nothing under it reads as a broken
    // control rather than an empty state.
    const html = renderToStaticMarkup(
      createElement(StatusBoard, {
        status: deployed,
        stats: null,
        prefs: prefs(),
        onPrefsChange: () => {},
        settingsOpen: true,
        onSettingsToggle: () => {},
        variant: "popup" as const,
      }),
    );
    assert.match(html, /Nothing to count until an engagement is open/);
    assert.doesNotMatch(html, /Counted from the pile/);
  });

  it("labels the polling count as requests rather than people", () => {
    const html = render(deployed);
    assert.match(html, /Polling now/);
    assert.match(html, /two tabs, two counts/);
  });

  it("draws no roster number the pile cannot justify", () => {
    const html = render(deployed);
    assert.match(html, /7/);
    assert.match(html, /opened the engagement — silent or not/);
    assert.match(html, /the ones who have written/);
  });

  it("leaves out a box the viewer turned off", () => {
    const html = render(deployed, stats, { boxes: { ...DEFAULT_PREFS.boxes, mcp: false } });
    assert.doesNotMatch(html, /Not served/);
    assert.match(html, /Vertex/, "the other seams stay");
  });

  it("leaves out a stat the viewer turned off", () => {
    const html = render(deployed, stats, { stats: { ...DEFAULT_PREFS.stats, polling: false } });
    assert.doesNotMatch(html, /Polling now/);
    assert.match(html, /On the roster/);
  });

  it("shows the same facts in the popup as on the board", () => {
    const popup = render(deployed, stats, {}, "popup");
    for (const claim of [/IAP/, /Firestore/, /Vertex/, /Not served/, /On the roster/]) {
      assert.match(popup, claim);
    }
  });
});
