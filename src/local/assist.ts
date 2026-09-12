/**
 * The client's one door to a local assist — the sibling of src/utils/askModel.ts, and a module
 * for the same reason that one is.
 *
 * Nine of the twelve modes have a text input to hang this off. Threaded as props that would be
 * an assist object, an enabled flag and an accept callback on nine component interfaces that are
 * otherwise not about models at all, and a mode added later would silently have no assist —
 * indistinguishable from a mode nobody had got round to. Read from a module, a new call site
 * gets the behaviour by importing one function, and the state lives in exactly one place.
 *
 * **Nothing here happens unless somebody switched it on.** No probe, no library fetch, no
 * localhost request. `ready()` is what the workspace calls once the preferences say an assist is
 * wanted, and until then this module does nothing at all — which is what makes a feature that is
 * off by default genuinely free rather than merely quiet.
 *
 * **It never sees the pile.** The only text that reaches a runtime is the draft in the box in
 * front of the person who typed it, which is the structural reason docs/intents/006 is a
 * different proposition from the peer-compute version it replaced: there is no confidentiality
 * question to mitigate, because nobody else's material is involved.
 */
import { chooseAssistant, DEFAULT_ORDER } from "./choose.ts";
import { inPageAssistant } from "./inPage.ts";
import { ollamaAssistant } from "./ollama.ts";
import { AREA_LABELS, TAG_LABELS } from "./labels.ts";
import { suggestFrom } from "./suggest.ts";
import type { LocalAssistant, LocalBackend } from "./types.ts";
import type { PileCategory } from "../utils/pileCategories.ts";
import { DEFAULT_ASSISTS, type AssistPrefs } from "../utils/assistPrefs.ts";

function lookup(backend: LocalBackend): LocalAssistant {
  return backend === "in-page" ? inPageAssistant() : ollamaAssistant();
}

let prefs: AssistPrefs = DEFAULT_ASSISTS;
const listeners = new Set<() => void>();

/**
 * Mirrors the viewer's preferences into this module, and tells the surfaces.
 *
 * Subscribable for lastAnswer.ts's reason rather than as a convenience: an `AssistBar` that read
 * the preference once on mount would keep offering a suggestion after somebody switched the
 * assist off, and the mode it sits in has no reason to re-render when a setting it knows nothing
 * about changes. With a store, the surfaces need one prop — the draft — and nothing else.
 */
export function setAssists(next: AssistPrefs): void {
  prefs = next;
  // A changed preference can turn a probe from unnecessary into wanted, and the old answer was
  // never about the new setting. Cheap to redo, and wrong to keep.
  reprobe();
  for (const l of listeners) l();
}

export function subscribeToAssists(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAssists(): AssistPrefs {
  return prefs;
}

/**
 * The chosen runtime, resolved at most once per tab.
 *
 * Memoised as the promise rather than the result, so twelve components asking at once share one
 * probe instead of racing twelve. Cleared when the probe finds nothing, so switching an assist
 * on after starting Ollama does not require a reload.
 */
let chosen: Promise<LocalAssistant | null> | null = null;

function resolve(): Promise<LocalAssistant | null> {
  if (!chosen) {
    chosen = chooseAssistant(DEFAULT_ORDER, lookup).then((c) => c.assistant);
    chosen.then((a) => {
      if (!a) chosen = null;
    });
  }
  return chosen;
}

/** Which runtime will answer, or nothing. The question a surface asks before drawing itself. */
export async function ready(): Promise<LocalBackend | null> {
  return (await resolve())?.backend ?? null;
}

/** Forgets the probe, so the next call looks again. For a viewer who has just switched on. */
export function reprobe(): void {
  chosen = null;
}

export interface Assist {
  tag?: PileCategory;
  area?: string;
  backend: LocalBackend;
}

/**
 * What a local model would file this draft under, or nothing at all.
 *
 * The two assists are independent: one can land while the other declines, because a fragment
 * can be plainly a fear without being about any particular area of an engagement. Returning a
 * half-filled result is honest — suggest.ts refuses to guess per label set, and forcing them to
 * agree would mean throwing away a good suggestion to keep a bad one company.
 *
 * Scored in parallel because they are two independent comparisons against one draft, and on the
 * in-page backend the model is already loaded for the second by the time the first returns.
 */
export async function assist(text: string): Promise<Assist | null> {
  if (!prefs.tag && !prefs.area) return null;

  // Resolved rather than read, so a caller that never asked `ready()` gets a suggestion instead
  // of silently getting nothing. The probe is memoised, so the surface that did ask has already
  // paid for this and it costs the caller nothing.
  const assistant = await resolve();
  if (!assistant) return null;

  const [tag, area] = await Promise.all([
    prefs.tag ? suggestFrom(assistant, text, TAG_LABELS) : null,
    prefs.area ? suggestFrom(assistant, text, AREA_LABELS) : null,
  ]);

  if (!tag && !area) return null;
  return {
    tag: (tag?.id as PileCategory) ?? undefined,
    area: area?.id ?? undefined,
    backend: assistant.backend,
  };
}

/**
 * What the author accepted, waiting for the fragment it belongs to.
 *
 * `handleAddThought` in App.tsx is the one place a `Thought` is built, and it is reached through
 * `onAddThought(text)` from every mode. Recording an acceptance here and reading it there is the
 * same trade lastAnswer.ts makes: one import at each end, and no parameter about local models on
 * nine mode interfaces that are not about models.
 *
 * **Keyed by the exact draft it was accepted for**, which is the part worth being careful about.
 * Accept a tag, then rewrite the sentence into something completely different, then submit — and
 * without the key the old tag rides along onto a fragment nobody ever offered it for, stamped
 * with a backend name that makes it look verified. The text is the cheapest honest key: if it
 * changed at all, the acceptance is void.
 */
let accepted: { text: string; assist: Assist } | null = null;

export function acceptAssist(text: string, value: Assist): void {
  accepted = { text, assist: value };
}

export function clearAccepted(): void {
  accepted = null;
}

/** The acceptance for exactly this text, consumed. Nothing if the draft moved on. */
export function takeAccepted(text: string): Assist | null {
  const held = accepted?.text === text ? accepted.assist : null;
  accepted = null;
  return held;
}
