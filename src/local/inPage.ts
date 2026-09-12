/**
 * The assist that needs nothing from the person using it.
 *
 * A sentence-embedding model runs inside the page, so there is no permission prompt, no
 * environment variable, no runtime to install and no localhost call — the two gates
 * docs/intents/006 documents both simply do not apply. That is why it is tried first: it is the
 * only backend that will answer on a machine nobody has prepared, which is every machine in the
 * room except possibly the facilitator's.
 *
 * **A small model is the right model here, not a compromise.** The task is picking one label
 * from a closed set of four or ten. That is what a 23MB sentence embedder is genuinely good at,
 * and a 32B model is the wrong tool for choosing between `action`, `insight`, `fear` and `goal`
 * — it would be slower, enormous to fetch, and no better at it.
 *
 * **The library is fetched rather than bundled**, and that is a deliberate trade rather than a
 * shortcut. Taken from npm it pulls `onnxruntime-node` and `sharp` — 143MB installed and, at the
 * time of writing, four high-severity advisories with no fix available — every byte of it for
 * running inference under Node, which this never does. All of that would sit in the install of a
 * feature that is off by default, and in `npm audit` output that somebody has to triage before
 * every commit. The weights come from a CDN at runtime no matter how the glue is packaged, so
 * fetching the glue the same way is not a new kind of dependency; and because both are fetched
 * only when somebody switches the assist on, a deployment that never uses this pays nothing for
 * it at all. Pinned exactly, for the reason every entry in MODEL_CHAIN is.
 */
import { fromEmbedder, type Embedder } from "./embedding.ts";
import type { LocalAssistant } from "./types.ts";

const LIBRARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

/**
 * Small, quantised, and trained for exactly this comparison.
 *
 * Sentence-transformers checkpoints are fitted so that cosine distance between two pooled
 * outputs means semantic closeness. That is the assumption embedding.ts rests on, so the model
 * has to be one where it holds — a general language model's hidden states do not have that
 * property, and using one would give numbers that look fine and rank badly.
 */
const MODEL = "Xenova/all-MiniLM-L6-v2";

/** Loaded once per tab, on first use, and shared by every call after it. */
let pipe: Promise<unknown> | null = null;

function load(): Promise<unknown> {
  if (!pipe) {
    pipe = (async () => {
      // A non-literal specifier, so this stays a runtime fetch rather than something the
      // bundler tries to resolve at build time.
      const url = LIBRARY;
      const lib = await import(/* @vite-ignore */ url);
      return lib.pipeline("feature-extraction", MODEL, {
        // WebGPU where the browser has it, WASM everywhere else. The fallback is the reason
        // this backend can be the default: slower, and it still answers.
        device: hasWebGPU() ? "webgpu" : "wasm",
        dtype: "q8",
      });
    })();
    // A failed load must not be cached as a permanent refusal — a flaky CDN fetch would
    // otherwise disable the assist for the life of the tab with no way back but a reload.
    pipe.catch(() => {
      pipe = null;
    });
  }
  return pipe;
}

function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

const embed: Embedder = async (texts) => {
  const extractor = (await load()) as (
    input: string[],
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ tolist(): number[][] }>;

  // Pooling and normalisation are the library's, not ours: mean-pooling is what this checkpoint
  // was fitted against, and doing it by hand here would move the vectors away from what the
  // model was trained to produce for the sake of owning six lines of arithmetic.
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
};

export function inPageAssistant(): LocalAssistant {
  return fromEmbedder("in-page", embed, async () => {
    // Deliberately not a load. `reachable` runs to decide whether to *offer* the assist, and
    // downloading a model to answer that question would make merely opening the settings cost
    // 23MB on a conference wifi. What is checked is the only thing that can actually rule it
    // out: a browser too old to fetch a module at runtime.
    return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
  });
}
