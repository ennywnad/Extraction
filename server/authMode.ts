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

/**
 * The three audience shapes IAP actually issues, by the product in front of the service.
 * deploy.sh computes the first one; the others are here so an unusual but legitimate
 * deployment is not told it is wrong.
 */
const AUDIENCE_SHAPES: { name: string; pattern: RegExp }[] = [
  { name: "Cloud Run", pattern: /^\/projects\/\d+\/locations\/[^/]+\/services\/[^/]+$/ },
  { name: "App Engine", pattern: /^\/projects\/\d+\/apps\/[^/]+$/ },
  {
    name: "load balancer backend",
    pattern: /^\/projects\/\d+\/global\/backendServices\/\d+$/,
  },
];

const CLOUD_RUN_SHAPE = "/projects/PROJECT_NUMBER/locations/REGION/services/SERVICE_NAME";

/**
 * Checks the audience before a single request depends on it.
 *
 * An audience mismatch is the failure this deployment is most likely to hit first, and it
 * presents as a 401 from every route with nothing in the response to say why — the assertion
 * verified fine, against a different audience than the one expected. The value is *computed*
 * by deploy.sh from a `gcloud projects describe` lookup rather than copied out of the console,
 * so the way it goes wrong is a missing substitution: an empty project number yields
 * `/projects//locations/...`, which deploys perfectly happily and then refuses everyone.
 *
 * Only one case is fatal, and the line is drawn narrowly on purpose. Exiting here buys
 * *diagnosis*, not safety — a wrong audience rejects every assertion, which is broken but not
 * permissive, and `iapAuth` already logs the expected audience on each rejection. So the
 * process may only refuse to start where the value cannot be anything but a bug: an empty path
 * segment, which no audience has and which is exactly what a failed substitution produces.
 *
 * Everything else that this file does not recognise gets a warning and boots. Whether a
 * particular string is a valid audience is a claim about IAP's product surface rather than
 * about this deployment, and refusing to start on that claim would mean a list going stale
 * here could take down a service that was working.
 */
function checkAudienceShape(audience: string): void {
  if (AUDIENCE_SHAPES.some((shape) => shape.pattern.test(audience))) return;

  const emptySegment = audience.includes("//") || audience.endsWith("/");
  if (emptySegment) {
    fatal(
      `IAP_AUDIENCE has an empty path segment: "${audience}". No audience looks like this, ` +
        `and every request would be rejected with a 401. It usually means a substitution ` +
        `failed in scripts/deploy.sh — check that PROJECT_NUMBER resolved. Expected ` +
        `${CLOUD_RUN_SHAPE} for Cloud Run.`,
    );
  }

  console.warn(
    `WARNING: IAP_AUDIENCE "${audience}" does not match any audience format IAP is known ` +
      `to issue (${AUDIENCE_SHAPES.map((s) => s.name).join(", ")}). Continuing, because that ` +
      `list may be out of date — but if every request 401s, this is the first thing to check.`,
  );
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
        "production. Identities are asserted, not verified. Never expose this process.",
    );
  }

  if (mode === "dev" && isProduction) {
    fatal("AUTH_MODE=dev is refused when NODE_ENV=production");
  }

  const iapAudience = (env.IAP_AUDIENCE ?? "").trim();
  if (mode === "iap") {
    if (!iapAudience) {
      fatal(
        `AUTH_MODE=iap requires IAP_AUDIENCE (${CLOUD_RUN_SHAPE}). ` +
          "Set AUTH_MODE=dev for local development.",
      );
    }
    checkAudienceShape(iapAudience);
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
