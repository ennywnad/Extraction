/**
 * How many polls an engagement is receiving right now.
 *
 * The room wants to know who is here, and the honest cheap answer is not "who" at all: this
 * counts *requests* in a rolling window, not people. One person with two tabs open counts
 * twice, and that is stated wherever the number is drawn.
 *
 * Why not distinct identities, which the poll already carries? Because the map and the
 * pruning are the same either way, and keying on a person makes a presence claim the data
 * cannot support — a closed laptop keeps its identity for the length of the window either
 * way, and the app would then be publishing who is in a room from what is really a request
 * counter. Counting requests is the same code with a smaller promise.
 *
 * Deliberately in memory, and deliberately per instance:
 *
 * - Persisting it would mean a store write per poll, which is exactly the cost
 *   [engagementRoutes.ts]'s 304 path was written to avoid. A decoration on a wall does not
 *   get to undo that.
 * - So on a deployment running more than one instance, each instance sees only the polls
 *   routed to it, and the number is a floor rather than a total. That is the same class of
 *   admission as `storage.live`, and the board says it.
 */

/** Polls within this many ms count as "now". Two poll intervals, so a tab is not missed. */
const WINDOW_MS = 60_000;

/** engagement id -> timestamps of polls still inside the window. */
const polls = new Map<string, number[]>();

function prune(at: number, times: number[]): number[] {
  const cutoff = at - WINDOW_MS;
  // Timestamps arrive in order, so the survivors are always a suffix.
  let i = 0;
  while (i < times.length && times[i] <= cutoff) i += 1;
  return i === 0 ? times : times.slice(i);
}

/** Records a poll and returns the count now in the window, including this one. */
export function recordPoll(engagementId: string, now = Date.now()): number {
  const times = prune(now, polls.get(engagementId) ?? []);
  times.push(now);
  polls.set(engagementId, times);
  return times.length;
}

/**
 * Polls in the window without recording one.
 *
 * Drops an engagement whose window has emptied, so an instance that has served a thousand
 * engagements is not holding a thousand empty arrays.
 */
export function pollsInWindow(engagementId: string, now = Date.now()): number {
  const times = prune(now, polls.get(engagementId) ?? []);
  if (times.length === 0) {
    polls.delete(engagementId);
    return 0;
  }
  polls.set(engagementId, times);
  return times.length;
}

/** Test seam: forget every window. */
export function resetPollWindows(): void {
  polls.clear();
}
