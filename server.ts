import express from "express";
import path from "path";
import { Type } from "@google/genai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { resolveAuthConfig } from "./server/authMode.ts";
import { createRequireIdentity } from "./server/iapAuth.ts";
import { createEngagementRouter } from "./server/engagementRoutes.ts";
import { generateContentWithFallback, getGemini } from "./server/ai/client.ts";
import { sendAiError, sendFallback, sendModel } from "./server/ai/respond.ts";
import { instanceStatus } from "./server/status.ts";
import {
  binaryBracketPrompt,
  devilsAdvocatePrompt,
  drillClarifyPrompt,
  drillNextPrompt,
  quickFirePrompt,
  recommendModePrompt,
  synthesizeSessionPrompt,
} from "./server/ai/sessionPrompts.ts";

dotenv.config();

// Resolved before anything is served; exits the process if inconsistent.
const authConfig = resolveAuthConfig();
const requireIdentity = createRequireIdentity(authConfig);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Cloud Run / IAP terminate in front of us; without this express-rate-limit keys every
// request on the proxy address, so all users share one bucket.
app.set("trust proxy", 1);

const WINDOW_MS = 15 * 60 * 1000;

/**
 * Solo routes, keyed on IP because that is all there is.
 *
 * `/api/session/*` has no identity requirement — in a group deployment IAP has already gated
 * the whole service, so asking again would be theatre. The consequence is that a *solo*
 * instance deployed without IAP has only this between the open internet and project-billed
 * Gemini calls, and an in-memory per-instance counter is a soft bound at best: with
 * max-instances=3 the real ceiling is three times this number, and it resets on every cold
 * start. It bounds an accident, not an adversary. See docs/intents/010-model-armor.md for
 * why screening is not the answer to that either.
 */
const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
});

/**
 * Group routes, keyed on the verified identity rather than the address it arrived from.
 *
 * Everything under `/api/engagement` runs behind `requireIdentity`, so `req.identity` is
 * always set by the time these run — a request without one is already a 401 and never
 * reaches here. That makes the email the right key and removes the usual problem with
 * IP keying, where a room sharing one office NAT shares one bucket.
 *
 * The ceiling has to clear the poll, which is the floor of normal use rather than a burst:
 * `POLL_INTERVAL_MS` is 15s in src/App.tsx, so one open tab spends 4 requests a minute, or
 * **60 per window, doing nothing at all**. A facilitator with three tabs open and an active
 * quick-fire round lands near 300. 600 is double that and still an order of magnitude under
 * a client stuck in a retry loop, which is the only thing this is here to catch.
 */
const engagementLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.identity!.email,
  message: { error: "Too many requests, please slow down and try again shortly" },
});

/**
 * Synthesis, which is the one route worth counting separately.
 *
 * It is by far the most expensive thing the app does — two Gemini calls over the whole pile,
 * classify then level set — and `synthesizeEngagement` is single-flight *per engagement*, so
 * the in-process guard does nothing to stop one person starting a run on every engagement on
 * the shelf in turn.
 *
 * Ten per window is generous for the real behaviour, which is a facilitator regenerating a
 * level set a few times as the pile fills. `skip` narrows this to the POST: the sibling
 * `/synthesize/status` is a cheap GET that exists to be polled while a run is in flight, and
 * folding it into this budget would rate-limit the progress indicator for the long
 * generation it is reporting on.
 */
const synthesisLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.identity!.email,
  skip: (req) => req.method !== "POST",
  message: { error: "Too many synthesis requests. Wait a few minutes before regenerating." },
});

app.use(express.json());
app.use("/api/session", apiLimiter);

// Dev-only: ?dev_user=someone@example.com pins an identity for this browser, so a shared pile
// can be exercised from two profiles against one server (and one store).
if (authConfig.mode === "dev") {
  app.use((req, res, next) => {
    const who = req.query.dev_user;
    if (typeof who === "string" && who) {
      res.cookie("dev_user", who, { httpOnly: true, sameSite: "lax" });
    }
    next();
  });
}

// Unauthenticated, so it reports which branch each seam took and nothing that names the
// deployment. See server/status.ts for the rule and what it deliberately does not claim.
app.get("/healthz", (_req, res) => {
  res.json(instanceStatus(authConfig));
});

