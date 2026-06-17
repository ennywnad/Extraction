import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = 3000;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes" },
});

app.use(express.json());
app.use("/api/session", apiLimiter);

// Initialize Gemini client lazily
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== "MY_GEMINI_API_KEY") {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return aiClient;
}

async function generateContentWithFallback(ai: GoogleGenAI, requestParams: any) {
  const models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
  let lastError: any = null;
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        ...requestParams,
        model,
      });
    } catch (err: any) {
      console.warn(`Model ${model} failed:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error("All models failed to generate content");
}

// 1. RECOMMEND A MODE BASED ON WARMUP ANSWERS
app.post("/api/session/recommend", async (req, res) => {
  const { topic, intention, clarity, nature, timeAvailable, intentType } = req.body;
  const ai = getGemini();

  if (!ai) {
    // Return fallback logic if API Key is not set or placeholder
    const recommended = clarity === "foggy" ? "free_stream" : "guided_drill";
    return res.json({
      recommendation: recommended,
      rationale: "Fuzzy topic direction detected. Let's start with a low-pressure open flow or an adaptive interview.",
      alternativeModes: ["quick_fire", "swipe", "sentence_completion"],
      confidence: 90,
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: `You are an expert cognitive guide. Recommend the single best extraction mode from this set:
['free_stream', 'quick_fire', 'guided_drill', 'binary_frame', 'swipe', 'slider', 'card_sort', 'timeline', 'sentence_completion', 'devils_advocate', 'letter_writing', 'priority_pile']

User Session Details:
- Topic: "${topic}"
- Intention: "${intention}"
- Cognitive State: "${clarity}" (clear or foggy)
- Resonance: "${nature}" (emotional or analytical)
- Time Budget: "${timeAvailable}" (<5 mins or >20 mins)
- Core Goal: "${intentType}" (decide, process, capture)

Recommend the ideal starting mode. Provide a 1-sentence rationale starting with 'This mode is recommended because...' and suggest 3 logical alternative modes.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { type: Type.STRING, description: "One of the modes in the provided list" },
            rationale: { type: Type.STRING, description: "A highly specific 1-sentence explanation matching the answers" },
            alternativeModes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "3 other modes that fit well as secondary tracks",
            },
            confidence: { type: Type.INTEGER, description: "Matching confidence percentage from 70 to 100" },
          },
          required: ["recommendation", "rationale", "alternativeModes", "confidence"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Recommend mode error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 2. QUICK FIRE PROMPTS GENERATOR
app.post("/api/session/quick-fire", async (req, res) => {
  const { topic, intention, pastThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    // Fallback static prompts
    return res.json({
      prompts: [
        `What's the first word that comes to mind when considering: ${topic}?`,
        "What is the biggest source of hidden friction here?",
        "If you could fast-forward past this, what's different?",
        "Who is the most impacted person other than you?",
        "What is a minor detail that actually bothers you a lot?",
        "What would you do if there were zero consequences?",
        "What are you compromising on right now?",
        "What is the most positive outcome you can envision?",
        "What is the easiest possible step you could take today?"
      ],
    });
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: `Generate exactly 10 short, highly targeted, provocative question prompts for a speed-writing 'Quick Fire' exercise.
Topic: "${topic}"
Intention: "${intention}"
Past thoughts surfaced (if any): "${(pastThoughts || []).map((t: any) => t.text).join("; ")}"

Instructions:
- The user is trying to extract hidden opinions, blocks, and core beliefs.
- Make the questions highly specific to the topic rather than generic.
- Keep each question under 15 words.
- Focus on unexpressed fears, compromises, desires, or immediate gut reactions.`,
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

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Quick fire error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. GUIDED DRILL INTERVIEW: Adaptive next question
app.post("/api/session/drill-next", async (req, res) => {
  const { topic, intention, history, recentThoughts, advancedSettings } = req.body;
  const ai = getGemini();

  if (!ai) {
    return res.json({
      question: "Could you expand on the main blocker that feels most active right now?",
      contextNote: "Let's explore your core feeling.",
    });
  }

  let toneGuidance = "Keep the tone grounded, earnest, and brief. Adopt a balanced strategic coaching advisor persona.";
  if (advancedSettings) {
    if (advancedSettings.promptingStyle === "socratic") {
      toneGuidance = "Adopt a highly Socratic, challenging, direct, and slightly provocative tone. Actively identify and push back gently on rationalizations, flag logical leaps or underlying contradictions, and ask demanding questions that require concrete evidence or clear rationale.";
    } else if (advancedSettings.promptingStyle === "empathetic") {
      toneGuidance = "Adopt a highly supportive, gentle, warm, compassionate, and therapeutic tone. Focus purely on emotional unburdening, decompression, feelings, and validation. Give the user broad space to write freely without rigorous pushback.";
    }
  }

  try {
    const chatHistory = (history || []).map((h: any) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n");
    const formattedThoughts = (recentThoughts || []).map((t: any) => `- ${t.text}`).join("\n");

    const prompt = `You are a skilled diagnostic cognitive guide conducting an extraction interview drill.
Topic: "${topic}"
Intention: "${intention}"

Surfaced Thoughts so far:
${formattedThoughts}

Current Q&A history:
${chatHistory}

Goal:
Ask the NEXT deeply relevant, insightful question that helps the user unpack their thought. 
Guidelines:
- DO NOT summarize or praise the user. Avoid "Thanks for sharing," or "That makes a lot of sense."
- ${toneGuidance}
- Trace threads. If they mentioned something interesting earlier, nudge them back to it if appropriate.
- Do not repeat topics. Dig deeper or pivot organically.
- Provide a brief 'contextNote' explaining why you are asking this (e.g., 'Looking at physical resistance' or 'Probing timeline risk').`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING, description: "The next single insightful question to ask" },
            contextNote: { type: Type.STRING, description: "A brief 1-sentence note of what emotional/logical point is being examined" },
          },
          required: ["question", "contextNote"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Drill next error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3b. GUIDED DRILL DIALOGUE: Bi-directional chat clarification
app.post("/api/session/drill-clarify", async (req, res) => {
  const { topic, intention, history, userComment, recentThoughts, advancedSettings } = req.body;
  const ai = getGemini();

  if (!ai) {
    return res.json({
      reply: `I understand you're asking about this with respect to "${topic}". Think of how this constraint forms the core bottleneck of what you are building or solving.`,
      nextQuestion: "How does this concern change your immediate strategic roadmap or next step?",
      contextNote: "Addressing user clarifying query"
    });
  }

  let toneGuidance = "Keep the response grounded, thoughtful, and highly informative but brief. Focus on helping them unpack strategic blocks.";
  if (advancedSettings) {
    if (advancedSettings.promptingStyle === "socratic") {
      toneGuidance = "Keep a sharp, direct, provocative, and highly analytical tone, helping them challenge their own hesitation or underlying assumptions.";
    } else if (advancedSettings.promptingStyle === "empathetic") {
      toneGuidance = "Maintain a warm, deeply validating, gentle, and non-judgmental holding space tone, validating any friction they express.";
    }
  }

  try {
    const chatHistory = (history || []).map((h: any) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n");
    const formattedThoughts = (recentThoughts || []).map((t: any) => `- ${t.text}`).join("\n");

    const prompt = `You are an expert cognitive consultant. The user is in the middle of a strategic thought-extraction session.
Topic: "${topic}"
Intention: "${intention}"

Surfaced thoughts so far:
${formattedThoughts}

Previous Q&A interaction:
${chatHistory}

The user did not answer the previous question directly. Instead, they asked a Clarifying Question or made a sidebar Comment:
"${userComment}"

Task:
Respond to their comment or question directly and guide them back into the exploration flow with the next organic, helpful inquiry.

Output Requirements:
- Write a 'reply': Directly address their comment, explain *why* we are asking what we are asking, or provide helpful strategic perspective. Keep it brief and clear.
- Provide a 'nextQuestion': A compelling, actionable follow-up question to keep the extraction flow going.
- Provide a 'contextNote': A brief label describing the psychological or cognitive point currently being investigated.

Tone guidance to enforce:
- ${toneGuidance}
- Do not use generic AI buzzwords or filler praise.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: "Direct brief response clarifying or discussing the user's comment" },
            nextQuestion: { type: Type.STRING, description: "The next single organic inquiry to guide them back into the drill" },
            contextNote: { type: Type.STRING, description: "A brief 1-sentence diagnostic label of the focus point" },
          },
          required: ["reply", "nextQuestion", "contextNote"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Drill clarify error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 4. BINARY INTUITION / BRACKET PAIR GENERATOR
app.post("/api/session/binary-bracket", async (req, res) => {
  const { topic, recentThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    return res.json({
      optionA: "I'm holding onto this because I'm genuinely excited about its potential.",
      optionB: "I'm holding onto this because I'm terrified of what happens if I let it go.",
    });
  }

  try {
    const thoughtsText = (recentThoughts || []).map((t: any) => t.text).join("; ");
    const prompt = `Based on the user's topic: "${topic}" and their thoughts shared so far: "${thoughtsText}", generate TWO opposing, highly insightful framings of their current situation.
The user will pick which statement feels more true to uncover their hidden beliefs.

Formatting Guidelines:
- Option A and Option B must represent two distinct psychological interpretations, attitudes, or load-bearing compromises.
- Try to make them provocative, exposing a deeper layer of truth (e.g., Fear of failure vs Fear of success, Pride vs Safety).
- Express them in the first person: "I feel like..." or "I am..."`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            optionA: { type: Type.STRING, description: "The first first-person framing phrase" },
            optionB: { type: Type.STRING, description: "The opposing light-shifting first-person framing phrase" },
          },
          required: ["optionA", "optionB"],
        },
      },
    });

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Binary bracket error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. DEVIL'S ADVOCATE GENERATOR
app.post("/api/session/devils-advocate", async (req, res) => {
  const { topic, recentThoughts } = req.body;
  const ai = getGemini();

  if (!ai) {
    return res.json({
      challenges: [
        "Is there a chance your standard of 'success' here is actually unrealistic?",
        "If you do absolutely nothing about this for six months, what would actually break?",
        "Are you using this process to avoid a different, much harder decision?",
      ],
    });
  }

  try {
    const thoughtsText = (recentThoughts || []).map((t: any) => t.text).join("; ");
    const prompt = `You are a friendly but highly sharp Devil's Advocate. 
Topic: "${topic}"
User's statements: "${thoughtsText}"

Generate exactly 3 extremely constructive, provocative questions or alternative readings of their situation that will shake up their complacency.
- Be respectful but sharp, cutting to the root of potential rationalizations or avoidance techniques.
- Ask them directly.
- Avoid clichés. Make them highly attuned to the topic.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
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

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Devils advocate error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 6. SYNTHESIZE SESSION: Produce outline, summary, and action items
app.post("/api/session/synthesize", async (req, res) => {
  const { topic, intention, thoughts, advancedSettings } = req.body;
  const ai = getGemini();

  const thoughtsText = (thoughts || [])
    .map((t: any, idx: number) => `Thought #${idx + 1} (${t.mode}): ${t.text}`)
    .join("\n");

  if (!ai) {
    // Basic structural fallback mapping
    return res.json({
      summary: `You ran an extraction session on '${topic}'. You surfaced several key thoughts emphasizing your core goals.`,
      outline: `## 1. Core Focus: ${topic}\n\n- Surfaced ideas and key vectors\n- Temporal considerations\n\n## 2. Priority Action Items\n\n- Resolve initial blocks\n- Implement core structure`,
      actionItems: (thoughts || []).slice(0, 3).map((t: any) => `Explore: ${t.text.slice(0, 50)}...`),
    });
  }

  // Define Synthesis Modifier Instructions
  let filterInstructions = "Provide a comprehensive blueprint. This must include both a macro-level recap summary and micro-level detailed action checklists.";
  if (advancedSettings?.outputFilter === "actions") {
    filterInstructions = "FILTER INSTRUCTION: The user has selected 'Action lists Only'. Do not write any long analytical summaries or conversational introductions in the 'summary' field. Focus the 'outline' and 'actionItems' purely on clear, actionable checklists, procedural recipes, and clear items. Reduce explanatory filler to a minimum.";
  } else if (advancedSettings?.outputFilter === "roadmap") {
    filterInstructions = "FILTER INSTRUCTION: The user has selected 'Milestones Only'. Avoid small, granular tasks or minute checklists. Synthesize high-level structural strategic milestones, general themes, development phases, and conceptual outlines. Keep the focus high-level rather than micro-tactical.";
  }

  let biasAuditInstructions = "";
  if (advancedSettings?.cognitiveBiasAudit === "include") {
    biasAuditInstructions = "INTELLECTUAL BIAS DEBUGGER: Because the user requested a cognitive bias audit, analyze the provided thoughts for common human psychological fallback fallacies (such as confirmation bias, sunk-cost fallacy, avoidance, or black-and-white thinking). Actively append/include a dedicated brief diagnostics section inside the 'summary' output under the title 'Cognitive Bias Audit / Blind Spots' outlining these traps and how to address them.";
  }

  let synthesisTone = "supportive, clear, structured, and professional";
  if (advancedSettings?.promptingStyle === "socratic") {
    synthesisTone = "direct, challenging, realistic, sharp, and strategic, flagging any potential avoidance or rationalizations";
  } else if (advancedSettings?.promptingStyle === "empathetic") {
    synthesisTone = "compassionate, therapeutic, warm, validating, and supportive";
  }

  try {
    const prompt = `You are a world-class cognitive orchestrator. Analyze this list of thoughts surfaced during an 'Extraction' brainstorming/unburdening session.
Topic: "${topic}"
Session Intention: "${intention}"

Here are the user's exact raw thoughts surfaced during interactions:
${thoughtsText}

Synthesize these thoughts into structured output containing:
1. 'summary': A compassionate, analytical recap synthesis of what was really uncovered beneath the words, identifying recurring themes or major underlying forces.
2. 'outline': A deeply detailed, organized markdown outline mapping out their ideas, categories, and logical hierarchies. Use elegant headers (e.g., ##, ###) and clean bullet points.
3. 'actionItems': A parsed array of 3-7 clear, actionable next steps or focus points based on the thoughts sorted by priority/value.

Configuration parameters to strictly enforce:
- Theme Filter constraint: "${filterInstructions}"
- Cognitive Bias Audit check: "${biasAuditInstructions || "Omit bias audit"}"
- Writing tone: "${synthesisTone}"

Write in a supportively tuned, clear, structured professional tone. Do not use generic AI buzzwords. Keep output highly precise.`;

    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Compassionate, insightful 2-paragraph analysis" },
            outline: { type: Type.STRING, description: "Detailed Markdown outline representing hierarchical logic" },
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

    const data = JSON.parse(response.text || "{}");
    res.json(data);
  } catch (error: any) {
    console.error("Synthesize session error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize dev server or static server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
