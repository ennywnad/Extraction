/**
 * The nine schemas, checked against what the strictest provider will accept.
 *
 * `ObjectSchema` already makes `required` and `additionalProperties: false` non-optional, so
 * the crude version of this failure cannot compile. What the type cannot say is that `required`
 * is *complete* — listing four of five properties type-checks perfectly and means the model may
 * omit the fifth. On Gemini that produces an occasional missing field, absorbed by the `?? ""`
 * defaults at the call sites. On Claude it is a schema the provider will not accept.
 *
 * So this asserts over `ALL_SCHEMAS` rather than a list maintained here: a tenth schema is
 * covered by existing, and one added without `required` fails here rather than in whichever
 * deployment happens to be pointed at the stricter provider.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ALL_SCHEMAS, type JsonSchema } from "../server/ai/schema.ts";

/** Every object in the tree, including the ones nested inside array items. */
function objectsIn(
  schema: JsonSchema,
  path = "root",
): [string, Extract<JsonSchema, { type: "object" }>][] {
  if (schema.type === "object") {
    const nested = Object.entries(schema.properties).flatMap(([key, value]) =>
      objectsIn(value, `${path}.${key}`),
    );
    return [[path, schema], ...nested];
  }
  if (schema.type === "array") return objectsIn(schema.items, `${path}[]`);
  return [];
}

/**
 * Constraints Claude's structured outputs reject outright. None of the nine use them — the
 * recommend route's "70 to 100" confidence range is prose in a `description`, which is where a
 * range belongs because both providers read it. This guards the next one.
 */
const REJECTED_KEYS = [
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "maxItems",
];

describe("the neutral schemas", () => {
  it("covers all nine call sites", () => {
    assert.equal(Object.keys(ALL_SCHEMAS).length, 9);
  });

  for (const [name, schema] of Object.entries(ALL_SCHEMAS)) {
    describe(name, () => {
      it("requires every property it declares", () => {
        for (const [path, object] of objectsIn(schema)) {
          assert.deepEqual(
            [...object.required].sort(),
            Object.keys(object.properties).sort(),
            `${path}: every declared property must appear in required`,
          );
        }
      });

      it("closes every object to extra properties", () => {
        for (const [path, object] of objectsIn(schema)) {
          assert.equal(object.additionalProperties, false, `${path} must be closed`);
        }
      });

      it("uses no constraint the stricter provider rejects", () => {
        const serialized = JSON.stringify(schema);
        for (const key of REJECTED_KEYS) {
          assert.doesNotMatch(
            serialized,
            new RegExp(`"${key}"`),
            `${key} is not supported by structured outputs; put the intent in a description`,
          );
        }
      });

      it("describes itself to the model somewhere", () => {
        // The description is the only channel a constraint can travel through, per the rule
        // above, so a schema with none anywhere is one that dropped its guidance in the move.
        assert.match(JSON.stringify(schema), /"description"/);
      });
    });
  }
});
