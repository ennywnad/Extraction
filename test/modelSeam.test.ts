/**
 * The rules that keep the seam from quietly stopping being one.
 *
 * A provider seam has the same failure mode as the theme in test/theme.test.ts, and it is just
 * as silent: somebody adds a route, reaches for `@google/genai` because that is what the
 * neighbouring code used to do, and it *works*. Nothing breaks, no test fails, and the app's
 * central claim — that the provider is a property of the deployment — is now false for one
 * route in a way nobody can see from the outside.
 *
 * So the first half of this file is structural, over the source rather than over behaviour.
 * The second half is the translation itself, which 002 calls "the whole job": one schema, two
 * providers, and the assertion that neither adapter is quietly rewriting it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geminiRequest } from "../server/ai/providers/gemini.ts";
import { claudeRequest } from "../server/ai/providers/claude.ts";
import { RECOMMEND_SCHEMA } from "../server/ai/schema.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Comments are stripped before anything is matched.
 *
 * The rule below is about code. A doc comment that says "this used to be a
 * `config.responseSchema`" is the opposite of a coupling — it is the explanation of why the
 * coupling is gone — and a test that forbids naming the old API makes the documentation worse
 * to keep itself green. Crude stripping is fine here: the cost of a false negative is one
 * missed coupling in a string literal, and the cost of scanning comments is a rule nobody can
 * write an honest comment under.
 */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every source file the app ships on the server side, comments removed. */
const sources = [...walk(path.join(root, "server")), path.join(root, "server.ts")].map((f) => ({
  file: path.relative(root, f),
  text: code(readFileSync(f, "utf8")),
}));

const ADAPTERS = "server/ai/providers/";

describe("the seam — no route speaks a provider's dialect", () => {
  it("keeps every provider SDK import inside an adapter", () => {
    // The one rule the whole thing rests on. `getGemini()` used to be exported and called from
    // nine routes; each of those was a place the app knew which provider it was talking to.
    const offenders = sources
      .filter(({ file }) => !file.startsWith(ADAPTERS))
      .filter(({ text }) => /from "@google\/genai"|from "@anthropic-ai\//.test(text))
      .map(({ file }) => file);
    assert.deepEqual(offenders, [], "import the seam from server/ai/client.ts instead");
  });

  it("has no Gemini schema vocabulary outside the Gemini adapter", () => {
    // `Type.OBJECT` and `responseSchema` are how the nine call sites used to declare shapes.
    // They are JSON Schema in a costume, and the costume is the coupling.
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      if (file.startsWith(ADAPTERS)) continue;
      for (const [match] of text.matchAll(/\bType\.[A-Z]+|responseSchema|responseMimeType/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("has no Claude request vocabulary outside the Claude adapter", () => {
    // Symmetrical, and the more likely mistake now: the newer SDK is the one somebody would
    // reach for while adding a route with Claude in mind.
    //
    // Request vocabulary only. Naming `ANTHROPIC_API_KEY` in a comment about configuration is
    // not a coupling — the SDK import is what would be, and the test above forbids that.
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      if (file.startsWith(ADAPTERS)) continue;
      for (const [match] of text.matchAll(/output_config|max_tokens|messages\.create/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("leaves the app with no way to name a provider at a call site", () => {
    // The seam would also be a lie if a route branched on which provider was configured. The
    // chain decides that; a route states a prompt and a schema and nothing else.
    const offenders: string[] = [];
    for (const { file, text } of sources) {
      if (file.startsWith(ADAPTERS) || file === "server/ai/client.ts") continue;
      if (file === "server/status.ts") continue; // reports the branch; does not choose it
      for (const [match] of text.matchAll(/availableProviders|modelBackend\(\)/g)) {
        offenders.push(`${file}: ${match}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("the seam — one schema, two providers", () => {
  const schema = RECOMMEND_SCHEMA;
  const request = { prompt: "which mode?", schema };

  it("hands Gemini the schema as plain JSON Schema, not as the Type enum", () => {
    // `responseJsonSchema` is why the translation step 002 anticipated turned out not to
    // exist on this side: the schemas were always ordinary JSON Schema wearing `Type.OBJECT`,
    // and this field takes the plain article.
    const built = geminiRequest("gemini-3.5-flash", request);
    assert.equal(built.config.responseJsonSchema, schema, "the same object, not a copy");
    assert.equal(built.config.responseMimeType, "application/json", "required alongside it");
    assert.equal(built.contents, "which mode?");
  });

  it("hands Claude the same object through output_config.format", () => {
    const built = claudeRequest("claude-opus-5", request);
    assert.equal(built.output_config.format.type, "json_schema");
    assert.equal(
      built.output_config.format.schema as unknown,
      schema,
      "both providers receive the identical schema; neither adapter rewrites it",
    );
    assert.deepEqual(built.messages, [{ role: "user", content: "which mode?" }]);
  });

  it("gives Claude a token ceiling, which Gemini does not require", () => {
    // A real asymmetry rather than one this seam invented: `max_tokens` is required by the
    // Messages API and optional for Gemini. The seam surfaces the difference in the adapter
    // rather than forcing every call site to carry a number for one provider's benefit.
    assert.equal(typeof claudeRequest("claude-opus-5", request).max_tokens, "number");
    assert.equal(
      "maxOutputTokens" in geminiRequest("gemini-3.5-flash", request).config,
      false,
      "unset unless the caller asked",
    );
  });

  it("passes an explicit ceiling through to both", () => {
    const capped = { ...request, maxTokens: 512 };
    assert.equal(claudeRequest("claude-opus-5", capped).max_tokens, 512);
    assert.equal(
      (geminiRequest("gemini-3.5-flash", capped).config as { maxOutputTokens?: number })
        .maxOutputTokens,
      512,
    );
  });

  it("names the model it was asked for, and only that", () => {
    assert.equal(geminiRequest("gemini-3.5-flash", request).model, "gemini-3.5-flash");
    assert.equal(
      claudeRequest("claude-opus-4-5@20251101", request).model,
      "claude-opus-4-5@20251101",
      "a dated snapshot keeps its @ separator; the adapter does not normalise ids",
    );
  });
});
