# Intent status log

What has actually landed against [the intents](README.md), newest first. One entry per
increment, with the reasoning that picked it — so the next person starts from a decision
rather than from the whole table again.

Nothing here schedules anything. An intent stays an intent until its file says otherwise;
this file only records which pieces of one have become code.

## Legend

| Marker        | Means                                                                |
| :------------ | :------------------------------------------------------------------- |
| **landed**    | In `main`, covered by a test, and the intent file has been corrected |
| **in part**   | A named slice landed; the intent itself is still open                |
| **unchanged** | No code yet                                                          |

## Where each intent stands

| #                                              | Intent                        | State                                                       |
| :--------------------------------------------- | :---------------------------- | :---------------------------------------------------------- |
| [001](001-mcp-server-over-the-pile.md)         | MCP server over the pile      | unchanged                                                   |
| [002](002-model-provider-seam.md)              | Provider-neutral model seam   | unchanged                                                   |
| [003](003-local-models-in-solo-mode.md)        | Local models in solo mode     | unchanged                                                   |
| [004](004-claude-and-the-gcp-model-gateway.md) | Claude as a deployment choice | unchanged                                                   |
| [005](005-listening-mode.md)                   | Listening mode                | unchanged — but its wall now exists                         |
| [006](006-local-assists-before-submit.md)      | Local assists before submit   | unchanged                                                   |
| [007](007-status-board.md)                     | Status board                  | **in part** — reported, and now drawn (below)               |
| [008](008-deploying-group-mode.md)             | Deploying group mode          | **in part** — three preparatory items; still never deployed |
| [009](009-the-deferred-group-surface.md)       | The deferred group surface    | **in part** — the coverage map is built                     |
| [010](010-model-armor.md)                      | Model Armor at the prompt     | unchanged                                                   |
| [011](011-the-role-brief.md)                   | The role brief                | **in part** — roles can be declared                         |

---

## 2026-09-10 — The pile filter was reading this app's own vocabulary as the user's

**Against no intent, and found while re-reading [006](006-local-assists-before-submit.md)
rather than by anyone using the app** — which is most of what is worth recording about it. 006
argues for a local model suggesting a tag on your own draft, and its sharpest supporting line
was that the thing it would upgrade is bad: the pile sidebar's category filter classified a
fragment containing _"socratic"_ or _"provocative"_ as a **fear**. That line was written on
2026-09-03 and was still true.

**Two defects, and the second was not in 006 at all.**

_The app's vocabulary had leaked into the user's._ `socratic` is a value of `promptingStyle` —
one of `standard | socratic | empathetic`, a Guided Drill tone knob — so a fragment about how
the interview should be run was filed as something the writer was frightened of. `provocative`
appears nowhere else in the codebase: vocabulary from a settings list that no longer exists.
And `challenge` was the same mistake one step removed, which nothing had noticed: Devil's
Advocate produces a field called `challenges` and `SwipeReact` flattens those into fragments,
so a mode's own output classified itself as fear. The rule that falls out is worth keeping —
**a cue has to be a word somebody would write about their subject, never a word this app uses
about itself.**

_And a substring is not a word._ `includes("aim")` matched _claim_. `includes("action")`
matched _satisfaction_ and, best of all, _inaction_ — so "my inaction is the real problem" was
an **action**. `includes("risk")` matched _brisk_ and _asterisk_; `includes("value")` matched
_devalue_; `includes("idea")` matched _ideal_. `includes("do ")` is the one that shows what the
technique costs in both directions at once: it matched _todo_ and _undo_ by accident while
missing "what to do", because a sentence-final "do" has no trailing space.

**Eleven cases were run against the old predicate to confirm each was really wrong**, rather
than trusted to reading — all eleven misclassified. They are the test file now.

**Precision improved and recall did not move.** The worry with a boundary fix is over-correcting
into a filter that matches nothing. Sixteen hand-labelled fragments of ordinary workshop English
were classified before and after: 16/16 both times, with the eleven false positives gone. Strictly
better rather than differently wrong, which is the only version of this worth shipping.

**It moved out of the component, and the chips moved with it.**
[pileCategories.ts](../../src/utils/pileCategories.ts) owns `PileCategory` and the cues;
`Workspace.tsx` keys `CATEGORY_CHIPS` off that type as a `Record`, the same shape `MODE_CARDS`
already uses, so a fifth category with no chip is a `npm run lint` failure — verified by adding
one. The `as any` on the chip click is gone with it. Both properties were mutation-checked: the
category tests fail on an incomplete cue list, and the render test fails if the chips are built
and not drawn, which is the exact way this pair drifted apart once before.

**What it did not do.** Not [006](006-local-assists-before-submit.md), and the honest effect on
it is to make its case narrower: the gap a local model would close is now "keywords are lexical"
rather than "keywords are wrong". 006 says so in its own words now, because an intent resting on
a defect that has been repaired is the kind of stale that argues for work nobody needs.

