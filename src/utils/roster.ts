import {
  CONTRIBUTOR_ROLE,
  FACILITATOR_ROLE,
  type AuthorStamp,
  type RosterEntry,
  type Session,
} from "../types";

/**
 * Who is in the room, and how much of that the app actually knows.
 *
 * The distinction this file exists for: `AuthorStamp.role` is always set, and until somebody
 * says otherwise it is set to one of two constants the server picked. So a role is not
 * evidence that anyone declared anything, and the difference matters because the coverage map
 * counts *voices* as a group-by over roles — see src/utils/coverage.ts. In an engagement where
 * nobody has declared, that group-by can return at most two however many people are in the
 * room, and every `voices` number in the deliverable is measuring the server's defaults.
 *
 * Arithmetic only, and for the same reason as coverage.ts and chorus.ts: this decides whether
 * a number shown to a room is trustworthy, and "usually right" is not a useful answer to that.
 */

const DEFAULTS = new Set<string>([FACILITATOR_ROLE, CONTRIBUTOR_ROLE]);

/**
 * Whether this role was chosen by the person or filled in for them.
 *
 * A member who deliberately types "Contributor" reads as undeclared, which is the safe
 * direction: the cost is one understated count, where the reverse would be the app claiming a
 * role was declared when nobody touched it. There is no marker distinguishing the two and
 * adding one would be a schema change to record a case nobody has.
 */
export function isDeclaredRole(role: string | undefined): boolean {
  return Boolean(role?.trim()) && !DEFAULTS.has(role!.trim());
}

export interface RosterState {
  members: RosterEntry[];
  /** Members whose role they chose themselves. */
  declared: number;
  total: number;
  /** This viewer's own entry, when they are on the roster. */
  me: RosterEntry | null;
  /** True when the viewer is still carrying whatever the server assigned them. */
  mineUndeclared: boolean;
}

/**
 * The roster as a component can draw it, sorted so it does not reshuffle under a reader as
 * the poll returns: declared before undeclared, then by name.
 */
export function rosterState(session: Session, viewerEmail?: string): RosterState {
  const members = Object.values(session.roster ?? {}).sort((a, b) => {
    const byDeclared = Number(isDeclaredRole(b.role)) - Number(isDeclaredRole(a.role));
    return byDeclared !== 0 ? byDeclared : a.name.localeCompare(b.name);
  });

  const key = viewerEmail?.toLowerCase();
  const me = members.find((m) => m.email.toLowerCase() === key) ?? null;

  return {
    members,
    declared: members.filter((m) => isDeclaredRole(m.role)).length,
    total: members.length,
    me,
    mineUndeclared: Boolean(me) && !isDeclaredRole(me!.role),
  };
}

/**
 * The role to count and display for a fragment: the roster's, not the one stamped on it.
 *
 * `AuthorStamp` is copied onto a fragment when it is written, so it records who somebody was
 * at 09:02. That is the right thing for an audit trail and the wrong thing for every question
 * the app actually asks — "how many distinct voices spoke into this area" is about the room as
 * it is now, and a facilitator who fills in the roster halfway through a session expects the
 * coverage map to correct itself rather than to keep counting the first hour's defaults.
 *
 * Without this, declaring a role only ever fixed the count for fragments written afterwards,
 * which is the half of the problem that would have been left standing.
 *
 * Falls back to the stamp when the author has left the roster or there is no roster at all, so
 * a fragment never loses its attribution.
 */
export function roleOf(session: Session, author: AuthorStamp | undefined): string | undefined {
  if (!author) return undefined;
  const current = session.roster?.[author.email.toLowerCase()]?.role;
  return current ?? author.role;
}
