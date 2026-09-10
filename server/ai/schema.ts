/**
 * The nine response shapes, in plain JSON Schema.
 *
 * Every AI route declares what it expects back. Until now each one declared it inline with
 * `@google/genai`'s `Type` enum inside a `config.responseSchema` — which is ordinary JSON
 * Schema in a Gemini costume, and the single largest reason the model call could not be
 * pointed at anything else. Forty-one `Type` uses across nine call sites is what a provider
 * swap actually costs; expressing them once, neutrally, is most of that cost paid down.
 *
 * **Plain JSON Schema rather than a local type**, because it is what one provider takes
 * verbatim: Claude's `output_config.format` carries a `schema` field that is exactly this.
 * The Gemini adapter translates — its `Type` values are these same strings uppercased — so the
 * translation cost sits with the provider that needs translating rather than with every route.
 *
 * **Two of Claude's constraints are enforced by the type, not by a review.** Structured
 * outputs there require `additionalProperties: false` and a complete `required` on every
 * object, and omitting either is a 400 from one provider and silently fine on the other —
 * the worst shape of bug this seam can produce, because it passes every test run against the
 * default backend. So `ObjectSchema` declares both as non-optional and `additionalProperties`
 * as the literal `false`. A schema that would fail on Claude does not compile.
 *
 * What is deliberately absent: `minimum`, `maximum`, `minLength` and the other constraints
 * Claude's structured outputs reject. None of the nine used them — the recommend route's
 * 70-to-100 confidence range was always prose in a `description`, which is why this
 * translation is lossless rather than a narrowing. Keep it that way; a range belongs in the
 * description, where both providers read it.
 */

export type JsonSchema =
  | { type: "string"; description?: string }
  | { type: "integer"; description?: string }
  | { type: "number"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: JsonSchema; description?: string }
  | ObjectSchema;

/**
 * `required` and `additionalProperties` are non-optional on purpose. See the note above: they
 * are the two fields whose absence is invisible on Gemini and fatal on Claude.
 */
export interface ObjectSchema {
  type: "object";
  properties: Record<string, JsonSchema>;
  required: string[];
  additionalProperties: false;
  description?: string;
}

/** A `string[]` property, which seven of the nine schemas want. */
const stringArray = (description: string): JsonSchema => ({
  type: "array",
  items: { type: "string" },
  description,
});

// --- Solo routes, in server.ts ------------------------------------------------------------

export const RECOMMEND_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    recommendation: { type: "string", description: "One of the modes in the provided list" },
    rationale: {
      type: "string",
      description: "A highly specific 1-sentence explanation matching the answers",
    },
    alternativeModes: stringArray("3 other modes that fit well as secondary tracks"),
    confidence: { type: "integer", description: "Matching confidence percentage from 70 to 100" },
  },
  required: ["recommendation", "rationale", "alternativeModes", "confidence"],
  additionalProperties: false,
};

export const QUICK_FIRE_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    prompts: stringArray("Array of exactly 10 customized short questions"),
  },
  required: ["prompts"],
  additionalProperties: false,
};

export const DRILL_NEXT_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    question: { type: "string", description: "The next single insightful question to ask" },
    contextNote: {
      type: "string",
      description: "A brief 1-sentence note of what emotional/logical point is being examined",
    },
  },
  required: ["question", "contextNote"],
  additionalProperties: false,
};

export const DRILL_CLARIFY_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Direct brief response clarifying or discussing the user's comment",
    },
    nextQuestion: {
      type: "string",
      description: "The next single organic inquiry to guide them back into the drill",
    },
    contextNote: {
      type: "string",
      description: "A brief 1-sentence diagnostic label of the focus point",
    },
  },
  required: ["reply", "nextQuestion", "contextNote"],
  additionalProperties: false,
};

export const BINARY_BRACKET_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    optionA: { type: "string", description: "The first first-person framing phrase" },
    optionB: {
      type: "string",
      description: "The opposing light-shifting first-person framing phrase",
    },
  },
  required: ["optionA", "optionB"],
  additionalProperties: false,
};

export const DEVILS_ADVOCATE_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    challenges: stringArray("3 highly critical pressure-testing challenges"),
  },
  required: ["challenges"],
  additionalProperties: false,
};

export const SYNTHESIZE_SESSION_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Compassionate, insightful 2-paragraph analysis" },
    outline: {
      type: "string",
      description: "Detailed Markdown outline representing hierarchical logic",
    },
    actionItems: stringArray("List of 3-7 human-focused clear next steps or experiment triggers"),
  },
  required: ["summary", "outline", "actionItems"],
  additionalProperties: false,
};

// --- Group routes, in ai/synthesis.ts -----------------------------------------------------

export const CLASSIFICATION_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    assignments: {
      type: "array",
      description: "One entry per fragment the model could place",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          area: { type: "string" },
        },
        required: ["id", "area"],
        additionalProperties: false,
      },
    },
  },
  required: ["assignments"],
  additionalProperties: false,
};

export const LEVEL_SET_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    outline: { type: "string" },
    conflicts: stringArray("Where the pile disagrees with itself"),
    assumptions: stringArray("What the room is taking for granted"),
    openQuestions: stringArray("What nobody in the pile has answered"),
  },
  required: ["summary", "outline", "conflicts", "assumptions", "openQuestions"],
  additionalProperties: false,
};

/**
 * Every schema, so a test can assert over the set rather than over a list someone maintains
 * by hand — the same reason `MODE_CARDS` is iterated rather than enumerated.
 */
export const ALL_SCHEMAS: Record<string, ObjectSchema> = {
  recommend: RECOMMEND_SCHEMA,
  quickFire: QUICK_FIRE_SCHEMA,
  drillNext: DRILL_NEXT_SCHEMA,
  drillClarify: DRILL_CLARIFY_SCHEMA,
  binaryBracket: BINARY_BRACKET_SCHEMA,
  devilsAdvocate: DEVILS_ADVOCATE_SCHEMA,
  synthesizeSession: SYNTHESIZE_SESSION_SCHEMA,
  classification: CLASSIFICATION_SCHEMA,
  levelSet: LEVEL_SET_SCHEMA,
};
