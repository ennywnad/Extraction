# 008 — Deploying group mode for the first time

**Status:** intent. Not planned, not scheduled. Two of its preparatory items landed
2026-09-03 — the store contract now runs against Firestore, and the audience is checked at
boot. The deploy itself has still not happened. See [STATUS.md](STATUS.md).
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
seams each have a local implementation and a cloud one, and for most of this repo's life every
test ran the local one. That is now true of less than it was, and the table says exactly how
much less:

| Seam         | Exercised by the suite                                                                     | Never executed                                |
| :----------- | :----------------------------------------------------------------------------------------- | :-------------------------------------------- |
| **Store**    | Both implementations, via [storeContract.test.ts](../../test/storeContract.test.ts)        | Firestore's own IAM and `firestore.rules`     |
| **Identity** | `AUTH_MODE=dev`; the fail-closed resolution and the audience shape, via `authMode.test.ts` | IAP JWT verification against a real assertion |
| **Model**    | The no-Gemini fallback path on every route                                                 | Vertex via ADC as the runtime service account |
| **Serving**  | `NODE_ENV=production` static branch, via `DIST_DIR`                                        | The actual container, on Cloud Run            |

Updated 2026-09-03. The store row changed because the contract test runs against the Firestore
emulator — the real `@google-cloud/firestore` client, and the real query, batch, aggregation and
`FieldPath` semantics the production store depends on. The two implementations agree on all ten
behaviours. What the emulator cannot tell you is whether ADC resolves, whether the runtime
service account has the roles, or whether [firestore.rules](../../firestore.rules) denies what it
means to — so the row is narrower, not gone.

This is not a gap in the testing so much as a property of what those tests can reach — CI holds
no credentials by design, and says so. But it used to mean that the group-mode rules
[sharedPile.test.mjs](../../test/sharedPile.test.mjs) proves — server-side attribution,
author-only edits, no lost fragment under a stale pile, 304 on an unchanged re-poll — were proven
against one `EngagementStore` implementation and assumed of the other. The store _contract_ is
now proven of both, without credentials, against an emulator. The route rules above it are still
proven only over the file store, and that is the honest remaining half: what the pile guarantees
is shared, and what the routes guarantee is not yet.

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
- **[DEPLOYMENT.md](../../DEPLOYMENT.md) already carries a verification ladder** — the four
  IAP checks and the `aiEnabled` check — so "did it work" has a defined answer.
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
- **Deploy with `GENAI_BACKEND` unset first, if the aim is to isolate failures.** The app is
  designed to run with no model and label its fallbacks, so a first deploy can prove IAP,
  Firestore and the container without a single token being spent. Turning Vertex on afterwards
  is one `gcloud run services update`. The plan's own phase-0 argument — get the deployment
  problems out of the way while the feature surface is zero — applies again here at a smaller
  scale.
- **Exercise the group rules against Firestore, not just the file store.** The _store_ half is
  done and automated — `npm run test:firestore` against an emulator. What is still worth doing
  by hand on the real service is the half above the store: two people contributing at once, one
  editing another's fragment and being refused, a delete, and a 304 on an idle poll.
- ~~**Confirm the IAP audience.**~~ Partly handled in code, because "presents as a 401 with
  nothing to say why" was the whole problem. [authMode.ts](../../server/authMode.ts) now checks
  the audience at boot: an unusable one — an empty segment, which is what a failed substitution
  in deploy.sh produces — exits the process with the reason, and one that is merely unfamiliar
  warns and boots, since IAP issues three different formats and refusing on a hardcoded list
  would be fail-closed on an assumption. [deploy.sh](../../scripts/deploy.sh) also refuses to
  deploy when the project-number lookup did not resolve. What is left is confirming the audience
  is the _right_ one, which only a real assertion can tell you.
- **Set the Artifact Registry cleanup policy** once the first deploy has created the repository.

## Open questions

- Solo-only first with `--no-iap` as a warm-up, or straight to the real thing? A second service
  from the same image is cheap and isolates IAP from everything else.
- What does a real workshop actually cost in Vertex tokens? Unknown until one runs, and it is
  the only number here that cannot be estimated from the code.
- Should synthesis carry a per-engagement run counter, so a pile cannot be re-synthesised
  fifty times without anyone noticing? Related to, but smaller than,
  [007](007-status-board.md).
- Does the deferred surface in [009](009-the-deferred-group-surface.md) change any of this? Not
  obviously — none of it adds a cost line — but realtime listeners would replace the polling
  arithmetic above with a different one.

## Non-goals

- Automating the deploy, or putting it in CI. `deploy.sh` pushing straight to production is a
  deliberate property and [DEPLOYMENT.md](../../DEPLOYMENT.md) says to treat it as one.
- Making group mode cheaper. Nothing here suggests it is expensive; the point is to find out.
