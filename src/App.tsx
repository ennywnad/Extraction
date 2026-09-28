import {
  Fragment,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { Cpu, Monitor, Moon, Sun } from "lucide-react";
import { loadSessions, persistSession, deleteSession } from "./utils/localDB";
import * as engagementAPI from "./utils/engagementAPI";
import type { EngagementSummary, ViewerIdentity } from "./utils/engagementAPI";
import { pushSessionUpdate } from "./utils/engagementSync";
import { decodeSnapshot } from "./utils/shareLink";
import { Session, Thought, ExtractionMode, InstanceStatus } from "./types";
import { engagementStats } from "./utils/engagementStats";
import { setListening } from "./utils/askModel";
import { setAssists, takeAccepted } from "./local/assist";
import {
  DEFAULT_ASSISTS,
  loadAssistPrefs,
  saveAssistPrefs,
  type AssistPrefs,
} from "./utils/assistPrefs";
import { lastAnswer, subscribeToAnswers } from "./utils/lastAnswer";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type BoardPrefs } from "./utils/boardPrefs";
import { buildIndex, echoFor, tally } from "./utils/chorus";
import {
  DEFAULT_CHORUS,
  loadChorusPrefs,
  saveChorusPrefs,
  type ChorusPrefs,
} from "./utils/chorusPrefs";
import {
  DEFAULT_THEME,
  THEME_LABEL,
  THEME_ORDER,
  applyTheme,
  loadThemeChoice,
  resolveTheme,
  saveThemeChoice,
  systemPrefersDark,
  watchSystemTheme,
  type ThemeChoice,
} from "./utils/themePrefs";

// Intake/Shell layouts
import IntakeForm from "./components/IntakeForm";
import Workspace from "./components/Workspace";
import StatusBoard from "./components/StatusBoard";
import ExportPanel from "./components/ExportPanel";

// Core action modes
import FreeStream from "./components/Modes/FreeStream";
import QuickFire from "./components/Modes/QuickFire";
import GuidedDrill from "./components/Modes/GuidedDrill";
import BinaryFrame from "./components/Modes/BinaryFrame";
import SwipeReact from "./components/Modes/SwipeReact";
import SliderMap from "./components/Modes/SliderMap";
import CardSort from "./components/Modes/CardSort";
import TimelineMode from "./components/Modes/TimelineMode";
import SentenceCompletion from "./components/Modes/SentenceCompletion";
import DevilsAdvocate from "./components/Modes/DevilsAdvocate";
import LetterWriting from "./components/Modes/LetterWriting";
import PriorityPile from "./components/Modes/PriorityPile";

/** How often an open tab asks the server whether the shared pile has moved. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Every mode at zero progress, and — by being keyed on `ExtractionMode` rather than listed —
 * the one place this file enumerates the modes.
 *
 * A mode added to `ExtractionMode` and forgotten here is a compile error. Listed, it was a
 * silent one: `VALID_MODES` is what `validateAndSanitizeSnapshot` filters an imported session
 * through, so a missing mode meant shared links quietly downgraded that mode's fragments to
 * free_stream. Its twin on the server is `emptyModeProgress` in server/store/shape.ts.
 */
const EMPTY_MODE_PROGRESS: Record<ExtractionMode, number> = {
  free_stream: 0,
  quick_fire: 0,
  guided_drill: 0,
  binary_frame: 0,
  swipe: 0,
  slider: 0,
  card_sort: 0,
  timeline: 0,
  sentence_completion: 0,
  devils_advocate: 0,
  letter_writing: 0,
  priority_pile: 0,
};

const VALID_MODES = Object.keys(EMPTY_MODE_PROGRESS) as ExtractionMode[];

