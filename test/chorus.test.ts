/**
 * What the pile is allowed to claim about a fragment.
 *
 * Same reasoning as test/coverage.test.ts and test/engagementStats.test.ts: this puts a
 * sentence in front of the person who just wrote the fragment, and one of those sentences is
 * "nobody else has been here". That is a strong thing to tell somebody in a room, so the
 * interesting cases are all the ways it could be said when it is not true — a pile too small
 * to know, a fragment too thin to match, a fragment matching itself, or a link resting on one
 * word everybody used.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, echoFor, tally } from "../src/utils/chorus.ts";
import type { Session, Thought } from "../src/types.ts";

const BASE = Date.parse("2026-09-05T10:00:00.000Z");

const fragment = (id: string, text: string, author?: [string, string]): Thought => ({
  id,
  text,
  timestamp: new Date(BASE).toISOString(),
  mode: "free_stream",
  ...(author ? { author: { email: author[0], name: author[0], role: author[1] } } : {}),
});

const pileOf = (thoughts: Thought[], topic = "an engagement"): Session =>
  ({ id: "e1", engagementId: "e1", topic, thoughts }) as unknown as Session;

/** Filler that shares nothing with anything, to push a pile over MIN_PILE. */
const filler = (n: number, from = 0): Thought[] =>
  Array.from({ length: n }, (_, i) =>
    fragment(`f${from + i}`, `unrelated padding sentence number ${"x".repeat(i + 3)} alpha bravo`),
  );

describe("chorus — when it must say nothing", () => {
  it("refuses to call anything isolated in a pile too small to know", () => {
    const pile = pileOf([
      fragment("a", "the handover between fulfilment and finance is where orders die"),
      fragment("b", "something completely different about carrier portals"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[0].text });
    assert.equal(echo.silent, "pile");
    assert.equal(echo.isolated, false, "a small pile is a fact about the pile, not the room");
    assert.deepEqual(echo.neighbours, []);
  });

  it("refuses to judge a fragment with almost no words in it", () => {
    const echo = echoFor(buildIndex(pileOf(filler(10))), { text: "Yes." });
    assert.equal(echo.silent, "thin");
    assert.equal(echo.isolated, false);
  });

  it("counts thin fragments apart rather than reporting them as lone voices", () => {
    const result = tally(buildIndex(pileOf([...filler(9), fragment("y", "yes")])));
    assert.equal(result.thin, 1);
    assert.equal(result.considered, result.total - result.thin);
    assert.ok(!result.loneIds.includes("y"));
  });
});

describe("chorus — what counts as being near somebody", () => {
  it("does not introduce two people over a single shared word", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the migration budget was approved in January"),
      fragment("b", "the budget for training has completely different concerns"),
    ]);
    const echo = echoFor(buildIndex(pile), {
      id: "a",
      text: "the migration budget was approved in January",
    });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      [],
      "one word in common is a coincidence, not a link",
    );
    assert.equal(echo.isolated, true);
  });

  it("links on two shared distinctive words", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the carrier portal integration breaks whenever they patch"),
      fragment("b", "our carrier portal credentials expire without warning"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      ["b"],
    );
  });

  it("links on a single shared phrase, because a phrase is not a coincidence", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "master data is the thing nobody has claimed"),
      fragment("b", "master data ownership was never agreed"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      ["b"],
    );
    assert.ok(
      echo.neighbours[0].shared.includes("master data"),
      "the phrase that made the link is shown, so the claim can be checked",
    );
  });

  it("does not link two fragments over the topic's own words", () => {
    // Everyone in an engagement about an ERP migration writes "ERP migration". A link resting
    // on it would introduce every contributor to every other one on the first fragment.
    const pile = pileOf(
      [
        ...filler(8),
        fragment("a", "the erp migration will need a freeze period"),
        fragment("b", "erp migration timelines always slip in my experience"),
      ],
      "ERP migration readiness",
    );
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      [],
    );
  });

  it("keeps a phrase where only half of it is the topic", () => {
    const pile = pileOf(
      [
        ...filler(8),
        fragment("a", "the migration owner has not been named"),
        fragment("b", "we need a migration owner before anything else"),
      ],
      "migration",
    );
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      ["b"],
    );
  });

  it("ignores a word most of the pile is using, topic or not", () => {
    const chorus = Array.from({ length: 9 }, (_, i) =>
      fragment(`c${i}`, `deadline pressure is showing up in stream ${"y".repeat(i + 3)}`),
    );
    const echo = echoFor(buildIndex(pileOf(chorus)), { id: "c0", text: chorus[0].text });
    assert.equal(
      echo.neighbours.length,
      0,
      "a word in most of the pile describes the room, and links nobody",
    );
  });

  it("collapses plurals and participles so one thing is not two", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "our carrier integrations are undocumented"),
      fragment("b", "the carrier integration nobody documented is the risk"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(
      echo.neighbours.map((n) => n.id),
      ["b"],
    );
  });
});

