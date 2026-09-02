import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Brain,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Gauge,
  Clipboard,
  Smile,
  ChevronRight,
  Trash2,
  FolderOpen,
  Briefcase,
  Home,
  Users,
  Laptop,
  Coins,
  ClipboardList,
} from "lucide-react";
import { Session, ExtractionMode } from "../types";
import type { EngagementSummary } from "../utils/engagementAPI";
import CompareSettingsModal from "./CompareSettingsModal";

interface IntakeFormProps {
  onStartSession: (session: Partial<Session>) => void;
  pastSessions: Session[];
  onLoadSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  /** Group mode below is rendered only when the server established an identity. */
  viewerName?: string;
  engagements?: EngagementSummary[];
  onCreateEngagement?: (input: { topic: string; intention?: string }) => void;
  onJoinEngagement?: (id: string) => void;
}

const PRESET_GROUPS = [
  {
    name: "Work",
    icon: Briefcase,
    color: "bg-[#FFE8CC]", // light orange
    starters: [
      "Evaluating a career pivot from corporate to freelancing, balancing risk against passion...",
      "Addressing team friction after a conflict regarding project scope and deadlines...",
      "Structuring my daily agenda to avoid burnout on heavy delivery weeks...",
    ],
  },
  {
    name: "Home",
    icon: Home,
    color: "bg-[#E4F7FB]", // light cyan
    starters: [
      "Planning a major room renovation or physical reorganization for my workspace...",
      "Establishing clear boundaries between personal work-from-home hours and domestic life...",
      "Managing household task distribution and chore schedules for the family...",
    ],
  },
  {
    name: "Family",
    icon: Users,
    color: "bg-[#FFF0F6]", // light pink
    starters: [
      "Preparing for a difficult, direct conversation with my sibling/parent about boundaries...",
      "Balancing familial obligations with my personal goals and ambition to build a business...",
      "Resolving a recurring misunderstanding regarding family communication patterns...",
    ],
  },
  {
    name: "Tech",
    icon: Laptop,
    color: "bg-[#E8F0FE]", // light blue
    starters: [
      "Selecting the right coding stack, databases, and hosting options for my new web app...",
      "Architecting a scalable database schema structure to support multi-tenant workspaces...",
      "Refactoring legacy code components to improve developer velocity and test reliability...",
    ],
  },
  {
    name: "Economics",
    icon: Coins,
    color: "bg-[#FEF7E0]", // light yellow
    starters: [
      "Weighing cost vs. utility before buying a major premium purchase like a new car...",
      "Formulating a personal savings buffer strategy to prepare for potential market downtime...",
      "Designing a freelance pricing structure and hourly market rate for consulting services...",
    ],
  },
  {
    name: "Project Planning",
    icon: ClipboardList,
    color: "bg-[#E6F4EA]", // light green
    starters: [
      "Fleshing out a roadmap, milestones, and timeline steps for our Q3 product launch...",
      "Conducting a project retrospective to catalog lessons learned from the team's sprint...",
      "Filing an LLC, registering tools, and launching an MVP catalog for my side project...",
    ],
  },
];

