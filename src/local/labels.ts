/**
 * What the two label sets are, and what a model is actually shown for each.
 *
 * Every label here has an `id` the app stores and a `text` the model scores against, and the
 * gap between them is the whole point. "Commercials & funding envelope" is a heading in a
 * consulting deliverable. Nobody writes that sentence, so embedding it and comparing it to
 * somebody's half-typed worry matches on register rather than on meaning — the headings that
 * happen to sound like prose win, and the rest never fill. The sentences below are written the
 * way a participant would say the thing, which is the side of the comparison we control.
 *
 * **The ids are not free text.** Tags are `PileCategory`, so a renamed tag is a compile error
 * in the sidebar that renders it. Areas are `LEVEL_SET_AREAS` verbatim, because an area id is
 * what coverage.ts counts — a suggestion whose area is spelled differently from the one the
 * classifier uses is a fragment that silently lands in no cell at all.
 */
import type { PileCategory } from "../utils/pileCategories.ts";
import { LEVEL_SET_AREAS } from "../utils/levelSetAreas.ts";
import type { Label } from "./types.ts";

/**
 * The four the pile sidebar files a fragment under.
 *
 * Written as first-person statements because that is what a fragment is. The existing keyword
 * matcher in pileCategories.ts catches these when the words are present; this is for the half
 * 006 names as the real gap — a fragment that expresses a fear while containing no word for
 * one, which is most of the fears anybody actually writes down.
 */
const TAG_TEXT: Record<PileCategory, string> = {
  action:
    "Something that has to get done. A task, a next step, a commitment to make or send or " +
    "build something, work that is waiting on somebody.",
  insight:
    "A realisation about why something is the way it is. Noticing a pattern, understanding a " +
    "cause, seeing how two things connect.",
  fear: "A worry, a risk, a doubt, something that could go wrong, a reason to hesitate, the thing that would be embarrassing or costly if it happened.",
  goal: "Something wanted in the future. An outcome to reach, a target, what good would look like, the state somebody is aiming at.",
};

export const TAG_LABELS: Label[] = (Object.keys(TAG_TEXT) as PileCategory[]).map((id) => ({
  id,
  text: TAG_TEXT[id],
}));

/**
 * The ten a level set is assessed against, said the way somebody in the room would say them.
 *
 * Keyed by the area id so the list cannot fall out of step with LEVEL_SET_AREAS: a missing key
 * is a compile error, which is the same protection EMPTY_MODE_PROGRESS gives a new extraction
 * mode. An area that quietly had no sentence would score against nothing and read as dark
 * forever, which is the most convincing possible way to be wrong.
 */
const AREA_TEXT: Record<(typeof LEVEL_SET_AREAS)[number], string> = {
  "Business processes in scope":
    "How the work actually gets done today, step by step — which processes are in scope, where " +
    "they start and stop, the workflow people follow.",
  "Current-state systems & integrations":
    "The systems already in place and how they talk to each other. Existing tools, platforms, " +
    "databases, the interfaces and integrations between them, what is legacy.",
  "Operating model & ownership":
    "Who owns what, how teams are organised, where decisions get made, which function is " +
    "accountable for a thing, how the organisation is structured to run this.",
  "Data & reporting":
    "The data itself — where it lives, whether it is any good, how it is modelled, what gets " +
    "reported, dashboards, metrics, the single source of truth.",
  "People, roles, change impact":
    "The effect on people. Headcount, skills, training, adoption, whose job changes, " +
    "resistance, communication, how the change lands with staff.",
  "Success measures":
    "How anybody will know this worked. The measures, targets, benefits, KPIs, the outcome " +
    "being tracked and what number it has to reach.",
  "Security, compliance & residency":
    "Security, privacy, regulation and where data is allowed to be held. Access control, " +
    "audit, legal obligations, jurisdiction, certification.",
  "Risks & dependencies":
    "What could go wrong and what this is waiting on. Risks, blockers, assumptions, things " +
    "outside our control, other projects this depends on.",
  "Timeline & milestones":
    "When things happen. Dates, phases, sequencing, deadlines, milestones, how long something " +
    "will take and what has to come first.",
  "Commercials & funding envelope":
    "Money. Budget, cost, pricing, the business case, who is paying, how much is approved, " +
    "commercial terms and the contract.",
};

export const AREA_LABELS: Label[] = LEVEL_SET_AREAS.map((id) => ({ id, text: AREA_TEXT[id] }));
