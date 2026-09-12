/**
 * The surface that was missing, and the claims it makes while missing it.
 *
 * Rendered to a string, as with the coverage map and the board: the interesting behaviour is
 * wording and what is offered to whom, not interaction. Two things are load-bearing — that it
 * can only edit you, and that it says plainly what an undeclared roster does to the numbers,
 * because "fill this in" without a reason is a form and gets ignored.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RosterPanel from "../src/components/RosterPanel.tsx";
import {
  BRIEF_MAX_LENGTH,
  CONTRIBUTOR_ROLE,
  FACILITATOR_ROLE,
  type RosterEntry,
  type Session,
} from "../src/types.ts";

const stamp = (email: string, name: string, role: string, brief?: string): RosterEntry => ({
  email,
  name,
  role,
  ...(brief ? { brief } : {}),
});

const sessionWith = (members: RosterEntry[]): Session =>
  ({
    id: "e1",
    engagementId: "e1",
    roster: Object.fromEntries(members.map((m) => [m.email, m])),
    thoughts: [],
  }) as unknown as Session;

const render = (session: Session, viewerEmail?: string) =>
  renderToStaticMarkup(
    createElement(RosterPanel, {
      session,
      viewerEmail,
      onSave: async () => {},
      onClose: () => {},
    }),
  );

const mixed = sessionWith([
  stamp("a@x.com", "Ana", "Owns the billing migration"),
  stamp("b@x.com", "Bo", FACILITATOR_ROLE),
  stamp("c@x.com", "Cara", CONTRIBUTOR_ROLE),
]);

describe("roster panel", () => {
  it("says how much of the room has described itself", () => {
    assert.match(render(mixed, "a@x.com"), />1 of 3<\/strong> people have declared a role/);
  });

  it("names the consequence rather than just asking for input", () => {
    // A role field with no stated purpose gets a job title or gets skipped. The number it
    // feeds is the only argument for filling it in, so it is on the panel.
    const html = render(mixed, "a@x.com");
    assert.match(html, /voices/);
    assert.match(html, /coverage map/);
  });

  it("marks an undeclared entry as the server's rather than the person's", () => {
    // "Contributor" on its own reads as a role somebody holds. It is not one.
    assert.match(render(mixed, "a@x.com"), /not declared/);
  });

  it("drops the consequence line once everybody has declared", () => {
    const declared = sessionWith([
      stamp("a@x.com", "Ana", "Owns billing"),
      stamp("b@x.com", "Bo", "Runs the platform team"),
    ]);
    const html = render(declared, "a@x.com");
    assert.doesNotMatch(html, /server assigned/);
    assert.doesNotMatch(html, /not declared/);
  });

  it("offers an editable entry only for the viewer", () => {
    // The server takes identity from the verified stamp and ignores the body, so this cannot
    // edit anyone else even if it tried. Rendering others read-only says so rather than
    // relying on the caller having read that route.
    const html = render(mixed, "a@x.com");
    assert.equal((html.match(/<input/g) ?? []).length, 2, "name and role, for the viewer only");
    assert.equal((html.match(/<textarea/g) ?? []).length, 1, "and one brief, the viewer's");
    assert.match(html, /Save my entry/);
  });

  it("shows everybody's brief to the room, read-only", () => {
    // What the others believe they own is where an overlap becomes visible to the two people
    // who have it, rather than only to the consultant.
    const room = sessionWith([
      stamp("a@x.com", "Ana", "Owns billing"),
      stamp("b@x.com", "Bo", "Platform", "I run the platform team and hold the deploy keys."),
    ]);
    const html = render(room, "a@x.com");
    assert.match(html, /I run the platform team and hold the deploy keys\./);
    assert.doesNotMatch(html, /<textarea[^>]*>I run the platform/, "never in an editable box");
  });

  it("prefills your own brief, capped where the server caps it", () => {
    const html = render(
      sessionWith([stamp("a@x.com", "Ana", "Owns billing", "Billing and refunds.")]),
      "a@x.com",
    );
    assert.match(html, /Billing and refunds\.<\/textarea>/);
    assert.match(html, new RegExp(`maxlength="${BRIEF_MAX_LENGTH}"`, "i"));
  });

  it("says who reads a brief, because it is the one field about yourself", () => {
    assert.match(render(mixed, "a@x.com"), /under your role, never your name/);
  });

  it("prefills the field with a declared role but never with a default", () => {
    // Prefilling "Contributor" would invite somebody to accept it, which is the one outcome
    // this panel exists to prevent.
    assert.match(render(mixed, "a@x.com"), /value="Owns the billing migration"/);
    assert.doesNotMatch(render(mixed, "c@x.com"), /value="Contributor"/);
  });

  it("does not offer to edit an entry that does not exist yet", () => {
    const html = render(mixed, "stranger@x.com");
    assert.match(html, /not on this roster yet/);
    assert.doesNotMatch(html, /Save my entry/);
  });
});

describe("roster panel — role groups", () => {
  const renderGrouping = (session: Session, viewerEmail?: string) =>
    renderToStaticMarkup(
      createElement(RosterPanel, {
        session,
        viewerEmail,
        onSave: async () => {},
        onSetRoleGroup: async () => {},
        onClose: () => {},
      }),
    );

  const finance = (roleGroups: Session["roleGroups"] = {}) =>
    ({
      ...sessionWith([
        stamp("a@x.com", "Ana", "Finance"),
        stamp("b@x.com", "Bo", "Finance lead"),
        stamp("c@x.com", "Cara", "Treasury"),
      ]),
      roleGroups,
    }) as Session;

  it("offers grouping only where it can be saved", () => {
    assert.doesNotMatch(render(finance(), "a@x.com"), /Role groups/);
    assert.match(renderGrouping(finance(), "a@x.com"), /Role groups/);
  });

  it("marks it as a facilitator's job while leaving it open to everyone", () => {
    assert.match(renderGrouping(finance(), "c@x.com"), /Facilitator task · open to all for now/);
  });

  it("asks about two labels sharing a word, and not about the one that shares none", () => {
    const html = renderGrouping(finance(), "a@x.com");
    assert.match(html, /“Finance”<\/strong> and <strong>“Finance lead”<\/strong> share/);
    assert.doesNotMatch(html, /“Treasury”<\/strong> and/);
  });

  it("names who grouped a label, and shows what it counts as on the member", () => {
    const html = renderGrouping(
      finance({
        treasury: {
          label: "Treasury",
          group: "Finance",
          by: "b@x.com",
          at: "2026-09-11T10:00:00Z",
        },
      }),
      "a@x.com",
    );
    assert.match(html, /Grouped under Finance by Bo/);
    assert.match(html, /counts as Finance/);
  });

  it("adds no text box until somebody asks for a new group", () => {
    // Name and role for the viewer, and nothing else: grouping is chosen, not typed, unless a
    // group nobody has written yet is asked for.
    assert.equal((renderGrouping(finance(), "a@x.com").match(/<input/g) ?? []).length, 2);
  });
});
