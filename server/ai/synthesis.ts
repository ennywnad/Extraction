import type { Session } from "../../src/types.ts";
import { getEngagementStore } from "../store/index.ts";
import { aiAvailable, generate, type ProviderName } from "./client.ts";
import { CLASSIFICATION_SCHEMA, LEVEL_SET_SCHEMA } from "./schema.ts";
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

/** A finished level set and who answered for it. */
export interface SynthesisRun {
  levelSet: LevelSet;
  /** The family that answered, when naming one would not overstate — see `answeringProvider`. */
  provider?: ProviderName;
}

/**
 * Which family to name as having written a level set, given that two calls go into one.
 *
 * A level set is one body with two model calls behind it, and each runs the chain
 * independently — so a deployment whose first entry is flaky can have the classification
 * answered by one family and the prose by another. That is a normal state for a chain that
 * crosses providers, not an error.
 *
 * **The writer is named unless a second family actually contributed.** Naming the prose writer
 * while a different family fed the coverage arithmetic would credit it with a body it half
 * wrote; omitting the family whenever two calls happened would lose the fact in the ordinary
 * case where both were the same. So the rule is the narrow one: a single family answered
 * everything, or the response says `model` and names nobody. Same instinct as `unstated` on the
 * board — the response declines to assert what it cannot, rather than rounding to the tidier
 * claim.
 */
export function answeringProvider(
  writer: ProviderName,
  classifier?: ProviderName,
): ProviderName | undefined {
  if (classifier && classifier !== writer) {
    // Not lost, just kept off a response: which id served which call is already the log's job.
    console.warn(
      `Level set written by ${writer} over a classification from ${classifier}; naming no family.`,
    );
    return undefined;
  }
  return writer;
}

/**
 * One synthesis per engagement at a time.
 *
 * The pile is large and the deliverable is shared, so ten people opening the review panel
 * must not mean ten concurrent generations racing to overwrite one field. Callers arriving
 * while a run is in flight join that run instead of starting another.
 */
const inFlight = new Map<string, Promise<SynthesisRun>>();

export function isSynthesisRunning(engagementId: string): boolean {
  return inFlight.has(engagementId);
}

async function classify(
  session: Session,
): Promise<{ assignments: Record<string, string>; provider?: ProviderName }> {
  if (!aiAvailable()) return { assignments: {} };

  const { data: parsed, provider } = await generate<{
    assignments?: { id?: unknown; area?: unknown }[];
  }>({
    prompt: classificationPrompt(session),
    schema: CLASSIFICATION_SCHEMA,
  });

  const assignments: Record<string, string> = {};
  for (const entry of parsed.assignments ?? []) {
    if (typeof entry?.id === "string" && typeof entry?.area === "string") {
      assignments[entry.id] = entry.area;
    }
  }
  return { assignments, provider };
}

async function runSynthesis(
  session: Session,
  generatedBy: string,
  settings?: { outputFilter?: string; cognitiveBiasAudit?: string },
): Promise<SynthesisRun> {
  if (!aiAvailable()) {
    // No canned filler here. A placeholder summary written into a shared client deliverable
    // reads exactly like a real one, and nobody would know to regenerate it.
    throw new UserFacingError("No model is configured; cannot produce a level set.");
  }

  const { assignments, provider: classifier } = await classify(session);
  const coverage = computeCoverage(session, LEVEL_SET_AREAS, assignments);
  const coverageSummary = coverage
    .map(
      (c) => `- ${c.area}: ${c.status.toUpperCase()} (${c.fragments} fragments, ${c.voices} roles)`,
    )
    .join("\n");

  const { data, provider: writer } = await generate<Partial<LevelSet>>({
    prompt: levelSetPrompt(session, coverageSummary, settings),
    schema: LEVEL_SET_SCHEMA,
  });

  return {
    levelSet: {
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
    },
    provider: answeringProvider(writer, classifier),
  };
}

export async function synthesizeEngagement(
  session: Session,
  generatedBy: string,
  settings?: { outputFilter?: string; cognitiveBiasAudit?: string },
): Promise<SynthesisRun & { joined: boolean }> {
  const existing = inFlight.get(session.id);
  if (existing) return { ...(await existing), joined: true };

  const run = runSynthesis(session, generatedBy, settings).then(async ({ levelSet, provider }) => {
    // Mirrored onto the session's synthesized* fields so ExportPanel's existing render path
    // needs no knowledge of versions.
    //
    // `coverage` is mirrored for a different reason: the level set itself is returned only to
    // whoever asked for it, so without this the map of what the room has *not* discussed
    // would exist for one participant until they reloaded. Sending it with the pile makes it
    // something the whole room can watch, which is the only form it is useful in.
    //
    // `levelSetRuns` rides the same write because it is counting exactly what this write
    // records: one completed level set, which is one pair of Gemini calls over the whole
    // pile. Incrementing here rather than per caller is the point — ten people opening the
    // review panel join one run (see `inFlight`), and counting callers would report ten runs
    // for one bill. It is a `+ 1` on the snapshot rather than an atomic store increment
    // because single-flight already means no two runs for one engagement overlap in a
    // process; two instances synthesising the same engagement at once could lose a count,
    // but that is the same window in which single-flight itself does not hold, and it fails
    // low — this number never overstates what was spent.
    const store = await getEngagementStore();
    await store.patchEngagement(session.id, {
      synthesizedSummary: levelSet.summary,
      synthesizedOutline: levelSet.outline,
      synthesizedActionItems: levelSet.openQuestions,
      coverage: levelSet.coverage,
      levelSetRuns: (session.levelSetRuns ?? 0) + 1,
      status: "review",
    });
    return { levelSet, provider };
  });

  inFlight.set(session.id, run);
  try {
    return { ...(await run), joined: false };
  } finally {
    inFlight.delete(session.id);
  }
}
