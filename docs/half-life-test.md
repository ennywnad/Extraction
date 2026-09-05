# The half-life test

**Written:** 2026-09-04. Companion to [google-cloud-tooling-review.md](google-cloud-tooling-review.md),
which records what happened in this repo. This file is the part that generalises.

A live documentation query caught a bug that 130 packaged skills contained. That is not an
argument about which tool is better — it is an argument that they **fail in opposite
directions**, and that the deciding property is how fast the knowledge rots.

Written because the current discourse has MCP cooling off as an over-sold silver bullet while
skills heat up, and this session is a small piece of evidence that the framing is wrong: they
are not competitors doing the same job well or badly. They are different mechanisms with
different decay properties.

## What happened

Reviewing this app's GCP configuration, the most valuable finding was that its default Gemini
model chain had died in place. `gemini-2.0-flash` shut down on 2026-06-01 — three months
before the review — and had been unavailable to new projects since February. The code was
internally consistent, thoroughly commented, and even carried a warning that model ids move
faster than the file does. **It was right about the risk and wrong about the value**, which is
the hardest kind of stale to catch.

That fact is not in the repository. It is a fact about the world, and only a live query
surfaced it.

Afterwards I checked what the installed skills would have advised instead. Every Gemini model
id appearing across all 130, counted on 2026-09-04, against its status in Google's live
documentation the same day:

| Model id                 | Mentions | Actual status         |
| :----------------------- | -------: | :-------------------- |
| `gemini-2.5-flash`       |       13 | retires 2026-10-20    |
| `gemini-2.5-pro`         |        9 | retires 2026-10-20    |
| `gemini-3-flash-preview` |        8 | deprecated            |
| `gemini-3.6-flash`       |        7 | current               |
| `gemini-2.0-*`           |        3 | shut down 2026-06-01  |
| `gemini-1.5-*`           |        3 | retired               |
| `gemini-3.5-flash`       |        2 | current — **the fix** |

> **The most-cited model id across the entire skill collection is the one this review removed.
> The least-cited is the one it installed.**

Worse: the skill whose description matched this codebase most precisely — a guide for migrating
from the AI Studio API to Vertex, which is exactly the seam in `server/ai/client.ts` — uses the
deprecated preview id in every one of its code examples. **Following the most relevant skill
would have reproduced the defect being fixed.**

## Two mechanisms, opposite failure modes

|                    | **Skill — a snapshot**                                                  | **Retrieval MCP — a query**                                             |
| :----------------- | :---------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| What it is         | Prose and examples authored once, versioned, pinned by a lockfile       | A question against a corpus someone else keeps current                  |
| Strengths          | Loads instantly, no network call, no quota, reads with total confidence | Cannot go stale between install and use — nothing is stored to go stale |
| **Fails by being** | **confidently wrong**                                                   | **slow, rate-limited, or silent**                                       |

Pinning is the point of a lockfile and the enemy of freshness. Those are the same property
viewed from two directions.

The asymmetry that matters: **a missing fact sends you looking; a wrong one does not.** That is
why a stale skill is worse than no skill — it forecloses the search that would have found the
truth.

## The test

Not "which tool is better" but **how long is this fact good for**. Sort knowledge by half-life
and the routing decides itself.

```
LONG HALF-LIFE ─────────────────────────────────────────► SHORT HALF-LIFE
   package it                                                   query it

   IAM concepts    Deployment    House            Prices,        Model ids
                   shapes        conventions      quotas,
                                                  regions
   ~years          ~years        your call        ~months        ~weeks
```

The **middle of the axis** is where skills are genuinely at their best and retrieval cannot
help at all: your team's conventions, your review checklist, your deployment ritual. No vendor
corpus knows those. That is the real case for skills, and it is strong — it just isn't the case
that a vendor documentation mirror makes. Google shipped 130 skills that are largely
documentation reformatted as skills, which is using the packaging mechanism for a job the
retrieval mechanism does better.

The far-left end is worth noting too, because it is not zero-risk: default build service
accounts moved **once**, in April 2024, and quietly broke every source deploy written before
it. Even "stable" facts have a half-life; it is just long enough that a snapshot usually wins.

## The honest ledger

Ten queries against the docs corpus. Zero skills invoked during the review, six inspected
afterwards to check whether that was a mistake.

**Query won:**

- **Found the dead model chain.** Unavailable from the code, from the skills, or from memory.
- **Stopped a bad change.** Asked for the cheapest Vertex option, the docs offered a real 50%
  discount (Flex PayGo) — and, two sentences later, that it targets **1–15 minute** responses.
  This app puts a model call between a person and their next question. The tool that talks you
  out of a plausible change leaves no trace in the diff, which is exactly why it is worth
  recording.
- **Confirmed three things already correct** — the IAP audience format, direct `--iap` over
  load-balancer IAP, the region already being cheapest. Verification that changes nothing is
  still the tool working.

**Skills won:**

- **`cloud-run-basics` would have caught the IAM gap** — the build-time roles that `--source`
  deploys need, which was the most likely first-deploy failure. A real hit, credited.

**Skills cost:**

- **Would have supplied a retired model id**, and covered exactly one of the several Cloud Run
  findings (no `--cpu-boost`, no `min-instances`, no memory sizing).
- **Broke the build on install.** 130 skills arrive as ~517 unformatted Markdown files,
  ungitignored, and `npm run check` runs `format:check` first — so the repo's stated
  verification loop failed on 517 files with nothing to do with this codebase. Three lines in
  `.prettierignore` fixed it. The install footprint is real, and the failure looks like the
  contributor's fault when it isn't.

## MCP is not one thing either

The sharpest failure of the session came from the tool that otherwise won.

Asked for the Cloud Run IAP JWT audience format, the corpus's **synthesis** layer
(`answer_query`) replied that the sources did not state it. Fetching the underlying document
(`get_documents`) found it stated flatly, as a three-item list:

```
Cloud Run: /projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME
```

Had the review stopped at the generated answer, it would have reported the repo's audience as
unverifiable — and that value is the one most likely to break the entire deployment.

**Retrieval was right where generation hedged.** "MCP" bundles at least two things with
different reliability, and the RAG-answer layer introduced a failure the raw documents did not
have. When a synthesized answer goes vague on a flat, tabular fact, that is a signal to fetch
the document, not evidence the fact is unknown.

## What to actually do

1. **Never take a version, price, quota, or model id from a packaged skill.** Shortest
   half-lives in the stack, most confidently stated.
2. **Use skills for procedure and taste** — your conventions, your checklist, your deployment
   ritual. This is where they are genuinely hot, and it has nothing to do with mirroring a
   vendor's docs.
3. **Read the skill for the checklist, verify the specifics live.** A good map of what to think
   about; a poor source of whether a given flag is current.
4. **When a synthesized answer hedges, drop to retrieval.** Different layers, different
   reliability.
5. **Neither replaces running the thing.** The one change verified beyond doubt here was
   checked against a local Firestore emulator — 90 tests, nothing skipped. Documentation tells
   you what the vendor promises; the emulator tells you what your code does.

## What this doesn't establish

One task, one domain, one afternoon. Six of 130 skills read closely. Cloud configuration is
unusually freshness-sensitive — close to the best case for live retrieval and close to the
worst case for a snapshot. A GKE migration or a BigQuery build would plausibly reverse the
verdict entirely.

The claim worth carrying is not "MCP beat skills." It is that the two fail in opposite
directions, so the question to ask of any packaged knowledge is the boring one: **how long is
this good for, and what happens when it expires quietly?**
