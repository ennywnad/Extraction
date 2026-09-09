import { roleOf } from "../../src/utils/roster.ts";
import type { AreaCoverage, AreaStatus, Session, Thought } from "../../src/types.ts";

// The shape is declared in src/types.ts, with the rest of what crosses the wire. Re-exported
// so callers of the arithmetic can keep importing the type from beside it.
export type { AreaCoverage, AreaStatus };

const PARTIAL_AT = 1; // at least this many fragments to be more than dark
const DEFINED_AT = 12; // and this many, from more than one voice, to count as defined

/**
 * Turns a per-fragment classification into a coverage map.
 *
 * The classification is the model's job; this is deliberately not. The headline output of a
 * level set is the area nobody raised, and asking a model to notice an absence across two
 * hundred fragments is asking it to be reliable at exactly the thing it is worst at. Counting
 * is arithmetic: an area with no fragments reports zero because zero is what it has, every
 * time. Voices are a group-by over author roles, which is not a generation task at all.
 */
export function computeCoverage(
  session: Session,
  areas: string[],
  classification: Record<string, string>,
): AreaCoverage[] {
  const byId = new Map<string, Thought>(session.thoughts.map((t) => [t.id, t]));

  return areas.map((area) => {
    const fragmentIds = Object.entries(classification)
      .filter(([, assigned]) => assigned === area)
      .map(([id]) => id)
      .filter((id) => byId.has(id));

    // Resolved through the roster rather than read off the stamp: the stamp is who somebody
    // was when they wrote, and this counts who is in the room. See src/utils/roster.ts.
    const voices = new Set(
      fragmentIds.map((id) => roleOf(session, byId.get(id)?.author)).filter(Boolean) as string[],
    ).size;

    let status: AreaStatus = "dark";
    if (fragmentIds.length >= DEFINED_AT && voices > 1) status = "defined";
    else if (fragmentIds.length >= PARTIAL_AT) status = "partial";

    return { area, status, fragments: fragmentIds.length, voices, fragmentIds };
  });
}

/** Areas nobody entered — the most useful cell in the deliverable. */
export function darkAreas(coverage: AreaCoverage[]): string[] {
  return coverage.filter((c) => c.status === "dark").map((c) => c.area);
}
