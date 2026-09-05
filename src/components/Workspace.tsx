import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Settings,
  Brain,
  ListFilter,
  CheckCircle,
  HelpCircle,
  Trash2,
  Edit2,
  Layers,
  Sparkles,
  RefreshCw,
  Plus,
  BookOpen,
  Mic,
  MicOff,
  Waves,
} from "lucide-react";
import { Session, Thought, ExtractionMode } from "../types";
import ChorusCard from "./ChorusCard";
import type { Echo } from "../utils/chorus";

interface WorkspaceProps {
  session: Session;
  onUpdateSession: (updates: Partial<Session>) => void;
  /** Explicit, so a deletion is never inferred from a shrinking thoughts array. */
  onDeleteThought: (id: string) => void;
  /**
   * The one funnel every new fragment goes through, including the scratch note below.
   *
   * The scratch note used to compose its own `Thought` and hand it back inside a whole-session
   * update, which was a second copy of the parent's construction — and a second place a
   * fragment could enter the pile without the parent knowing one had.
   */
  onAddThought: (text: string) => void;
  onExit: () => void;
  onSynthesize: () => void;
  /** Lets the parent pause polling while a fragment is being edited. */
  onEditingChange?: (editing: boolean) => void;
  /** The signed-in contributor, when this session is an engagement. */
  viewerEmail?: string;
  /** False when the AI proxy is unreachable and every mode is serving canned prompts. */
  aiEnabled?: boolean;
  /** Per viewer; see src/utils/chorusPrefs.ts for why it is not a fact about the room. */
  chorusEnabled?: boolean;
  onChorusToggle?: () => void;
  /**
   * What the pile answered to the fragment this viewer just contributed, and which fragment
   * it answered about. The key is carried because the echo is recomputed on every poll —
   * without it there is no way to tell "the room moved" from "this person just contributed",
   * and the pane would jump under a reader every fifteen seconds.
   */
  chorus?: { key: string; echo: Echo } | null;
  onChorusDismiss?: () => void;
  /** Fragments nothing else in the pile echoes. Drives the pile filter, not a claim on a card. */
  loneIds?: string[];
  children: React.ReactNode;
}

/**
 * The card for every extraction mode: its name, its one-line description, and its fill.
 *
 * Keyed on `ExtractionMode` rather than listed as an array for the reason `EMPTY_MODE_PROGRESS`
 * is: a mode added to the union and forgotten here is then a `npm run lint` failure rather than
 * a mode with no way into it. Declaration order is the order of the cards and of the pile
 * filter derived from them.
 */
const MODE_CARDS: Record<ExtractionMode, { label: string; desc: string; color: string }> = {
  free_stream: {
    label: "Free Stream",
    desc: "No prompts, unfiltered typing",
    color: "from-amber-400 to-orange-500",
  },
  quick_fire: {
    label: "Quick Fire",
    desc: "Speed questions, brief answers",
    color: "from-red-500 to-pink-500",
  },
  guided_drill: {
    label: "Guided Drill",
    desc: "Adaptive expert interview",
    color: "from-blue-500 to-indigo-600",
  },
  binary_frame: {
    label: "Binary Bracket",
    desc: "Choose contrasting framings",
    color: "from-emerald-500 to-teal-600",
  },
  swipe: {
    label: "Swipe Statements",
    desc: "Mark statements that resonate",
    color: "from-purple-500 to-indigo-500",
  },
  slider: {
    label: "Intensity Map",
    desc: "Rate importance & urgency levels",
    color: "from-indigo-500 to-purple-600",
  },
  card_sort: {
    label: "Cluster Sorting",
    desc: "Sort thoughts into folders",
    color: "from-teal-400 to-cyan-500",
  },
  timeline: {
    label: "Temporal Map",
    desc: "Organize past, present & futures",
    color: "from-rose-400 to-red-500",
  },
  sentence_completion: {
    label: "Sentence Starters",
    desc: "Uncover blocked views",
    color: "from-violet-500 to-fuchsia-600",
  },
  devils_advocate: {
    label: "Advocate Shock",
    desc: "Deconstruct your defense",
    color: "from-amber-600 to-red-700",
  },
  letter_writing: {
    label: "Letter Drill",
    desc: "Address the deep feelings",
    color: "from-orange-400 to-amber-600",
  },
  priority_pile: {
    label: "Priority Eisenhower",
    desc: "Group urgent decision variables",
    color: "from-teal-600 to-emerald-700",
  },
};

