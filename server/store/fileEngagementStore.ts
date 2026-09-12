/**
 * Local-development store: one JSON file, same spirit as src/utils/localDB.ts.
 *
 * Writes are serialised through a promise chain and committed by atomic rename, so the
 * two-identities-one-server dev workflow does not lose fragments to interleaved writes.
 * Not intended for more than that.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { AuthorStamp, RoleGroup, RosterEntry, Session, Thought } from "../../src/types.ts";
import type {
  EngagementStore,
  EngagementSummary,
  EngagementVersion,
  ServerMetaPatch,
} from "./types.ts";
import { emptyModeProgress, newEngagement } from "./shape.ts";

type Db = Record<string, Session>;

export class FileEngagementStore implements EngagementStore {
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir = ".data") {
    this.file = path.resolve(dir, "engagements.json");
  }

  private async read(): Promise<Db> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as Db;
    } catch (err: any) {
      if (err?.code === "ENOENT") return {};
      throw err;
    }
  }

  private async write(db: Db): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, this.file);
  }

  /** Serialises read-modify-write cycles so concurrent requests cannot clobber each other. */
  private mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const db = await this.read();
      const result = await fn(db);
      await this.write(db);
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  async createEngagement(input: {
    topic: string;
    intention: string;
    creator: AuthorStamp;
  }): Promise<Session> {
    return this.mutate((db) => {
      const session = newEngagement(input);
      db[session.id] = session;
      return structuredClone(session);
    });
  }

  async listEngagements(): Promise<EngagementSummary[]> {
    const db = await this.read();
    return Object.values(db)
      .map((s) => ({
        id: s.id,
        topic: s.topic,
        intention: s.intention,
        status: s.status,
        thoughtCount: s.thoughts.length,
        memberCount: Object.keys(s.roster ?? {}).length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getEngagement(id: string): Promise<Session | null> {
    const db = await this.read();
    return db[id] ? structuredClone(db[id]) : null;
  }

  async getVersion(id: string): Promise<EngagementVersion | null> {
    const db = await this.read();
    const session = db[id];
    if (!session) return null;
    return { updatedAt: session.updatedAt, thoughtCount: session.thoughts.length };
  }

  async patchEngagement(id: string, patch: ServerMetaPatch): Promise<Session | null> {
    return this.mutate((db) => {
      const session = db[id];
      if (!session) return null;
      Object.assign(session, patch, { updatedAt: new Date().toISOString() });
      if (!session.modeProgress) session.modeProgress = emptyModeProgress();
      return structuredClone(session);
    });
  }

  async addThought(id: string, thought: Thought): Promise<Thought | null> {
    return this.mutate((db) => {
      const session = db[id];
      if (!session) return null;
      session.thoughts.unshift(thought);
      session.updatedAt = new Date().toISOString();
      return structuredClone(thought);
    });
  }

  async getThought(id: string, thoughtId: string): Promise<Thought | null> {
    const db = await this.read();
    return db[id]?.thoughts.find((t) => t.id === thoughtId) ?? null;
  }

  async patchThought(
    id: string,
    thoughtId: string,
    patch: Partial<Thought>,
  ): Promise<Thought | null> {
    return this.mutate((db) => {
      const thought = db[id]?.thoughts.find((t) => t.id === thoughtId);
      if (!thought) return null;
      Object.assign(thought, patch);
      db[id].updatedAt = new Date().toISOString();
      return structuredClone(thought);
    });
  }

  async deleteThought(id: string, thoughtId: string): Promise<boolean> {
    return this.mutate((db) => {
      const session = db[id];
      if (!session) return false;
      const before = session.thoughts.length;
      session.thoughts = session.thoughts.filter((t) => t.id !== thoughtId);
      if (session.thoughts.length === before) return false;
      session.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async upsertRosterEntry(id: string, stamp: RosterEntry): Promise<Session | null> {
    return this.mutate((db) => {
      const session = db[id];
      if (!session) return null;
      session.roster = { ...(session.roster ?? {}), [stamp.email]: stamp };
      session.updatedAt = new Date().toISOString();
      return structuredClone(session);
    });
  }

  async setRoleGroup(id: string, key: string, group: RoleGroup | null): Promise<Session | null> {
    return this.mutate((db) => {
      const session = db[id];
      if (!session) return null;
      const groups = { ...(session.roleGroups ?? {}) };
      if (group) groups[key] = group;
      else delete groups[key];
      session.roleGroups = groups;
      session.updatedAt = new Date().toISOString();
      return structuredClone(session);
    });
  }
}
