/**
 * The browser's own model seam — one contract, one adapter per runtime, and no caller that
 * names a runtime.
 *
 * Same shape and the same reasons as server/ai/providers/, at a fraction of the size, because
 * the tasks are tiny and bounded: docs/intents/006 asks a local model to pick one label from a
 * fixed set for *your own draft, in your own browser, before you submit it*. Nothing here ever
 * sees the pile, anybody else's fragment, or a credential.
 *
 * **The contract is the task, not the mechanism.** A caller says "score this text against these
 * labels" and gets scores back. It does not know whether that happened by embedding both sides
 * and taking a cosine, by asking a chat model, or by a runtime that has not been written yet.
 * That is the same line server/ai/client.ts draws when a route says `generate({ prompt, schema })`
 * — and it is what lets the two backends 006 names sit behind one seam rather than one being
 * bolted onto the other.
 *
 * **Judgement lives above this, not inside it.** An adapter returns numbers. Whether a number is
 * good enough to put in front of an author is decided once, in suggest.ts, for the same reason
 * coverage.ts does its own arithmetic: a threshold that each adapter applied for itself would
 * drift between them, and the one thing a suggestion must never do is look confident because a
 * different runtime was more generous with its scale.
 */

/**
 * The runtimes an assist can reach. The list is closed; adding one is adding an adapter.
 *
 * `in-page` is named for where it runs rather than for what accelerates it. It uses WebGPU
 * where there is one and WASM where there is not, and the difference is speed rather than
 * capability — so calling it `webgpu` would put a claim in the type that is false on most of
 * the machines it actually runs on, including every one where it matters that it still works.
 */
export type LocalBackend = "in-page" | "ollama";

/**
 * One candidate label, and the example fragments that stand for it.
 *
 * `id` is what the app stores; `texts` is what the model is actually shown. They are
 * deliberately different, and the plural is the result of measuring rather than a guess.
 * "Commercials & funding envelope" is a heading in a consulting deliverable, not a sentence
 * anybody writes, so scoring a draft against the heading matches on register. Replacing the
 * heading with one careful *description* of the category is better and still not good: it is a
 * paragraph about a topic, and a short draft compared against a paragraph matches whichever
 * paragraph shares the most topic words.
 *
 * What works is several short fragments in the voice a participant would actually use, scored by
 * the best match among them. On a held-out set of twenty-eight drafts from an engagement the
 * exemplars were not written for, that took top-1 from 13/28 to 18/28 — see
 * docs/intents/STATUS.md for the run.
 */
export interface Label {
  id: string;
  texts: string[];
}

/** A label and how well it matched. Scale is per backend and comparable only within one call. */
export interface Scored {
  id: string;
  score: number;
}

/**
 * Where a backend's confidence bar sits, measured rather than chosen.
 *
 * The *rule* lives in suggest.ts and is the same for every runtime. These two numbers are not
 * the rule; they are where that rule has to be set for one particular model, and they belong to
 * the adapter because the thing they describe is the model's own score geometry. Two embedders
 * disagree about this more than they look like they should: against the same held-out set, nomic
 * separates its labels by *proportion* and the lift rule does the work, while MiniLM separates
 * them by *spread* and the separation rule does. One shared pair leaves one of them either
 * mute or wrong — shipped at nomic's numbers, the in-page backend ran at 73% precision.
 *
 * This is not the drift the seam exists to prevent. That would be each adapter inventing its own
 * *rule*; this is one rule, calibrated against one held-out set, so that "confident enough to
 * show somebody" means the same thing in outcome terms on both. **A backend with no measured
 * calibration does not ship** — the numbers come from running the set, never from a plausible
 * guess, which is a lesson this file learned the expensive way.
 */
export interface Calibration {
  /** How far clear of the runner-up the winner must be, in standard deviations of the field. */
  separation: number;
  /** How far above the field the winner must be, as a fraction of its own score. */
  lift: number;
}

export interface LocalAssistant {
  readonly backend: LocalBackend;

  /** Where this runtime's confidence bar sits. See `Calibration`. */
  readonly calibration: Calibration;

  /**
   * Whether this runtime can actually answer, without doing any work worth noticing.
   *
   * Separate from `classify` because "no runtime is reachable" and "the runtime answered badly"
   * are different problems and the UI says different things about them — the same distinction
   * runChain draws between an entry it skipped and one that failed.
   */
  reachable(): Promise<boolean>;

  /** Scores `text` against every label. One entry per label, in the order given. */
  classify(text: string, labels: Label[]): Promise<Scored[]>;
}
