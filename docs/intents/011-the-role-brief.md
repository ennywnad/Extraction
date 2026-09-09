# 011 — The role brief: what a consultant learns in a thirty-minute 1:1

**Status:** intent. Not planned, not scheduled — but its mechanical half has landed: roles can
now be declared, and the stub it describes below is fixed. See [STATUS.md](STATUS.md).
**Written:** 2026-09-05

## What

A short piece of free text each participant writes about themselves: what they are responsible
for, what they know that nobody else in the room knows, and where their authority stops. Two or
three sentences, written once at the start of an engagement, editable, and expected to change at
most a handful of times before the engagement ends.

It is not a profile and not a bio. It is the answer to the only question a consultant actually
asks in a kickoff 1:1: _what do you own, and what do you know?_ Today that answer is obtained by
booking thirty minutes with each of eight people, and it exists afterwards only in the
consultant's head.

Distinct from `AuthorStamp.role`, which is a **label** — one line, one noun phrase, the thing a
fragment is tagged with. The brief is the paragraph behind the label. The label is what the model
sees against every fragment; the brief is what the model reads once, to know what that label
means in this engagement.

## Why

**The pile is attributed but not situated.** Every fragment carries the role that produced it and
[corpus.ts](../../server/ai/corpus.ts) renders the pile role-labelled on purpose. But `[Finance]`
is a token, not a context. Whether a sentence from Finance is an authoritative constraint or an
outsider's guess depends on facts about that person that the pile does not carry — and the
level set is currently written as if a role label were self-explanatory.

**The three registers a level set produces are all about people.** `conflicts`, `assumptions`
and `openQuestions` in [levelSetPrompt.ts](../../server/ai/levelSetPrompt.ts) each ask the model
to attribute something to a role: which roles contradict each other, which role an assumption
originated from, which role is best placed to answer a question. All three are being answered
from a label alone. "Which role is best placed to answer this" is close to unanswerable without
knowing what each role actually owns, and it is the single most useful line in the deliverable.

**It surfaces the boundary problem while it is still cheap to fix.** If two people write briefs
that claim the same territory, that is a finding on day one rather than a fight in week six. If
nobody's brief covers an area, that is a staffing gap the coverage map cannot see — coverage
measures whether the _topic_ was spoken into, not whether anyone in the room was qualified to
speak into it. Those are different silences and only one of them is currently visible.

**The drift is the signal, not the noise.** The owner's observation that a person's brief may
change by the end of an engagement is the interesting part. A brief that gets rewritten in week
four usually means the engagement changed what someone thought they owned, and that is precisely
the kind of thing a level set is supposed to notice and never does. Which argues for keeping the
old text rather than overwriting it — see the open questions.

**And there is a mechanical reason, which is the sharpest one.** See below: the roles that the
coverage arithmetic counts are, in the app as it stands, never actually set by anybody.

## What the code already supports

More than expected on the server, and nothing at all in the UI.

- **The route exists.** `PUT /api/engagement/:id/roster/me` in
  [engagementRoutes.ts](../../server/engagementRoutes.ts) already lets a participant set their
  own `name` and `role` and nobody else's — self-service is decided, and the identity comes from
  the verified stamp rather than the body. A brief would be a third field on the same route, with
  the same rule.
- **The client calls it now.** `updateMyRosterEntry` in
  [engagementAPI.ts](../../src/utils/engagementAPI.ts) was written and unused until
  [RosterPanel](../../src/components/RosterPanel.tsx) reached it. The optional `role` on
  `createEngagement` is still unused.
- **Roles are declared through a surface, and counted through the roster rather than the
  stamp.** `newEngagement` still stamps the creator `Facilitator` and `ensureMember` still
  stamps everyone else `Contributor` ([shape.ts](../../server/store/shape.ts)) — those remain
  the defaults — but they are now defaults somebody can replace, and `roleOf` in
  [roster.ts](../../src/utils/roster.ts) resolves a fragment's role through the current roster,
  so a role declared mid-session applies to what that person already wrote. The `voices` count
  in [coverage.ts](../../server/ai/coverage.ts) was capped at 2 in a room of any size and is
  not any more. Where nobody has declared, the coverage map and the status board say so rather
  than printing the number as though it meant something.
