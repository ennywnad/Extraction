/**
 * The model seam's configuration, read under names that no longer promise a provider.
 *
 * `GENAI_BACKEND` and `GEMINI_MODELS` were accurate while there was one provider and became
 * lies the moment there were two: a chain that can hold a Claude id is not a list of Gemini
 * models. So the current names are `MODEL_BACKEND` and `MODEL_CHAIN`.
 *
 * **The aliases exist because of deployment order, not politeness.** `scripts/deploy.sh`
 * pushes straight to production, and a running service carries the old names in its own
 * environment — so a rename with no alias is a service that boots with no model configured
 * and answers every AI route from its fallback until somebody notices. Both names are read
 * here, the new one wins, and using the old one warns once at boot rather than every request.
 *
 * **The API keys are deliberately not renamed, and that is the sharper half of the decision.**
 * An earlier pass folded them into a single provider-neutral `MODEL_API_KEY`, which is wrong:
 * with two providers there are two keys, and one variable cannot name both. `GEMINI_API_KEY`
 * and `ANTHROPIC_API_KEY` sit beside each other, because a key names the provider whose key
 * it is — the one variable here whose provider name was never a lie.
 */

const warned = new Set<string>();

/**
 * Reads `current`, falling back to `legacy` with a one-time warning.
 *
 * An empty string counts as unset. `deploy.sh` composes `--set-env-vars` from shell
 * variables that may be empty, so a deployment that never chose a chain arrives with
 * `MODEL_CHAIN=` rather than with nothing, and treating that as "configured" would pin the
 * chain to the empty list.
 */
function read(current: string, legacy: string): string | undefined {
  const now = process.env[current]?.trim();
  if (now) return now;

  const before = process.env[legacy]?.trim();
  if (before && !warned.has(legacy)) {
    warned.add(legacy);
    console.warn(
      `${legacy} is deprecated and will stop being read; rename it to ${current}. ` +
        `Both are accepted for now, and ${current} wins when both are set.`,
    );
  }
  return before || undefined;
}

/** Which provider answers, and how it authenticates. See `ModelBackend` in client.ts. */
export function modelBackendSetting(): string | undefined {
  return read("MODEL_BACKEND", "GENAI_BACKEND");
}

/** The raw chain string, still comma-separated and still possibly unset. */
export function modelChainSetting(): string | undefined {
  return read("MODEL_CHAIN", "GEMINI_MODELS");
}

/**
 * The key for a provider, or undefined when it is absent or still the `.env.example`
 * placeholder — a placeholder is not a key, and treating it as one turns "nothing is
 * configured" into a 401 on the first request.
 */
export function providerKey(name: "GEMINI_API_KEY" | "ANTHROPIC_API_KEY"): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value === `MY_${name}` ? undefined : value;
}

/** Test seam: the warning is once per process, which a second test case would not see. */
export function resetDeprecationWarnings(): void {
  warned.clear();
}