---

## 2026-09-09 — 011, in part: the roles the coverage map counts were never set by anybody

**Against [011](011-the-role-brief.md), and it is a defect rather than a feature.** 011 records
it in one line as the sharpest of its reasons, and it had been true in `main` the whole time:
`newEngagement` stamps the creator `Facilitator` and `ensureMember` stamps everyone else
`Contributor`, `updateMyRosterEntry` was written and **had no callers anywhere in the client**,
and no component in the app could reach a roster. So every role in every live engagement was one
of two constants — and `voices` in [coverage.ts](../../server/ai/coverage.ts) is a group-by over
role. **It could reach two in a room of twenty**, and that number is printed per area on the
coverage map a facilitator puts in front of a client. The arithmetic was right and its input was
a stub.

**Two halves, and the second is the one that was nearly missed.**

_Somewhere to declare a role._ [RosterPanel](../../src/components/RosterPanel.tsx) — who is in
the engagement, and an editable card for yourself. The server side needed nothing:
`PUT /roster/me` already took the identity from the verified stamp and ignored the body, so
self-service was decided before there was anything to serve. The panel says **what the role is
for** rather than just asking for one, because a role field with no stated purpose collects a job
title, and what the level set needs is what somebody _owns here_.

_And a fix for what was already written._ The first version stopped at the panel, and driving it
in a browser showed why that was not enough: Mei declared a role, the roster updated, and her
fragment in the pile still read `CONTRIBUTOR`. `AuthorStamp` is copied onto a fragment when it is
written, so declaring a role only ever corrected the count for fragments contributed **after**
the declaration — and in a real session people contribute first and fill the roster in when
somebody asks them to. Half the pile would have stayed miscounted, and wrong in the way that is
hardest to notice, because it moves.

So `roleOf(session, author)` in [roster.ts](../../src/utils/roster.ts) resolves through the
roster and falls back to the stamp, and the places that read a role now go through it: coverage's
`voices`, the board's `roles`, the pile's attribution label, and the corpus the model reads. The
stamp is left exactly as written — it is the audit record of who somebody was at 09:02 — while
every question the app actually asks is about the room as it is now. Declaring a role halfway
through a session repairs the first half.

**The honest half, for the rooms where nobody declares anything.** A surface people ignore fixes
nothing, so the numbers say when they are counting defaults rather than printing a plausible
figure: the coverage map's footer gains a second caveat beside the unplaced-fragments one, the
board's `roles` tile carries the `caveat` flag and reads "1 of 7 have declared one", and the
qualifier `one voice only` is **suppressed** rather than reworded on a stubbed roster — it is a
claim about how many people spoke, and with roles at their defaults it is a claim about how many
of two constants appear. Wrong in the direction that sounds most specific.

**Which way it errs, decided once.** `isDeclaredRole` treats somebody who types "Contributor"
back in as undeclared. It is indistinguishable from the server having set it and there is no
marker to tell them apart; understating by one is harmless, where the reverse is the app
asserting that a person described themselves when nobody touched the field. The same instinct put
`rolesDeclared` at `null` rather than a zeroed pair in solo mode: absent is a different claim from
"nobody declared", and only one of them warrants a caveat.

**One definition of the two constants.** They moved to [types.ts](../../src/types.ts) with
`shape.ts` re-exporting them, because the client now compares against those exact strings — two
copies would mean a rename silently reclassifying every roster entry as declared, with the caveat
quietly disappearing. A test imports them rather than writing them out, for the same reason.

**Driven, not just rendered.** Four people, a mixed roster, both themes: opened the panel, typed a
role, clicked save, watched the header go 1/4 to 2/4 and the pile's label change retroactively,
and confirmed the write server-side. The stamp-versus-roster defect above was found that way and
by nothing else — the tests were green across it.

**What it deliberately did not do.** Not 011. There is no `brief` field, no history of what a role
used to be, and no change to `levelSetPrompt.ts` beyond the corpus now carrying current roles: the
brief is a paragraph and a prompt decision, and this is the field that already existed finally
having somewhere to be set. 011's row is narrower, not closed.

---

## 2026-09-08 — 008, in part: the one cost that scales with use is now counted

**Against [008](008-deploying-group-mode.md), and it closes an open question in it.** 008 asks:
_"Should synthesis carry a per-engagement run counter, so a pile cannot be re-synthesised fifty
times without anyone noticing?"_ Yes. `levelSetRuns` on the engagement, incremented where a level
set is persisted, drawn on [007](007-status-board.md)'s board.

