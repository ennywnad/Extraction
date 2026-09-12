/**
 * Listening mode: a session that takes input and gives nothing back.
 *
 * The state is cheap to build and easy to build dishonestly, which is what this file is about.
 * Its whole value is that what the room is told and what the routes do are the same thing — a
 * banner reading "nothing is being generated" over a Guided Drill still asking Gemini for the
 * next question would be worse than no feature, because the modes' fallbacks are shaped exactly
 * like generated output and nobody in the room could tell.
 *
 * So three kinds of assertion, and only the first is about behaviour a person could have written
 * down as a requirement:
 *
 * - the decision itself, as a pure function, at every value a caller can send;
 * - that the client's one door folds the flag in, which is what makes six call sites quiet;
 * - two structural scans, because the failure mode here is somebody adding a route or a fetch and
 *   it simply working — the same reason test/modelSeam.test.ts scans source rather than behaviour.
 *
 * What no test here can cover is the suppressed call itself: `npm test` runs with no key, so
 * `aiAvailable()` is false and every route already answers from its fallback. That is exactly why
 * `servesFallback` takes availability as an argument. See docs/intents/005-listening-mode.md.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { servesFallback } from "../server/ai/respond.ts";
import { askModel, isListening, setListening } from "../src/utils/askModel.ts";
import Workspace from "../src/components/Workspace.tsx";
import type { Session } from "../src/types.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Comments stripped, for test/modelSeam.test.ts's reason: these rules are about code. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the decision — whether a prompting route asks a model at all", () => {
  it("stays quiet when the session asked for quiet, on a fully configured instance", () => {
    // The state this feature exists for: nothing is wrong, and nothing is being generated.
    assert.equal(servesFallback({ body: { topic: "ERP migration", listening: true } }, true), true);
  });

  it("asks when nobody asked for quiet", () => {
    assert.equal(servesFallback({ body: { topic: "ERP migration" } }, true), false);
    assert.equal(servesFallback({ body: { listening: false } }, true), false);
  });

  it("still answers from the fallback when no model is reachable, listening or not", () => {
    // The older half of the condition. Listening is additive: it never makes a broken
    // deployment start asking.
    assert.equal(servesFallback({ body: {} }, false), true);
    assert.equal(servesFallback({ body: { listening: true } }, false), true);
  });

  it("reads only a real boolean as quiet", () => {
    // Strict, because this value and the one the store keeps have to agree: the route layer
    // drops a non-boolean `listening` from a patch, so a caller sending "yes" gets a session
    // whose banner says nothing is quiet. A truthy read here would silence a room the UI had
    // just told was live.
    for (const value of ["true", "yes", 1, {}, ["true"]]) {
      assert.equal(
        servesFallback({ body: { listening: value } }, true),
        false,
        `${JSON.stringify(value)} silenced a room`,
      );
    }
  });

  it("survives a request with no body at all", () => {
    // `express.json()` leaves `req.body` undefined for a GET or an empty POST, and a crash in
    // the guard would take down the route it was added to protect.
    assert.equal(servesFallback({ body: undefined }, true), false);
  });
});

describe("the client's one door", () => {
  const captured: { path?: string; body?: any } = {};
  const withStubbedFetch = async (fn: () => Promise<void>) => {
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      captured.path = url;
      captured.body = JSON.parse(String(init.body));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
      setListening(false);
    }
  };

  it("tells the route to stay quiet, and otherwise says nothing about it", async () => {
    await withStubbedFetch(async () => {
      setListening(false);
      await askModel("/api/session/quick-fire", { topic: "ERP migration" });
      assert.deepEqual(captured.body, { topic: "ERP migration" });

      setListening(true);
      await askModel("/api/session/quick-fire", { topic: "ERP migration" });
      assert.deepEqual(captured.body, { topic: "ERP migration", listening: true });
    });
  });

  it("reads the flag when the call is composed, not when a component rendered", async () => {
    // The reason this is a module rather than a prop on six mode interfaces. A value read at
    // call time cannot be a stale copy of the session.
    await withStubbedFetch(async () => {
      setListening(true);
      assert.equal(isListening(), true);
      setListening(false);
      await askModel("/api/session/drill-next", { topic: "t" });
      assert.equal(captured.body.listening, undefined);
    });
  });
});

describe("no prompting route can be added without the decision", () => {
  const server = code(read("server.ts"));
  /** Each `/api/session/*` handler, split off its own `app.post`. */
  const routes = server
    .split(/app\.post\("\/api\/session\//)
    .slice(1)
    .map((chunk) => ({
      name: chunk.slice(0, chunk.indexOf('"')),
      text: chunk.slice(0, chunk.indexOf("\napp.")),
    }));

  it("finds the routes at all, so a rename cannot quietly empty this file", () => {
    assert.deepEqual(
      routes.map((r) => r.name).sort(),
      [
        "binary-bracket",
        "devils-advocate",
        "drill-clarify",
        "drill-next",
        "quick-fire",
        "recommend",
        "synthesize",
      ],
      "the scans below are keyed on these names",
    );
  });

  it("guards every route that speaks unasked with servesFallback", () => {
    const unguarded = routes
      .filter((r) => r.name !== "synthesize")
      .filter((r) => !r.text.includes("servesFallback(req)"))
      .map((r) => r.name);
    assert.deepEqual(unguarded, [], "this route keeps generating during a briefing");
  });

  it("leaves synthesis asking, because a person has to press a button for it", () => {
    // The one deliberate exception, on both sides of the wire. "No synthesis until someone asks
    // for it" is satisfied by the button, not by a gate — and gating it would mean listening
    // silently downgraded a deliverable.
    const synthesize = routes.find((r) => r.name === "synthesize")!;
    assert.ok(synthesize.text.includes("!aiAvailable()"), "synthesis lost its own guard");
    assert.ok(!synthesize.text.includes("servesFallback"), "listening now degrades a deliverable");
  });
});

