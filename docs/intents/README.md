# Intents

Roadmap material. An **intent** is a direction with a rationale, written down before it is
planned — what it is, why it would be worth doing, roughly how, and honestly how far the code
already is. It is not a plan and nothing here is scheduled.

Separate from [planv1/](../../planv1/), which is the frozen design record of a thing that got
built. These are the opposite end: ideas that have not earned a plan yet.

**[STATUS.md](STATUS.md) records what has actually landed against these**, newest first. Read
it before the table below: an intent whose file still reads as untouched may have had a slice
built, and the log says which slice and what it deliberately left alone.

| #                                              | Intent                                             | Depends on | Cost if attempted today                                                         |
| :--------------------------------------------- | :------------------------------------------------- | :--------- | :------------------------------------------------------------------------------ |
| [001](001-mcp-server-over-the-pile.md)         | An MCP server over the pile                        | —          | Assessed and parked. Not cost — the value went elsewhere. See its file.         |
| [002](002-model-provider-seam.md)              | A provider-neutral model seam                      | —          | **Built.** Two adapters behind `ModelProvider`; per-route selection deferred.   |
| [003](003-local-models-in-solo-mode.md)        | Local models in solo mode                          | 002        | Small — 002 exists now, and was shaped to take this as the degraded case.       |
| [004](004-claude-and-the-gcp-model-gateway.md) | Claude, and the model as a deployment choice       | 002        | **Built, never run.** Needs one request against a project with Claude enabled.  |
| [005](005-listening-mode.md)                   | Listening mode — a kickoff with no model           | —          | Smallest on this list. Mostly already true.                                     |
| [006](006-local-assists-before-submit.md)      | Local assists before a fragment enters the pile    | —          | Cheap to build, independent of everything else. The cost is setup, not code.    |
| [007](007-status-board.md)                     | A status board that looks like the rest of the app | —          | Small, and now smaller: the reporting half landed, the drawing has not.         |
| [008](008-deploying-group-mode.md)             | Deploying group mode for the first time            | —          | Not code, and still not done. Its two code-shaped preparations have landed.     |
| [009](009-the-deferred-group-surface.md)       | The deferred group surface                         | —          | A catalogue; the coverage map is built, the other seven stay deferred.          |
| [010](010-model-armor.md)                      | Model Armor over the prompt boundary               | —          | Unknown until someone prices it. One seam to change; the policy is the work.    |
| [011](011-the-role-brief.md)                   | The role brief, per participant                    | —          | Small. The count it fixed and the voices it groups are built; the brief is not. |

## How to read these

Each file carries a **"What the code already supports"** section. That is the part worth
trusting least over time and checking first — it describes the repository as of the date on
the file, and the whole point of writing it down was to find out which of these intents the
existing seams already fit and which ones they do not.

**An intent file states the direction and the current truth of the code. It does not record how
the code got there** — that is [STATUS.md](STATUS.md)'s job, and keeping the two apart is what
stops these from turning into changelogs. So when a slice lands: the facts it created are
restated in "What the code already supports" in the present tense, the finished item leaves
"What would have to change", and a question it answered leaves "Open questions" with the answer
folded into the body where a reader would otherwise re-open it. What does not belong in either
file is the middle state — a struck-through item with a "done as X" note beside it, which reads
as a diff against a version of the repo nobody can see any more.

A **resolved question** is the exception and stays put, struck through with its answer, as in
[002](002-model-provider-seam.md) and [004](004-claude-and-the-gcp-model-gateway.md). Deciding
something is not the same as building it: the answer and the reasoning are part of the brief,
there is no code and so no log entry to point at, and a bare question with no visible answer is
one somebody re-opens.

Three findings from writing them, worth stating up front:

- **The store seam is in good shape and the model seam is not.** `EngagementStore` is an
  interface with no HTTP in it, so 001 is genuinely additive. The model call is not abstracted
  at all — `generateContentWithFallback` takes a raw `@google/genai` request — so 003 and 004
  both stall on the same missing piece, which is why 002 was pulled out as its own intent
  rather than being written three times.
- **Several are cheaper than they look, and one is not.** 005 is mostly a matter of naming a
  state the app can already be in; 007 needs no new facts, only a place to put the ones already
  computed; 006 needs no server change at all. 001 looks like the small one and is not:
  exposing a pile that remembers who said what means solving identity for a client that is not
  behind IAP.
- **The line that keeps deciding things is whose data it is.** It is why 001's identity
  question is the hard part rather than the protocol, and it is why 006 shrank: an earlier
  draft had participants' laptops processing the shared pile, and a fragment that has not been
  submitted yet belongs to one person, while the pile does not. The smaller version is not a
  compromise — it is the version where the problem does not exist. That file records the
  larger one and why it was set aside.

