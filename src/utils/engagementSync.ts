import { Session, Thought } from "../types";
import * as api from "./engagementAPI";

/** Fragment fields a client may push. Anything else is server-owned. */
const MUTABLE_FIELDS = [
  "text",
  "clusterCategory",
  "timelineZone",
  "priorityZone",
  "intensity",
  "swipeStatus",
] as const;

/**
 * Session fields this client may push, and the third copy of that list — `SessionMetaPatch` types
 * it and `META_FIELDS` in server/engagementRoutes.ts enforces it. A field missing from this one
 * fails silently and in the most confusing possible way: the update applies optimistically, the
 * PATCH never carries it, and the refetch below snaps the value back with nothing logged. That is
 * exactly what `listening` did before test/listening.test.ts started comparing the two lists.
 */
const SESSION_META_FIELDS = [
  "activeMode",
  "modeHistory",
  "modeProgress",
  "status",
  "listening",
  "topic",
  "intention",
  "synthesizedOutline",
  "synthesizedSummary",
  "synthesizedActionItems",
  "advancedSettings",
] as const;

function changedFields(before: Thought, after: Thought): Partial<Thought> {
  const patch: Partial<Thought> = {};
  for (const field of MUTABLE_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      (patch as any)[field] = after[field];
    }
  }
  return patch;
}

/**
 * Applies a whole-session update against the server.
 *
 * Every mode in the app expresses a mutation by composing a new `thoughts` array, so this
 * diffs the array to work out what actually happened — with one deliberate asymmetry:
 * **a fragment missing from the new array is never treated as a deletion.**
 *
 * Inferring deletes from absence loses other people's work. Under polling, a contributor's
 * local array is a snapshot that goes stale the moment somebody else contributes; the next
 * card they drag composes a new array from that stale snapshot, and anything added in the
 * meantime would look like a removal. Deletion is an explicit call (see deleteThought), and
 * absence here means "older than the server", which the refetch below resolves.
 */
export async function pushSessionUpdate(
  current: Session,
  updates: Partial<Session>,
): Promise<Session> {
  const id = current.engagementId!;

  if (updates.thoughts) {
    const before = new Map(current.thoughts.map((t) => [t.id, t]));

    for (const thought of updates.thoughts) {
      const previous = before.get(thought.id);
      if (!previous) {
        // Locally composed fragments carry a client-generated id; the server issues its own,
        // along with the timestamp and author stamp. The refetch below reconciles.
        await api.addThought(id, {
          text: thought.text,
          mode: thought.mode,
          promptContext: thought.promptContext,
          swipeStatus: thought.swipeStatus,
          intensity: thought.intensity,
          clusterCategory: thought.clusterCategory,
          timelineZone: thought.timelineZone,
          priorityZone: thought.priorityZone,
        } as any);
        continue;
      }
      const patch = changedFields(previous, thought);
      if (Object.keys(patch).length) {
        await api.patchThought(id, thought.id, patch);
      }
    }
  }

  const meta: Partial<Session> = {};
  for (const field of SESSION_META_FIELDS) {
    if (field in updates) (meta as any)[field] = (updates as any)[field];
  }
  if (Object.keys(meta).length) {
    await api.patchEngagement(id, meta);
  }

  // The server is the authority on the assembled pile: it holds contributions this client has
  // not seen, and the ids/timestamps/authors it stamped on anything just added.
  const fresh = await api.fetchEngagement(id);
  return fresh ? fresh.session : { ...current, ...updates };
}