**Why this one, out of everything 008 lists.** Almost all of the cost work was already done, and
done in the right order — Cloud Run scales to zero, `--max-instances=3` bounds a runaway,
`cost-guardrails.sh` sets a budget with alerts, `audit-costs.sh` takes a baseline. What none of
those can do is say _why_ a bill moved, because all four live outside the app. And 008's own
arithmetic shows exactly one line that is not bounded by design: an idle poll is two Firestore
reads, an idle instance is nothing, but synthesis is two Gemini calls over the **whole pile**,
every time, and "nothing prevents one person re-running it repeatedly against a pile that keeps
growing". The existing brake is ten POSTs per fifteen minutes per identity — held in memory, per
instance, so it resets on every cold start and the real ceiling is three times it. Over a working
day that is not a bound; it is a speed limit. Nothing anywhere counted the total.

**It counts and deliberately does not cap.** Three brakes, and they are different tools: the
budget alerts, the Vertex quota is the hard stop, and this is the inside view that makes what
they are guarding legible without any setup at all. A cap would mean refusing a facilitator
mid-workshop to save a few cents of tokens, which is the wrong trade in the room this app is for
— and it is not answerable before a real workshop has run, which is the number 008 says cannot be
estimated from the code. So the counter is the honest half that can be built now, and 008 records
the cap as still open rather than pretending it was decided.

**Two decisions, both about not overstating.**

_It counts runs, not callers, and that is structural rather than asserted._ The increment lives
inside the single `run` promise in `synthesizeEngagement`, so ten people opening the review panel
join one run and see one increment. Counting callers would have reported ten runs for one pair of
Gemini calls — an overstatement, on the one number added specifically to be trusted.
[test/synthesis.test.mjs](../../test/synthesis.test.mjs) says why that property has no test of its
own: it cannot be reached without a key, and it follows from where the line sits rather than from
a check.

_It is a floor on spend, not a bill, and the board says so._ A run that failed part-way may still
have spent tokens and is not counted, so the tile carries the `caveat` flag 007 already had for
"the number means something narrower than its label suggests". The suite asserts the wording never
grows into a currency figure. What **is** tested is the case that matters here: with no key
configured, synthesis fails before reaching the model, spends nothing, and the counter stays at
zero — a number that ticked there would be measuring clicks.

**Server-written, and gated twice.** `levelSetRuns` is in `ServerMetaPatch` and not in
`SessionMetaPatch`, so it is outside the route layer's `META_FIELDS` by construction — the same
two-exclusions-are-one-decision shape `coverage` already has, for a sharper reason: a client that
could set this could set it back to zero, which defeats the entire point of counting.
[test/sharedPile.test.mjs](../../test/sharedPile.test.mjs) pins it against a real PATCH.

**On by default, unlike every other optional stat.** `modes`, `recent`, `roles`, `dark` and `age`
all default off. This one defaults on, because the blind spot _is_ the feature: a cost tile nobody
turns on rebuilds the thing it was added to close.

**Looked at, in both themes.** The tile was rendered against the built stylesheet and screenshotted
light and dark before commit, rather than trusted to a string assertion — see the correction in the
increment below for why that is now the habit.

**What it did not do.** No cap, no per-run history, no "who ran it" — `generatedBy` exists on the
`LevelSet` and is deliberately not mirrored, because a count answers "is this runaway" and a
leaderboard answers a question nobody asked. Not deployed; 008's table row is narrower, not gone.

---

## 2026-09-08 — The twenty-one dead classes, which were never a guess

**Against no intent, and it is the finding the increment below recorded rather than fixed.** The
dark-mode entry ends with one: twenty-one classes across the components name Tailwind steps that
have never existed — `zinc-650`, `slate-205`, `red-650`, `indigo-505` and the rest. A class naming
a step Tailwind never shipped emits no CSS at all, so the element falls through to whatever is
behind it. Fifty-five call sites, in fifteen components.

**Why it was left, and why that reason turned out not to hold.** It was recorded rather than fixed
because "fixing one means guessing which step was meant", and a guess is not worth putting in front
of the twelve modes. But the twenty-one are not twenty-one independent guesses: every one of them is
a real step with a trailing zero typed as a **5**. `650` is `600`, `205` is `200`, `755` is `700`.
That account is exceptionless over all twenty-one, and it is the only rule that is — nearest-step
rounding leaves `450`, `750` and `150` as ties it cannot break.

**It is a derivation because the siblings testify, not because the rule is tidy.** Wherever the
markup contains an element that could contradict it, the element agrees:

- `bg-emerald-550/10` sits in the same class string as `border-t-emerald-500`, beside a third zone
  that spells the same idea `bg-slate-200/50`. The tint and its border are one colour.
- `bg-violet-650 hover:bg-violet-700` and `bg-red-500 hover:bg-red-650` are base/hover pairs, and a
  hover has to be the darker one. Only `600` puts them in order; `700` collapses the first pair and
  `800` overshoots the second.
- `focus:ring-indigo-550/10 focus:border-indigo-500` — a focus ring and its border are one colour.
- `border-slate-150` is on a card whose own container says `border-slate-100`, and `text-slate-705`
  on a paragraph whose sibling in the same list says `text-slate-700`.
