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
  CONTRIBUTOR_ROLE,
  FACILITATOR_ROLE,
  type AuthorStamp,
  type Session,
} from "../src/types.ts";

const stamp = (email: string, name: string, role: string): AuthorStamp => ({ email, name, role });

const sessionWith = (members: AuthorStamp[]): Session =>
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
    assert.match(html, /Save my role/);
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
    assert.doesNotMatch(html, /Save my role/);
  });
});