// Who the caller is, as far as the server is concerned. The frontend uses this to decide
// which fragments are editable; `dev: true` means the identity is asserted, not verified.
app.get("/api/whoami", requireIdentity, (req, res) => {
  const identity = req.identity!;
  res.json({
    email: identity.email,
    name: identity.email.split("@")[0],
    role: null,
    dev: !identity.verified,
    // Same derivation as /healthz rather than a second independent one.
    aiEnabled: instanceStatus(authConfig).aiEnabled,
  });
});

// 1. RECOMMEND A MODE BASED ON WARMUP ANSWERS
app.post("/api/session/recommend", async (req, res) => {
  const { topic, intention, clarity, nature, timeAvailable, intentType } = req.body;
  const ai = getGemini();

  if (!ai) {
    const recommended = clarity === "foggy" ? "free_stream" : "guided_drill";
    return sendFallback(res, {
      recommendation: recommended,
      rationale:
        "Fuzzy topic direction detected. Let's start with a low-pressure open flow or an adaptive interview.",
      alternativeModes: ["quick_fire", "swipe", "sentence_completion"],
      confidence: 90,
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: recommendModePrompt({
        topic,
        intention,
        clarity,
        nature,
        timeAvailable,
        intentType,
      }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: {
              type: Type.STRING,
              description: "One of the modes in the provided list",
            },
            rationale: {
              type: Type.STRING,
              description: "A highly specific 1-sentence explanation matching the answers",
            },
            alternativeModes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 other modes that fit well as secondary tracks",
            },
            confidence: {
              type: Type.INTEGER,
              description: "Matching confidence percentage from 70 to 100",
            },
          },
          required: ["recommendation", "rationale", "alternativeModes", "confidence"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Recommend mode", error);
  }
});

// 2. QUICK FIRE PROMPTS GENERATOR
app.post("/api/session/quick-fire", async (req, res) => {
  const { topic, intention, pastThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    return sendFallback(res, {
      prompts: [
        `What's the first word that comes to mind when considering: ${topic}?`,
        "What is the biggest source of hidden friction here?",
        "If you could fast-forward past this, what's different?",
        "Who is the most impacted person other than you?",
        "What is a minor detail that actually bothers you a lot?",
        "What would you do if there were zero consequences?",
        "What are you compromising on right now?",
        "What is the most positive outcome you can envision?",
        "What is the easiest possible step you could take today?",
      ],
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: quickFirePrompt({ topic, intention, pastThoughts }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 10 customized short questions",
            },
          },
          required: ["prompts"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Quick fire", error);
  }
});

// 3. GUIDED DRILL INTERVIEW: Adaptive next question
app.post("/api/session/drill-next", async (req, res) => {
  const { topic, intention, history, recentThoughts, advancedSettings } = req.body;
  const ai = getGemini();

  if (!ai) {
    return sendFallback(res, {
      question: "Could you expand on the main blocker that feels most active right now?",
      contextNote: "Let's explore your core feeling.",
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: drillNextPrompt({ topic, intention, history, recentThoughts, advancedSettings }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: {
              type: Type.STRING,
              description: "The next single insightful question to ask",
            },
            contextNote: {
              type: Type.STRING,
              description:
                "A brief 1-sentence note of what emotional/logical point is being examined",
            },
          },
          required: ["question", "contextNote"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Drill next", error);
  }
});

// 3b. GUIDED DRILL DIALOGUE: Bi-directional chat clarification
app.post("/api/session/drill-clarify", async (req, res) => {
  const { topic, intention, history, userComment, recentThoughts, advancedSettings } = req.body;
  const ai = getGemini();

  if (!ai) {
    return sendFallback(res, {
      reply: `I understand you're asking about this with respect to "${topic}". Think of how this constraint forms the core bottleneck of what you are building or solving.`,
      nextQuestion: "How does this concern change your immediate strategic roadmap or next step?",
      contextNote: "Addressing user clarifying query",
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: drillClarifyPrompt({
        topic,
        intention,
        history,
        userComment,
        recentThoughts,
        advancedSettings,
      }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: {
              type: Type.STRING,
              description: "Direct brief response clarifying or discussing the user's comment",
            },
            nextQuestion: {
              type: Type.STRING,
              description: "The next single organic inquiry to guide them back into the drill",
            },
            contextNote: {
              type: Type.STRING,
              description: "A brief 1-sentence diagnostic label of the focus point",
            },
          },
          required: ["reply", "nextQuestion", "contextNote"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Drill clarify", error);
  }
});

// 4. BINARY INTUITION / BRACKET PAIR GENERATOR
app.post("/api/session/binary-bracket", async (req, res) => {
  const { topic, recentThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    return sendFallback(res, {
      optionA: "I'm holding onto this because I'm genuinely excited about its potential.",
      optionB: "I'm holding onto this because I'm terrified of what happens if I let it go.",
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: binaryBracketPrompt({ topic, recentThoughts }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            optionA: { type: Type.STRING, description: "The first first-person framing phrase" },
            optionB: {
              type: Type.STRING,
              description: "The opposing light-shifting first-person framing phrase",
            },
          },
          required: ["optionA", "optionB"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Binary bracket", error);
  }
});

// 5. DEVIL'S ADVOCATE GENERATOR
app.post("/api/session/devils-advocate", async (req, res) => {
  const { topic, recentThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    return sendFallback(res, {
      challenges: [
        "Is there a chance your standard of 'success' here is actually unrealistic?",
        "If you do absolutely nothing about this for six months, what would actually break?",
        "Are you using this process to avoid a different, much harder decision?",
      ],
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: devilsAdvocatePrompt({ topic, recentThoughts }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            challenges: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 highly critical pressure-testing challenges",
            },
          },
          required: ["challenges"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Devils advocate", error);
  }
});

// 6. SYNTHESIZE SESSION: Produce outline, summary, and action items
app.post("/api/session/synthesize", async (req, res) => {
  const { topic, intention, thoughts, advancedSettings } = req.body;
  const ai = getGemini();

  if (!ai) {
    // Structural only. Unlike the group level set, which refuses to generate at all rather
    // than write filler into a shared client deliverable, a solo outline is read by the one
    // person who just watched the banner tell them AI is off.
    return sendFallback(res, {
      summary: `You ran an extraction session on '${topic}'. You surfaced several key thoughts emphasizing your core goals.`,
      outline: `## 1. Core Focus: ${topic}\n\n- Surfaced ideas and key vectors\n- Temporal considerations\n\n## 2. Priority Action Items\n\n- Resolve initial blocks\n- Implement core structure`,
      actionItems: (thoughts || [])
        .slice(0, 3)
        .map((t: any) => `Explore: ${t.text.slice(0, 50)}...`),
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: synthesizeSessionPrompt({ topic, intention, thoughts, advancedSettings }),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "Compassionate, insightful 2-paragraph analysis",
            },
            outline: {
              type: Type.STRING,
              description: "Detailed Markdown outline representing hierarchical logic",
            },
            actionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of 3-7 human-focused clear next steps or experiment triggers",
            },
          },
          required: ["summary", "outline", "actionItems"],
        },
      },
    });

    sendModel(res, JSON.parse(response.text || "{}"));
  } catch (error) {
    sendAiError(res, "Synthesize session", error);
  }
});

// Group mode. Everything under here requires an identity; the Gemini routes above do not,
// because in production IAP has already gated the whole service.
// Three mounts rather than one, so `requireIdentity` runs once and both limiters can key on
// the identity it establishes. Order is load-bearing: identity, then the general ceiling,
// then the narrow one on synthesis, then the routes.
app.use("/api/engagement", requireIdentity, engagementLimiter);
app.use("/api/engagement/:id/synthesize", synthesisLimiter);
app.use("/api/engagement", createEngagementRouter());

// Initialize dev server or static server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Imported lazily: vite is a devDependency and is absent from the production image.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Overridable so the production path is testable without a build in the tree, the same
    // way ENGAGEMENT_DATA_DIR makes the file store testable.
    const distPath = path.resolve(process.env.DIST_DIR || path.join(process.cwd(), "dist"));
    app.use(express.static(distPath));
    // A regex rather than "*". Express 5 matches paths with path-to-regexp v8, where a bare
    // "*" is not a valid pattern and **throws when the route is registered** — which would
    // take the process down at boot, in production only. `/.*/` means the same thing and is
    // valid under both Express 4 and 5.
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Server running on port ${PORT} ` +
        `(NODE_ENV=${process.env.NODE_ENV || "development"}, AUTH_MODE=${authConfig.mode})`,
    );
    if (authConfig.mode === "dev") {
      console.log(
        `  dev identity: ${authConfig.devUser.email} (override with ?dev_user= or x-dev-user)`,
      );
    }
  });

  // Cloud Run sends SIGTERM and hard-kills after ~10s; stop accepting new work first.
  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer();
