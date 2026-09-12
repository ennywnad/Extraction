/**
 * The arithmetic both adapters share, in one place and outside either of them.
 *
 * WebGPU and Ollama reach entirely different runtimes, but both answer the same way: turn text
 * into a vector, and score a draft against a label by the angle between them. That shared half
 * is written once here so the two adapters are the part that differs — reaching the runtime —
 * rather than two copies of a cosine that could disagree.
 *
 * This is not the seam. An adapter that scored by some other means implements `LocalAssistant`
 * directly and never imports this; `fromEmbedder` is a convenience for the two that do, in the
 * same way server/ai/providers/ adapters share the chain but not a request shape.
 */
import type { Label, LocalAssistant, LocalBackend, Scored } from "./types.ts";

/** Turns text into vectors. One vector per input, in order. */
export type Embedder = (texts: string[]) => Promise<number[][]>;

/**
 * Cosine similarity, with the degenerate case answered rather than divided through.
 *
 * A zero vector has no direction, so it has no angle to anything. Returning 0 says "no
 * evidence", which is what an empty draft actually offers; dividing would return `NaN` and
 * `NaN` sorts unpredictably, so one bad vector would reorder every label around it.
 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Builds an assistant from something that can embed.
 *
 * The draft and every label go in **one** call rather than one call per label. Two reasons, and
 * the second is the one that would bite: a batch is far faster on every runtime, and a model
 * loaded lazily would otherwise be asked to warm up fourteen times for one keystroke.
 */
export function fromEmbedder(
  backend: LocalBackend,
  embed: Embedder,
  reachable: () => Promise<boolean>,
): LocalAssistant {
  return {
    backend,
    reachable,
    async classify(text: string, labels: Label[]): Promise<Scored[]> {
      if (!labels.length) return [];
      const vectors = await embed([text, ...labels.map((l) => l.text)]);
      const [draft, ...labelVectors] = vectors;
      // A runtime that returned the wrong number of vectors is not a runtime that returned a
      // weak answer, and scoring the labels that happen to line up would hide that. An absent
      // suggestion is the correct output of a broken call.
      if (!draft || labelVectors.length !== labels.length) return [];
      return labels.map((label, i) => ({ id: label.id, score: cosine(draft, labelVectors[i]) }));
    },
  };
}
