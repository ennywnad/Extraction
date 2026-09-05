/**
 * The rules that keep a dark theme from rotting.
 *
 * A theme built this way — one CSS file remapping the custom properties every utility already
 * resolves — has exactly one failure mode, and it is silent: somebody writes a colour the
 * remapping does not cover. An arbitrary value (`bg-[#F8F7F4]`) compiles to a literal and can
 * never be re-themed; a hue the dark block never mentions keeps its daylight value. Neither
 * breaks a build, neither breaks a render, and both show up as a patch of white in a dark room
 * on somebody else's screen.
 *
 * So these are structural assertions over the stylesheet and the components rather than tests
 * of behaviour, and they are the reason no component in this app has to know a theme exists.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DEFAULT_THEME, THEME_KEY, resolveTheme } from "../src/utils/themePrefs.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const css = read("src/index.css");
const html = read("index.html");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const components = walk(path.join(root, "src")).map((f) => ({
  file: path.relative(root, f),
  text: readFileSync(f, "utf8"),
}));

/** The `@theme` block: the light values, and the source of every token name. */
const themeBlock = css.slice(css.indexOf("@theme {"), css.indexOf("\n:root {"));
/** The dark block: everything the theme has to restate. */
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"] {'), css.indexOf("\nbody {"));

const tokensIn = (block: string) =>
  new Set([...block.matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1]));

describe("theme — the resolver", () => {
  it("lets an explicit choice beat the system, in both directions", () => {
    assert.equal(resolveTheme("light", true), "light");
    assert.equal(resolveTheme("dark", false), "dark");
  });

  it("follows the system when asked to", () => {
    assert.equal(resolveTheme("system", true), "dark");
    assert.equal(resolveTheme("system", false), "light");
  });

  it("defaults to following the system, which is what makes the app answer the OS at all", () => {
    assert.equal(DEFAULT_THEME, "system");
  });
});

describe("theme — the stylesheet covers what the components ask for", () => {
  it("gives every named token a dark value", () => {
    const missing = [...tokensIn(themeBlock)].filter((t) => !tokensIn(darkBlock).has(t));
    assert.deepEqual(missing, [], "these tokens keep their light value in dark mode");
  });

  it("gives every Tailwind hue the components use a dark ramp", () => {
    // Steps Tailwind actually ships. A class naming any other step emits no CSS at all, so it
    // needs no dark value — see the dead-class test below.
    const STEPS = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    const HUE =
      /\b(?:bg|text|border|from|to|via|ring|placeholder|divide|decoration|fill|stroke|shadow|outline|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|zinc|slate|gray|neutral|stone)-(\d{2,3})\b/g;

    const dark = tokensIn(darkBlock);
    const missing = new Set<string>();
    for (const { text } of components) {
      for (const [, hue, step] of text.matchAll(HUE)) {
        if (!STEPS.has(Number(step))) continue;
        if (!dark.has(`${hue}-${step}`)) missing.add(`${hue}-${step}`);
      }
    }
    assert.deepEqual([...missing].sort(), [], "these keep their daylight value in dark mode");
  });

  it("remaps ink and paper rather than leaving black and white alone", () => {
    // The whole inversion rests on these two. Every border-black, text-black, bg-white and
    // shadow-hard-* in the app follows them and nothing else.
    for (const token of ["black", "white"]) {
      assert.ok(tokensIn(darkBlock).has(token), `--color-${token} is not remapped`);
    }
  });
});

describe("theme — components name tokens, never colours", () => {
  it("has no arbitrary colour value anywhere in a component", () => {
    // `bg-[#F8F7F4]` compiles to a literal. It survives into dark mode as daylight, and no
    // amount of stylesheet can reach it.
    const offenders: string[] = [];
    for (const { file, text } of components) {
      for (const [match] of text.matchAll(/[a-z-]+-\[#[0-9a-fA-F]{3,8}\]/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }
    assert.deepEqual(offenders, [], "use a token from src/index.css instead");
  });

  it("has no bare hex colour in a component, including inline styles", () => {
    // StatusBoard used to hold its swatch colours as JS constants, which no stylesheet can
    // re-theme either. They are `var(--color-*)` strings now.
    const offenders: string[] = [];
    for (const { file, text } of components) {
      for (const [match] of text.matchAll(/#[0-9a-fA-F]{6}\b/g))
        offenders.push(`${file}: ${match}`);
    }
    assert.deepEqual(offenders, []);
  });

  it("has no hard shadow written as an arbitrary value", () => {
    // The point of shadow-hard-* is that the shadow resolves --color-black and inverts with
    // it. Written out longhand it stays black, and disappears into a dark background.
    const offenders: string[] = [];
    for (const { file, text } of components) {
      for (const [match] of text.matchAll(/shadow-\[[^\]]*rgba?\([^\]]*\]/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("theme — the pre-paint script", () => {
  it("reads the same storage key the app writes", () => {
    // index.html resolves the theme inline, before the bundle loads, so a viewer on dark mode
    // never sees a white frame. That means the logic exists twice; this is the half of the
    // duplication a test can hold together.
    assert.ok(html.includes(`"${THEME_KEY}"`), `index.html does not read ${THEME_KEY}`);
    assert.ok(html.includes("prefers-color-scheme: dark"), "it must resolve system, not assume");
    assert.ok(
      html.indexOf("dataset.theme") < html.indexOf('src="/src/main.tsx"'),
      "it has to run before the bundle to be worth having",
    );
  });
});

describe("theme — classes that were already dead", () => {
  it("does not grow the set of Tailwind steps that do not exist", () => {
    // Pre-existing and not this theme's doing: these name steps Tailwind has never shipped, so
    // they emit nothing and the element falls through to whatever is behind it. Recorded rather
    // than fixed, because fixing one means guessing which step was meant. The assertion is that
    // the list does not get longer.
    const KNOWN_DEAD = new Set([
      "emerald-550",
      "green-755",
      "indigo-150",
      "indigo-505",
      "indigo-550",
      "orange-450",
      "orange-505",
      "red-650",
      "slate-150",
      "slate-205",
      "slate-405",
      "slate-450",
      "slate-505",
      "slate-550",
      "slate-655",
      "slate-705",
      "slate-750",
      "violet-650",
      "zinc-550",
      "zinc-650",
      "zinc-755",
    ]);
    const STEPS = new Set([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
    const HUE =
      /\b(?:bg|text|border|from|to|via|ring|placeholder|divide|decoration|fill|stroke|shadow|outline|accent)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|zinc|slate|gray|neutral|stone)-(\d{2,3})\b/g;

    const found = new Set<string>();
    for (const { text } of components) {
      for (const [, hue, step] of text.matchAll(HUE)) {
        if (!STEPS.has(Number(step))) found.add(`${hue}-${step}`);
      }
    }
    const added = [...found].filter((c) => !KNOWN_DEAD.has(c)).sort();
    assert.deepEqual(
      added,
      [],
      "these name a Tailwind step that does not exist, so they do nothing",
    );
  });
});
