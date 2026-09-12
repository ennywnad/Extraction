/**
 * Picks the runtime that will answer, and says nothing louder than it can support.
 *
 * The browser's `runChain`, and deliberately the same shape: **it takes its world as
 * arguments**. The order to try and the lookup that turns a name into an adapter are both
 * parameters, so every decision here — try, skip, settle, give up — runs in a test with no
 * WebGPU, no localhost, and no model. Same instinct as server/ai/providers/chain.ts, and for
 * the same reason: the part with the judgement in it should not need the world to be real.
 *
 * It differs from the server chain in one way that matters. A route falling through a chain is
 * trying to answer a question somebody asked; this is trying to offer something nobody asked
 * for. So there is no failure worth surfacing loudly — an assist that cannot reach a runtime
 * simply does not appear, and the toggle says why. The unreachable case is the *ordinary* case
 * here, not the broken one, because 006 is explicit that most people will never configure this.
 */
import type { LocalAssistant, LocalBackend } from "./types.ts";

export interface Choice {
  assistant: LocalAssistant | null;
  /** Backends asked and found unreachable, in the order asked. Reported, never guessed at. */
  unreachable: LocalBackend[];
}

/**
 * The order backends are tried, and the reason it is this order.
 *
 * In-page first because it needs nothing from the person using it — no permission prompt, no
 * environment variable, no restart — so on the overwhelming majority of machines it is the only
 * one that will answer. Ollama second because when somebody has gone to the trouble of running
 * a real local model, that is the more capable answer and they meant it to be used; it simply
 * cannot be the default, since asking every browser to probe localhost would fire a permission
 * prompt at people who never asked for one.
 */
export const DEFAULT_ORDER: LocalBackend[] = ["in-page", "ollama"];

export async function chooseAssistant(
  order: LocalBackend[],
  lookup: (backend: LocalBackend) => LocalAssistant,
): Promise<Choice> {
  const unreachable: LocalBackend[] = [];

  for (const backend of order) {
    const assistant = lookup(backend);
    let ok = false;
    try {
      ok = await assistant.reachable();
    } catch {
      // A probe that throws is a runtime that is not there — a rejected fetch to a closed port,
      // a browser with no WebGPU. Indistinguishable from `false` to everyone downstream, and
      // treating them differently would mean an assist that reports a problem for the normal
      // state of a machine that simply has no local model.
      ok = false;
    }
    if (ok) return { assistant, unreachable };
    unreachable.push(backend);
  }

  return { assistant: null, unreachable };
}
