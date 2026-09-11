import type { AreaCoverage, AreaStatus, AuthorStamp, RoleGroup, Session } from "../types";
import { contentWords, stem } from "./chorus";
import { isDeclaredRole, roleOf } from "./roster";

/**
 * What counts as one voice — and so what the coverage map means by "more than one".
 *
 * `voices` is a count of distinct roles across an area's fragments, and roles are free text:
 * the roster panel asks people what they own rather than offering a list. Counted as raw
 * strings, "Finance" and "finance" were two voices, and two is exactly what an area needs to be
 * printed as **defined** in a client deliverable. A count this app promises is arithmetic was
 * arithmetic over spellings.
 *
 * Two tiers, and the line between them is the design:
 *
 * **A spelling is not a voice.** `roleKey` folds case, spacing and Unicode width before anything
 * is counted. Nobody means "Finance " and "finance" as two parts of a business, so nobody is
 * asked.
 *
 * **Everything past spelling is the room's call.** Whether "FP&A" and "Treasury" are both
 * Finance, or a split that matters, is a judgement about somebody's organisation. So it is a
 * decision a person makes and is named against — `Session.roleGroups`, written through its own
 * route — never an inference. `groupingSuggestions` points at labels sharing a word and stops
 * there: it can see that "Finance" and "Finance lead" might be one voice, it cannot see that
 * "FP&A" is, and it merges nothing. Same rule as coverage.ts and chorus.ts: counting is not a
 * model's job, and deciding that two roles are the same is not a heuristic's.
 *
 * What a person typed is never rewritten. The label stays on the roster and on their fragments;
 * a group is a second fact, about the engagement, saying what that label counts as.
 */

/**
 * The thresholds behind an area's status.
 *
 * Here rather than in server/ai/coverage.ts because the map recounts in the browser: a regroup
 * changes `voices` without a new level set, and a status left over from the old count beside
 * the new one would contradict itself on the same cell.
 */
const PARTIAL_AT = 1; // at least this many fragments to be more than dark
const DEFINED_AT = 12; // and this many, from more than one voice, to count as defined

export function areaStatus(fragments: number, voices: number): AreaStatus {
  if (fragments >= DEFINED_AT && voices > 1) return "defined";
  if (fragments >= PARTIAL_AT) return "partial";
  return "dark";
}