- Three tip cards in [CompareSettingsModal](../../src/components/CompareSettingsModal.tsx) are
  copies of each other; one note block was written `text-zinc-600` and the other two `text-zinc-650`.

So the rule was checked against the markup rather than applied to it, and nothing in fifteen files
dissents.

**What landed.** The fifty-five corrections, and the test that pinned the list is now the assertion
that the list is empty. [test/theme.test.ts](../../test/theme.test.ts) asserted only that the set of
dead classes _did not grow_ — which is what let twenty-one of them sit in the tree — and now fails on
any dead class at all. The stale count in [CLAUDE.md](../../CLAUDE.md)'s health block was corrected in
passing: it said 154 tests, and `npm run check` has been ending at 182 since the two increments below.

**Dark mode is why this was safe to do at all.** Every hue involved already has a full mirrored ramp
in [src/index.css](../../src/index.css), so a corrected class is themed by construction — and the
theme suite's "every hue the components use has a dark ramp" assertion is what proves it, since it
skips dead steps and therefore saw all fifty-five of these for the first time. Doing this before the
theme would have meant twenty-one new daylight patches.

**What it is not.** Not a redesign. The rule reproduces what was typed, including where what was
typed was mildly inconsistent — the same tip-card paragraph is `zinc-600` in one card set and
`zinc-700` in another, and both stay. Widening this into "pick better tones" is a different change
with a different justification, and it would have buried the one being made here.

**A near-miss, recorded because the habit it changed is the useful part.** Proving the new
assertion fails meant reintroducing a dead class into QuickFire and reverting it with
`git checkout` — which, run before the commit existed, reverted the file to `main` and silently
undid all six of that file's real corrections. `npm run check` had been run _before_ that
experiment and not after, so the first version of this commit shipped three dead classes and a
green report of a state nobody had tested. Caught by the next increment's own `check` run, and
amended. The rule it cost: the verification loop runs against the tree that is actually being
committed, and a `git checkout` on an uncommitted file discards work rather than an experiment.
This is also why the level-set tile in the increment above was screenshotted rather than trusted
to its passing string assertion.

**Verified by build, not by eye.** The emitted stylesheet now carries `.text-zinc-600`,
`.bg-emerald-500\/10`, `.focus\:ring-indigo-500\/10:focus` and the rest, and contains no dead step
anywhere — which is the defect restated as an observation. Nobody has looked at the fifteen
components in a browser, and the caveat [009](009-the-deferred-group-surface.md) shipped with applies
unchanged: the claim is that fifty-five elements now take a colour, not that fifty-five elements look
right.

---

## 2026-09-05 — Dark mode, as one file rather than thirteen hundred variants

**Against no intent, and asked for directly.** The app had no dark mode of any kind: no
`prefers-color-scheme`, no `color-scheme`, nothing. It answered a system set to dark with a
full-brightness white page.

**The shape of the problem, before the shape of the fix.** There are roughly thirteen hundred
colour utilities across twenty components, so the obvious approach — a `dark:` variant beside
each — means editing all of them, and editing all of them again for every colour anyone adds
after. It also puts the theme in twenty files, where half of it will be forgotten.

**What made a better one available.** Tailwind v4 compiles every palette utility to a custom
property: `bg-white` emits `background-color: var(--color-white)`. Redefining those properties
under one selector re-themes everything that uses them. So the entire theme is a block in
[src/index.css](../../src/index.css) and **no component contains a `dark:` variant** — or knows
a theme exists at all.

**The inversion is a decision, not an algorithm.** Neo-Brutalism is ink on paper: flat fill,
heavy border, hard shadow. Dark mode does not soften any of that — it swaps which one is ink.
`--color-black` becomes a warm off-white and `--color-white` becomes a raised surface, so every
`border-black`, `text-black`, `bg-white` and `shadow-hard-*` follows, and `bg-black text-white`
inverts with them and stays the loudest thing on screen — which CoverageMap's dark cell and the
Chorus isolation card both depend on.

**What landed.**

- [src/index.css](../../src/index.css) — the palette named (`paper`, `butter`, `peach`,
  `signal-green`…), the hard shadow as `--shadow-hard-*` resolving `--color-black`, and the dark
  block: ink and paper, the pastels as tinted darks, the signals deep enough to take light ink,
  and the neutral and hue ramps mirrored around step 500.
- [src/utils/themePrefs.ts](../../src/utils/themePrefs.ts) — `system | light | dark`, per viewer
  in `localStorage`, alongside boardPrefs and chorusPrefs and for the same reason. The stored
  value is the _choice_: storing the resolved colour is how an app stops following the setting
  it was asked to follow.
- The control beside the instance-status button in [App.tsx](../../src/App.tsx), so it is
  reachable from the dashboard, the workspace and the export panel without being added to three
  headers.
- A pre-paint script in [index.html](../../index.html), so a viewer on dark mode never gets a
  white frame while the bundle loads.
