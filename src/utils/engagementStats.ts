import type { Session } from "../types";
import { rosterState } from "./roster";
import { voiceOf } from "./voices";

/**
 * What a room can be told about itself, counted from the pile it is already holding.
 *
 * Every field here is arithmetic over the `Session` the workspace already polls, which is
 * the whole reason these are cheap: no new endpoint, no new store read, nothing the server
 * has to remember. The one exception is `polling`, which the server counts and hands over on
 * a response header — see server/pollWindow.ts.
 *
 * Same discipline as server/ai/coverage.ts: counting is not a model's job, and a number on a
 * wall in front of a room has to be right every time.
 */
export interface EngagementStats {
  /** Identities that have opened the engagement, whether or not they have written. */
  roster: number;
  /** Of those, the ones who have actually put a fragment in the pile. */
  voices: number;
  /**
   * Distinct voices in the pile — what the level set reasons over. Counted as the coverage map
   * counts them: spelling folded and the room's role groups applied (see src/utils/voices.ts).
   */
  roles: number;
  /**
   * Of the people on the roster, how many chose their own role rather than keeping the one
   * the server assigned. Null in solo mode, where there is no roster.
   *
   * `roles` above and `voices` in the coverage map are both group-bys over role, so when this
   * is short of the roster they are counting the server's two defaults instead of the room —
   * which caps them at two however many people are present. The number is here so the board
   * can say that rather than print a plausible figure.
   */
  rolesDeclared: { declared: number; total: number } | null;
  fragments: number;
  /** Fragments added in the last five minutes, by timestamp. */
  recent: number;
  modesUsed: number;
  modesTotal: number;
  /** Whole minutes since the engagement was created. */
  ageMinutes: number;
  /** Null until a level set has been generated; the coverage map draws this properly. */
  dark: { dark: number; total: number } | null;
  /**
   * Completed level sets — the only number here that is about what the engagement has cost
   * rather than what it holds. Two Gemini calls over the whole pile apiece.
   *
   * Counts runs that finished, so it is a floor on spend rather than a bill: a run that
   * failed part-way may still have spent tokens and is not here. Server-written and read
   * straight off the session, so it needs no endpoint of its own.
   */
  levelSets: number;
  /**
   * Requests in the server's window, not people: one person with two tabs counts twice, and
   * on a multi-instance deployment it is only this instance's share. Null when the server has
   * not said (a 304 with no header, or solo mode, where nothing polls).
   */
  polling: number | null;
}

const RECENT_MS = 5 * 60_000;

export function engagementStats(
  session: Session,
  polling: number | null,
  now: number = Date.now(),
): EngagementStats {
  const thoughts = session.thoughts ?? [];
  const authored = thoughts.filter((t) => t.author?.email);

  const distinct = <T>(values: (T | undefined)[]) =>
    new Set(values.filter((v): v is T => Boolean(v))).size;

  const coverage = session.coverage;
  const roster = rosterState(session);

  return {
    roster: Object.keys(session.roster ?? {}).length,
    voices: distinct(authored.map((t) => t.author?.email)),
    // The same voice the coverage map counts — spelling folded, the room's groupings applied —
    // or the board and the map would describe one room as two different sizes.
    roles: distinct(authored.map((t) => voiceOf(session, t.author)?.key)),
    fragments: thoughts.length,
    recent: thoughts.filter((t) => {
      const at = Date.parse(t.timestamp);
      return Number.isFinite(at) && now - at <= RECENT_MS;
    }).length,
    // Counted against the session's own progress map rather than a second list of modes, so
    // adding a mode cannot leave this reporting "9 of 11" — the map is keyed on every mode.
    modesUsed: distinct(thoughts.map((t) => (t.mode === "system" ? undefined : t.mode))),
    modesTotal: Object.keys(session.modeProgress ?? {}).length,
    ageMinutes: Math.max(0, Math.floor((now - Date.parse(session.createdAt)) / 60_000)) || 0,
    dark: coverage?.length
      ? { dark: coverage.filter((c) => c.status === "dark").length, total: coverage.length }
      : null,
    rolesDeclared: session.roster ? { declared: roster.declared, total: roster.total } : null,
    levelSets: session.levelSetRuns ?? 0,
    polling,
  };
}
