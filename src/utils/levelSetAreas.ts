/**
 * The ten areas a level set is assessed against.
 *
 * Here rather than beside the prompt that names them, for the reason voices.ts is here: the
 * server writes them into a classification prompt, and the browser now scores a draft against
 * the same ten before it is submitted (docs/intents/006). A second copy would be the bug
 * SESSION_META_FIELDS was — two lists that have to agree, with nothing making them, and a
 * disagreement showing up as an area that silently never fills.
 *
 * Stable, because coverage counts are compared across sessions. Renaming one is a decision
 * about the deliverable, not a wording fix.
 */
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
] as const;

export type LevelSetArea = (typeof LEVEL_SET_AREAS)[number];
