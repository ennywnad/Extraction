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
 * from a closed set of four or ten. That is what a small sentence embedder is genuinely good at,
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
 * **What it actually costs, measured in Chrome against the dev server rather than estimated:**
 * 26.8MB on the first use of the assist in a browser — 22.1MB of weights from the Hugging Face
 * CDN over eleven requests, plus 4.8MB of library from jsdelivr over three. About 2 seconds to
 * the first suggestion on a warm connection, and ~130ms for every one after it in that tab.
 * Worth writing down because the number decides whether this is reasonable to switch on in a
 * room: it is a one-off closer to loading a heavy page than to installing something, and it is
 * paid only by somebody who turned the assist on.
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
      const build = (device: string) =>
        lib.pipeline("feature-extraction", MODEL, { device, dtype: "q8" });

      // WebGPU where it genuinely works, WASM everywhere else. **Tried rather than detected**,
      // because asking the question is not the same as getting an answer: a browser can expose
      // `navigator.gpu`, hand out an adapter, and still fail to stand up a WebGPU backend — a
      // blocklisted driver, a VM, a headless session, Linux without Vulkan. This started life as
      // `"gpu" in navigator`, which is true in all of those, and the result was not a slow
      // assist but a broken one: `no available backend found`, thrown out of the first
      // suggestion anybody asked for, on precisely the machines the fallback exists for.
      if (await webGpuUsable()) {
        try {
          return await build("webgpu");
        } catch (err) {
          console.warn("WebGPU reported itself usable and then was not; falling back to WASM", err);
        }
      }
      // Slower, and it answers. That is the whole reason this backend can be the default.
      return build("wasm");
    })();
    // A failed load must not be cached as a permanent refusal — a flaky CDN fetch would
    // otherwise disable the assist for the life of the tab with no way back but a reload.
    pipe.catch(() => {
      pipe = null;
    });
  }
  return pipe;
}

/** The sliver of the WebGPU API this needs, so the probe can be asked without a browser. */
export interface GpuLike {
  requestAdapter?: () => Promise<unknown>;
}

/**
 * Whether WebGPU is worth *attempting*, which is the strongest thing a probe can honestly say.
 *
 * `requestAdapter()` is the real question — it returns null when there is no usable GPU, where
 * merely reading `navigator.gpu` hands back an object on machines that cannot run a shader. It is
 * still only a strong hint, which is why `load()` treats a failure after this as ordinary rather
 * than exceptional and falls back anyway.
 *
 * **Takes its world as an argument**, for the reason `runChain` and `chooseAssistant` do: the
 * decision is the part worth testing and it should not need a GPU, a browser, or a global to be
 * exercised. Defaults to the real one, so call sites say nothing.
 */
export async function webGpuUsable(
  gpu: GpuLike | undefined = (globalThis.navigator as { gpu?: GpuLike } | undefined)?.gpu,
): Promise<boolean> {
  try {
    if (!gpu?.requestAdapter) return false;
    return (await gpu.requestAdapter()) != null;
  } catch {
    // A driver that refuses rather than declines. Indistinguishable from "no" downstream, and
    // treating it differently would mean a crash where a slower answer was available.
    return false;
  }
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

/**
 * Measured, not chosen. Swept over the held-out set against this exact checkpoint: 9 of 31
 * drafts get a suggestion and 89% of those are right, with all three pieces of noise refused.
 *
 * Separation is doing the work and lift is nearly inert here, which is the opposite of the
 * Ollama adapter's shape — this checkpoint spreads its labels out and discriminates by distance,
 * so the bar that matters is how far clear the winner is. Handed nomic's pair instead, this
 * backend spoke on 15 of 31 at 73%.
 */
const CALIBRATION = { separation: 1.2, lift: 0.1 };

export function inPageAssistant(): LocalAssistant {
  return fromEmbedder(
    "in-page",
    embed,
    async () => {
      // Deliberately not a load. `reachable` runs to decide whether to *offer* the assist, and
      // downloading a model to answer that question would make merely opening the settings cost
      // 27MB on a conference wifi. What is checked is the only thing that can actually rule it
      // out: a browser too old to fetch a module at runtime.
      return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
    },
    CALIBRATION,
  );
}