## In what order, if they were built

Added 2026-09-03, after the files above were written and their "what the code already supports"
sections were re-checked against `main`. Nothing here schedules anything. It records which of
these would make the others cheaper, and which orderings would cost a rewrite.

**Only 002, 003 and 004 contend for the same code.** 001, 005, 006 and 007 touch different seams
and can be built in any order, or at the same time, by different people. So sequencing is really
a question about that one cluster, and the saving from getting it right is one avoided rewrite of
nine call sites and thirty-eight schema declarations.

**The dependency that mattered pointed backwards.** The table says 004 depends on 002, and for
code that is true. The _decision_ ran the other way: 004's "what does gateway mean concretely"
determined whether 002 was an in-process adapter or an HTTP contract, so designing 002 first
would have been a coin flip. That edge is now discharged — 004 records the answer and 002 records
that it stays in-process — which is why the cluster is ready to start. The general form is worth
keeping in mind: an open question in a dependent file can gate the design of the file it depends
on, and the arrows in the table do not show it.

**002 should never land alone** — and it did not. By itself it is a pure refactor that ships
nothing anyone can see, and a seam with one implementation behind it is an indirection rather
than a seam. It landed with 004, which was the right one to prove it with: Gemini's
`config.responseSchema` and Claude's `output_config.format` are genuinely different shapes, and
both are GA on Vertex under the ADC the deployment already uses. That tested the seam rather
than the auth, and it worked — the two providers turned out to disagree about
`additionalProperties` and `required` in a way a single-provider seam would never have
surfaced. See [STATUS.md](STATUS.md).

**003 after 004, not before** — which reverses what the numbering suggests. 003's own file calls
structured output "the real risk": grammar-constrained decoding is the weak case and may force
reduced schemas on the local path. Design the seam against two providers that constrain well and
003 slots in afterwards as the degraded case, with `source` already able to say so. Do it the
other way and the seam gets shaped around the weakest mechanism it will ever serve. 003 is also
where per-route provider selection stops being optional, and that is 002's hardest open question
— better answered with the seam already proven.

**007 split, and half of it went early — twice.** The board wants the full state space and
belongs at the end, but "each seam reports its choice rather than logging it" only got more
expensive the longer it waited. The reporting half landed first; the per-response half was
folded into 002's work, while someone was already inside `client.ts`, so a response now names
the provider that wrote it. Doing it the other way round would have meant going back for one
scattered fact per provider added.

**006 before 005 buys 005 its most interesting feature.** They look unrelated and share no code.
But 005's live-coverage question is blocked on `classify()` being a model call that returns `{}`
when nothing is configured, which makes every area read dark. 006 builds a client-side classifier
over the author's own draft before submission. If that assist suggests a coverage _area_
alongside the tag, fragments arrive already classified, the human is still the verification step
exactly as 006 argues, and live coverage needs no server model call at all. That composition also
argues for 006's in-page WebGPU fork over the localhost one: localhost works only for the
participant who set `OLLAMA_ORIGINS`, which is no use for a coverage wall the whole room is
meant to watch.

**001 is orthogonal, and on its own merits it is parked.** It adapts the store seam, not the
model seam, so nothing in the cluster waits on it — but the question its file now answers is not
a sequencing one. Two of its four reasons turn out not to need the protocol: cross-engagement
queries are a missing surface in the app rather than a missing door onto it, and the coverage
map is already drawn. What is left is a write tool for a facilitator who has the browser open,
against a group mode that has never been deployed. Its only tie to the rest is a panel in 007,
which is drawn grey and says so.

**008 comes before all of it, and is not really in this ordering.** Every intent above assumes a
deployment that has never been exercised: group mode is built and has only ever run on a laptop,
so IAP verification and Vertex have not executed once. Building more on top of that is building
on an untested floor. It is also the cheapest item here in code terms, because it is not code —
and the parts of it that were code are done, which lit the floor without testing it.

**009 is a catalogue rather than a step**, but it held one thing the ordering above wanted: the
coverage map, which was computed, shipped across the wire and never rendered. That one is built,
which settles where coverage lives — with the engagement, not on 007's board — and leaves 005
needing a classifier rather than a wall.

One item was not an ordering question but had a deadline attached, and it is **discharged**:
002 and 004 both renamed `GEMINI_API_KEY`, `GEMINI_MODELS` and `GENAI_BACKEND`, and since
[deploy.sh](../../scripts/deploy.sh) pushes straight to production, the aliases had to exist
before that push rather than after it. They shipped in the same commit as the rename. The old
names still work behind one boot warning, so the next deploy is safe either way.
