/**
 * Which local assists are switched on, remembered per viewer.
 *
 * Per viewer rather than per room, for the reason chorusPrefs.ts is: what one person is shown
 * while they think is theirs. It is more clearly right here than there — the assist runs on
 * *this* machine, against *this* person's unsubmitted draft, so a room-level setting would be a
 * facilitator switching on a feature that only works for whoever happens to have a runtime.
 *
 * **Off by default, and that is docs/intents/006 being explicit rather than cautious.** The
 * chorus starts on because it fires after a fragment is committed and cannot change what
 * somebody wrote. An assist is the opposite: it appears while a draft is still editable, and
 * the app exists to get raw thought out before the editing voice arrives. Anything that reads
 * your draft back to you has to be asked for.
 */
export interface AssistPrefs {
  /** Suggest one of the four pile tags. */
  tag: boolean;
  /** Suggest one of the ten level-set areas. */
  area: boolean;
}

export const DEFAULT_ASSISTS: AssistPrefs = { tag: false, area: false };

const KEY = "extraction.assist.prefs";

export function loadAssistPrefs(): AssistPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ASSISTS;
    const stored = JSON.parse(raw) as Partial<AssistPrefs>;
    // Read strictly, like Session.listening: a coerced truthy value here would switch on a
    // feature nobody asked for, which is the one direction an off-by-default setting must not
    // fail in.
    return {
      tag: stored?.tag === true,
      area: stored?.area === true,
    };
  } catch {
    // A private window, cleared site data, or a blob that is no longer JSON. The workspace
    // opens with both assists off, which is also what somebody who has never used this gets.
    return DEFAULT_ASSISTS;
  }
}

export function saveAssistPrefs(prefs: AssistPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable or full; the preference just does not outlive the tab.
  }
}

/** Whether anything is switched on at all — the question the workspace asks before probing. */
export function anyAssistOn(prefs: AssistPrefs): boolean {
  return prefs.tag || prefs.area;
}
