import { roleOf } from "../../src/utils/roster.ts";
import type { Session } from "../../src/types.ts";

/**
 * Renders a pile for a prompt.
 *
 * Fragments are labelled with the contributor's **role**, never their name. Role is what
 * makes coverage analysis meaningful ("only IT has spoken about data"), and it keeps
 * model-authored characterisations of named individuals out of a document that gets
 * circulated to those individuals. The app holds the fragment-to-author mapping and can
 * re-attach names deterministically when it cites a fragment.
 */
export function renderCorpus(session: Session): string {
  return session.thoughts
    .map((t, idx) => {
      // The roster's role, not the stamp's — the level set reasons about who is in the room
      // now, and a role declared mid-session must apply to what that person already wrote.
      const role = roleOf(session, t.author);
      const label = role ? ` [${role}]` : "";
      return `#${idx + 1}${label} (${t.mode}): ${t.text}`;
    })
    .join("\n");
}

/** Distinct contributor roles in a pile, for prompts that reason about who has spoken. */
export function rolesPresent(session: Session): string[] {
  const roles = new Set<string>();
  for (const stamp of Object.values(session.roster ?? {})) roles.add(stamp.role);
  return [...roles].sort();
}

export function isEngagement(session: Session): boolean {
  return Boolean(session.engagementId);
}
