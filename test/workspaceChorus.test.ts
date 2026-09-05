/**
 * The wiring between the chorus arithmetic and the workspace around it.
 *
 * Both of the defects this covers were invisible to the two suites either side of it:
 * test/chorus.test.ts proved the numbers and test/chorusCard.test.ts proved the wording, while
 * the card was rendering into a pane the reader could not see and the pile filter was reading a
 * category the chips had already abandoned. What is asserted here is only what the workspace
 * does with the props — a static render cannot reproduce a sequence of clicks — but it is the
 * part a later refactor is most likely to detach.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Workspace from "../src/components/Workspace.tsx";
import type { Echo } from "../src/utils/chorus.ts";
import type { Session, Thought } from "../src/types.ts";

const fragment = (id: string, text: string): Thought => ({
  id,
  text,
  timestamp: "2026-09-05T10:00:00.000Z",
  mode: "free_stream",
});

const session = (): Session =>
  ({
    id: "e1",
    engagementId: "e1",
    topic: "ERP migration readiness",
    intention: "Level set the ask",
    status: "active",
    activeMode: "free_stream",
    thoughts: [
      fragment("a", "the handover between fulfilment and finance loses orders"),
      fragment("b", "nobody signs off the handover so orders sit"),
      fragment("c", "the union rep will hear about shift changes second hand"),
    ],
    modeProgress: {},
    modeHistory: [],
    createdAt: "2026-09-05T09:00:00.000Z",
    updatedAt: "2026-09-05T10:00:00.000Z",
  }) as unknown as Session;

const echo: Echo = {
  neighbours: [
    {
      id: "b",
      text: "nobody signs off the handover so orders sit",
      mode: "free_stream",
      timestamp: "2026-09-05T10:00:00.000Z",
      shared: ["handover"],
    },
  ],
  others: 0,
  mine: 1,
  isolated: false,
  silent: null,
};

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(Workspace, {
      session: session(),
      onUpdateSession: () => {},
      onDeleteThought: () => {},
      onAddThought: () => {},
      onExit: () => {},
      onSynthesize: () => {},
      children: null,
      ...props,
    } as any),
  );

describe("workspace — the chorus surfaces", () => {
  it("offers the lone filter only when the feature is on and something is lone", () => {
    assert.match(render({ chorusEnabled: true, loneIds: ["c"] }), /Lone 1/);
    assert.doesNotMatch(render({ chorusEnabled: false, loneIds: ["c"] }), /Lone/);
    assert.doesNotMatch(render({ chorusEnabled: true, loneIds: [] }), /Lone/);
  });

  it("keeps the whole pile visible when the feature is off", () => {
    // The filter and the chips have to resolve the vanished category the same way. They did
    // not, and turning Chorus off while the lone filter was active emptied the sidebar.
    const html = render({ chorusEnabled: false, loneIds: undefined });
    for (const t of session().thoughts) assert.ok(html.includes(t.text), `${t.id} is missing`);
  });

  it("draws the card only while the feature is on", () => {
    const on = render({ chorusEnabled: true, chorus: { key: "a", echo } });
    assert.match(on, /You have been here before/);
    const off = render({ chorusEnabled: false, chorus: { key: "a", echo } });
    assert.doesNotMatch(off, /You have been here before/);
  });

  it("puts the card above the mode, where the person who just contributed is looking", () => {
    const html = render({ chorusEnabled: true, chorus: { key: "a", echo } });
    assert.ok(
      html.indexOf("chorus-card") < html.indexOf("Surfaced Pile"),
      "the echo belongs in the mode pane, not appended after the pile",
    );
  });
});