function validateAndSanitizeSnapshot(data: any): Session | null {
  if (!data || typeof data !== "object") return null;

  const id = typeof data.id === "string" && data.id ? data.id : crypto.randomUUID();
  const topic = typeof data.topic === "string" ? data.topic.slice(0, 500) : "Imported Session";
  const intention =
    typeof data.intention === "string" ? data.intention.slice(0, 500) : "Unclutter scatter";
  const isCustomIntention =
    typeof data.isCustomIntention === "boolean" ? data.isCustomIntention : false;

  let status: Session["status"] = "active";
  if (
    ["intake", "intention", "recommendation", "active", "review", "exported"].includes(data.status)
  ) {
    status = data.status;
  }

  let activeMode: ExtractionMode = "free_stream";
  if (VALID_MODES.includes(data.activeMode)) {
    activeMode = data.activeMode;
  }

  const thoughts: Thought[] = [];
  if (Array.isArray(data.thoughts)) {
    for (const t of data.thoughts) {
      if (t && typeof t === "object" && typeof t.text === "string" && t.text) {
        let mode: Thought["mode"] = "free_stream";
        if (VALID_MODES.includes(t.mode) || t.mode === "system") {
          mode = t.mode;
        }
        const thought: Thought = {
          id: typeof t.id === "string" && t.id ? t.id : crypto.randomUUID(),
          text: t.text.slice(0, 5000),
          timestamp:
            typeof t.timestamp === "string" && !isNaN(Date.parse(t.timestamp))
              ? t.timestamp
              : new Date().toISOString(),
          mode: mode,
        };
        if (["like", "dislike", "maybe"].includes(t.swipeStatus)) {
          thought.swipeStatus = t.swipeStatus;
        }
        if (t.intensity && typeof t.intensity === "object") {
          thought.intensity = {};
          for (const key of ["urgency", "certainty", "emotion", "actionability"]) {
            const val = t.intensity[key];
            if (typeof val === "number" && val >= 1 && val <= 10) {
              thought.intensity[key as keyof Thought["intensity"]] = val;
            }
          }
        }
        if (typeof t.clusterCategory === "string") {
          thought.clusterCategory = t.clusterCategory.slice(0, 100);
        }
        if (["before", "now", "after"].includes(t.timelineZone)) {
          thought.timelineZone = t.timelineZone;
        }
        if (["act", "watch", "discard"].includes(t.priorityZone)) {
          thought.priorityZone = t.priorityZone;
        }
        if (typeof t.promptContext === "string") {
          thought.promptContext = t.promptContext.slice(0, 500);
        }
        thoughts.push(thought);
      }
    }
  }

  const modeProgress: Record<ExtractionMode, number> = { ...EMPTY_MODE_PROGRESS };
  if (data.modeProgress && typeof data.modeProgress === "object") {
    for (const m of VALID_MODES) {
      const val = data.modeProgress[m];
      if (typeof val === "number" && !isNaN(val)) {
        modeProgress[m] = Math.max(0, val);
      }
    }
  }

  const modeHistory: { mode: ExtractionMode; timestamp: string }[] = [];
  if (Array.isArray(data.modeHistory)) {
    for (const mh of data.modeHistory) {
      if (mh && typeof mh === "object" && VALID_MODES.includes(mh.mode)) {
        modeHistory.push({
          mode: mh.mode,
          timestamp:
            typeof mh.timestamp === "string" && !isNaN(Date.parse(mh.timestamp))
              ? mh.timestamp
              : new Date().toISOString(),
        });
      }
    }
  }
  if (modeHistory.length === 0) {
    modeHistory.push({ mode: activeMode, timestamp: new Date().toISOString() });
  }

  let warmupAnswers: Session["warmupAnswers"] = undefined;
  if (data.warmupAnswers && typeof data.warmupAnswers === "object") {
    warmupAnswers = {
      clarity: ["clear", "foggy", ""].includes(data.warmupAnswers.clarity)
        ? data.warmupAnswers.clarity
        : "",
      nature: ["emotional", "analytical", ""].includes(data.warmupAnswers.nature)
        ? data.warmupAnswers.nature
        : "",
      timeAvailable: ["<5", ">20", ""].includes(data.warmupAnswers.timeAvailable)
        ? data.warmupAnswers.timeAvailable
        : "",
      intentType: ["decide", "process", "capture", ""].includes(data.warmupAnswers.intentType)
        ? data.warmupAnswers.intentType
        : "",
    };
  }

  let advancedSettings: Session["advancedSettings"] = undefined;
  if (data.advancedSettings && typeof data.advancedSettings === "object") {
    advancedSettings = {
      promptingStyle: ["standard", "socratic", "empathetic"].includes(
        data.advancedSettings.promptingStyle,
      )
        ? data.advancedSettings.promptingStyle
        : "standard",
      outputFilter: ["comprehensive", "actions", "roadmap"].includes(
        data.advancedSettings.outputFilter,
      )
        ? data.advancedSettings.outputFilter
        : "comprehensive",
      cognitiveBiasAudit: ["include", "exclude"].includes(data.advancedSettings.cognitiveBiasAudit)
        ? data.advancedSettings.cognitiveBiasAudit
        : "exclude",
    };
  }

  const createdAt =
    typeof data.createdAt === "string" && !isNaN(Date.parse(data.createdAt))
      ? data.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof data.updatedAt === "string" && !isNaN(Date.parse(data.updatedAt))
      ? data.updatedAt
      : new Date().toISOString();

  const session: Session = {
    id,
    topic,
    intention,
    isCustomIntention,
    status,
    activeMode,
    thoughts,
    modeProgress,
    modeHistory,
    createdAt,
    updatedAt,
  };

  // A boolean or nothing. A snapshot is somebody else's file, and a truthy string here would
  // put the session in a state the banner claims and the routes do not — see the guard in
  // server/engagementRoutes.ts, which drops a non-boolean for the same reason.
  if (data.listening === true) session.listening = true;
  if (warmupAnswers) session.warmupAnswers = warmupAnswers;
  if (advancedSettings) session.advancedSettings = advancedSettings;
  if (typeof data.synthesizedOutline === "string")
    session.synthesizedOutline = data.synthesizedOutline;
  if (typeof data.synthesizedSummary === "string")
    session.synthesizedSummary = data.synthesizedSummary;
  if (Array.isArray(data.synthesizedActionItems)) {
    session.synthesizedActionItems = data.synthesizedActionItems.filter(
      (item) => typeof item === "string",
    );
  }

  return session;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [engagements, setEngagements] = useState<EngagementSummary[]>([]);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus | null>(null);
  const [pollingNow, setPollingNow] = useState<number | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardExpanded, setBoardExpanded] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [boardPrefs, setBoardPrefs] = useState<BoardPrefs>(DEFAULT_PREFS);
  const [chorusPrefs, setChorusPrefs] = useState<ChorusPrefs>(DEFAULT_CHORUS);
  const [assistPrefs, setAssistPrefs] = useState<AssistPrefs>(DEFAULT_ASSISTS);
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(DEFAULT_THEME);
  /**
   * The fragment this viewer contributed last, and the only one the pile answers about.
   *
   * Held here rather than in Workspace because every mode reaches the pile through
   * `handleAddThought`, so this is the one place that knows a contribution just happened —
   * as opposed to a poll bringing in somebody else's.
   */
  const [lastContributed, setLastContributed] = useState<{ id: string; text: string } | null>(null);
  const aiEnabled = instanceStatus?.aiEnabled !== false;
  /**
   * Whether this session has asked the app to stay quiet. In an engagement it is the room's
   * state, so a poll can bring somebody else's decision in and this follows it.
   */
  const listening = currentSession?.listening === true;
  /**
   * Who wrote the last AI response this tab received.
   *
   * Read from a store rather than threaded down as a callback: the nine AI fetches live in
   * eight components that share nothing else, so a prop would put the model seam on eight mode
   * interfaces that are not about the model. See src/utils/lastAnswer.ts.
   *
   * The same getter serves as the server snapshot — there is no SSR here, and null is the
   * truthful answer before anything has been asked in any case.
   */
  const currentAnswer = useSyncExternalStore(subscribeToAnswers, lastAnswer, lastAnswer);

  /**
   * The six prompting call sites read this when they compose a request rather than taking it as
   * a prop — see src/utils/askModel.ts for why it is not threaded through the modes. Mirrored
   * here, in one effect, so there is exactly one place the two can fall out of step.
   */
  useEffect(() => {
    setListening(listening);
  }, [listening]);

  /**
   * The same arrangement for the local assists, and for the same reason — see
   * src/local/assist.ts. One effect, so the surfaces and the door cannot disagree about which
   * assists are on.
   */
  useEffect(() => {
    setAssists(assistPrefs);
  }, [assistPrefs]);

  // Held in refs so the polling effect can read them without resubscribing every render.
  const engagementEtag = useRef<string | null>(null);
  const isEditingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // Manage initial load and search parameter decoder snapshot
  useEffect(() => {
    const loaded = loadSessions(() =>
      showToast(
        "Warning: Session storage appears corrupted. Your past sessions could not be loaded.",
      ),
    );
    setSessions(loaded);

    const params = new URLSearchParams(window.location.search);

    // Unauthenticated, so this answers in solo deployments too. A silent downgrade to canned
    // prompts is the failure nobody notices until a workshop has already gone badly.
    // Not /healthz: Cloud Run reserves paths ending in `z` and 404s them at the front end.
    fetch("/api/status")
      .then((r) => r.json())
      .then((h) => setInstanceStatus(h as InstanceStatus))
      .catch(() => undefined);

    setBoardPrefs(loadPrefs());
    setChorusPrefs(loadChorusPrefs());
    setAssistPrefs(loadAssistPrefs());
    setThemeChoice(loadThemeChoice());

    // Group mode is available only when the server says who we are.
    engagementAPI
      .whoami()
      .then(async (identity) => {
        setViewer(identity);
        setEngagements(await engagementAPI.listEngagements());
        const deepLink = params.get("engagement");
        if (deepLink) {
          const session = await engagementAPI.joinEngagement(deepLink);
          engagementEtag.current = null;
          setCurrentSession(session);
        }
      })
      .catch(() => {
        // No identity: solo mode only. Expected whenever the app is served without IAP.
        setViewer(null);
      });

    // Decode base64url snapshot if loaded
    const snapshot = params.get("snapshot");
    if (snapshot) {
      try {
        const decoded = decodeSnapshot(snapshot);
        const validated = validateAndSanitizeSnapshot(decoded);
        if (validated) {
          // Open as currently active session
          setCurrentSession(validated);
          showToast(
            "Successfully imported shared session snapshot! View results or click back to dashboard to start a new one.",
          );
        } else {
          showToast("Import failed: Shared session data is invalid or corrupted.");
        }
      } catch (e) {
        console.error("Failed to decode shared snapshot", e);
        showToast("Import failed: Shared snapshot decoding error.");
      }
    }
  }, []);

  const handleStartSession = (sessionData: Partial<Session>) => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      topic: sessionData.topic || "Untitled Extraction Session",
      intention: sessionData.intention || "Unclutter scatters",
      isCustomIntention: false,
      status: "active",
      // Absent rather than false when the form did not ask for it, so a stored session carries
      // the field only when somebody chose it.
      ...(sessionData.listening ? { listening: true } : {}),
      activeMode: sessionData.activeMode || "free_stream",
      thoughts: [],
      modeProgress: { ...EMPTY_MODE_PROGRESS },
      modeHistory: [
        { mode: sessionData.activeMode || "free_stream", timestamp: new Date().toISOString() },
      ],
      warmupAnswers: sessionData.warmupAnswers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    persistSession(newSession);
    const loaded = loadSessions();
    setSessions(loaded);
    setCurrentSession(newSession);
  };

  const handleUpdateSession = (updates: Partial<Session>) => {
    if (!currentSession) return;

    if (currentSession.engagementId) {
      // Optimistic locally, authoritative from the server. Note that a fragment absent from
      // updates.thoughts is never deleted here; deletion is handleDeleteThought's job.
      const optimistic = { ...currentSession, ...updates };
      setCurrentSession(optimistic);
      pushSessionUpdate(currentSession, updates)
        .then((fresh) => {
          engagementEtag.current = null; // the pile moved; force a full read next poll
          setCurrentSession((prev) => (prev?.engagementId === fresh.engagementId ? fresh : prev));
        })
        .catch((e) => {
          console.error("Failed to sync engagement update", e);
          showToast(e?.message || "Could not save to the shared pile. Retrying on next change.");
          setCurrentSession(currentSession); // roll back to the last known-good state
        });
      return;
    }

    const updated = { ...currentSession, ...updates, updatedAt: new Date().toISOString() };
    setCurrentSession(updated);
    persistSession(updated);

    // Keep state updated in parent list
    setSessions(loadSessions());
  };

  /**
   * Turns listening on or off — for the whole room, when this is an engagement.
   *
   * The toast is the handoff. Ending listening is the transition the intent calls the feature,
   * and without something said out loud it is a flag flip: the modes come alive on the next
   * question and nobody is told which change they are looking at. It names what actually
   * becomes true, which on an instance with no model configured is nothing.
   */
  const handleListeningChange = (on: boolean) => {
    handleUpdateSession({ listening: on });
    showToast(
      on
        ? "Listening. Nothing will be generated until you end it — keep writing."
        : aiEnabled
          ? "Listening ended. The modes are asking the model again."
          : "Listening ended. No model is configured, so prompts stay fixed.",
    );
  };

  /**
   * Deletion is explicit rather than inferred from a shrinking thoughts array. In a shared
   * pile an array composed from stale local state is missing other people's contributions,
   * so treating absence as removal would silently destroy them.
   */
  const handleDeleteThought = (id: string) => {
    if (!currentSession) return;
    const remaining = currentSession.thoughts.filter((t) => t.id !== id);

    if (currentSession.engagementId) {
      setCurrentSession({ ...currentSession, thoughts: remaining });
      engagementAPI
        .deleteThought(currentSession.engagementId, id)
        .then(() => {
          engagementEtag.current = null;
        })
        .catch((e) => {
          console.error("Failed to delete fragment", e);
          showToast(e?.message || "Could not delete that fragment.");
          setCurrentSession(currentSession);
        });
      return;
    }
    handleUpdateSession({ thoughts: remaining });
  };

  const handleCreateEngagement = async (input: { topic: string; intention?: string }) => {
    try {
      const session = await engagementAPI.createEngagement(input);
      engagementEtag.current = null;
      setCurrentSession(session);
      window.history.replaceState({}, document.title, `?engagement=${session.id}`);
      setEngagements(await engagementAPI.listEngagements());
    } catch (e: any) {
      showToast(e?.message || "Could not create the engagement.");
    }
  };

  const handleJoinEngagement = async (id: string) => {
    try {
      const session = await engagementAPI.joinEngagement(id);
      engagementEtag.current = null;
      setCurrentSession(session);
      window.history.replaceState({}, document.title, `?engagement=${id}`);
    } catch (e: any) {
      showToast(e?.message || "Could not open that engagement.");
    }
  };

  /**
   * Saves this viewer's own roster entry, and folds the result straight back in.
   *
   * The poll would bring it within fifteen seconds, but a person who just typed their role and
   * saw nothing change assumes it failed — and this is the one write in the app whose entire
   * value is that people actually complete it. The server's answer is the authoritative stamp,
   * so this merges what it returned rather than what was typed.
   *
   * Errors are rethrown rather than toasted: the panel keeps the text and shows the message
   * beside the field, which is where somebody who just lost a sentence is looking.
   */
  const handleSaveRosterEntry = async (entry: { name: string; role: string; brief: string }) => {
    const engagementId = currentSession?.engagementId;
    if (!engagementId) return;
    const stamp = await engagementAPI.updateMyRosterEntry(engagementId, entry);
    setCurrentSession((prev) =>
      prev?.engagementId === engagementId
        ? { ...prev, roster: { ...(prev.roster ?? {}), [stamp.email]: stamp } }
        : prev,
    );
  };

  /**
   * Records what a role label counts as, and folds the server's answer straight back in for the
   * roster save's reason: a regroup that changes nothing on screen for fifteen seconds reads as
   * one that failed. The server returns the whole map, so this replaces it rather than merging.
   * Errors are rethrown so the panel can show them beside the choice that failed.
   */
  const handleSetRoleGroup = async (label: string, group: string | null) => {
    const engagementId = currentSession?.engagementId;
    if (!engagementId) return;
    const roleGroups = await engagementAPI.setRoleGroup(engagementId, label, group);
    setCurrentSession((prev) =>
      prev?.engagementId === engagementId ? { ...prev, roleGroups } : prev,
    );
  };

  const handleLoadSession = (id: string) => {
    const match = sessions.find((s) => s.id === id);
    if (match) {
      setCurrentSession(match);
    }
  };

  const handleDeleteSession = (id: string) => {
    deleteSession(id);
    setSessions(loadSessions());
    if (currentSession?.id === id) {
      setCurrentSession(null);
    }
  };

  const handleAddThought = (text: string, swipeStatus?: "like" | "dislike" | "maybe") => {
    if (!currentSession) return;
    const newThought: Thought = {
      id: crypto.randomUUID(),
      text,
      timestamp: new Date().toISOString(),
      mode: currentSession.activeMode,
      swipeStatus,
      // Consumed here because this is the one place a fragment is built, and keyed by the text
      // so an acceptance cannot follow a draft that has since been rewritten. See
      // src/local/assist.ts.
      assist: takeAccepted(text) ?? undefined,
    };

    setLastContributed({ id: newThought.id, text });
    handleUpdateSession({
      thoughts: [newThought, ...currentSession.thoughts],
    });
  };

  const handleUpdateThoughtCluster = (id: string, category: string) => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) =>
        t.id === id ? { ...t, clusterCategory: category } : t,
      ),
    });
  };

  const handleUpdateThoughtTimeline = (id: string, zone: "before" | "now" | "after") => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) =>
        t.id === id ? { ...t, timelineZone: zone } : t,
      ),
    });
  };

  const handleUpdateThoughtPriority = (id: string, zone: "act" | "watch" | "discard") => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) =>
        t.id === id ? { ...t, priorityZone: zone } : t,
      ),
    });
  };

  const handleUpdateThoughtIntensity = (
    id: string,
    intensity: NonNullable<Thought["intensity"]>,
  ) => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) => (t.id === id ? { ...t, intensity } : t)),
    });
  };

  const handleLaunchReview = () => {
    if (!currentSession) return;
    handleUpdateSession({
      status: "review",
    });
  };

  // Exit clean
  const handleExitSession = () => {
    setCurrentSession(null);
    // Clear URL snapshots query params
    window.history.pushState({}, document.title, window.location.pathname);
  };

  // Poll the shared pile. The ETag makes an idle poll a 304 that the server settles without
  // reading the pile, and polling pauses while the tab is hidden or a fragment is being
  // edited, so an in-flight edit is never clobbered. The interval is a cost lever as much as
  // a latency one: it is the read rate of every open tab, including one left visible and
  // forgotten for a month. Fifteen seconds is under the pace of people typing fragments.
  const engagementId = currentSession?.engagementId;
  useEffect(() => {
    if (!engagementId) return;

    let cancelled = false;
    let failures = 0;

    const poll = async () => {
      if (cancelled || document.hidden || isEditingRef.current) return;
      try {
        const result = await engagementAPI.fetchEngagement(
          engagementId,
          engagementEtag.current ?? undefined,
        );
        failures = 0;
        if (cancelled) return;
        setPollingNow(result.polling);
        if (!result.session) return; // a 304: the pile has not moved
        engagementEtag.current = result.etag;
        const fresh = result.session;
        setCurrentSession((prev) =>
          prev?.engagementId === engagementId ? { ...prev, ...fresh } : prev,
        );
      } catch (e) {
        // Back off rather than hammering a server that is struggling.
        failures += 1;
        if (failures === 3) showToast("Lost contact with the shared pile. Still retrying.");
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener("focus", poll);
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [engagementId]);

  // One object for both views, remembered per viewer. Not room state: turning a tile off on
  // a projector must not turn it off for everyone looking at the same engagement.
  const handleBoardPrefs = useCallback((next: BoardPrefs) => {
    setBoardPrefs(next);
    savePrefs(next);
  }, []);

  const handleEditingChange = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
  }, []);

  /**
   * The pile, indexed once per change, for both halves of the chorus.
   *
   * Rebuilt when the pile moves — which in a shared engagement is every poll that brings
   * something back — and not at all when the feature is off, so a viewer who turned it off is
   * paying nothing for it. `topic` is a dependency because the topic's own words are excluded
   * from linking: everyone is using them, so they join everybody to everybody.
   */
  const chorusIndex = useMemo(
    () => (currentSession && chorusPrefs.enabled ? buildIndex(currentSession) : null),
    [currentSession?.thoughts, currentSession?.topic, chorusPrefs.enabled],
  );

  const chorus = useMemo(
    () =>
      chorusIndex && lastContributed
        ? {
            key: lastContributed.id,
            echo: echoFor(chorusIndex, { ...lastContributed, authorEmail: viewer?.email }),
          }
        : null,
    [chorusIndex, lastContributed, viewer?.email],
  );

  const loneIds = useMemo(
    () => (chorusIndex ? tally(chorusIndex).loneIds : undefined),
    [chorusIndex],
  );

  /**
   * Keeps the root attribute in step with the choice, and with the system while the choice is
   * to follow it. The subscription is unconditional rather than only while on "system":
   * switching back to it has to land on what the OS says now, not on what it said at boot.
   */
  useEffect(() => {
    const paint = () => applyTheme(resolveTheme(themeChoice, systemPrefersDark()));
    paint();
    return watchSystemTheme(paint);
  }, [themeChoice]);

  const handleThemeCycle = useCallback(() => {
    setThemeChoice((prev) => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(prev) + 1) % THEME_ORDER.length];
      saveThemeChoice(next);
      return next;
    });
  }, []);

  const handleAssistToggle = useCallback((which: keyof AssistPrefs) => {
    setAssistPrefs((prev) => {
      const next = { ...prev, [which]: !prev[which] };
      saveAssistPrefs(next);
      return next;
    });
  }, []);

  const handleChorusToggle = useCallback(() => {
    setChorusPrefs((prev) => {
      const next = { enabled: !prev.enabled };
      saveChorusPrefs(next);
      return next;
    });
  }, []);

  // An echo is an answer to something you just said, so it does not survive leaving the room
  // it was said in — including the case where somebody opens a second engagement in the tab.
  useEffect(() => setLastContributed(null), [currentSession?.id]);

  const renderActiveMode = () => {
    if (!currentSession) return null;

    switch (currentSession.activeMode) {
      case "free_stream":
        return (
          <FreeStream topic={currentSession.topic} onAddThought={(txt) => handleAddThought(txt)} />
        );
      case "quick_fire":
        return (
          <QuickFire
            topic={currentSession.topic}
            intention={currentSession.intention}
            onAddThought={(txt) => handleAddThought(txt)}
            thoughts={currentSession.thoughts}
          />
        );
      case "guided_drill":
        return (
          <GuidedDrill
            topic={currentSession.topic}
            intention={currentSession.intention}
            onAddThought={(txt) => handleAddThought(txt)}
            thoughts={currentSession.thoughts}
            advancedSettings={currentSession.advancedSettings}
          />
        );
      case "binary_frame":
        return (
          <BinaryFrame
            topic={currentSession.topic}
            onAddThought={(txt) => handleAddThought(txt)}
            thoughts={currentSession.thoughts}
          />
        );
      case "swipe":
        return (
          <SwipeReact
            topic={currentSession.topic}
            onAddThought={(txt, status) => handleAddThought(txt, status)}
            thoughts={currentSession.thoughts}
          />
        );
      case "slider":
        return (
          <SliderMap
            thoughts={currentSession.thoughts}
            onUpdateThought={(id, intent) => handleUpdateThoughtIntensity(id, intent)}
          />
        );
      case "card_sort":
        return (
          <CardSort
            thoughts={currentSession.thoughts}
            onUpdateThoughtCluster={(id, cat) => handleUpdateThoughtCluster(id, cat)}
          />
        );
      case "timeline":
        return (
          <TimelineMode
            thoughts={currentSession.thoughts}
            onUpdateThoughtTimeline={(id, zone) => handleUpdateThoughtTimeline(id, zone)}
          />
        );
      case "sentence_completion":
        return <SentenceCompletion onAddThought={(txt) => handleAddThought(txt)} />;
      case "devils_advocate":
        return (
          <DevilsAdvocate
            topic={currentSession.topic}
            onAddThought={(txt) => handleAddThought(txt)}
            thoughts={currentSession.thoughts}
          />
        );
      case "letter_writing":
        return <LetterWriting onAddThought={(txt) => handleAddThought(txt)} />;
      case "priority_pile":
        return (
          <PriorityPile
            thoughts={currentSession.thoughts}
            onUpdateThoughtPriority={(id, zone) => handleUpdateThoughtPriority(id, zone)}
          />
        );
      default: {
        // A mode added to `ExtractionMode` with no case above leaves this assignment holding
        // that mode instead of `never`, so it fails `npm run lint` rather than silently
        // rendering as unimplemented. The runtime branch stays: `activeMode` is read back from
        // `localStorage` and from the wire, where a value this build has never heard of is a
        // real possibility rather than a type error.
        const unhandled: never = currentSession.activeMode;
        return (
          <div className="text-center py-12 text-slate-400 text-xs">
            Unimplemented Mode: {unhandled}
          </div>
        );
      }
    }
  };

  // Solo sessions have no engagement id, so there is no roster and no shared pile to count.
  const boardStats = currentSession?.engagementId
    ? engagementStats(currentSession, pollingNow)
    : null;

  return (
    <>
      {(() => {
        if (
          currentSession &&
          (currentSession.status === "review" || currentSession.status === "exported")
        ) {
          return (
            <ExportPanel
              session={currentSession}
              onUpdateSession={handleUpdateSession}
              onStartNewSession={() => handleExitSession()}
              onExitToDashboard={() => handleExitSession()}
            />
          );
        }

        if (currentSession) {
          return (
            <Workspace
              session={currentSession}
              onUpdateSession={handleUpdateSession}
              onDeleteThought={handleDeleteThought}
              onAddThought={(txt) => handleAddThought(txt)}
              onExit={handleExitSession}
              onSynthesize={handleLaunchReview}
              onEditingChange={handleEditingChange}
              viewerEmail={viewer?.email}
              onSaveRosterEntry={currentSession.engagementId ? handleSaveRosterEntry : undefined}
              onSetRoleGroup={currentSession.engagementId ? handleSetRoleGroup : undefined}
              aiEnabled={aiEnabled}
              listening={listening}
              onListeningChange={handleListeningChange}
              chorusEnabled={chorusPrefs.enabled}
              assistPrefs={assistPrefs}
              onAssistToggle={handleAssistToggle}
              onChorusToggle={handleChorusToggle}
              chorus={chorus}
              onChorusDismiss={() => setLastContributed(null)}
              loneIds={loneIds}
            >
              {/* Keyed on the listening boundary so the mode remounts when it is crossed.
                  Every mode that asks for a prompt asks once, on mount, so without this the
                  handoff would not arrive until somebody happened to press refresh — the room
                  would be told generation was back while still reading a fixed question. */}
              <Fragment key={listening ? "listening" : "live"}>{renderActiveMode()}</Fragment>
            </Workspace>
          );
        }

        return (
          <IntakeForm
            onStartSession={handleStartSession}
            pastSessions={sessions}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
            viewerName={viewer?.name}
            engagements={engagements}
            onCreateEngagement={viewer ? handleCreateEngagement : undefined}
            onJoinEngagement={viewer ? handleJoinEngagement : undefined}
          />
        );
      })()}

      <button
        onClick={() => setBoardOpen((open) => !open)}
        aria-label="Instance status"
        title="What this instance is wired to"
        className="fixed bottom-4 left-4 z-40 w-11 h-11 bg-white border-3 border-black shadow-hard-4 flex items-center justify-center cursor-pointer hover:-translate-y-0.5 transition-transform"
      >
        <Cpu className="w-5 h-5" />
      </button>

      <button
        onClick={handleThemeCycle}
        aria-label={THEME_LABEL[themeChoice]}
        title={`${THEME_LABEL[themeChoice]} — click to change`}
        className="fixed bottom-4 left-[68px] z-40 w-11 h-11 bg-white border-3 border-black shadow-hard-4 flex items-center justify-center cursor-pointer hover:-translate-y-0.5 transition-transform"
      >
        {themeChoice === "system" ? (
          <Monitor className="w-5 h-5" />
        ) : themeChoice === "light" ? (
          <Sun className="w-5 h-5" />
        ) : (
          <Moon className="w-5 h-5" />
        )}
      </button>

      {boardOpen &&
        (boardExpanded ? (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-5xl border-3 border-black shadow-hard-8 my-6">
              <StatusBoard
                status={instanceStatus}
                stats={boardStats}
                lastAnswer={currentAnswer}
                prefs={boardPrefs}
                onPrefsChange={handleBoardPrefs}
                settingsOpen={boardSettingsOpen}
                onSettingsToggle={() => setBoardSettingsOpen((open) => !open)}
                onClose={() => setBoardExpanded(false)}
              />
            </div>
          </div>
        ) : (
          <div className="fixed bottom-20 left-4 z-50">
            <StatusBoard
              variant="popup"
              status={instanceStatus}
              stats={boardStats}
              lastAnswer={currentAnswer}
              prefs={boardPrefs}
              onPrefsChange={handleBoardPrefs}
              settingsOpen={boardSettingsOpen}
              onSettingsToggle={() => setBoardSettingsOpen((open) => !open)}
              onExpand={() => setBoardExpanded(true)}
              onClose={() => setBoardOpen(false)}
            />
          </div>
        ))}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-butter border-3 border-black p-4 shadow-hard-4 flex items-center justify-between gap-4 max-w-sm">
          <p className="text-xs font-mono font-bold text-black">{toastMessage}</p>
          <button
            onClick={() => setToastMessage(null)}
            className="font-bold text-xs hover:text-red-500 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