describe("chorus — a fragment is never its own neighbour", () => {
  it("excludes the target by id", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the handover step is where every order dies"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.equal(echo.isolated, true);
  });

  it("excludes an identical fragment under an id the caller has never seen", () => {
    // Group mode: the server stamps its own id, so for a poll or two the words a contributor
    // just submitted are in the pile twice as far as this client can tell.
    const text = "the handover step is where every order dies";
    const pile = pileOf([...filler(8), fragment("server-id", text, ["a@x.com", "Ops"])]);
    const echo = echoFor(buildIndex(pile), { id: "client-id", text, authorEmail: "a@x.com" });
    assert.equal(echo.isolated, true, "a fragment must never echo itself back");
  });
});

describe("chorus — who the neighbours are", () => {
  const room = () =>
    pileOf([
      ...filler(8),
      fragment("a", "the handover between fulfilment and finance loses orders", ["a@x.com", "Ops"]),
      fragment("b", "nobody signs off the handover, so orders sit", ["b@x.com", "Finance"]),
      fragment("c", "the handover is fine, the orders queue afterwards", ["c@x.com", "IT"]),
      fragment("d", "handover and orders again, same author as the first", ["a@x.com", "Ops"]),
    ]);

  it("counts other people, not other fragments", () => {
    const echo = echoFor(buildIndex(room()), {
      id: "a",
      text: "the handover between fulfilment and finance loses orders",
      authorEmail: "a@x.com",
    });
    assert.equal(echo.others, 2, "b and c are two people; d is the writer again");
    assert.equal(echo.mine, 1);
    assert.equal(echo.others + echo.mine, echo.neighbours.length);
  });

  it("treats an unattributed pile as the writer's own, because solo has nobody else", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the handover step is where every order dies"),
      fragment("b", "that handover keeps losing orders"),
    ]);
    const echo = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.equal(echo.neighbours.length, 1);
    assert.equal(echo.others, 0);
    assert.equal(echo.mine, 1);
  });
});

describe("chorus — the whole-pile reading", () => {
  it("accounts for every fragment, so a reader never has to assume it balanced", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the handover step is where every order dies"),
      fragment("b", "that handover keeps losing orders"),
      fragment("t", "ok"),
    ]);
    const result = tally(buildIndex(pile));
    assert.equal(result.total, 11);
    assert.equal(result.considered + result.thin, result.total);
    assert.ok(result.lone <= result.considered);
    assert.equal(result.lone, result.loneIds.length);
  });

  it("claims nothing at all about a pile too small to have a shape", () => {
    const result = tally(
      buildIndex(pileOf([fragment("a", "one lonely fragment about handovers")])),
    );
    assert.equal(result.tooSmall, true);
    assert.equal(result.lone, 0);
    assert.deepEqual(result.loneIds, []);
  });

  it("finds the fragment nobody picked up and leaves the echoed ones alone", () => {
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the handover step is where every order dies", ["a@x.com", "Ops"]),
      fragment("b", "that handover keeps losing orders", ["b@x.com", "Finance"]),
      fragment("c", "success measures were never discussed by anybody here", ["c@x.com", "IT"]),
    ]);
    assert.deepEqual(
      tally(buildIndex(pile)).loneIds.filter((id) => "abc".includes(id)),
      ["c"],
    );
  });
});

describe("chorus — it must not move on its own", () => {
  it("returns the same neighbours in the same order for the same pile", () => {
    // Drawn live in a room that polls every fifteen seconds: a card that reorders itself
    // between two identical polls looks like a change in the room's thinking.
    const pile = pileOf([
      ...filler(8),
      fragment("a", "the handover step is where every order dies"),
      fragment("b", "that handover keeps losing orders"),
      fragment("c", "the handover loses orders again and again"),
      fragment("d", "orders and the handover, one more time"),
    ]);
    const once = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    const twice = echoFor(buildIndex(pile), { id: "a", text: pile.thoughts[8].text });
    assert.deepEqual(once, twice);
    assert.ok(once.neighbours.length <= 3, "a card holds three; the rest are not shown");
  });
});