- ~100 arbitrary values and 87 longhand hard shadows converted to tokens; StatusBoard's swatch
  colours moved from JS hex constants to `var(--color-*)`, since no stylesheet can reach those
  either.
- 11 tests.

**Only `[data-theme]`, never `prefers-color-scheme`, in the CSS.** The app resolves "system"
itself and always writes a concrete value to the attribute. That keeps the dark block from
having to exist twice — once for the attribute and once inside a media query — which is the
usual way a theme drifts out of step with itself. The cost is that the resolution exists twice
in _code_ instead, once in `themePrefs.ts` and once inline in `index.html`; the test holds the
two together on the storage key.

**The hue ramps are generated, not chosen.** Mirroring step 50 onto 950 and so on, from
Tailwind's own `theme.css`, keeps every pairing the app already relies on: a tint used as a
soft card becomes a deep one, accent text moves up the ramp and stays legible, and a filled
button (`bg-indigo-600 text-white`) becomes a light fill with dark type rather than white type
on a mid tone. That last case is where picking dark values by eye goes wrong, and it did — the
first pass remapped only the app's own tokens, and the mode-count badges came out as light ink
on bright yellow.

**A finding, recorded rather than fixed.** Twenty-one classes in the app name Tailwind steps
that have never existed — `zinc-650`, `slate-205`, `red-650`, `indigo-505` and others — so they
emit no CSS and the element falls through to whatever is behind it. Pre-existing, unrelated to
the theme, and not fixed here because fixing one means guessing which step was meant.
[test/theme.test.ts](../../test/theme.test.ts) pins the list so it cannot grow. (Fixed on
2026-09-08, above: the guess was avoidable — all twenty-one are one corruption.)

**One deliberate pixel change.** `#FFFDE0` and `#FFFEE0` were both in the tree, one green value
apart, and are now the single `cream` token.

---

## 2026-09-05 — Chorus: the second silence

**Against no intent, which is why it is written down here at all.** Nothing in the table above
proposed this, and a reader of these files a year from now would otherwise find a feature in
`main` with no record of what it was for. The nearest neighbours are all near misses:
[006](006-local-assists-before-submit.md) works on a draft _before_ it is submitted and this
deliberately waits until after; [005](005-listening-mode.md) wants a model-free classifier over
the ten coverage areas and this classifies nothing; [009](009-the-deferred-group-surface.md)
catalogued comments and +1s, which change what the pile _is_, and this changes nothing about
the pile at all.

**The finding it exists for.** `server/ai/coverage.ts` answers _which areas has nobody spoken
into_, and it is the best idea in the app. It cannot answer _which things did only one person
say_ — and those are different silences. An area can hold twelve fragments from three roles and
have every one of them be a lone voice nobody else ever touched, and that engagement reads green
on the coverage map. Nothing in the codebase computed the second number.

**What landed.**

- [src/utils/chorus.ts](../../src/utils/chorus.ts) — the arithmetic. An index over the pile
  (stems, adjacent pairs, posting lists, the topic's own words excluded because everyone is
  using them), `echoFor` for one fragment's neighbours, `tally` for the whole pile's lone
  voices. Deterministic end to end, every tie broken on the text.
- [src/components/ChorusCard.tsx](../../src/components/ChorusCard.tsx) — what the pile answers,
  in two states, the second of which is the reason for the feature.
- [src/utils/chorusPrefs.ts](../../src/utils/chorusPrefs.ts) — one boolean, per viewer, in
  `localStorage`, for the reason `sanitizeMetaPatch` already strips `promptingStyle` out of
  shared settings: what one person is shown while they think is theirs.
- The lone-voice filter in [Workspace.tsx](../../src/components/Workspace.tsx), so the finding
  is available to a facilitator and not only to whoever happened to be typing.
- 30 tests across three files.

**No model, and that is the decision rather than a fallback.** It fires on every fragment from
every participant, so a route here would be the highest-volume AI call in the app by a wide
margin — past synthesis, which is single-flight per engagement and rate-limited to ten per
window because it is expensive. And the only thing a model would contribute is the phrasing,
which is the one part that must not editorialise. So there is no route, no prompt module and no
`sendFallback`, because there is nothing to fall back from: the feature is identical on a
deployment with Gemini unconfigured. `docs/half-life-test.md` is the relevant instinct — this is
the coverage discipline applied to a second axis.

**After the fragment, never during it.** The card appears only once a contribution is committed.
Shown while somebody is typing it would be an anchoring machine, and the independence of what
each person writes is the entire reason a shared pile is worth having. That ordering is a
property of the design, not a mitigation, and it is what makes on-by-default defensible against
the interference objection [005](005-listening-mode.md) would fairly raise.

