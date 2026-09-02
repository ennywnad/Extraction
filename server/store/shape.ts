import { randomUUID } from "node:crypto";
import type { AuthorStamp, ExtractionMode, Session } from "../../src/types.ts";

export const VALID_MODES: ExtractionMode[] = [
  "free_stream",
  "quick_fire",
  "guided_drill",
  "binary_frame",
  "swipe",
  "slider",
  "card_sort",
  "timeline",
  "sentence_completion",
  "devils_advocate",
  "letter_writing",
  "priority_pile",
];

export function emptyModeProgress(): Record<ExtractionMode, number> {
  return Object.fromEntries(VALID_MODES.map((m) => [m, 0])) as Record<ExtractionMode, number>;
}

/** The role a creator gets, versus everyone who joins later. */
export const FACILITATOR_ROLE = "Facilitator";
export const CONTRIBUTOR_ROLE = "Contributor";

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
