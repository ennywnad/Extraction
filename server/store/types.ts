import type { AuthorStamp, RoleGroup, Session, Thought } from "../../src/types.ts";

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

/**
 * What the server itself may write, which is strictly more.
 *
 * `coverage` is arithmetic over the pile, computed at synthesis time and deliberately not
 * delegated to the model so that a count of zero is right every time. Letting a client set
 * it would put the one number nobody should be able to argue with back under a caller's
 * control — so it is outside `SessionMetaPatch` and outside the route layer's `META_FIELDS`,
 * and the two exclusions are the same decision expressed twice.
 *
 * `levelSetRuns` is here for a sharper version of the same reason. It is the record of what
 * this engagement has cost, and a client that could set it could hide a runaway — which is
 * the single thing the number exists to make visible.
 */
export type ServerMetaPatch = SessionMetaPatch &
  Partial<Pick<Session, "coverage" | "levelSetRuns">>;

/**
 * Just enough to build an ETag: the pair the poll compares, with none of the pile behind it.
 * Kept separate from EngagementSummary so an implementation can serve it without reading
 * every fragment — see `getVersion`.
 */
export interface EngagementVersion {
  updatedAt: string;
  thoughtCount: number;
}

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

  /**
   * The engagement's version without its fragments. Null when no such engagement exists.
   *
   * This exists purely so an unchanged poll stays cheap. Every open tab asks for the pile
   * every few seconds and almost always gets a 304, so an implementation that answered this
   * by loading the whole engagement would bill a read per fragment per tab per poll for an
   * answer of "nothing has changed". Implementations must serve it in O(1) reads.
   */
  getVersion(id: string): Promise<EngagementVersion | null>;

  patchEngagement(id: string, patch: ServerMetaPatch): Promise<Session | null>;

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

  /**
   * Sets what one role label counts as, or clears the decision with null. `key` is
   * `roleKey(label)` from src/utils/voices.ts.
   *
   * One entry per call rather than a whole-map patch, for the roster's reason: two people
   * tidying different labels at once must not overwrite each other. And a key is free text a
   * person typed, so it can hold the dots and slashes a string field path splits on. Moves
   * `updatedAt`, or the poll never carries a regroup to anybody else.
   */
  setRoleGroup(id: string, key: string, group: RoleGroup | null): Promise<Session | null>;
}