**Two defects it shipped with, both found by driving the real app rather than the tests.** The
card rendered correctly into a scrollable pane and landed above its top, so the person it was
computed for never saw it. And turning the feature off while the lone filter was active emptied
the sidebar, because the chips and the filter resolved the vanished category in two different
places. Both are covered now by
[test/workspaceChorus.test.ts](../../test/workspaceChorus.test.ts), which exists because the two
suites either side of it — the arithmetic and the wording — were both green throughout.

**What it deliberately is not.** It matches words, not meaning, so two people saying the same
thing differently are two lone voices; the card prints that limit in both states rather than
implying a comprehension it does not have. It makes no claim that anybody agrees or disagrees —
that is the contradiction detection that was considered and rejected, because a false positive
manufactures a conflict between two named roles in front of a client, and unlike a count of
zero there is no arithmetic underneath it to keep it honest.

---

## 2026-09-05 — 007, in part: the board is drawn

**What landed.** The half of 007 that was still a rendering job:

- [src/components/StatusBoard.tsx](../../src/components/StatusBoard.tsx) — the board. Four
  boxes (identity, storage, model, and MCP, which is grey and says so), the branch each seam
  took beside the branches it did not, and the coral line stating the class of failure it
  cannot see. Two variants from one component: a board you go to look at, and a popup that
  sits over the workspace.
- [src/utils/engagementStats.ts](../../src/utils/engagementStats.ts) — the counts a room can
  be told about itself, as arithmetic over the `Session` the workspace already polls.
- [server/pollWindow.ts](../../server/pollWindow.ts) — a rolling count of polls per
  engagement, handed over on `X-Extraction-Polling` from
  [engagementRoutes.ts](../../server/engagementRoutes.ts).
- [src/utils/boardPrefs.ts](../../src/utils/boardPrefs.ts) — which boxes and counts to show,
  one object for both views, in `localStorage`.
- `InstanceStatus` moved to [src/types.ts](../../src/types.ts) (re-exported from
  [status.ts](../../server/status.ts)) for the reason `AreaCoverage` did: a client component
  now draws it. The server still assigns its own union types into that shape, so a new branch
  on any seam nobody declared is a compile error rather than a cell the board cannot render.
- 30 tests across three files.

**The audience question is answered, and narrowly.** 007 said audience was the only thing
blocking this, and the answer is: **the participant-safe view only.** Everything drawn comes
from `/healthz`, which is already guarded by [test/status.test.ts](../../test/status.test.ts)
against project ids, audiences, model ids and store paths. No new authenticated route, and so
no operator view — that stays open, and is cheaper to add later than to unpick if it turned
out nobody wanted it. The two smaller questions went the same conservative way: an overlay
rather than a route, and a boot-time snapshot rather than a poll, because nothing in that
payload can change without a restart.

**The stats forced the audience line to be drawn twice.** Instance facts are unauthenticated;
engagement counts are not, and they are also not the instance's business. So they arrive by a
different path entirely — tallied in the browser from the pile it already polls, never through
`/healthz`. Seven of the eight cost nothing: roster, voices, roles, fragments, last-5-min,
modes used and dark areas are all arithmetic over a `Session` the client is already holding.

**The eighth is the only new thing the server learned to do, and it is deliberately small.**
"Polling now" counts _requests_ in a 60-second window, not people. Keying that map on the
identity the poll already carries would have cost the same code and made a presence claim the
data cannot support, so it counts requests and the tile says "two tabs, two counts". It is in
memory and per instance, because persisting it would mean a store write per poll — exactly
what the 304 path in `engagementRoutes.ts` was written to avoid. It rides a response header
rather than the body, because almost every poll _is_ a 304: a count that only moved when the
pile moved would sit still in exactly the quiet room it exists to describe.

**Two bugs the tests could not have found, both caught by opening a browser.** The
[009](009-the-deferred-group-surface.md) increment below shipped a component that had never
been looked at, and said so; this one was looked at. The popup's heading broke into four lines
of one word each, because at 380px the badge and three buttons left the title a ten-character
column. And the model card drew three chain slots beside the words "2 deep" — the board
overstating what the server had told it, which is the one thing it exists not to do. Both are
now fixed, and the chain has a test that counts the slots.

**What it deliberately did not do.** No operator view, and no `/api/status` — see above. The
board does **not** show "last response: model or fallback", which the design had: `source` is
a per-response header read by whichever mode component made the call, so surfacing it means
threading that through every mode's fetch, and that is a change to nine call sites rather than
a rendering job. The AI-unavailable banner is untouched, as 007 asks — that warning is in the
way on purpose; this is somewhere you go to look.

**Next, if picking up here.** The MCP box is drawn and grey, which makes
[001](001-mcp-server-over-the-pile.md) the intent with a visible hole waiting for it. If the
"last response" line is wanted, the honest version is a small shared store for the last
`X-Extraction-AI-Source` seen, written where responses are read rather than where they are
rendered.

---

## 2026-09-03 — 008, in part: the production store has now run

