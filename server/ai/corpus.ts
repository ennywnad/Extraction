import { isDeclaredRole, roleOf } from "../../src/utils/roster.ts";
import { resolveVoice, roleKey, voiceGroups } from "../../src/utils/voices.ts";
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
      const label = role ? ` [${voiceLabel(session, role)}]` : "";
      return `#${idx + 1}${label} (${t.mode}): ${t.text}`;
    })
    .join("\n");
}

/**
 * A role as the model reads it. When the room grouped it, the group comes first so two labels
 * counted as one voice read as one — and the specific label stays after it, because which part
 * of Finance said something is exactly what "which role is best placed to answer" needs.
 */
function voiceLabel(session: Session, role: string): string {
  const voice = resolveVoice(session, role);
  return voice.key === roleKey(role) ? role : `${voice.name} / ${role}`;
}

/**
 * What members wrote about their own position, one line each, labelled exactly as their fragments
 * are in `renderCorpus` — so the model joins a brief to what that role said by the same token.
 *
 * Never by name, for `renderCorpus`'s reason: a brief is the one place a named person describes
 * themselves, and the deliverable goes back to them. Two people under one label are two
 * unattributed lines under it.
 *
 * Declared roles only. A brief filed under a server default would read as describing every
 * fragment labelled [Contributor] — which is everybody who has not declared.
 */
export function roleBriefs(session: Session): string[] {
  return Object.values(session.roster ?? {})
    .filter((m) => m.brief?.trim() && isDeclaredRole(m.role))
    .map((m) => `- [${voiceLabel(session, m.role.trim())}] ${m.brief!.replace(/\s+/g, " ").trim()}`)
    .sort();
}

/**
 * The voices present, for prompts that reason about who has spoken. A group lists the labels
 * gathered under it, so "Finance" in the corpus is known to mean FP&A and Treasury here.
 */
export function rolesPresent(session: Session): string[] {
  const members = Object.values(session.roster ?? {});
  const onRoster = new Set(members.map((m) => roleKey(m.role)));
  const voices = voiceGroups(session)
    .filter((v) => v.labels.some((l) => onRoster.has(l.key)))
    .map((v) => {
      const under = v.labels.filter((l) => l.key !== v.key).map((l) => l.label);
      return under.length ? `${v.name} (${under.join(", ")})` : v.name;
    });
  const defaults = members.map((m) => m.role.trim()).filter((r) => !isDeclaredRole(r));
  return [...new Set([...voices, ...defaults])].sort();
}

export function isEngagement(session: Session): boolean {
  return Boolean(session.engagementId);
}
