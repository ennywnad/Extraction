/**
 * Sorting the pile into actions, insights, fears and goals — by keyword, in the browser.
 *
 * This is the crudest reading in the app and it is honest about that: it is a filter someone
 * clicks to narrow a pile they are already looking at, not a claim put in front of a room. The
 * chorus and the coverage map both refuse to interpret for good reasons; this one does
 * interpret, and gets away with it only because a wrong answer costs a card appearing under the
 * wrong chip rather than a number in a client deliverable.
 *
 * It replaces a chain of `text.toLowerCase().includes(...)` calls in `Workspace.tsx`, which had
 * two defects that a substring test makes almost inevitable.
 *
 * **Mode vocabulary had leaked into content vocabulary.** `socratic` and `provocative` were
 * listed as cues for **fear**. `socratic` is a value of `promptingStyle` — a Guided Drill tone
 * knob, one of `standard | socratic | empathetic` — so a fragment discussing how the interview
 * should be run was filed as something the writer was frightened of. `provocative` appears
 * nowhere else in the codebase at all: it is vocabulary from a settings list that no longer
 * exists. `challenge` was the same mistake one step removed — Devil's Advocate *produces* a
 * field called `challenges`, and `SwipeReact` flattens those into fragments, so the mode's own
 * output classified itself as fear. All three are gone. A cue here has to be a word somebody
 * would write about their subject, never a word this app uses about itself.
 *
 * **A substring is not a word.** `includes("aim")` matched *claim*; `includes("action")`
 * matched *satisfaction* and, best of all, *inaction*; `includes("risk")` matched *brisk* and
 * *asterisk*; `includes("do ")` matched *todo* and *undo* while missing the "what to do" it was
 * plainly written for. Every cue is now anchored to a word boundary, which is the whole fix and
 * is why the cues can stay roughly what they were.
 *
 * Deliberately still a keyword matcher, and deliberately not a model call — see
 * docs/intents/006, which proposes a local model suggesting a tag on your own draft *before*
 * you submit it. That is a different thing in a different place: a suggestion to an author who
 * accepts or rejects it, not a re-reading of everyone else's fragments. This filter has to keep
 * working with nothing configured, exactly as the chorus does.
 */

/** The four a fragment can be filed under. `all` and `lone` are filters, not categories. */
export type PileCategory = "action" | "insight" | "fear" | "goal";

/**
 * Cues, written as stems.
 *
 * A cue matches a whole word that may carry one ordinary English ending — so `hesitat` covers
 * hesitate, hesitated and hesitation, and `mak` covers make, makes and making, while neither
 * can match from the middle of a longer word. Where a verb drops its `-e` before `-ing`, the
 * stem is written without it; where a `-y` becomes `-ie`, both spellings are listed, because
 * guessing wrong here silently loses matches rather than announcing itself.
 *
 * Multi-word cues work as written: the match runs over the text, not over tokens.
 */
const CUES: Record<PileCategory, string[]> = {
  action: [
    "need to",
    "have to",
    "must",
    "should",
    "todo",
    "to-do",
    "task",
    "action",
    "checklist",
    "next step",
    "set up",
    "follow up",
    "implement",
    "build",
    "ship",
    "launch",
    "fix",
    "send",
    "mak",
    "creat",
    "schedul",
    "deadlin",
  ],
  insight: [
    "realiz",
    // British spelling listed separately: the stem rule collapses endings, not spellings.
    "realis",
    "understand",
    "understood",
    "because",
    "why",
    "concept",
    "idea",
    "learn",
    "insight",
    "pattern",
    "notic",
    "turns out",
  ],
  fear: [
    "afraid",
    "fear",
    "scare",
    "worry",
    "worri",
    "anxious",
    "nervous",
    "risk",
    "doubt",
    "hesitat",
    "stuck",
    "friction",
    "blocker",
    "concern",
  ],
  goal: [
    "goal",
    "target",
    "objective",
    "achiev",
    "milestone",
    "outcome",
    "aim",
    "aspir",
    "vision",
    "value",
    "future",
  ],
};

/**
 * The endings a cue may carry and still be the same word.
 *
 * `e` is in the list so a stem written without its silent `-e` (`mak`, `notic`, `creat`) still
 * matches the plain present tense. Nothing here lets a cue match into a longer word — the
 * trailing `\b` is what does the work, and it is the entire difference from the `includes`
 * chain this replaces.
 */
const ENDINGS = "(?:e|es|s|ed|d|ing|ion|ions|ly)?";

const escape = (cue: string) => cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compiled once. Longest cue first so `next step` is preferred over nothing at all. */
const PATTERNS: Record<PileCategory, RegExp> = Object.fromEntries(
  Object.entries(CUES).map(([category, cues]) => [
    category,
    new RegExp(`\\b(?:${cues.map(escape).join("|")})${ENDINGS}\\b`, "i"),
  ]),
) as Record<PileCategory, RegExp>;

/** Whether a fragment reads as belonging to this category. */
export function matchesCategory(text: string, category: PileCategory): boolean {
  return PATTERNS[category].test(text);
}

/**
 * Every category a fragment matches, which may be none and may be several.
 *
 * Nothing consumes this yet — the sidebar asks about one category at a time. It exists because
 * the overlap is the honest description of what a keyword matcher does, and a caller that wants
 * to show it should not have to rediscover that by calling `matchesCategory` four times.
 */
export function categoriesOf(text: string): PileCategory[] {
  return (Object.keys(CUES) as PileCategory[]).filter((c) => matchesCategory(text, c));
}
