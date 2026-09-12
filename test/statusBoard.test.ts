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
import type { LastAnswer } from "../src/utils/lastAnswer.ts";
import type { InstanceStatus } from "../src/types.ts";

const deployed: InstanceStatus = {
  ok: true,
  identity: { mode: "iap", verified: true },
  storage: { backend: "firestore", live: true },
  model: { backend: "vertex", chainLength: 3, providers: ["gemini"] },
  aiEnabled: true,
};

const freshClone: InstanceStatus = {
  ok: true,
  identity: { mode: "dev", verified: false },
  storage: { backend: "file", live: true },
  model: { backend: "none", chainLength: 0, providers: [] },
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
  rolesDeclared: { declared: 7, total: 7 },
  levelSets: 4,
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
  last: LastAnswer | null = null,
) =>
  renderToStaticMarkup(
    createElement(StatusBoard, {
      status,
      stats: engagement,
      lastAnswer: last,
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
    // Model *ids* and their fragments. This used to forbid the bare word "gemini", which was
    // a fine proxy while the provider was implicit and always that one — but the provider is
    // now an explicit field on the payload, and a family name is a branch name of exactly the
    // class this board already shows for storage and identity. An id is the narrower fact,
    // and it is still the one that stays off an unauthenticated screen.
    assert.doesNotMatch(html, /gemini-|flash|pro-|claude-|opus|sonnet/i);
  });

  it("names which provider is answering, which is the seam made visible", () => {
    // The other half of the line above: the app's claim is that the provider is a property of
    // the deployment, and a board that cannot say which one was picked cannot show that.
    assert.match(render(deployed), /Gemini/);
  });

  it("draws exactly as many chain slots as there are model ids", () => {
    // Caught in a browser rather than here: the label read "2 deep" beside three boxes,
    // which is the board overstating what the server told it.
    const slots = (html: string) => (html.match(/data-chain-slot="(first|later)"/g) ?? []).length;
    assert.equal(slots(render(deployed)), 3);
    assert.equal(
      slots(
        render({
          ...deployed,
          model: { backend: "apikey", chainLength: 2, providers: ["gemini"] },
        }),
      ),
      2,
    );
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
        lastAnswer: null,
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

  it("shows the level-set count by default, unlike the other optional stats", () => {
    // Deliberate, and the reason is the feature: synthesis is the only cost in this app that
    // scales with use, and nothing counted it until now. A cost tile that defaulted off would
    // rebuild the blind spot it was added to close.
    assert.equal(DEFAULT_PREFS.stats.levelSets, true);
    const html = render(deployed);
    assert.match(html, /Level sets run/);
    assert.match(html, />4</);
  });

  it("does not let the level-set count read as a bill", () => {
    // A run that failed part-way may still have spent tokens, so this is a floor. Labelling it
    // as spend would be the board overstating what it knows — the one thing it exists not to do.
    const html = render(deployed);
    assert.match(html, /one variable cost/);
    assert.doesNotMatch(html, /\$|cost you|spent so far/);
  });

  it("refuses to present a roles count built on server defaults as a plain number", () => {
    // The group-by behind this caps at two in a room of any size while roles are undeclared,
    // so a bare "2" is the board asserting something it knows is measuring the defaults.
    const stubbed = { ...stats, rolesDeclared: { declared: 1, total: 7 } };
    const html = render(deployed, stubbed, { stats: { ...DEFAULT_PREFS.stats, roles: true } });
    assert.match(html, /1 of 7 have declared one/);
    assert.match(html, /server defaults/);
    assert.doesNotMatch(html, /what the level set reasons over/);
  });

  it("states the roles count plainly once the room has described itself", () => {
    const html = render(deployed, stats, { stats: { ...DEFAULT_PREFS.stats, roles: true } });
    assert.match(html, /what the level set reasons over/);
    assert.doesNotMatch(html, /server defaults/);
  });

  it("says nothing either way about roles in a solo session", () => {
    // `rolesDeclared` is null with no roster, and absent must not read as "all declared".
    const solo = { ...stats, rolesDeclared: null };
    const html = render(deployed, solo, { stats: { ...DEFAULT_PREFS.stats, roles: true } });
    assert.doesNotMatch(html, /server defaults/);
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

  describe("the last response", () => {
    const answered = (over: Partial<LastAnswer> = {}): LastAnswer => ({
      route: "quick fire",
      source: "model",
      provider: "gemini",
      at: Date.parse("2026-09-11T10:00:00.000Z"),
      ...over,
    });

    it("says nothing has answered rather than implying something has", () => {
      // Everything else on this board is boot configuration. Before any route has answered,
      // a green "model" line would be the board reporting a request that never happened.
      const html = render(deployed);
      assert.match(html, /Last response/);
      assert.match(html, /Nothing asked yet/);
    });

    it("names the family that answered, and still no model id", () => {
      const html = render(deployed, stats, {}, "board", answered());
      assert.match(html, /Model · Gemini/);
      assert.doesNotMatch(html, /gemini-|flash|pro-|claude-|opus|sonnet/i);
    });

    it("declares a fallback instead of letting canned output pass as generated", () => {
      // The failure server/ai/respond.ts exists to close: a fallback is shaped exactly like a
      // generated answer, so a misconfigured deployment reads as a working one gone bland.
      const html = render(deployed, stats, {}, "board", answered({ source: "fallback" }));
      assert.match(html, /Fallback/);
      assert.match(html, /served its fixed answer/);
      assert.doesNotMatch(html, /Model · /);
    });

    it("refuses to read an unmarked response as a model answer", () => {
      // The group synthesize route answers with a plain res.json and names no source. Absence
      // is a fact about that route, never evidence about who wrote the words.
      const html = render(
        deployed,
        stats,
        {},
        "board",
        answered({ route: "level set", source: "unstated", provider: undefined }),
      );
      assert.match(html, /Not stated/);
      assert.match(html, /not a claim either way/);
      assert.doesNotMatch(html, /Model · /);
    });

    it("names the route that answered, so the line is about a request", () => {
      const html = render(deployed, stats, {}, "board", answered({ route: "devil's advocate" }));
      assert.match(html, /devil&#x27;s advocate route/);
    });

    it("draws no elapsed time, which a static render cannot keep true", () => {
      const html = render(deployed, stats, {}, "board", answered());
      assert.doesNotMatch(html, /ago|seconds|minutes/i);
    });

    it("reports the last response in the popup as well as on the board", () => {
      const html = render(deployed, stats, {}, "popup", answered());
      assert.match(html, /Last response/);
      assert.match(html, /Model · Gemini/);
    });

    it("drops the line with the model box, since it is a fact about that seam", () => {
      const html = render(
        deployed,
        stats,
        { boxes: { ...DEFAULT_PREFS.boxes, model: false } },
        "board",
        answered(),
      );
      assert.doesNotMatch(html, /Last response/);
    });
  });
});
