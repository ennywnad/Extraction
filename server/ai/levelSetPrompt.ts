import type { Session } from "../../src/types.ts";
import { renderCorpus, rolesPresent } from "./corpus.ts";

/** The areas a level set is assessed against. Stable, so coverage counts are comparable. */
export const LEVEL_SET_AREAS = [
  "Business processes in scope",
  "Current-state systems & integrations",
  "Operating model & ownership",
  "Data & reporting",
  "People, roles, change impact",
  "Success measures",
  "Security, compliance & residency",
  "Risks & dependencies",
  "Timeline & milestones",
  "Commercials & funding envelope",
];

/**
 * Assigns every fragment to an area. Bounded label set, one fragment at a time — the kind of
 * task a model is reliable at, and the input to the arithmetic in coverage.ts.
 */
export function classificationPrompt(session: Session): string {
  const numbered = session.thoughts
    .map((t, idx) => `${idx + 1}. [id:${t.id}] ${t.text}`)
    .join("\n");

  return `Assign each fragment below to exactly one area of a consulting engagement's scope.

Areas:
${LEVEL_SET_AREAS.map((a) => `- ${a}`).join("\n")}

Fragments:
${numbered}

Return one entry per fragment, using the id exactly as given. If a fragment fits no area,
assign "unclassified". Do not invent areas.`;
}

/**
 * The group deliverable.
 *
 * Deliberately not a reworded version of the solo synthesis prompt. A solo session produces
 * a compassionate recap of what one person uncovered beneath their own words; a level set
 * states the boundary of an ask that ten people are about to be held to. Different document,
 * different voice, different failure modes.
 */
export function levelSetPrompt(
  session: Session,
  coverageSummary: string,
  settings?: { outputFilter?: string; cognitiveBiasAudit?: string },
): string {
  const filterNote =
    settings?.outputFilter === "actions"
      ? "Keep the outline to owned, closeable actions. No analytical prose."
      : settings?.outputFilter === "roadmap"
        ? "Keep the outline at the level of phases and milestones, not individual tasks."
        : "Cover the full boundary of the ask.";

  const biasNote =
    settings?.cognitiveBiasAudit === "include"
      ? `Add a section "Blind spots" naming where the group's reasoning shows confirmation
bias, sunk cost, or convenient assumption — citing the fragments that show it.`
      : "Omit the blind-spots section.";

  return `You are writing the level-set deliverable for a consulting engagement.

Topic: "${session.topic}"
Stated intention: "${session.intention}"
Contributor roles present: ${rolesPresent(session).join(", ") || "unknown"}

Fragments contributed, labelled by the contributor's role:
${renderCorpus(session.thoughts)}

Coverage, already computed from the fragments — treat these counts as fact and do not
recompute or contradict them:
${coverageSummary}

Produce:

1. 'summary': what the group has and has not defined about this ask. State the dark areas
   explicitly as areas nobody raised. Do not soften a zero.
2. 'outline': a markdown outline of the boundary of the ask, area by area, carrying each
   area's status. ${filterNote}
3. 'conflicts': claims that contradict each other, quoting both fragments and the roles that
   made them. Do not resolve them into a recommendation the group never made.
4. 'assumptions': things the plan depends on that no fragment evidences, each with the role
   it originated from and what breaks if it is false.
5. 'openQuestions': what must be answered, and which role is best placed to answer it.

${biasNote}

Write plainly and specifically. This is read by the people who contributed the fragments.
Do not address the reader as "you", do not offer encouragement, and do not characterise
individuals — reason about roles and evidence only.`;
}
