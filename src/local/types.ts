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
 * One candidate label.
 *
 * `id` is what the app stores and `text` is what the model is actually shown — they are
 * deliberately different. "Commercials & funding envelope" is a heading in a consulting
 * deliverable, not a sentence anybody writes, and scoring a draft against the heading alone is
 * the weakest version of this. See labels.ts, where the sentences are written out.
 */
export interface Label {
  id: string;
  text: string;
}

/** A label and how well it matched. Scale is per backend and comparable only within one call. */
export interface Scored {
  id: string;
  score: number;
}

export interface LocalAssistant {
  readonly backend: LocalBackend;

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
