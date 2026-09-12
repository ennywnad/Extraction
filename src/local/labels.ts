/**
 * What the two label sets are, and what a model is actually shown for each.
 *
 * Every label has an `id` the app stores and a set of `texts` the model scores against. The gap
 * between them is the point, and the shape of the second half was settled by measurement rather
 * than by argument — three versions were run against a real embedding runtime over a held-out
 * set of twenty-eight drafts written for a different engagement entirely:
 *
 * | What the model was shown                  | Top-1 correct |
 * | :---------------------------------------- | :------------ |
 * | The heading alone                         | worst         |
 * | One careful description of the category   | 13/28         |
 * | Several short exemplars, best match wins  | **18/28**     |
 *
 * The reason the middle row loses is worth keeping: a description is a paragraph *about* a
 * topic, and a one-line draft compared against ten paragraphs matches whichever paragraph shares
 * the most topic words — which is how "orders get rekeyed by hand between two systems" came back
 * as **Timeline & milestones**. Exemplars are the same length, register and grammatical person
 * as the thing being classified, so the comparison is like against like.
 *
 * **The ids are not free text.** Tags are `PileCategory`, so a renamed tag is a compile error in
 * the sidebar that renders it. Areas are `LEVEL_SET_AREAS` verbatim, because an area id is what
 * coverage.ts counts — a suggestion spelled differently from the classifier's own label is a
 * fragment that silently lands in no cell at all.
 *
 * **These are the exact strings that were measured.** Adding a plausible-sounding exemplar is
 * not a free improvement: it moves the scores for every draft, and the numbers above stop
 * describing the code. Change them by re-running the held-out set, not by reading them.
 */
import type { PileCategory } from "../utils/pileCategories.ts";
import { LEVEL_SET_AREAS } from "../utils/levelSetAreas.ts";
import type { Label } from "./types.ts";

/**
 * The four the pile sidebar files a fragment under.
 *
 * First person, present tense, and deliberately ordinary — the existing keyword matcher in
 * pileCategories.ts already catches these when the words are present, so what these have to
 * reach is the half 006 names as the real gap: a fragment expressing a fear while containing no
 * word for one, which is most of the fears anybody actually writes down.
 */
const TAG_TEXTS: Record<PileCategory, string[]> = {
  action: [
    "I need to send the plan to finance",
    "somebody has to chase the vendor this week",
    "we must set up a workshop with the warehouse team",
    "next step is to write the integration spec",
  ],
  insight: [
    "the reason this keeps failing is that nobody owns the handover",
    "I have realised these two problems are the same problem",
    "it turns out the delay is not technical at all",
    "the pattern is that every escalation comes from one team",
  ],
  fear: [
    "if this slips past March the board will pull the funding",
    "I am worried we will not be ready and it will be embarrassing",
    "the risk is that the vendor cannot deliver and we have no fallback",
    "what keeps me up is that nobody has tested the rollback",
  ],
  goal: [
    "what good looks like is one number everybody trusts",
    "we want order to cash under five days by Q3",
    "the outcome we are aiming at is a single stock view",
    "success would be closing the month in two days",
  ],
};

export const TAG_LABELS: Label[] = (Object.keys(TAG_TEXTS) as PileCategory[]).map((id) => ({
  id,
  texts: TAG_TEXTS[id],
}));

/**
 * The ten a level set is assessed against, said the way somebody in the room would say them.
 *
 * Keyed by the area id so the list cannot fall out of step with LEVEL_SET_AREAS: a missing key
 * is a compile error, the same protection EMPTY_MODE_PROGRESS gives a new extraction mode. An
 * area that quietly had no exemplars would score against nothing and read as dark forever,
 * which is the most convincing possible way to be wrong.
 */
const AREA_TEXTS: Record<(typeof LEVEL_SET_AREAS)[number], string[]> = {
  "Business processes in scope": [
    "orders get rekeyed by hand between two systems",
    "the approval workflow goes through four people",
    "returns are handled completely differently in each branch",
  ],
  "Current-state systems & integrations": [
    "the old ERP talks to the warehouse over a nightly batch file",
    "we run three separate systems that do not talk to each other",
    "the legacy platform is still the system of record",
  ],
  "Operating model & ownership": [
    "nobody can tell me who signs off a pricing change",
    "the finance team and operations both think they own this",
    "decisions get made in a forum that has no mandate",
  ],
  "Data & reporting": [
    "there is no single source of truth for stock levels",
    "three systems disagree about the same number",
    "the monthly report is rebuilt by hand in a spreadsheet",
  ],
  "People, roles, change impact": [
    "the warehouse team will need retraining",
    "the union will want proper notice about shift changes",
    "half the staff have never used a system like this",
  ],
  "Success measures": [
    "we will know this worked if order to cash drops below five days",
    "the target is ninety five percent on time delivery",
    "how will anybody measure whether this was worth it",
  ],
  "Security, compliance & residency": [
    "customer records cannot leave the EU under our DPA",
    "we need an audit trail for every price change",
    "access control is far too broad at the moment",
  ],
  "Risks & dependencies": [
    "the vendor may not have the connector ready and we have no fallback",
    "this depends on the other programme finishing first",
    "we are assuming the data is clean and it may not be",
  ],
  "Timeline & milestones": [
    "we cannot start until the warehouse freeze lifts in February",
    "go live has to be before the peak season",
    "phase one needs to finish by the end of the quarter",
  ],
  "Commercials & funding envelope": [
    "the capex approval is only signed off to four hundred thousand",
    "there is no budget for a second integration",
    "the business case assumed a three year payback",
  ],
};

export const AREA_LABELS: Label[] = LEVEL_SET_AREAS.map((id) => ({ id, texts: AREA_TEXTS[id] }));