- **Storage takes it for free.** `upsertRosterEntry` writes a whole `AuthorStamp`, and the
  Firestore implementation writes it at `FieldPath("roster", email)`, so a field added to
  `AuthorStamp` needs no store change and no migration — an old roster entry simply has no brief.
- **The pile's confidentiality rule already covers it.** `renderCorpus` labels fragments by role
  and never by name, deliberately, so that model-authored characterisations of named individuals
  stay out of a circulated document. A brief is written in the first person about a named person,
  so it is exactly the input that rule exists to constrain — see the open questions.
- **The surface exists, and it is where the brief would go.** `RosterPanel` lists the members
  and gives each person an editable card for their own name and role. This intent's remaining
  work is the brief itself — a third field on that card, a prompt decision, and the question of
  whether history is kept — rather than the member list, which was most of the work and is
  built.

## What would have to change

- **A `brief` field on `AuthorStamp`** in [types.ts](../../src/types.ts), optional, capped like
  the others by `str()` in the route — long enough for three sentences, short enough that nobody
  pastes a CV into it. It rides the roster to every viewer with the ordinary poll, as `coverage`
  already does.
- ~~**A roster surface**, which does not exist.~~ Built — see above. What remains is the brief
  field on the card that now exists.
- **A decision about the prompt.** The briefs go into the level set as a preamble — _who is in
  the room and what each role means here_ — before the corpus rather than beside each fragment,
  so the prompt cost is one block per engagement instead of one per fragment. That is a change
  to [levelSetPrompt.ts](../../server/ai/levelSetPrompt.ts) and to nothing else, because prompts
  are pure functions there.
- **Nothing in solo mode.** A brief describes your position relative to other people. Alone,
  there is no other position, and `AuthorStamp` is absent from solo fragments by design.

## Open questions

- **Does the brief cross the model boundary as written, or role-anonymised?** The pile is
  role-labelled specifically so the model never characterises a named individual. A brief is a
  named person describing themselves — consented and first-person, which is different from being
  characterised, but it is still the one place named humans would enter a prompt. The cheap
  answer is to send briefs keyed by role and never by name, which preserves the existing rule
  exactly and costs nothing.
- **Is the drift kept?** Overwriting is one field; keeping the history is a small append-only
  list and the thing that makes "what changed about who owns what" answerable at all. The
  argument for versioning is the same one that made `LevelSet.version` worth having.
- **Are free-text roles allowed to inflate `voices`?** If everyone types their own job title,
  eight people produce eight roles, every area with two fragments has "2 voices", and `defined`
  gets easier to reach as the room gets larger. Either the label stays a bounded set chosen from
  a list (and the brief carries the specificity), or the thresholds in
  [coverage.ts](../../server/ai/coverage.ts) stop being absolute. This is the question to settle
  first, because it is the one that can silently corrupt a number the deliverable presents as
  fact.
- **Who may read whose?** Self-service editing is already decided by the existing route. Whether
  the whole room sees each other's briefs is a different question, and the interesting answer is
  probably yes — a stakeholder reading what everyone else believes they own is most of the value,
  and it is what makes an overlap visible to the two people who have it rather than only to the
  consultant.
- **Does a stated boundary belong here at all?** "What I do not own" is arguably a second field
  with a different purpose: the brief is context for the model, a boundary is a claim the group
  can be shown and asked to ratify. Worth its own intent if it grows past a sentence.

## Non-goals

- **A profile, a directory, or anything that outlives the engagement.** The brief describes a
  person's position on this piece of work, and it should die with it.
- **Assessing people.** Nothing generated from a brief may characterise the person who wrote it.
  Overlaps and gaps are facts about the shape of the room; competence is not on the table, and
  the corpus rule about named individuals exists to keep it off.
- **Making it mandatory.** `ensureMember` auto-provisions a roster entry so that nobody is ever
  blocked from contributing, and a required brief would be the first thing in the app to break
  that. An engagement where two people wrote one is better than an engagement nobody entered.
