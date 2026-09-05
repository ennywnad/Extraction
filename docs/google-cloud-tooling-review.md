# What the Google Cloud skills and MCP server were actually worth

**Written:** 2026-09-04, after the GCP configuration review that produced the changes in
`server/ai/client.ts`, `server/store/firestoreEngagementStore.ts`, `scripts/bootstrap-gcp.sh`
and `scripts/cost-guardrails.sh`.

Two Google tools were added to this project on 2026-09-03: the **`google-dev-knowledge` MCP
server** (from `../google-dev-knowledge-mcp`) and the **`google/skills` collection** — 130
skills under `.claude/skills/`, mirrored in `.agents/skills/`. This is an honest account of
which one did the work, written while the evidence was still on screen, because "we installed
some tooling and things went well" is not a claim anyone can check later.

The short version: **the MCP server earned its place and the skills did not get used at all.**
That split is not an accident of how the session went. It follows from what the two things
are, and the rest of this file is the argument for why.

## The job they were given

Review this repo's GCP configuration for things that are wrong. Not "generate a deployment",
not "follow a best-practice checklist" — audit a specific, already-written config against
reality. Almost every question that job produces has the same shape:

> This repo asserts X. Is X still true?

That shape matters more than it looks. It is not a question about Google Cloud in general. It
is a question about whether a particular sentence, written on a particular day, has since
gone stale.

## What the MCP server actually found

Ten queries (nine `answer_query`, one `get_documents`). Five produced changes to the repo.

| Question asked                              | What came back                                                                                                          | Outcome                                                                                                           |
| :------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| Gemini model retirement dates               | `gemini-2.0-flash` shut down **2026-06-01**; unavailable to new projects since 2026-02-06                               | **The most valuable finding of the review.** The default model chain's fallback tier was dead in place.           |
| Current stable Gemini ids                   | `gemini-3.5-flash` (2026-05-19), `gemini-3.5-flash-lite` (2026-07-21)                                                   | The replacement chain now in `client.ts`.                                                                         |
| Cloud Build identity for `--source` deploys | Build runs as the **Compute Engine default SA** for projects enabled ≥ 2024-04-29, shipped deliberately underprivileged | `bootstrap-gcp.sh` now grants `run.builder`, `run.sourceDeveloper`, `serviceUsageConsumer`, `serviceAccountUser`. |
| Firestore `count()` billing                 | One read per **1,000 index entries** matched, minimum one — not a flat single read                                      | Corrected a code comment that stated it as an invariant; fed the `thoughtCount` work.                             |
| Cloud Run `--cpu-boost` semantics           | 2 CPU during startup + 10s, billed only for that window                                                                 | Justified adding it at `min-instances=0`.                                                                         |
| Cloud Run IAP JWT audience                  | `/projects/NUMBER/locations/REGION/services/NAME`                                                                       | **Confirmed the repo was already right.** No change.                                                              |
| `--iap` vs. load-balancer IAP               | Direct `--iap` protects the `run.app` URL; LB-fronted IAP leaves it bypassable                                          | Confirmed the architecture choice. No change.                                                                     |
| Cheapest Vertex location                    | Standard per-token price is the same regionally and globally; `global` routes to spare capacity                         | Informed the `VERTEX_LOCATION` decision.                                                                          |
| Cloud Run Tier 1 regions                    | `us-central1` is Tier 1                                                                                                 | Confirmed the region was already the cheapest. No change.                                                         |
| Flex PayGo                                  | 50% cheaper, global-only, **targets 1–15 minute responses**                                                             | **Prevented a bad change.** See below.                                                                            |

### The finding that mattered most could not have come from the repo

`gemini-2.0-flash` shutting down is not a fact about this codebase. It is a fact about the
world outside it, on a date three months before the review. No amount of reading
`server/ai/client.ts` surfaces it — the code was internally consistent, well-commented, and
even carried a warning that model ids "move faster than this file does." It was right about
the risk and wrong about the value, which is the hardest kind of stale to catch.

That is the archetype of what a live documentation corpus is for.

### One query stopped a change rather than causing one

Asked for "the cheapest location", the obvious answer is Flex PayGo: a genuine 50% discount,
straight from Google's pricing docs. The same document says it targets **1–15 minute**
responses on best-effort sheddable capacity.

This app puts a Gemini call between a person and the next question they are asked. Half price
is irrelevant at fifteen minutes. Without that second sentence the review would have
confidently recommended a change that made the product unusable and called it an optimization.

**A tool that talks you out of a plausible-sounding change is doing more for you than one that
confirms a change you already wanted.** It is also the contribution that leaves no trace in
the diff, so it is worth writing down where it happened.

### Where the MCP server was weak

`answer_query` on the Cloud Run IAP audience returned _"the provided sources do not explicitly
state the exact JWT audience format"_ — then offered to look further. Pulling the underlying
document with `get_documents` found it stated plainly, in a three-line list:

```
- Cloud Run: /projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME
```

**The synthesis layer was less reliable than the retrieval layer.** Had the review stopped at
the generated answer, it would have reported the repo's audience format as unverifiable — and
the audience is the single value most likely to break the whole deployment.

The lesson is narrow and worth keeping: when `answer_query` hedges on a factual, tabular
detail, that is a signal to fetch the document, not a signal that the fact is unknown.

## What the skills contributed: nothing, and here is why

