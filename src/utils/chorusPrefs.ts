/**
 * Whether the pile answers back, remembered per viewer.
 *
 * Per viewer rather than per room, for the reason `sanitizeMetaPatch` already strips
 * `promptingStyle` out of shared settings in server/engagementRoutes.ts: what one person is
 * shown while they think is theirs. One participant switching this off must not take the room's
 * echo away from the other eleven, and a facilitator with it on a projector must not force it
 * on everybody.
 *
 * **On by default**, which is the arguable half. The objection to anything that talks while a
 * room is thinking is interference — the case docs/intents/005-listening-mode.md makes, and it
 * is a good one. It does not apply here, because the echo fires only *after* a fragment is
 * committed: by the time you are shown who else is near you, your own words are already in the
 * pile and cannot be revised toward theirs. Showing it while somebody types would be an
 * anchoring machine, and that is the one thing this must never do. Given that, the feature is
 * worth nothing if nobody finds it, so it starts on and turning it off is one click.
 */
export interface ChorusPrefs {
  enabled: boolean;
}

export const DEFAULT_CHORUS: ChorusPrefs = { enabled: true };

const KEY = "extraction.chorus.prefs";

export function loadChorusPrefs(): ChorusPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CHORUS;
    const stored = JSON.parse(raw) as Partial<ChorusPrefs>;
    return {
      enabled: typeof stored?.enabled === "boolean" ? stored.enabled : DEFAULT_CHORUS.enabled,
    };
  } catch {
    // A private window, cleared site data, or a blob that is not JSON any more. Not worth an
    // error: the workspace simply opens with the default.
    return DEFAULT_CHORUS;
  }
}

export function saveChorusPrefs(prefs: ChorusPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable or full; the preference just does not outlive the tab.
  }
}
