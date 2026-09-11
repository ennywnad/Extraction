/**
 * Who is standing next to a fragment, and which fragments are standing alone.
 *
 * The app measures one silence well. `server/ai/coverage.ts` answers *which areas has nobody
 * spoken into*, it answers it by counting rather than by asking a model, and CoverageMap draws
 * it. What it cannot answer is the other silence: **which things did only one person say.**
 * Those are different, and the difference matters — an area can be green, with twelve
 * fragments and three roles in it, and every one of those fragments can be a lone voice that
 * nobody else in the room ever touched. That engagement reads as covered and is not.
 *
 * A shared pile makes this worse rather than better. Twelve people writing simultaneously into
 * one box is twelve parallel monologues, and nothing in the app has ever told any of them
 * whether anyone else was near them.
 *
 * ## Two rules this is built on
 *
 * **It counts; it does not interpret.** Same discipline as coverage: a claim put in front of
 * the people who wrote the fragments has to be right every time, so what is computed here is
 * literally "these fragments contain these same uncommon words" and the UI is allowed to say
 * exactly that and no more. It is a lexical reading, not a semantic one — two people saying
 * the same thing in different words are two lone voices here, and the panel says so rather
 * than implying a comprehension it does not have.
 *
 * **Nothing here calls a model, and that is a design decision rather than a fallback.** This
 * fires on every fragment, from every participant, for the whole session — it would be by a
 * wide margin the highest-volume AI call in the app, well above synthesis, which is
 * single-flight per engagement and capped at ten per window for good reason. And the part a
 * model would add is the *wording*, which is the exact part that must not editorialise: a
 * model that phrases "nobody else is near this" as a judgement does damage a count cannot.
 * So there is no route, no prompt module, and no `sendFallback` here, because there is nothing
 * to fall back from. It behaves identically on a deployment with no Gemini configured.
 */
import type { AuthorStamp, ExtractionMode, Session, Thought } from "../types";

/** Below this many fragments, "nobody else is near you" is a fact about the pile, not the room. */
export const MIN_PILE = 8;

/** Distinctive words a fragment needs before its solitude means anything. */
const MIN_TOKENS = 3;

/**
 * How much of the pile a phrase may appear in and still count as distinctive.
 *
 * Everyone writing about an ERP migration writes "migration". Two fragments sharing it are not
 * neighbours, they are both on topic — so a phrase past this share links nothing.
 */
const DISTINCTIVE_SHARE = 0.34;

/** Neighbours to hand back. Three is what fits on a card somebody reads in four seconds. */
const TOP_N = 3;

