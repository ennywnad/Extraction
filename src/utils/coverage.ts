import { areaStatus, voicesIn } from "./voices.ts";
import type { AreaCoverage, AreaStatus, Session } from "../types.ts";

// The shape is declared in src/types.ts, with the rest of what crosses the wire. Re-exported
// so callers of the arithmetic can keep importing the type from beside it.
export type { AreaCoverage, AreaStatus };

/**
 * Turns a per-fragment classification into a coverage map.
 *
 * Here rather than under server/ai/ for the reason voices.ts is here, and the move was forced by
 * the same thing that made it safe: this is pure arithmetic over a Session, it imports nothing
 * but voices.ts, and there are now two callers on opposite sides of the wire. The level set feeds
 * it a classification a model produced; the browser feeds it the areas authors accepted from a
 * local assist while the room is still writing. Neither is a model call *here* — which was always
 * the point of the file, and is now the point of where it lives.
 *
 * The classification is the model's job; this is deliberately not. The headline output of a
 * level set is the area nobody raised, and asking a model to notice an absence across two
 * hundred fragments is asking it to be reliable at exactly the thing it is worst at. Counting
 * is arithmetic: an area with no fragments reports zero because zero is what it has, every
 * time.
 *
 * Voices are distinct roles once spelling is folded and the room's groupings are applied, and
 * both that and the status thresholds live in src/utils/voices.ts — so the map can recount in
 * the browser after somebody regroups a label, from the same functions this uses.
 */
export function computeCoverage(
  session: Session,
  areas: readonly string[],
  classification: Record<string, string>,
): AreaCoverage[] {
  const present = new Set(session.thoughts.map((t) => t.id));

  return areas.map((area) => {
    const fragmentIds = Object.entries(classification)
      .filter(([, assigned]) => assigned === area)
      .map(([id]) => id)
      .filter((id) => present.has(id));

    // Resolved through the roster rather than read off the stamp: the stamp is who somebody
    // was when they wrote, and this counts who is in the room. See src/utils/roster.ts.
    const voices = voicesIn(session, fragmentIds);

    return {
      area,
      status: areaStatus(fragmentIds.length, voices),
      fragments: fragmentIds.length,
      voices,
      fragmentIds,
    };
  });
}

/** Areas nobody entered — the most useful cell in the deliverable. */
export function darkAreas(coverage: AreaCoverage[]): string[] {
  return coverage.filter((c) => c.status === "dark").map((c) => c.area);
}
