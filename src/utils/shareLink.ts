/**
 * Session snapshots travel home in a query parameter, which is a stricter channel than plain
 * base64 survives.
 *
 * Two encodings have to line up:
 *
 * 1. **UTF-8.** `btoa` only accepts code points below 256, so the payload is percent-encoded
 *    first. That pairing is what lets a fragment contain an emoji or an em dash.
 * 2. **base64url.** Standard base64's `+` is the wire form of a space in a query string, so
 *    `URLSearchParams` hands back a snapshot with spaces where the `+` used to be, `atob`
 *    silently drops them as whitespace, and every byte after the first one shifts. A single
 *    `~` in a fragment is enough to produce a `+`, which made a small share of links decode
 *    into garbage rather than fail cleanly. `-` and `_` have no meaning in a query string.
 */

/** Standard base64 -> base64url, minus the padding a query string does not need. */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * base64url -> standard base64. A space is read as `+`: base64url never contains one, so a
 * space can only be a link written by an older build and mangled in transit. Decoding those
 * costs one `replace` and keeps already-shared links working.
 */
function fromBase64Url(param: string): string {
  const b64 = param.replace(/[-\s]/g, "+").replace(/_/g, "/");
  return b64 + "=".repeat((4 - (b64.length % 4)) % 4);
}

export function encodeSnapshot(session: unknown): string {
  return toBase64Url(btoa(encodeURIComponent(JSON.stringify(session))));
}

/** Throws on a truncated or corrupted parameter; callers report that to the user. */
export function decodeSnapshot(param: string): unknown {
  return JSON.parse(decodeURIComponent(atob(fromBase64Url(param))));
}