008 is the one intent that is not code, and it is the floor under everything else: group mode
has only ever run on a laptop, so `FirestoreEngagementStore`, IAP verification and Vertex had
never executed once. The deploy is not mine to do. Two of the things that make it less likely to
go badly are.

**The store contract now runs against Firestore.**
[test/storeContract.test.ts](../../test/storeContract.test.ts) states the `EngagementStore`
contract once and runs it against both implementations — `FileEngagementStore` always, and
`FirestoreEngagementStore` when `FIRESTORE_EMULATOR_HOST` is set (`npm run test:firestore`, 87
tests, nothing skipped). Ten behaviours, and the two stores agree on all of them, including two
that only one of them could ever have got wrong: a roster keyed by an email address, which
Firestore reads as a dotted field path unless it is wrapped in a `FieldPath`, and ten
simultaneous contributions, where the file store rewrites one array and the production store
writes a subcollection.

The contract was prose on the interface before this — "implementations must treat thoughts as an
independently addressable collection", "must serve `getVersion` in O(1) reads" — and prose is not
a test. What made this worth doing rather than deferring to the deploy is that the emulator runs
the real client and the real query, batch, aggregation and `FieldPath` semantics, which is
precisely where two implementations of one interface diverge. What it cannot tell you: whether
ADC resolves, whether the runtime service account holds the roles, or whether
[firestore.rules](../../firestore.rules) denies what it means to. So 008's table row is narrower
now, not gone, and the file says so.

**The audience is checked before a request depends on it.** 008 named the IAP audience as the
plausible first-deploy failure, and the reason it is nasty is that it presents as a 401 from
every route with nothing in the response to explain it. It is _computed_ by deploy.sh from a
`gcloud projects describe` lookup, so the way it goes wrong is a failed substitution:
`/projects//locations/...` deploys perfectly happily and then refuses everyone.
[authMode.ts](../../server/authMode.ts) now exits on an audience that cannot work and says which
substitution to check; [deploy.sh](../../scripts/deploy.sh) refuses to deploy when the project
number did not resolve at all.

Where the fatal line sits is the only interesting decision here, and it moved once during
review. Exiting the process buys _diagnosis_, not safety: a wrong audience rejects every
assertion, which is broken but not permissive, and `iapAuth` already logs the expected value on
each rejection. So the only fatal case is one that cannot be anything but a bug — an empty path
segment, which no audience has. Everything else unrecognised warns and boots, because whether a
string is a valid audience is a claim about IAP's product surface rather than about this
deployment, and a list going stale in that file should not be able to take down a service that
was working. The first version refused to start on anything outside three known formats, which
was failing closed on an assumption about somebody else's deployment.

**And the fail-closed resolution finally has tests.** `resolveAuthConfig` is the function whose
failure is the feature — an earlier design would have turned a deployment into an anonymous
free-for-all on one missing variable — and CLAUDE.md asks for that behaviour to be preserved,
but nothing enforced it. A refactor softening a `fatal()` into a warning would have passed the
whole suite. [test/authMode.test.ts](../../test/authMode.test.ts) replaces `process.exit` with a
throw and asserts on each refusal, including the original bug in one line: an unset `AUTH_MODE`
under `NODE_ENV=production` must never resolve to dev.

**A documentation correction that mattered.** `/healthz` changed shape in the 007 increment
below, which made [DEPLOYMENT.md](../../DEPLOYMENT.md)'s verification ladder quote a response the
server no longer sends. Corrected, and the ladder is stronger for it: it now reads
`storage.backend`, where `file` on a deployment means `FIRESTORE_PROJECT_ID` never reached the
service and the shared pile is being written to a container disk that will vanish with the
instance. That is the most expensive misconfiguration this app can have and it is invisible from
inside the app.

**What this did not do.** Not deployed. Nothing here has spent a token or created a resource.
The route layer's rules — attribution, author-only edits, the 304 — are still exercised only
over the file store; it is the store contract that is now proven of both, not the routes above
it. And an emulator is not the service.

**Next, if picking up here.** The deploy itself, in 008's own order: guardrails, then the Vertex
quota ceiling, then a deploy with `GENAI_BACKEND` unset to prove IAP, Firestore and the container
without spending anything.

---

## 2026-09-03 — 009, in part: the coverage map is drawn

**What landed.** The map of what a room has _not_ discussed, which was computed, shaped, shipped
across the wire and never rendered:

- [src/components/CoverageMap.tsx](../../src/components/CoverageMap.tsx) — the wall. Black cells
  for dark areas, golden for partial, emerald for defined; fragment and voice counts per area.
- [src/components/ExportPanel.tsx](../../src/components/ExportPanel.tsx) — renders it above the
  group deliverable, and includes it in the copied markdown, so a facilitator's copy no longer
  presents the outline as though the pile had covered everything.
- [server/ai/synthesis.ts](../../server/ai/synthesis.ts) — mirrors `coverage` onto the session
  alongside `synthesized*`.