export default function IntakeForm({
  onStartSession,
  pastSessions,
  onLoadSession,
  onDeleteSession,
  viewerName,
  engagements = [],
  onCreateEngagement,
  onJoinEngagement,
}: IntakeFormProps) {
  const [topic, setTopic] = useState("");
  const [engagementTopic, setEngagementTopic] = useState("");
  const [intention, setIntention] = useState("");
  const [customIntention, setCustomIntention] = useState("");
  const [showRecommendationQuiz, setShowRecommendationQuiz] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareModalTab, setCompareModalTab] = useState<
    "framing" | "intention" | "tone" | "filter" | "bias" | "quiz"
  >("tone");
  const [activePresetGroup, setActivePresetGroup] = useState<string>("Work");

  // Warmup Quiz answers
  const [clarity, setClarity] = useState<"clear" | "foggy" | "">("");
  const [nature, setNature] = useState<"emotional" | "analytical" | "">("");
  const [timeAvailable, setTimeAvailable] = useState<"<5" | ">20" | "">("");
  const [intentType, setIntentType] = useState<"decide" | "process" | "capture" | "">("");

  // Advanced Settings
  const [promptingStyle, setPromptingStyle] = useState<"standard" | "socratic" | "empathetic">(
    "standard",
  );
  const [outputFilter, setOutputFilter] = useState<"comprehensive" | "actions" | "roadmap">(
    "comprehensive",
  );
  const [cognitiveBiasAudit, setCognitiveBiasAudit] = useState<"include" | "exclude">("exclude");

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  const [recommendationResult, setRecommendationResult] = useState<{
    recommendation: ExtractionMode;
    rationale: string;
    alternativeModes: ExtractionMode[];
    confidence: number;
  } | null>(null);

  const handleAppendKeyword = (tag: string) => {
    setTopic((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      if (trimmed.includes(tag)) return prev;
      if (trimmed.endsWith(",") || trimmed.endsWith(".") || trimmed.endsWith("!")) {
        return `${trimmed} ${tag}`;
      }
      return `${trimmed}, ${tag}`;
    });
  };

  const getQuickRecommendationLocally = (): {
    recommendation: ExtractionMode;
    rationale: string;
    alternativeModes: ExtractionMode[];
    confidence: number;
  } => {
    // Fallback recommendation logic matched from the Design Doc criteria
    const baseConfidence = 85 + (topic.trim().length % 13);
    if (clarity === "foggy") {
      if (nature === "emotional") {
        return {
          recommendation: "free_stream",
          rationale:
            "This mode is recommended because expressing foggy, emotional states works best without restrictive visual constraints or harsh structures first.",
          alternativeModes: ["sentence_completion", "letter_writing", "swipe"],
          confidence: Math.min(99, baseConfidence),
        };
      } else {
        return {
          recommendation: "quick_fire",
          rationale:
            "This mode is recommended because quick-fire prompts prompt instant reactions that can break analytical writer's block when you're feeling foggy.",
          alternativeModes: ["free_stream", "guided_drill", "sentence_completion"],
          confidence: Math.min(99, baseConfidence),
        };
      }
    } else {
      if (intentType === "decide") {
        return {
          recommendation: "binary_frame",
          rationale:
            "This mode is recommended because bracket/binary comparisons collapse diverging interpretations into a singular core value choice.",
          alternativeModes: ["priority_pile", "slider", "devils_advocate"],
          confidence: Math.min(99, baseConfidence),
        };
      } else if (nature === "emotional") {
        return {
          recommendation: "guided_drill",
          rationale:
            "This mode is recommended because structured adaptive questions carefully thread complex internal associations.",
          alternativeModes: ["letter_writing", "sentence_completion", "timeline"],
          confidence: Math.min(99, baseConfidence),
        };
      } else {
        return {
          recommendation: "guided_drill",
          rationale:
            "This mode is recommended because a thorough drill allows you to lay down deep analytical blueprints systematically.",
          alternativeModes: ["card_sort", "slider", "timeline"],
          confidence: Math.min(99, baseConfidence),
        };
      }
    }
  };

  const handleFetchRecommendation = async () => {
    setLoadingRecommendation(true);
    setRecommendationResult(null);

    const actualIntention = intention === "custom" ? customIntention : intention;

    try {
      const response = await fetch("/api/session/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          intention: actualIntention || "Unclutter scatter and organize core outline",
          clarity,
          nature,
          timeAvailable,
          intentType,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.recommendation) {
          setRecommendationResult(data);
        } else {
          setRecommendationResult(getQuickRecommendationLocally());
        }
      } else {
        setRecommendationResult(getQuickRecommendationLocally());
      }
    } catch (e) {
      console.error(e);
      setRecommendationResult(getQuickRecommendationLocally());
    } finally {
      setLoadingRecommendation(false);
    }
  };

  const handleLaunchWithMode = (mode: ExtractionMode) => {
    onStartSession({
      topic: topic || "Untitled Extraction Session",
      intention: intention === "custom" ? customIntention : intention || "Unclutter scatter",
      activeMode: mode,
      status: "active",
      warmupAnswers: {
        clarity,
        nature,
        timeAvailable,
        intentType,
      },
      advancedSettings: {
        promptingStyle,
        outputFilter,
        cognitiveBiasAudit,
      },
    });
  };

  const isFormValid = topic.trim().length > 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-12" id="intake-root">
      {/* Title block bento card with monospace tag and serif description */}
      <div className="bg-white border-3 border-black p-8 md:p-10 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] text-center relative overflow-hidden mb-8">
        <div className="absolute top-2 right-2 font-mono text-[9px] text-zinc-400 select-none">
          STRICT_ENG_BUILD_V1 // NO_TRANSLATIONS
        </div>
        <div className="inline-flex items-center justify-center bg-black text-white p-3.5 mb-4 border border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-black sm:text-5xl font-display uppercase">
          E X T R A C T I O N
        </h1>
        <p className="mt-3 text-sm md:text-base text-zinc-700 max-w-xl mx-auto font-serif italic">
          "Unburden, organize, and map out your thoughts. Let's move from scattered ideas to
          structural lists and outlines."
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Intake Block */}
        <div className="lg:col-span-2 space-y-8 bg-white border-3 border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <h2 className="text-base md:text-lg font-black text-black uppercase tracking-wider font-display flex items-center gap-2.5">
                <span className="bg-[#FF6B6B] text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] px-2.5 py-0.5 text-xs font-mono font-black">
                  01
                </span>
                What is this session about?
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCompareModalTab("framing");
                  setShowCompareModal(true);
                }}
                className="px-2.5 py-1 border border-black bg-white hover:bg-zinc-100 text-black text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                ℹ Framing Guide
              </button>
            </div>

            {/* Group Tabs */}
            <div className="flex border-b-2 border-black overflow-x-auto gap-1 mb-4 scrollbar-none">
              {PRESET_GROUPS.map((g) => {
                const Icon = g.icon;
                const isActive = activePresetGroup === g.name;
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setActivePresetGroup(g.name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border-2 border-b-0 border-black whitespace-nowrap cursor-pointer transition text-[10px] font-black uppercase tracking-wide ${
                      isActive
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-zinc-50 translate-y-[2px]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {g.name}
                  </button>
                );
              })}
            </div>

            {/* Active Group Prompt Starters */}
            {(() => {
              const activeGroup =
                PRESET_GROUPS.find((g) => g.name === activePresetGroup) || PRESET_GROUPS[0];
              const Icon = activeGroup.icon;
              return (
                <div
                  className={`border-2 border-black p-4 mb-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] ${activeGroup.color} transition-all duration-150`}
                >
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-black/10">
                    <Icon className="w-4 h-4 text-black shrink-0" />
                    <span className="font-black text-[10px] uppercase tracking-wide text-black">
                      {activeGroup.name} Starters (Click to load)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {activeGroup.starters.map((starter, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setTopic(starter);
                          if (activeGroup.name === "Work")
                            setIntention("Make a tough choice with clear priority action items");
                          if (activeGroup.name === "Home")
                            setIntention(
                              "Organize raw thoughts into a structured markdown outline",
                            );
                          if (activeGroup.name === "Family")
                            setIntention("Decompress deep mental fog and find emotional peace");
                          if (activeGroup.name === "Tech")
                            setIntention(
                              "Organize raw thoughts into a structured markdown outline",
                            );
                          if (activeGroup.name === "Economics")
                            setIntention("Make a tough choice with clear priority action items");
                          if (activeGroup.name === "Project Planning")
                            setIntention("Make a tough choice with clear priority action items");
                        }}
                        className="text-left bg-white hover:bg-zinc-50 border border-black p-3 text-[10px] font-sans text-zinc-700 leading-relaxed cursor-pointer transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] min-h-[60px] flex flex-col justify-center font-medium"
                        title={starter}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <textarea
              id="topic-input"
              rows={3}
              placeholder="e.g., Deciding on my product release plan, evaluating a hard conversation with my sibling, or putting together a side-project outline..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full text-xs md:text-sm border-2 border-black p-3 focus:outline-none focus:bg-white bg-zinc-50/50 hover:bg-white transition-all font-mono"
            />

            <div className="mt-3.5 bg-[#F8F9FA] border-2 border-black p-3.5 space-y-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <span className="font-bold text-[9px] uppercase font-mono tracking-wider text-zinc-550 block">
                ⚡ Quick context keywords (click to append to topic)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "⚡ Urgent", val: "(Urgent Deadline)" },
                  { label: "💰 Financials", val: "(Financial Block)" },
                  { label: "❤️ Exhaustion/Burnout", val: "(Exhaustion & Stress)" },
                  { label: "🤷 Highly Ambiguous", val: "(Highly Ambiguous/Unclear)" },
                  { label: "🤝 Relationship Friction", val: "(Relationship Friction)" },
                  { label: "🎯 Decision Needed", val: "(Decision Needed)" },
                  { label: "📋 Process Mapping", val: "(Process Outline Goal)" },
                  { label: "💼 Work/Career", val: "(Work/Career Domain)" },
                  { label: "🚀 Side Project", val: "(Side Project Outline)" },
                ].map((tag) => {
                  const isAlreadyIncluded = topic.includes(tag.val);
                  return (
                    <button
                      key={tag.val}
                      type="button"
                      onClick={() => handleAppendKeyword(tag.val)}
                      disabled={isAlreadyIncluded}
                      className={`px-2 py-1 border text-[9px] font-mono font-bold uppercase transition-all duration-100 ${
                        isAlreadyIncluded
                          ? "bg-zinc-200 text-zinc-400 border-zinc-300 cursor-not-allowed"
                          : "bg-white hover:bg-zinc-100 text-black border-black cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px]"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
              <h2 className="text-base md:text-lg font-black text-black uppercase tracking-wider font-display flex items-center gap-2.5">
                <span className="bg-[#4DABF7] text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] px-2.5 py-0.5 text-xs font-mono font-black">
                  02
                </span>
                What do you want to get out of this?
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCompareModalTab("intention");
                  setShowCompareModal(true);
                }}
                className="px-2.5 py-1 border border-black bg-white hover:bg-zinc-100 text-black text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                ℹ Compare Intentions
              </button>
            </div>
            <div className="space-y-2">
              {[
                {
                  label: "Organize raw thoughts into a structured markdown outline",
                  value: "Organize raw thoughts into a structured markdown outline",
                  colorClass: "bg-[#E8F0FE]",
                },
                {
                  label: "Make a tough choice with clear priority action items",
                  value: "Make a tough choice with clear priority action items",
                  colorClass: "bg-[#FFE8CC]",
                },
                {
                  label: "Decompress deep mental fog and find emotional peace",
                  value: "Decompress deep mental fog and find emotional peace",
                  colorClass: "bg-[#E6F4EA]",
                },
                {
                  label: "custom",
                  labelOverride: "Something else...",
                  value: "custom",
                  colorClass: "bg-zinc-100",
                },
              ].map((opt) => {
                const isSelected = intention === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 p-3 border-2 border-black cursor-pointer transition-all text-xs md:text-sm ${
                      isSelected
                        ? `${opt.colorClass} border-2 border-black text-black font-extrabold shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`
                        : "bg-white text-black hover:bg-zinc-50 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="intention"
                      checked={isSelected}
                      onChange={() => setIntention(opt.value)}
                      className="accent-black"
                    />
                    {opt.labelOverride || opt.label}
                  </label>
                );
              })}

              <AnimatePresence>
                {intention === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <input
                      type="text"
                      placeholder="My custom intention holds..."
                      value={customIntention}
                      onChange={(e) => setCustomIntention(e.target.value)}
                      className="w-full text-xs md:text-sm border-2 border-black px-3.5 py-2.5 bg-white focus:outline-none placeholder:text-zinc-400 font-mono"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Step 03. Advanced Synthesis Controls */}
          <div className="border-t-3 border-black pt-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
              <h2 className="text-base md:text-lg font-black text-black uppercase tracking-wider font-display flex items-center gap-2.5">
                <span className="bg-[#51CF66] text-black border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] px-2.5 py-0.5 text-xs font-mono font-black">
                  03
                </span>
                Advanced Synthesis Controls
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCompareModalTab("tone");
                  setShowCompareModal(true);
                }}
                className="px-2.5 py-1 border border-black bg-white hover:bg-zinc-100 text-black text-[9px] font-mono font-bold uppercase tracking-wider cursor-pointer shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                ℹ Compare Settings
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-5 font-sans leading-relaxed">
              Define the cognitive style of the extraction session and configure how the final
              synthesized outputs should filter or organize concepts.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Prompt style */}
              <div className="border-2 border-black p-4 bg-zinc-100/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-black font-mono">
                    03.1 // Prompting Tone
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareModalTab("tone");
                      setShowCompareModal(true);
                    }}
                    className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 hover:text-black transition-all hover:underline cursor-pointer"
                  >
                    [ℹ Compare]
                  </button>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      label: "Standard Guide",
                      value: "standard",
                      desc: "Balanced strategic coaching inquiries",
                    },
                    {
                      label: "Socratic Pressure",
                      value: "socratic",
                      desc: "Prickly, challenges core assumptions",
                    },
                    {
                      label: "Empathetic Vent",
                      value: "empathetic",
                      desc: "Gentle, non-judgmental holding space",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex flex-col p-2.5 border-2 border-black cursor-pointer transition-all duration-100 ${
                        promptingStyle === opt.value
                          ? "bg-[#FFE8CC] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
                          : "bg-white text-black hover:bg-zinc-50 border-black"
                      }`}
                    >
                      <div className="flex items-center gap-2 select-none">
                        <input
                          type="radio"
                          name="promptingStyle"
                          checked={promptingStyle === opt.value}
                          onChange={() => setPromptingStyle(opt.value as any)}
                          className="accent-black mr-1"
                        />
                        <span className="text-xs font-black uppercase tracking-tight text-black">
                          {opt.label}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] mt-1.5 leading-tight font-serif ${promptingStyle === opt.value ? "text-zinc-700 font-semibold italic" : "text-zinc-500"}`}
                      >
                        {opt.desc}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Output format filter */}
              <div className="border-2 border-black p-4 bg-zinc-100/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-black font-mono">
                    03.2 // Output Filtering
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareModalTab("filter");
                      setShowCompareModal(true);
                    }}
                    className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 hover:text-black transition-all hover:underline cursor-pointer"
                  >
                    [ℹ Compare]
                  </button>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      label: "Full Blueprint",
                      value: "comprehensive",
                      desc: "Recap summary, outline & steps",
                    },
                    {
                      label: "Action lists Only",
                      value: "actions",
                      desc: "Exclude summaries, checklist-only",
                    },
                    {
                      label: "Milestones Only",
                      value: "roadmap",
                      desc: "Exclude mini steps, strategic themes only",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex flex-col p-2.5 border-2 border-black cursor-pointer transition-all duration-100 ${
                        outputFilter === opt.value
                          ? "bg-[#D2E3FC] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
                          : "bg-white text-black hover:bg-zinc-50 border-black"
                      }`}
                    >
                      <div className="flex items-center gap-2 select-none">
                        <input
                          type="radio"
                          name="outputFilter"
                          checked={outputFilter === opt.value}
                          onChange={() => setOutputFilter(opt.value as any)}
                          className="accent-black mr-1"
                        />
                        <span className="text-xs font-black uppercase tracking-tight text-black">
                          {opt.label}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] mt-1.5 leading-tight font-serif ${outputFilter === opt.value ? "text-zinc-700 font-semibold italic" : "text-zinc-500"}`}
                      >
                        {opt.desc}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Bias audit inclusion */}
              <div className="border-2 border-black p-4 bg-zinc-100/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="block text-[10px] font-black uppercase tracking-wider text-black font-mono">
                    03.3 // Intellectual Audit
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompareModalTab("bias");
                      setShowCompareModal(true);
                    }}
                    className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-500 hover:text-black transition-all hover:underline cursor-pointer"
                  >
                    [ℹ Compare]
                  </button>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      label: "Omit Bias Check",
                      value: "exclude",
                      desc: "Purely organize structural ideas",
                    },
                    {
                      label: "Audit Traps",
                      value: "include",
                      desc: "Diagnostics for cognitive fallback biases",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex flex-col p-2.5 border-2 border-black cursor-pointer transition-all duration-100 ${
                        cognitiveBiasAudit === opt.value
                          ? "bg-[#CEEAD6] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black"
                          : "bg-white text-black hover:bg-zinc-50 border-black"
                      }`}
                    >
                      <div className="flex items-center gap-2 select-none">
                        <input
                          type="radio"
                          name="cognitiveBiasAudit"
                          checked={cognitiveBiasAudit === opt.value}
                          onChange={() => setCognitiveBiasAudit(opt.value as any)}
                          className="accent-black mr-1"
                        />
                        <span className="text-xs font-black uppercase tracking-tight text-black">
                          {opt.label}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] mt-1.5 leading-tight font-serif ${cognitiveBiasAudit === opt.value ? "text-zinc-700 font-semibold italic" : "text-zinc-500"}`}
                      >
                        {opt.desc}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Launch Buttons / Quiz Toggle */}
          <div className="pt-6 border-t-2 border-black space-y-4">
            {!showRecommendationQuiz ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  disabled={!isFormValid}
                  onClick={() => setShowRecommendationQuiz(true)}
                  className={`flex-1 flex justify-center items-center gap-2 px-5 py-3 border-2 border-black bg-white hover:bg-zinc-50 text-black font-display font-black text-xs uppercase tracking-wider transition-all duration-150 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] ${
                    !isFormValid ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  Guide Me (Recommend a Mode)
                </button>
                <button
                  disabled={!isFormValid}
                  onClick={() => handleLaunchWithMode("free_stream")}
                  className={`flex-1 flex justify-center items-center gap-2 px-5 py-3 border-2 border-black bg-black hover:bg-white text-white hover:text-black font-display font-black text-xs uppercase tracking-wider transition-all duration-150 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] ${
                    !isFormValid ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                  }`}
                >
                  Start Instantly (Free Stream)
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-zinc-100 border-2 border-black p-4 gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-xs uppercase text-black">
                        Warm-up Diagnostic Quiz
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareModalTab("quiz");
                          setShowCompareModal(true);
                        }}
                        className="text-[9px] font-mono font-bold uppercase text-zinc-550 hover:text-black hover:underline cursor-pointer"
                      >
                        [ℹ Compare Quiz]
                      </button>
                    </div>
                    <p className="text-[10px] uppercase font-mono text-zinc-500 mt-1">
                      Helps Gemini tune your structured templates.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRecommendationQuiz(false)}
                    className="text-xs font-bold uppercase tracking-wider text-black hover:underline font-display shrink-0 cursor-pointer"
                  >
                    Skip & choose manually
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Q1 */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-black mb-2 font-display">
                      “Do you feel clear or foggy about this topic?”
                    </span>
                    <div className="flex gap-2">
                      {[
                        { label: "Mainly Clear", val: "clear" },
                        { label: "Mainly Foggy", val: "foggy" },
                      ].map((o) => (
                        <button
                          key={o.val}
                          onClick={() => setClarity(o.val as any)}
                          className={`flex-1 py-2 text-xs border-2 border-black transition-all cursor-pointer ${
                            clarity === o.val
                              ? "bg-black text-white font-bold"
                              : "bg-white text-black hover:bg-zinc-50"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q2 */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-black mb-2 font-display">
                      “Is this core issue more emotional or analytical?”
                    </span>
                    <div className="flex gap-2">
                      {[
                        { label: "Analytical", val: "analytical" },
                        { label: "Emotional / Felt", val: "emotional" },
                      ].map((o) => (
                        <button
                          key={o.val}
                          onClick={() => setNature(o.val as any)}
                          className={`flex-1 py-2 text-xs border-2 border-black transition-all cursor-pointer ${
                            nature === o.val
                              ? "bg-black text-white font-bold"
                              : "bg-white text-black hover:bg-zinc-50"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q3 */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-black mb-2 font-display">
                      “How much time do you have right now?”
                    </span>
                    <div className="flex gap-2">
                      {[
                        { label: "< 5 Mins (Quick check)", val: "<5" },
                        { label: "> 20 Mins (Deep block)", val: ">20" },
                      ].map((o) => (
                        <button
                          key={o.val}
                          onClick={() => setTimeAvailable(o.val as any)}
                          className={`flex-1 py-2 text-xs border-2 border-black transition-all cursor-pointer ${
                            timeAvailable === o.val
                              ? "bg-black text-white font-bold"
                              : "bg-white text-black hover:bg-zinc-50"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Q4 */}
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-black mb-2 font-display">
                      “Are you trying to decide, process, or just capture?”
                    </span>
                    <div className="flex gap-2">
                      {[
                        { label: "Decide", val: "decide" },
                        { label: "Process", val: "process" },
                        { label: "Capture", val: "capture" },
                      ].map((o) => (
                        <button
                          key={o.val}
                          onClick={() => setIntentType(o.val as any)}
                          className={`flex-1 py-2 text-xs border-2 border-black transition-all cursor-pointer ${
                            intentType === o.val
                              ? "bg-black text-white font-bold"
                              : "bg-white text-black hover:bg-zinc-50"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t-2 border-black flex gap-3">
                  <button
                    onClick={() => setShowRecommendationQuiz(false)}
                    className="flex-1 py-2 border-2 border-black font-display font-bold text-xs uppercase tracking-wider text-black hover:bg-zinc-100 transition-all text-center cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    disabled={
                      !clarity || !nature || !timeAvailable || !intentType || loadingRecommendation
                    }
                    onClick={handleFetchRecommendation}
                    className={`flex-1 flex justify-center items-center gap-1 py-2 border-2 border-black bg-black text-white hover:bg-white hover:text-black font-display font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      !clarity || !nature || !timeAvailable || !intentType || loadingRecommendation
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {loadingRecommendation ? "Determining..." : "Get Recommend Mode"}
                  </button>
                </div>

                {/* Recommendation Result Presentation */}
                {recommendationResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-zinc-50 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-500 font-mono">
                          AI Recommended Mode
                        </span>
                        <h4 className="text-xs font-black text-black uppercase font-display tracking-wide mt-1">
                          {recommendationResult.recommendation.replaceAll("_", " ")}
                        </h4>
                      </div>
                      <span className="bg-black text-white text-[9px] px-2 py-0.5 font-mono uppercase font-semibold">
                        {recommendationResult.confidence}% Match
                      </span>
                    </div>
                    <p className="text-xs text-zinc-700 font-serif italic leading-relaxed">
                      "{recommendationResult.rationale}"
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <button
                        onClick={() => handleLaunchWithMode(recommendationResult.recommendation)}
                        className="flex-1 py-2.5 border-2 border-black bg-black text-white font-display font-bold text-xs uppercase tracking-wider cursor-pointer hover:bg-white hover:text-black transition-all text-center"
                      >
                        Accept & Launch Recommended
                      </button>

                      <div className="flex gap-2">
                        {recommendationResult.alternativeModes.slice(0, 2).map((alt) => (
                          <button
                            key={alt}
                            onClick={() => handleLaunchWithMode(alt)}
                            className="bg-white border-2 border-black text-black px-3.5 hover:bg-black hover:text-white text-[10px] font-display font-bold uppercase cursor-pointer transition-all"
                          >
                            Use {alt.replaceAll("_", " ")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Group engagements. Absent entirely in solo deployments, where whoami() fails. */}
        {onCreateEngagement && (
          <div className="bg-[#FFF3BF] border-3 border-black p-5 md:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-3 lg:col-span-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-base font-black text-black uppercase tracking-wider font-display flex items-center gap-2">
                <Users className="w-5 h-5 text-black" />
                Group Engagements
              </h2>
              {viewerName && (
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">
                  signed in as {viewerName}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-600 font-sans">
              One shared pile for a whole room. Every fragment is stamped with who contributed it,
              and the pile keeps growing after the workshop ends.
            </p>

            <div className="flex gap-2 flex-wrap">
              <input
                value={engagementTopic}
                onChange={(e) => setEngagementTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && engagementTopic.trim()) {
                    onCreateEngagement({ topic: engagementTopic.trim() });
                    setEngagementTopic("");
                  }
                }}
                placeholder="What is this engagement about?"
                className="flex-1 min-w-[220px] border-2 border-black bg-white px-3 py-2 text-xs font-sans focus:outline-none"
              />
              <button
                onClick={() => {
                  if (!engagementTopic.trim()) return;
                  onCreateEngagement({ topic: engagementTopic.trim() });
                  setEngagementTopic("");
                }}
                disabled={!engagementTopic.trim()}
                className="border-2 border-black bg-black text-white px-4 py-2 text-xs font-bold uppercase tracking-wider font-mono disabled:opacity-40 cursor-pointer"
              >
                Start
              </button>
            </div>

            {engagements.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {engagements.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onJoinEngagement?.(e.id)}
                    className="text-left bg-white border-2 border-black p-3 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-pointer"
                  >
                    <p className="text-xs font-bold text-black truncate">{e.topic}</p>
                    <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mt-1">
                      {e.thoughtCount} fragments · {e.memberCount}{" "}
                      {e.memberCount === 1 ? "contributor" : "contributors"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* History / Sessions Sidebar */}
        <div className="bg-white border-3 border-black p-5 md:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col h-full max-h-[600px] overflow-hidden">
          <h2 className="text-base font-black text-black uppercase tracking-wider font-display flex items-center gap-2 mb-3 shrink-0">
            <FolderOpen className="w-5 h-5 text-black" />
            Previous Sessions
          </h2>
          <p className="text-xs text-zinc-500 mb-4 shrink-0 font-sans">
            Open past Extractions to continue or view organized summaries.
          </p>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {pastSessions.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 border-2 border-dashed border-zinc-300 p-4">
                <Brain className="w-8 h-8 mx-auto stroke-1 opacity-50 mb-2" />
                <p className="text-[11px] font-mono uppercase tracking-wider">
                  No saved extractions yet.
                </p>
              </div>
            ) : (
              pastSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex justify-between items-center bg-white border-2 border-black p-3 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all duration-150 group"
                >
                  <button
                    onClick={() => onLoadSession(session.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <span className="block font-bold text-xs text-black truncate mb-0.5">
                      {session.topic}
                    </span>
                    <span className="block text-[10px] text-zinc-400 font-mono">
                      {session.thoughts.length} SURFACED THOUGHTS •{" "}
                      {new Date(session.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  {confirmingDeleteId === session.id ? (
                    <div className="flex items-center gap-1 ml-1 shrink-0">
                      <button
                        onClick={() => {
                          onDeleteSession(session.id);
                          setConfirmingDeleteId(null);
                        }}
                        className="text-[9px] font-mono font-black uppercase px-2 py-1 bg-black text-white border border-black cursor-pointer hover:bg-red-600 transition-all"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmingDeleteId(null)}
                        className="text-[9px] font-mono font-bold uppercase px-2 py-1 bg-white text-black border border-black cursor-pointer hover:bg-zinc-100 transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingDeleteId(session.id)}
                      className="text-zinc-300 hover:text-black ml-1 p-1 hover:bg-zinc-100 border border-transparent hover:border-black transition-all cursor-pointer shrink-0"
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <CompareSettingsModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        defaultTab={compareModalTab}
      />
    </div>
  );
}
