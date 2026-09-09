import { randomUUID } from "node:crypto";
import type { AuthorStamp, ExtractionMode, Session } from "../../src/types.ts";

/**
 * Keyed on `ExtractionMode` rather than listed, so a mode added to the union and forgotten
 * here is a compile error rather than a silent one — the routes filter `mode` through
 * `VALID_MODES`, so a missing mode meant the server quietly filed those fragments under
 * whatever `activeMode` happened to be. Its twin on the client is `EMPTY_MODE_PROGRESS`
 * in src/App.tsx.
 */
const EMPTY_MODE_PROGRESS: Record<ExtractionMode, number> = {
  free_stream: 0,
  quick_fire: 0,
  guided_drill: 0,
  binary_frame: 0,
  swipe: 0,
  slider: 0,
  card_sort: 0,
  timeline: 0,
  sentence_completion: 0,
  devils_advocate: 0,
  letter_writing: 0,
  priority_pile: 0,
};

export const VALID_MODES = Object.keys(EMPTY_MODE_PROGRESS) as ExtractionMode[];

export function emptyModeProgress(): Record<ExtractionMode, number> {
  return { ...EMPTY_MODE_PROGRESS };
}

/**
 * The role a creator gets, versus everyone who joins later.
 *
 * Defined in src/types.ts and re-exported here: the client compares against these exact
 * strings to tell a role somebody chose from one the server filled in, so two copies would
 * mean a rename silently reclassifying every roster entry as declared.
 */
export { FACILITATOR_ROLE, CONTRIBUTOR_ROLE } from "../../src/types.ts";

export function newEngagement(input: {
  topic: string;
  intention: string;
  creator: AuthorStamp;
}): Session {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    engagementId: id, // 1:1 by construction; the presence of this field is the mode switch
    roster: { [input.creator.email]: input.creator },
    topic: input.topic,
    intention: input.intention,
    isCustomIntention: false,
    status: "active",
    activeMode: "free_stream",
    thoughts: [],
    modeProgress: emptyModeProgress(),
    modeHistory: [{ mode: "free_stream", timestamp: now }],
    createdAt: now,
    updatedAt: now,
  };
}
