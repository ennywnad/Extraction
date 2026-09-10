/**
 * The pile's category filter, which had no test at all until this file.
 *
 * Two classes of defect are pinned here rather than described, because both were the kind that
 * looks fine in the source: mode vocabulary that had leaked into content vocabulary, and a
 * substring test standing in for a word test.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Workspace from "../src/components/Workspace.tsx";
import { categoriesOf, matchesCategory, type PileCategory } from "../src/utils/pileCategories.ts";
import type { Session } from "../src/types.ts";

describe("pile categories — the app's own vocabulary is not content", () => {
  /**
   * `socratic` is a promptingStyle value (standard | socratic | empathetic) and `provocative`
   * is left over from a settings list that no longer exists anywhere in the codebase. Both
   * were cues for *fear*, so discussing how the interview should run filed you as frightened.
   */
  for (const text of [
    "I'd like the drill to be more socratic next time",
    "the provocative setting works better for this group",
    "switch the prompting style to socratic",
  ]) {
    it(`does not read mode configuration as a fear: "${text.slice(0, 40)}"`, () => {
      assert.equal(matchesCategory(text, "fear"), false);
    });
  }

  /**
   * Devil's Advocate returns a field called `challenges` and SwipeReact flattens those into
   * fragments, so this cue made a mode's own output classify itself.
   */
  it("does not read the word challenge as a fear", () => {
    assert.equal(matchesCategory("this challenges my core assumption", "fear"), false);
    assert.equal(matchesCategory("a fun challenge to take on", "fear"), false);
  });

  it("still catches an actual fear", () => {
    assert.ok(matchesCategory("I'm afraid this will not land", "fear"));
    assert.ok(matchesCategory("the risk is that nobody reads it", "fear"));
    assert.ok(matchesCategory("I keep hesitating on this", "fear"));
    assert.ok(matchesCategory("we are stuck", "fear"));
    assert.ok(matchesCategory("this worries me", "fear"));
  });
});

describe("pile categories — a substring is not a word", () => {
  /** Each of these matched under the old `includes` chain. */
  const FALSE_POSITIVES: [string, PileCategory][] = [
    ["I have no claim to this", "goal"], // "aim"
    ["my inaction is the real problem", "action"], // "action"
    ["there was real satisfaction in finishing", "action"], // "action"
    ["a brisk walk cleared my head", "fear"], // "risk"
    ["the footnote had an asterisk", "fear"], // "risk"
    ["this is the ideal outcome for us", "insight"], // "idea"
    ["we should devalue that metric", "goal"], // "value"
  ];

  for (const [text, category] of FALSE_POSITIVES) {
    it(`no longer files "${text}" as ${category}`, () => {
      assert.equal(matchesCategory(text, category), false);
    });
  }

  it("still matches the word the cue was written for", () => {
    assert.ok(matchesCategory("my aim is to finish by Friday", "goal"));
    assert.ok(matchesCategory("the action item is mine", "action"));
    assert.ok(matchesCategory("the risk is real", "fear"));
    assert.ok(matchesCategory("that idea is worth keeping", "insight"));
    assert.ok(matchesCategory("the value here is obvious", "goal"));
  });

  /**
   * `includes("do ")` matched *todo* and *undo* by accident and missed the phrase it was
   * plainly written for, because "do" at the end of a sentence has no trailing space.
   */
  it("handles the phrase the old 'do ' cue was reaching for", () => {
    assert.ok(matchesCategory("I need to write the brief", "action"));
    assert.ok(matchesCategory("still on my todo list", "action"));
  });
});

describe("pile categories — endings", () => {
  it("collapses ordinary inflections of one cue", () => {
    for (const text of ["I hesitate", "I hesitated", "some hesitation"]) {
      assert.ok(matchesCategory(text, "fear"), text);
    }
    for (const text of ["we make it", "she makes it", "making it work"]) {
      assert.ok(matchesCategory(text, "action"), text);
    }
    for (const text of ["I realize now", "I realised later", "realizing too late"]) {
      assert.ok(matchesCategory(text, "insight"), text);
    }
  });

  it("does not let an ending carry a cue into a different word", () => {
    // "mak" must not reach "maker"; "notic" must not reach "noticeable board".
    assert.equal(matchesCategory("the decision maker is unclear", "action"), false);
  });
});

describe("pile categories — overlap is real and reported", () => {
  it("returns every category a fragment matches", () => {
    // Genuinely both: a thing to do, and a stated end state.
    const both = categoriesOf("I need to hit that milestone");
    assert.ok(both.includes("action"));
    assert.ok(both.includes("goal"));
  });

  it("returns nothing for a fragment with no cue in it", () => {
    assert.deepEqual(categoriesOf("the weather in Lisbon"), []);
  });

  it("is case-insensitive, since people type mid-sentence", () => {
    assert.ok(matchesCategory("AFRAID this slips", "fear"));
    assert.ok(matchesCategory("Afraid this slips", "fear"));
  });
});

/**
 * The chips and the predicate are one decision now, and this is the half a type cannot hold.
 *
 * `CATEGORY_CHIPS` being a `Record<PileCategory, …>` makes a category with no chip a compile
 * error, but nothing stops the chips being built and then not rendered — which is the exact
 * failure test/workspaceChorus.test.ts was written for, where the pile filter was reading a
 * category the chips had already abandoned.
 */
describe("pile categories — every category reaches the sidebar", () => {
  const session = (): Session =>
    ({
      id: "s1",
      topic: "ERP migration readiness",
      intention: "Level set the ask",
      status: "active",
      activeMode: "free_stream",
      thoughts: [
        { id: "a", text: "I need to fix the handover", timestamp: "", mode: "free_stream" },
      ],
      modeProgress: {},
      modeHistory: [],
      createdAt: "",
      updatedAt: "",
    }) as unknown as Session;

  const markup = () =>
    renderToStaticMarkup(
      createElement(Workspace, {
        session: session(),
        onUpdateSession: () => {},
        onDeleteThought: () => {},
        onAddThought: () => {},
        onExit: () => {},
        onSynthesize: () => {},
        children: null,
      } as any),
    );

  for (const label of ["Actions", "Insights", "Fears", "Goals"]) {
    it(`renders the ${label} chip`, () => {
      assert.match(markup(), new RegExp(label));
    });
  }

  it("renders the All chip, which is not a content category", () => {
    assert.match(markup(), />All</);
  });
});
