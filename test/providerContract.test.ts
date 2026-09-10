/**
 * One set of assertions, answered by both providers.
 *
 * Shaped after storeContract.test.ts and for the same reason: the moment there are two
 * implementations behind a seam, testing them separately means the one nobody runs locally
 * goes back to being assumed. The store learned that with Firestore; this is the model call's
 * version of it, and the asymmetry is worse here — Gemini is exercised by a dev key on a
 * laptop, and Claude on Vertex is not exercised by anything until a deployment runs.
 *
 * **What this can and cannot prove.** Both adapters are driven against a stubbed transport, so
 * what is verified is everything up to the wire: the request each one builds from the neutral
 * schema, the parsing on the way back, which model is reported as having answered, and the
 * status gate. What is *not* verified is that Vertex accepts the request — that needs a
 * project with Claude enabled in Model Garden, and it is the same gap docs/intents/008 records
 * for the deployment as a whole. A green run here does not mean Claude has ever answered.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GoogleGenAI } from "@google/genai";
import { AiCallError } from "../server/ai/errors.ts";
import { RECOMMEND_SCHEMA } from "../server/ai/schema.ts";
import { geminiProvider, toGeminiSchema } from "../server/ai/providers/gemini.ts";
import { claudeProvider, textOf, type ClaudeClient } from "../server/ai/providers/claude.ts";
import type { ModelProvider } from "../server/ai/providers/types.ts";

const CHAIN = ["model-a", "model-b"];

/** The body every stub returns, so the assertions can be about plumbing rather than content. */
const ANSWER = { recommendation: "free_stream", confidence: 90 };

function apiError(status: number, message = `HTTP ${status}`) {
  return Object.assign(new Error(message), { status });
}

/**
 * Each entry is what the n-th call does: an Error to throw, or nothing to answer normally.
 * `sent` records the request objects, which is where the schema translation shows up.
 */
interface Stub {
  provider: ModelProvider;
  calls: string[];
  sent: any[];
}

function geminiStub(outcomes: (Error | null)[] = [null]): Stub {
  const calls: string[] = [];
  const sent: any[] = [];
  const ai = {
    models: {
      generateContent: async (params: any) => {
        calls.push(params.model);
        sent.push(params);
        const outcome = outcomes[calls.length - 1];
        if (outcome) throw outcome;
        return { text: JSON.stringify(ANSWER) };
      },
    },
  } as unknown as GoogleGenAI;
  return { provider: geminiProvider(ai, CHAIN), calls, sent };
}

function claudeStub(outcomes: (Error | null)[] = [null]): Stub {
  const calls: string[] = [];
  const sent: any[] = [];
  const client = {
    messages: {
      create: async (params: any) => {
        calls.push(params.model);
        sent.push(params);
        const outcome = outcomes[calls.length - 1];
        if (outcome) throw outcome;
        return {
          content: [{ type: "text", text: JSON.stringify(ANSWER) }],
          stop_reason: "end_turn",
        };
      },
    },
  } as unknown as ClaudeClient;
  return { provider: claudeProvider(client, CHAIN), calls, sent };
}

const IMPLEMENTATIONS = [
  { name: "gemini", stub: geminiStub },
  { name: "claude", stub: claudeStub },
] as const;

for (const { name, stub } of IMPLEMENTATIONS) {
  describe(`model provider contract — ${name}`, () => {
    it("names itself, so a response can say who wrote it", () => {
      assert.equal(stub().provider.name, name);
    });

    it("reports the chain it was given rather than a default of its own", () => {
      assert.deepEqual(stub().provider.models(), CHAIN);
    });

    it("returns parsed data, not a raw response", async () => {
      const { provider } = stub();
      const { data } = await provider.generate({ prompt: "hi", schema: RECOMMEND_SCHEMA });
      assert.deepEqual(data, ANSWER);
    });

    it("reports which model answered, including after advancing the chain", async () => {
      const { provider } = stub([apiError(404, "no such model"), null]);
      const result = await provider.generate({ prompt: "hi", schema: RECOMMEND_SCHEMA });
      assert.equal(result.model, "model-b");
      assert.equal(result.provider, name);
    });

    it("sends the prompt it was given", async () => {
      const { provider, sent } = stub();
      await provider.generate({ prompt: "the prompt", schema: RECOMMEND_SCHEMA });
      assert.match(JSON.stringify(sent[0]), /the prompt/);
    });

    it("stops the chain on a fatal status rather than asking a second model", async () => {
      const { provider, calls } = stub([apiError(403), null]);
      await assert.rejects(() => provider.generate({ prompt: "hi", schema: RECOMMEND_SCHEMA }));
      assert.deepEqual(calls, ["model-a"]);
    });

    it("carries 429 out of an exhausted chain so the caller can back off", async () => {
      const { provider } = stub([apiError(404), apiError(429)]);
      await assert.rejects(
        () => provider.generate({ prompt: "hi", schema: RECOMMEND_SCHEMA }),
        (err: AiCallError) => {
          assert.ok(err instanceof AiCallError);
          assert.equal(err.status, 429);
          return true;
        },
      );
    });
  });
}

/**
 * The half that is not shared: each provider declares the same shape in its own dialect, and
 * these are the translations that would fail as a 400 from one backend and nowhere else.
 */
describe("schema translation", () => {
  it("gemini gets the shape in its own enum, without additionalProperties", () => {
    const translated = toGeminiSchema(RECOMMEND_SCHEMA) as any;
    assert.equal(translated.type, "OBJECT");
    assert.equal(translated.properties.recommendation.type, "STRING");
    assert.equal(translated.properties.confidence.type, "INTEGER");
    assert.equal(translated.properties.alternativeModes.type, "ARRAY");
    assert.equal(translated.properties.alternativeModes.items.type, "STRING");
    assert.deepEqual(translated.required, RECOMMEND_SCHEMA.required);
    // Gemini's Schema has no such field and rejects unknown ones. Claude requires it. This
    // is the single reason the neutral schema could not simply be handed to both.
    assert.ok(
      !("additionalProperties" in translated),
      "additionalProperties must be dropped for Gemini",
    );
  });

  it("claude gets the schema verbatim, under output_config.format", async () => {
    const { provider, sent } = claudeStub();
    await provider.generate({ prompt: "hi", schema: RECOMMEND_SCHEMA });
    assert.equal(sent[0].output_config.format.type, "json_schema");
    assert.deepEqual(sent[0].output_config.format.schema, RECOMMEND_SCHEMA);
    assert.ok(sent[0].max_tokens > 0, "max_tokens is required by this API");
  });
});

/**
 * A refusal arrives as HTTP 200 with no JSON in it, which is a failure mode Gemini does not
 * have. Left unchecked it reaches JSON.parse and surfaces as a parse error, sending whoever
 * is debugging it to look at the schema instead of the prompt.
 */
describe("claude — a refusal is not an answer", () => {
  it("raises rather than returning an empty object", async () => {
    const client = {
      messages: {
        create: async () => ({ content: [], stop_reason: "refusal" }),
      },
    } as unknown as ClaudeClient;

    await assert.rejects(
      () => claudeProvider(client, CHAIN).generate({ prompt: "hi", schema: RECOMMEND_SCHEMA }),
      /declined/,
    );
  });

  it("reads the text block past a leading thinking block", () => {
    const message = {
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"ok":true}' },
      ],
    } as any;
    assert.equal(textOf(message), '{"ok":true}');
  });
});
