# 008 — Deploying group mode for the first time

**Status:** intent. Not planned, not scheduled — and not deployed. Two of its preparations are
done; see [STATUS.md](STATUS.md).
**Written:** 2026-09-03

## What

Group mode is built and has never run anywhere but a laptop.
[level-set-plan-v2.md](../../planv1/level-set-plan-v2.md) marks phases 0–5 complete, with phase
5 reading **"Built; deploy pending"**. This intent is the work of turning that into "deployed,
verified, and with a known bill", and — until that happens — the honest statement of which parts
of this repo have never executed.

It is the one entry here that is about code already written rather than code to write. It is
listed as an intent anyway, because "the production adapters are unexercised" is a real open item
and the alternative is that it stays in someone's head.

## Why

**The adapters that only exist in production are the least exercised.** The store and identity
seams each have a local implementation and a cloud one, and what runs where is worth stating
exactly:

| Seam         | Exercised by the suite                                                                     | Never executed                                |
| :----------- | :----------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **Store**    | Both implementations, via [storeContract.test.ts](../../test/storeContract.test.ts)        | Firestore's own IAM and `firestore.rules`     |
| **Identity** | `AUTH_MODE=dev`; the fail-closed resolution and the audience shape, via `authMode.test.ts` | IAP JWT verification against a real assertion |
| **Model**    | The no-Gemini fallback path on every route                                                 | Vertex via ADC as the runtime service account |
| **Serving**  | `NODE_ENV=production` static branch, via `DIST_DIR`                                        | The actual container, on Cloud Run            |

The store row is narrow because an emulator runs the real client and the real query, batch,
aggregation and `FieldPath` semantics, but says nothing about whether ADC resolves, whether the
runtime service account holds the roles, or whether [firestore.rules](../../firestore.rules)
denies what it means to. Those still first execute in a deployment.

The rest is a property of what tests without credentials can reach, and CI says so. The
remaining honest gap is a layer up: the group-mode rules
[sharedPile.test.mjs](../../test/sharedPile.test.mjs) proves — server-side attribution,
author-only edits, no lost fragment under a stale pile, 304 on an unchanged re-poll — run over
the file store only. What the pile guarantees is checked against both stores; what the routes
guarantee is not.

**The deployment document described a different app than the one it now deploys.** It opened by
saying it deployed "solo mode, behind IAP. Group mode arrives in later phases." That was true at
phase 0 and false by phase 5, so anyone following it would have believed they were putting up a
solo instance while actually provisioning Firestore and a shared pile. Corrected on 2026-09-03;
recorded here because it is exactly the class of surprise this intent exists to remove.

**The bill is the reason this has not happened yet, and most of it is already handled.** Worth
writing down plainly, because the fear is doing more work than the numbers deserve.

## What the code already supports

More than expected. The cost work was done before the deploy, which is the right order:

- **Cloud Run scales to zero.** [deploy.sh](../../scripts/deploy.sh) sets `--min-instances=0
--max-instances=3 --concurrency=80`. Idle costs nothing, and the classic surprise bill — a
  warm instance billed around the clock — cannot happen. The cap also bounds a runaway.
- **[cost-guardrails.sh](../../scripts/cost-guardrails.sh) exists and is meant to run _before_
  the first deploy.** A monthly budget with alerts at 50/90/100% of actual and 90% of forecast,
  plus Cloud Monitoring policies on the three metrics that can move: Vertex tokens, Firestore
  reads, Cloud Run requests.
- **[audit-costs.sh](../../scripts/audit-costs.sh)** is a read-only inventory, for a baseline to
  diff against afterwards.
- **[DEPLOYMENT.md](../../DEPLOYMENT.md) already carries a verification ladder** — the four IAP
  checks, plus `/healthz` reporting which branch each seam took, so "did it work" has a defined
  answer and `storage.backend: "file"` on a deployment is visible rather than inferred.
- **The production store can be exercised without credentials.** `npm run test:firestore` runs
  [storeContract.test.ts](../../test/storeContract.test.ts) against a Firestore emulator, so the
  store half of this deploy is checkable before attempting it.
