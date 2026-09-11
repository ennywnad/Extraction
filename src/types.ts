export type ExtractionMode =
  | "free_stream"
  | "quick_fire"
  | "guided_drill"
  | "binary_frame"
  | "swipe"
  | "slider"
  | "card_sort"
  | "timeline"
  | "sentence_completion"
  | "devils_advocate"
  | "letter_writing"
  | "priority_pile";

/** Who contributed a fragment, stamped server-side from the verified identity. */
export interface AuthorStamp {
  /** Lowercased; the canonical roster key. */
  email: string;
  name: string;
  role: string;
}

/**
 * The two roles the server assigns when nobody has said otherwise.
 *
 * Here rather than beside the code that stamps them because both sides need them and they
 * must not drift: the server writes them, and the client's only way to tell a declared role
 * from a placeholder is to compare against these exact strings. `server/store/shape.ts`
 * re-exports them so the stamping code still reads them from beside itself.
 */
export const FACILITATOR_ROLE = "Facilitator";
export const CONTRIBUTOR_ROLE = "Contributor";

export interface Thought {
  id: string;
  text: string;
  timestamp: string;
  mode: ExtractionMode | "system";

  // Swipe mode properties
  swipeStatus?: "like" | "dislike" | "maybe";

  // Slider mode intensities
  intensity?: {
    urgency?: number; // 1-10
    certainty?: number; // 1-10
    emotion?: number; // 1-10
    actionability?: number; // 1-10
  };

  // Card clustering properties
  clusterCategory?: string;

  // Timeline properties
  timelineZone?: "before" | "now" | "after";

  // Priority pile properties
  priorityZone?: "act" | "watch" | "discard";

  // Optional linkage to parent prompt
  promptContext?: string;

  /** Present only on engagement fragments. Absent means a solo, local thought. */
  author?: AuthorStamp;
}

export interface Session {
  id: string;

  /**
   * Set (and equal to `id`) when this session is held server-side rather than in
   * localStorage. Its presence is what switches every persistence path in the app.
   */
  engagementId?: string;
  /** email -> identity, for rendering attribution. Engagements only. */
  roster?: Record<string, AuthorStamp>;
  topic: string;
  intention: string;
  isCustomIntention: boolean;
  status: "intake" | "intention" | "recommendation" | "active" | "review" | "exported";
  activeMode: ExtractionMode;
  thoughts: Thought[];
  modeProgress: Record<ExtractionMode, number>; // How many items generated or interaction step
  modeHistory: { mode: ExtractionMode; timestamp: string }[];

  // Selection Warmup answers
  warmupAnswers?: {
    clarity: "clear" | "foggy" | "";
    nature: "emotional" | "analytical" | "";
    timeAvailable: "<5" | ">20" | "";
    intentType: "decide" | "process" | "capture" | "";
  };

  // Session results
  synthesizedOutline?: string;
  synthesizedSummary?: string;
  synthesizedActionItems?: string[];
  /**
   * Per-area coverage from the last level set. Engagements only, and server-written: it is
   * arithmetic over the pile (see server/ai/coverage.ts), so a client that could set it
   * could contradict the count. Absent until a level set has been generated.
   */
  coverage?: AreaCoverage[];
  /**
   * How many level sets this engagement has produced. Engagements only, and server-written
   * for the same reason as `coverage`.
   *
   * It exists because synthesis is the one thing in this app whose cost scales with use: two
   * Gemini calls over the entire pile, every time. Everything else is bounded by design —
   * Cloud Run scales to zero, an idle poll is two Firestore reads — so a pile regenerated
   * fifty times is the only way this deployment gets an unexpected bill, and until now
   * nothing anywhere counted it. See docs/intents/008-deploying-group-mode.md.
   *
   * Absent on an engagement that has never been synthesised, which reads as zero.
   */
  levelSetRuns?: number;

  createdAt: string;
  updatedAt: string;
  advancedSettings?: {
    promptingStyle: "standard" | "socratic" | "empathetic";
    outputFilter: "comprehensive" | "actions" | "roadmap";
    cognitiveBiasAudit: "include" | "exclude";
  };
}

export type AreaStatus = "defined" | "partial" | "dark";

/**
 * How thoroughly one area of the topic has been spoken into.
 *
 * Lives here rather than beside the arithmetic that produces it because it crosses the wire
 * in both directions — on the level set, and on the engagement it is mirrored onto.
 */
export interface AreaCoverage {
  area: string;
  status: AreaStatus;
  fragments: number;
  /** Distinct contributor roles that have spoken into this area. */
  voices: number;
  fragmentIds: string[];
}

export interface QuickFirePrompt {
  id: string;
  text: string;
  answered: boolean;
}

export interface BinaryPair {
  id: string;
  optionA: string;
  optionB: string;
  chosen?: "A" | "B" | "other";
  otherText?: string;
}

export interface SentencePrompt {
  id: string;
  prefix: string;
  completed?: string;
}

/**
 * What one running instance is wired to, as served unauthenticated by `/healthz`.
 *
 * Lives here rather than beside `instanceStatus()` for the same reason `AreaCoverage` does:
 * it crosses the wire, and the board that draws it is a client component. `server/status.ts`
 * re-exports it so the assembling code can keep importing the type from beside itself.
 *
 * Shapes, not secrets: every field is a branch name or a count. Never a project id, an IAP
 * audience, a model id or a store path — `test/status.test.ts` fails if one appears.
 */
export interface InstanceStatus {
  ok: true;
  identity: {
    mode: "iap" | "dev";
    /** Whether identities are verified (IAP) or asserted (dev). */
    verified: boolean;
  };
  storage: {
    backend: "firestore" | "file";
    /** Whether that branch has been taken in this process yet. */
    live: boolean;
  };
  model: {
    /** How the client authenticates — ADC as the service account, or a key. */
    backend: "vertex" | "apikey" | "none";
    /** How many entries the chain will try, not which ones. */
    chainLength: number;
    /**
     * Which providers the chain names *and* can reach. A branch name, like `vertex` — never
     * a model id, so it stays inside the same disclosure line as the rest of this shape.
     *
     * This is the seam made observable: the app's claim is that the provider is a property of
     * the deployment, and until this field there was no way to ask which one it had picked.
     * It is a list rather than one value because a chain can legitimately name both and fall
     * between them.
     */
    providers: ("gemini" | "claude")[];
  };
  aiEnabled: boolean;
}
