/**
 * Whether a set of scores is worth putting in front of an author, and which label wins.
 *
 * Every judgement in this feature is here, deliberately, and none of it is in an adapter. Same
 * division as server/ai/coverage.ts: the model produces numbers, and what the numbers *mean* is
 * arithmetic somebody can read. An adapter that applied its own threshold would make the two
 * backends disagree about confidence, and a suggestion looking surer because a different
 * runtime has a more generous scale is the exact failure this feature cannot survive — the
 * author is the verification step, and a verification step learns to rubber-stamp whatever is
 * usually right.
 *
 * **It refuses to guess, and that is the feature.** Two rules, both in units of the spread of
 * the scores themselves, because types.ts promises only that scores are comparable *within one
 * call* — an absolute floor would be a number tuned to whichever model happened to be loaded
 * the day it was written, and silently wrong for the other backend.
 *
 * A draft about where to have lunch scores roughly equally against all ten areas of a
 * consulting engagement. One of those ten is still the highest. Without the rules below, that
 * arithmetic accident is shown to somebody as a suggestion, and the reason it must not be is
 * the same reason the chorus refuses to editorialise: a confident wrong label on your own
 * half-formed thought is worse than no label, because you will take it.
 *
 * **Both constants are measured, and the first guesses were wrong.** They were originally set
 * against score distributions written by hand, and a run against a real embedding runtime showed
 * how badly that misses: real cosine similarities between a short draft and a short exemplar
 * cluster far more tightly than invented ones, so the first `MIN_RELATIVE_LIFT` of 0.15 spoke on
 * four drafts out of thirty-one. The assist would have looked broken rather than careful.
 *
 * The numbers below come from a sweep over a held-out set — twenty-eight drafts from an
 * engagement the exemplars were not written for, plus three pieces of noise that must be
 * refused. They are chosen for **precision over coverage**, which is the right trade here and
 * not a close call: declining costs nothing, and a confident wrong label on somebody's own
 * half-formed thought is the failure the whole design is arranged to avoid.
 *
 * | separation | lift | speaks on | precision |
 * | ---------: | ---: | --------: | --------: |
 * |        0.5 | 0.15 |      4/31 |       75% |
 * |        0.5 | 0.10 |     13/31 |       85% |
 * |    **0.8** | **0.10** | **9/31** |   **89%** |
 * |        1.0 | 0.05 |      9/31 |       78% |
 *
 * So it offers something on roughly one draft in three and is right about nine times in ten when
 * it does. Two cautions for whoever changes these. The sample is small — 89% against 85% is one
 * item, not a finding; what the sweep establishes is the *region*, not the decimal. And they were
 * measured against one runtime (`nomic-embed-text` through Ollama); the rules are scale-free, so
 * they should travel, but the in-page backend has not been through this and nobody should claim
 * it has until it is.
 */
import { contentWords } from "../utils/chorus.ts";
import type { Label, LocalAssistant, Scored } from "./types.ts";

/**
 * How far clear of the runner-up the winner has to be, in standard deviations of the field.
 *
 * Scale-free by construction, so it means the same thing to a MiniLM embedding in the page and
 * to whatever somebody has pulled into Ollama. This is the rule that refuses a coin toss: a
 * fragment genuinely about two of the ten areas gets no suggestion rather than an arbitrary one.
 */
const MIN_SEPARATION = 0.8;

/**
 * How far above the field the winner has to be as a fraction of its own score.
 *
 * The companion rule, and the one that refuses noise. Ten areas scoring 0.200, 0.200, 0.199,
 * 0.210 is a draft about none of them, but the field is so tight that the 0.01 lead is a large
 * number of standard deviations — decisive by every measure of *spread*, and meaningless. So
 * separation alone is not enough: the gap also has to be worth something in proportion to the
 * numbers being compared, which a tight cluster of noise can never manage and a real match
 * always does.
 *
 * It also disposes of the case where nothing matched at all. A negative best score is the least
 * dissimilar of a set of wrong answers, and dividing a positive gap by it yields a negative lift
 * — refused here rather than by a guard of its own, because a separate check for it would be a
 * branch no input can reach and the next reader would take it for load-bearing.
 *
 * **There was a third rule here and removing it was the fix, not a simplification.** It asked
 * that the winner stand a fixed number of standard deviations above the mean — which sounds like
 * this one and is not, because a z-score has a ceiling of `sqrt(n - 1)`. Over ten areas that
 * ceiling is 3 and a threshold of 1.6 is ordinary; over the *four* pile tags it is 1.73, so the
 * same threshold demanded a near-perfect one-hot and the tag assist would have sat there almost
 * never firing, for a reason invisible from reading it. Any rule in units of spread has to be
 * one that does not tighten as the label set shrinks.
 */
const MIN_RELATIVE_LIFT = 0.1;

/**
 * The least a draft can be and still be classifiable, counted in content words.
 *
 * Reusing the chorus tokeniser rather than a second one — 006 predicted this, and it is the
 * right call for a reason beyond saving the code: the stopword set decides what "substance"
 * means, and two definitions of that in one app would let a draft be long enough for the pile
 * to answer it and too short to tag, with nothing explaining the difference.
 */
const MIN_WORDS = 4;

export interface Suggestion {
  id: string;
  /**
   * How far the winner sits above the field, as a fraction of its own score. Shown nowhere —
   * a number next to a suggestion invites the author to read it as a probability, which it is
   * not — but kept so a caller can sort or log.
   */
  lift: number;
}

/**
 * The winner, or nothing.
 *
 * Nothing is a perfectly good answer and is returned for every reason it should be: too few
 * labels to have a field at all, a runtime that returned nothing, a dead heat, or a draft that
 * simply is not about any of these things.
 */
export function pick(scores: Scored[]): Suggestion | null {
  // Three is the least that can have a winner, a runner-up and a field to stand out from. With
  // two, "clear of the runner-up" and "above the mean" are the same sentence twice.
  if (scores.length < 3) return null;

  const values = scores.map((s) => s.score);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);

  // Every label scored identically — what a runtime returns when it could not read the input at
  // all. Deliberately redundant: the lift rule below rejects a flat field too, since a winner
  // level with the mean has no lift. It stays because it is the difference between saying so and
  // letting a `0 / 0` flow into two comparisons and relying on how NaN happens to compare.
  if (stdev === 0) return null;

  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const [top, second] = ranked;

  if ((top.score - second.score) / stdev < MIN_SEPARATION) return null;

  const lift = (top.score - mean) / top.score;
  if (lift < MIN_RELATIVE_LIFT) return null;

  return { id: top.id, lift };
}

/** Whether a draft has enough in it to be worth scoring at all. */
export function worthScoring(text: string): boolean {
  return contentWords(text).length >= MIN_WORDS;
}

/**
 * Scores one draft against one label set and returns the winner, or nothing.
 *
 * The short-draft check happens **before** the runtime is touched. On the in-page backend that
 * saves loading a model to classify three words; on Ollama it saves a round trip per keystroke.
 * Both matter less than the third thing: it means the rule about what is classifiable is stated
 * once, here, rather than being a property of how fast each backend happened to be.
 */
export async function suggestFrom(
  assistant: LocalAssistant,
  text: string,
  labels: Label[],
): Promise<Suggestion | null> {
  if (!worthScoring(text)) return null;
  return pick(await assistant.classify(text, labels));
}
