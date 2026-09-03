import { Type } from "@google/genai";
import type { Session } from "../../src/types.ts";
import { getEngagementStore } from "../store/index.ts";
import { generateContentWithFallback, getGemini } from "./client.ts";
import { UserFacingError } from "./respond.ts";
import { computeCoverage, type AreaCoverage } from "./coverage.ts";
import { LEVEL_SET_AREAS, classificationPrompt, levelSetPrompt } from "./levelSetPrompt.ts";

export interface LevelSet {
  version: number;
  generatedBy: string;
  generatedAt: string;
  /** The engagement's updatedAt when this was built; the pile is stale if it has moved on. */
  pileVersion: string;
  coverage: AreaCoverage[];
  summary: string;
  outline: string;
  conflicts: string[];
  assumptions: string[];
  openQuestions: string[];
}

/**
 * One synthesis per engagement at a time.
 *
 * The pile is large and the deliverable is shared, so ten people opening the review panel
 * must not mean ten concurrent generations racing to overwrite one field. Callers arriving
 * while a run is in flight join that run instead of starting another.
 */
const inFlight = new Map<string, Promise<LevelSet>>();

export function isSynthesisRunning(engagementId: string): boolean {
  return inFlight.has(engagementId);
}

async function classify(session: Session): Promise<Record<string, string>> {
  const ai = getGemini();
  if (!ai) return {};

  const response = await generateContentWithFallback(ai, {
    contents: classificationPrompt(session),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          assignments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                area: { type: Type.STRING },
              },
              required: ["id", "area"],
            },
          },
        },
        required: ["assignments"],
      },
    },
  });

  const parsed = JSON.parse(response.text || "{}");
  const assignments: Record<string, string> = {};
  for (const entry of parsed.assignments ?? []) {
    if (typeof entry?.id === "string" && typeof entry?.area === "string") {
      assignments[entry.id] = entry.area;
    }
  }
  return assignments;
}

async function runSynthesis(
  session: Session,
  generatedBy: string,
  settings?: { outputFilter?: string; cognitiveBiasAudit?: string },
): Promise<LevelSet> {
  const ai = getGemini();
  if (!ai) {
    // No canned filler here. A placeholder summary written into a shared client deliverable
    // reads exactly like a real one, and nobody would know to regenerate it.
    throw new UserFacingError("Gemini is not configured; cannot produce a level set.");
  }

  const classification = await classify(session);
  const coverage = computeCoverage(session, LEVEL_SET_AREAS, classification);
  const coverageSummary = coverage
    .map(
      (c) => `- ${c.area}: ${c.status.toUpperCase()} (${c.fragments} fragments, ${c.voices} roles)`,
    )
    .join("\n");

  const response = await generateContentWithFallback(ai, {
    contents: levelSetPrompt(session, coverageSummary, settings),
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          outline: { type: Type.STRING },
          conflicts: { type: Type.ARRAY, items: { type: Type.STRING } },
          assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          openQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["summary", "outline", "conflicts", "assumptions", "openQuestions"],
      },
    },
  });

  const data = JSON.parse(response.text || "{}");
  return {
    version: 0, // assigned on persist
    generatedBy,
    generatedAt: new Date().toISOString(),
    pileVersion: session.updatedAt,
    coverage,
    summary: data.summary ?? "",
    outline: data.outline ?? "",
    conflicts: data.conflicts ?? [],
    assumptions: data.assumptions ?? [],
    openQuestions: data.openQuestions ?? [],
  };
}

export async function synthesizeEngagement(
  session: Session,
  generatedBy: string,
  settings?: { outputFilter?: string; cognitiveBiasAudit?: string },
): Promise<{ levelSet: LevelSet; joined: boolean }> {
  const existing = inFlight.get(session.id);
  if (existing) return { levelSet: await existing, joined: true };

  const run = runSynthesis(session, generatedBy, settings).then(async (levelSet) => {
    // Mirrored onto the session's synthesized* fields so ExportPanel's existing render path
    // needs no knowledge of versions.
    //
    // `coverage` is mirrored for a different reason: the level set itself is returned only to
    // whoever asked for it, so without this the map of what the room has *not* discussed
    // would exist for one participant until they reloaded. Sending it with the pile makes it
    // something the whole room can watch, which is the only form it is useful in.
    const store = await getEngagementStore();
    await store.patchEngagement(session.id, {
      synthesizedSummary: levelSet.summary,
      synthesizedOutline: levelSet.outline,
      synthesizedActionItems: levelSet.openQuestions,
      coverage: levelSet.coverage,
      status: "review",
    });
    return levelSet;
  });

  inFlight.set(session.id, run);
  try {
    return { levelSet: await run, joined: false };
  } finally {
    inFlight.delete(session.id);
  }
}
