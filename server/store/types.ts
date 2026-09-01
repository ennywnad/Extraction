import type { AuthorStamp, Session, Thought } from "../../src/types.ts";

/** Fields of a Session that a roster member may update. Never includes thoughts. */
export type SessionMetaPatch = Partial<
  Pick<
    Session,
    | "activeMode"
    | "modeHistory"
    | "modeProgress"
    | "status"
    | "topic"
    | "intention"
    | "synthesizedOutline"
    | "synthesizedSummary"
    | "synthesizedActionItems"
    | "advancedSettings"
  >
>;

export interface EngagementSummary {
  id: string;
  topic: string;
  intention: string;
  status: Session["status"];
  thoughtCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Persistence for server-held sessions.
 *
 * Implementations must treat thoughts as an independently addressable collection rather than
 * an array field on the session: a shared pile has many concurrent writers, and rewriting a
 * whole array per contribution loses fragments. `getEngagement` reassembles them into the
 * existing `Session.thoughts` wire shape so the frontend needs no awareness of the split.
 */
export interface EngagementStore {
  createEngagement(input: {
    topic: string;
    intention: string;
    creator: AuthorStamp;
  }): Promise<Session>;

  listEngagements(): Promise<EngagementSummary[]>;

  /** Null when no such engagement exists. */
  getEngagement(id: string): Promise<Session | null>;

  patchEngagement(id: string, patch: SessionMetaPatch): Promise<Session | null>;

  addThought(id: string, thought: Thought): Promise<Thought | null>;
  getThought(id: string, thoughtId: string): Promise<Thought | null>;
  patchThought(id: string, thoughtId: string, patch: Partial<Thought>): Promise<Thought | null>;
  deleteThought(id: string, thoughtId: string): Promise<boolean>;

  /**
   * Adds or updates a roster entry. Note this needs no queryable member index: IAP group
   * membership is the access boundary, so every caller may list every engagement on the
   * instance, and the roster is attribution rather than authorisation.
   */
  upsertRosterEntry(id: string, stamp: AuthorStamp): Promise<Session | null>;
}
