import { useState, useEffect } from "react";
import { loadSessions, persistSession, deleteSession } from "./utils/localDB";
import { Session, Thought, ExtractionMode } from "./types";

// Intake/Shell layouts
import IntakeForm from "./components/IntakeForm";
import Workspace from "./components/Workspace";
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

const VALID_MODES: ExtractionMode[] = [
  'free_stream', 'quick_fire', 'guided_drill', 'binary_frame', 'swipe', 'slider',
  'card_sort', 'timeline', 'sentence_completion', 'devils_advocate', 'letter_writing', 'priority_pile'
];

function validateAndSanitizeSnapshot(data: any): Session | null {
  if (!data || typeof data !== "object") return null;

  const id = typeof data.id === "string" && data.id ? data.id : crypto.randomUUID();
  const topic = typeof data.topic === "string" ? data.topic.slice(0, 500) : "Imported Session";
  const intention = typeof data.intention === "string" ? data.intention.slice(0, 500) : "Unclutter scatter";
  const isCustomIntention = typeof data.isCustomIntention === "boolean" ? data.isCustomIntention : false;

  let status: Session['status'] = "active";
  if (["intake", "intention", "recommendation", "active", "review", "exported"].includes(data.status)) {
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
        let mode: Thought['mode'] = "free_stream";
        if (VALID_MODES.includes(t.mode) || t.mode === 'system') {
          mode = t.mode;
        }
        const thought: Thought = {
          id: typeof t.id === "string" && t.id ? t.id : crypto.randomUUID(),
          text: t.text.slice(0, 5000),
          timestamp: typeof t.timestamp === "string" && !isNaN(Date.parse(t.timestamp)) ? t.timestamp : new Date().toISOString(),
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
              thought.intensity[key as keyof Thought['intensity']] = val;
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

  const modeProgress: Record<ExtractionMode, number> = {
    free_stream: 0, quick_fire: 0, guided_drill: 0, binary_frame: 0, swipe: 0, slider: 0,
    card_sort: 0, timeline: 0, sentence_completion: 0, devils_advocate: 0, letter_writing: 0, priority_pile: 0
  };
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
          timestamp: typeof mh.timestamp === "string" && !isNaN(Date.parse(mh.timestamp)) ? mh.timestamp : new Date().toISOString()
        });
      }
    }
  }
  if (modeHistory.length === 0) {
    modeHistory.push({ mode: activeMode, timestamp: new Date().toISOString() });
  }

  let warmupAnswers: Session['warmupAnswers'] = undefined;
  if (data.warmupAnswers && typeof data.warmupAnswers === "object") {
    warmupAnswers = {
      clarity: ["clear", "foggy", ""].includes(data.warmupAnswers.clarity) ? data.warmupAnswers.clarity : "",
      nature: ["emotional", "analytical", ""].includes(data.warmupAnswers.nature) ? data.warmupAnswers.nature : "",
      timeAvailable: ["<5", ">20", ""].includes(data.warmupAnswers.timeAvailable) ? data.warmupAnswers.timeAvailable : "",
      intentType: ["decide", "process", "capture", ""].includes(data.warmupAnswers.intentType) ? data.warmupAnswers.intentType : ""
    };
  }

  let advancedSettings: Session['advancedSettings'] = undefined;
  if (data.advancedSettings && typeof data.advancedSettings === "object") {
    advancedSettings = {
      promptingStyle: ["standard", "socratic", "empathetic"].includes(data.advancedSettings.promptingStyle) ? data.advancedSettings.promptingStyle : "standard",
      outputFilter: ["comprehensive", "actions", "roadmap"].includes(data.advancedSettings.outputFilter) ? data.advancedSettings.outputFilter : "comprehensive",
      cognitiveBiasAudit: ["include", "exclude"].includes(data.advancedSettings.cognitiveBiasAudit) ? data.advancedSettings.cognitiveBiasAudit : "exclude"
    };
  }

  const createdAt = typeof data.createdAt === "string" && !isNaN(Date.parse(data.createdAt)) ? data.createdAt : new Date().toISOString();
  const updatedAt = typeof data.updatedAt === "string" && !isNaN(Date.parse(data.updatedAt)) ? data.updatedAt : new Date().toISOString();

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

  if (warmupAnswers) session.warmupAnswers = warmupAnswers;
  if (advancedSettings) session.advancedSettings = advancedSettings;
  if (typeof data.synthesizedOutline === "string") session.synthesizedOutline = data.synthesizedOutline;
  if (typeof data.synthesizedSummary === "string") session.synthesizedSummary = data.synthesizedSummary;
  if (Array.isArray(data.synthesizedActionItems)) {
    session.synthesizedActionItems = data.synthesizedActionItems.filter(item => typeof item === "string");
  }

  return session;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 5000);
  };

  // Manage initial load and search parameter decoder snapshot
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);

    // Decode base64 snapshot if loaded
    const params = new URLSearchParams(window.location.search);
    const snapshot = params.get("snapshot");
    if (snapshot) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(snapshot)));
        const validated = validateAndSanitizeSnapshot(decoded);
        if (validated) {
          // Open as currently active session
          setCurrentSession(validated);
          showToast("Successfully imported shared session snapshot! View results or click back to dashboard to start a new one.");
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
      activeMode: sessionData.activeMode || "free_stream",
      thoughts: [],
      modeProgress: {
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
      },
      modeHistory: [{ mode: sessionData.activeMode || "free_stream", timestamp: new Date().toISOString() }],
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
    const updated = { ...currentSession, ...updates, updatedAt: new Date().toISOString() };
    setCurrentSession(updated);
    persistSession(updated);

    // Keep state updated in parent list
    setSessions(loadSessions());
  };

  const handleLoadSession = (id: string) => {
    const match = sessions.find((s) => s.id === id);
    if (match) {
      setCurrentSession(match);
    }
  };

  const handleDeleteSession = (id: string) => {
    if (window.confirm("Are you sure you want to delete this session permanently? This is non-reversible.")) {
      deleteSession(id);
      setSessions(loadSessions());
      if (currentSession?.id === id) {
        setCurrentSession(null);
      }
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
    };

    handleUpdateSession({
      thoughts: [newThought, ...currentSession.thoughts],
    });
  };

  const handleUpdateThoughtCluster = (id: string, category: string) => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) => (t.id === id ? { ...t, clusterCategory: category } : t)),
    });
  };

  const handleUpdateThoughtTimeline = (id: string, zone: "before" | "now" | "after") => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) => (t.id === id ? { ...t, timelineZone: zone } : t)),
    });
  };

  const handleUpdateThoughtPriority = (id: string, zone: "act" | "watch" | "discard") => {
    if (!currentSession) return;
    handleUpdateSession({
      thoughts: currentSession.thoughts.map((t) => (t.id === id ? { ...t, priorityZone: zone } : t)),
    });
  };

  const handleUpdateThoughtIntensity = (id: string, intensity: NonNullable<Thought["intensity"]>) => {
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

  const renderActiveMode = () => {
    if (!currentSession) return null;

    switch (currentSession.activeMode) {
      case "free_stream":
        return <FreeStream topic={currentSession.topic} onAddThought={(txt) => handleAddThought(txt)} />;
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
      default:
        return (
          <div className="text-center py-12 text-slate-400 text-xs">
            Unimplemented Mode: {currentSession.activeMode}
          </div>
        );
    }
  };

  return (
    <>
      {(() => {
        if (currentSession && (currentSession.status === "review" || currentSession.status === "exported")) {
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
              onExit={handleExitSession}
              onSynthesize={handleLaunchReview}
            >
              {renderActiveMode()}
            </Workspace>
          );
        }

        return (
          <IntakeForm
            onStartSession={handleStartSession}
            pastSessions={sessions}
            onLoadSession={handleLoadSession}
            onDeleteSession={handleDeleteSession}
          />
        );
      })()}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#FFF3BF] border-3 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center justify-between gap-4 max-w-sm">
          <p className="text-xs font-mono font-bold text-black">{toastMessage}</p>
          <button onClick={() => setToastMessage(null)} className="font-bold text-xs hover:text-red-500 cursor-pointer">×</button>
        </div>
      )}
    </>
  );
}
