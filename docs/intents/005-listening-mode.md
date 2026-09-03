# 005 — Listening mode: a kickoff with no model

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03

## What

An explicit, chosen state in which the app takes input and gives nothing back. No generated
prompts, no adaptive questions, no synthesis until someone asks for it. A facilitator opens a
session in listening mode and the room writes into it while being briefed.

The technical condition is the one the app already enters when no model is configured. The
difference is entirely one of intent — and therefore of what the UI says about it.

## Why

**The most perishable content in an engagement has nowhere to go.** Stakeholders are being told
what the task is and what the tools are, and they are forming reactions to it at the same time.
Those reactions — the objection someone doesn't voice, the assumption someone realises nobody
has checked, the thing they were already worried about before the meeting — are exactly what a
level set is for. Today they have nowhere to land until somebody picks a mode and the intake
flow finishes, by which point the moment is gone.

**Model feedback during a brain dump is interference, not help.** The Guided Drill is built to
interrupt productively: it traces threads, refuses to praise, pushes back. That is the right
design for a drill and the wrong one for a firehose. Listening mode is not a degraded drill; it
is the opposite design goal, and it deserves to be named rather than approximated by turning
things off.

**It converts a failure state into a feature.** Right now the app has one way to be modelless:
a coral warning banner reading _"AI is unavailable… check the Gemini configuration before
running a session that matters."_ That message is correct for an accident and actively wrong
for a deliberate choice. Making the state nameable is most of the work.

**It is cheap.** Of the seven intents on this list, this is the one where the code is already
almost entirely there.

## What the code already supports

Nearly all of it:

- **Free Stream and Quick Fire already work with no model whatsoever.** Free Stream's only
  model-adjacent behaviour is a nudge after ten idle seconds, and its prompts are a local
  static list. Quick Fire falls back to a fixed prompt set. Both are usable today with nothing
  configured.
- **`aiEnabled` state and the degradation banner already exist** and are already wired from
  `/healthz` through `App.tsx` to `Workspace.tsx`. The plumbing for "the app knows it is not
  using a model" is done.
- **Fallbacks are labelled.** After the `source` / `X-Extraction-AI-Source` work, "no model
  answered" is machine-distinguishable from "a model answered" on every response — so
  listening mode can be verified rather than assumed.
- **Group mode already handles many concurrent writers into one pile**, with server-side
  attribution. A room dumping simultaneously is the case it was built for.
- **A local, model-free classifier already exists in the codebase** — the pile sidebar's
  semantic filters in `Workspace.tsx` sort fragments into actions / insights / fears / goals by
  keyword, client-side, with no model involved. It is a much cruder taxonomy than the ten
  level-set areas, but it is precedent for the idea that a pile can be given useful structure
  while nothing is generating.

## What would have to change

- **A session-level flag, distinct from `aiEnabled`.** `aiEnabled` means "the server has a
  model"; listening mode means "don't use it yet". They are independent — the interesting
  configuration is a fully-configured deployment deliberately staying quiet. Either a new
  `Session` field or a new `status` value (`status` today is
  `intake | intention | recommendation | active | review | exported`).
- **Suppress the warning banner when the state is chosen.** Showing "AI is unavailable —
  check your configuration" to a facilitator who deliberately turned it off is precisely the
  confusion this intent exists to remove. It needs a different, calm affordance instead.
- **Skip the recommendation step.** Intake currently routes through mode recommendation, which
  is a model call. Listening mode has to bypass it — you cannot ask a model which mode to use
  in a mode defined by not asking a model.
- **Decide the exit.** Presumably listening mode ends by handing off into a normal session with
  a pile already full, at which point the modes and synthesis become available. That transition
  is the feature; without it this is just a text box.

## Open questions

- Is it a session `status`, a boolean on `Session`, or simply "the facilitator has not enabled
  AI yet" as a roster/engagement-level setting?
- Per-engagement or per-contributor? A room where one person is drilling while five others dump
  is plausible and might be better than a global mode.
- Does the recommendation call get skipped, or deferred and offered later once there is a pile
  to base it on? Deferred is more interesting — a mode recommendation made from fifty real
  fragments is a better recommendation than one made from a topic sentence.
- **Can a facilitator see coverage live, during listening mode?** This would be the thing that
  makes the mode visibly useful in the room rather than merely quiet — a wall showing which of
  the ten areas nobody has entered, filling in as people write. It is not free, and it is worth
  being precise about why. The coverage _arithmetic_ in
  [coverage.ts](../../server/ai/coverage.ts) is deliberately not a model call, but its input
  is: `classify()` asks a model to assign each fragment to an area, and returns `{}` when no
  model is configured — which makes every area report zero and read as dark. So live coverage
  needs either a classification pass run at the end of listening (easy, but not live), or a
  non-model classifier over the ten areas (live, and a real piece of work). The keyword filters
  above are the closest existing thing and are not close enough. What is left of this question
  is only the classification: the wall itself is built
  ([CoverageMap.tsx](../../src/components/CoverageMap.tsx), from a map that arrives with the
  ordinary poll), and it already distinguishes a fragment nobody placed from an area nobody
  spoke into — so a classifier returning nothing reads as unplaced rather than as silence.

## Non-goals

- Removing the AI-unavailable warning. That message is right when the state is accidental.
  This adds a second state; it does not replace the first.
- A separate app mode or a separate UI. It is a state of an ordinary session.
