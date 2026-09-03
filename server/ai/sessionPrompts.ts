/**
 * Prompts for the solo session routes.
 *
 * Kept out of the route handlers for the same reason [levelSetPrompt.ts](./levelSetPrompt.ts)
 * is: a prompt is the part of this app most likely to be edited, reviewed, and argued about,
 * and it is unreadable when it is wrapped in request plumbing. Everything here is a pure
 * function of its input, so a prompt change can be diffed and eyeballed without reading
 * Express.
 *
 * These take the client's request body more or less as it arrives. That is deliberate — the
 * solo half of the app has no server-side session, so there is no richer type to accept.
 */
import { VALID_MODES } from "../store/shape.ts";

/** The subset of the client's advanced settings that changes what a prompt asks for. */
export interface PromptSettings {
  promptingStyle?: string;
  outputFilter?: string;
  cognitiveBiasAudit?: string;
}

/** A fragment as the client sends it, before it is ever persisted. */
export interface ClientThought {
  text: string;
  mode?: string;
}

export interface DrillTurn {
  question: string;
  answer: string;
}

const bullets = (thoughts: ClientThought[] = []) => thoughts.map((t) => `- ${t.text}`).join("\n");
const inline = (thoughts: ClientThought[] = []) => thoughts.map((t) => t.text).join("; ");
const transcript = (history: DrillTurn[] = []) =>
  history.map((h) => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n");

/**
 * The three personas the interviewing routes offer.
 *
 * One table rather than a branch per route: the user picks a tone once in intake and then
 * meets it in the drill, in the sidebar dialogue, and again in the synthesis. Drift between
 * those three reads as three different advisors.
 */
const DRILL_TONE: Record<string, string> = {
  socratic:
    "Adopt a highly Socratic, challenging, direct, and slightly provocative tone. Actively identify and push back gently on rationalizations, flag logical leaps or underlying contradictions, and ask demanding questions that require concrete evidence or clear rationale.",
  empathetic:
    "Adopt a highly supportive, gentle, warm, compassionate, and therapeutic tone. Focus purely on emotional unburdening, decompression, feelings, and validation. Give the user broad space to write freely without rigorous pushback.",
  standard:
    "Keep the tone grounded, earnest, and brief. Adopt a balanced strategic coaching advisor persona.",
};

const CLARIFY_TONE: Record<string, string> = {
  socratic:
    "Keep a sharp, direct, provocative, and highly analytical tone, helping them challenge their own hesitation or underlying assumptions.",
  empathetic:
    "Maintain a warm, deeply validating, gentle, and non-judgmental holding space tone, validating any friction they express.",
  standard:
    "Keep the response grounded, thoughtful, and highly informative but brief. Focus on helping them unpack strategic blocks.",
};

const SYNTHESIS_TONE: Record<string, string> = {
  socratic:
    "direct, challenging, realistic, sharp, and strategic, flagging any potential avoidance or rationalizations",
  empathetic: "compassionate, therapeutic, warm, validating, and supportive",
  standard: "supportive, clear, structured, and professional",
};

const tone = (table: Record<string, string>, settings?: PromptSettings) =>
  table[settings?.promptingStyle ?? "standard"] ?? table.standard;

export interface WarmupAnswers {
  topic: string;
  intention: string;
  clarity: string;
  nature: string;
  timeAvailable: string;
  intentType: string;
}

export function recommendModePrompt(a: WarmupAnswers): string {
  // The mode list comes from VALID_MODES rather than a literal: a mode the model recommends
  // but the app cannot open is a dead end for the user, and a hand-copied list here would be
  // a third place to forget when a mode is added.
  return `You are an expert cognitive guide. Recommend the single best extraction mode from this set:
[${VALID_MODES.map((m) => `'${m}'`).join(", ")}]

User Session Details:
- Topic: "${a.topic}"
- Intention: "${a.intention}"
- Cognitive State: "${a.clarity}" (clear or foggy)
- Resonance: "${a.nature}" (emotional or analytical)
- Time Budget: "${a.timeAvailable}" (<5 mins or >20 mins)
- Core Goal: "${a.intentType}" (decide, process, capture)

Recommend the ideal starting mode. Provide a 1-sentence rationale starting with 'This mode is recommended because...' and suggest 3 logical alternative modes.`;
}

export function quickFirePrompt(input: {
  topic: string;
  intention: string;
  pastThoughts?: ClientThought[];
}): string {
  return `Generate exactly 10 short, highly targeted, provocative question prompts for a speed-writing 'Quick Fire' exercise.
Topic: "${input.topic}"
Intention: "${input.intention}"
Past thoughts surfaced (if any): "${inline(input.pastThoughts)}"

Instructions:
- The user is trying to extract hidden opinions, blocks, and core beliefs.
- Make the questions highly specific to the topic rather than generic.
- Keep each question under 15 words.
- Focus on unexpressed fears, compromises, desires, or immediate gut reactions.`;
}

export function drillNextPrompt(input: {
  topic: string;
  intention: string;
  history?: DrillTurn[];
  recentThoughts?: ClientThought[];
  advancedSettings?: PromptSettings;
}): string {
  return `You are a skilled diagnostic cognitive guide conducting an extraction interview drill.
Topic: "${input.topic}"
Intention: "${input.intention}"

Surfaced Thoughts so far:
${bullets(input.recentThoughts)}

Current Q&A history:
${transcript(input.history)}

Goal:
Ask the NEXT deeply relevant, insightful question that helps the user unpack their thought.
Guidelines:
- DO NOT summarize or praise the user. Avoid "Thanks for sharing," or "That makes a lot of sense."
- ${tone(DRILL_TONE, input.advancedSettings)}
- Trace threads. If they mentioned something interesting earlier, nudge them back to it if appropriate.
- Do not repeat topics. Dig deeper or pivot organically.
- Provide a brief 'contextNote' explaining why you are asking this (e.g., 'Looking at physical resistance' or 'Probing timeline risk').`;
}

export function drillClarifyPrompt(input: {
  topic: string;
  intention: string;
  history?: DrillTurn[];
  userComment: string;
  recentThoughts?: ClientThought[];
  advancedSettings?: PromptSettings;
}): string {
  return `You are an expert cognitive consultant. The user is in the middle of a strategic thought-extraction session.
Topic: "${input.topic}"
Intention: "${input.intention}"

Surfaced thoughts so far:
${bullets(input.recentThoughts)}

Previous Q&A interaction:
${transcript(input.history)}

The user did not answer the previous question directly. Instead, they asked a Clarifying Question or made a sidebar Comment:
"${input.userComment}"

Task:
Respond to their comment or question directly and guide them back into the exploration flow with the next organic, helpful inquiry.

Output Requirements:
- Write a 'reply': Directly address their comment, explain *why* we are asking what we are asking, or provide helpful strategic perspective. Keep it brief and clear.
- Provide a 'nextQuestion': A compelling, actionable follow-up question to keep the extraction flow going.
- Provide a 'contextNote': A brief label describing the psychological or cognitive point currently being investigated.

Tone guidance to enforce:
- ${tone(CLARIFY_TONE, input.advancedSettings)}
- Do not use generic AI buzzwords or filler praise.`;
}

export function binaryBracketPrompt(input: {
  topic: string;
  recentThoughts?: ClientThought[];
}): string {
  return `Based on the user's topic: "${input.topic}" and their thoughts shared so far: "${inline(input.recentThoughts)}", generate TWO opposing, highly insightful framings of their current situation.
The user will pick which statement feels more true to uncover their hidden beliefs.

Formatting Guidelines:
- Option A and Option B must represent two distinct psychological interpretations, attitudes, or load-bearing compromises.
- Try to make them provocative, exposing a deeper layer of truth (e.g., Fear of failure vs Fear of success, Pride vs Safety).
- Express them in the first person: "I feel like..." or "I am..."`;
}

export function devilsAdvocatePrompt(input: {
  topic: string;
  recentThoughts?: ClientThought[];
}): string {
  return `You are a friendly but highly sharp Devil's Advocate.
Topic: "${input.topic}"
User's statements: "${inline(input.recentThoughts)}"

Generate exactly 3 extremely constructive, provocative questions or alternative readings of their situation that will shake up their complacency.
- Be respectful but sharp, cutting to the root of potential rationalizations or avoidance techniques.
- Ask them directly.
- Avoid clichés. Make them highly attuned to the topic.`;
}

/** Renders a pile for the solo synthesis. Numbered so the model can refer back to a fragment. */
export function renderSoloPile(thoughts: ClientThought[] = []): string {
  return thoughts.map((t, idx) => `Thought #${idx + 1} (${t.mode}): ${t.text}`).join("\n");
}

const OUTPUT_FILTER: Record<string, string> = {
  actions:
    "FILTER INSTRUCTION: The user has selected 'Action lists Only'. Do not write any long analytical summaries or conversational introductions in the 'summary' field. Focus the 'outline' and 'actionItems' purely on clear, actionable checklists, procedural recipes, and clear items. Reduce explanatory filler to a minimum.",
  roadmap:
    "FILTER INSTRUCTION: The user has selected 'Milestones Only'. Avoid small, granular tasks or minute checklists. Synthesize high-level structural strategic milestones, general themes, development phases, and conceptual outlines. Keep the focus high-level rather than micro-tactical.",
  full: "Provide a comprehensive blueprint. This must include both a macro-level recap summary and micro-level detailed action checklists.",
};

const BIAS_AUDIT =
  "INTELLECTUAL BIAS DEBUGGER: Because the user requested a cognitive bias audit, analyze the provided thoughts for common human psychological fallback fallacies (such as confirmation bias, sunk-cost fallacy, avoidance, or black-and-white thinking). Actively append/include a dedicated brief diagnostics section inside the 'summary' output under the title 'Cognitive Bias Audit / Blind Spots' outlining these traps and how to address them.";

/**
 * The solo deliverable. Its group counterpart is `levelSetPrompt`, and the two are deliberately
 * not the same document — see the note there.
 */
export function synthesizeSessionPrompt(input: {
  topic: string;
  intention: string;
  thoughts?: ClientThought[];
  advancedSettings?: PromptSettings;
}): string {
  const filter =
    OUTPUT_FILTER[input.advancedSettings?.outputFilter ?? "full"] ?? OUTPUT_FILTER.full;
  const biasAudit =
    input.advancedSettings?.cognitiveBiasAudit === "include" ? BIAS_AUDIT : "Omit bias audit";

  return `You are a world-class cognitive orchestrator. Analyze this list of thoughts surfaced during an 'Extraction' brainstorming/unburdening session.
Topic: "${input.topic}"
Session Intention: "${input.intention}"

Here are the user's exact raw thoughts surfaced during interactions:
${renderSoloPile(input.thoughts)}

Synthesize these thoughts into structured output containing:
1. 'summary': A compassionate, analytical recap synthesis of what was really uncovered beneath the words, identifying recurring themes or major underlying forces.
2. 'outline': A deeply detailed, organized markdown outline mapping out their ideas, categories, and logical hierarchies. Use elegant headers (e.g., ##, ###) and clean bullet points.
3. 'actionItems': A parsed array of 3-7 clear, actionable next steps or focus points based on the thoughts sorted by priority/value.

Configuration parameters to strictly enforce:
- Theme Filter constraint: "${filter}"
- Cognitive Bias Audit check: "${biasAudit}"
- Writing tone: "${tone(SYNTHESIS_TONE, input.advancedSettings)}"

Write in a supportively tuned, clear, structured professional tone. Do not use generic AI buzzwords. Keep output highly precise.`;
}
