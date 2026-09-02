/**
 * Identity from Identity-Aware Proxy.
 *
 * IAP verifies group membership before a request reaches Cloud Run at all, so by the time we
 * see a request the caller is already authorised. What we do here is establish *who* they are,
 * from the signed assertion rather than from a spoofable plaintext header, so fragments can be
 * attributed to a verified person.
 */

import type { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import type { AuthConfig } from "./authMode.ts";

export interface Identity {
  /** Always lowercased; used as the roster key and the attribution join key. */
  email: string;
  /** IAP's stable subject id, or "local-dev". */
  sub: string;
  /** False in dev mode. Never trust an unverified identity for anything durable. */
  verified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: Identity;
    }
  }
}

const IAP_ISSUER = "https://cloud.google.com/iap";
const ASSERTION_HEADER = "x-goog-iap-jwt-assertion";

const oAuth2Client = new OAuth2Client();

export async function verifyIapAssertion(assertion: string, audience: string): Promise<Identity> {
  // getIapPublicKeys() caches internally, so this is not a fetch per request.
  const { pubkeys } = await oAuth2Client.getIapPublicKeys();
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(assertion, pubkeys, audience, [
    IAP_ISSUER,
  ]);

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new Error("IAP assertion is missing email or sub");
  }
  return { email: payload.email.toLowerCase(), sub: payload.sub, verified: true };
}

/**
 * In dev mode, allow impersonating a participant so a shared pile can be exercised from two
 * browser profiles against one server. Deliberately unreachable when mode is "iap".
 */
function devIdentity(req: Request, config: AuthConfig): Identity {
  const header = req.get("x-dev-user");
  const cookie = /(?:^|;\s*)dev_user=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  const override = header || (cookie ? decodeURIComponent(cookie) : undefined);
  const email = (override || config.devUser.email).toLowerCase();
  return { email, sub: `local-dev:${email}`, verified: false };
}

export function createRequireIdentity(config: AuthConfig) {
  return async function requireIdentity(req: Request, res: Response, next: NextFunction) {
    if (config.mode === "dev") {
      req.identity = devIdentity(req, config);
      return next();
    }

    const assertion = req.get(ASSERTION_HEADER);
    if (!assertion) {
      return res.status(401).json({ error: "Missing IAP assertion" });
    }

    try {
      req.identity = await verifyIapAssertion(assertion, config.iapAudience);
      return next();
    } catch (err: any) {
      // The overwhelmingly common cause is an audience mismatch, which is invisible from the
      // outside, so name the expectation in the log. Never in the response.
      console.error(
        `IAP assertion rejected (expected aud "${config.iapAudience}"): ${err?.message || err}`,
      );
      return res.status(401).json({ error: "Invalid IAP assertion" });
    }
  };
}
