# 011 — The role brief: what a consultant learns in a thirty-minute 1:1

**Status:** intent, mostly built. Roles can be declared, grouped into the voices the coverage map
counts, and given a brief the level set reads. See [STATUS.md](STATUS.md).
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

All of the mechanics. What is left is judgement about what to do with briefs once people have
written them.

- **The route takes a brief.** `PUT /api/engagement/:id/roster/me` in
  [engagementRoutes.ts](../../server/engagementRoutes.ts) lets a participant set their own `name`,
  `role` and `brief` and nobody else's — the identity comes from the verified stamp rather than the
  body. A brief left out of a save is kept and an empty one clears it, because unlike a name or a
  role it is optional; it is capped at `BRIEF_MAX_LENGTH` (600) on both sides.
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
  in [coverage.ts](../../src/utils/coverage.ts) was capped at 2 in a room of any size and is
  not any more. Where nobody has declared, the coverage map and the status board say so rather
  than printing the number as though it meant something.
- **A voice is a group of labels, not a spelling.** [voices.ts](../../src/utils/voices.ts) folds
  case, spacing and width before anything is counted, and `Session.roleGroups` records what the
  room decided each label counts as — filed under another label, or kept separate — with who
  decided. Any member sets it through `PUT /api/engagement/:id/role-groups`; the roster panel
  suggests labels that share a word and gives every label a "counts as" choice for the ones no
  word gives away. Coverage, the board's `roles` tile and the corpus the model reads all resolve
  through it — the model sees `[Finance / Treasury]`, group first — and the coverage map recounts
  voices from the persisted fragment ids, so a regroup moves the numbers without a regenerate and
  the map says when the level set's prose is older than them. Nobody's words are rewritten: the
  label stays on the roster and on every fragment.
- **The brief is on the roster entry and never on a fragment.** It is a field of `RosterEntry` in
  [types.ts](../../src/types.ts), the roster's own type, not of `AuthorStamp` — because a stamp
  is copied onto every fragment when it is written, and a copied brief would sit on the pile
  saying whatever it said at the time. An entry is assignable to a stamp, so the type cannot hold
  that line; `stampOf` in the route picks the three fields, and a route test fails if a fragment
  ever carries a brief. `upsertRosterEntry` replaces the whole entry in both stores, so a brief
  needs no store method and no migration — an old entry simply has none — and the store contract
  proves that rewriting an entry without one drops it, against Firestore as well as the file.
- **The model reads briefs by role, never by name.** `roleBriefs` in
  [corpus.ts](../../server/ai/corpus.ts) renders one line per brief, labelled exactly as that
  role's fragments are — `[Finance / FP&A]` — so the model joins a brief to what the role said.
  [levelSetPrompt.ts](../../server/ai/levelSetPrompt.ts) puts them in one block ahead of the
  corpus, tells the model a brief is not a fragment (it counts towards no coverage and is no
  side of a conflict) and describes a position rather than a person, and leaves the block out
  entirely when nobody wrote one. A brief under a server default is left out, because against
  the corpus it would describe every `[Contributor]` fragment.
- **The room reads each other's.** `RosterPanel` gives the viewer a brief box under their role,
  says before they save that everyone can read it and the level set reads it under the role, and
  shows every member's brief read-only beneath their row.

## What would have to change

- **Nothing says when the level set is older than the briefs.** The coverage map says when a
  regroup moved its numbers after synthesis. A brief rewritten after synthesis changes who the
  deliverable should call best placed to answer, and nothing tells the room. Saying so needs a
  time on each brief, which overwriting does not keep.
- **Overlaps and gaps between briefs are left to the level set's prose.** Two briefs claiming
  the same territory is the day-one finding this file argues for. The model now reads both and
  may say so, but nothing in the app points at it. Pointing at it without a model would be a
  heuristic over free text — the inference [voices.ts](../../src/utils/voices.ts) refuses to
  make about roles — so which of those it should be is worth deciding before building either.
- **Nothing in solo mode.** A brief describes your position relative to other people. Alone,
  there is no other position, and `AuthorStamp` is absent from solo fragments by design.

## Open questions

- ~~**Does the brief cross the model boundary as written, or role-anonymised?**~~ **Resolved: as
  written, keyed by role.** The pile is role-labelled so the model never characterises a named
  individual, and a brief is the one place a named person describes themselves. Each brief enters
  the level set as a line under its role label and never a name, which keeps that rule exactly.
  The rule cannot stop somebody naming themselves inside their own brief; the prompt says a brief
  describes a position and not a person, the same instruction the corpus already relies on.
- ~~**Is the drift kept?**~~ **Resolved for now: overwritten.** One optional field that rides
  the roster was the smallest thing that put briefs in front of the model. History stays
  possible without a migration, since an entry with no list simply has none. The argument for it
  is unchanged: it is what would make "what changed about who owns what" answerable, for the same
  reason `LevelSet.version` is worth having.
- ~~**Are free-text roles allowed to inflate `voices`?**~~ **Resolved: free text stays, and the
  room reconciles it.** Neither option this file first listed survived. A bounded list throws
  away the specificity a role field exists to collect — "FP&A" and "Treasury" are both Finance
  and the split can matter. Relative thresholds make "defined" easier to reach as a room grows
  while still counting spellings. Instead: spelling is folded without asking anybody, and
  everything past spelling is a **named human decision** — grouped under another label, or kept
  separate — suggested where two labels share a word and never inferred. The limit is stated
  rather than hidden: shared words can see that "Finance lead" may be Finance, and cannot see
  that "FP&A" is, which is why every label also carries its own choice. Groups chain (a group is
  itself a label somebody may type) rather than forming a tree, which covers "all of that is
  Finance, but this function needs the split" without a hierarchy editor.
- **Who is the facilitator, and what is different for them?** The app has no such person. It is
  a default role string anyone can type, the Generate button is not restricted, `Session` does
  not record who created an engagement, and [planv1](../../planv1/level-set-plan-v2.md) calls
  `outputFilter` and `cognitiveBiasAudit` "facilitator-owned" and merging duplicates a facilitator
  act with nothing enforcing either. The owner sees **two or three tiers — facilitator,
  participant, view-only** — and between-session work (distilling, correcting, unifying) as the
  facilitator's. Decided for now, while the surfaces are still being developed: **everything is
  visible to everyone**, role grouping is marked as a facilitator task and open to all, and every
  grouping is named. Deciding the tiers properly means recording a creator or a facilitator list
  on the engagement, the app's first in-app permission — which cuts against "who can reach a
  deployment is entirely IAM" and the roster being attribution rather than authorisation — and a
  view-only tier needs a read path that does not auto-join. Worth its own intent if taken up.
- ~~**Who may read whose?**~~ **Resolved: everyone, read-only.** Editing is self-service by the
  route. Every brief is shown under its member's row, and the card says so before anybody saves.
  A stakeholder reading what everyone else believes they own is most of the value, and it is what
  makes an overlap visible to the two people who have it rather than only to the consultant.
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
