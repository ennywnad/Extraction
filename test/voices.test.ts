/**
 * What counts as one voice.
 *
 * The coverage map's "defined" needs more than one voice, and roles are free text. So the two
 * things tested here are the two tiers the count now rests on: spelling is folded without asking
 * anybody, and everything past spelling is a decision somebody made — suggested by shared words,
 * never taken on the room's behalf.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupingSuggestions,
  recountCoverage,
  resolveVoice,
  roleKey,
  roleLabels,
  voiceGroups,
} from "../src/utils/voices.ts";
import { renderCorpus, rolesPresent } from "../server/ai/corpus.ts";
import type { AreaCoverage, AuthorStamp, RoleGroup, Session, Thought } from "../src/types.ts";

const AT = "2026-09-11T10:00:00.000Z";

const member = (email: string, name: string, role: string): AuthorStamp => ({ email, name, role });

const decided = (label: string, group: string, by = "f@x.com"): [string, RoleGroup] => [
  roleKey(label),
  { label, group, by, at: AT },
];

const room = (
  members: AuthorStamp[],
  groups: [string, RoleGroup][] = [],
  thoughts: Thought[] = [],
): Session =>
  ({
    id: "e1",
    engagementId: "e1",
    roster: Object.fromEntries(members.map((m) => [m.email, m])),
    roleGroups: Object.fromEntries(groups),
    thoughts,
  }) as unknown as Session;

const said = (id: string, author: AuthorStamp): Thought => ({
  id,
  text: `fragment ${id}`,
  timestamp: AT,
  mode: "free_stream",
  author,
});

describe("a spelling is not a voice", () => {
  it("folds case, spacing and width", () => {
    assert.equal(roleKey("  Finance   Lead "), "finance lead");
    assert.equal(roleKey("ＦＰ&Ａ"), "fp&a", "full-width text pasted from a slide");
  });

  it("does not fold words — that is the room's call", () => {
    assert.notEqual(roleKey("Finance"), roleKey("Finance lead"));
  });
});

describe("the room's groupings", () => {
  it("counts a grouped label under its group, named as the group was written", () => {
    const session = room([], [decided("FP&A", "Finance")]);
    assert.deepEqual(resolveVoice(session, "fp&a "), { key: "finance", name: "Finance" });
  });

  it("leaves a label kept separate as its own voice", () => {
    const session = room([], [decided("Finance lead", "Finance lead")]);
    assert.equal(resolveVoice(session, "Finance lead").key, "finance lead");
  });

  it("follows a grouping of a group", () => {
    // "FP&A" under "Finance", and later "Finance" under "Commercial". Stranding the first
    // decision because a second was made would be the surprising answer.
    const session = room([], [decided("FP&A", "Finance"), decided("Finance", "Commercial")]);
    assert.equal(resolveVoice(session, "FP&A").key, "commercial");
  });

  it("lands every label in a loop on the same voice, whichever it starts from", () => {
    const session = room([], [decided("Ops", "Delivery"), decided("Delivery", "Ops")]);
    assert.equal(resolveVoice(session, "Ops").key, resolveVoice(session, "Delivery").key);
  });

  it("never groups a server default, in either direction", () => {
    // A default is what an undeclared person carries. Folding one into a real role would
    // count nobody as a declaration; folding a real role into one would count a declaration
    // as nobody's.
    const session = room(
      [],
      [decided("Contributor", "Finance"), decided("Finance", "Contributor")],
    );
    assert.equal(resolveVoice(session, "Contributor").key, "contributor");
    assert.equal(resolveVoice(session, "Finance").key, "finance");
  });
});

describe("recounting a stored map", () => {
  const a = member("a@x.com", "Ana", "Finance");
  const b = member("b@x.com", "Bo", "finance");
  const thoughts = [
    ...Array.from({ length: 6 }, (_, i) => said(`a${i}`, a)),
    ...Array.from({ length: 6 }, (_, i) => said(`b${i}`, b)),
  ];
  // What the map said before spellings were folded: two voices, so defined.
  const stored: AreaCoverage[] = [
    {
      area: "Processes",
      status: "defined",
      fragments: 12,
      voices: 2,
      fragmentIds: thoughts.map((t) => t.id),
    },
  ];

  it("recounts voices and status, and says the numbers moved", () => {
    const { coverage, changed } = recountCoverage(room([a, b], [], thoughts), stored);
    assert.equal(coverage[0].voices, 1);
    assert.equal(coverage[0].status, "partial");
    assert.equal(coverage[0].fragments, 12, "which area a fragment is in is not recounted");
    assert.equal(changed, true);
  });

  it("hands back the stored map untouched when nothing moved", () => {
    const current: AreaCoverage[] = [{ ...stored[0], voices: 1, status: "partial" }];
    const { coverage, changed } = recountCoverage(room([a, b], [], thoughts), current);
    assert.equal(changed, false);
    assert.equal(coverage[0], current[0]);
  });
});

describe("labels in the room", () => {
  it("shows a label the way most people spelled it, and leaves the defaults out", () => {
    const labels = roleLabels(
      room([
        member("a@x.com", "Ana", "Finance"),
        member("b@x.com", "Bo", "Finance"),
        member("c@x.com", "Cy", "finance"),
        member("d@x.com", "Di", "Contributor"),
      ]),
    );
    assert.equal(labels.length, 1);
    assert.equal(labels[0].label, "Finance");
    assert.deepEqual(labels[0].members, ["Ana", "Bo", "Cy"]);
  });

  it("breaks a tie towards the spelling somebody capitalised", () => {
    // One "Finance" and one "finance" is exactly the case folding exists for, and the row, the
    // suggestion and the group name all read this spelling. Found by driving the panel: on
    // alphabetical order alone the lowercase one won, and "Count both as finance" read like a
    // typo the app had chosen.
    const [label] = roleLabels(
      room([member("a@x.com", "Ana", "finance"), member("b@x.com", "Bo", "Finance")]),
    );
    assert.equal(label.label, "Finance");
  });

  it("names a group the way its own label is spelled", () => {
    const session = room(
      [member("a@x.com", "Ana", "Finance"), member("b@x.com", "Bo", "FP&A")],
      [decided("FP&A", "finance")],
    );
    const [finance] = voiceGroups(session);
    assert.equal(finance.name, "Finance");
    assert.deepEqual(
      finance.labels.map((l) => l.label),
      ["Finance", "FP&A"],
    );
  });
});

describe("grouping suggestions", () => {
  const two = (x: string, y: string, groups: [string, RoleGroup][] = []) =>
    groupingSuggestions(room([member("a@x.com", "A", x), member("b@x.com", "B", y)], groups));

  it("points at two labels sharing a word", () => {
    const [only, ...rest] = two("Finance", "Finance lead");
    assert.equal(rest.length, 0);
    assert.deepEqual(only.shared, ["finance"]);
  });

  it("ignores words about seniority rather than the business", () => {
    assert.equal(two("Finance lead", "Engineering lead").length, 0);
  });

  it("catches the two-letter labels that are some of the commonest there are", () => {
    assert.equal(two("HR", "HR business partner").length, 1);
    assert.equal(two("IT", "Owns it all").length, 0, "the pronoun is not the department");
  });

  it("cannot see that FP&A is Finance, and does not pretend to", () => {
    // The limit that makes this a suggestion and the choice on each label necessary.
    assert.equal(two("FP&A", "Finance").length, 0);
  });

  it("stops asking once both labels carry a decision", () => {
    const kept = [decided("Finance", "Finance"), decided("Finance lead", "Finance lead")];
    assert.equal(two("Finance", "Finance lead", kept).length, 0);
    assert.equal(two("Finance", "Finance lead", kept.slice(0, 1)).length, 1, "one is still new");
  });

  it("stops asking once they are grouped", () => {
    assert.equal(two("Finance", "Finance lead", [decided("Finance lead", "Finance")]).length, 0);
  });

  it("offers a newcomer the group rather than a label filed under it", () => {
    const session = room(
      [
        member("a@x.com", "A", "Finance"),
        member("b@x.com", "B", "FP&A"),
        member("c@x.com", "C", "Finance ops"),
      ],
      [decided("FP&A", "Finance")],
    );
    const suggestions = groupingSuggestions(session);
    assert.equal(suggestions.length, 1, "one question per pair of voices");
    assert.deepEqual([suggestions[0].a.label, suggestions[0].b.label], ["Finance", "Finance ops"]);
  });
});

describe("what the model reads", () => {
  const ana = member("ana@x.com", "Ana Lindqvist", "FP&A");
  const bo = member("bo@x.com", "Bo Okafor", "Legal");
  const cy = member("cy@x.com", "Cy", "Contributor");
  const session = room(
    [ana, bo, cy],
    [decided("FP&A", "Finance")],
    [said("1", ana), said("2", bo)],
  );

  it("labels a grouped fragment with the group and the role, and never the person", () => {
    const corpus = renderCorpus(session);
    assert.match(corpus, /#1 \[Finance \/ FP&A\]/);
    assert.match(corpus, /#2 \[Legal\]/);
    assert.doesNotMatch(corpus, /Ana|Okafor|f@x\.com/);
  });

  it("lists each voice once, with the labels gathered under it", () => {
    assert.deepEqual(rolesPresent(session), ["Contributor", "Finance (FP&A)", "Legal"]);
  });
});
