/**
 * The browser's local assists: a suggestion about your own draft, before it is anyone else's.
 *
 * Nothing in this file touches a model, and that is the design being tested rather than a
 * limitation being worked around. docs/intents/006 puts every judgement above the runtime —
 * which label wins, whether any label wins, whether a draft is even classifiable — so all of it
 * is exercisable with a stub that returns numbers. Same instinct as server/ai/providers/chain.ts
 * taking its lookup as an argument, and coverage.ts doing its own arithmetic.
 *
 * The assertions worth having are the refusals. A classifier that picks a winner is easy; one
 * that declines to pick when the field is flat is the whole safety argument, because the author
 * is the verification step and a verification step learns to rubber-stamp whatever is usually
 * right. So most of what follows is about the cases where nothing should be offered.
 *
 * Plus one structural scan, for the reason test/modelSeam.test.ts has its: the way this seam
 * dies is somebody hard-coding a localhost URL into a mode because that is quicker than adding
 * an adapter, and it simply working.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AssistBar from "../src/components/AssistBar.tsx";
import Workspace from "../src/components/Workspace.tsx";
import type { Session, Thought } from "../src/types.ts";
import { chooseAssistant, DEFAULT_ORDER } from "../src/local/choose.ts";
import { inPageAssistant } from "../src/local/inPage.ts";
import { ollamaAssistant } from "../src/local/ollama.ts";
import { cosine, fromEmbedder } from "../src/local/embedding.ts";
import { AREA_LABELS, TAG_LABELS } from "../src/local/labels.ts";
import { pick, suggestFrom, worthScoring } from "../src/local/suggest.ts";
import type { Label, LocalAssistant, LocalBackend, Scored } from "../src/local/types.ts";
import { acceptAssist, takeAccepted, clearAccepted } from "../src/local/assist.ts";
import { LEVEL_SET_AREAS } from "../src/utils/levelSetAreas.ts";
import { categoriesOf } from "../src/utils/pileCategories.ts";
import { anyAssistOn, DEFAULT_ASSISTS, loadAssistPrefs } from "../src/utils/assistPrefs.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const fragment = (id: string, text: string): Thought => ({
  id,
  text,
  timestamp: "2026-09-11T10:00:00.000Z",
  mode: "free_stream",
});

const session = (): Session =>
  ({
    id: "e1",
    topic: "ERP migration readiness",
    intention: "Level set the ask",
    status: "active",
    activeMode: "free_stream",
    thoughts: [fragment("a", "the handover between fulfilment and finance loses orders")],
    modeProgress: {},
    modeHistory: [],
    createdAt: "2026-09-11T09:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
  }) as unknown as Session;

function stub(
  backend: LocalBackend,
  opts: { reachable?: boolean | (() => Promise<boolean>); scores?: number[] } = {},
): LocalAssistant {
  return {
    backend,
    calibration: { separation: 0.5, lift: 0.15 },
    reachable: async () => {
      if (typeof opts.reachable === "function") return opts.reachable();
      return opts.reachable ?? true;
    },
    classify: async (_text: string, labels: Label[]): Promise<Scored[]> =>
      labels.map((l, i) => ({ id: l.id, score: opts.scores?.[i] ?? 0 })),
  };
}

describe("pick — which label wins, and when none does", () => {
  const scored = (...values: number[]): Scored[] =>
    values.map((score, i) => ({ id: `l${i}`, score }));

  // The rule is what these exercise, not any model's numbers, so the bar is set here rather than
  // borrowed from an adapter — a shipped calibration moving must not silently rewrite what the
  // arithmetic is asserted to do.
  const BAR = { separation: 0.5, lift: 0.15 };

  it("takes a label that stands clear of the field", () => {
    const got = pick(scored(0.9, 0.1, 0.12, 0.08, 0.11), BAR);
    assert.equal(got?.id, "l0");
  });

  it("refuses when every label scores the same", () => {
    // The state a runtime lands in when it could not read the input at all. Picking the first
    // here is the most convincing possible way to be wrong: it looks exactly like a real answer.
    assert.equal(pick(scored(0.4, 0.4, 0.4, 0.4), BAR), null);
  });

  it("refuses when the top two are too close to separate", () => {
    // A fragment genuinely about two of the ten areas, both well clear of the other eight.
    // Choosing one arbitrarily is worse than choosing neither, because the author has no way to
    // see that it was a coin toss. Shaped so that separation is the *only* rule that rejects it:
    // the winner stands far enough above the field to clear both of the others, which is what
    // makes this the case that pins the rule rather than one caught on the way past.
    const twoWinners = scored(0.8, 0.79, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1);
    assert.equal(pick(twoWinners, BAR), null);
  });

  it("refuses a winner that is merely the largest of a flat field", () => {
    // "Where should we have lunch" against ten areas of a consulting engagement. One of them is
    // still the highest.
    assert.equal(pick(scored(0.21, 0.2, 0.2, 0.199, 0.2, 0.2), BAR), null);
  });

  it("judges four tags as readily as ten areas", () => {
    // The regression behind the rule that is no longer here. A threshold in standard deviations
    // above the *mean* has a ceiling of sqrt(n - 1): ordinary over ten areas, nearly unreachable
    // over four tags. The same clearly-won field has to be accepted at both sizes, or the tag
    // assist silently never fires while the area assist works fine.
    // Shaped like a real tag distribution rather than a one-hot: plainly a fear, somewhat a
    // goal, not an action or an insight. That is the shape the old rule threw away.
    const four = scored(0.6, 0.45, 0.2, 0.2);
    const ten = scored(0.6, 0.45, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2);
    assert.equal(pick(four, BAR)?.id, "l0", "a clear winner among four tags must survive");
    assert.equal(pick(ten, BAR)?.id, "l0");
  });

  it("refuses when there is no field to stand out from", () => {
    assert.equal(pick(scored(0.9, 0.1), BAR), null);
    assert.equal(pick([], BAR), null);
  });

  it("refuses when nothing matched at all", () => {
    // Every label a worse fit than no fit. The least dissimilar of a set of wrong answers is
    // still a wrong answer, and it is the one a naive `max` would hand over most confidently.
    assert.equal(pick(scored(-0.1, -0.5, -0.6, -0.55), BAR), null);
  });
});

describe("worthScoring — a draft too short to classify", () => {
  it("declines three content words", () => {
    assert.equal(worthScoring("the budget is"), false);
  });

  it("accepts a real sentence", () => {
    assert.equal(worthScoring("I am worried the budget will not cover the migration"), true);
  });

  it("counts content words rather than characters, like the chorus does", () => {
    // Stopwords only. Long, and says nothing — the distinction the chorus tokeniser already
    // draws, reused here so one definition of "substance" serves both.
    assert.equal(worthScoring("and then the of it to a but so with"), false);
  });
});

describe("suggestFrom — the short-draft rule runs before the runtime", () => {
  it("never reaches the assistant for a draft too short to score", async () => {
    let asked = false;
    const watcher: LocalAssistant = {
      backend: "in-page",
      calibration: { separation: 0.5, lift: 0.15 },
      reachable: async () => true,
      classify: async (_t, labels) => {
        asked = true;
        return labels.map((l) => ({ id: l.id, score: 1 }));
      },
    };
    assert.equal(await suggestFrom(watcher, "too short", TAG_LABELS), null);
    assert.equal(asked, false, "a three-word draft must not cost a round trip");
  });
});

describe("the seam — scores in, one per label, in order", () => {
  it("scores every label against the draft", async () => {
    // Orthogonal label vectors, so the draft's own direction decides the winner and the
    // arithmetic is checkable by hand.
    const vectors: Record<string, number[]> = {
      draft: [1, 0.1, 0],
      a: [1, 0, 0],
      b: [0, 1, 0],
      c: [0, 0, 1],
    };
    const assistant = fromEmbedder(
      "in-page",
      async (texts) => texts.map((t) => vectors[t]),
      async () => true,
      { separation: 0.5, lift: 0.15 },
    );
    const got = await assistant.classify("draft", [
      { id: "a", texts: ["a"] },
      { id: "b", texts: ["b"] },
      { id: "c", texts: ["c"] },
    ]);
    assert.deepEqual(
      got.map((g) => g.id),
      ["a", "b", "c"],
      "one score per label, in the order given",
    );
    assert.ok(got[0].score > got[1].score && got[1].score > got[2].score);
  });

  it("declines to score when the runtime returns the wrong number of vectors", async () => {
    // A broken call, not a weak answer. Scoring whichever labels happened to line up would turn
    // a runtime failure into a confident suggestion.
    const assistant = fromEmbedder(
      "ollama",
      async () => [[1, 0]],
      async () => true,
      { separation: 0.5, lift: 0.15 },
    );
    assert.deepEqual(await assistant.classify("draft", TAG_LABELS), []);
  });

  it("gives a zero vector no angle rather than a NaN", () => {
    // NaN sorts unpredictably, so one bad vector would reorder every label around it.
    assert.equal(cosine([0, 0], [1, 1]), 0);
  });
});

describe("chooseAssistant — which runtime answers", () => {
  it("takes the first reachable backend and asks no further", async () => {
    const asked: LocalBackend[] = [];
    const choice = await chooseAssistant(["in-page", "ollama"], (b) => {
      asked.push(b);
      return stub(b, { reachable: true });
    });
    assert.equal(choice.assistant?.backend, "in-page");
    assert.deepEqual(asked, ["in-page"], "a reachable first entry ends the search");
    assert.deepEqual(choice.unreachable, []);
  });

  it("falls through to the next backend and reports what it passed", async () => {
    const choice = await chooseAssistant(["in-page", "ollama"], (b) =>
      stub(b, { reachable: b === "ollama" }),
    );
    assert.equal(choice.assistant?.backend, "ollama");
    assert.deepEqual(choice.unreachable, ["in-page"]);
  });

  it("treats a probe that throws as a runtime that is not there", async () => {
    // A rejected fetch to a closed port, or a browser with no local network permission. The
    // ordinary state of almost every machine, so it must not read as an error.
    const choice = await chooseAssistant(["ollama"], (b) =>
      stub(b, {
        reachable: async () => {
          throw new Error("Failed to fetch");
        },
      }),
    );
    assert.equal(choice.assistant, null);
    assert.deepEqual(choice.unreachable, ["ollama"]);
  });

  it("answers nothing when no backend is reachable", async () => {
    const choice = await chooseAssistant(DEFAULT_ORDER, (b) => stub(b, { reachable: false }));
    assert.equal(choice.assistant, null);
    assert.deepEqual(choice.unreachable, DEFAULT_ORDER);
  });

  it("tries in-page before localhost", () => {
    // Order is a decision, not an accident: probing localhost fires a browser permission prompt,
    // so it must never happen to somebody who has not asked for a local model.
    assert.deepEqual(DEFAULT_ORDER, ["in-page", "ollama"]);
  });
});

describe("calibration — one rule, a bar measured per backend", () => {
  it("gives every shipped backend a measured bar", () => {
    // A backend with no calibration of its own is a backend running on somebody else's numbers,
    // which is exactly how the in-page assist shipped at 73% precision.
    for (const make of [inPageAssistant, ollamaAssistant]) {
      const { backend, calibration } = make();
      assert.ok(calibration, `${backend} ships with no calibration`);
      assert.ok(calibration.separation > 0 && calibration.lift > 0, `${backend} bar is not set`);
    }
  });

  it("does not hand one backend another's numbers", () => {
    // Not a style preference. The two models disagree about their own geometry — nomic separates
    // its labels by proportion and MiniLM by spread — so identical pairs here would mean one of
    // them was never swept, and the sweep is the only thing that makes these numbers true.
    assert.notDeepEqual(
      inPageAssistant().calibration,
      ollamaAssistant().calibration,
      "identical bars mean one backend inherited the other's measurement",
    );
  });

  it("applies the assistant's own bar rather than a shared constant", async () => {
    // The same scores, the same labels, two runtimes: the strict one declines what the lenient
    // one offers. If this ever stops being true, the calibration has drifted back into a module
    // constant and the weaker backend is riding on the stronger one's measurement again.
    const scores = [0.6, 0.45, 0.2, 0.2];
    const make = (calibration: { separation: number; lift: number }): LocalAssistant => ({
      backend: "in-page",
      calibration,
      reachable: async () => true,
      classify: async (_t, labels) => labels.map((l, i) => ({ id: l.id, score: scores[i] ?? 0 })),
    });
    const draft = "the vendor may not have the connector ready and we have no fallback at all";
    assert.ok(await suggestFrom(make({ separation: 0.5, lift: 0.1 }), draft, TAG_LABELS));
    assert.equal(await suggestFrom(make({ separation: 2.5, lift: 0.1 }), draft, TAG_LABELS), null);
  });
});

describe("labels — the two sets the app can actually store", () => {
  it("offers exactly the ten areas coverage arithmetic counts", () => {
    assert.deepEqual(
      AREA_LABELS.map((l) => l.id),
      [...LEVEL_SET_AREAS],
      "an area id that differs from LEVEL_SET_AREAS lands the fragment in no cell at all",
    );
  });

  it("offers exactly the four categories the pile sidebar files under", () => {
    assert.deepEqual(TAG_LABELS.map((l) => l.id).sort(), ["action", "fear", "goal", "insight"]);
  });

  it("shows the model several exemplars rather than the heading", () => {
    // The whole reason `id` and `texts` are separate, and why the plural was worth the change:
    // a heading matches on register, and one long description matches on topic words. Measured
    // at 13/28 for a description against 18/28 for exemplars — see src/local/labels.ts.
    for (const label of [...AREA_LABELS, ...TAG_LABELS]) {
      assert.ok(label.texts.length >= 3, `${label.id} needs several exemplars, not one`);
      for (const text of label.texts) {
        assert.notEqual(text, label.id, `${label.id} is being scored against its own heading`);
      }
    }
  });

  it("keeps the exemplars in a participant's voice, not a consultant's", () => {
    // The property that makes exemplars beat a description: they are the same length, register
    // and person as the thing being classified. A paragraph creeping back in here would undo the
    // measurement without failing anything else.
    for (const label of [...AREA_LABELS, ...TAG_LABELS]) {
      for (const text of label.texts) {
        assert.ok(
          text.length < 90,
          `"${text}" is drifting back toward a description of ${label.id}`,
        );
      }
    }
  });

  it("describes a fear in words the keyword matcher would not catch on its own", () => {
    // The gap 006 says a local model closes and keywords structurally cannot: a fragment that
    // expresses a fear while containing no word for one. If this ever starts matching, the
    // label text has drifted back toward being a list of cues.
    const worry = "if the migration slips past March the board will pull the funding";
    assert.deepEqual(categoriesOf(worry), [], "the lexical matcher is blind to this, as expected");
  });
});

describe("an acceptance belongs to the draft it was accepted for", () => {
  it("rides along with the fragment it was offered on", () => {
    acceptAssist("the budget will not cover this", { backend: "in-page", tag: "fear" });
    assert.deepEqual(takeAccepted("the budget will not cover this"), {
      backend: "in-page",
      tag: "fear",
    });
  });

  it("is void once the draft has been rewritten", () => {
    // Accept a tag, rewrite the sentence into something else, submit. Without the key the old
    // tag rides onto a fragment nobody ever offered it for, stamped as though a model saw it.
    acceptAssist("the budget will not cover this", { backend: "in-page", tag: "fear" });
    assert.equal(takeAccepted("actually the timeline is the problem"), null);
  });

  it("is consumed once, so it cannot attach to a second fragment", () => {
    acceptAssist("the budget will not cover this", { backend: "in-page", tag: "fear" });
    assert.ok(takeAccepted("the budget will not cover this"));
    assert.equal(takeAccepted("the budget will not cover this"), null);
    clearAccepted();
  });
});

describe("preferences — an assist that is off must stay off", () => {
  const withStorage = <T>(raw: string | null, run: () => T): T => {
    const store = { getItem: () => raw, setItem: () => undefined };
    (globalThis as { window?: unknown }).window = { localStorage: store };
    try {
      return run();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  };

  it("starts with both assists off", () => {
    assert.deepEqual(withStorage(null, loadAssistPrefs), { tag: false, area: false });
    assert.equal(anyAssistOn(DEFAULT_ASSISTS), false);
  });

  it("reads strictly, so a coerced value cannot switch one on", () => {
    // The same strictness Session.listening is read with, and the one direction an
    // off-by-default setting must never fail in: a stored "yes" silently enabling a runtime.
    const got = withStorage('{"tag":"yes","area":1}', loadAssistPrefs);
    assert.deepEqual(got, { tag: false, area: false });
  });

  it("opens with both off when storage is unreadable", () => {
    // A private window, or cleared site data. Not worth an error, and not a reason to guess.
    assert.deepEqual(withStorage("not json at all", loadAssistPrefs), { tag: false, area: false });
  });
});

describe("the surface — what it draws before any runtime has answered", () => {
  it("draws nothing at all until a runtime answers", () => {
    // The state on every machine that has no local model, which is almost all of them. An
    // assist that drew an empty shell there would be a permanent piece of furniture advertising
    // a feature the reader cannot use.
    const html = renderToStaticMarkup(
      createElement(AssistBar, { text: "the budget will not cover the migration" }),
    );
    assert.equal(html, "");
  });

  it("draws the toggles off, and says so, when nothing is switched on", () => {
    const html = renderToStaticMarkup(
      createElement(Workspace, {
        session: session(),
        onUpdateSession: () => undefined,
        onAddThought: () => undefined,
        onBack: () => undefined,
        onAssistToggle: () => undefined,
      } as never),
    );
    assert.match(html, /Local tag suggestions are off/);
    assert.match(html, /Local area suggestions are off/);
    assert.doesNotMatch(html, /aria-pressed="true"[^>]*>[^<]*tag/);
  });
});

/** Every client source file, comments removed — the scan below is about code. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const clientSources = walk(path.join(root, "src")).map((f) => ({
  file: path.relative(root, f),
  text: code(readFileSync(f, "utf8")),
}));

const ADAPTERS = "src/local/";

describe("the local seam — no component names a runtime", () => {
  it("keeps every runtime address inside an adapter", () => {
    // The way this dies: a mode hard-codes `http://localhost:11434` because that is quicker than
    // adding an adapter, and it works on the one machine it was written on.
    const offenders = clientSources
      .filter(({ file }) => !file.startsWith(ADAPTERS))
      .filter(({ text }) => /localhost:11434|huggingface|cdn\.jsdelivr\.net|Xenova/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, [], "reach a runtime through src/local/assist.ts instead");
  });

  it("keeps the adapters out of everyone else's imports", () => {
    // A component importing `ollamaAssistant` directly is a component that has decided which
    // runtime answers — the one decision `chooseAssistant` exists to own.
    const offenders = clientSources
      .filter(({ file }) => !file.startsWith(ADAPTERS))
      .filter(({ text }) => /from "[^"]*local\/(inPage|ollama|choose|embedding)/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, [], "import the door, not an adapter");
  });

  it("never sends the pile to a local runtime", () => {
    // The structural reason 006 is a different proposition from the peer-compute version it
    // replaced: the only text that reaches a runtime is the author's own unsubmitted draft. An
    // adapter that read a Session would quietly reintroduce the confidentiality question.
    const offenders = clientSources
      .filter(({ file }) => file.startsWith(ADAPTERS))
      .filter(({ text }) => /\bSession\b|\bthoughts\b/.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, [], "a local assist sees one draft, never the pile");
  });
});
