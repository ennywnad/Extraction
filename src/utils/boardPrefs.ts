/**
 * Which boxes and which counts the status board shows.
 *
 * One object, shared by both views. The board and the popup are the same information at two
 * sizes, so a viewer who turns a box off on one and finds it back on the other has been given
 * two settings screens by accident.
 *
 * Per viewer, not per room: this is "what do I want to look at", not a fact about the
 * engagement. So it lives in localStorage and never reaches the server — turning a tile off
 * on a projector must not turn it off for everyone in the room.
 */

export type BoardBox = "identity" | "storage" | "model" | "mcp";

export type BoardStat =
  "roster" | "polling" | "fragments" | "voices" | "modes" | "recent" | "roles" | "dark" | "age";

export interface BoardPrefs {
  boxes: Record<BoardBox, boolean>;
  stats: Record<BoardStat, boolean>;
}

/** The seams, in the order a request meets them, with the not-yet-built one last. */
export const BOX_ORDER: BoardBox[] = ["identity", "storage", "model", "mcp"];

export const STAT_ORDER: BoardStat[] = [
  "roster",
  "polling",
  "fragments",
  "voices",
  "modes",
  "recent",
  "roles",
  "dark",
  "age",
];

export const DEFAULT_PREFS: BoardPrefs = {
  boxes: { identity: true, storage: true, model: true, mcp: true },
  stats: {
    roster: true,
    polling: true,
    fragments: true,
    voices: true,
    modes: false,
    recent: false,
    roles: false,
    dark: false,
    age: false,
  },
};

const KEY = "extraction.statusBoard.prefs";

/**
 * Reads the stored preferences, keeping only keys this version knows.
 *
 * A stored blob is older than the code reading it as soon as a box is added, so an unknown
 * key is dropped and a missing one falls back to its default rather than rendering undefined.
 */
export function loadPrefs(): BoardPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const stored = JSON.parse(raw) as Partial<BoardPrefs>;
    return {
      boxes: pick(DEFAULT_PREFS.boxes, stored?.boxes),
      stats: pick(DEFAULT_PREFS.stats, stored?.stats),
    };
  } catch {
    // A private window, cleared site data, or a blob that is not JSON any more. The board is
    // not worth an error — it just opens showing what it shows by default.
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: BoardPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable or full; the preference simply does not outlive the tab.
  }
}

function pick<K extends string>(
  defaults: Record<K, boolean>,
  stored: Partial<Record<K, boolean>> | undefined,
): Record<K, boolean> {
  const out = { ...defaults };
  for (const key of Object.keys(defaults) as K[]) {
    if (typeof stored?.[key] === "boolean") out[key] = stored[key] as boolean;
  }
  return out;
}
