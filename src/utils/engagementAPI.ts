import { AuthorStamp, Session, Thought } from "../types";

export interface ViewerIdentity {
  email: string;
  name: string;
  role: string | null;
  /** True when the identity is asserted by local dev config rather than verified by IAP. */
  dev: boolean;
  aiEnabled: boolean;
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

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = (url: string, body?: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

const patch = (url: string, body: unknown) =>
  fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function whoami(): Promise<ViewerIdentity> {
  return json<ViewerIdentity>(await fetch("/api/whoami"));
}

export async function listEngagements(): Promise<EngagementSummary[]> {
  const data = await json<{ engagements: EngagementSummary[] }>(await fetch("/api/engagement"));
  return data.engagements;
}

export async function createEngagement(input: {
  topic: string;
  intention?: string;
  role?: string;
}): Promise<Session> {
  return json<Session>(await post("/api/engagement", input));
}

export async function joinEngagement(id: string): Promise<Session> {
  const data = await json<{ engagement: Session; you: AuthorStamp }>(
    await post(`/api/engagement/${id}/join`),
  );
  return data.engagement;
}

/**
 * Fetches an engagement, using the ETag to skip the payload when nothing has changed.
 *
 * `session` is null on a 304 so the caller can leave its state alone. `polling` always
 * answers, because it rides a header rather than the body: almost every poll is a 304, and a
 * count of who is here that only moved when the pile moved would sit still in exactly the
 * quiet room it exists to describe.
 */
export async function fetchEngagement(
  id: string,
  etag?: string,
): Promise<{ session: Session | null; etag: string | null; polling: number | null }> {
  const res = await fetch(`/api/engagement/${id}`, {
    headers: etag ? { "If-None-Match": etag } : {},
  });
  const header = res.headers.get("X-Extraction-Polling");
  const polling = header !== null && Number.isFinite(Number(header)) ? Number(header) : null;
  if (res.status === 304) return { session: null, etag: etag ?? null, polling };
  const session = await json<Session>(res);
  return { session, etag: res.headers.get("ETag"), polling };
}

export async function patchEngagement(id: string, updates: Partial<Session>): Promise<Session> {
  return json<Session>(await patch(`/api/engagement/${id}`, updates));
}

export async function addThought(
  id: string,
  thought: Partial<Thought> & { text: string },
): Promise<Thought> {
  return json<Thought>(await post(`/api/engagement/${id}/thoughts`, thought));
}

export async function patchThought(
  id: string,
  thoughtId: string,
  updates: Partial<Thought>,
): Promise<Thought> {
  return json<Thought>(await patch(`/api/engagement/${id}/thoughts/${thoughtId}`, updates));
}

export async function deleteThought(id: string, thoughtId: string): Promise<void> {
  const res = await fetch(`/api/engagement/${id}/thoughts/${thoughtId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `Delete failed (${res.status})`);
  }
}

export async function updateMyRosterEntry(
  id: string,
  entry: { name?: string; role?: string },
): Promise<AuthorStamp> {
  return json<AuthorStamp>(
    await fetch(`/api/engagement/${id}/roster/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    }),
  );
}