**Zero skills were invoked during the review.** Not one of the 130. This was not an oversight
noticed afterward — going back through them afterward to check, the verdict holds.

### They are built for a different verb

The GCP skills are overwhelmingly procedural: `agent-platform-deploy`, `gke-cluster-creation`,
`cloud-sql-basics`, `bigquery-basics`. They answer _"how do I do X?"_ This review only ever
asked _"is X still true?"_ Those are different questions and a procedure is a poor answer to
the second one.

The closest fit on paper was `google-cloud-waf-cost-optimization` — a review-shaped skill, for
a project whose stated concern is cost. Its actual content is enterprise FinOps: committed use
discounts, Looker Studio chargeback dashboards, departmental cost-allocation labels, "foster a
culture of cost awareness." For a single Cloud Run service on a $25/month budget it is aimed
several orders of magnitude away. It would have produced a page of correct, generic advice and
found none of the five defects above.

### The one that would have helped

`cloud-run-basics` covers `roles/run.builder` and `roles/run.sourceDeveloper` for `--source`
deploys — finding #2, the most likely first-deploy failure. That is a real hit and it should
be credited: reading that skill before writing `bootstrap-gcp.sh` would have caught the gap.

It does not mention `--cpu-boost`, `--min-instances`, or memory sizing — so of the Cloud Run
findings in this review, it covers exactly one.

### The one that would have actively misled

`agent-platform-migrate-from-ai-studio` is, on its description, the single most on-point skill
in the collection for this repo: the whole `GENAI_BACKEND=apikey|vertex` seam in
`server/ai/client.ts` is exactly that migration. Every code example in it uses
`gemini-3-flash-preview` — an id the live docs explicitly flag as deprecated, with instructions
to migrate to `gemini-3.5-flash`.

Across all 130 skills, the model ids that appear are:

```
13  gemini-2.5-flash          retires 2026-10-20
 9  gemini-2.5-pro            retires 2026-10-20
 8  gemini-3-flash-preview    deprecated, "migrate to gemini-3.5-flash"
 7  gemini-3.6-flash
 3  gemini-2.0-*              shut down 2026-06-01
 3  gemini-1.5-*              retired
 2  gemini-3.5-flash          current
```

**Had the model chain been chosen from the skills, the answer would have been
`gemini-2.5-flash` — which is what the repo already had, and what this review flagged as a
bug.** The most-cited id in the collection is the one the review removed.

To be fair: `gemini-api/SKILL.md` does carry an explicit note that `gemini-2.0-*` and
`gemini-1.5-*` are retired. Some skills track lifecycle. Most embed an id in an example and
move on.

### Installing them broke `npm run check`

Not a judgement about content — a measured side effect. The 130 skills land as ~517
Markdown files under `.agents/` and `.claude/skills/`, none of them formatted to this repo's
Prettier config, and none of them gitignored. `npm run check` runs `format:check` first, so
after the install the repo's stated verification loop failed on 517 files, every one of them
vendored third-party content with nothing to do with this codebase.

The fix is three lines in `.prettierignore`, applied on 2026-09-04 alongside this file. It is
worth recording because the failure mode is quiet in the worst way: `npm run check` is what
CLAUDE.md tells anyone to run before calling work done, and it started failing for a reason
that looks like their fault and is not.

## The structural difference, which is the whole point

> The generalisable form of this argument — with the model-id census, the half-life axis, and
> what it implies beyond this repo — is in [half-life-test.md](half-life-test.md).

A skill is a **snapshot** — prose and code written on a day, shipped as a file, correct until
the product moves. `skills-lock.json` pins them, which is right for reproducibility and exactly
wrong for freshness.

The MCP server is a **query against a live corpus**. It cannot go stale between installation
and use, because there is nothing stored to go stale.

For this repo that distinction is not academic. The most load-bearing external facts here —
model ids, retirement dates, which service account builds your container — are precisely the
facts that change without anyone editing your code. `client.ts` already said as much before
this review; it just had no way to act on it. The MCP server is that way.

## What to use, going forward

- **Before touching `modelChain()`, query the MCP server.** Never take a model id from a
  skill, an example, or this file. The comment in `client.ts` now carries the dates that make
  it wrong; re-verify them rather than trusting them.
- **Before editing `scripts/*.sh`, read `cloud-run-basics` first, then verify against the MCP
  server.** The skill is a decent checklist of what to think about and a poor source for
  whether a specific flag or role is current.
- **When `answer_query` hedges on a factual detail, call `get_documents`.** The retrieval layer
  was right when the synthesis layer was not.
- **Neither tool replaces the emulator.** The `thoughtCount` denormalization was verified by
  `npm run test:firestore` against a local Firestore emulator — 90 tests, 0 skipped. That
  affordance was already in `DEPLOYMENT.md` and is still the only thing in this stack that
  proves the production adapter behaves, as `docs/intents/008` says. Documentation tells you
  what Google promises; the emulator tells you what your code does.

## What this review does not establish

Nothing here has been deployed. Every finding is a claim about configuration read against
documentation, and `docs/intents/008-deploying-group-mode.md` still lists ADC, IAM and
`firestore.rules` as never having executed. The MCP server made this repo's GCP config
_better-founded_; it did not make it _exercised_.

Six of the 130 skills were inspected in any depth. The verdict "the skills did not help" is
sound for this task and should not be read as a verdict on the collection — a GKE migration or
a BigQuery build would likely reverse it entirely.
