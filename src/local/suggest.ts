/**
 * Whether a set of scores is worth putting in front of an author, and which label wins.
 *
 * Every judgement in this feature is here, deliberately, and none of it is in an adapter. Same
 * division as src/utils/coverage.ts: the model produces numbers, and what the numbers *mean* is
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
 * **The constants are measured, they live per backend, and every guess so far has been wrong.**
 * They were first set against score distributions written by hand. A run against a real runtime
 * showed how badly that misses — real cosine similarities between a short draft and a short
 * exemplar cluster far more tightly than invented ones, so a lift of 0.15 spoke on four drafts in
 * thirty-one and the assist would have looked broken rather than careful. Corrected to nomic's
 * numbers, the *other* backend then ran at 73%, because the correction had been measured on one
 * model and quietly applied to both.
 *
 * So the numbers belong to the adapter and the rules belong here. Each pair comes from a sweep
 * over the same held-out set — twenty-eight drafts from an engagement the exemplars were not
 * written for, plus three pieces of noise that must be refused — and each is chosen for
 * **precision over coverage**, which is not a close call: declining costs nothing, and a
 * confident wrong label on somebody's own half-formed thought is the failure the whole design is
 * arranged to avoid.
 *
 * | backend            | separation | lift | speaks on | precision |
 * | :----------------- | ---------: | ---: | --------: | --------: |
 * | in-page (MiniLM)   |        1.2 | 0.10 |      9/31 |       89% |
 * | ollama (nomic)     |        0.8 | 0.10 |      9/31 |       89% |
 *
 * Both offer something on roughly one draft in three and are right about nine times in ten when
 * they do — which is the property worth holding steady as backends are added, rather than the
 * numbers themselves. Two cautions for whoever changes them. The sample is small: 89% against
 * 85% is one item, so a sweep establishes the *region* and not the decimal. And what differs
 * between those two rows is not noise — nomic separates its labels by proportion and MiniLM by
 * spread, which is why one shared pair cannot serve both and why a new backend has to be swept
 * rather than handed the nearest existing pair.
 */
import { contentWords } from "../utils/chorus.ts";
import type { Calibration, Label, LocalAssistant, Scored } from "./types.ts";

/**
 * The two rules, stated once here and set per backend in each adapter's `calibration`.
 *
 * **Separation** is the rule that refuses a coin toss: the winner has to be clear of the
 * runner-up, in standard deviations of the field, so a fragment genuinely about two of the ten
 * areas gets no suggestion rather than an arbitrary one.
 *
 * **Lift** is the rule that refuses noise: the winner has to be above the field by a worthwhile
 * fraction *of its own score*. Ten areas scoring 0.200, 0.200, 0.199, 0.210 is a draft about
 * none of them, and the field is so tight that the 0.01 lead is many standard deviations —
 * decisive by every measure of spread, and meaningless. It also disposes of the case where
 * nothing matched at all: a negative best score yields a negative lift, refused here rather than
 * by a guard of its own, which would be a branch no input can reach.
 *
 * **Both rules apply to every backend; only the numbers differ.** That split is the point. Two
 * embedders disagree about their own geometry more than they look like they should — against the
 * same held-out set nomic separates its labels by proportion and MiniLM by spread — so a single
 * shared pair leaves one of them either mute or wrong. See `Calibration` in types.ts.
 *
 * **There was a third rule and removing it was the fix, not a simplification.** It asked that the
 * winner stand a fixed number of standard deviations above the *mean*, which sounds like the
 * second rule and is not, because a z-score has a ceiling of `sqrt(n - 1)`. Over ten areas that
 * ceiling is 3 and a threshold of 1.6 is ordinary; over the *four* pile tags it is 1.73, so the
 * same threshold demanded a near-perfect one-hot and the tag assist would have sat there almost
 * never firing, for a reason invisible from reading it. Any rule in units of spread has to be one
 * that does not tighten as the label set shrinks.
 */

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
export function pick(scores: Scored[], calibration: Calibration): Suggestion | null {
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

  if ((top.score - second.score) / stdev < calibration.separation) return null;

  const lift = (top.score - mean) / top.score;
  if (lift < calibration.lift) return null;

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
  return pick(await assistant.classify(text, labels), assistant.calibration);
}
