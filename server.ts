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

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
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
app.use("/api/engagement", requireIdentity, createEngagementRouter());

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
