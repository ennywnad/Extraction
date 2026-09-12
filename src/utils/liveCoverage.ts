/**
 * The coverage wall, drawn while the room is still writing.
 *
 * docs/intents/005 asks whether a facilitator can see coverage *live* — "a wall showing which of
 * the ten areas nobody has entered, filling in as people write" — and answers that it is not
 * free, because `classify()` is a server model call that returns `{}` with nothing configured.
 * In a listening session, which is exactly where this would be most useful, every area would
 * read as unplaced. docs/intents/006's area assist is what pays for it: a fragment whose author
 * accepted an area arrives already classified, so the wall needs no model call at all and
 * behaves identically with Gemini unconfigured. That composition is why 006 was built first.
 *
 * **It reads only what an author accepted.** Nothing here infers an area, and nothing re-reads
 * the pile — the suggestion was offered before submission and a human either took it or did not,
 * which is the verification step 006's whole safety argument rests on. A fragment nobody filed is
 * unplaced, and stays unplaced.
 *
 * **This is a different claim from the level set's map and must not be dressed as the same one.**
 * There, a model classifies every fragment and the coverage is over the whole pile. Here the
 * classification is partial by construction, so a dark area usually means "nobody filed anything
 * here" rather than "nobody said anything here". CoverageMap already carries the machinery for
 * that — it counts placed against pile size and says so — and is told which of the two maps it is
 * drawing so its headline can say the honest thing rather than the alarming one.
 */
import { computeCoverage, type AreaCoverage } from "./coverage.ts";
import { LEVEL_SET_AREAS } from "./levelSetAreas.ts";
import type { Session } from "../types.ts";

/**
 * How many fragments have to carry an accepted area before the wall is worth drawing.
 *
 * The same judgement as `MIN_PILE` in chorus.ts, and it exists for the same reason: a map built
 * from two filed fragments is nine black cells, and nine black cells read as "this room has
 * covered nothing" when what they actually mean is "almost nobody has used the assist". The
 * footer would say so truthfully and nobody would read the footer over a wall of black.
 *
 * Below this the workspace draws nothing, which is also the honest state for the default
 * configuration — both assists ship off, so most sessions will never reach it, and a facilitator
 * who has not switched anything on should not be shown a broken-looking wall.
 */
export const MIN_PLACED = 5;

const VALID = new Set<string>(LEVEL_SET_AREAS);

/**
 * The areas authors accepted, as the classification shape `computeCoverage` already takes.
 *
 * Filtered against `LEVEL_SET_AREAS` rather than trusted. An area is stored as free text on the
 * fragment, and a value from an older build, a shared link, or a renamed area would otherwise be
 * counted as placed while matching no cell — inflating "placed" in the footer and quietly making
 * the unplaced warning under-report.
 */
export function acceptedAreas(session: Session): Record<string, string> {
  const areas: Record<string, string> = {};
  for (const thought of session.thoughts) {
    const area = thought.assist?.area;
    if (area && VALID.has(area)) areas[thought.id] = area;
  }
  return areas;
}

/** The live map, or nothing when too little has been filed for it to mean anything. */
export function liveCoverage(session: Session): AreaCoverage[] | null {
  const areas = acceptedAreas(session);
  if (Object.keys(areas).length < MIN_PLACED) return null;
  return computeCoverage(session, LEVEL_SET_AREAS, areas);
}
