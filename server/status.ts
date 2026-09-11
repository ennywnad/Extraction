/**
 * What this instance is, as one value.
 *
 * "Configuration decides behavior" is the most distinctive thing about how this is built and
 * the hardest thing to observe: identity resolves at boot, the store logs its branch, the
 * model client knows its backend, and none of them could be *asked*. Until now the only ways
 * to find out were reading `.env`, tailing the boot log, or waiting for a warning banner.
 *
 * This is the reporting half only — the seams answer, one shape collects the answers. The
 * board that draws it is docs/intents/007-status-board.md, and that intent's audience
 * question (operator view vs participant view) is deliberately not answered here.
 *
 * Two rules hold this shape, and `test/status.test.ts` enforces both:
 *
 * **Shapes, not secrets.** /healthz is unauthenticated, so this reports "vertex" and "3
 * models in chain" — never the project id, the IAP audience, the model ids or the store
 * path. That is the same disclosure line `sendAiError` draws for errors.
 *
 * **Say what is not known.** Configured is not the same as working. `storage.live` is false
 * for a Firestore store nothing has opened yet, and a model backend being present says a
 * client was built, not that it has answered. Per-response truth stays where it already is:
 * `source` and X-Extraction-AI-Source.
 */
import type { AuthConfig } from "./authMode.ts";
import { availableProviders, modelBackend, modelChain } from "./ai/client.ts";
import { storeBackend, storeIsLive } from "./store/index.ts";
import type { InstanceStatus } from "../src/types.ts";

/**
 * Re-exported from src/types.ts, where the shape is declared with the rest of what crosses
 * the wire: the board that draws it ([src/components/StatusBoard.tsx]) is a client component,
 * and a type it and this file both depend on cannot live only on the server side.
 *
 * The unions there are spelled out literally; this file assigns `AuthConfig["mode"]`,
 * `StoreBackend` and `ModelBackend` into them, so a new branch on any seam that nobody
 * declared is a compile error rather than a field the board silently cannot render.
 *
 * That guarantee only reaches as far as the type. When the model seam grew from two backends
 * to four, the board rendered the two new ones through a ternary chain that compiled fine and
 * drew them as "None" — so `StatusBoard.tsx` now keys them off an exhaustive record, and a
 * fifth backend is a `npm run lint` failure there too.
 */
export type { InstanceStatus };

export function instanceStatus(auth: AuthConfig): InstanceStatus {
  const providers = availableProviders();
  // "Which providers can answer" is the honest test of whether AI is on, not "which auth was
  // configured": a deployment can name a backend and still reach nothing, and every AI route
  // has a labelled static answer for exactly that case.
  const backend = providers.length ? modelBackend() : "none";
  return {
    ok: true,
    identity: { mode: auth.mode, verified: auth.mode === "iap" },
    storage: { backend: storeBackend(), live: storeIsLive() },
    model: { backend, chainLength: modelChain().length, providers },
    aiEnabled: providers.length > 0,
  };
}