// A general English list plus the filler a workshop generates. Deliberately not exhaustive: a
// stopword that slips through can at worst name a shared term badly, while a real word wrongly
// suppressed removes a link silently.
const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren as at be because been
   before being below between both but by can cannot could couldn did didn do does doesn doing
   anybody anyone don down during each everybody everyone few for from further had hadn has
   hasn have haven having he her here
   hers him himself his how i if in into is isn it its itself just let ll me more most mustn my
   myself no nor not now of off on once only or other others ought our ours ourselves out over
   own re same shan she should shouldn so some such than that the their theirs them themselves
   then there these they this those through to too under until up very was wasn we were weren
   what when where which while who whom why will with won would wouldn you your yours yourself
   yourselves
   actually already always another anything basically bit come comes different done else even
   ever everything first getting give given goes going gone good got great happen happens hard
   keep keeps kind know known lot lots made make makes making many maybe mean means much must
   never new next nobody nothing okay part parts people probably put puts quite rather really
   said say
   says see seem seems seen somebody someone still stuff sure take takes talk tell thing things
   think thought times told took try trying use used uses using want wants well went whether
   work works yeah yes yet`
    .split(/\s+/)
    .filter(Boolean),
);

const WORD = /[a-z][a-z0-9'’-]*/g;

/**
 * Collapses the endings that would otherwise separate "the integrations" from "integration".
 *
 * Crude on purpose. A real stemmer is a dependency and a much larger surface for something
 * whose worst failure is a missed link; this handles the plurals and participles that actually
 * split words in a pile of English notes, and where it is wrong nobody sees it — every term
 * shown to a human is the surface form somebody typed, never this.
 */
export function stem(word: string): string {
  const w = word.replace(/['’]s$/, "");
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && /(?:ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed") && !w.endsWith("eed")) return w.slice(0, -2);
  return w;
}

/** The words of a fragment that carry any weight, in order, lowercased. */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(WORD) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w),
  );
}

/**
 * The phrases a fragment can be linked by: each content word, and each adjacent pair.
 *
 * Adjacency is measured after the stopwords are dropped, so "data and reporting" offers the
 * pair a reader would name it by. The cost is the occasional pair straddling a sentence break,
 * which is noise that has to recur in two separate fragments to link anything and effectively
 * never does.
 *
 * Keyed by stem, valued by the surface form it came from — so the terms a card shows are the
 * ones people actually wrote.
 */
function phrasesOf(text: string): Map<string, string> {
  const words = contentWords(text);
  const found = new Map<string, string>();
  for (let i = 0; i < words.length; i++) {
    const key = stem(words[i]);
    if (!found.has(key)) found.set(key, words[i]);
    if (i + 1 < words.length) {
      const pair = `${key} ${stem(words[i + 1])}`;
      if (!found.has(pair)) found.set(pair, `${words[i]} ${words[i + 1]}`);
    }
  }
  return found;
}

export interface ChorusIndex {
  thoughts: Thought[];
  /** The pile by id, so a whole-pile tally stays a scan rather than a scan inside a scan. */
  byId: Map<string, Thought>;
  /** Fragment id -> its phrases, keyed by stem. */
  phrases: Map<string, Map<string, string>>;
  /** Phrase stem -> the fragment ids containing it. */
  postings: Map<string, string[]>;
  /** Phrase stem -> the surface form to show, the commonest one people wrote. */
  surface: Map<string, string>;
  /** Stems of the topic itself, which link nothing because everyone is using them. */
  topicStems: Set<string>;
  /** The largest posting list a phrase may have and still be distinctive. */
  ceiling: number;
  /** True when the pile is below MIN_PILE and nothing can honestly be claimed about it. */
  tooSmall: boolean;
}

/**
 * Indexes a pile once, so a card and a whole-pile tally are one pass rather than two.
 *
 * Rebuild it when the pile changes; it is a few thousand small string operations over a pile
 * of a couple of hundred fragments and runs inside a render without being noticed.
 */
export function buildIndex(session: Session): ChorusIndex {
  const thoughts = session.thoughts ?? [];
  const phrases = new Map<string, Map<string, string>>();
  const postings = new Map<string, string[]>();
  const forms = new Map<string, Map<string, number>>();

  for (const t of thoughts) {
    const found = phrasesOf(t.text);
    phrases.set(t.id, found);
    for (const [key, form] of found) {
      const list = postings.get(key);
      if (list) list.push(t.id);
      else postings.set(key, [t.id]);
      const seen = forms.get(key) ?? forms.set(key, new Map()).get(key)!;
      seen.set(form, (seen.get(form) ?? 0) + 1);
    }
  }

  // Commonest surface form, alphabetical on a tie, so a term never flickers between polls.
  const surface = new Map<string, string>();
  for (const [key, seen] of forms) {
    let best = "";
    let bestN = -1;
    for (const [form, n] of [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (n > bestN) {
        best = form;
        bestN = n;
      }
    }
    surface.set(key, best);
  }

  return {
    thoughts,
    byId: new Map(thoughts.map((t) => [t.id, t])),
    phrases,
    postings,
    surface,
    topicStems: new Set(contentWords(session.topic ?? "").map(stem)),
    ceiling: Math.max(3, Math.ceil(thoughts.length * DISTINCTIVE_SHARE)),
    tooSmall: thoughts.length < MIN_PILE,
  };
}

/** Whether a phrase is uncommon enough, and off-topic enough, to mean anything. */
function isDistinctive(index: ChorusIndex, key: string): boolean {
  const df = index.postings.get(key)?.length ?? 0;
  if (df < 2 || df > index.ceiling) return false;
  // A pair survives a topic word as long as the other half is not one too: in an engagement
  // about a migration, "migration" links nothing and "migration owner" is the finding.
  return !key.split(" ").every((part) => index.topicStems.has(part));
}

export interface Neighbour {
  id: string;
  text: string;
  mode: Thought["mode"];
  timestamp: string;
  author?: AuthorStamp;
  /** The terms both fragments contain, as people wrote them. Most distinctive first. */
  shared: string[];
}

export interface Echo {
  /** Nearest first, at most TOP_N. */
  neighbours: Neighbour[];
  /** How many neighbours are somebody else's. Zero in a solo pile, where nobody else exists. */
  others: number;
  /** How many are the writer's own — "you have circled this before". */
  mine: number;
  /** Nothing in the pile shares distinctive words with this. Only meaningful when silent is null. */
  isolated: boolean;
  /**
   * Why there is nothing to say, when there is nothing to say.
   *
   * Distinguishing these is the whole safety of the feature. "The pile is too small" and "you
   * wrote three words" are facts about the input; only `null` licenses the app to tell somebody
   * they are the only voice on something.
   */
  silent: "pile" | "thin" | null;
}

/**
 * Who else is near one fragment.
 *
 * `target.id` is excluded from its own neighbours, and so is any fragment with identical text —
 * in group mode the server re-issues the id it stamped, so for a few seconds after a
 * contribution the same words are in the pile under an id this caller has never seen.
 */
export function echoFor(
  index: ChorusIndex,
  target: { id?: string; text: string; authorEmail?: string },
): Echo {
  const nothing = (silent: Echo["silent"]): Echo => ({
    neighbours: [],
    others: 0,
    mine: 0,
    isolated: false,
    silent,
  });

  if (index.tooSmall) return nothing("pile");
  if (contentWords(target.text).length < MIN_TOKENS) return nothing("thin");

  const own = target.text.trim();
  // Reused from the index when the target is already in the pile, which is both the common
  // case and every case in `tally` — a whole-pile pass would otherwise re-tokenise the pile.
  const mineTerms = (target.id && index.phrases.get(target.id)) || phrasesOf(target.text);
  const total = index.thoughts.length;

  // stem -> the fragments that share it with the target, restricted to distinctive terms.
  const shared = new Map<string, string[]>();
  for (const key of mineTerms.keys()) {
    if (!isDistinctive(index, key)) continue;
    const hits = (index.postings.get(key) ?? []).filter(
      (id) => id !== target.id && index.byId.get(id)?.text.trim() !== own,
    );
    if (hits.length) shared.set(key, hits);
  }

  const idf = (key: string) => Math.log(1 + total / (index.postings.get(key)?.length ?? 1));

  // A single shared word is a coincidence; two are a link, and one shared *phrase* is worth
  // more than either. Without this rule the commonest word in the pile introduces everybody.
  const perFragment = new Map<string, { keys: string[]; score: number }>();
  for (const [key, ids] of shared) {
    for (const id of ids) {
      const entry = perFragment.get(id) ?? perFragment.set(id, { keys: [], score: 0 }).get(id)!;
      entry.keys.push(key);
      entry.score += idf(key);
    }
  }

  const linked = [...perFragment.entries()]
    .filter(([, e]) => e.keys.some((k) => k.includes(" ")) || e.keys.length >= 2)
    .sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1))
    .slice(0, TOP_N);

  const neighbours: Neighbour[] = linked.map(([id, entry]) => {
    const t = index.byId.get(id)!;
    return {
      id,
      text: t.text,
      mode: t.mode,
      timestamp: t.timestamp,
      author: t.author,
      shared: entry.keys
        .slice()
        .sort((a, b) => idf(b) - idf(a) || (a < b ? -1 : 1))
        .slice(0, 3)
        .map((k) => index.surface.get(k) ?? k),
    };
  });

  // "Somebody else" needs an author to be somebody. A solo pile carries none, so every
  // neighbour there is the writer's own and `others` is honestly zero rather than unknown.
  const isSomebodyElse = (n: Neighbour) =>
    Boolean(n.author) && n.author!.email !== target.authorEmail;
  const others = new Set(neighbours.filter(isSomebodyElse).map((n) => n.author!.email)).size;

  return {
    neighbours,
    others,
    mine: neighbours.filter((n) => !isSomebodyElse(n)).length,
    isolated: neighbours.length === 0,
    silent: null,
  };
}

export interface Tally {
  total: number;
  /** Fragments long enough to be judged at all. */
  considered: number;
  /** Of those, the ones nothing else in the pile is near. */
  lone: number;
  loneIds: string[];
  /** Too few distinctive words to say anything about — counted apart, never called lone. */
  thin: number;
  tooSmall: boolean;
}

/**
 * The same question asked of the whole pile: how much of this has anybody echoed?
 *
 * This is the half a facilitator needs. A card that appears for one person for four seconds
 * cannot tell a room that a third of what it has said was said once and dropped.
 */
export function tally(index: ChorusIndex): Tally {
  const total = index.thoughts.length;
  if (index.tooSmall) {
    return { total, considered: 0, lone: 0, loneIds: [], thin: 0, tooSmall: true };
  }

  const loneIds: string[] = [];
  let thin = 0;

  for (const t of index.thoughts) {
    if (contentWords(t.text).length < MIN_TOKENS) {
      thin += 1;
      continue;
    }
    const echo = echoFor(index, { id: t.id, text: t.text, authorEmail: t.author?.email });
    if (echo.isolated) loneIds.push(t.id);
  }

  return {
    total,
    considered: total - thin,
    lone: loneIds.length,
    loneIds,
    thin,
    tooSmall: false,
  };
}

/** Mode ids as a reader would say them; the card names where a neighbour came from. */
export function modeLabel(mode: ExtractionMode | "system"): string {
  return mode.replaceAll("_", " ");
}
