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
import { geminiBackend, modelChain, type GeminiBackend } from "./ai/client.ts";
import { storeBackend, storeIsLive, type StoreBackend } from "./store/index.ts";

export interface InstanceStatus {
  ok: true;
  identity: {
    mode: AuthConfig["mode"];
    /** Whether identities are verified (IAP) or asserted (dev). */
    verified: boolean;
  };
  storage: {
    backend: StoreBackend;
    /** Whether that branch has been taken in this process yet. */
    live: boolean;
  };
  model: {
    backend: GeminiBackend;
    /** How many model ids the chain will try, not which ones. */
    chainLength: number;
  };
  /**
   * Retained under its original name because the client's degradation banner reads it, and a
   * fresh clone silently serving canned prompts is the failure nobody notices in time.
   */
  aiEnabled: boolean;
}

export function instanceStatus(auth: AuthConfig): InstanceStatus {
  const model = geminiBackend();
  return {
    ok: true,
    identity: { mode: auth.mode, verified: auth.mode === "iap" },
    storage: { backend: storeBackend(), live: storeIsLive() },
    model: { backend: model, chainLength: modelChain().length },
    aiEnabled: model !== "none",
  };
}
