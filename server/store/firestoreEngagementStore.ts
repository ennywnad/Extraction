/**
 * Production store.
 *
 * Thoughts live in a subcollection rather than an array field on the engagement document,
 * for two reasons: a long-running engagement will exceed the 1 MiB document ceiling, and
 * ten concurrent contributors rewriting one array field would lose fragments to write
 * contention. They are reassembled into Session.thoughts on read.
 *
 * Authenticates with Application Default Credentials — no key file, and on Cloud Run that is
 * the runtime service account.
 */

import { FieldPath, FieldValue, Firestore } from "@google-cloud/firestore";
import type { AuthorStamp, Session, Thought } from "../../src/types.ts";
import type {
  EngagementStore,
  EngagementSummary,
  EngagementVersion,
  ServerMetaPatch,
} from "./types.ts";
import { newEngagement } from "./shape.ts";

const ENGAGEMENTS = "engagements";
const THOUGHTS = "thoughts";

/**
 * The engagement document: a Session minus the thoughts, plus the count of them.
 *
 * `thoughtCount` is denormalised — maintained by the same write batch that already touches
 * `updatedAt` on every contribution and deletion. It replaced a `count()` aggregation, which
 * cost a read every time anything wanted the size of a pile. Firestore bills an aggregation
 * at one read per 1,000 index entries matched with a minimum of one, so the old shelf render
 * was 1 + N reads for N engagements and the hot poll path was two reads instead of one.
 *
 * It is a stored field, not part of the `Session` wire shape, so `getEngagement` strips it.
 *
 * The counter is only correct for documents this store created. Nothing has ever been
 * deployed (docs/intents/008), so there is nothing to migrate; if that changes, a document
 * written before this field existed needs backfilling, because `increment` on a missing
 * field sets it to the increment rather than continuing an existing count.
 */
type EngagementDoc = Omit<Session, "thoughts"> & { thoughtCount?: number };

export class FirestoreEngagementStore implements EngagementStore {
  private readonly db: Firestore;

  constructor(projectId: string) {
    this.db = new Firestore({ projectId, ignoreUndefinedProperties: true });
  }

  private doc(id: string) {
    return this.db.collection(ENGAGEMENTS).doc(id);
  }

  private touch() {
    return { updatedAt: new Date().toISOString() };
  }

  async createEngagement(input: {
    topic: string;
    intention: string;
    creator: AuthorStamp;
  }): Promise<Session> {
    const session = newEngagement(input);
    const { thoughts, ...meta } = session;
    await this.doc(session.id).set({ ...meta, thoughtCount: 0 });
    return session;
  }

  async listEngagements(): Promise<EngagementSummary[]> {
    // Every authenticated caller is already inside the IAP perimeter, so there is no
    // per-user filter here; the roster is attribution, not authorisation.
    //
    // One query, whatever the shelf holds. `thoughtCount` is on the document, so rendering it
    // reads no subcollection — this used to fan out a count() aggregation per engagement and
    // bill 1 + N reads for a page nothing caches.
    const snap = await this.db
      .collection(ENGAGEMENTS)
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();

    return snap.docs.map((d) => {
      const data = d.data() as EngagementDoc;
      return {
        id: d.id,
        topic: data.topic,
        intention: data.intention,
        status: data.status,
        thoughtCount: data.thoughtCount ?? 0,
        memberCount: Object.keys(data.roster ?? {}).length,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
    });
  }

  async getEngagement(id: string): Promise<Session | null> {
    const ref = this.doc(id);
    const [snap, thoughtSnap] = await Promise.all([
      ref.get(),
      ref.collection(THOUGHTS).orderBy("timestamp", "desc").get(),
    ]);
    if (!snap.exists) return null;
    // thoughtCount is server bookkeeping; the caller counts `thoughts` like it always has.
    const { thoughtCount: _ignored, ...meta } = snap.data() as EngagementDoc;
    return {
      ...(meta as Omit<Session, "thoughts">),
      thoughts: thoughtSnap.docs.map((d) => d.data() as Thought),
    };
  }

  /**
   * One read, whatever the size of the pile — this is the hot path, and both halves of the
   * ETag now live on the same document.
   */
  async getVersion(id: string): Promise<EngagementVersion | null> {
    const snap = await this.doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() as EngagementDoc;
    return { updatedAt: data.updatedAt, thoughtCount: data.thoughtCount ?? 0 };
  }

  async patchEngagement(id: string, patch: ServerMetaPatch): Promise<Session | null> {
    const ref = this.doc(id);
    if (!(await ref.get()).exists) return null;
    await ref.update({ ...patch, ...this.touch() });
    return this.getEngagement(id);
  }

  async addThought(id: string, thought: Thought): Promise<Thought | null> {
    const ref = this.doc(id);
    if (!(await ref.get()).exists) return null;
    // Same batch that already moves updatedAt, so the count cannot drift from the pile.
    const batch = this.db.batch();
    batch.set(ref.collection(THOUGHTS).doc(thought.id), thought);
    batch.update(ref, { ...this.touch(), thoughtCount: FieldValue.increment(1) });
    await batch.commit();
    return thought;
  }

  async getThought(id: string, thoughtId: string): Promise<Thought | null> {
    const snap = await this.doc(id).collection(THOUGHTS).doc(thoughtId).get();
    return snap.exists ? (snap.data() as Thought) : null;
  }

  async patchThought(
    id: string,
    thoughtId: string,
    patch: Partial<Thought>,
  ): Promise<Thought | null> {
    const ref = this.doc(id).collection(THOUGHTS).doc(thoughtId);
    if (!(await ref.get()).exists) return null;
    const batch = this.db.batch();
    batch.update(ref, patch);
    batch.update(this.doc(id), this.touch());
    await batch.commit();
    return this.getThought(id, thoughtId);
  }

  async deleteThought(id: string, thoughtId: string): Promise<boolean> {
    const ref = this.doc(id).collection(THOUGHTS).doc(thoughtId);
    if (!(await ref.get()).exists) return false;
    const batch = this.db.batch();
    batch.delete(ref);
    batch.update(this.doc(id), { ...this.touch(), thoughtCount: FieldValue.increment(-1) });
    await batch.commit();
    return true;
  }

  async upsertRosterEntry(id: string, stamp: AuthorStamp): Promise<Session | null> {
    const ref = this.doc(id);
    if (!(await ref.get()).exists) return null;
    // Email addresses contain dots, which Firestore reads as field-path separators in a
    // string path. FieldPath segments are taken literally, so the key survives intact.
    await ref.update(
      new FieldPath("roster", stamp.email),
      stamp,
      "updatedAt",
      new Date().toISOString(),
    );
    return this.getEngagement(id);
  }
}
