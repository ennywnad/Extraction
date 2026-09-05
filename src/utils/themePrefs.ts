/**
 * Which theme this viewer is looking at.
 *
 * Three choices, two outcomes. `system` follows the operating system and keeps following it —
 * a laptop that flips at sunset flips the app with it — while `light` and `dark` are a
 * decision to override that. The distinction has to survive a reload, which is why the stored
 * value is the *choice* and never the resolved colour: storing "dark" because it happened to
 * be evening is how an app stops responding to the setting it was asked to respect.
 *
 * Per viewer and never on the wire, for the same reason as src/utils/boardPrefs.ts and
 * src/utils/chorusPrefs.ts: this is "what am I comfortable looking at", not a fact about the
 * engagement. A facilitator dimming a projector must not dim everybody's screen.
 *
 * Everything below the resolver is DOM. `resolveTheme` deliberately is not — it takes the
 * system preference as an argument rather than reading it, so the one piece with a decision in
 * it can be tested without a browser.
 */
export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/**
 * Follow the system. It is the answer to "does this app respond to dark mode" being yes by
 * default, and anyone who wants otherwise is two clicks away.
 */
export const DEFAULT_THEME: ThemeChoice = "system";

/** The order the control cycles through. */
export const THEME_ORDER: ThemeChoice[] = ["system", "light", "dark"];

/**
 * Stored as a bare string rather than JSON, because index.html reads this key too — see the
 * pre-paint script there and the note on why it exists. Changing this name means changing it
 * in both places; test/theme.test.ts fails if they drift apart.
 */
export const THEME_KEY = "extraction.theme";

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

export function loadThemeChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return isChoice(raw) ? raw : DEFAULT_THEME;
  } catch {
    // A private window, cleared site data, or a value written by an older build. Following the
    // system is the safe answer to all three.
    return DEFAULT_THEME;
  }
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage can be unavailable or full; the choice simply does not outlive the tab.
  }
}

/** The pure half: a choice plus what the OS says, giving the theme actually shown. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "light" || choice === "dark") return choice;
  return systemPrefersDark ? "dark" : "light";
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    // matchMedia is absent in some embedded webviews. Light is the safer guess: a light app on
    // a dark system is merely bright, while the reverse can be unreadable on a device whose
    // browser is compositing for light.
    return false;
  }
}

/**
 * Writes the resolved theme where the CSS can see it.
 *
 * `data-theme` on the root element always carries a resolved value — never "system" — which is
 * what lets src/index.css define dark under one selector instead of maintaining the same block
 * twice, once for the attribute and once inside a `prefers-color-scheme` query.
 */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * Calls back when the operating system's preference changes, and returns an unsubscribe.
 *
 * Fires regardless of the current choice: somebody on `light` who switches back to `system`
 * must land on whatever the OS is saying *then*, not on what it said when the tab opened.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  try {
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  } catch {
    return () => undefined;
  }
}

/** How the control describes itself. */
export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "Theme: following your system",
  light: "Theme: light",
  dark: "Theme: dark",
};
