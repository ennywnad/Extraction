/**
 * The rule that keeps a documented path from outliving the file it names.
 *
 * This repo documents itself by pointing at code — CLAUDE.md, DEPLOYMENT.md and every intent
 * file are mostly prose wrapped around relative links into `src/`, `server/`, `test/` and
 * `scripts/`. That style is worth keeping and it has one silent failure mode: a file moves,
 * every link to it rots, and nothing notices because no build step reads a Markdown link.
 * `src/utils/coverage.ts` moved out of `server/ai/` and left six dead links behind it in
 * STATUS.md alone, found by reading rather than by failing.
 *
 * So this is a scan, the same instinct as test/theme.test.ts and test/modelSeam.test.ts: the
 * convention is load-bearing, and the way it dies is that breaking it costs nothing.
 *
 * **Only links are checked, not paths mentioned in prose.** A backtick path is often a
 * deliberate statement about history — "`test/providerContract.test.ts` was deleted into it"
 * is true precisely because the file is gone, and a test that demanded it exist would be
 * asking the log to lie.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * `planv1/` is excluded by the same reasoning that exempts a backtick path: it is the frozen
 * design record of what got built, committed with its provenance, and it describes a
 * repository that no longer exists. Correcting its paths would be rewriting the plan rather
 * than fixing a link. Everything outside it is expected to describe the repo as it is now.
 */
const FROZEN = ["planv1"];

function markdown(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (FROZEN.includes(path.relative(root, full))) continue;
      markdown(full, out);
    } else if (full.endsWith(".md")) out.push(full);
  }
  return out;
}

/** `[text](target)`, with an optional `"title"` after the target. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const docs = markdown(root).map((file) => ({
  rel: path.relative(root, file),
  text: readFileSync(file, "utf8"),
}));

describe("documented paths — a link names a file that exists", () => {
  it("finds the Markdown to scan", () => {
    // A walk that silently matched nothing would pass every assertion below.
    assert.ok(docs.length >= 10, `expected the docs tree, found ${docs.length} files`);
    assert.ok(docs.some((d) => d.rel === "CLAUDE.md"));
    assert.ok(docs.some((d) => d.rel.startsWith("docs/intents/")));
  });

  it("resolves every relative link", () => {
    const dead: string[] = [];
    for (const { rel, text } of docs) {
      for (const [, target] of text.matchAll(LINK)) {
        // External and same-page links are somebody else's to keep alive.
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const [pathPart] = decodeURIComponent(target).split("#");
        if (!pathPart) continue;
        const resolved = path.resolve(path.dirname(path.join(root, rel)), pathPart);
        if (!existsSync(resolved)) dead.push(`${rel} -> ${target}`);
      }
    }
    assert.deepEqual(
      dead,
      [],
      `${dead.length} link(s) name a file that does not exist:\n  ${dead.join("\n  ")}`,
    );
  });

  it("keeps links inside the repo", () => {
    // `../../..` escapes into whatever happens to sit beside the checkout, which resolves on
    // the machine that wrote it and nowhere else.
    const escaping: string[] = [];
    for (const { rel, text } of docs) {
      for (const [, target] of text.matchAll(LINK)) {
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const [pathPart] = decodeURIComponent(target).split("#");
        if (!pathPart) continue;
        const resolved = path.resolve(path.dirname(path.join(root, rel)), pathPart);
        if (!resolved.startsWith(root + path.sep)) escaping.push(`${rel} -> ${target}`);
      }
    }
    assert.deepEqual(escaping, [], `link(s) point outside the repo:\n  ${escaping.join("\n  ")}`);
  });
});
