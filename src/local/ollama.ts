/**
 * The assist for somebody who is already running a real local model.
 *
 * Second in the order, and it has to be second: probing localhost is not free the way an in-page
 * check is. Since Chrome 142 a page served from a public origin that fetches a loopback address
 * is permission-gated, so asking every browser to look would fire a native prompt at people who
 * never asked for a local model — a worse first impression than the feature is worth. It is
 * reached only when somebody has turned it on, which is also when they have done the two things
 * it needs:
 *
 * - **The browser gate.** One click to allow local network access. Permission-gated local
 *   requests are exempt from mixed-content checks, which is the only reason a deployed HTTPS
 *   page can call `http://localhost` at all.
 * - **The runtime gate.** Ollama sends no CORS headers to a browser origin by default — only
 *   `127.0.0.1` and `0.0.0.0` are permitted — so `OLLAMA_ORIGINS` has to name the app's origin
 *   and the runtime has to be restarted.
 *
 * Both are recorded in docs/intents/006 with references, because both are areas that move.
 *
 * **An embedding model rather than a chat model**, which is worth saying because it is the
 * opposite of the obvious choice. The task is scoring a draft against a closed label set, and
 * asking a chat model for a label means parsing free text that can answer with a label nobody
 * offered, in a sentence, or in the wrong case — and then either trusting it or writing a
 * matcher over its prose. Embeddings answer the question the seam actually asks, in numbers,
 * and let this adapter and the in-page one be genuinely interchangeable instead of one being
 * bolted on beside the other.
 */
import { fromEmbedder, type Embedder } from "./embedding.ts";
import type { LocalAssistant } from "./types.ts";

const ORIGIN = "http://localhost:11434";

/** Ollama's default embedding model. Pulled with `ollama pull nomic-embed-text`. */
const MODEL = "nomic-embed-text";

/**
 * Short, and short on purpose.
 *
 * This runs while somebody waits to press submit. An assist is an offer, so the correct
 * behaviour when a local runtime is busy or paging a model in is to give up and show nothing —
 * a fragment held hostage to a spinner is a worse outcome than an untagged fragment, and the
 * whole app exists to get thought out before the editing voice arrives.
 */
const TIMEOUT_MS = 4000;

/**
 * The task prefix this model was trained to be asked with.
 *
 * Nomic's embedders are trained with a task prefix on every input, and they are not robust to
 * its absence: without one the vectors drift toward topic and register, which is measurable
 * rather than theoretical — the same held-out set scores worse with no prefix and worse again
 * with the asymmetric `search_query:` / `search_document:` pair, which is for retrieval and
 * treats the draft and the label as different kinds of thing. `classification:` on both sides is
 * the symmetric one, and it is what this comparison actually is.
 *
 * It lives here rather than in labels.ts because it is a fact about *this runtime's model*, not
 * about the labels. The in-page backend runs a sentence-transformers checkpoint that takes no
 * prefix at all, and putting this in the shared layer would corrupt its inputs — which is the
 * whole reason a prefix is the adapter's business.
 */
const TASK_PREFIX = "classification: ";

const embed: Embedder = async (texts) => {
  const res = await fetch(`${ORIGIN}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts.map((t) => TASK_PREFIX + t) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama answered ${res.status}`);
  const body = (await res.json()) as { embeddings?: number[][] };
  // Returned as-is rather than padded or truncated to the input length. fromEmbedder checks the
  // count and declines to score a mismatch, which is the right place for that decision: an
  // adapter that quietly made the shapes line up would turn a broken call into a confident
  // suggestion built out of whichever vectors happened to arrive.
  return body.embeddings ?? [];
};

export function ollamaAssistant(): LocalAssistant {
  return fromEmbedder("ollama", embed, async () => {
    const res = await fetch(`${ORIGIN}/api/tags`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok;
  });
}