- **A budget alerts; it does not cap.** The document already says so and points at the Vertex
  quota ceiling as the only hard stop. That distinction is the important one and is already made.

## The three cost lines, honestly

- **Cloud Run — not the risk.** Scale-to-zero, three instances maximum.
- **Firestore reads — not the risk either.** An idle poll costs about two reads: `getVersion()`
  in [firestoreEngagementStore.ts](../../server/store/firestoreEngagementStore.ts) does one
  document `get` plus one aggregation `count`. At `POLL_INTERVAL_MS = 15_000` that is four polls
  a minute per open tab, so roughly 480 reads per viewer-hour — a rounding error at Firestore's
  read pricing, even with tabs left open for days. The ETag already keeps an unchanged poll from
  re-reading the pile itself.
- **Vertex tokens — this is the variable one.** Synthesis assembles the whole pile into one
  prompt, so its cost scales with the pile rather than with the number of people. It is
  single-flight per engagement, which prevents ten reviewers starting ten runs, but nothing
  prevents one person re-running it repeatedly against a pile that keeps growing.
- **Artifact Registry — small, and the only line that grows while nobody is using the app.**
  Every deploy leaves an image behind until the cleanup policy is set, which cannot be done
  until after the first deploy has created the repository. Already flagged in
  [DEPLOYMENT.md](../../DEPLOYMENT.md); easy to forget precisely because of the ordering.

## What would have to happen

- **Run [cost-guardrails.sh](../../scripts/cost-guardrails.sh) and lower the Vertex quota
  ceiling before anything else**, in that order. The budget is the alarm; the quota is the brake.
  Both are outside the app and neither can say _why_ a bill moved. `levelSetRuns` is the inside
  view that answers that, and it needs no setup — see the open question below, now closed.
- **Deploy with `GENAI_BACKEND` unset first, if the aim is to isolate failures.** The app is
  designed to run with no model and label its fallbacks, so a first deploy can prove IAP,
  Firestore and the container without a single token being spent. Turning Vertex on afterwards
  is one `gcloud run services update`. The plan's own phase-0 argument — get the deployment
  problems out of the way while the feature surface is zero — applies again here at a smaller
  scale.
- **Exercise the route rules against Firestore.** The store contract is automated
  (`npm run test:firestore`); the layer above it is not. Worth doing by hand on the real
  service: two people contributing at once, one editing another's fragment and being refused,
  a delete, and a 304 on an idle poll.
- **Confirm the audience is the right one**, which only a real assertion can tell you.
  [authMode.ts](../../server/authMode.ts) already refuses to boot on an audience that cannot
  work and [deploy.sh](../../scripts/deploy.sh) refuses to deploy one it could not compute, so
  what is left is the case where the value is well-formed and wrong.
- **Set the Artifact Registry cleanup policy** once the first deploy has created the repository.

## Open questions

- Solo-only first with `--no-iap` as a warm-up, or straight to the real thing? A second service
  from the same image is cheap and isolates IAP from everything else.
- What does a real workshop actually cost in Vertex tokens? Unknown until one runs, and it is
  the only number here that cannot be estimated from the code.
- ~~Should synthesis carry a per-engagement run counter, so a pile cannot be re-synthesised
  fifty times without anyone noticing?~~ **Answered yes, and built** — `levelSetRuns` on the
  engagement, drawn on 007's board and on by default. See [STATUS.md](STATUS.md). It counts
  and does not cap: the budget alerts, the Vertex quota brakes, and this makes the thing they
  are guarding visible from inside the app. What is still open is whether a cap belongs here
  too, which is a question about interrupting a facilitator mid-workshop rather than about
  cost, and is not answerable before a real one has run.
- Does the deferred surface in [009](009-the-deferred-group-surface.md) change any of this? Not
  obviously — none of it adds a cost line — but realtime listeners would replace the polling
  arithmetic above with a different one.

## Non-goals

- Automating the deploy, or putting it in CI. `deploy.sh` pushing straight to production is a
  deliberate property and [DEPLOYMENT.md](../../DEPLOYMENT.md) says to treat it as one.
- Making group mode cheaper. Nothing here suggests it is expensive; the point is to find out.
