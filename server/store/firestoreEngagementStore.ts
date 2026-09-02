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

import { FieldPath, Firestore } from "@google-cloud/firestore";
import type { AuthorStamp, Session, Thought } from "../../src/types.ts";
import type { EngagementStore, EngagementSummary, SessionMetaPatch } from "./types.ts";
import { newEngagement } from "./shape.ts";

const ENGAGEMENTS = "engagements";
const THOUGHTS = "thoughts";

/** The engagement document, which is a Session minus the thoughts held alongside it. */
type EngagementDoc = Omit<Session, "thoughts">;

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
    await this.doc(session.id).set(meta);
    return session;
  }

  async listEngagements(): Promise<EngagementSummary[]> {
    // Every authenticated caller is already inside the IAP perimeter, so there is no
    // per-user filter here; the roster is attribution, not authorisation.
    const snap = await this.db
      .collection(ENGAGEMENTS)
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get();

    return Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() as EngagementDoc;
        // count() aggregation avoids reading every fragment just to render a shelf.
        const count = await d.ref.collection(THOUGHTS).count().get();
        return {
          id: d.id,
          topic: data.topic,
          intention: data.intention,
          status: data.status,
          thoughtCount: count.data().count,
          memberCount: Object.keys(data.roster ?? {}).length,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        };
      }),
    );
  }

  async getEngagement(id: string): Promise<Session | null> {
    const ref = this.doc(id);
    const [snap, thoughtSnap] = await Promise.all([
      ref.get(),
      ref.collection(THOUGHTS).orderBy("timestamp", "desc").get(),
    ]);
    if (!snap.exists) return null;
    return {
      ...(snap.data() as EngagementDoc),
      thoughts: thoughtSnap.docs.map((d) => d.data() as Thought),
    };
  }

  async patchEngagement(id: string, patch: SessionMetaPatch): Promise<Session | null> {
    const ref = this.doc(id);
    if (!(await ref.get()).exists) return null;
    await ref.update({ ...patch, ...this.touch() });
    return this.getEngagement(id);
  }

  async addThought(id: string, thought: Thought): Promise<Thought | null> {
    const ref = this.doc(id);
    if (!(await ref.get()).exists) return null;
    const batch = this.db.batch();
    batch.set(ref.collection(THOUGHTS).doc(thought.id), thought);
    batch.update(ref, this.touch());
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
    batch.update(this.doc(id), this.touch());
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