- `AreaCoverage` moved to [src/types.ts](../../src/types.ts) (re-exported from
  [coverage.ts](../../server/ai/coverage.ts)) since it now crosses the wire in both directions,
  and `ServerMetaPatch` in [store/types.ts](../../server/store/types.ts) keeps it server-written.
- Six render tests and one write-gate test.

**Two things the intent had not anticipated, and they are the substance of the increment.**

_The value crossed the wire to one person only._ 009 called this "a rendering job over a value
that already crosses the wire", and the value does — in the synthesize response, to whoever
clicked Generate. Rendered from there alone, the map would have existed for one participant
until they reloaded, which is no use for something a room is meant to watch. Mirroring it onto
the session puts it in the ordinary poll, so every viewer gets it for no new endpoint.

_A zero only means silence if every fragment was placed._ The arithmetic guarantees an area with
no fragments reports zero — that is why it is not a model call. But the _input_ is a model call,
and the classifier can return fewer assignments than there are fragments, or area names matching
none of the ten. Those fragments are then in the pile and in no cell, and a dark area reads as
unspoken when it is only unplaced. So the map states how much of the pile it actually placed.
Without that line the map's most valuable claim is unfalsifiable.

**What it deliberately did not do.** No live coverage — a rendered wall is not a live one, and
[005](005-listening-mode.md) still needs a non-model classifier for that. No drill-down into an
area's fragments, though `fragmentIds` is persisted and would support one. Coverage is not on
`/healthz` or [007](007-status-board.md)'s board: it belongs to the engagement, which is now
settled rather than open in both files.

**What it cost elsewhere.** `coverage` is deliberately absent from the route layer's
`META_FIELDS` and from `SessionMetaPatch`, so the store interface grew a second patch type for
what the server may write. That is the same decision the arithmetic already embodies — the one
count nobody should be able to argue with — expressed in the type system.

**Caveat worth stating plainly.** The component is verified by rendering it to a string and
asserting its claims; it has not been looked at in a browser, and no group level set has ever
been generated outside a laptop (see [008](008-deploying-group-mode.md)). The wording and the
arithmetic are tested. The layout is not.

**Next, if picking up here.** 007's board is the remaining unbuilt half of a now-cheap intent
and needs only its audience decision. 005's live coverage is the more interesting one and is now
purely a classification problem.

---

## 2026-09-03 — 007, in part: every seam reports its choice

**What landed.** Each of the three seams can now be _asked_ which branch it took, and one
shape collects the answers:

- [server/ai/client.ts](../../server/ai/client.ts) — `geminiBackend()` returns
  `vertex` / `apikey` / `none`, recorded where the client is actually built rather than
  re-derived from the environment afterwards. `modelChain()` is exported so its length can be
  reported without its ids.
- [server/store/index.ts](../../server/store/index.ts) — `storeBackend()` returns
  `firestore` / `file`, and `storeIsLive()` answers the separate question of whether that
  branch has been taken in this process at all.
- [server/status.ts](../../server/status.ts) — `instanceStatus()` assembles identity, storage
  and model into one value, now served by `/healthz`.
- `/api/whoami` derives `aiEnabled` from that same value instead of computing its own.
- [test/status.test.ts](../../test/status.test.ts) — five tests. Four are about the shape; the
  first is the one that matters, and it asserts that no project id, IAP audience, model id or
  store path appears anywhere in a payload served unauthenticated.

**Why this slice, and why first.** [The ordering note](README.md#in-what-order-if-they-were-built)
splits 007 in half and sends this half early: the board wants the full state space and belongs
at the end, but "each seam reports its choice rather than logging it" only gets more expensive
the longer it waits, because 002/003/004 add providers and every new one is another scattered
fact to go back for. It is also the smallest thing on the list that is unambiguously not a
rewrite risk — no seam moved, nothing was abstracted, three functions were added.

**What it deliberately did not do.** No `/api/status`, no board, no UI. 007's open question is
_audience_ — an operator view and a participant view are different boards with different
authorization — and building the endpoint would have answered it by accident. The reporting
half has no such question in it, which is exactly why it could go first.

**What this buys the next increment.** `/healthz` is now a shape rather than a boolean, so the
board is a rendering job over a value that already crosses the wire — the same position
[009](009-the-deferred-group-surface.md) describes the coverage map being in.

**Next, if picking up here.** Either half of 007 is now cheap; the board still needs its
audience decision made first. The other candidate with no decisions blocking it is 009's
coverage map: computed in [coverage.ts](../../server/ai/coverage.ts), returned on the
`LevelSet`, and the string `coverage` still appears nowhere in [src/](../../src/).

**Still true, and worth repeating.** [008](008-deploying-group-mode.md) comes before all of it.
Firestore, IAP verification and Vertex have not executed once outside a laptop, and
`storage.live: false` in the new payload is that fact stated in the shape rather than in prose.