/** The form a label is counted under. Two labels with the same key are one voice, always. */
export function roleKey(label: string): string {
  return label.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface Voice {
  /** What is counted. */
  key: string;
  /** What is shown, and what the model reads. */
  name: string;
}

/**
 * The voice a role label counts under, following the room's groupings.
 *
 * Groupings chain — "FP&A" under "Finance", and later "Finance" under "Commercial" — because a
 * group name is itself a label somebody may type, and making the second decision silently strand
 * the first would be worse than following it. A loop is resolved to the lowest key in it, so
 * every label in the loop lands on the same voice whichever one the walk started from; the UI
 * only offers groups that end a chain, so a loop needs a hand-written store to arise at all.
 *
 * The server's two defaults never group. They are what an undeclared person carries, not a part
 * of the business, and folding one into a real role would count somebody's declaration as
 * nobody's — or nobody's as somebody's.
 */
export function resolveVoice(session: Session, label: string): Voice {
  let current: Voice = { key: roleKey(label), name: label.trim() };
  if (!isDeclaredRole(label)) return current;

  const groups = session.roleGroups ?? {};
  const walked: string[] = [];
  for (;;) {
    const entry = groups[current.key];
    if (!entry || !isDeclaredRole(entry.group)) return current;
    const next: Voice = { key: roleKey(entry.group), name: entry.group.trim() };
    // A label grouped under its own spelling was looked at and kept separate.
    if (next.key === current.key) return current;

    walked.push(current.key);
    const loop = walked.indexOf(next.key);
    if (loop !== -1) {
      const key = walked.slice(loop).sort()[0];
      return { key, name: groups[key]?.label.trim() ?? key };
    }
    current = next;
  }
}

/** The voice a fragment counts under: the author's current role, then the room's grouping. */
export function voiceOf(session: Session, author: AuthorStamp | undefined): Voice | undefined {
  const role = roleOf(session, author);
  return role ? resolveVoice(session, role) : undefined;
}

/** Distinct voices among some fragments. Ids no longer in the pile are skipped, not guessed. */
export function voicesIn(session: Session, fragmentIds: string[]): number {
  const byId = new Map((session.thoughts ?? []).map((t) => [t.id, t]));
  const keys = new Set<string>();
  for (const id of fragmentIds) {
    const voice = voiceOf(session, byId.get(id)?.author);
    if (voice) keys.add(voice.key);
  }
  return keys.size;
}

/**
 * A stored coverage map, recounted against the roster and the groupings as they are now.
 *
 * The map is written at synthesis time, and before this a role declared or a label grouped
 * afterwards changed nothing on it until somebody regenerated. The fragments behind each area
 * are persisted, so the voices can be counted again for free; which area a fragment is *in* is
 * the classifier's answer and is left exactly as it was.
 *
 * `changed` is what lets the map say its prose is older than its numbers. The level set's
 * conflicts and open questions were written by a model reading the old labels, and no amount of
 * arithmetic here can rewrite those.
 */
export function recountCoverage(
  session: Session,
  coverage: AreaCoverage[],
): { coverage: AreaCoverage[]; changed: boolean } {
  let changed = false;
  const recounted = coverage.map((area) => {
    const voices = voicesIn(session, area.fragmentIds ?? []);
    const status = areaStatus(area.fragments, voices);
    if (voices === area.voices && status === area.status) return area;
    changed = true;
    return { ...area, voices, status };
  });
  return { coverage: recounted, changed };
}

export interface RoleLabel {
  key: string;
  /** The most common spelling in the room, so a row reads the way people wrote it. */
  label: string;
  /** Roster names carrying this label. Empty for a label only a departed author left behind. */
  members: string[];
  voice: Voice;
  /** The decision somebody made about this label, if anybody has. */
  entry?: RoleGroup;
}

/** Every declared label in the engagement, one row per key. Defaults are not labels. */
export function roleLabels(session: Session): RoleLabel[] {
  const spellings = new Map<string, Map<string, number>>();
  const members = new Map<string, string[]>();
  const note = (role: string, member?: string) => {
    if (!isDeclaredRole(role)) return;
    const key = roleKey(role);
    const counts = spellings.get(key) ?? new Map<string, number>();
    counts.set(role.trim(), (counts.get(role.trim()) ?? 0) + 1);
    spellings.set(key, counts);
    const names = members.get(key) ?? [];
    if (member) names.push(member);
    members.set(key, names);
  };

  for (const member of Object.values(session.roster ?? {})) note(member.role, member.name);
  // A fragment whose author has left the roster still counts under its stamp (see roleOf), so
  // its label has to be reachable here or it could be counted and never grouped.
  for (const t of session.thoughts ?? []) {
    if (t.author && !session.roster?.[t.author.email.toLowerCase()]) note(t.author.role);
  }

  return [...spellings.entries()]
    .map(([key, counts]) => {
      // Most people's spelling. On a tie, the one with more capitals — somebody who wrote
      // "Finance" was writing a name, and a lowercase word winning on alphabetical order reads
      // as a typo the app picked. Then alphabetical, so the poll cannot flip it.
      const capitals = (s: string) => s.replace(/[^A-Z]/g, "").length;
      const label = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || capitals(b[0]) - capitals(a[0]) || a[0].localeCompare(b[0]),
      )[0][0];
      return {
        key,
        label,
        members: (members.get(key) ?? []).sort((a, b) => a.localeCompare(b)),
        voice: resolveVoice(session, label),
        entry: session.roleGroups?.[key],
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface VoiceGroup {
  key: string;
  name: string;
  labels: RoleLabel[];
}

/** Labels gathered under the voice each counts as — what the model and the grouping UI read. */
export function voiceGroups(session: Session): VoiceGroup[] {
  const byKey = new Map<string, VoiceGroup>();
  for (const label of roleLabels(session)) {
    const group = byKey.get(label.voice.key) ?? {
      key: label.voice.key,
      name: label.voice.name,
      labels: [],
    };
    group.labels.push(label);
    byKey.set(label.voice.key, group);
  }
  for (const group of byKey.values()) {
    // A group that is also somebody's own label is named the way they spelled it.
    const own = group.labels.find((l) => l.key === group.key);
    if (own) group.name = own.label;
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Words that say how senior or how attached somebody is rather than which part of the business
 * they speak for. "Finance lead" and "Engineering lead" sharing "lead" is not a suggestion.
 */
const ROLE_FILLER = new Set(
  `lead head manager director senior junior chief officer principal associate assistant deputy
   interim acting owner owns runs running responsible team staff member global regional group
   function department dept rep representative svp evp`
    .split(/\s+/)
    .filter(Boolean),
);

/** A label's distinguishing words, keyed by stem and valued as written. */
function roleWords(text: string): Map<string, string> {
  const words = new Map<string, string>();
  const add = (word: string, key: string) => {
    if (!ROLE_FILLER.has(word) && !ROLE_FILLER.has(key) && !words.has(key)) words.set(key, word);
  };
  for (const word of contentWords(text)) add(word, stem(word));
  // contentWords drops anything under three letters, which would lose "HR" and "IT" — two of the
  // commonest role labels there are. Only when written as capitals, so "it" the pronoun stays out.
  for (const acronym of text.match(/\b[A-Z]{2}\b/g) ?? []) add(acronym.toLowerCase(), acronym);
  return words;
}

export interface GroupingSuggestion {
  a: RoleLabel;
  b: RoleLabel;
  /** The words they share, as somebody wrote them. */
  shared: string[];
}

/**
 * Pairs of labels that share a word and are still counted as two voices.
 *
 * A suggestion, never a merge — see the note at the top of this file. It stops appearing once
 * both labels carry a decision, so "keep separate" is an answer and not a snooze; a label that
 * arrives later with the same word is new, and is asked about again.
 *
 * One suggestion per pair of voices. A label that ends a chain is preferred as the one named, so
 * a newcomer typing "Finance lead" is offered "Finance" rather than whichever label happened to be
 * grouped under it.
 */
export function groupingSuggestions(session: Session): GroupingSuggestion[] {
  const labels = roleLabels(session).sort(
    (a, b) =>
      Number(b.key === b.voice.key) - Number(a.key === a.voice.key) ||
      a.label.localeCompare(b.label),
  );
  const words = new Map(
    labels.map((l) => [l.key, new Map([...roleWords(l.voice.name), ...roleWords(l.label)])]),
  );

  const seen = new Set<string>();
  const found: GroupingSuggestion[] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const [a, b] = [labels[i], labels[j]];
      if (a.voice.key === b.voice.key || (a.entry && b.entry)) continue;
      const pair = [a.voice.key, b.voice.key].sort().join(" ");
      if (seen.has(pair)) continue;
      const theirs = words.get(b.key)!;
      const shared = [...words.get(a.key)!].filter(([key]) => theirs.has(key)).map(([, w]) => w);
      if (!shared.length) continue;
      seen.add(pair);
      found.push({ a, b, shared });
    }
  }
  return found;
}
