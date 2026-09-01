/**
 * Auth configuration, resolved once at boot.
 *
 * The important property here is that misconfiguration is loud and fails closed. An earlier
 * design keyed dev mode on "is IAP_AUDIENCE unset", which meant a single missing environment
 * variable on Cloud Run would silently turn the deployed app into an anonymous free-for-all
 * writing to the real datastore. Instead the mode is explicit, defaults to the safe value,
 * and an inconsistent configuration kills the process at startup rather than at request time.
 */

export type AuthMode = "iap" | "dev";

export interface AuthConfig {
  mode: AuthMode;
  /** Expected `aud` claim. Cloud Run format: /projects/NUM/locations/REGION/services/NAME */
  iapAudience: string;
  devUser: { email: string; name: string };
}

function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

export function resolveAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  // An unset AUTH_MODE resolves to "iap" in production and "dev" otherwise, so a fresh clone
  // runs with no configuration while a deployment cannot silently land in dev mode. This is
  // safe to key on NODE_ENV specifically because a non-production process serves the client
  // through the Vite dev middleware and is not a deployable configuration in the first place.
  const isProduction = env.NODE_ENV === "production";
  const explicit = env.AUTH_MODE?.trim().toLowerCase();
  const raw = explicit || (isProduction ? "iap" : "dev");
  if (raw !== "iap" && raw !== "dev") {
    fatal(`AUTH_MODE must be "iap" or "dev", got "${raw}"`);
  }
  const mode = raw as AuthMode;

  if (mode === "dev" && !explicit) {
    console.warn(
      "WARNING: AUTH_MODE is unset; defaulting to dev identity because NODE_ENV is not " +
        "production. Identities are asserted, not verified. Never expose this process."
    );
  }

  if (mode === "dev" && isProduction) {
    fatal("AUTH_MODE=dev is refused when NODE_ENV=production");
  }

  const iapAudience = (env.IAP_AUDIENCE ?? "").trim();
  if (mode === "iap" && !iapAudience) {
    fatal(
      "AUTH_MODE=iap requires IAP_AUDIENCE " +
        "(/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME). " +
        "Set AUTH_MODE=dev for local development."
    );
  }

  return {
    mode,
    iapAudience,
    devUser: {
      email: (env.DEV_USER_EMAIL || "dev@local.test").toLowerCase(),
      name: env.DEV_USER_NAME || "Local Dev",
    },
  };
}