describe("no client call can be added that talks anyway", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("routes every prompting call through askModel", () => {
    // The rule that makes a new mode quiet by construction. A raw `fetch` to one of these paths
    // would carry no `listening`, and the server would answer it in full while the banner above
    // the mode said nothing was being generated.
    const offenders = walk(path.join(root, "src"))
      .map((f) => ({ file: path.relative(root, f), text: code(readFileSync(f, "utf8")) }))
      .filter(({ file }) => file !== path.join("src", "utils", "askModel.ts"))
      .flatMap(({ file, text }) =>
        [...text.matchAll(/fetch\(\s*["'`](\/api\/session\/[a-z-]+)/g)]
          .map((m) => `${file} -> ${m[1]}`)
          // Synthesis is the exception the server makes too, and it is the same exception.
          .filter((hit) => !hit.endsWith("/api/session/synthesize")),
      );
    assert.deepEqual(offenders, [], "call askModel from src/utils/askModel.ts instead");
  });
});

describe("the two copies of the field list", () => {
  const listIn = (text: string, name: string) => {
    const body = text.slice(text.indexOf(`const ${name} = [`));
    return new Set(
      [...body.slice(0, body.indexOf("]")).matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]),
    );
  };

  it("pushes exactly the fields the route accepts", () => {
    // Found the hard way by this slice. The client keeps its own allowlist of what a PATCH may
    // carry, and a field missing from it fails in the most confusing way available: the update
    // applies optimistically, the request never carries it, and the refetch quietly puts the old
    // value back. Nothing throws, nothing logs, and the control looks broken at random.
    const client = listIn(read("src/utils/engagementSync.ts"), "SESSION_META_FIELDS");
    const server = listIn(read("server/engagementRoutes.ts"), "META_FIELDS");
    assert.deepEqual(
      [...client].sort(),
      [...server].sort(),
      "one side of the meta patch knows about a field the other does not",
    );
    assert.ok(client.has("listening"), "the lists agree, but not about this feature");
  });
});

describe("what the room is told", () => {
  const session = (): Session =>
    ({
      id: "e1",
      engagementId: "e1",
      topic: "ERP migration readiness",
      intention: "Level set the ask",
      status: "active",
      activeMode: "free_stream",
      thoughts: [],
      modeProgress: {},
      modeHistory: [],
      createdAt: "2026-09-11T09:00:00.000Z",
      updatedAt: "2026-09-11T10:00:00.000Z",
    }) as unknown as Session;

  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(Workspace, {
        session: session(),
        onUpdateSession: () => {},
        onDeleteThought: () => {},
        onAddThought: () => {},
        onExit: () => {},
        onSynthesize: () => {},
        onListeningChange: () => {},
        children: null,
        ...props,
      } as any),
    );

  it("labels a chosen quiet instead of warning about it", () => {
    // The whole point of the state being nameable. "Check the Gemini configuration" is exactly
    // wrong to show somebody who turned generation off on purpose.
    const html = render({ listening: true, aiEnabled: true });
    assert.match(html, /Nothing is being generated/);
    assert.doesNotMatch(html, /AI is unavailable/);
    assert.doesNotMatch(html, /check the Gemini configuration/i);
  });

  it("still warns when the quiet was an accident", () => {
    const html = render({ listening: false, aiEnabled: false });
    assert.match(html, /AI is unavailable/);
    assert.doesNotMatch(html, /Nothing is being generated/);
  });

  it("says both when both are true", () => {
    // A chosen quiet does not hide a missing model: that fact outlives the choice, and somebody
    // who ends listening expecting the modes to come alive has to know they will not.
    const html = render({ listening: true, aiEnabled: false });
    assert.match(html, /Nothing is being generated/);
    assert.match(html, /No model is configured on this server either/);
  });

  it("offers the way out of it, which is the transition", () => {
    assert.match(render({ listening: true }), /End listening/);
    assert.doesNotMatch(render({ listening: false }), /End listening/);
  });
});