const modesList = (Object.keys(MODE_CARDS) as ExtractionMode[]).map((mode) => ({
  mode,
  ...MODE_CARDS[mode],
}));

export default function Workspace({
  session,
  onUpdateSession,
  onDeleteThought,
  onAddThought,
  onExit,
  onSynthesize,
  onEditingChange,
  viewerEmail,
  aiEnabled = true,
  chorusEnabled = false,
  onChorusToggle,
  chorus,
  onChorusDismiss,
  loneIds,
  children,
}: WorkspaceProps) {
  const [editingThoughtId, setEditingThoughtId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [filterTags, setFilterTags] = useState<ExtractionMode | "all">("all");
  const [newThoughtText, setNewThoughtText] = useState("");
  const [showDirectInput, setShowDirectInput] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "action" | "insight" | "fear" | "goal" | "lone"
  >("all");

  const [isRecordingDirect, setIsRecordingDirect] = useState(false);
  const recognitionDirectRef = React.useRef<any>(null);
  const modePaneRef = React.useRef<HTMLElement>(null);

  // The echo is inserted above the mode, so with the pane scrolled at all it lands off the top
  // of it — which is the one way this feature can fail completely: computed, rendered, correct,
  // and never seen by the person it was computed for. Instant rather than smooth, because the
  // card animates in at the same moment and a smooth scroll loses the race against it.
  const chorusKey = chorus?.key;
  React.useEffect(() => {
    if (chorusKey) modePaneRef.current?.scrollTo({ top: 0 });
  }, [chorusKey]);

  // Initialize Speech Recognition for Scratch note
  React.useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setNewThoughtText((prev) => prev + (prev ? " " : "") + finalTranscript);
        }
      };

      rec.onerror = (event: any) => {
        console.error("Direct Speech recognition error:", event.error);
        setIsRecordingDirect(false);
      };

      rec.onend = () => {
        setIsRecordingDirect(false);
      };

      recognitionDirectRef.current = rec;
    }
  }, []);

  const toggleSpeechDirect = () => {
    if (!recognitionDirectRef.current) {
      alert(
        "Speech-to-text is not supported in this browser version or current container view. Please type.",
      );
      return;
    }

    if (isRecordingDirect) {
      recognitionDirectRef.current.stop();
      setIsRecordingDirect(false);
    } else {
      try {
        recognitionDirectRef.current.start();
        setIsRecordingDirect(true);
      } catch (e) {
        console.error("Failed to start speech recognition", e);
      }
    }
  };

  // Switch modes
  const handleModeSwitch = (mode: ExtractionMode) => {
    onUpdateSession({
      activeMode: mode,
      modeHistory: [...session.modeHistory, { mode, timestamp: new Date().toISOString() }],
    });
  };

  const handleStartEdit = (thought: Thought) => {
    setEditingThoughtId(thought.id);
    setEditText(thought.text);
    onEditingChange?.(true);
  };

  const handleSaveEdit = (id: string) => {
    onUpdateSession({
      thoughts: session.thoughts.map((t) => (t.id === id ? { ...t, text: editText } : t)),
    });
    setEditingThoughtId(null);
    onEditingChange?.(false);
  };

  /** A fragment is yours if you wrote it, or if the pile has no attribution at all (solo). */
  const isMine = (thought: Thought) => !thought.author || thought.author.email === viewerEmail;

  const initialsOf = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const handleAddDirectThought = () => {
    if (!newThoughtText.trim()) return;
    onAddThought(newThoughtText.trim());
    setNewThoughtText("");
    setShowDirectInput(false);
  };

  const matchesCategory = (text: string, cat: string): boolean => {
    if (cat === "all") return true;
    const lower = text.toLowerCase();
    if (cat === "action") {
      return (
        lower.includes("need to") ||
        lower.includes("do ") ||
        lower.includes("make") ||
        lower.includes("implement") ||
        lower.includes("set up") ||
        lower.includes("build") ||
        lower.includes("call") ||
        lower.includes("send") ||
        lower.includes("action") ||
        lower.includes("checklist")
      );
    }
    if (cat === "insight") {
      return (
        lower.includes("realize") ||
        lower.includes("why") ||
        lower.includes("because") ||
        lower.includes("concept") ||
        lower.includes("idea") ||
        lower.includes("learn") ||
        lower.includes("understand") ||
        lower.includes("insight")
      );
    }
    if (cat === "fear") {
      return (
        lower.includes("afraid") ||
        lower.includes("fear") ||
        lower.includes("scared") ||
        lower.includes("worry") ||
        lower.includes("risk") ||
        lower.includes("doubt") ||
        lower.includes("hesitat") ||
        lower.includes("stuck") ||
        lower.includes("friction") ||
        lower.includes("challenge") ||
        lower.includes("socratic") ||
        lower.includes("provocative")
      );
    }
    if (cat === "goal") {
      return (
        lower.includes("goal") ||
        lower.includes("target") ||
        lower.includes("objective") ||
        lower.includes("achieve") ||
        lower.includes("milestone") ||
        lower.includes("outcome") ||
        lower.includes("aim") ||
        lower.includes("value") ||
        lower.includes("future")
      );
    }
    return true;
  };

  // Ids rather than a predicate over the text: whether a fragment stands alone is a fact
  // about the whole pile, not about the fragment, so it cannot be decided one card at a time
  // the way the keyword categories above are.
  const loneSet = useMemo(() => new Set(loneIds ?? []), [loneIds]);
  const loneCount = loneIds?.length ?? 0;
  const showLoneFilter = chorusEnabled && loneCount > 0;

  // A filter pinned to a category that has stopped existing hides the whole pile with no
  // explanation, and "lone" is the one that can vanish under a viewer: somebody echoing the
  // last isolated fragment is precisely the event this is watching for, and turning Chorus off
  // removes the category outright. Resolved once, above the filter and the chips both, because
  // resolving it for the chips alone is what emptied the pile the first time.
  const activeCategory = selectedCategory === "lone" && !showLoneFilter ? "all" : selectedCategory;

  const filteredThoughts = session.thoughts.filter((t) => {
    const matchesTag = filterTags === "all" || t.mode === filterTags;
    const matchesSearch =
      t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.mode && t.mode.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat =
      activeCategory === "lone" ? loneSet.has(t.id) : matchesCategory(t.text, activeCategory);
    return matchesTag && matchesSearch && matchesCat;
  });

  return (
    <div
      className="flex flex-col h-[calc(100vh-10px)] max-h-[1400px] overflow-hidden bg-[#F8F7F4] font-sans"
      id="workspace-root"
    >
      {/* Dynamic Session Sticky Header Banner */}
      <header className="bg-white border-b-3 border-black px-6 py-4 shrink-0 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            onClick={onExit}
            className="p-2 border-2 border-black bg-white hover:bg-zinc-50 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
            title="Return to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-black uppercase text-black font-display tracking-tight truncate">
              {session.topic}
            </h2>
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">
              Intention:{" "}
              <strong className="text-black font-semibold font-serif italic">
                {session.intention}
              </strong>
            </p>
          </div>
        </div>

        {/* Action button header */}
        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
          <button
            onClick={onChorusToggle}
            aria-pressed={chorusEnabled}
            title={
              chorusEnabled
                ? "Chorus is on: after you contribute, the pile shows who else is near you"
                : "Chorus is off: the pile stays silent when you contribute"
            }
            className={`px-3.5 py-1.5 border-2 border-black text-xs font-bold font-display uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all ${
              chorusEnabled
                ? "bg-[#D0EBFF] text-black hover:bg-[#A5D8FF]"
                : "bg-white text-zinc-400 hover:bg-zinc-50"
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            Chorus
          </button>

          <button
            onClick={() => setShowDirectInput((prev) => !prev)}
            className="px-3.5 py-1.5 border-2 border-black bg-white hover:bg-zinc-50 text-black text-xs font-bold font-display uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Scratch Note
          </button>

          <button
            onClick={onSynthesize}
            className="px-4 py-2 border-2 border-black bg-black text-white hover:bg-[#F8F7F4] hover:text-black text-xs font-black font-display uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Finish & Organize Outline
          </button>
        </div>
      </header>

      {/* Direct Thought Intake Modal-bar */}
      <AnimatePresence>
        {showDirectInput && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-zinc-50 border-b-2 border-black p-3.5 flex items-center gap-2.5 shrink-0"
          >
            <input
              type="text"
              placeholder="Jot down a quick thought fragment instantly or record..."
              value={newThoughtText}
              onChange={(e) => setNewThoughtText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDirectThought()}
              className="flex-1 text-xs border-2 border-black px-3 py-2 bg-white focus:outline-none font-mono text-black"
            />
            {/* Direct voice input */}
            <button
              onClick={toggleSpeechDirect}
              type="button"
              className={`px-3 py-2 border-2 border-black flex items-center justify-center cursor-pointer transition-all ${
                isRecordingDirect
                  ? "bg-red-500 text-white animate-pulse"
                  : "bg-white hover:bg-zinc-100 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
              }`}
              title="Record scratch note"
            >
              {isRecordingDirect ? (
                <MicOff className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={handleAddDirectThought}
              className="px-4 py-2 border-2 border-black bg-black text-white hover:bg-white hover:text-black font-display font-bold text-xs uppercase cursor-pointer transition-all"
            >
              Add
            </button>
            <button
              onClick={() => setShowDirectInput(false)}
              className="text-xs uppercase font-bold tracking-wider font-display text-zinc-500 hover:text-black px-1"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Selector Horizontal Scrollable Tape */}
      <div className="bg-zinc-100 border-b-2 border-black px-6 py-3 shrink-0 overflow-x-auto flex items-center gap-2 custom-scrollbar">
        <span className="text-[10px] font-bold text-black uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1 font-display">
          <Layers className="w-3.5 h-3.5" />
          Jump Mode:
        </span>
        {modesList.map((m) => {
          const isActive = session.activeMode === m.mode;
          return (
            <button
              key={m.mode}
              onClick={() => handleModeSwitch(m.mode)}
              title={m.desc}
              className={`px-3 py-1.5 border-2 border-black whitespace-nowrap cursor-pointer transition flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
                isActive ? "bg-black text-white" : "bg-white text-black hover:bg-zinc-50"
              }`}
            >
              <div className={`w-2 h-2 rounded-full bg-linear-to-r ${m.color}`} />
              {m.label}
              {session.thoughts.filter((t) => t.mode === m.mode).length > 0 && (
                <span className="ml-1 text-[8px] bg-yellow-300 text-black px-1 leading-none rounded-none border border-black font-mono">
                  {session.thoughts.filter((t) => t.mode === m.mode).length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Split Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main Mode Interactive Playground area */}
        <main
          ref={modePaneRef}
          className="flex-1 p-6 overflow-y-auto bg-[#F8F7F4] flex flex-col justify-between"
        >
          {/* Degradation has to be visible. Without this the modes quietly serve generic
              canned prompts, which in a paid workshop is worse than an outright error. */}
          {!aiEnabled && (
            <div className="max-w-3xl mx-auto w-full mb-4 border-3 border-black bg-[#FFD5CC] p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-black">
                AI is unavailable
              </p>
              <p className="text-[11px] text-zinc-800 font-sans mt-0.5">
                Prompts are falling back to a fixed list and are not tailored to this topic. Check
                the Gemini configuration before running a session that matters.
              </p>
            </div>
          )}
          {/* Deliberately after the fragment is committed rather than while it is being
              written: shown to somebody mid-sentence this would be an anchoring machine, and
              the independence of what each person contributes is the whole point of a pile
              twelve people write into at once. */}
          {chorusEnabled && chorus && (
            <div className="max-w-3xl mx-auto w-full">
              <ChorusCard echo={chorus.echo} onDismiss={() => onChorusDismiss?.()} />
            </div>
          )}
          <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col justify-center">
            {children}
          </div>
        </main>

        {/* Surfaced Thoughts Sidebar (Real-time pile) */}
        <aside className="w-80 md:w-96 border-l-3 border-black bg-white flex flex-col h-full overflow-hidden shrink-0">
          {/* Sidebar title */}
          <div className="p-4 border-b-2 border-black bg-zinc-50 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="px-2.5 py-1 bg-black text-white text-xs font-mono font-black border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] animate-pulse">
                  {filteredThoughts.length}
                </div>
                <h3 className="text-xs font-black text-black font-display uppercase tracking-wider">
                  Surfaced Pile
                </h3>
              </div>

              {/* Filter tags config */}
              <div className="flex items-center gap-1.5">
                <ListFilter className="w-3.5 h-3.5 text-black" />
                <select
                  value={filterTags}
                  onChange={(e) => setFilterTags(e.target.value as any)}
                  className="text-[10px] bg-white border-2 border-black font-display font-bold uppercase tracking-wider text-black focus:ring-0 outline-none px-2 py-0.5"
                >
                  {/* Derived from modesList so the filter cannot name a mode differently
                      from the card that launches it — which it already did: binary_frame
                      was "Binary Bracket" on the card and "Binary Frame" here. */}
                  <option value="all">All Modes</option>
                  {modesList.map(({ mode, label }) => (
                    <option key={mode} value={mode}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Omni-search Input Field */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search text or mode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-[10px] font-mono p-1.5 pl-2.5 border-2 border-black bg-white focus:outline-none focus:bg-amber-50/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold hover:text-black text-zinc-400"
                >
                  ×
                </button>
              )}
            </div>

            {/* Dynamic Conceptual Auto-Tag Filtration Row */}
            <div className="flex flex-wrap gap-1">
              {[
                { label: "All", id: "all", activeStyle: "bg-black text-white border-black" },
                {
                  label: "⚡ Actions",
                  id: "action",
                  activeStyle: "bg-[#FF6B6B] text-black border-black",
                },
                {
                  label: "💡 Insights",
                  id: "insight",
                  activeStyle: "bg-[#4DABF7] text-black border-black",
                },
                {
                  label: "⚠️ Fears",
                  id: "fear",
                  activeStyle: "bg-[#FFD43B] text-black border-black",
                },
                {
                  label: "🎯 Goals",
                  id: "goal",
                  activeStyle: "bg-[#51CF66] text-black border-black",
                },
                // Black rather than a pastel, for the reason a dark coverage cell is black:
                // a fragment nobody echoed is a finding, not something that went wrong.
                ...(showLoneFilter
                  ? [
                      {
                        label: `🔇 Lone ${loneCount}`,
                        id: "lone",
                        activeStyle: "bg-black text-white border-black",
                      },
                    ]
                  : []),
              ].map((cat) => {
                const isSelected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id as any)}
                    className={`text-[9px] font-mono uppercase tracking-tight font-extrabold px-1.5 py-0.5 border-2 border-black transition cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                      isSelected
                        ? `${cat.activeStyle} shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] font-black`
                        : "bg-white hover:bg-zinc-50 text-black"
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Pile scroll content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F8F7F4] custom-scrollbar">
            {filteredThoughts.length === 0 ? (
              <div className="text-center py-24 text-zinc-400 border-2 border-dashed border-zinc-300 p-4">
                <Brain className="w-10 h-10 mx-auto opacity-50 stroke-1 mb-2 text-black" />
                <p className="text-xs font-bold uppercase font-display text-black">
                  Pile is empty.
                </p>
                <p className="text-[10px] text-zinc-500 mt-1">
                  Start answering prompts or type in Free Stream mode to stockpile concepts.
                </p>
              </div>
            ) : (
              filteredThoughts.map((thought, idx) => {
                const thoughtColorClass =
                  modesList.find((m) => m.mode === thought.mode)?.color ||
                  "from-slate-400 to-slate-500";

                return (
                  <motion.div
                    key={thought.id}
                    layoutId={`thought-${thought.id}`}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-3.5 bg-white border-2 border-black hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all relative group"
                  >
                    {/* Header bar metadata. Attributed fragments lead with the contributor;
                        solo fragments render exactly as they always have. */}
                    {thought.author ? (
                      <div className="flex justify-between items-start shrink-0 mb-2 gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-[22px] h-[22px] shrink-0 border-2 border-black bg-[#FFF3BF] flex items-center justify-center text-[9px] font-extrabold font-mono text-black"
                            title={thought.author.email}
                          >
                            {initialsOf(thought.author.name)}
                          </span>
                          <span className="min-w-0 leading-tight">
                            <span className="block text-[10px] font-bold text-black truncate">
                              {thought.author.name}
                            </span>
                            <span className="block text-[8px] uppercase tracking-wider font-mono text-zinc-500 truncate">
                              {thought.author.role}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0 text-[9px] text-zinc-400 font-mono">
                          <div
                            className={`w-1.5 h-1.5 rounded-full bg-linear-to-r ${thoughtColorClass}`}
                            title={thought.mode.replaceAll("_", " ")}
                          />
                          #
                          {session.thoughts.length -
                            session.thoughts.findIndex((t) => t.id === thought.id)}
                        </span>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center shrink-0 mb-2">
                        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-extrabold text-black font-mono">
                          <div
                            className={`w-1.5 h-1.5 rounded-full bg-linear-to-r ${thoughtColorClass}`}
                          />
                          {thought.mode.replaceAll("_", " ")}
                        </span>
                        <span className="text-[9px] text-zinc-400 font-mono">
                          #
                          {session.thoughts.length -
                            session.thoughts.findIndex((t) => t.id === thought.id)}
                        </span>
                      </div>
                    )}

                    {/* Thought Content Body */}
                    {editingThoughtId === thought.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full text-xs p-1.5 border-2 border-black focus:outline-none text-black font-mono"
                        />
                        <div className="flex justify-end gap-1.5 text-[10px]">
                          <button
                            onClick={() => setEditingThoughtId(null)}
                            className="text-zinc-500 hover:text-black font-display uppercase font-bold tracking-wider px-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(thought.id)}
                            className="bg-black border border-black hover:bg-white hover:text-black text-white px-2 py-0.5 font-bold uppercase font-display cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-zinc-800 leading-normal font-sans whitespace-pre-wrap">
                          {thought.text}
                        </p>

                        {/* Display extra parameters based on tagging status */}
                        {thought.swipeStatus && (
                          <div className="mt-2 inline-flex items-center gap-1 bg-black text-white px-2 py-0.5 text-[8px] font-mono tracking-widest uppercase">
                            STATUS:{" "}
                            {thought.swipeStatus === "like"
                              ? "RESONANT"
                              : thought.swipeStatus === "dislike"
                                ? "REJECTED"
                                : "MAYBE"}
                          </div>
                        )}

                        {thought.intensity && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {Object.entries(thought.intensity).map(([k, v]) => (
                              <span
                                key={k}
                                className="border border-black bg-zinc-50 text-black px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold"
                              >
                                {k}: {v}/10
                              </span>
                            ))}
                          </div>
                        )}

                        {thought.clusterCategory && (
                          <div className="mt-2 inline-flex items-center gap-1 border border-black bg-[#EFEFEF] px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold">
                            CLUSTER: {thought.clusterCategory}
                          </div>
                        )}

                        {thought.timelineZone && (
                          <div className="mt-2 inline-flex items-center gap-1 border border-black bg-orange-50 px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold">
                            TIMELINE: {thought.timelineZone}
                          </div>
                        )}

                        {thought.priorityZone && (
                          <div className="mt-2 inline-flex items-center gap-1 border border-black bg-zinc-100 px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold">
                            PRIORITY:{" "}
                            {thought.priorityZone === "act"
                              ? "ACT NOW"
                              : thought.priorityZone === "watch"
                                ? "WATCH"
                                : "PASS"}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operational edit overlay on hover. Nobody rewrites anyone else's
                        words; the same rule is enforced server-side. */}
                    {isMine(thought) && (
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center bg-white border border-black rounded-none shadow-sm gap-1 shrink-0 px-1 py-0.5">
                        <button
                          onClick={() => handleStartEdit(thought)}
                          className="p-1 hover:text-black text-zinc-400 hover:bg-zinc-50 cursor-pointer"
                          title="Edit thought"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteThought(thought.id)}
                          className="p-1 hover:text-black text-zinc-400 hover:bg-zinc-50 cursor-pointer"
                          title="Delete thought"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Quick guide bottom block */}
          <div className="p-4 bg-zinc-100 border-t-2 border-black shrink-0 text-center font-mono">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
              Gather 5+ thoughts for optimal summary output.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
