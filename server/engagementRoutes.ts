import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";
import type { AuthorStamp, Session, Thought } from "../src/types.ts";
import { getEngagementStore } from "./store/index.ts";
import { CONTRIBUTOR_ROLE, FACILITATOR_ROLE, VALID_MODES } from "./store/shape.ts";
import { isSynthesisRunning, synthesizeEngagement } from "./ai/synthesis.ts";
import { sendAiError } from "./ai/respond.ts";

/**
 * Fields any roster member may change on any fragment.
 *
 * "Nobody edits anyone" means nobody rewrites your words — not that nobody may file your
 * card. Sorting the pile together is the collaborative work the shared pile exists for, and
 * five of the twelve modes (card sort, timeline, priority pile, slider, swipe) do nothing
 * else. Restricting these to the author would break them outright in group mode.
 */
const SHARED_FIELDS = [
  "clusterCategory",
  "timelineZone",
  "priorityZone",
  "intensity",
  "swipeStatus",
] as const;

/** Fields only the fragment's author may change. */
const AUTHOR_ONLY_FIELDS = ["text"] as const;

/**
 * Everything a client may write on a fragment, as a type.
 *
 * The two lists above were prose until this existed: they described the rule and enforced
 * nothing, so `sanitizeThoughtPatch` could grow a field neither of them mentioned and the
 * author check below would simply not apply to it. Naming the return type in terms of them
 * makes that a compile error — a new writable field has to be declared shared or author-only
 * before it can be accepted.
 */
type ClientWritableField = (typeof SHARED_FIELDS)[number] | (typeof AUTHOR_ONLY_FIELDS)[number];

type ThoughtPatch = Partial<Pick<Thought, ClientWritableField>>;

const META_FIELDS = [
  "activeMode",
  "modeHistory",
  "modeProgress",
  "status",
  "topic",
  "intention",
  "synthesizedOutline",
  "synthesizedSummary",
  "synthesizedActionItems",
  "advancedSettings",
] as const;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

function displayNameFor(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}

/** Validates the fragment fields a client is allowed to set, ignoring anything else. */
function sanitizeThoughtPatch(body: any): ThoughtPatch {
  const patch: ThoughtPatch = {};
  const text = str(body?.text, 5000);
  if (text !== undefined) patch.text = text;

  if (typeof body?.clusterCategory === "string") {
    patch.clusterCategory = body.clusterCategory.slice(0, 100);
  }
  if (["before", "now", "after"].includes(body?.timelineZone)) {
    patch.timelineZone = body.timelineZone;
  }
  if (["act", "watch", "discard"].includes(body?.priorityZone)) {
    patch.priorityZone = body.priorityZone;
  }
  if (["like", "dislike", "maybe"].includes(body?.swipeStatus)) {
    patch.swipeStatus = body.swipeStatus;
  }
  if (body?.intensity && typeof body.intensity === "object") {
    const intensity: NonNullable<Thought["intensity"]> = {};
    for (const key of ["urgency", "certainty", "emotion", "actionability"] as const) {
      const val = body.intensity[key];
      if (typeof val === "number" && val >= 1 && val <= 10) intensity[key] = val;
    }
    if (Object.keys(intensity).length) patch.intensity = intensity;
  }
  return patch;
}

function sanitizeMetaPatch(body: any) {
  const patch: Record<string, unknown> = {};
  for (const key of META_FIELDS) {
    if (!(key in (body ?? {}))) continue;
    const value = body[key];
    if (key === "activeMode" && !VALID_MODES.includes(value)) continue;
    if (
      key === "status" &&
      !["intake", "intention", "recommendation", "active", "review", "exported"].includes(value)
    ) {
      continue;
    }
    if (key === "advancedSettings" && value && typeof value === "object") {
      // promptingStyle shapes the questions one person is being asked, so it stays local to
      // each viewer. Persisting it would let one member's switch to a socratic tone change
      // everyone else's Guided Drill mid-workshop with no explanation.
      const { promptingStyle, ...shared } = value as Record<string, unknown>;
      patch[key] = shared;
      continue;
    }
    patch[key] = value;
  }
  return patch;
}

