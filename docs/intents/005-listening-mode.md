# 005 — Listening mode: a kickoff with no model

**Status:** intent, in part — the state is nameable and the prompting routes honour it. See
[STATUS.md](STATUS.md).
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

**It converts a failure state into a feature.** The app had one way to be modelless: a coral
warning banner reading _"AI is unavailable… check the Gemini configuration before running a
session that matters."_ That message is correct for an accident and actively wrong for a
deliberate choice — telling a facilitator who just turned generation off to go and check their
configuration. Naming the state was most of the work, and it is the half that is built.

**It is cheap.** Of the seven intents on this list, this is the one where the code is already
almost entirely there.

## What the code already supports

The state itself, end to end:

- **`Session.listening` is the state, as a field rather than a seventh `status`** — a listening
  session is `active`, because people are contributing. It is per engagement, so a facilitator can
  quiet a room somebody else opened and every tab learns it on the ordinary poll; it is in
  `SessionMetaPatch` and `META_FIELDS` for the reason the roster is auto-join, and it is stored
  only as a real boolean — the patch route and the shared-link importer both drop anything else.
- **One decision, consulted by every route that speaks unasked.** `servesFallback(req)` in
  [respond.ts](../../server/ai/respond.ts) folds "the caller asked for quiet" together with "no
  model is reachable", because the answer is the same body either way: the fallback that route
  already owns, already labelled `source: "fallback"`. Six prompting routes ask it. Synthesis
  deliberately does not — a level set is the one model call a person has to press a button for,
  which is what "no synthesis until someone asks for it" means. It takes availability as an
  argument, so the decision is testable with no key.
- **The client has one door, and the flag lives behind it.** `askModel` in
  [askModel.ts](../../src/utils/askModel.ts) composes the POST the six call sites were each
  writing by hand and folds in `listening`. That is a module rather than a prop on six mode
  interfaces for `lastAnswer.ts`'s reason, and it means a mode added later is quiet by
  construction instead of quiet if somebody remembered. Two scans in
  [test/listening.test.ts](../../test/listening.test.ts) keep both halves honest: a prompting route
  with no guard fails, and a raw `fetch` to one of those paths fails.
- **Two banners in one slot, and the chosen state wins.** The workspace labels a deliberate quiet
  instead of warning about it, and when nothing is configured _as well_ it says so in the same
  card — that fact outlives the choice, and somebody ending listening has to know the modes will
  not come alive. The coral warning is untouched for the accident it was written for, which a test
  pins.
- **Both ways in, and the way out.** "Listen First" at intake launches straight into Free Stream
  and never calls `/api/session/recommend`; a header toggle enters and leaves the state mid-session,
  for the whole room in group mode. Crossing the boundary remounts the mode, so a mode holding a
  fixed prompt asks again the moment the app is allowed to answer — without that the handoff is
  invisible until somebody happens to press refresh.

And, as the first draft of this file found, nearly all of the rest was there already:

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

- **A mode recommendation made from the pile, offered at the exit.** Skipping the call at intake
  is the cheap half and it is done; the interesting half is the other direction — a recommendation
  read off fifty real fragments rather than off a topic sentence and four quiz answers. It is not
  free: `recommendModePrompt` takes only the warmup answers, so the prompt has to learn to read a
  pile, and the result needs somewhere to land in the workspace, which today has no surface for
  one. Until then ending listening hands back an ordinary session and the person picks a mode off
  the tape, which is what they do in every other session.
- **Live coverage while the room writes.** Still the thing that would make the mode visibly useful
  in the room, and still blocked on the same piece: see the open question below.

## Open questions

- ~~Is it a session `status`, a boolean on `Session`, or simply "the facilitator has not enabled
  AI yet" as a roster/engagement-level setting?~~ **A boolean field.** It is orthogonal to every
  value `status` holds — a listening session is `active` — so folding it into that union would
  mean re-entering the status afterwards as whatever it would otherwise have been, and giving
  every switch on `status` a case meaning "and also still active".
- ~~Per-engagement or per-contributor? A room where one person is drilling while five others dump
  is plausible and might be better than a global mode.~~ **Per engagement.** The suppression has
  to be a fact the pile carries, or a facilitator cannot quiet a room they did not open and one
  person is the only one hearing nothing back. Per-contributor is a real second feature — one
  person drilling while five dump — but it is a preference, not this state, and it would want
  naming separately rather than reusing this field.
- ~~Does the recommendation call get skipped, or deferred and offered later once there is a pile
  to base it on? Deferred is more interesting — a mode recommendation made from fifty real
  fragments is a better recommendation than one made from a topic sentence.~~ **Both, in that
  order.** At intake it is skipped, which is what "Listen First" does. Offering it from the pile
  at the exit is the better feature and is the named next increment above, because it needs the
  prompt to read a pile and a surface that does not exist yet.
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