/**
 * ETag over the engagement's version. Takes the two fields rather than a Session so the
 * unchanged-poll path can build one from `store.getVersion` without loading the pile.
 */
function etagOf(updatedAt: string, thoughtCount: number): string {
  return `W/"${updatedAt}-${thoughtCount}"`;
}

export function createEngagementRouter() {
  const router = express.Router();

  // A JSON-only body on state-changing routes is the CSRF defence: a cross-site form POST
  // cannot set this content type, and a cross-origin fetch that could is stopped at preflight
  // because the app serves no CORS headers. Do not add cors() without revisiting this.
  // DELETE is exempt: it carries no body, so req.is() can never match, and an HTML form
  // cannot issue one in the first place. A cross-origin fetch that could is stopped at
  // preflight, which the app does not answer.
  router.use((req, res, next) => {
    if (["POST", "PATCH", "PUT"].includes(req.method) && !req.is("application/json")) {
      return res.status(415).json({ error: "Expected Content-Type: application/json" });
    }
    next();
  });

  const identityOf = (req: Request) => req.identity!;

  /** The caller's roster entry, auto-provisioned so nobody is ever blocked from contributing. */
  async function ensureMember(session: Session, email: string): Promise<AuthorStamp> {
    const existing = session.roster?.[email];
    if (existing) return existing;
    const stamp: AuthorStamp = {
      email,
      name: displayNameFor(email),
      role: CONTRIBUTOR_ROLE,
    };
    const store = await getEngagementStore();
    await store.upsertRosterEntry(session.id, stamp);
    return stamp;
  }

  async function loadOr404(id: string, res: Response): Promise<Session | null> {
    const store = await getEngagementStore();
    const session = await store.getEngagement(id);
    if (!session) {
      res.status(404).json({ error: "No such engagement" });
      return null;
    }
    return session;
  }

  router.get("/", async (_req, res) => {
    const store = await getEngagementStore();
    res.json({ engagements: await store.listEngagements() });
  });

  router.post("/", async (req, res) => {
    const topic = str(req.body?.topic, 500);
    if (!topic) return res.status(400).json({ error: "topic is required" });
    const { email } = identityOf(req);
    const store = await getEngagementStore();
    const session = await store.createEngagement({
      topic,
      intention: str(req.body?.intention, 500) ?? "Unclutter scatter",
      creator: {
        email,
        name: str(req.body?.name, 120) ?? displayNameFor(email),
        role: str(req.body?.role, 120) ?? FACILITATOR_ROLE,
      },
    });
    res.status(201).json(session);
  });

  // The hot route: every open tab polls this, and almost every poll is a 304. Settle that
  // against the version alone — two Firestore reads — instead of loading the pile to discover
  // nothing changed, which billed a read per fragment per tab per poll.
  router.get("/:id", async (req, res) => {
    const store = await getEngagementStore();
    const inbound = req.get("if-none-match");
    if (inbound) {
      const version = await store.getVersion(req.params.id);
      if (!version) return res.status(404).json({ error: "No such engagement" });
      const etag = etagOf(version.updatedAt, version.thoughtCount);
      if (inbound === etag) {
        res.setHeader("ETag", etag);
        return res.status(304).end();
      }
    }

    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    // Recomputed from the session actually being sent, so the ETag always describes the body
    // even if the pile moved between the version check and the load.
    res.setHeader("ETag", etagOf(session.updatedAt, session.thoughts.length));
    res.json(session);
  });

  // Joining is explicit and open to anyone who reached the app, because IAP has already
  // decided who may be here. Without this an invited SME could never enter the roster.
  router.post("/:id/join", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    const stamp = await ensureMember(session, identityOf(req).email);
    res.json({
      engagement: await (await getEngagementStore()).getEngagement(session.id),
      you: stamp,
    });
  });

  router.patch("/:id", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    await ensureMember(session, identityOf(req).email);
    const patch = sanitizeMetaPatch(req.body);
    if (!Object.keys(patch).length) return res.status(400).json({ error: "No updatable fields" });
    const store = await getEngagementStore();
    res.json(await store.patchEngagement(session.id, patch));
  });

  router.post("/:id/thoughts", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    const text = str(req.body?.text, 5000);
    if (!text) return res.status(400).json({ error: "text is required" });

    const author = await ensureMember(session, identityOf(req).email);
    const mode = VALID_MODES.includes(req.body?.mode) ? req.body.mode : session.activeMode;

    // id, timestamp and author are stamped here, never accepted from the client.
    const thought: Thought = {
      ...sanitizeThoughtPatch(req.body),
      id: randomUUID(),
      text,
      timestamp: new Date().toISOString(),
      mode,
      author,
    };
    const promptContext = str(req.body?.promptContext, 500);
    if (promptContext) thought.promptContext = promptContext;

    const saved = await (await getEngagementStore()).addThought(session.id, thought);
    res.status(201).json(saved);
  });

  router.patch("/:id/thoughts/:tid", async (req, res) => {
    const store = await getEngagementStore();
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    const thought = await store.getThought(session.id, req.params.tid);
    if (!thought) return res.status(404).json({ error: "No such thought" });

    await ensureMember(session, identityOf(req).email);
    const patch = sanitizeThoughtPatch(req.body);
    const isAuthor = thought.author?.email === identityOf(req).email;

    const forbidden = AUTHOR_ONLY_FIELDS.filter((f) => f in patch);
    if (!isAuthor && forbidden.length) {
      return res.status(403).json({
        error: `Only the author may change: ${forbidden.join(", ")}`,
      });
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "No updatable fields" });
    }
    res.json(await store.patchThought(session.id, req.params.tid, patch));
  });

  router.delete("/:id/thoughts/:tid", async (req, res) => {
    const store = await getEngagementStore();
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    const thought = await store.getThought(session.id, req.params.tid);
    if (!thought) return res.status(404).json({ error: "No such thought" });
    if (thought.author?.email !== identityOf(req).email) {
      return res.status(403).json({ error: "Only the author may delete a fragment" });
    }
    await store.deleteThought(session.id, req.params.tid);
    res.status(204).end();
  });

  /**
   * The group deliverable. Explicit and single-flight: never fired automatically on render,
   * and concurrent callers join the run in progress rather than starting another.
   */
  router.post("/:id/synthesize", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    if (!session.thoughts.length) {
      return res.status(400).json({ error: "Nothing to synthesize yet" });
    }
    const author = await ensureMember(session, identityOf(req).email);
    try {
      const { levelSet, joined } = await synthesizeEngagement(session, author.email, {
        outputFilter: req.body?.outputFilter,
        cognitiveBiasAudit: req.body?.cognitiveBiasAudit,
      });
      // 202 tells the caller it attached to a run someone else started.
      res.status(joined ? 202 : 200).json(levelSet);
    } catch (e) {
      // Nothing is written on failure: a placeholder in a shared client deliverable reads
      // like a real result, and nobody would know to regenerate it. 503 rather than 500 is
      // the point — "nothing was written, try again" — and a 429 passes through so a caller
      // backs off instead of hammering a quota.
      sendAiError(res, "Synthesis", e, 503);
    }
  });

  router.get("/:id/synthesize/status", async (req, res) => {
    res.json({ running: isSynthesisRunning(req.params.id) });
  });

  router.get("/:id/roster", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    res.json({ roster: session.roster ?? {} });
  });

  // Self-service only: you may correct your own display name and role, nobody else's.
  router.put("/:id/roster/me", async (req, res) => {
    const session = await loadOr404(req.params.id, res);
    if (!session) return;
    const { email } = identityOf(req);
    const current = await ensureMember(session, email);
    const stamp: AuthorStamp = {
      email,
      name: str(req.body?.name, 120) ?? current.name,
      role: str(req.body?.role, 120) ?? current.role,
    };
    const store = await getEngagementStore();
    await store.upsertRosterEntry(session.id, stamp);
    res.json(stamp);
  });

  return router;
}

export { SHARED_FIELDS, AUTHOR_ONLY_FIELDS };
